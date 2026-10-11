import {useCallback,useRef,useState} from 'react';
import type {Session} from '@bmc/contracts';
import {hub} from '../api';
import {clearOwnerQuerySession} from './queryClient';

const tokenKey='bmc_owner_token';

/** OR-01: auth boundary. Do not persist owner profile or queries between sessions. */
export function useOwnerAuth(){
 const [session,setSession]=useState<Session|null>(null);
 const generation=useRef(0);

 const login=useCallback(async(pin:string)=>{
  const attempt=++generation.current;
  const result=await hub.login(pin,'owner');
  // A late login response must not restore a session after the operator logged out.
  if(attempt!==generation.current)return;
  clearOwnerQuerySession();
  sessionStorage.setItem(tokenKey,result.token);
  setSession(result);
 },[]);

 const logout=useCallback(()=>{
  ++generation.current;
  // Revoke using the current token, but immediately lock and clear protected UI.
  const revoke=hub.logout().catch(()=>{});
  sessionStorage.removeItem(tokenKey);
  clearOwnerQuerySession();
  setSession(null);
  return revoke;
 },[]);

 return {session,login,logout};
}
