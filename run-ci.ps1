# Banh Mi Cho POS local CI for Windows PowerShell 5.1+.
# Never use this on the live cashier POS or against production services.
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('quick', 'full')]
    [string]$Suite = 'quick'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $PID
$reportDir = Join-Path $root ('artifacts\local-ci\' + $runId)
$testDataDir = Join-Path ([System.IO.Path]::GetTempPath()) ('bmc-local-ci-' + $runId)
$script:results = New-Object 'System.Collections.Generic.List[object]'
$script:stepNo = 0
$script:pgContainer = $null
$script:failed = $false
$script:failureMessage = ''
$script:nodeVersion = $null
$script:gitSha = $null
$script:gitBranch = $null
$script:gitDirty = $null
$startedAt = Get-Date
$script:reportPath = Join-Path $reportDir 'summary.json'

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required executable '$Name' was not found in PATH."
    }
}

function Invoke-CIStage([string]$Name, [string]$Command, [string]$WorkingDirectory = $root) {
    $script:stepNo++
    $safeName = $Name -replace '[^a-zA-Z0-9-]', '-'
    $stem = '{0:D2}-{1}' -f $script:stepNo, $safeName
    $logPath = Join-Path $reportDir ($stem + '.log')
    $stdoutPath = Join-Path $reportDir ($stem + '.stdout.log')
    $stderrPath = Join-Path $reportDir ($stem + '.stderr.log')
    $stageStarted = Get-Date
    $exitCode = -1
    $startError = ''
    Write-Host ''
    Write-Host ('=== [{0:D2}] {1} ===' -f $script:stepNo, $Name) -ForegroundColor Cyan
    Write-Host ('$ ' + $Command)

    # Each stage gets a separate disposable SQLite path. Test fixtures may
    # override this with their own temp path; no shop database is ever selected.
    $env:STORE_DB_PATH = Join-Path $testDataDir ($stem + '.sqlite')
    try {
        # Start-Process avoids Windows PowerShell 5.1 treating native stderr
        # output as a terminating NativeCommandError when EAP=Stop.
        # Only internally defined, fixed commands reach cmd.exe.
        $p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/s', '/c', ('"' + $Command + '"')) -WorkingDirectory $WorkingDirectory -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
        $exitCode = [int]$p.ExitCode
    } catch {
        $startError = $_.Exception.Message
    } finally {
        # Always keep both streams. Stage logs never include environment values,
        # connection credentials or bank/provider secrets from this runner.
        $sections = New-Object 'System.Collections.Generic.List[string]'
        [void]$sections.Add('=== STDOUT ===')
        if (Test-Path -LiteralPath $stdoutPath) {
            [void]$sections.Add((Get-Content -LiteralPath $stdoutPath -Raw -ErrorAction SilentlyContinue))
        }
        [void]$sections.Add('=== STDERR ===')
        if (Test-Path -LiteralPath $stderrPath) {
            [void]$sections.Add((Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue))
        }
        if ($startError) { [void]$sections.Add('PROCESS START ERROR: ' + $startError) }
        [System.IO.File]::WriteAllText($logPath, ($sections -join [Environment]::NewLine), [System.Text.Encoding]::UTF8)
        Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
        $outcome = if ($exitCode -eq 0) { 'PASS' } else { 'FAIL' }
        [void]$script:results.Add([pscustomobject]@{
            stage = $Name
            status = $outcome
            exitCode = $exitCode
            seconds = [math]::Round(((Get-Date) - $stageStarted).TotalSeconds, 2)
            command = $Command
            log = ('artifacts/local-ci/' + $runId + '/' + $stem + '.log')
        })
    }
    if ($exitCode -ne 0) {
        Write-Host ('FAIL ' + $Name + ' (exit ' + $exitCode + ')') -ForegroundColor Red
        if (Test-Path -LiteralPath $logPath) {
            Get-Content -LiteralPath $logPath -Tail 35 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
        }
        throw "Stage '$Name' failed (exit $exitCode). Review $logPath"
    }
    Write-Host ('PASS ' + $Name) -ForegroundColor Green
}

