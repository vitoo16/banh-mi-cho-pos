import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const repo=resolve(import.meta.dirname,'..');
const weights=['Regular','Medium','SemiBold','Bold'];
test('Be Vietnam Pro fonts are vendored, nonempty and offline-ready on both platforms',()=>{
 for(const weight of weights){
  const paths=[
   'packages/ui/assets/fonts/BeVietnamPro-'+weight+'.ttf',
   'apps/mobile-staff/assets/fonts/BeVietnamPro-'+weight+'.ttf',
  ];
  const buffers=paths.map(path=>{
   const file=resolve(repo,path);
   assert.ok(existsSync(file),'missing '+path);
   const bytes=readFileSync(file);
   assert.ok(bytes.length>10000,'truncated font '+path);
   assert.equal(bytes.readUInt32BE(0),0x00010000,'invalid TrueType header in '+path);
   return bytes;
  });
  assert.deepEqual(buffers[0],buffers[1],weight+' font versions differ between Web and Native');
 }
 assert.ok(existsSync(resolve(repo,'packages/ui/assets/fonts/OFL.txt')));
});
test('Web and Native load local assets without CDN requests',()=>{
 const css=readFileSync(resolve(repo,'packages/ui/src/web-tokens.css'),'utf8');
 const native=readFileSync(resolve(repo,'apps/mobile-staff/src/ui/BeVietnamText.tsx'),'utf8');
 const app=readFileSync(resolve(repo,'apps/mobile-staff/App.tsx'),'utf8');
 for(const weight of weights){
  assert.ok(css.includes("url('../assets/fonts/BeVietnamPro-"+weight+".ttf')"));
  assert.ok(native.includes("require('../../assets/fonts/BeVietnamPro-"+weight+".ttf')"));
 }
 assert.match(css,/font-display:swap/);
 assert.doesNotMatch(css,/fonts\.googleapis|fonts\.gstatic/);
 assert.match(app,/<BmcFontsProvider>/);
 assert.match(app,/BmcText as Text,BmcTextInput as TextInput/);
});
