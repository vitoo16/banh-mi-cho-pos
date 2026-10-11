import {useQuery} from '@tanstack/react-query';
import {hub,remote} from '../../api';

/** Only local Owner may read and operate paired devices/employees.
 * Query keys are scoped to the current Owner and cleared on session logout.
 */
export const employeeKey=(ownerId:string)=>['owner','local',ownerId,'employees'] as const;
export const deviceKey=(ownerId:string)=>['owner','local',ownerId,'devices'] as const;

export function useStaffQueries(ownerId:string){
 const employees=useQuery({
  queryKey:employeeKey(ownerId),
  queryFn:()=>hub.employees(),
  enabled:!remote,
  staleTime:5_000,
  refetchInterval:remote?false:10_000,
 });
 const devices=useQuery({
  queryKey:deviceKey(ownerId),
  queryFn:()=>hub.devices(),
  enabled:!remote,
  staleTime:5_000,
  refetchInterval:remote?false:10_000,
 });
 return {employees,devices};
}