function Start-DisposablePostgres {
    Require-Command 'docker'
    & docker info 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running (Linux containers are required).' }
    & docker image inspect postgres:16 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'postgres:16 image is not cached. While online, run: docker pull postgres:16'
    }

    $script:pgContainer = ('bmc-local-ci-pg-' + ($runId -replace '[^a-zA-Z0-9-]', '-')).ToLowerInvariant()
    $dbPassword = 'ci_' + ([guid]::NewGuid().ToString('N'))
    & docker run -d --rm --name $script:pgContainer -e 'POSTGRES_USER=bmc_test' -e ('POSTGRES_PASSWORD=' + $dbPassword) -e 'POSTGRES_DB=bmc_test' -p '127.0.0.1::5432' postgres:16 1>$null
    if ($LASTEXITCODE -ne 0) { throw 'Could not start disposable PostgreSQL container.' }

    $portText = (& docker port $script:pgContainer 5432/tcp | Select-Object -First 1)
    $portMatch = [regex]::Match([string]$portText, ':(\d+)\s*$')
    if ($LASTEXITCODE -ne 0 -or -not $portMatch.Success) {
        throw ('Cannot determine disposable PostgreSQL port: ' + $portText)
    }
    $port = $portMatch.Groups[1].Value
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        & docker exec $script:pgContainer pg_isready -U bmc_test -d bmc_test 1>$null 2>$null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Disposable PostgreSQL did not become ready.' }
    $env:DATABASE_URL = "postgresql://bmc_test:$dbPassword@127.0.0.1:$port/bmc_test"
    Write-Host ('Disposable PostgreSQL ready on loopback port ' + $port) -ForegroundColor Green
}

function Invoke-OptionalBranchGate([string]$ScriptName, [string]$StageName) {
    $manifest = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
    if ($manifest.scripts.PSObject.Properties.Name -contains $ScriptName) {
        Invoke-CIStage $StageName ('npm run ' + $ScriptName)
    } else {
        Write-Host ('NOT APPLICABLE: ' + $StageName + ' (no ' + $ScriptName + ' script on this branch)')
    }
}

