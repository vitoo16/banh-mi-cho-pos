import {memo} from 'react';
import {type ReceiptCopy} from '@bmc/contracts';
import {Printer} from 'lucide-react';

type Props={copies:ReceiptCopy[];busy:boolean;checking:boolean;
 onRefresh:()=>void;onReprint:(copy:ReceiptCopy)=>void};
/** Only the physical printer can establish whether paper was produced.
 * 'SENT' is not 'printed', and 'UNKNOWN' must not be auto-reprinted.
 */
export const ReceiptStatusPanel=memo(function ReceiptStatusPanel({
 copies,busy,checking,onRefresh,onReprint
}:Props){
 return <section className="receipt-section" aria-label="Trạng thái biên nhận">
  <div className="section-title"><h2>Hai liên biên nhận</h2>
   <button type="button" className="ghost" disabled={checking} onClick={onRefresh}>{checking?'Đang kiểm tra…':'Kiểm tra'}</button>
  </div>
  {copies.length===0?
   <button type="button" className="secondary" disabled={checking} onClick={onRefresh}>
    {checking?'Đang kiểm tra…':'Xem trạng thái in'}
   </button>:
   copies.map(copy=><div className="receipt-row" key={copy.id}>
    <div><Printer size={18} aria-hidden="true"/><b>{copy.kind==='CUSTOMER'?'Liên khách':'Liên tiệm'}</b></div>
    <small>{copy.status==='WAITING_FOR_PRINTER'?'Đang chờ máy in':
     copy.status==='UNKNOWN'?'Chưa rõ giấy đã ra — kiểm tra trước khi in lại':
     copy.status==='SENT'?'Đã gửi dữ liệu, chưa xác nhận giấy':'Trạng thái '+copy.status}</small>
    <button type="button" onClick={()=>onReprint(copy)}
     disabled={busy||checking||copy.status==='WAITING_FOR_PRINTER'}>
     Yêu cầu in lại
    </button>
   </div>)}
  <p className="hint">Hệ thống gửi ESC/POS khi máy in được cấu hình. Trạng thái SENT chỉ là gửi dữ liệu, không chứng minh giấy đã ra; liên UNKNOWN cần kiểm tra thủ công.</p>
 </section>;
});
