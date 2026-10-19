import {useCallback,useEffect,useRef,useState} from 'react';
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
export function useOwnerRoute(canLeave:()=>boolean=()=>true){
 const guardRef=useRef(canLeave);guardRef.current=canLeave;
 const acceptedUrlRef=useRef(window.location.pathname+window.location.search+window.location.hash);
 const [page,setPage]=useState<OwnerPage>(resolveLocation);
 useEffect(()=>{
  const sync=()=>{
   if(!guardRef.current()){
    // A browser Back navigation changes location before popstate; retain the last accepted route.
    window.history.pushState(window.history.state,'',acceptedUrlRef.current);
    return;
   }
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
   acceptedUrlRef.current=window.location.pathname+window.location.search+window.location.hash;
  };
  // Canonicalize initial location, without prompting on first mount.
  const initial=ownerPageFromPath(window.location.pathname);
  if(!initial)window.history.replaceState(window.history.state,'',routes.dashboard);
  acceptedUrlRef.current=window.location.pathname+window.location.search+window.location.hash;
  // The guard runs only for browser Back/Forward, not for this initial sync.
  const onPopState=()=>sync();

  window.addEventListener('popstate',onPopState);
  return ()=>window.removeEventListener('popstate',onPopState);
 },[]);
 const navigate=useCallback((target:OwnerPage,options?:{replace?:boolean})=>{
  const path=routes[target];
  if(window.location.pathname!==path){
   if(options?.replace)window.history.replaceState(window.history.state,'',path);
   else window.history.pushState(window.history.state,'',path);
  }
  setPage(target);
  acceptedUrlRef.current=window.location.pathname+window.location.search+window.location.hash;
 },[]);
 return {page,navigate};
}
