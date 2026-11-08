/** Return the latest complete TypeScript watch compilation status. */
export function getTscWatchStatus(output){
 const matches=[...String(output).matchAll(/Found (\d+) errors?\. Watching for file changes\./g)];
 if(matches.length===0)return null;
 return Number(matches[matches.length-1][1])===0?'success':'error';
}

/** True only when the latest TypeScript watch result is a clean compilation. */
export function isSuccessfulTscWatchOutput(output){
 return getTscWatchStatus(output)==='success';
}

/** True when the latest TypeScript watch result contains compiler errors. */
export function isFailedTscWatchOutput(output){
 return getTscWatchStatus(output)==='error';
}

/** Keep only the most recent compiler output so split writes can be matched. */
export function appendTscWatchOutput(previous,chunk,maxLength=8192){
 return (String(previous)+String(chunk)).slice(-maxLength);
}
