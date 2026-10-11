/** UI-only product editor: no request creation, retry logic or session storage here. */
export function ProductFormDialog({
 editing,remote,name,category,price,active,error,busy,
 onNameChange,onCategoryChange,onPriceChange,onActiveChange,onSave,onClose,
}:{
 editing:string;
 remote:boolean;
 name:string;
 category:string;
 price:string;
 active:boolean;
 error:string;
 busy:boolean;
 onNameChange:(value:string)=>void;
 onCategoryChange:(value:string)=>void;
 onPriceChange:(value:string)=>void;
 onActiveChange:(value:boolean)=>void;
 onSave:()=>void|Promise<void>;
 onClose:()=>void;
}){
 return (<div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal" role="dialog" aria-modal="true" aria-label="Chỉnh sản phẩm"><div className="panelhead"><h2>{editing==='new'?'Thêm món':'Chỉnh sản phẩm'}</h2><button type="button" className="close" onClick={()=>onClose()} aria-label="Đóng">×</button></div><label htmlFor="product-name">Tên món</label><input id="product-name" value={name} onChange={e=>onNameChange(e.target.value)} maxLength={120}/>{editing==='new'&&<><label htmlFor="product-category">Nhóm món</label><input id="product-category" value={category} onChange={e=>onCategoryChange(e.target.value)}/></>}{remote&&<p className="info">Yêu cầu từ xa có thể chờ tới khi POS kết nối Internet. Món mới chưa xuất hiện trên menu nhân viên trước khi POS xác nhận.</p>}<label htmlFor="product-price">Giá bán (VNĐ)</label><input id="product-price" inputMode="numeric" value={price} onChange={e=>onPriceChange(e.target.value.replace(/\D/g,''))}/><label className="checkbox"><input type="checkbox" checked={active} onChange={e=>onActiveChange(e.target.checked)}/> Đang bán</label>{error&&<p className="alert" role="alert">{error}</p>}<button className="primary" disabled={busy||!name.trim()||price===''} onClick={()=>void onSave()}>Lưu sản phẩm</button></section></div>);
}
