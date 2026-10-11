import {readFile,readdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
export const budgets=[
 {app:'Cashier POS',directory:'apps/web-pos/dist',jsGzipLimit:100*1024,cssGzipLimit:10*1024},
 {app:'Owner Web',directory:'apps/web-owner/dist',jsGzipLimit:112*1024,cssGzipLimit:10*1024},
];

/** Count all JS/CSS assets, including future split chunks (not just index.js).
 * No HTTP transport, source maps, fonts or production hardware performance claimed.
 */
export async function bundleBytes(directory){
 let javascript=0,stylesheets=0,jsFiles=0;
 async function visit(path){
  for(const entry of await readdir(path,{withFileTypes:true})){
   const name=join(path,entry.name);
   if(entry.isDirectory()){await visit(name);continue}
   if(!entry.isFile()||entry.name.endsWith('.map'))continue;
   if(!/\.(?:js|css)$/.test(entry.name))continue;
   const gzipBytes=gzipSync(await readFile(name),{level:9}).length;
   if(entry.name.endsWith('.js')){javascript+=gzipBytes;jsFiles++}
   else stylesheets+=gzipBytes;
  }
 }
 await visit(directory);
 if(jsFiles===0)throw new Error('Vite output has no JS assets: '+directory);
 return {javascript,stylesheets};
}
export function assertBundleBudget(measured,budget){
 const errors=[];
 if(measured.javascript>budget.jsGzipLimit)
  errors.push('JS '+measured.javascript+' exceeds '+budget.jsGzipLimit+' bytes gzip');
 if(measured.stylesheets>budget.cssGzipLimit)
  errors.push('CSS '+measured.stylesheets+' exceeds '+budget.cssGzipLimit+' bytes gzip');
 return errors;
}

async function main(){
 let failed=false;
 for(const budget of budgets){
  try{
   const measured=await bundleBytes(resolve(root,budget.directory));
   const failures=assertBundleBudget(measured,budget);
   const kb=value=>(value/1024).toFixed(1)+' KiB';
   console.log(budget.app+': JS '+kb(measured.javascript)+' / '+kb(budget.jsGzipLimit)+
    '; CSS '+kb(measured.stylesheets)+' / '+kb(budget.cssGzipLimit)+
    (failures.length?' — FAIL':' — PASS'));
   for(const problem of failures)console.error('  '+problem);
   if(failures.length)failed=true;
  }catch(error){failed=true;console.error(budget.app+': '+error.message)}
 }
 if(failed)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
