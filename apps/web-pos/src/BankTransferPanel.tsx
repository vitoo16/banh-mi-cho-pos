import {memo} from 'react';
import {formatVnd} from '@bmc/contracts';
import {Clock} from 'lucide-react';

export type BankIntent={reference:string;amount_vnd:number;account_number:string;bank_code:string;status:string};
type Props={
 intent:BankIntent|null;qrImageUrl:string|null;qrFailed:boolean;
 busy:boolean;online:boolean;
 onImageError:()=>void;onCreate:()=>void;onCash:()=>void;
};
/** A pending bank intent is never evidence of verified payment.
 * QR loads from an external service and must always have a manual fallback.
 */
export const BankTransferPanel=memo(function BankTransferPanel({
 intent,qrImageUrl,qrFailed,busy,online,onImageError,onCreate,onCash
}:Props){
 return <section className="bank-panel" aria-label="Hướng dẫn chuyển khoản">
  <Clock size={24} aria-hidden="true"/><h3>{intent?'Đang chờ xác nhận ngân hàng':'Chuyển khoản'}</h3>
  {intent?<><p>Ngân hàng: <b>{intent.bank_code}</b></p>
   <p>Tài khoản nhận: <b>{intent.account_number}</b></p>
   <p>Số tiền chính xác: <b>{formatVnd(intent.amount_vnd)}</b></p>
   <p>Nội dung chuyển khoản: <b>{intent.reference}</b></p>
   {qrImageUrl&&!qrFailed?
    <div className="vietqr-block"><img src={qrImageUrl}
      alt={'VietQR chuyển khoản '+formatVnd(intent.amount_vnd)+' với mã '+intent.reference}
      width={256} height={256} decoding="async" referrerPolicy="no-referrer"
      onError={onImageError}/>
     <small>Khách quét bằng ứng dụng ngân hàng. Kiểm tra lại tài khoản nhận và số tiền.</small>
    </div>
    :<p className="vietqr-fallback" role="status">Không tải được QR hoặc ngân hàng chưa hỗ trợ định dạng mã hiện tại. Thu ngân hướng dẫn khách nhập chính xác thông tin chuyển khoản ở trên.</p>}
   <p className="hint">QR chỉ giúp điền thông tin, không phải xác nhận khách đã chuyển tiền. Chỉ đánh dấu đã thanh toán khi hệ thống nhận sự kiện giao dịch đã xác minh. Không nhận ảnh chụp làm bằng chứng tự động.</p>
  </>:<p>Hệ thống chỉ tạo mã tham chiếu khi bộ xác minh giao dịch ngân hàng đã được cấu hình. Không được coi lựa chọn của nhân viên là đã thanh toán.</p>}
  {!online&&<p className="hint" role="status">Không kết nối được Store Hub. Chưa thể tạo hoặc kiểm tra yêu cầu chuyển khoản.</p>}
  <button type="button" className="secondary" disabled={busy||!online} onClick={onCreate}>
   {busy?'Đang tạo…':intent?'Kiểm tra thông tin':'Tạo yêu cầu chuyển khoản'}
  </button>
  <button type="button" className="secondary" onClick={onCash}>Thu tiền mặt thay thế</button>
 </section>;
});