try {
    New-Item -ItemType Directory -Path $reportDir, $testDataDir -Force | Out-Null
    if (-not (Test-Path -LiteralPath (Join-Path $root 'apps\store-hub\package.json'))) {
        throw 'Run this script from the Banh Mi Cho POS repository root.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json'))) {
        throw 'Missing monorepo package.json.'
    }
    # Refuse any inherited authority over live money or production databases.
    foreach ($name in @('STORE_DB_PATH', 'DATABASE_URL', 'PRINTER_HOST', 'CLOUD_SYNC_URL', 'BANK_BRIDGE_SECRET')) {
        $value = [Environment]::GetEnvironmentVariable($name, 'Process')
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            throw ('Refusing to run with existing ' + $name + '. Use a fresh terminal without live shop configuration.')
        }
    }
    Require-Command 'node'
    Require-Command 'npm'
    Require-Command 'git'
    $script:nodeVersion = (& node -p 'process.versions.node').Trim()
    if ($LASTEXITCODE -ne 0 -or ([int]($script:nodeVersion.Split('.')[0])) -ne 24) {
        throw ('Local CI requires Node.js 24; found ' + $script:nodeVersion)
    }
    if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\.bin\tsc.cmd'))) {
        throw 'Workspace dependencies missing. Run npm install --no-audit --no-fund once while online.'
    }
    $script:gitSha = (& git -C $root rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve repository commit SHA.' }
    $script:gitBranch = (& git -C $root branch --show-current).Trim()
    $script:gitDirty = (@(& git -C $root status --porcelain --untracked-files=normal)).Count -gt 0

    # Explicitly override dotenv/config so a local .env cannot silently point
    # CI at cloud production, a thermal printer, or the store's live SQLite.
    $env:CI = '1'
    $env:NODE_ENV = 'test'
    $env:HUB_BIND_HOST = '127.0.0.1'
    $env:ALLOW_INSECURE_LAN_DEV = '0'
    $env:PAIRING_ENFORCED = '0'
    $env:PRINTER_HOST = ''
    $env:CLOUD_SYNC_URL = ''
    $env:BANK_BRIDGE_SECRET = ''
    $env:HUB_TLS_CERT_PATH = ''
    $env:HUB_TLS_KEY_PATH = ''
    $env:DOTENV_CONFIG_PATH = Join-Path $testDataDir 'no-dotenv-file.env'
    $env:DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/no-production-db'
    $env:EXPO_PUBLIC_HUB_URL = 'https://pos.example.invalid'
    $env:EXPO_OFFLINE = '1'

    Invoke-CIStage 'docs-check' 'npm run docs:check'
    Invoke-CIStage 'local-ci-contract' 'node --test tests/local-ci-contract.test.mjs'
    Invoke-CIStage 'typecheck' 'npm run check'
    Invoke-CIStage 'build' 'npm run build'
    Invoke-CIStage 'domain-tests' 'npm run test:domain'
    Invoke-CIStage 'hub-integration' 'npm run test:integration'
    Invoke-CIStage 'web-bundle-budget' 'npm run test:bundle'
    Invoke-CIStage 'windows-backup-restore' 'node --test tests/backup-freshness.test.mjs tests/restore.test.mjs tests/restore-process-rehearsal.test.mjs tests/windows-backup-job.test.mjs'
    $env:BMC_PERF_PROFILE = 'smoke'
    Invoke-CIStage 'hub-http-smoke' 'npm run test:perf:http'

    if ($Suite -eq 'full') {
        Start-DisposablePostgres
        try {
            Invoke-CIStage 'cloud-postgres-sepay' 'node --test --test-concurrency=1 tests/cloud.test.mjs tests/sepay.test.mjs tests/remote-product-commands.test.mjs tests/cloud-projection-order.test.mjs tests/owner-analytics-cloud.test.mjs'
        } finally {
            # Even a failed Cloud stage must not leave the Postgres test URL in
            # the environment for later stages or subprocesses.
            $env:DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/no-production-db'
        }
        Invoke-CIStage 'responsive-web-ui' 'npm run test:ui'
        Invoke-CIStage 'real-hub-e2e' 'npm run test:e2e'
        $env:BMC_PERF_PROFILE = 'burst'
        Invoke-CIStage 'hub-http-burst' 'npm run test:perf:http'

        # Optional feature-branch regression suites; no script means this
        # particular change is not on the checked-out branch, not a PASS.
        Invoke-OptionalBranchGate 'test:security:hub-network' 'hub-network-security'
        Invoke-OptionalBranchGate 'test:dev:hub' 'hub-dev-watcher'
        Invoke-OptionalBranchGate 'test:perf:history-index' 'history-index-100k'

        $expoOutput = Join-Path $reportDir 'expo-native-export'
        if (Test-Path -LiteralPath $expoOutput) { throw 'Expo output path already exists for this unique CI run.' }
        Invoke-CIStage 'expo-android-ios-js-export' ('npx --no-install expo export --platform all --output-dir "' + $expoOutput + '" --max-workers 2') (Join-Path $root 'apps\mobile-staff')
        if (-not (Test-Path -LiteralPath $expoOutput) -or
            @((Get-ChildItem -LiteralPath $expoOutput -File -Recurse -ErrorAction SilentlyContinue)).Count -eq 0) {
            throw 'Expo export is empty: no Android/iOS JS assets were generated.'
        }
    }
} catch {
    $script:failed = $true
    $script:failureMessage = $_.Exception.Message
    Write-Host ('LOCAL CI FAILED: ' + $script:failureMessage) -ForegroundColor Red
} finally {
    if ($script:pgContainer) {
        try { & docker rm -f $script:pgContainer 1>$null 2>$null } catch {}
        Write-Host 'Disposable PostgreSQL cleanup attempted.'
    }
    if (Test-Path -LiteralPath $reportDir) {
        $summary = [pscustomobject]@{
            suite = $Suite
            status = $(if ($script:failed) { 'FAIL' } else { 'PASS' })
            startedAt = $startedAt.ToString('o')
            completedAt = (Get-Date).ToString('o')
            elapsedSeconds = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 2)
            nodeVersion = $script:nodeVersion
            os = [Environment]::OSVersion.VersionString
            git = [pscustomobject]@{ sha = $script:gitSha; branch = $script:gitBranch; dirty = $script:gitDirty }
            failure = $script:failureMessage
            stages = @($script:results.ToArray())
        }
        $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $script:reportPath -Encoding UTF8
        Write-Host ('Report: ' + $script:reportPath)
    }
    if (Test-Path -LiteralPath $testDataDir) {
        Remove-Item -LiteralPath $testDataDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
if ($script:failed) { exit 1 }
Write-Host ('LOCAL CI ' + $Suite.ToUpperInvariant() + ': PASS') -ForegroundColor Green
exit 0
