import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

function pullRequestPaths(workflow) {
  // Validate a deliberately narrow repository-owned YAML shape rather than
  // pretending to parse arbitrary GitHub Actions YAML.
  const section = workflow.match(/(?:^|\n)  pull_request:\s*\n    paths:\s*\n([\s\S]*?)(?=\n  (?:push|schedule|workflow_dispatch):|\npermissions:|\njobs:)/);
  assert.ok(section, 'Cloud CI must have a recognizable PR path-filter block');
  const paths = section[1].split('\n').map(line => line.match(/^\s+- ['"]([^'"]+)['"]\s*$/)?.[1]).filter(Boolean);
  assert.ok(paths.length > 0, 'Cloud CI path filter cannot be empty');
  return new Set(paths);
}

test('Cloud CI PR paths cover every directly executed Node test', () => {
  const workflow = read('.github/workflows/cloud-ci.yml');
  const paths = pullRequestPaths(workflow);
  const command = workflow.match(/^\s+- run: node --test[^\n]*/m)?.[0];
  assert.ok(command, 'Cloud CI must retain the explicit node --test command');
  const executed = [...command.matchAll(/tests\/[A-Za-z0-9_./-]+\.test\.mjs/g)].map(match => match[0]);
  assert.ok(executed.length > 0, 'Cloud CI must execute a nonempty test suite');
  for (const path of executed) {
    assert.ok(paths.has(path) || paths.has('tests/**'), 'Cloud CI PR trigger misses ' + path);
  }
});

test('Cloud CI PR paths cover shared contracts and dependency manifests', () => {
  const paths = pullRequestPaths(read('.github/workflows/cloud-ci.yml'));
  for (const critical of ['packages/contracts/**', 'package.json', 'apps/cloud-api/**']) {
    assert.ok(paths.has(critical), 'Cloud CI PR trigger misses ' + critical);
  }
});

test('Cloud CI and the docs gate retain mandatory PR coverage', () => {
  const cloud = read('.github/workflows/cloud-ci.yml');
  const docs = read('.github/workflows/docs-ci.yml');
  assert.match(cloud, /(?:^|\n)  pull_request:/);
  assert.match(docs, /(?:^|\n)  pull_request:/);
  assert.match(docs, /node --test tests\/ci-workflow-triggers\.test\.mjs/);
});

const SAFETY_WORKFLOWS = [
  'app-ci.yml',
  'backup-restore-windows.yml',
  'cloud-ci.yml',
  'docs-ci.yml',
  'e2e-ci.yml',
  'hub-perf.yml',
  'mobile-bundle-ci.yml',
  'ui-ci.yml',
];

test('every main/dispatch run gets a unique concurrency group; only same-PR revisions cancel', () => {
  // GitHub permits only one pending run per concurrency group by default.
  // cancel-in-progress:false does NOT prevent a newer pending main run
  // from replacing an older pending main run.
  const expectedGroup =
    "${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.event.pull_request.number || github.run_id }}";
  const expectedCancel = "${{ github.event_name == 'pull_request' }}";
  for (const file of SAFETY_WORKFLOWS) {
    const workflow = read('.github/workflows/' + file);
    const group = workflow.match(/^  group: (.+)$/m)?.[1];
    const cancel = workflow.match(/^  cancel-in-progress: (.+)$/m)?.[1];
    assert.equal(group, expectedGroup, file + ': push/dispatch runs must use unique github.run_id');
    assert.equal(cancel, expectedCancel, file + ': cancel only superseded PR runs');
    assert.match(workflow, /(?:^|\n)  push:/, file + ': keep push verification enabled');
  }
});

test('App CI rechecks bundle budgets when its checker source changes', () => {
  const packageJson = JSON.parse(read('package.json'));
  const bundleCommand = packageJson.scripts['test:bundle'];
  assert.match(bundleCommand, /node scripts\/check-web-bundles\.mjs/, 'bundle script must invoke its checker');
  const workflow = read('.github/workflows/app-ci.yml');
  assert.match(workflow, /^\s+- run: npm run test:bundle$/m, 'App CI must run the bundle gate');
  const prPathsLine = workflow.match(/(?:^|\n)  pull_request:\s*\n    paths: \[([^\n]+)\]/)?.[1];
  assert.ok(prPathsLine, 'App CI must retain a recognizable PR path filter');
  const paths = new Set([...prPathsLine.matchAll(/'([^']+)'/g)].map(match => match[1]));
  assert.ok(paths.has('scripts/check-web-bundles.mjs') || paths.has('scripts/**'),
    'App CI must trigger when the checker used by test:bundle changes');
});
