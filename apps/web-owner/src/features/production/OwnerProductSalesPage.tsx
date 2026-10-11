import React,{memo,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {formatVnd,salesWindow,todayInVietnam,type SalesPeriod} from '@bmc/contracts';
import {hub,remote} from '../../api';

/** Each production slice observes the same (period, shop-local date) response. */
const salesOptions=(period:SalesPeriod,date:string)=>({
 queryKey:['owner','product-sales',period,date],
 queryFn:()=>hub.ownerProductSales(period,date),
 refetchInterval:10_000,
 staleTime:4_000,
});
const fmt=(x:number|undefined)=>new Intl.NumberFormat('vi-VN').format(x??0);
function ErrorMessage({error}:{error:unknown}){return <p className="alert" role="alert">{error instanceof Error?error.message:'Không tải được dữ liệu. Thử tải lại.'}</p>}

type FilterProps={period:SalesPeriod;date:string};
const SalesOverview=memo(function SalesOverview({period,date}:FilterProps){
 const {data,isPending,error,isFetching}=useQuery({...salesOptions(period,date),
  select:r=>({label:r.label,total_orders:r.total_orders,paid_orders:r.paid_orders,
   voided_orders:r.voided_orders,pending_orders:r.pending_orders,refunded_orders:r.refunded_orders,
   total_units_sold:r.total_units_sold,gross_vnd:r.gross_vnd})});
 return <section className="panel sales-summary" aria-label="Tổng hợp kỳ báo cáo">
  <div className="panelhead"><div><h2>Tổng hợp kỳ báo cáo</h2><p className="muted">{data?.label||salesWindow(period,date).label} · giờ Việt Nam (UTC+7)</p></div>
   {isFetching&&<span className="muted" role="status">Đang cập nhật…</span>}</div>
  {isPending?<p role="status">Đang tải báo cáo…</p>:<div className="sales-stats">
   <div><small>Đơn tạo trong kỳ</small><strong>{fmt(data?.total_orders)}</strong></div>
   <div><small>Số bánh đã bán</small><strong>{fmt(data?.total_units_sold)}</strong></div>
   <div><small>Đơn đã thu</small><strong>{fmt(data?.paid_orders)}</strong></div>
   <div><small>Đơn chưa thu / hủy / hoàn</small><strong>{fmt(data?.pending_orders)} / {fmt(data?.voided_orders)} / {fmt(data?.refunded_orders)}</strong></div>
  </div>}
  {error&&<ErrorMessage error={error}/>}
 </section>
});
const CategoryBreakdown=memo(function CategoryBreakdown({period,date}:FilterProps){
 const {data,isPending,error}=useQuery({...salesOptions(period,date),select:r=>r.categories});
 return <section className="panel" aria-label="Bánh bán theo nhóm"><h2>Theo nhóm bánh</h2>
  {isPending?<p>Đang tải…</p>:!data?.length?<p className="muted">Chưa có bánh nào được thanh toán trong kỳ.</p>:
   <div className="records">{data.map(row=><div className="record" key={row.category}><div><b>{row.category}</b><small>{formatVnd(row.gross_vnd)} · Giá trị đơn đã thu</small></div><strong>{fmt(row.units_sold)} bánh</strong></div>)}</div>}
  {error&&<ErrorMessage error={error}/>}
 </section>
});
const ProductBreakdown=memo(function ProductBreakdown({period,date}:FilterProps){
 const {data,isPending,error}=useQuery({...salesOptions(period,date),select:r=>r.products});
 return <section className="panel" aria-label="Số lượng bán theo từng món"><h2>Chi tiết từng loại bánh</h2>
  {isPending?<p>Đang tải…</p>:!data?.length?<p className="muted">Chưa có sản lượng trong kỳ đã chọn.</p>:
  <div className="records">{data.map(row=><div className="record" key={row.product_id}><div><b>{row.name}</b><small>{row.category} · {formatVnd(row.gross_vnd)} doanh số ghi nhận</small></div><strong>{fmt(row.units_sold)} bánh</strong></div>)}</div>}
  {error&&<ErrorMessage error={error}/>}
 </section>
});
const periods:readonly [SalesPeriod,string][]=[
 ['day','Ngày'],['week','Tuần'],['month','Tháng'],['quarter','Quý'],['year','Năm'],
];
export const OwnerProductSalesPage=memo(function OwnerProductSalesPage(){
 const [period,setPeriod]=useState<SalesPeriod>('day'),[date,setDate]=useState(todayInVietnam);
 const qc=useQueryClient();
 return <div className="analytics-page">
  <section className="panel analytics-filter"><h2>Thống kê số bánh đã bán</h2>
   <p className="muted">Dùng số liệu đã thu tiền để điều chỉnh kế hoạch chuẩn bị bánh, không phải số lượng tồn kho.</p>
   <div className="analytics-controls"><div className="period-selector" role="group" aria-label="Xem theo kỳ">
    {periods.map(([value,title])=><button type="button" key={value} className={period===value?'active':''} aria-pressed={period===value} onClick={()=>setPeriod(value)}>{title}</button>)}
   </div><label className="analytics-date">Chọn ngày tham chiếu <input type="date" value={date} min="2000-01-01" max="2100-12-31" onChange={e=>{if(e.target.value)setDate(e.target.value)}}/></label>
   <button className="textbutton" onClick={()=>void qc.invalidateQueries({queryKey:['owner','product-sales',period,date]})}>Làm mới báo cáo</button></div>
  </section>
  <SalesOverview period={period} date={date}/>
  <div className="sales-columns"><CategoryBreakdown period={period} date={date}/><ProductBreakdown period={period} date={date}/></div>
  <p className="disclaimer">Số bánh bán = tổng số lượng trong đơn đã thu đủ, theo ngày tạo đơn (giờ Việt Nam). Không tính đơn hủy, chưa thu hoặc đã hoàn toàn bộ. Đơn hoàn không đồng nghĩa có thể hoàn nguyên bánh đã chế biến. {remote?'Cloud có thể trễ đồng bộ.':''}</p>
 </div>
});
