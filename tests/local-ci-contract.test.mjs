import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ps1=read('run-ci.ps1');
const cmd=read('run-ci.cmd');
const pkg=JSON.parse(read('package.json'));

const requiredScripts=['docs:check','check','build','test:domain','test:integration','test:bundle','test:perf:http','test:ui','test:e2e'];

test('LOCAL-CI-01: Windows launcher forwards suite and PowerShell exit code',()=>{
 assert.match(cmd,/powershell\.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-ci\.ps1" -Suite "%BMC_SUITE%"/);
 assert.match(cmd,/exit \/b %ERRORLEVEL%/);
 assert.match(ps1,/ValidateSet\('quick', 'full'\)/);
 assert.match(ps1,/if \(\$script:failed\) \{ exit 1 \}/);
 assert.match(ps1,/exit 0\s*$/);
});

test('LOCAL-CI-02: quick and full preserve existing monorepo gates',()=>{
 for(const key of requiredScripts)assert.equal(typeof pkg.scripts[key],'string','root package script removed: '+key);
 for(const key of ['docs:check','check','build','test:domain','test:integration','test:bundle','test:perf:http','test:ui','test:e2e']){
  assert.ok(ps1.includes("'npm run "+key+"'"),
   'Local CI missing npm stage '+key);
 }
 for(const name of [
  'tests/backup-freshness.test.mjs','tests/restore.test.mjs',
  'tests/restore-process-rehearsal.test.mjs','tests/windows-backup-job.test.mjs',
  'tests/cloud.test.mjs','tests/sepay.test.mjs','tests/remote-product-commands.test.mjs',
  'tests/cloud-projection-order.test.mjs','tests/owner-analytics-cloud.test.mjs',
 ])assert.ok(ps1.includes(name),'Missing safety suite '+name);
 assert.match(ps1,/BMC_PERF_PROFILE = 'smoke'/);
 assert.match(ps1,/BMC_PERF_PROFILE = 'burst'/);
 assert.match(ps1,/--test-concurrency=1/);
 assert.match(ps1,/expo export --platform all/);
 assert.match(ps1,/Invoke-OptionalBranchGate 'test:security:hub-network'/);
 assert.match(ps1,/Invoke-OptionalBranchGate 'test:dev:hub'/);
 assert.match(ps1,/Invoke-OptionalBranchGate 'test:perf:history-index'/);
});

test('LOCAL-CI-03: no network installer in the local runner',()=>{
 assert.doesNotMatch(ps1,/Invoke-CIStage[^\n]*(?:npm install|docker pull|playwright install)/);
 assert.match(ps1,/Test-Path -LiteralPath \(Join-Path \$root 'node_modules\\\.bin\\tsc\.cmd'\)/);
 assert.match(ps1,/EXPO_OFFLINE = '1'/);
 assert.match(ps1,/\$script:nodeVersion\.Split\('\.'\)\[0\]/);
});

test('LOCAL-CI-04: refuses live endpoints and forces disposable loopback services',()=>{
 for(const key of ['STORE_DB_PATH','DATABASE_URL','PRINTER_HOST','CLOUD_SYNC_URL','BANK_BRIDGE_SECRET']){
  assert.ok(ps1.includes("'"+key+"'"),'missing production env guard '+key);
 }
 assert.match(ps1,/HUB_BIND_HOST = '127\.0\.0\.1'/);
 assert.match(ps1,/DOTENV_CONFIG_PATH = Join-Path \$testDataDir/);
 assert.match(ps1,/docker run -d --rm/);
 assert.match(ps1,/-p '127\.0\.0\.1::5432'/);
 assert.match(ps1,/docker rm -f \$script:pgContainer/);
 assert.match(ps1,/\$env:STORE_DB_PATH = Join-Path \$testDataDir/);
});

test('LOCAL-CI-05: writes SHA-labelled evidence and excludes generated artifacts from Git',()=>{
 assert.match(ps1,/git -C \$root rev-parse HEAD/);
 assert.match(ps1,/git -C \$root status --porcelain/);
 assert.match(ps1,/artifacts\\local-ci/);
 assert.match(ps1,/summary\.json/);
 assert.match(ps1,/exitCode = \$exitCode/);
 assert.match(read('.gitignore'),/artifacts\/local-ci\//);
 const doc=read('docs/qa/LOCAL_CI.md');
 assert.match(doc,/not a GitHub required status check/i);
 assert.match(doc,/not yet executed on the owner's Windows machine/i);
 const hook=read('scripts/local-ci/pre-push.example');
 assert.match(hook,/git rev-parse --show-toplevel/);
 assert.match(hook,/powershell\.exe .*\.\/run-ci\.ps1 -Suite quick/);
});
