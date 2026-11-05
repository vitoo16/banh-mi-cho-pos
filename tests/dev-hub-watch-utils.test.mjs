import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendTscWatchOutput,isSuccessfulTscWatchOutput} from '../apps/store-hub/scripts/dev-hub-watch-utils.mjs';

test('DEV-WATCH-UTIL-01: only a zero-error TypeScript watch result is bootable',()=>{
 assert.equal(isSuccessfulTscWatchOutput('Found 0 errors. Watching for file changes.'),true);
 assert.equal(isSuccessfulTscWatchOutput('[12:00:00] Found 0 errors. Watching for file changes.'),true);
 assert.equal(isSuccessfulTscWatchOutput('Found 1 error. Watching for file changes.'),false);
 assert.equal(isSuccessfulTscWatchOutput('Found 2 errors. Watching for file changes.'),false);
 assert.equal(isSuccessfulTscWatchOutput('Starting compilation in watch mode...'),false);
});

test('DEV-WATCH-UTIL-02: rolling output retains split success lines and is bounded',()=>{
 const first=appendTscWatchOutput('','Found 0 errors. Watching for ');
 assert.equal(isSuccessfulTscWatchOutput(first),false);
 const second=appendTscWatchOutput(first,'file changes.');
 assert.equal(isSuccessfulTscWatchOutput(second),true);
 assert.equal(appendTscWatchOutput('123456','7890',5),'67890');
});
