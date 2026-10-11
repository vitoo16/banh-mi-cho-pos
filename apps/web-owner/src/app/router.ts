import {useCallback,useEffect,useState} from 'react';
import type {OwnerPage} from './AppShell';

/** URL is the navigation source of truth. Never encode credentials or form drafts in it. */
const routes:Record<OwnerPage,string>={
 dashboard:'/',
 sales:'/sales',
 orders:'/orders',
 finance:'/finance',
 catalog:'/catalog',
 staff:'/staff',
};

export const ownerPagePath=(page:OwnerPage):string=>routes[page];

export function ownerPageFromPath(pathname:string):OwnerPage|null{
 const normalized=pathname.replace(/\/+$/,'')||'/';
 if(normalized==='/dashboard')return 'dashboard'; // Backward-compatible alias.
 for(const [page,path] of Object.entries(routes)){
  if(normalized===path)return page as OwnerPage;
 }
 return null;
}

function resolveLocation():OwnerPage{
 return ownerPageFromPath(window.location.pathname)??'dashboard';
}

/**
 * Back/Forward read from location, button navigation pushes exactly one entry.
 * Invalid paths redirect to the safe Overview; no protected content until auth.
 * Session/Cloud permissions remain enforced by the AuthBoundary/Hub.
 */
export function useOwnerRoute(){
 const [page,setPage]=useState<OwnerPage>(resolveLocation);
 useEffect(()=>{
  const sync=()=>{
   const selected=ownerPageFromPath(window.location.pathname);
   if(!selected){
    window.history.replaceState(window.history.state,'',routes.dashboard);
    setPage('dashboard');
    return;
   }
   // Canonicalize aliases/trailing slash without adding history entries.
   const canonical=routes[selected];
   if(window.location.pathname!==canonical){
    window.history.replaceState(window.history.state,'',canonical+window.location.search+window.location.hash);
   }
   setPage(selected);
  };
  sync();
  window.addEventListener('popstate',sync);
  return ()=>window.removeEventListener('popstate',sync);
 },[]);
 const navigate=useCallback((target:OwnerPage,options?:{replace?:boolean})=>{
  const path=routes[target];
  if(window.location.pathname!==path){
   if(options?.replace)window.history.replaceState(window.history.state,'',path);
   else window.history.pushState(window.history.state,'',path);
  }
  setPage(target);
 },[]);
 return {page,navigate};
}
