import {useCallback,useEffect,useState} from 'react';
import {salesWindow,todayInVietnam,type SalesPeriod} from '@bmc/contracts';
import {useShopToday} from '../../app/useShopToday';

export type SalesUrlFilters={period:SalesPeriod;date:string;followToday:boolean};
const periods:SalesPeriod[]=['day','week','month','quarter','year'];

function isPeriod(value:string|null):value is SalesPeriod{
 return value!==null&&periods.some(period=>period===value);
}
function isValidDate(date:string|null):date is string{
 if(date===null)return false;
 try{salesWindow('day',date);return true}catch{return false}
}
export function readSalesUrlFilters(search:string,today=todayInVietnam()):SalesUrlFilters{
 const params=new URLSearchParams(search);
 const rawDate=params.get('date');
 const followToday=!isValidDate(rawDate);
 return {
  period:isPeriod(params.get('period'))?params.get('period') as SalesPeriod:'day',
  date:followToday?today:rawDate!,
  followToday,
 };
}
export function salesUrl(filters:SalesUrlFilters):string{
 const params=new URLSearchParams();
 if(filters.period!=='day')params.set('period',filters.period);
 if(!filters.followToday)params.set('date',filters.date);
 const query=params.toString();
 return '/sales'+(query?'?'+query:'');
}

/** URL filters are operator inputs; they never overwrite server-authoritative sales. */
export function useSalesReportUrl(){
 const today=useShopToday();
 const [filters,setFilters]=useState<SalesUrlFilters>(()=>readSalesUrlFilters(window.location.search));
 useEffect(()=>{
  const sync=()=>{
   if(window.location.pathname!=='/sales')return;
   const resolved=readSalesUrlFilters(window.location.search);
   const canonical=salesUrl(resolved);
   if(canonical!==window.location.pathname+window.location.search)
    window.history.replaceState(window.history.state,'',canonical);
   setFilters(resolved);
  };
  sync();
  window.addEventListener('popstate',sync);
  return ()=>window.removeEventListener('popstate',sync);
 },[]);
 useEffect(()=>{
  if(!filters.followToday)return;
  setFilters(current=>current.followToday&&current.date!==today
   ?{...current,date:today}:current);
 },[today,filters.followToday]);
 const commit=useCallback((next:SalesUrlFilters)=>{
  const target=salesUrl(next);
  if(window.location.pathname+window.location.search!==target)
   window.history.pushState(window.history.state,'',target);
  setFilters(next);
 },[]);
 const changePeriod=(period:SalesPeriod)=>commit({...filters,period});
 const changeDate=(date:string)=>{if(isValidDate(date))commit({...filters,date,followToday:false})};
 const resetToday=()=>commit({...filters,date:today,followToday:true});
 return {...filters,changePeriod,changeDate,resetToday};
}
