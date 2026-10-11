import {QueryClient} from '@tanstack/react-query';

/** Scoped to the currently authenticated Owner session; never persisted. */
export const queryClient=new QueryClient({
 defaultOptions:{queries:{staleTime:4_000,refetchOnWindowFocus:true,retry:1}},
});
/** Invalidate in-flight requests before discarding protected, per-session data. */
export function clearOwnerQuerySession(){
 void queryClient.cancelQueries();
 queryClient.clear();
}
