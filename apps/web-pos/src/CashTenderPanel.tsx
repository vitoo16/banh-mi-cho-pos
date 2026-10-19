import {memo} from 'react';
import {formatVnd} from '@bmc/contracts';
type Props={
 due:number;tender:string;cashGiven:number;
 onTender:(value:string)=>void;onSettle:()=>void;
 busy:boolean;online:boolean;shiftOpen:boolean;pendingCash:boolean;
};
/** Tender is never a verified capture until the Hub responds. */
export const CashTenderPanel=memo(function CashTenderPanel({
 due,tender,cashGiven,onTender,onSettle,busy,online,shiftOpen,pendingCash
}:Props){
 return <div className="cash-panel"><div className="cash-entry">
  <label htmlFor="tender">Khách đưa (VNĐ)</label>
  <input id="tender" name="cash_tendered_vnd" inputMode="numeric" autoComplete="off"
   className="tender" value={tender} onChange={e=>onTender(e.target.value)} placeholder="0"
   aria-describedby="cash-due-hint"/>
  <p id="cash-due-hint" className="hint">Số cần thu: {formatVnd(due)}. Chỉ xác nhận sau khi đã nhận đủ tiền.</p>
  <div className="denominations">{[50000,100000,200000,500000].map(n=>
   <button type="button" key={n} onClick={()=>onTender(String(n))}>{n/1000}k</button>)}</div>
  </div><div className="cash-confirm">
  <div className="change"><span>{cashGiven>=due?'TIỀN THỐI':'CÒN THIẾU'}</span>
   <strong className={cashGiven<due?'negative':''}>{formatVnd(Math.abs(cashGiven-due))}</strong></div>
  <button type="button" className="primary full big" disabled={busy||!online||!shiftOpen||cashGiven<due||pendingCash}
   onClick={onSettle}>{busy?'Đang xử lý…':'Xác nhận đã nhận tiền'}</button>
  {!shiftOpen&&<p className="hint">Cần mở ca trước khi thu tiền mặt.</p>}
  </div>
 </div>;
});
