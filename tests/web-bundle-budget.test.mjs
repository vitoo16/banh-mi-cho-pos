import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {bundleBytes,assertBundleBudget} from '../scripts/check-web-bundles.mjs';

test('bundle budget sums multiple JS/CSS chunks, excludes sourcemaps',async()=>{
 const root=await mkdtemp(join(tmpdir(),'bmc-bundle-'));
 try{
  const dir=join(root,'assets');await mkdir(dir);
  await writeFile(join(dir,'index.js'),'console.log("test");'.repeat(100));
  await writeFile(join(dir,'lazy.js'),'const x = 123;'.repeat(150));
  await writeFile(join(dir,'style.css'),'body{margin:0}'.repeat(100));
  await writeFile(join(dir,'regular.ttf'),Buffer.alloc(25000,57));
  await writeFile(join(dir,'style.css.map'),'x'.repeat(1000000));
  const result=await bundleBytes(root);
  assert.ok(result.javascript>0);
  assert.ok(result.stylesheets>0);
  assert.ok(result.fonts>0);
  assert.equal(result.fontFiles,1);
  assert.deepEqual(assertBundleBudget(result,{
   jsGzipLimit:result.javascript,cssGzipLimit:result.stylesheets,fontGzipLimit:result.fonts
  }),[]);
  assert.equal(assertBundleBudget(result,{
   jsGzipLimit:result.javascript-1,cssGzipLimit:result.stylesheets-1,fontGzipLimit:result.fonts-1
  }).length,3);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('missing JS output is an error, not a misleading green build',async()=>{
 const root=await mkdtemp(join(tmpdir(),'bmc-empty-bundle-'));
 try{await assert.rejects(()=>bundleBytes(root),/no JS assets/)}
 finally{await rm(root,{recursive:true,force:true})}
});
