import {formatVnd} from '@bmc/contracts';
import {useQuery} from '@tanstack/react-query';
import {summaryOptions,useBankExceptions} from './queries';

export type BankExceptionRow={
 provider_tx_id:string;
 reference:string;
 amount_vnd:number;
 reason:string;
 received_at:string;
};

/**
 * These finance cards only observe server-confirmed data.
 * A bank request/intention is never a PAID confirmation.
 */
export function ShiftLedger(){
 const {data:shift,isPending,isError,refetch}=useQuery({...summaryOptions(),select:r=>r.shift});
 return <section className="panel"><h2>Sổ quỹ hiện tại</h2>
  {isPending?<p className="muted" role="status">Đang tải sổ quỹ…</p>:
   shift?<><div className="metricrow"><span>Quỹ đầu ca</span><b>{formatVnd(shift.opening_float_vnd)}</b></div>
    <div className="metricrow"><span>Tiền phải có</span><b>{formatVnd(shift.expected_cash_vnd)}</b></div></>:
    !isError&&<p className="muted">Thu ngân chưa mở ca.</p>}
  {isError&&<p className="alert" role="alert">Không cập nhật được sổ quỹ. <button type="button" className="textbutton" onClick={()=>void refetch()}>Thử lại sổ quỹ</button></p>}
 </section>;
}
export function BankExceptions({ownerId,remote}:{ownerId:string;remote:boolean}){
 const {data:report,isPending:summaryPending,isError:summaryError,refetch:retrySummary}=useQuery({
  ...summaryOptions(),
  select:r=>({bank_pending:r.bank_pending,unallocated_bank_vnd:r.unallocated_bank_vnd,bank_conflict_orders:r.bank_conflict_orders}),
 });
 const {data:exceptions,isPending:exceptionsPending,isError:exceptionsError,refetch:retryExceptions}=useBankExceptions(ownerId);
 return <section className="panel"><h2>Đối soát ngân hàng</h2>
  <p className="muted">Chỉ xác nhận theo sự kiện đã ký từ bộ xác minh giao dịch đáng tin cậy. Không nhận ảnh chụp.</p>
  {summaryPending?<p className="muted" role="status">Đang tải tình trạng ngân hàng…</p>:
   report&&<div className="info">Chờ xác minh: {report.bank_pending||0} đơn yêu cầu chuyển khoản.</div>}
  {summaryError&&<p className="alert" role="alert">Không cập nhật được tình trạng ngân hàng. <button type="button" className="textbutton" onClick={()=>void retrySummary()}>Thử lại tình trạng</button></p>}
  {remote&&Boolean(report?.unallocated_bank_vnd)&&<div className="alert" role="alert"><strong>Phát hiện thu cả tiền mặt và chuyển khoản</strong>
   <p>{report?.bank_conflict_orders||0} đơn · {formatVnd(report?.unallocated_bank_vnd||0)} tiền ngân hàng đang chờ xử lý. Khoản này được loại khỏi doanh thu chuyển khoản để không tính hai lần.</p>
   <p>Đối chiếu giao dịch thật và hoàn/điều chỉnh có xác nhận; không tự xóa chứng từ.</p>
  </div>}
  <h3>Giao dịch ngoại lệ {exceptions?('('+exceptions.length+')'):''}</h3>
  {exceptionsPending?<p className="muted" role="status">Đang tải giao dịch ngoại lệ…</p>:
   exceptions?.length===0?<p className="muted">Chưa phát hiện giao dịch ngân hàng bất thường.</p>:
   exceptions?.map(x=><div className="record" key={x.provider_tx_id}><div><b>{x.reference}</b>
    <small>{x.reason} · {new Date(x.received_at).toLocaleString('vi-VN')}</small></div><strong>{formatVnd(x.amount_vnd)}</strong></div>)}
  {exceptionsError&&<p className="alert" role="alert">Không tải được giao dịch ngoại lệ. Không thể kết luận chưa có ngoại lệ. <button type="button" className="textbutton" onClick={()=>void retryExceptions()}>Thử lại giao dịch</button></p>}
 </section>;
}
export function FinanceLastSynced(){
 const {data,isPending}=useQuery({...summaryOptions(),select:r=>r.last_synced_at});
 return <p className="muted" role="status">Cập nhật: {isPending?'Đang tải…':data?new Date(data).toLocaleTimeString('vi-VN'):'Chưa đồng bộ'}</p>;
}
export function FinancePage({ownerId,remote}:{ownerId:string;remote:boolean}){
 return <div className="finance-page"><div className="finance-intro"><div><p className="eyebrow">SỐ LIỆU ĐÃ XÁC MINH</p><h2>Tiền tại quầy và đối soát</h2></div><FinanceLastSynced/></div><div className="twocol finance-columns">
  <ShiftLedger/>
  <BankExceptions ownerId={ownerId} remote={remote}/>
 </div></div>;
}
