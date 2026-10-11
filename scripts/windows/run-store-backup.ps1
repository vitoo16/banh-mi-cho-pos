#Requires -Version 7.0
<#
.SYNOPSIS
 One-shot Bánh Mì Chợ SQLite backup + full manifest verification.
 IMPORTANT: opt-in operator helper, NOT an installed scheduled task.
 The destination's encryption, ACL, off-host protection and retention are
 prerequisites validated by the store operator, not proved by this script.
#>
[CmdletBinding()]
param(
 [Parameter(Mandatory = $true)][string]$StoreDbPath,
 [Parameter(Mandatory = $true)][string]$BackupDirectory,
 [ValidateRange(1,10080)][int]$MaxAgeMinutes = 15,
 [switch]$AcknowledgedEncryptedDestination
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $AcknowledgedEncryptedDestination) {
 throw 'Operator must verify approved encrypted/protected backup storage, then provide -AcknowledgedEncryptedDestination. This flag is NOT encryption detection.'
}
if (-not (Test-Path -LiteralPath $StoreDbPath -PathType Leaf)) {
 throw 'Store SQLite database file does not exist'
}
if (-not (Test-Path -LiteralPath $BackupDirectory -PathType Container)) {
 throw 'Backup directory must already exist and have approved encryption/access controls'
}
$source = (Resolve-Path -LiteralPath $StoreDbPath).Path
$destination = (Resolve-Path -LiteralPath $BackupDirectory).Path
if ([string]::Equals((Split-Path -Parent $source),$destination,[StringComparison]::OrdinalIgnoreCase)) {
 throw 'Do not put backups beside the live SQLite ledger'
}
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$backupScript = Join-Path $repoRoot 'scripts\store-backup.mjs'
$freshnessScript = Join-Path $repoRoot 'scripts\check-backup-freshness.mjs'
if (-not (Test-Path -LiteralPath $backupScript -PathType Leaf) -or
    -not (Test-Path -LiteralPath $freshnessScript -PathType Leaf)) {
 throw 'Required backup utilities are missing'
}
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
$fileName = 'bmc-' + $timestamp + '-' + [Guid]::NewGuid().ToString('N') + '.sqlite'
$target = Join-Path $destination $fileName
$previous = [Environment]::GetEnvironmentVariable('STORE_DB_PATH','Process')
try {
 [Environment]::SetEnvironmentVariable('STORE_DB_PATH',$source,'Process')
 & node $backupScript backup $target
 if ($LASTEXITCODE -ne 0) { throw 'SQLite backup / manifest verification failed' }
 & node $freshnessScript $destination $MaxAgeMinutes
 if ($LASTEXITCODE -ne 0) { throw 'Backup inventory is stale, incomplete or corrupt; manual intervention required' }
 Write-Output 'Backup job completed. Full backup inventory verified; ensure encrypted off-host copy and external alerting remain active.'
} finally {
 [Environment]::SetEnvironmentVariable('STORE_DB_PATH',$previous,'Process')
}
