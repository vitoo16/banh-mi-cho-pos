import {useQuery} from '@tanstack/react-query';
import {hub,remote} from '../../api';

/**
 * Owner/session data is kept in TanStack Query instead of App-level state.
 * clearOwnerQuerySession() drops all of these records on logout.
 * Polling only runs while the Catalog page is mounted and tab visible.
 */
export const catalogKey=(ownerId:string)=>['owner',remote?'cloud':'local',ownerId,'catalog'] as const;
export const commandKey=(ownerId:string)=>['owner',remote?'cloud':'local',ownerId,'remote-commands'] as const;

export function useCatalogQueries(ownerId:string){
 const catalog=useQuery({
  queryKey:catalogKey(ownerId),
  queryFn:()=>hub.products(),
  staleTime:5_000,
  refetchInterval:10_000,
 });
 const commands=useQuery({
  queryKey:commandKey(ownerId),
  queryFn:()=>hub.remoteProductCommands(),
  enabled:remote,
  staleTime:5_000,
  refetchInterval:query=>query.state.data?.some(cmd=>cmd.status==='PENDING')?10_000:30_000,
 });
 return {catalog,commands};
}
