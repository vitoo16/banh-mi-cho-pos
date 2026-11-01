import React,{useEffect,useRef,useState} from 'react';import {createRoot} from 'react-dom/client';import {type Product,type Employee,type StaffDevice,type PairingCode} from '@bmc/contracts';import {QueryClientProvider} from '@tanstack/react-query';
import {hub,remote,newKey} from './api';
import {queryClient} from './app/queryClient';
import {useOwnerAuth} from './app/useOwnerAuth';
import {OwnerLogin} from './app/OwnerLogin';
import {OwnerDashboard} from './analytics/OwnerAnalytics';
const OwnerProductSalesPage=React.lazy(()=>import('./features/production/OwnerProductSalesPage').then(module=>({default:module.OwnerProductSalesPage})));
const OrderHistoryPage=React.lazy(()=>import('./features/orders/OrderHistoryPage').then(module=>({default:module.OrderHistoryPage})));
const CatalogPage=React.lazy(()=>import('./features/catalog/CatalogPage').then(module=>({default:module.CatalogPage})));
import {ProductFormDialog} from './features/catalog/ProductFormDialog';
const StaffPage=React.lazy(()=>import('./features/staff/StaffPage').then(module=>({default:module.StaffPage})));
const FinancePage=React.lazy(()=>import('./features/finance/FinancePage').then(module=>({default:module.FinancePage})));
import {summaryKey,bankExceptionsKey} from './features/finance/queries';
import {employeeKey,deviceKey} from './features/staff/queries';
import {catalogKey,commandKey} from './features/catalog/queries';
import {catalogRetryStorageKey,readCatalogRetry,type CatalogRetry} from './features/catalog/catalog-retry';
import {submitCatalogChange} from './features/catalog/mutations';
import './styles.css';
import './feature-surfaces.css';

import {AppShell,type OwnerPage as Page} from './app/AppShell';
import {useOwnerRoute} from './app/router';

