import {Profiler,type ReactNode} from 'react';

type Commit={id:string;phase:string};
type TestWindow=Window&{__BMC_POS_RENDER_COMMITS__?:Commit[]};
/** Browser regression visibility only; production builds render children directly.
 * Never capture order contents, amounts, session information or PINs.
 */
function captureCommit(id:string,phase:string){
 if(!import.meta.env.DEV)return;
 const sink=(window as TestWindow).__BMC_POS_RENDER_COMMITS__;
 if(Array.isArray(sink))sink.push({id,phase});
}
export function DevProfiler({id,children}:{id:string;children:ReactNode}){
 if(!import.meta.env.DEV)return <>{children}</>;
 return <Profiler id={id} onRender={captureCommit}>{children}</Profiler>;
}
