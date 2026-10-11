import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import {formatVnd,type Catalog,type Product,type Summary,type Employee,type StaffDevice,type PairingCode,type RemoteProductCommand} from '@bmc/contracts';import {LayoutDashboard,ClipboardList,Tags,Wallet,Settings,LogOut,ShoppingBag,AlertCircle,RefreshCcw} from 'lucide-react';import {QueryClientProvider} from '@tanstack/react-query';
import {hub,remote,newKey} from './api';
import {queryClient} from './app/queryClient';
import {useOwnerAuth} from './app/useOwnerAuth';
import {OwnerLogin} from './app/OwnerLogin';
import {OwnerDashboard,OwnerProductSalesPage} from './analytics/OwnerAnalytics';
import {OrderHistoryPage} from './features/orders/OrderHistoryPage';
import {catalogRetryStorageKey,readCatalogRetry,type CatalogRetry} from './features/catalog/catalog-retry';
import './styles.css';

type Page='dashboard'|'sales'|'orders'|'catalog'|'finance'|'staff';

function App(){
 const {session,login,logout}=useOwnerAuth();
 const [pin,setPin]=useState(''),[page,setPage]=useState<Page>('dashboard'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [report,setReport]=useState<Summary|null>(null),[catalog,setCatalog]=useState<Catalog|null>(null);
 const [exceptions,setExceptions]=useState<Array<{provider_tx_id:string;reference:string;amount_vnd:number;reason:string;received_at:string}>>([]);
 const [devices,setDevices]=useState<StaffDevice[]>([]),[deviceLabel,setDeviceLabel]=useState(''),[newPairing,setNewPairing]=useState<PairingCode|null>(null);
 const [remoteCommands,setRemoteCommands]=useState<RemoteProductCommand[]>([]);
 const [employees,setEmployees]=useState<Employee[]>([]),[empId,setEmpId]=useState(''),[empName,setEmpName]=useState(''),[empPin,setEmpPin]=useState(''),[empRole,setEmpRole]=useState<'STAFF'|'CASHIER'>('STAFF');
 const [editing,setEditing]=useState<string|null>(null),[name,setName]=useState(''),[price,setPrice]=useState(''),[category,setCategory]=useState('Bánh mì'),[active,setActive]=useState(true);
 const reload=async()=>{try{const [r,p,e,b,d,commands]=await Promise.all([hub.summary(),hub.products(),hub.employees(),hub.bankExceptions(),!remote?hub.devices():Promise.resolve([]),remote?hub.remoteProductCommands():Promise.resolve([])]);setRemoteCommands(commands);setDevices(d);setExceptions(b);setReport(r);setCatalog(p);setEmployees(e);setError('')}catch(e){setError((e as Error).message)}finally{void queryClient.invalidateQueries({queryKey:['owner','summary']})}};
 useEffect(()=>{if(!session||page==='dashboard'||page==='sales')return;void reload();const t=setInterval(()=>void reload(),10000);return()=>clearInterval(t)},[session,page]);
 async function signIn(e:React.FormEvent){e.preventDefault();setBusy(true);try{await login(pin);setPin('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function save(){
  if(busy||!editing)return;
  setBusy(true);setError('');
  try{
   const draft={remote,target:editing,name:name.trim(),category:category.trim(),
    price_vnd:Number(price),is_active:active};
   if(!draft.name||!Number.isSafeInteger(draft.price_vnd)||
    draft.price_vnd<0||draft.price_vnd>1_000_000_000||
    (editing==='new'&&(!draft.category||draft.category.length>80)))
    throw new Error('Kiểm tra tên, nhóm và giá bán (số nguyên VNĐ) trước khi gửi');
   const prior=readCatalogRetry();
   if(prior&&JSON.stringify(prior.draft)!==JSON.stringify(draft))
    throw new Error('Còn yêu cầu menu chưa xác nhận với nội dung khác. Hãy khôi phục và gửi lại yêu cầu cũ, không tạo mã mới.');
   let payload=prior?.payload;
   if(!payload){
    payload=editing==='new'?{name:draft.name,category:draft.category,price_vnd:draft.price_vnd,is_active:active}
      :{name:draft.name,price_vnd:draft.price_vnd,is_active:active};
    if(remote&&editing!=='new'){
     const product=catalog?.products.find(p=>p.id===editing);
     if(!product)throw new Error('Giá gốc chưa được tải; vui lòng tải lại menu');
     payload.expected_price_vnd=product.price_vnd;
    }
   }
   const stableKey=prior?.key||newKey();
   if(!prior)sessionStorage.setItem(catalogRetryStorageKey,JSON.stringify({draft,payload,key:stableKey}));
   // Retry the exact original JSON and key after timeout, even after reload.
   if(remote){
    if(editing==='new')await hub.queueRemoteProductCreate(payload as {name:string;category:string;price_vnd:number;is_active:boolean},stableKey);
    else await hub.queueRemoteProductUpdate(editing,payload as {name:string;price_vnd:number;is_active:boolean;expected_price_vnd:number},stableKey);
    setNotice('Đã gửi yêu cầu. POS phải xác nhận trước khi thay đổi có hiệu lực.');
   }else{
    if(editing==='new')await hub.request('/v1/owner/products',{method:'POST',body:JSON.stringify(payload)},stableKey);
    else await hub.updateProduct(editing,payload,stableKey);
    setNotice('Đã lưu sản phẩm. Đơn cũ vẫn giữ giá trước đây.');
   }
   sessionStorage.removeItem(catalogRetryStorageKey);
   setEditing(null);setName('');setPrice('');
   await reload();
  }catch(e){
   const status=(e as {status?:number}).status;
   // Explicit validation errors are rejected before any catalog commit.
   // Other failures may mean server accepted the command and response was lost.
   if(status===400||status===404||status===422)
    sessionStorage.removeItem(catalogRetryStorageKey);
   setError((e as Error).message+(status!==400&&status!==404&&status!==422?
    ' Nếu kết nối vừa gián đoạn, gửi lại đúng yêu cầu này để kiểm tra — mã chống trùng được giữ nguyên.':''));
  }finally{setBusy(false)}
 }

 const nav:[Page,string,React.ReactNode][]=[['dashboard','Tổng quan',<LayoutDashboard size={19}/>],['sales','Sản lượng',<Tags size={19}/>],['orders','Đơn hàng',<ClipboardList size={19}/>],['finance','Tài chính',<Wallet size={19}/>],['catalog','Sản phẩm',<Tags size={19}/>],['staff','Nhân viên',<Settings size={19}/>]];
 async function issuePairing(){if(deviceLabel.trim().length<3)return;setBusy(true);setError('');try{const code=await hub.issuePairing(deviceLabel.trim(),newKey());setNewPairing(code);setDeviceLabel('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function revokeDevice(device:StaffDevice){if(!window.confirm('Thu hồi thiết bị '+device.label+'? Nhân viên phải ghép lại để đăng nhập.'))return;const reason=window.prompt('Lý do thu hồi thiết bị (ít nhất 3 ký tự)');if(!reason||reason.trim().length<3)return;setBusy(true);try{await hub.revokeDevice(device.id,reason.trim(),newKey());await reload()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function createEmployee(){if(busy)return;setBusy(true);setError('');try{await hub.addEmployee({id:empId.trim().toLowerCase(),name:empName.trim(),role:empRole,pin:empPin},newKey());setEmpId('');setEmpName('');setEmpPin('');setNotice('Đã tạo tài khoản nhân viên');await reload()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function toggleEmployee(e:Employee){if(!window.confirm(e.active?'Tắt tài khoản nhân viên?':'Kích hoạt lại tài khoản?'))return;try{await hub.setEmployeeActive(e.id,!e.active,newKey());await reload()}catch(err){setError((err as Error).message)}}
 const restoreCatalogRetry=(item:CatalogRetry)=>{
  setEditing(item.draft.target);setName(item.draft.name);
  setCategory(item.draft.category);setPrice(String(item.draft.price_vnd));
  setActive(item.draft.is_active);setPage('catalog');
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
 };
 if(!session)return <OwnerLogin remote={remote} pin={pin} busy={busy} error={error} onPinChange={setPin} onSignIn={signIn}/>;
 return <div className="layout"><aside className="sidebar"><div className="brand"><span className="logo"><ShoppingBag size={23}/></span><div><b>Bánh Mì Chợ</b><small>Quản lý cửa hàng</small></div></div><div className="navlinks">{nav.map(([k,l,icon])=><button key={k} className={page===k?'active':''} onClick={()=>{setPage(k);setError('');setNotice('')}}>{icon}{l}</button>)}</div><div className="sidefoot"><div><b>{session.user.name}</b><small>Chủ tiệm</small></div><button title="Đăng xuất" onClick={()=>void logout()}><LogOut size={19}/></button></div></aside><main className="main"><header className="header"><div><p className="eyebrow">BẢNG ĐIỀU KHIỂN CỬA HÀNG</p><h1>{nav.find(([k])=>k===page)?.[1]}</h1></div><button className="reload" title="Tải lại" onClick={()=>{if(page==='dashboard'||page==='sales')void queryClient.invalidateQueries({queryKey:['owner']});else void reload()}}><RefreshCcw size={19}/></button></header><div className="stale"><AlertCircle size={17}/> {remote?'Dữ liệu Cloud có thể trễ; giá mới chỉ có hiệu lực khi Hub tại tiệm xác nhận.':'Chế độ POS nội bộ; dữ liệu tại quầy.'} {report&&<span> Cập nhật: {report.last_synced_at?new Date(report.last_synced_at).toLocaleTimeString('vi-VN'):'Chưa đồng bộ'}</span>}</div>
 {page==='dashboard'&&<OwnerDashboard onOpenSales={()=>setPage('sales')}/>}
 {page==='sales'&&<OwnerProductSalesPage/>}
 {page==='orders'&&<OrderHistoryPage/>}
 {page==='finance'&&<div className="twocol"><section className="panel"><h2>Sổ quỹ hiện tại</h2>{report?.shift?<><div className="metricrow"><span>Quỹ đầu ca</span><b>{formatVnd(report.shift.opening_float_vnd)}</b></div><div className="metricrow"><span>Tiền phải có</span><b>{formatVnd(report.shift.expected_cash_vnd)}</b></div></>:<p className="muted">Thu ngân chưa mở ca.</p>}</section><section className="panel"><h2>Đối soát ngân hàng</h2><p className="muted">Chỉ xác nhận theo sự kiện đã ký từ bộ xác minh giao dịch đáng tin cậy. Không nhận ảnh chụp.</p><div className="info">Chờ xác minh: {report?.bank_pending||0} đơn yêu cầu chuyển khoản.</div>{remote&&Boolean(report?.unallocated_bank_vnd)&&<div className="alert" role="alert"><strong>Phát hiện thu cả tiền mặt và chuyển khoản</strong><p>{report?.bank_conflict_orders||0} đơn · {formatVnd(report?.unallocated_bank_vnd||0)} tiền ngân hàng đang chờ xử lý. Khoản này được loại khỏi doanh thu chuyển khoản để không tính hai lần.</p><p>Đối chiếu giao dịch thật và hoàn/điều chỉnh có xác nhận; không tự xóa chứng từ.</p></div>}<h3>Giao dịch ngoại lệ ({exceptions.length})</h3>{exceptions.length===0?<p className="muted">Chưa phát hiện giao dịch ngân hàng bất thường.</p>:exceptions.map(x=><div className="record" key={x.provider_tx_id}><div><b>{x.reference}</b><small>{x.reason} · {new Date(x.received_at).toLocaleString('vi-VN')}</small></div><strong>{formatVnd(x.amount_vnd)}</strong></div>)}</section></div>}
 {page==='catalog'&&<section className="panel"><div className="panelhead"><div><h2>Menu và giá bán</h2><p className="muted">{remote?'Giá được cập nhật khi POS nhận và kiểm tra lệnh.':'Nhân viên chỉ thấy món đang bật bán.'}</p></div><button className="primary" onClick={()=>begin()}>+ Thêm món</button></div>{remote&&<div className="command-log" aria-label="Yêu cầu thay đổi menu từ xa">
  <h3>Yêu cầu thay đổi menu từ xa</h3>
  <p className="muted">Các thay đổi đang chờ POS tại tiệm áp dụng. Mất kết nối Cloud không ảnh hưởng đơn hàng tiền mặt.</p>
  {remoteCommands.slice(0,8).map(cmd=><div className="command-row" key={cmd.id}>
   <div><strong>{cmd.operation==='CREATE'?'Thêm món: ':''}{cmd.name}</strong><small>{formatVnd(cmd.price_vnd)} · {new Date(cmd.created_at).toLocaleString('vi-VN')}</small></div>
   <span className={cmd.status==='APPLIED'?'command-applied':cmd.status==='CONFLICT'?'command-conflict':'command-pending'}>
    {cmd.status==='APPLIED'?'POS đã áp dụng':cmd.status==='CONFLICT'?'Xung đột giá — cần xem lại':'Đang chờ POS'}
   </span>
  </div>)}
  {remoteCommands.length===0&&<p className="muted">Chưa có yêu cầu chỉnh giá từ xa.</p>}
 </div>}
 <div className="records">{catalog?.products.map(p=><div className="record" key={p.id}><div><b>{p.name}</b><small>{p.category} · {p.is_active?'Đang bán':'Đã ẩn'}</small></div><div><strong>{formatVnd(p.price_vnd)}</strong><button className="textbutton" onClick={()=>begin(p)}>{remote?'Đề xuất sửa giá':'Sửa'}</button></div></div>)}{catalog?.products.length===0&&<p className="muted">Chưa có món. Hãy thêm món đầu tiên.</p>}</div></section>}
 {page==='staff'&&remote&&<section className="panel"><h2>Nhân viên</h2><p className="muted">Quản lý nhân viên chỉ được thao tác từ POS nội bộ; trang cloud chỉ hiển thị báo cáo.</p></section>}
 {page==='staff'&&!remote&&<section className="panel" style={{marginBottom:18}}><h2>Thiết bị nhân viên</h2><p className="muted">Tạo mã ghép 16 ký tự dùng một lần, có hiệu lực 3 phút. Chỉ cung cấp trực tiếp cho nhân viên đang đứng tại quầy.</p><div className="panelhead"><input value={deviceLabel} onChange={e=>setDeviceLabel(e.target.value)} maxLength={80} placeholder="Tên thiết bị (VD: Điện thoại NV 01)" aria-label="Tên thiết bị"/><button className="primary" disabled={busy||deviceLabel.trim().length<3} onClick={()=>void issuePairing()}>Tạo mã ghép</button></div>{newPairing&&<div className="info" role="status">Mã ghép: <strong style={{letterSpacing:2}}>{newPairing.pairing_code}</strong><div>Hết hạn: {new Date(newPairing.expires_at).toLocaleTimeString('vi-VN')}</div></div>}<div className="records">{devices.map(d=><div className="record" key={d.id}><div><b>{d.label}</b><small>{d.user_id} · {d.revoked_at?'Đã thu hồi':'Đang được phép sử dụng'}</small></div>{!d.revoked_at&&<button className="textbutton" disabled={busy} onClick={()=>void revokeDevice(d)}>Thu hồi</button>}</div>)}{devices.length===0&&<p className="muted">Chưa ghép thiết bị nhân viên nào.</p>}</div></section>}
 {page==='staff'&&!remote&&<div className="twocol"><section className="panel"><h2>Tài khoản tại tiệm</h2><p className="muted">Mỗi nhân viên sử dụng mã đăng nhập riêng để truy vết đơn.</p>{employees.map(e=><div className="record" key={e.id}><div><b>{e.name}</b><small>{e.id} · {e.role==='CASHIER'?'Thu ngân':e.role==='OWNER'?'Chủ tiệm':'Nhận đơn'} · {e.active?'Hoạt động':'Đã khóa'}</small></div>{e.role!=='OWNER'&&<button className="textbutton" onClick={()=>void toggleEmployee(e)}>{e.active?'Khóa':'Mở lại'}</button>}</div>)}</section><section className="panel"><h2>Thêm nhân viên</h2><label>Mã nhân viên</label><input value={empId} onChange={e=>setEmpId(e.target.value)} placeholder="nv01" autoCapitalize="none"/><label>Tên hiển thị</label><input value={empName} onChange={e=>setEmpName(e.target.value)} placeholder="Nguyễn A"/><label>Vai trò</label><select value={empRole} onChange={e=>setEmpRole(e.target.value as 'STAFF'|'CASHIER')}><option value="STAFF">Nhận đơn</option><option value="CASHIER">Thu ngân</option></select><label>PIN (từ 6 ký tự)</label><input type="password" value={empPin} onChange={e=>setEmpPin(e.target.value)} autoComplete="new-password"/><button className="primary" disabled={busy||empPin.length<6||empId.length<2||!empName.trim()} onClick={()=>void createEmployee()}>Tạo tài khoản</button></section></div>}
 {editing&&page==='catalog'&&<div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null)}}><section className="modal" role="dialog" aria-modal="true" aria-label="Chỉnh sản phẩm"><div className="panelhead"><h2>{editing==='new'?'Thêm món':'Chỉnh sản phẩm'}</h2><button type="button" className="close" onClick={()=>setEditing(null)} aria-label="Đóng">×</button></div><label htmlFor="product-name">Tên món</label><input id="product-name" value={name} onChange={e=>setName(e.target.value)} maxLength={120}/>{editing==='new'&&<><label htmlFor="product-category">Nhóm món</label><input id="product-category" value={category} onChange={e=>setCategory(e.target.value)}/></>}{remote&&<p className="info">Yêu cầu từ xa có thể chờ tới khi POS kết nối Internet. Món mới chưa xuất hiện trên menu nhân viên trước khi POS xác nhận.</p>}<label htmlFor="product-price">Giá bán (VNĐ)</label><input id="product-price" inputMode="numeric" value={price} onChange={e=>setPrice(e.target.value.replace(/\D/g,''))}/><label className="checkbox"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/> Đang bán</label>{error&&<p className="alert" role="alert">{error}</p>}<button className="primary" disabled={busy||!name.trim()||price===''} onClick={()=>void save()}>Lưu sản phẩm</button></section></div>}
 {notice&&<p className="success" role="status">{notice}</p>}{error&&!editing&&<p className="alert" role="alert">{error}</p>}
 </main><nav className="bottomnav">{nav.map(([k,l,icon])=><button key={k} className={page===k?'active':''} onClick={()=>setPage(k)}>{icon}<small>{l}</small></button>)}</nav></div>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><App/></QueryClientProvider></React.StrictMode>);
