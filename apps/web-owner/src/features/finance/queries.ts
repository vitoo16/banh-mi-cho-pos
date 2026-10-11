import {useQuery} from '@tanstack/react-query';
import {hub,remote} from '../../api';
import type {BankExceptionRow} from './FinancePage';

/**
 * The Owner dashboard already owns this exact ['owner','summary'] cache key.
 * All Finance summary selectors reuse the SAME query to avoid duplicate Hub reads.
 * Queries are cleared on Owner logout; no settlement or bank mutation occurs here.
 */
export const summaryKey=['owner','summary'] as const;
export const summaryOptions=()=>({
 queryKey:summaryKey,
 queryFn:()=>hub.summary(),
 staleTime:4_000,
 refetchInterval:10_000,
});
export const bankExceptionsKey=(ownerId:string)=>['owner',remote?'cloud':'local',ownerId,'bank-exceptions'] as const;
export function useBankExceptions(ownerId:string){
 return useQuery<BankExceptionRow[]>({
  queryKey:bankExceptionsKey(ownerId),
  queryFn:()=>hub.bankExceptions(),
  staleTime:4_000,
  refetchInterval:10_000,
 });
}
