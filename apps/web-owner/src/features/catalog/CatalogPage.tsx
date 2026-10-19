import {useMemo,useState} from 'react';
import {formatVnd,type Product} from '@bmc/contracts';
import {useCatalogQueries} from './queries';

type AvailabilityFilter='all'|'active'|'hidden';
const normalize=(value:string)=>value.toLocaleLowerCase('vi-VN').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').trim();

/** Catalog is read-only until an explicit owner edit action. Remote commands are not applied prices. */
export function CatalogPage({ownerId,remote,onBegin}:{
 ownerId:string;
 remote:boolean;
 onBegin:(product?:Product)=>void;
}){
 const {catalog:catalogQuery,commands:commandsQuery}=useCatalogQueries(ownerId);
 const catalog=catalogQuery.data;
 const remoteCommands=commandsQuery.data??[];
 const [term,setTerm]=useState('');
 const [filter,setFilter]=useState<AvailabilityFilter>('all');
 const activeCount=catalog?.products.filter(p=>p.is_active).length??0;
 const visible=useMemo(()=>{
  const needle=normalize(term);
  return (catalog?.products??[]).filter(p=>
   (filter==='all'||(filter==='active'?p.is_active:!p.is_active))&&
   (!needle||normalize(p.name).includes(needle)||normalize(p.category).includes(needle))
  );
 },[catalog,term,filter]);
 return <section className="panel owner-catalog" aria-label="Menu và giá bán">
  <div className="panelhead owner-feature-head">
   <div><p className="eyebrow">DANH MỤC CỬA HÀNG</p><h2>Menu và giá bán</h2>
    <p className="muted">{remote?'Giá được cập nhật khi POS tại tiệm nhận và xác nhận lệnh.':'Nhân viên chỉ thấy những món đang bật bán.'}</p>
   </div>
   <button type="button" className="primary" onClick={()=>onBegin()}>+ Thêm món</button>
  </div>
  {remote&&<div className="command-log" aria-label="Yêu cầu thay đổi menu từ xa">
   <h3>Lệnh cập nhật đang theo dõi</h3>
   <p className="muted">Yêu cầu chưa được POS xác nhận không có nghĩa là giá mới đã áp dụng.</p>
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
  {catalog&&<div className="catalog-tools">
   <div className="catalog-tally"><strong>{catalog.products.length} món</strong><span>{activeCount} đang bán · {catalog.products.length-activeCount} đã ẩn</span></div>
   <div className="catalog-controls">
    <label className="catalog-search-label" htmlFor="owner-catalog-search">Tìm món hoặc nhóm
     <input id="owner-catalog-search" className="search" type="search" value={term} onChange={e=>setTerm(e.target.value)} placeholder="Ví dụ: bánh mì…" />
    </label>
    <div className="catalog-filter" role="group" aria-label="Lọc trạng thái món">
     {([['all','Tất cả'],['active','Đang bán'],['hidden','Đã ẩn']] as const).map(([value,label])=>
      <button type="button" key={value} aria-pressed={filter===value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{label}</button>
     )}
    </div>
   </div>
  </div>}
  <div className="records catalog-records">
   {visible.map(p=><div className="record catalog-record" key={p.id}>
    <div><b id={"catalog-product-name-"+p.id}>{p.name}</b><small>{p.category} <span className={p.is_active?'catalog-state active':'catalog-state hidden'}>{p.is_active?'Đang bán':'Đã ẩn'}</span></small></div>
    <div className="catalog-record-side"><strong>{formatVnd(p.price_vnd)}</strong>
     <button type="button" className="textbutton" onClick={()=>onBegin(p)} aria-describedby={'catalog-product-name-'+p.id}>{remote?'Đề xuất sửa giá':'Sửa'}</button>
    </div>
   </div>)}
   {catalog?.products.length===0&&<p className="muted">Chưa có món. Hãy thêm món đầu tiên.</p>}
   {catalog&&catalog.products.length>0&&visible.length===0&&<p className="muted" role="status">Không tìm thấy món phù hợp. Thử đổi từ khóa hoặc trạng thái lọc.</p>}
  </div>
 </section>;
}
