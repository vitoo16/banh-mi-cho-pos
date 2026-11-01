import React,{memo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {formatVnd} from '@bmc/contracts';
import {hub,remote} from '../api';
import {summaryOptions} from '../features/finance/queries';
import {useShopToday} from '../app/useShopToday';
import {DevProfiler} from '../app/DevProfiler';

const fmt=(x:number|undefined)=>new Intl.NumberFormat('vi-VN').format(x??0);
function ErrorMessage({error}:{error:unknown}){return <p className="alert" role="alert">{error instanceof Error?error.message:'Không tải được dữ liệu. Thử tải lại.'}</p>}
const RevenueCard=memo(function RevenueCard(){
 const {data,isPending,error}=useQuery({...summaryOptions(),select:r=>r.net_revenue_vnd});
 return <div className="kpi"><span>DOANH THU ĐÃ XÁC NHẬN</span><strong>{isPending?'…':formatVnd(data??0)}</strong><small>{error?'Không cập nhật được':'Tổng đơn đã thu đủ; chưa trừ chi phí'}</small></div>
});
const CashCard=memo(function CashCard(){
 const {data,isPending,error}=useQuery({...summaryOptions(),select:r=>r.cash_vnd});
 return <div className="kpi"><span>TIỀN MẶT ĐÃ THU</span><strong>{isPending?'…':formatVnd(data??0)}</strong><small>{error?'Dữ liệu tạm thời gián đoạn':'Không gồm tiền quỹ đầu ca'}</small></div>
});
export const TodayOrdersCard=memo(function TodayOrdersCard({onOpen}:{onOpen:()=>void}){
 const shopDate=useShopToday();
 const {data,isPending,error}=useQuery({queryKey:['owner','orders-today',shopDate],queryFn:()=>hub.ownerTodayCounts(),refetchInterval:10_000,staleTime:4_000});
 return <div className="kpi hero"><span>TỔNG SỐ ĐƠN HÔM NAY</span><strong aria-label="Tổng số đơn hôm nay">{isPending?'…':fmt(data?.total_orders)}</strong><small>Ngày {shopDate.slice(8,10)}/{shopDate.slice(5,7)}/{shopDate.slice(0,4)} · Bao gồm đơn chưa thu và đã hủy; {fmt(data?.paid_orders)} đơn đã thu</small><button className="textbutton analytics-link" onClick={onOpen}>Xem số bánh bán theo loại →</button>{error&&<small role="alert">Không cập nhật được số đơn</small>}</div>
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
  <section className="kpis analytics-kpis">
   <DevProfiler id="today-orders"><TodayOrdersCard onOpen={onOpenSales}/></DevProfiler>
   <DevProfiler id="revenue"><RevenueCard/></DevProfiler>
   <DevProfiler id="cash"><CashCard/></DevProfiler>
   <DevProfiler id="paid-orders"><PaidOrdersCard/></DevProfiler>
  </section>
  <div className="twocol"><PaymentBreakdown/><CurrentShift/></div>
  <p className="disclaimer">{remote?'Dữ liệu Cloud có thể cập nhật chậm khi tiệm mất mạng. ':''}Báo cáo bán hàng dựa trên đơn đã thu tiền; không tự suy ra lợi nhuận hay tồn kho.</p>
 </>
});