function App(){
 const {session,login,logout}=useOwnerAuth();
 const navGuardRef=useRef<()=>boolean>(()=>true);
 const {page,navigate}=useOwnerRoute(()=>navGuardRef.current());
 const baselineRef=useRef('');
 const [pin,setPin]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [deviceLabel,setDeviceLabel]=useState(''),[newPairing,setNewPairing]=useState<PairingCode|null>(null);
 const [empId,setEmpId]=useState(''),[empName,setEmpName]=useState(''),[empPin,setEmpPin]=useState(''),[empRole,setEmpRole]=useState<'STAFF'|'CASHIER'>('STAFF');
 const [editing,setEditing]=useState<string|null>(null),[name,setName]=useState(''),[price,setPrice]=useState(''),[category,setCategory]=useState('Bánh mì'),[active,setActive]=useState(true);
 const draftSnapshot=(target=editing,n=name,c=category,p=price,a=active)=>JSON.stringify({target,n,c,p,a});
 const hasDirtyDraft=()=>Boolean(editing)&&draftSnapshot()!==baselineRef.current;
 function confirmLeaveDraft(){return !hasDirtyDraft()||window.confirm('Có thay đổi sản phẩm chưa lưu. Bỏ thay đổi và rời trang?')}
 function closeDraft(){if(confirmLeaveDraft())setEditing(null)}
 navGuardRef.current=confirmLeaveDraft;
 useEffect(()=>{if(!editing||!hasDirtyDraft())return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn)},[editing,name,category,price,active]);
 async function signIn(e:React.FormEvent){e.preventDefault();setBusy(true);try{await login(pin);setPin('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function save(){
  if(busy||!editing)return;
  setBusy(true);setError('');
  try{
   const message=await submitCatalogChange({
    target:editing,name,category,price,active,ownerId:session?.user.id??'',
   });
   setNotice(message);
   setEditing(null);setName('');setPrice('');
   // Refresh only the affected catalog slices, not finance or staff.
   await queryClient.invalidateQueries({queryKey:catalogKey(session?.user.id??'')});
   if(remote)await queryClient.invalidateQueries({queryKey:commandKey(session?.user.id??'')});
  }catch(e){
   const status=(e as {status?:number}).status;
   // Match the pre-extraction rejection/recovery policy exactly.
   if(status===400||status===404||status===422)
    sessionStorage.removeItem(catalogRetryStorageKey);
   setError((e as Error).message+(status!==400&&status!==404&&status!==422?
    ' Nếu kết nối vừa gián đoạn, gửi lại đúng yêu cầu này để kiểm tra — mã chống trùng được giữ nguyên.':''));
  }finally{setBusy(false)}
 }


 async function issuePairing(){if(deviceLabel.trim().length<3)return;setBusy(true);setError('');try{const code=await hub.issuePairing(deviceLabel.trim(),newKey());setNewPairing(code);setDeviceLabel('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function revokeDevice(device:StaffDevice){if(!window.confirm('Thu hồi thiết bị '+device.label+'? Nhân viên phải ghép lại để đăng nhập.'))return;const reason=window.prompt('Lý do thu hồi thiết bị (ít nhất 3 ký tự)');if(!reason||reason.trim().length<3)return;setBusy(true);try{await hub.revokeDevice(device.id,reason.trim(),newKey());await queryClient.invalidateQueries({queryKey:deviceKey(session?.user.id??'')})}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function createEmployee(){if(busy)return;setBusy(true);setError('');try{await hub.addEmployee({id:empId.trim().toLowerCase(),name:empName.trim(),role:empRole,pin:empPin},newKey());setEmpId('');setEmpName('');setEmpPin('');setNotice('Đã tạo tài khoản nhân viên');await queryClient.invalidateQueries({queryKey:employeeKey(session?.user.id??'')})}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function toggleEmployee(e:Employee){if(!window.confirm(e.active?'Tắt tài khoản nhân viên?':'Kích hoạt lại tài khoản?'))return;try{await hub.setEmployeeActive(e.id,!e.active,newKey());await queryClient.invalidateQueries({queryKey:employeeKey(session?.user.id??'')})}catch(err){setError((err as Error).message)}}
 const restoreCatalogRetry=(item:CatalogRetry)=>{
  setEditing(item.draft.target);setName(item.draft.name);
  setCategory(item.draft.category);setPrice(String(item.draft.price_vnd));
  setActive(item.draft.is_active);
  baselineRef.current=draftSnapshot(item.draft.target,item.draft.name,item.draft.category,String(item.draft.price_vnd),item.draft.is_active);
  navigate('catalog',{replace:true});
  setNotice('Có yêu cầu menu chưa xác nhận. Gửi lại chính nội dung cũ để tra cứu, không tạo món trùng.');
 };
 useEffect(()=>{
  if(!session)return;
  try{const prior=readCatalogRetry();if(prior&&prior.draft.remote===remote)restoreCatalogRetry(prior)}
  catch(e){setError((e as Error).message)}
 },[session]);
 const begin=(p?:Product)=>{
  try{const prior=readCatalogRetry();if(prior){restoreCatalogRetry(prior);return}}
  catch(e){setError((e as Error).message);return}
  setEditing(p?.id||'new');setName(p?.name||'');setCategory(p?.category||'Bánh mì');
  setPrice(String(p?.price_vnd??''));setActive(p?.is_active??true);setNotice('');
  baselineRef.current=draftSnapshot(p?.id||'new',p?.name||'',p?.category||'Bánh mì',String(p?.price_vnd??''),p?.is_active??true);
 };
 function navigateSidebar(target:Page){if(target===page)return;if(!confirmLeaveDraft())return;setEditing(null);navigate(target);setError('');setNotice('')}
 function refreshPage(){
  if(!session)return;
  if(page==='dashboard'||page==='sales')void queryClient.invalidateQueries({queryKey:page==='dashboard'?['owner']:['owner','product-sales']});
  else if(page==='catalog'){
   void queryClient.invalidateQueries({queryKey:catalogKey(session.user.id)});
   if(remote)void queryClient.invalidateQueries({queryKey:commandKey(session.user.id)});
  }else if(page==='staff'){
   if(!remote){
    void queryClient.invalidateQueries({queryKey:employeeKey(session.user.id)});
    void queryClient.invalidateQueries({queryKey:deviceKey(session.user.id)});
   }
  }else if(page==='finance'){
   void queryClient.invalidateQueries({queryKey:summaryKey});
   void queryClient.invalidateQueries({queryKey:bankExceptionsKey(session.user.id)});
  }
 }
 if(!session)return <OwnerLogin remote={remote} pin={pin} busy={busy} error={error} onPinChange={setPin} onSignIn={signIn}/>;
 return <AppShell userName={session.user.name} page={page} remote={remote}
 onSidebarNavigate={navigateSidebar} onBottomNavigate={navigateSidebar} onLogout={()=>{if(confirmLeaveDraft())void logout()}} onRefresh={refreshPage}>
 <React.Suspense fallback={<section className="panel" role="status" aria-live="polite">Đang tải màn hình…</section>}>
  {page==='dashboard'&&<OwnerDashboard onOpenSales={()=>navigate('sales')}/>}
 {page==='sales'&&<OwnerProductSalesPage/>}
 {page==='orders'&&<OrderHistoryPage/>}
 {page==='finance'&&<FinancePage ownerId={session.user.id} remote={remote}/>}
 {page==='catalog'&&<CatalogPage ownerId={session.user.id} remote={remote} onBegin={begin}/>}
 {page==='staff'&&<StaffPage remote={remote} ownerId={session.user.id}
 deviceProps={{deviceLabel,newPairing,busy,onDeviceLabelChange:setDeviceLabel,onIssuePairing:issuePairing,onRevokeDevice:revokeDevice}}
 employeeProps={{empId,empName,empPin,empRole,busy,onEmpIdChange:setEmpId,onEmpNameChange:setEmpName,onEmpPinChange:setEmpPin,onEmpRoleChange:setEmpRole,onCreateEmployee:createEmployee,onToggleEmployee:toggleEmployee}}
 />}
 {editing&&page==='catalog'&&<ProductFormDialog editing={editing} remote={remote} name={name} category={category} price={price} active={active} error={error} busy={busy} onNameChange={setName} onCategoryChange={setCategory} onPriceChange={setPrice} onActiveChange={setActive} onSave={save} onClose={closeDraft}/>}
 </React.Suspense>
  {notice&&<p className="success" role="status">{notice}</p>}{error&&!editing&&<p className="alert" role="alert">{error}</p>}
 </AppShell>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><App/></QueryClientProvider></React.StrictMode>);
