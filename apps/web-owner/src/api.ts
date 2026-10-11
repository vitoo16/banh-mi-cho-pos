import {HubClient} from '@bmc/contracts';
import {QueryClient} from '@tanstack/react-query';
export const remote=Boolean(import.meta.env.VITE_CLOUD_API_URL);
export const hub=new HubClient(import.meta.env.VITE_CLOUD_API_URL||'',()=>sessionStorage.getItem('bmc_owner_token')||undefined);
export const newKey=()=>crypto.randomUUID();
export const queryClient=new QueryClient({defaultOptions:{queries:{
 staleTime:4_000,refetchOnWindowFocus:true,retry:1,
}}});
