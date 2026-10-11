import {Profiler,type ReactNode} from 'react';

type OwnerCommit={id:string;phase:string};
type DevWindow=Window&{__BMC_OWNER_RENDER_COMMITS__?:OwnerCommit[]};

/**
 * Test-only React Profiler measurement of actual committed subtrees.
 * The production build renders children directly and records nothing.
 * No user data, values, tokens, PINs, or request bodies are captured.
 */
function captureCommit(id:string,phase:string){
 if(!import.meta.env.DEV)return;
 const sink=(window as DevWindow).__BMC_OWNER_RENDER_COMMITS__;
 if(Array.isArray(sink))sink.push({id,phase});
}
export function DevProfiler({id,children}:{id:string;children:ReactNode}){
 if(!import.meta.env.DEV)return <>{children}</>;
 return <Profiler id={id} onRender={captureCommit}>{children}</Profiler>;
}
