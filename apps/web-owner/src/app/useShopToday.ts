import {useEffect,useState} from 'react';
import {todayInVietnam} from '@bmc/contracts';

/** Shop-local day boundary, independent of OS timezone.
 * Recompute at most every 30s while a date-aware view is mounted.
 * A hidden tab reconciles immediately on visibility/focus.
 */
export function useShopToday(){
 const [shopDate,setShopDate]=useState(todayInVietnam);
 useEffect(()=>{
  const refresh=()=>setShopDate(previous=>{
   const current=todayInVietnam();
   return previous===current?previous:current;
  });
  const timer=window.setInterval(refresh,30_000);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',refresh);
  return ()=>{
   window.clearInterval(timer);
   window.removeEventListener('focus',refresh);
   document.removeEventListener('visibilitychange',refresh);
  };
 },[]);
 return shopDate;
}
