import React,{memo,useEffect,useMemo,useState} from 'react';
import {useInfiniteQuery} from '@tanstack/react-query';
import {formatVnd,type Order} from '@bmc/contracts';
import {hub,remote} from '../../api';

/** A separate React Query observer; navigating here does not refetch dashboard/sales. */
const historyKey=['owner',remote?'cloud':'hub','orders','history'] as const;

const OrderRow=memo(function OrderRow({order:o}:{order:Order}){
 return <div className="record">
  <div><b>#{o.display_code}</b><small>{new Date(o.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} · {o.created_by}</small></div>
  <div><strong>{formatVnd(o.total_vnd)}</strong>
   <span className={o.payment_status==='PAID'?'paid':'pending'}>
    {o.payment_status==='REFUNDED'?'Đã hoàn':o.payment_status==='PAID'?'Đã thu':'Chưa thu'}
   </span>
   <small>Khách chọn: {o.requested_payment_method==='BANK'?'Chuyển khoản':'Tiền mặt'}</small>
  </div>
 </div>;
});
export const OrderHistoryPage=memo(function OrderHistoryPage(){
 const [search,setSearch]=useState('');
 const [visibleLimit,setVisibleLimit]=useState(80);
 useEffect(()=>setVisibleLimit(80),[search]);
 const {data,isPending,error,fetchNextPage,hasNextPage,isFetchingNextPage,refetch}=useInfiniteQuery({
  queryKey:historyKey,
  queryFn:({pageParam})=>hub.orderHistory(pageParam||undefined),
  initialPageParam:'',
  getNextPageParam:last=>last.next_cursor??undefined,
  staleTime:15_000,
  refetchOnWindowFocus:true,
  retry:1,
 });
 const rows=useMemo(()=>{
  const used=new Set<string>();const all:Order[]=[];
  for(const page of data?.pages||[])for(const item of page.items){
   if(!used.has(item.order_id)){used.add(item.order_id);all.push(item)}
  }
  return all;
 },[data]);
 const term=search.trim().toLocaleLowerCase('vi-VN');
 const visible=useMemo(()=>term?rows.filter(x=>x.display_code.toLocaleLowerCase('vi-VN').includes(term)):rows,[rows,term]);
 const shown=visible.slice(0,visibleLimit);
 return <section className="panel" aria-label="Lịch sử đơn hàng">
  <div className="panelhead"><h2>Danh sách đơn gần đây</h2>
   <input className="search" placeholder="Tìm mã đơn" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Tìm đơn"/>
  </div>
  {isPending?<p className="muted" role="status">Đang tải lịch sử đơn…</p>:
   <div className="records">
    {shown.map(o=><OrderRow key={o.order_id} order={o}/>)}
    {visible.length>0&&<p className="history-count muted" role="status">Đang hiển thị {shown.length}/{visible.length} đơn đã tải</p>}
    {visible.length>shown.length&&<button type="button" className="secondary" onClick={()=>setVisibleLimit(n=>n+80)}>Hiện thêm {Math.min(80,visible.length-shown.length)} đơn đã tải</button>}
    {rows.length===0&&<p className="muted">Chưa có đơn hàng.</p>}
    {rows.length>0&&visible.length===0&&<p className="muted">Không tìm thấy mã đơn trong các trang đã tải.</p>}
    {hasNextPage&&<button className="primary" disabled={isFetchingNextPage} onClick={()=>void fetchNextPage()}>
     {isFetchingNextPage?'Đang tải…':'Xem thêm đơn cũ'}
    </button>}
   </div>
  }
  {error&&<div className="alert" role="alert">
   Không tải được lịch sử đơn: {error instanceof Error?error.message:'Lỗi kết nối'}
   <button className="textbutton" onClick={()=>void refetch()}>Thử lại</button>
  </div>}
 </section>;
});
