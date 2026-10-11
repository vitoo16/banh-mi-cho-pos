import {formatVnd,type Summary} from '@bmc/contracts';

export type BankExceptionRow={
 provider_tx_id:string;
 reference:string;
 amount_vnd:number;
 reason:string;
 received_at:string;
};

/** Finance is read-only: neither child may write paid status or issue settlement. */
export function ShiftLedger({report}:{report:Summary|null}){
 return (<section className="panel"><h2>Sổ quỹ hiện tại</h2>{report?.shift?<><div className="metricrow"><span>Quỹ đầu ca</span><b>{formatVnd(report.shift.opening_float_vnd)}</b></div><div className="metricrow"><span>Tiền phải có</span><b>{formatVnd(report.shift.expected_cash_vnd)}</b></div></>:<p className="muted">Thu ngân chưa mở ca.</p>}</section>);
}
export function BankExceptions({report,remote,exceptions}:{
 report:Summary|null;
 remote:boolean;
 exceptions:BankExceptionRow[];
}){
 return (<section className="panel"><h2>Đối soát ngân hàng</h2><p className="muted">Chỉ xác nhận theo sự kiện đã ký từ bộ xác minh giao dịch đáng tin cậy. Không nhận ảnh chụp.</p><div className="info">Chờ xác minh: {report?.bank_pending||0} đơn yêu cầu chuyển khoản.</div>{remote&&Boolean(report?.unallocated_bank_vnd)&&<div className="alert" role="alert"><strong>Phát hiện thu cả tiền mặt và chuyển khoản</strong><p>{report?.bank_conflict_orders||0} đơn · {formatVnd(report?.unallocated_bank_vnd||0)} tiền ngân hàng đang chờ xử lý. Khoản này được loại khỏi doanh thu chuyển khoản để không tính hai lần.</p><p>Đối chiếu giao dịch thật và hoàn/điều chỉnh có xác nhận; không tự xóa chứng từ.</p></div>}<h3>Giao dịch ngoại lệ ({exceptions.length})</h3>{exceptions.length===0?<p className="muted">Chưa phát hiện giao dịch ngân hàng bất thường.</p>:exceptions.map(x=><div className="record" key={x.provider_tx_id}><div><b>{x.reference}</b><small>{x.reason} · {new Date(x.received_at).toLocaleString('vi-VN')}</small></div><strong>{formatVnd(x.amount_vnd)}</strong></div>)}</section>);
}
export function FinancePage({report,remote,exceptions}:{
 report:Summary|null;
 remote:boolean;
 exceptions:BankExceptionRow[];
}){
 return <div className="twocol">
  <ShiftLedger report={report}/>
  <BankExceptions report={report} remote={remote} exceptions={exceptions}/>
 </div>;
}
