import {formatVnd,type Product} from '@bmc/contracts';
import {useCatalogQueries} from './queries';

/** Pure Owner catalog display. Mutation and idempotency remain in the controller. */
export function CatalogPage({ownerId,remote,onBegin}:{
 ownerId:string;
 remote:boolean;
 onBegin:(product?:Product)=>void;
}){
 const {catalog:catalogQuery,commands:commandsQuery}=useCatalogQueries(ownerId);
 const catalog=catalogQuery.data;
 const remoteCommands=commandsQuery.data??[];
 return (<section className="panel"><div className="panelhead"><div><h2>Menu và giá bán</h2><p className="muted">{remote?'Giá được cập nhật khi POS nhận và kiểm tra lệnh.':'Nhân viên chỉ thấy món đang bật bán.'}</p></div><button className="primary" onClick={()=>onBegin()}>+ Thêm món</button></div>{remote&&<div className="command-log" aria-label="Yêu cầu thay đổi menu từ xa">
  <h3>Yêu cầu thay đổi menu từ xa</h3>
  <p className="muted">Các thay đổi đang chờ POS tại tiệm áp dụng. Mất kết nối Cloud không ảnh hưởng đơn hàng tiền mặt.</p>
  {remoteCommands.slice(0,8).map(cmd=><div className="command-row" key={cmd.id}>
   <div><strong>{cmd.operation==='CREATE'?'Thêm món: ':''}{cmd.name}</strong><small>{formatVnd(cmd.price_vnd)} · {new Date(cmd.created_at).toLocaleString('vi-VN')}</small></div>
   <span className={cmd.status==='APPLIED'?'command-applied':cmd.status==='CONFLICT'?'command-conflict':'command-pending'}>
    {cmd.status==='APPLIED'?'POS đã áp dụng':cmd.status==='CONFLICT'?'Xung đột giá — cần xem lại':'Đang chờ POS'}
   </span>
  </div>)}
  {!commandsQuery.isPending&&!commandsQuery.isError&&remoteCommands.length===0&&<p className="muted">Chưa có yêu cầu chỉnh giá từ xa.</p>}
 </div>}
 {catalogQuery.isPending&&<p role="status" className="muted">Đang tải menu…</p>}
 {catalogQuery.isError&&<div role="alert" className="alert">Không tải được menu. <button type="button" className="textbutton" onClick={()=>void catalogQuery.refetch()}>Thử lại menu</button></div>}
 {remote&&commandsQuery.isPending&&<p role="status" className="muted">Đang tải yêu cầu menu…</p>}
 {remote&&commandsQuery.isError&&<div role="alert" className="alert">Không tải được trạng thái lệnh. <button type="button" className="textbutton" onClick={()=>void commandsQuery.refetch()}>Thử lại lệnh</button></div>}
 <div className="records">{catalog?.products.map(p=><div className="record" key={p.id}><div><b>{p.name}</b><small>{p.category} · {p.is_active?'Đang bán':'Đã ẩn'}</small></div><div><strong>{formatVnd(p.price_vnd)}</strong><button className="textbutton" onClick={()=>onBegin(p)}>{remote?'Đề xuất sửa giá':'Sửa'}</button></div></div>)}{catalog?.products.length===0&&<p className="muted">Chưa có món. Hãy thêm món đầu tiên.</p>}</div></section>);
}
