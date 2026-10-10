/** Crash-safe cashier cash capture intent. No PIN, token or customer notes are stored. */
export interface PendingCashCapture{
 key:string;
 cashier_id:string;
 order_id:string;
 shift_id:string;
 cash_tendered_vnd:number;
 expected_order_version:number;
 created_at:number;
}
export const pendingCashStorageKey='bmc_pos_cash_capture_pending_v1';
type Reader=Pick<Storage,'getItem'>;
type Writer=Reader&Pick<Storage,'setItem'>;
type Cleaner=Reader&Pick<Storage,'removeItem'>;
function safeString(v:unknown,min=1){return typeof v==='string'&&v.length>=min&&v.length<=180}
function validate(v:unknown):v is PendingCashCapture{
 if(!v||typeof v!=='object')return false;
 const x=v as Record<string,unknown>;
 return safeString(x.key,8)&&safeString(x.cashier_id)&&safeString(x.order_id)&&safeString(x.shift_id)
  &&Number.isSafeInteger(x.cash_tendered_vnd)&&Number(x.cash_tendered_vnd)>0&&Number(x.cash_tendered_vnd)<=1_000_000_000
  &&Number.isSafeInteger(x.expected_order_version)&&Number(x.expected_order_version)>0
  &&Number.isSafeInteger(x.created_at)&&Number(x.created_at)>0;
}
export function readPendingCash(store:Reader):PendingCashCapture|null{
 const raw=store.getItem(pendingCashStorageKey);
 if(raw===null)return null;
 try{
  const parsed=JSON.parse(raw) as unknown;
  if(validate(parsed))return parsed;
 }catch{/* fail closed */}
 throw new Error('Yêu cầu thu tiền chưa xác nhận trên máy bị hỏng. Không tạo lần thu mới; cần đối chiếu sổ tại POS.');
}
export function stagePendingCash(store:Writer,record:PendingCashCapture){
 if(!validate(record))throw new Error('Yêu cầu thu tiền không hợp lệ');
 const prev=readPendingCash(store);
 if(prev&&prev.key!==record.key)throw new Error('Có lần thu tiền chưa rõ kết quả. Phải kiểm tra và giải quyết trước.');
 if(prev&&JSON.stringify(prev)!==JSON.stringify(record))throw new Error('Không được thay đổi yêu cầu đã gửi với cùng mã chống trùng');
 store.setItem(pendingCashStorageKey,JSON.stringify(record)); // MUST succeed before any capture HTTP call
}
export function clearPendingCash(store:Cleaner,key:string){
 const prev=readPendingCash(store);
 if(prev&&prev.key!==key)throw new Error('Không thể xóa một yêu cầu thu tiền khác');
 store.removeItem(pendingCashStorageKey);
}
