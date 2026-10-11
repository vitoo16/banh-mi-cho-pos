import React,{memo,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {formatVnd,salesWindow,todayInVietnam,type SalesPeriod} from '@bmc/contracts';
import {hub,remote} from '../api';
import {summaryOptions} from '../features/finance/queries';

const salesOptions=(period:SalesPeriod,date:string)=>({
 queryKey:['owner','product-sales',period,date],queryFn:()=>hub.ownerProductSales(period,date),
 refetchInterval:10_000,staleTime:4_000,
});
const fmt=(x:number|undefined)=>new Intl.NumberFormat('vi-VN').format(x??0);
function ErrorMessage({error}:{error:unknown}){return <p className="alert" role="alert">{error instanceof Error?error.message:'Không tải được dữ liệu. Thử tải lại.'}</p>}
const RevenueCard=memo(function RevenueCard(){
 const {data,isPending,error}=useQuery({...summaryOptions(),select:r=>r.net_revenue_vnd});
 return <div className="kpi hero"><span>DOANH THU ĐÃ XÁC NHẬN</span><strong>{isPending?'…':formatVnd(data??0)}</strong><small>{error?'Không cập nhật được':'Tổng đơn đã thu đủ; chưa trừ chi phí'}</small></div>
});
const CashCard=memo(function CashCard(){
 const {data,isPending,error}=useQuery({...summaryOptions(),select:r=>r.cash_vnd});
 return <div className="kpi"><span>TIỀN MẶT ĐÃ THU</span><strong>{isPending?'…':formatVnd(data??0)}</strong><small>{error?'Dữ liệu tạm thời gián đoạn':'Không gồm tiền quỹ đầu ca'}</small></div>
});
export const TodayOrdersCard=memo(function TodayOrdersCard({onOpen}:{onOpen:()=>void}){
 const {data,isPending,error}=useQuery({queryKey:['owner','orders-today'],queryFn:()=>hub.ownerTodayCounts(),refetchInterval:10_000,staleTime:4_000});
 return <div className="kpi"><span>TỔNG SỐ ĐƠN HÔM NAY</span><strong aria-label="Tổng số đơn hôm nay">{isPending?'…':fmt(data?.total_orders)}</strong><small>Bao gồm đơn chưa thu và đã hủy; {fmt(data?.paid_orders)} đơn đã thu</small><button className="textbutton analytics-link" onClick={onOpen}>Xem số bánh bán theo loại →</button>{error&&<small role="alert">Không cập nhật được số đơn</small>}</div>
});
const PaidOrdersCard=memo(function PaidOrdersCard(){
 const {data,isPending}=useQuery({...summaryOptions(),select:r=>r.paid_orders});
 return <div className="kpi"><span>ĐƠN ĐÃ THU (LŨY KẾ)</span><strong>{isPending?'…':fmt(data)}</strong><small>Tổng đơn hoàn tất trong hệ thống</small></div>
});
const PaymentBreakdown=memo(function PaymentBreakdown(){
 const {data,error}=useQuery({...summaryOptions(),select:r=>({
  cash:r.cash_vnd,bank:r.bank_vnd,pending:r.pending_orders,bankPending:r.bank_pending,
 })});
 return <section className="panel"><h2>Tình trạng tiền</h2>
  <div className="metricrow"><span>Thu tiền mặt</span><b>{formatVnd(data?.cash??0)}</b></div>
  <div className="metricrow"><span>Chuyển khoản xác nhận</span><b>{formatVnd(data?.bank??0)}</b></div>
  <div className="metricrow"><span>Đơn chưa thanh toán</span><b>{fmt(data?.pending)}</b></div>
  <div className="metricrow"><span>Chờ chuyển khoản</span><b>{fmt(data?.bankPending)}</b></div>
  {error&&<ErrorMessage error={error}/>}
 </section>
});
const CurrentShift=memo(function CurrentShift(){
 const {data,error}=useQuery({...summaryOptions(),select:r=>r.shift});
 return <section className="panel"><h2>Ca hiện tại</h2>{data?
  <><div className="metricrow"><span>Thu ngân</span><b>{data.cashier_id}</b></div>
  <div className="metricrow"><span>Tiền lẻ đầu ca</span><b>{formatVnd(data.opening_float_vnd)}</b></div>
  <div className="metricrow"><span>Tiền phải có trong két</span><b>{formatVnd(data.expected_cash_vnd)}</b></div></>:
  <p className="muted">Chưa có ca thu ngân mở.</p>}
  {error&&<ErrorMessage error={error}/>}
 </section>
});
export const OwnerDashboard=memo(function OwnerDashboard({onOpenSales}:{onOpenSales:()=>void}){
 return <>
  <section className="kpis analytics-kpis"><RevenueCard/><CashCard/><TodayOrdersCard onOpen={onOpenSales}/><PaidOrdersCard/></section>
  <div className="twocol"><PaymentBreakdown/><CurrentShift/></div>
  <p className="disclaimer">{remote?'Dữ liệu Cloud có thể cập nhật chậm khi tiệm mất mạng. ':''}Báo cáo bán hàng dựa trên đơn đã thu tiền; không tự suy ra lợi nhuận hay tồn kho.</p>
 </>
});

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
