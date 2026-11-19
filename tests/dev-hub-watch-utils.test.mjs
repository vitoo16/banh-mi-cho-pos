import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendTscWatchOutput,getTscWatchStatus,isFailedTscWatchOutput,isSuccessfulTscWatchOutput} from '../apps/store-hub/scripts/dev-hub-watch-utils.mjs';

test('DEV-WATCH-UTIL-01: only the latest zero-error TypeScript watch result is bootable',()=>{
 assert.equal(getTscWatchStatus('Found 0 errors. Watching for file changes.'),'success');
 assert.equal(getTscWatchStatus('[12:00:00] Found 0 errors. Watching for file changes.'),'success');
 assert.equal(getTscWatchStatus('Found 1 error. Watching for file changes.'),'error');
 assert.equal(getTscWatchStatus('Found 2 errors. Watching for file changes.'),'error');
 assert.equal(getTscWatchStatus('Starting compilation in watch mode...'),null);
 assert.equal(isSuccessfulTscWatchOutput('Found 0 errors. Watching for file changes.'),true);
 assert.equal(isFailedTscWatchOutput('Found 1 error. Watching for file changes.'),true);
});

test('DEV-WATCH-UTIL-02: a later compiler error overrides an earlier successful result',()=>{
 const successThenError=[
  'Found 0 errors. Watching for file changes.',
  'File change detected. Starting incremental compilation...',
  'Found 1 error. Watching for file changes.',
 ].join('\n');
 assert.equal(getTscWatchStatus(successThenError),'error');
 assert.equal(isSuccessfulTscWatchOutput(successThenError),false);
 assert.equal(isFailedTscWatchOutput(successThenError),true);

 const errorThenSuccess=[
  'Found 1 error. Watching for file changes.',
  'File change detected. Starting incremental compilation...',
  'Found 0 errors. Watching for file changes.',
 ].join('\n');
 assert.equal(getTscWatchStatus(errorThenSuccess),'success');
 assert.equal(isSuccessfulTscWatchOutput(errorThenSuccess),true);
 assert.equal(isFailedTscWatchOutput(errorThenSuccess),false);
});

test('DEV-WATCH-UTIL-03: rolling output retains split status lines and is bounded',()=>{
 const first=appendTscWatchOutput('','Found 0 errors. Watching for ');
 assert.equal(getTscWatchStatus(first),null);
 const second=appendTscWatchOutput(first,'file changes.');
 assert.equal(getTscWatchStatus(second),'success');
 assert.equal(appendTscWatchOutput('123456','7890',5),'67890');
});
