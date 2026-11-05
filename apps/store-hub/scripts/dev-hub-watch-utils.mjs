/** True only when TypeScript watch reports a clean compilation. */
export function isSuccessfulTscWatchOutput(output){
 return /Found 0 errors?\. Watching for file changes\./.test(String(output));
}

/** Keep only the most recent compiler output so split writes can be matched. */
export function appendTscWatchOutput(previous,chunk,maxLength=8192){
 return (String(previous)+String(chunk)).slice(-maxLength);
}
