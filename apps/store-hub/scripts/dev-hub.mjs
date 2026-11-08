import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {appendTscWatchOutput,getTscWatchStatus} from './dev-hub-watch-utils.mjs';

const root=resolve(import.meta.dirname,'..');
const workspaceRoot=resolve(root,'../..');
const tsc=resolve(workspaceRoot,'node_modules/typescript/bin/tsc');
const entry=resolve(root,'dist/main.js');
if(!existsSync(tsc))throw new Error('TypeScript compiler not found at '+tsc+'. Run npm install from the monorepo root.');

let compiler;
let runtime;
let stopping=false;
let runtimeWanted=false;
let compilerOutput='';

function isRunning(child){
 return Boolean(child&&child.exitCode===null&&child.signalCode===null);
}
function stopRuntimeForCompileError(){
 runtimeWanted=false;
 const active=runtime;
 if(isRunning(active)){
  active.expectedStop=true;
  active.kill('SIGTERM');
 }
}
function stop(signal='SIGTERM'){
 if(stopping)return;
 stopping=true;
 runtimeWanted=false;
 const active=runtime;
 if(isRunning(active)){
  active.expectedStop=true;
  active.kill(signal);
 }
 if(isRunning(compiler))compiler.kill(signal);
}
function startRuntime(){
 if(stopping)return;
 runtimeWanted=true;
 if(isRunning(runtime))return;
 const child=spawn(process.execPath,['--watch',entry],{
  cwd:root,stdio:'inherit',windowsHide:true
 });
 runtime=child;
 child.once('error',error=>{console.error(error);stop();process.exitCode=1;});
 child.once('exit',(code,signal)=>{
  if(runtime===child)runtime=undefined;
  if(stopping)return;
  // A compile error intentionally stops the old server. If a clean compile
  // arrived before this exit event, bring the server back on the fresh output.
  if(child.expectedStop){
   if(runtimeWanted)startRuntime();
   return;
  }
  if(signal){console.error('Hub runtime stopped:',signal);stop();process.exitCode=1;}
  else if(code!==0){console.error('Hub runtime exited:',code);stop();process.exitCode=code||1;}
 });
}
process.once('SIGINT',()=>stop('SIGINT'));
process.once('SIGTERM',()=>stop('SIGTERM'));

compiler=spawn(process.execPath,[tsc,'-p','tsconfig.json','--watch','--preserveWatchOutput','--noEmitOnError'],{
 cwd:root,stdio:['ignore','pipe','inherit'],windowsHide:true
});
compiler.stdout.on('data',chunk=>{
 const output=String(chunk);
 process.stdout.write(output);
 // Keep a rolling buffer: stream chunks may split the compiler status line.
 compilerOutput=appendTscWatchOutput(compilerOutput,output);
 const status=getTscWatchStatus(compilerOutput);
 if(status==='error'){
  // Do not leave the last known-good server running while source is broken.
  stopRuntimeForCompileError();
 }else if(status==='success'){
  startRuntime();
 }
});
compiler.once('error',error=>{console.error(error);stop();process.exitCode=1;});
compiler.once('exit',(code,signal)=>{
 if(!stopping){console.error('TypeScript watch stopped unexpectedly',code,signal);stop();process.exitCode=code||1;}
});
