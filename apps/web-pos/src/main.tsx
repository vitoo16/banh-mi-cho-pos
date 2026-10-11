import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {HubClient,formatVnd,type Order,type Shift,type ReceiptCopy,type Session,type OperationalStatus} from '@bmc/contracts';
import {ShoppingBag,Wallet,Search,LogOut,Wifi,WifiOff,CheckCircle2,Clock,Printer,Plus,ArrowDownLeft,History,ShieldAlert,RefreshCcw} from 'lucide-react';
import './styles.css';
import {vietQrImageUrl} from './vietQr';
import {readPendingCash,stagePendingCash,clearPendingCash,type PendingCashCapture} from './pendingCash';
const tokenKey='bmc_cashier_token';
const hub=new HubClient('',()=>sessionStorage.getItem(tokenKey)||undefined);
const moneyInput=(s:string)=>Math.max(0,Number(s.replace(/\D/g,''))||0);
const nonce=()=>crypto.randomUUID();
function App(){
 const [session,setSession]=useState<Session|null>(null),[pin,setPin]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [orders,setOrders]=useState<Order[]>([]),[shift,setShift]=useState<Shift|null>(null),[selected,setSelected]=useState<string|null>(null);
 const [filter,setFilter]=useState<'UNPAID'|'PAID'|'ALL'>('UNPAID'),[query,setQuery]=useState('');
 const [tender,setTender]=useState(''),[floatAmount,setFloatAmount]=useState('1000000'),[counted,setCounted]=useState(''),[reason,setReason]=useState('');
 const [mode,setMode]=useState<'ORDERS'|'SHIFT'>('ORDERS'),[method,setMethod]=useState<'CASH'|'BANK'>('CASH');
 const [copies,setCopies]=useState<ReceiptCopy[]>([]),[message,setMessage]=useState(''),[online,setOnline]=useState(true);
 const [operations,setOperations]=useState<OperationalStatus|null>(null);
 const [connectionError,setConnectionError]=useState(''),[historicalOrder,setHistoricalOrder]=useState<Order|null>(null);
 const [bankIntent,setBankIntent]=useState<{reference:string;amount_vnd:number;account_number:string;bank_code:string;status:string}|null>(null);
 const [bankBusy,setBankBusy]=useState(false);
 const [qrFailed,setQrFailed]=useState(false);
 const createBank=async()=>{if(!current||bankBusy)return;setBankBusy(true);setError('');try{const b=await hub.bankIntent(current.order_id,nonce());setQrFailed(false);setBankIntent(b)}catch(e){setError((e as Error).message)}finally{setBankBusy(false)}};
 const [moveKind,setMoveKind]=useState<'ADD'|'WITHDRAW'|'EXPENSE'>('ADD'),[moveAmount,setMoveAmount]=useState('');
 const keyRef=useRef<string|null>(null);
 const cashRequestLock=useRef(false);
 const [pendingCash,setPendingCash]=useState<PendingCashCapture|null>(()=>{try{return readPendingCash(localStorage)}catch{return null}});
 const [pendingCashError,setPendingCashError]=useState(()=>{try{readPendingCash(localStorage);return ''}catch(e){return (e as Error).message}});

 const current=useMemo(()=>orders.find(o=>o.order_id===selected)||(historicalOrder?.order_id===selected?historicalOrder:undefined),[orders,selected,historicalOrder]);
 const qrImageUrl=bankIntent?vietQrImageUrl(bankIntent):null;
 const canCollect=current?.status==='COMMITTED'&&current.payment_status==='UNPAID';
 const due=current?.total_vnd||0;const paid=current?.payment_status==='PAID';const cashGiven=moneyInput(tender);const change=Math.max(0,cashGiven-due);
 const refresh=async()=>{
  try{const [os,sh]=await Promise.all([hub.orders(),hub.shift()]);setOrders(os);setShift(sh);setOnline(true);setConnectionError('')}
  catch(e){setOnline(false);setConnectionError(String((e as Error).message||e))}
  // Operational reporting must not make working cash checkout appear disconnected.
  try{setOperations(await hub.operationalStatus())}catch{setOperations(null)}
 };
 useEffect(()=>{if(!session)return;void refresh();const id=setInterval(()=>void refresh(),2500);return ()=>clearInterval(id)},[session]);
 useEffect(()=>{if(!current)return;setMethod(current.requested_payment_method==='BANK'?'BANK':'CASH');setCopies([]);setBankIntent(null);setQrFailed(false);setTender('');setMessage('');keyRef.current=null;},[selected]);
 useEffect(()=>{
  if(!selected)return;
  let live=true;
  void hub.receipts(selected).then(c=>{if(live)setCopies(c)}).catch(()=>{});
  return ()=>{live=false};
 },[selected]);
 async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const s=await hub.login(pin,'cashier');sessionStorage.setItem(tokenKey,s.token);setSession(s);setPin('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function execute(fn:()=>Promise<unknown>,success:string){if(busy)return;setBusy(true);setError('');try{await fn();setMessage(success);keyRef.current=null;await refresh()}catch(e){setError((e as Error).message+' — Kiểm tra đơn trước khi thử lại.');await refresh()}finally{setBusy(false)}}
 const stableKey=()=>keyRef.current||(keyRef.current=nonce());
 async function sendPendingCash(request:PendingCashCapture){
  if(cashRequestLock.current||!session||session.user.id!==request.cashier_id)return;
  cashRequestLock.current=true;setBusy(true);setError('');
  try{
   await hub.captureCash(request.order_id,request.shift_id,request.cash_tendered_vnd,request.expected_order_version,request.key);
   try{
    clearPendingCash(localStorage,request.key);
    setPendingCash(null);setPendingCashError('');
   }catch(e){
    setPendingCashError('POS đã xác nhận nhưng trình duyệt chưa xóa được yêu cầu chờ: '+(e as Error).message);
   }
   keyRef.current=null;
   setMessage('Đã ghi nhận tiền mặt theo mã yêu cầu cũ. Kiểm tra hai liên in; không thu tiền lần nữa.');
   if(selected===request.order_id){
    try{setCopies(await hub.receipts(request.order_id))}catch{/* printing status remains recoverable */}
   }
   await refresh();
  }catch(e){
   setError('CHƯA RÕ KẾT QUẢ THU TIỀN. Không nhận thêm tiền và không tạo giao dịch mới. Kiểm tra POS rồi chỉ gửi lại cùng mã yêu cầu. Chi tiết: '+(e as Error).message);
  }finally{cashRequestLock.current=false;setBusy(false)}
 }
 function settle(){
  if(!current||!canCollect||!shift||!session||paid||cashGiven<due||busy||cashRequestLock.current||pendingCash||pendingCashError)return;
  const request:PendingCashCapture={
   key:nonce(),cashier_id:session.user.id,order_id:current.order_id,shift_id:shift.id,
   cash_tendered_vnd:cashGiven,expected_order_version:current.version,created_at:Date.now()
  };
  try{
   stagePendingCash(localStorage,request); // persisted BEFORE any remote payment capture call
   setPendingCash(request);
  }catch(e){
   setPendingCashError('Không thể ghi yêu cầu thu tiền an toàn. Chưa gửi lệnh thanh toán: '+(e as Error).message);
   return;
  }
  void sendPendingCash(request);
 }
 async function recoverCash(){
  if(!pendingCash||busy||cashRequestLock.current||!session||session.user.id!==pendingCash.cashier_id)return;
  // Retry NEVER changes amount, order, shift, version or idempotency key.
  await sendPendingCash(pendingCash);
 }
 function activateOrder(id:string){setHistoricalOrder(null);setSelected(id);setMode('ORDERS');setError('')}
 async function openPrintException(orderId:string){
  setError('');
  try{const order=await hub.order(orderId);setHistoricalOrder(order);setSelected(orderId);setMode('ORDERS')}
  catch(e){setError('Không mở được đơn cần kiểm tra: '+(e as Error).message)}
 }
 const list=useMemo(()=>{
  const needle=query.trim().toLowerCase();
  const actionable=(o:Order)=>o.status==='COMMITTED'&&(o.payment_status==='UNPAID'||o.payment_status==='PARTIAL');
  return orders.filter(o=>
   (filter==='ALL'||(filter==='PAID'?o.payment_status==='PAID':actionable(o)))&&
   (o.display_code.toLowerCase().includes(needle)||o.created_by.toLowerCase().includes(needle))
  ).sort((a,b)=>filter==='UNPAID'
   ?a.created_at.localeCompare(b.created_at)||a.order_id.localeCompare(b.order_id)
   :b.created_at.localeCompare(a.created_at)||b.order_id.localeCompare(a.order_id));
 },[orders,filter,query]);
 if(!session)return <main className="login-shell"><div className="login-card"><div className="mark"><ShoppingBag size={25}/></div><p className="eyebrow">BÁNH MÌ CHỢ</p><h1>Quầy thu ngân</h1><p className="muted">Một quầy thu tiền, mọi đơn hàng rõ ràng.</p><form onSubmit={login}><label htmlFor="pin">Mã PIN thu ngân</label><input id="pin" autoFocus autoComplete="off" type="password" value={pin} onChange={e=>setPin(e.target.value)} minLength={6} required/><button className="primary full" disabled={busy}>Đăng nhập</button></form>{error&&<div role="alert" className="alert">{error}</div>}<p className="hint">Kết nối với Store Hub nội bộ. Không lưu PIN trên thiết bị.</p></div></main>;
 return <div className="shell">
  <a className="pos-skip-link" href="#pos-main">Đến nội dung thu ngân</a>
  <header className="topbar"><div className="brand"><span className="mark small"><ShoppingBag size={19}/></span><span><b>Bánh Mì Chợ</b><small>POS • Thu ngân</small></span></div><div className="top-right"><span className={'network '+(online?'good':'bad')}>{online?<Wifi size={16}/>:<WifiOff size={16}/>} {online?'Store Hub':'Mất kết nối'}</span><span className="pill">Ca: {shift?'Đang mở':'Chưa mở'}</span><button className="ghost" onClick={()=>{void hub.logout().catch(()=>{}).finally(()=>{sessionStorage.removeItem(tokenKey);setSession(null)})}} title="Đăng xuất"><LogOut size={18}/></button></div></header>
  <nav className="mainnav" aria-label="Chế độ thu ngân"><button type="button" onClick={()=>setMode('ORDERS')} aria-pressed={mode==='ORDERS'} className={mode==='ORDERS'?'active':''}><ShoppingBag size={17}/> Đơn hàng</button><button type="button" onClick={()=>setMode('SHIFT')} aria-pressed={mode==='SHIFT'} className={mode==='SHIFT'?'active':''}><Wallet size={17}/> Sổ quỹ & chốt ca</button></nav>
  {!online&&<div role="alert" className="alert wide">Không kết nối được Store Hub. Không ghi nhận thanh toán khi chưa có xác nhận. {connectionError}</div>}
  {(pendingCash||pendingCashError)&&<section className="cash-recovery" role="alert"><div><ShieldAlert size={23}/><div><strong>Thu tiền mặt cần xác minh</strong><p>{pendingCashError||'Có lần thu tiền chưa nhận được xác nhận cuối. Không nhận tiền khách lần nữa; giữ nguyên đơn và số tiền đã nhập.'}</p>{pendingCash&&<small>Đơn {orders.find(o=>o.order_id===pendingCash.order_id)?.display_code||pendingCash.order_id} · Khách đưa {formatVnd(pendingCash.cash_tendered_vnd)} · Mã chống trùng giữ nguyên</small>}</div></div>{pendingCash&&<button className="secondary" disabled={busy||!online||session.user.id!==pendingCash.cashier_id} onClick={()=>void recoverCash()}>{busy?'Đang xác minh…':'Gửi lại đúng yêu cầu cũ để xác minh'}</button>}</section>}
  {operations?.printer.unknown_copies? <section className="print-alert" role="alert" aria-label="Cảnh báo biên nhận in chưa xác định">
    <div className="print-alert-title"><Printer size={20}/><div><strong>{operations.printer.unknown_copies} liên in chưa xác định</strong><span>Máy in có thể đã xuất giấy. Kiểm tra tại quầy trước khi yêu cầu in lại; không thanh toán lại đơn.</span></div></div>
    <details><summary>Chọn đơn cần kiểm tra</summary><div className="print-alert-list">{operations.printer.unknown_receipts.map(copy=><button key={copy.id} type="button" onClick={()=>void openPrintException(copy.order_id)}>#{copy.display_code} · {copy.kind==='CUSTOMER'?'Liên khách':'Liên tiệm'}</button>)}</div></details>
  </section>:null}
  {operations&&<div className="ops-line" role="status">
    <span><Printer size={15}/> {operations.printer.driver_configured?'Đã cấu hình bộ in (chưa xác nhận giấy)':'Chưa cấu hình máy in'} · {operations.printer.waiting_copies} liên chờ</span>
    <span><Wifi size={15}/> {operations.cloud_sync.configured?'Cloud: '+operations.cloud_sync.pending_events+' sự kiện chờ · '+(operations.cloud_sync.last_delivered_at?'Đã gửi gần nhất '+new Date(operations.cloud_sync.last_delivered_at).toLocaleTimeString('vi-VN'):'Chưa có lần gửi thành công'):'Cloud chưa bật · thu tiền mặt qua LAN vẫn hoạt động'}</span>
   </div>}
  {mode==='SHIFT'?<main id="pos-main" tabIndex={-1} className="shiftpage">
    <div><p className="eyebrow">QUẢN LÝ TIỀN MẶT</p><h1>Ca thu ngân</h1><p className="muted">Tiền chuyển khoản không được tính vào két.</p></div>
    {!shift?<section className="surface narrow"><h2>Mở ca</h2><label>Tiền lẻ chủ bàn giao (VNĐ)</label><input inputMode="numeric" value={floatAmount} onChange={e=>setFloatAmount(e.target.value)}/><div className="cashhero">{formatVnd(moneyInput(floatAmount))}</div><button className="primary full" disabled={busy} onClick={()=>void execute(()=>hub.openShift(moneyInput(floatAmount),stableKey()),'Ca đã mở')}>Mở ca thu ngân</button></section>:<>
     <div className="stats"><div className="stat"><span>Tiền đầu ca</span><b>{formatVnd(shift.opening_float_vnd)}</b></div><div className="stat"><span>Tiền phải có</span><b>{formatVnd(shift.expected_cash_vnd)}</b></div><div className="stat"><span>Thu ngân</span><b>{session.user.name}</b></div></div>
     <div className="shiftgrid"><section className="surface"><h2>Thu / chi két</h2><div className="seg">{(['ADD','WITHDRAW','EXPENSE'] as const).map(k=><button key={k} onClick={()=>setMoveKind(k)} className={moveKind===k?'on':''}>{k==='ADD'?'Bổ sung':k==='WITHDRAW'?'Rút tiền':'Chi tiền'}</button>)}</div><label>Số tiền (VNĐ)</label><input inputMode="numeric" value={moveAmount} onChange={e=>setMoveAmount(e.target.value)} placeholder="Nhập số tiền"/><label>Lý do</label><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ví dụ: chủ rút tiền"/><button className="secondary full" disabled={busy||!!pendingCash||!!pendingCashError||moneyInput(moveAmount)<=0||reason.trim().length<3} onClick={()=>void execute(()=>hub.movement(shift.id,moveKind,moneyInput(moveAmount),reason,stableKey()),'Đã ghi sổ quỹ')}>Ghi vào sổ quỹ</button></section>
     <section className="surface"><h2>Chốt ca</h2><p className="muted">Đếm toàn bộ tiền mặt đang có trong két rồi nhập số thực tế.</p><label>Tiền thực đếm (VNĐ)</label><input inputMode="numeric" value={counted} onChange={e=>setCounted(e.target.value)}/><div className="reconcile"><span>Chênh lệch</span><strong className={moneyInput(counted)-shift.expected_cash_vnd<0?'negative':''}>{formatVnd(moneyInput(counted)-shift.expected_cash_vnd)}</strong></div><label>Giải trình (bắt buộc nếu lệch)</label><input value={reason} onChange={e=>setReason(e.target.value)}/><button className="primary full" disabled={busy||!!pendingCash||!!pendingCashError||!counted||moneyInput(counted)!==shift.expected_cash_vnd&&reason.trim().length<3} onClick={()=>{if(window.confirm('Xác nhận khóa ca? Không thể sửa các giao dịch đã ghi.'))void execute(()=>hub.closeShift(shift.id,moneyInput(counted),reason,stableKey()),'Đã chốt ca và lưu biên bản')}}>Xác nhận chốt ca</button></section></div></>}
    {message&&<p className="success-note" role="status">{message}</p>}{error&&<p className="alert" role="alert">{error}</p>}
   </main>:<main id="pos-main" tabIndex={-1} className="poslayout"><section className={'orders-pane '+(selected?'hide-on-small':'')}>
    <div className="panehead"><div><p className="eyebrow">ĐƠN TRONG NGÀY</p><h1>{filter==='UNPAID'?'Hàng đợi':'Đơn gần đây'} <span className="count">{list.length}</span></h1></div><button className="iconbtn" aria-label="Tải lại đơn" onClick={()=>void refresh()}><RefreshCcw size={18}/></button></div>
    <div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm mã đơn hoặc nhân viên" aria-label="Tìm đơn hàng"/></div>
    <div className="tabs">{([['UNPAID','Chờ thu'],['PAID','Đã thu'],['ALL','Tất cả']] as const).map(([k,l])=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)}>{l}</button>)}</div>
    <div className="orders-scroll">{list.length===0?<div className="empty"><ShoppingBag/><p>Chưa có đơn trong nhóm này</p></div>:list.map(o=><button key={o.order_id} className={'order-tile '+(selected===o.order_id?'selected':'')} onClick={()=>activateOrder(o.order_id)}><div className="orderline"><b>#{o.display_code}</b><strong>{formatVnd(o.total_vnd)}</strong></div><div className="orderline muted"><small>NV: {o.created_by} · {new Date(o.created_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</small><span className={'status '+(o.payment_status==='PAID'?'paid':'pending')}>{o.status==='VOIDED'?'Đã hủy':o.payment_status==='REFUNDED'?'Đã hoàn':o.payment_status==='PAID'?'Đã thu':'Chưa thu'}</span></div><small>Khách chọn: {o.requested_payment_method==='BANK'?'Chuyển khoản':'Tiền mặt'}</small></button>)}</div>
   </section>
   <section className={'checkout-pane '+(!selected?'hide-when-unselected':'')}>{current?<div className="checkout-content"><div className="back-line"><button className="ghost mobile-back" onClick={()=>setSelected(null)}>← Trở lại</button><span className={'status '+(paid?'paid':'pending')}>{current.payment_status==='REFUNDED'?'Đã hoàn tiền':paid?'Đã thu tiền':'Chưa thanh toán'}</span></div>
    <p className="eyebrow">CHI TIẾT ĐƠN HÀNG</p><h1>#{current.display_code}</h1><p className="muted">Tạo bởi {current.created_by} • Khách chọn: {current.requested_payment_method==='BANK'?'Chuyển khoản':'Tiền mặt'}</p>
    <div className="lineitems">{current.items.map((it,i)=><div className="item" key={i}><div><b>{it.name_snapshot} <span className="muted">× {it.qty}</span></b>{it.note&&<small>Ghi chú: {it.note}</small>}</div><strong>{formatVnd(it.line_total_vnd)}</strong></div>)}</div>
    <div className="due"><span>TỔNG CẦN THU</span><strong>{formatVnd(due)}</strong></div>
    {canCollect? <><div className="method-row"><button onClick={()=>setMethod('CASH')} className={method==='CASH'?'chosen':''}><Wallet size={17}/> Tiền mặt</button><button onClick={()=>setMethod('BANK')} className={method==='BANK'?'chosen':''}>▦ Chuyển khoản</button></div>
    {method==='CASH'?<div className="cash-panel"><label htmlFor="tender">Khách đưa (VNĐ)</label><input id="tender" inputMode="numeric" className="tender" value={tender} onChange={e=>setTender(e.target.value)} placeholder="0"/><div className="denominations">{[50000,100000,200000,500000].map(n=><button key={n} onClick={()=>setTender(String(n))}>{n/1000}k</button>)}</div><div className="change"><span>{cashGiven>=due?'TIỀN THỐI':'CÒN THIẾU'}</span><strong className={cashGiven<due?'negative':''}>{formatVnd(Math.abs(cashGiven-due))}</strong></div><button className="primary full big" disabled={busy||!online||!shift||cashGiven<due||!!pendingCash||!!pendingCashError} onClick={settle}>{busy?'Đang xử lý…':'Xác nhận đã nhận tiền'}</button>{!shift&&<p className="hint">Cần mở ca trước khi thu tiền mặt.</p>}</div>:<div className="bank-panel"><Clock size={24}/><h3>{bankIntent?'Đang chờ xác nhận ngân hàng':'Chuyển khoản'}</h3>{bankIntent?<><p>Ngân hàng: <b>{bankIntent.bank_code}</b></p><p>Tài khoản nhận: <b>{bankIntent.account_number}</b></p><p>Số tiền chính xác: <b>{formatVnd(bankIntent.amount_vnd)}</b></p><p>Nội dung chuyển khoản: <b>{bankIntent.reference}</b></p>
     {qrImageUrl&&!qrFailed?
      <div className="vietqr-block">
       <img src={qrImageUrl} alt={'VietQR chuyển khoản '+formatVnd(bankIntent.amount_vnd)+' với mã '+bankIntent.reference}
        width={256} height={256} decoding="async" referrerPolicy="no-referrer"
        onError={()=>setQrFailed(true)}/>
       <small>Khách quét bằng ứng dụng ngân hàng. Kiểm tra lại tài khoản nhận và số tiền.</small>
      </div>
      :<p className="vietqr-fallback" role="status">Không tải được QR hoặc ngân hàng chưa hỗ trợ định dạng mã hiện tại. Thu ngân hướng dẫn khách nhập chính xác thông tin chuyển khoản ở trên.</p>}
     <p className="hint">QR chỉ giúp điền thông tin, không phải xác nhận khách đã chuyển tiền. Chỉ đánh dấu đã thanh toán khi hệ thống nhận sự kiện giao dịch đã xác minh. Không nhận ảnh chụp làm bằng chứng tự động.</p></>:<p>Hệ thống chỉ tạo mã tham chiếu khi bộ xác minh giao dịch ngân hàng đã được cấu hình. Không được coi lựa chọn của nhân viên là đã thanh toán.</p>}<button className="secondary" disabled={bankBusy} onClick={()=>void createBank()}>{bankBusy?'Đang tạo…':bankIntent?'Kiểm tra thông tin':'Tạo yêu cầu chuyển khoản'}</button><button className="secondary" onClick={()=>{setBankIntent(null);setMethod('CASH')}}>Thu tiền mặt thay thế</button></div>}
    </>:current.status==='VOIDED'?<section className="paid-panel"><ShieldAlert size={22}/><div><b>Đơn đã hủy</b><p className="muted">Không ghi doanh thu hay thu tiền cho đơn này.</p></div></section>:current.payment_status==='REFUNDED'||current.payment_status==='PARTIALLY_REFUNDED'?<section className="paid-panel"><ShieldAlert size={22}/><div><b>Đơn đã hoàn tiền</b><p className="muted">Không tiếp tục thu tiền trên đơn này. Giao dịch hoàn phải được đối soát riêng.</p></div></section>:current.payment_status==='PARTIAL'?<section className="paid-panel"><ShieldAlert size={22}/><div><b>Đơn đã thu một phần</b><p className="muted">Chưa hỗ trợ thu tiếp trên giao diện này. Thu ngân cần đối soát trước khi xử lý.</p></div></section>:<section className="paid-panel"><CheckCircle2 size={26}/><div><b>Đã ghi nhận thanh toán</b><p className="muted">Doanh thu ghi một lần. Trạng thái giấy in được quản lý riêng.</p></div></section>}
    {canCollect&&<button className="ghost" disabled={busy} onClick={()=>{const reason=window.prompt('Lý do hủy đơn chưa thu tiền?');if(reason&&reason.trim().length>=3&&window.confirm('Xác nhận hủy đơn '+current.display_code+'?'))void execute(()=>hub.voidOrder(current.order_id,reason,nonce()),'Đã hủy đơn')}}>Hủy đơn chưa thu tiền</button>}
    {paid&&shift&&<button className="ghost" disabled={busy} onClick={()=>{const reason=window.prompt('Lý do hoàn tiền mặt toàn bộ đơn?');if(reason&&reason.trim().length>=3&&window.confirm('Xác nhận hoàn '+formatVnd(current.total_vnd)+' tiền mặt, giảm tiền két và ghi lịch sử?'))void execute(()=>hub.refundCash(current.order_id,shift.id,reason,nonce()),'Đã ghi nhận hoàn tiền mặt và trừ sổ quỹ')}}>Hoàn toàn bộ tiền mặt</button>}
    {paid&&<section className="receipt-section"><div className="section-title"><h2>Hai liên biên nhận</h2><button className="ghost" onClick={()=>void hub.receipts(current.order_id).then(setCopies)}>Kiểm tra</button></div>{copies.length===0?<button className="secondary" onClick={()=>void hub.receipts(current.order_id).then(setCopies)}>Xem trạng thái in</button>:copies.map(copy=><div className="receipt-row" key={copy.id}><div><Printer size={18}/><b>{copy.kind==='CUSTOMER'?'Liên khách':'Liên tiệm'}</b></div><small>{copy.status==='WAITING_FOR_PRINTER'?'Đang chờ máy in':copy.status==='UNKNOWN'?'Chưa rõ giấy đã ra — kiểm tra trước khi in lại':copy.status==='SENT'?'Đã gửi dữ liệu, chưa xác nhận giấy':'Trạng thái '+copy.status}</small><button onClick={()=>{const reason=window.prompt('Ghi lý do in lại (từ 3 ký tự)');if(reason&&reason.trim().length>=3)void execute(async()=>{await hub.reprint(copy.id,reason,nonce());setCopies(await hub.receipts(current.order_id))},'Đã ghi yêu cầu in lại — cần kiểm tra máy in')}} disabled={busy||copy.status==='WAITING_FOR_PRINTER'}>Yêu cầu in lại</button></div>)}<p className="hint">Hệ thống gửi ESC/POS khi máy in được cấu hình. Trạng thái SENT chỉ là gửi dữ liệu, không chứng minh giấy đã ra; liên UNKNOWN cần kiểm tra thủ công.</p></section>}
    {message&&<p className="success-note" role="status">{message}</p>}{error&&<div className="alert" role="alert">{error}</div>}
   </div>:<div className="welcome"><div className="welcome-icon"><ShoppingBag size={30}/></div><p className="eyebrow">BÁN HÀNG NHANH, TIỀN RÕ RÀNG</p><h2>Chọn một đơn để thu tiền</h2><p className="muted">Nhân viên tạo đơn trên điện thoại. Các đơn mới sẽ hiển thị tại hàng đợi bên trái.</p><div className="welcome-stat"><Wallet size={21}/><span>{shift?'Ca thu ngân đang mở':'Hãy mở ca thu ngân trước khi nhận tiền'}</span></div></div>}</section>
   </main>}
 </div>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
