import {memo,useEffect,useMemo,useState} from 'react';
import {type Order,formatVnd} from '@bmc/contracts';
import {Search,ShoppingBag,RefreshCcw} from 'lucide-react';
import {DevProfiler} from './DevProfiler';

type QueueFilter='UNPAID'|'PAID'|'ALL';
type Props={
 orders:Order[];selected:string|null;
 onRefresh:()=>void|Promise<void>;
 onSelect:(id:string)=>void;
};
/** Self-contained order browsing: tender edits do not re-render the queue. */
export const OrderQueue=memo(function OrderQueue({orders,selected,onRefresh,onSelect}:Props){
 const [filter,setFilter]=useState<QueueFilter>('UNPAID');
 const [query,setQuery]=useState('');
 const [limit,setLimit]=useState(80);
 useEffect(()=>{setLimit(80)},[filter,query]);
 const list=useMemo(()=>{
  const needle=query.trim().toLocaleLowerCase('vi-VN');
  const actionable=(o:Order)=>o.status==='COMMITTED'&&(o.payment_status==='UNPAID'||o.payment_status==='PARTIAL');
  return orders.filter(o=>
   (filter==='ALL'||(filter==='PAID'?o.payment_status==='PAID':actionable(o)))&&
   (o.display_code.toLocaleLowerCase('vi-VN').includes(needle)||o.created_by.toLocaleLowerCase('vi-VN').includes(needle))
  ).sort((a,b)=>filter==='UNPAID'
   ?a.created_at.localeCompare(b.created_at)||a.order_id.localeCompare(b.order_id)
   :b.created_at.localeCompare(a.created_at)||b.order_id.localeCompare(a.order_id));
 },[orders,filter,query]);
 const shown=list.slice(0,limit);
 return <DevProfiler id="cashier-queue"><section className={'orders-pane '+(selected?'hide-on-small':'')}>
    <div className="panehead"><div><p className="eyebrow">ĐƠN TRONG NGÀY</p><h1>{filter==='UNPAID'?'Hàng đợi':'Đơn gần đây'} <span className="count">{list.length}</span></h1></div><button className="iconbtn" aria-label="Tải lại đơn" onClick={()=>void onRefresh()}><RefreshCcw size={18}/></button></div>
    <div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm mã đơn hoặc nhân viên" aria-label="Tìm đơn hàng"/></div>
    <div className="tabs">{([['UNPAID','Chờ thu'],['PAID','Đã thu'],['ALL','Tất cả']] as const).map(([k,l])=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)} aria-pressed={filter===k}>{l}</button>)}</div>
    <div className="orders-scroll">{list.length===0?<div className="empty"><ShoppingBag/><p>Chưa có đơn trong nhóm này</p></div>:shown.map(o=><button key={o.order_id} className={'order-tile '+(selected===o.order_id?'selected':'')} onClick={()=>onSelect(o.order_id)} aria-pressed={selected===o.order_id}><div className="orderline"><b>#{o.display_code}</b><strong>{formatVnd(o.total_vnd)}</strong></div><div className="orderline muted"><small>NV: {o.created_by} · {new Date(o.created_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'})}</small><span className={'status '+(o.payment_status==='PAID'?'paid':'pending')}>{o.status==='VOIDED'?'Đã hủy':o.payment_status==='REFUNDED'?'Đã hoàn':o.payment_status==='PARTIALLY_REFUNDED'?'Hoàn một phần':o.payment_status==='PAID'?'Đã thu':o.payment_status==='PARTIAL'?'Đã thu một phần':'Chưa thu'}</span></div><small>Khách chọn: {o.requested_payment_method==='BANK'?'Chuyển khoản':'Tiền mặt'}</small></button>)}</div>
    {list.length>shown.length&&<button type="button" className="queue-more" onClick={()=>setLimit(previous=>previous+80)}>Xem thêm {list.length-shown.length} đơn cũ</button>}
   </section></DevProfiler>;
});
