import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {appendTscWatchOutput,isSuccessfulTscWatchOutput} from './dev-hub-watch-utils.mjs';

const root=resolve(import.meta.dirname,'..');
const workspaceRoot=resolve(root,'../..');
const tsc=resolve(workspaceRoot,'node_modules/typescript/bin/tsc');
const entry=resolve(root,'dist/main.js');
if(!existsSync(tsc))throw new Error('TypeScript compiler not found at '+tsc+'. Run npm install from the monorepo root.');

let compiler;
let runtime;
let stopping=false;
let compiled=false;
let compilerOutput='';

function stop(signal='SIGTERM'){
 if(stopping)return;
 stopping=true;
 if(runtime&&!runtime.killed)runtime.kill(signal);
 if(compiler&&!compiler.killed)compiler.kill(signal);
}
function startRuntime(){
 if(compiled||stopping)return;
 compiled=true;
 runtime=spawn(process.execPath,['--watch',entry],{
  cwd:root,stdio:'inherit',windowsHide:true
 });
 runtime.once('error',error=>{console.error(error);stop();process.exitCode=1;});
 runtime.once('exit',(code,signal)=>{
  if(!stopping&&signal){console.error('Hub runtime stopped:',signal);stop();process.exitCode=1;}
  else if(!stopping&&code!==0){console.error('Hub runtime exited:',code);stop();process.exitCode=code||1;}
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
 // Keep a rolling buffer: stream chunks may split the success line.
 compilerOutput=appendTscWatchOutput(compilerOutput,output);
 // Never boot stale dist output when the current source has TypeScript errors.
 if(isSuccessfulTscWatchOutput(compilerOutput))startRuntime();
});
compiler.once('error',error=>{console.error(error);stop();process.exitCode=1;});
compiler.once('exit',(code,signal)=>{
 if(!stopping){console.error('TypeScript watch stopped unexpectedly',code,signal);stop();process.exitCode=code||1;}
});
