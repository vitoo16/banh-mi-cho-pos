import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const domain=readFileSync(new URL('../apps/store-hub/src/domain.ts',import.meta.url),'utf8');
test('domain contract documents exact-money protections',()=>{assert.match(domain,/Number.isSafeInteger/);assert.match(domain,/INSUFFICIENT_CASH/);assert.match(domain,/tendered-due/);});
