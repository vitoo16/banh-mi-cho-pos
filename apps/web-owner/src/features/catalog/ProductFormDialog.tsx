import {useEffect,useRef,useState,type KeyboardEvent,type FormEvent} from 'react';

/**
 * Accessible, UI-only dialog: focus stays in the editor and returns to the
 * triggering button on unmount. Mutation/retry state is owned outside this file.
 */
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
 const dialogRef=useRef<HTMLElement>(null);
 const nameRef=useRef<HTMLInputElement>(null);
 const priceRef=useRef<HTMLInputElement>(null);
 const [fieldError,setFieldError]=useState('');
 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!name.trim()){setFieldError('Vui lòng nhập tên món.');nameRef.current?.focus();return}
  if(!/^[0-9]+$/.test(price)||!Number.isSafeInteger(Number(price))||Number(price)>1_000_000_000){
   setFieldError('Giá phải là số nguyên VNĐ từ 0 đến 1.000.000.000.');priceRef.current?.focus();return
  }
  setFieldError('');void onSave();
 }
 useEffect(()=>{
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  nameRef.current?.focus();
  return ()=>{if(opener?.isConnected)opener.focus()};
 },[]);
 function onDialogKeyDown(event:KeyboardEvent<HTMLElement>){
  if(event.key==='Escape'){
   event.preventDefault();
   event.stopPropagation();
   onClose();
   return;
  }
  if(event.key!=='Tab')return;
  const container=dialogRef.current;
  if(!container)return;
  const focusable=Array.from(container.querySelectorAll<HTMLElement>(
   'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  )).filter(node=>node.getClientRects().length>0);
  if(!focusable.length){event.preventDefault();return}
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&(document.activeElement===first||!container.contains(document.activeElement))){
   event.preventDefault();last.focus();
  }else if(!event.shiftKey&&(document.activeElement===last||!container.contains(document.activeElement))){
   event.preventDefault();first.focus();
  }
 }
 return (<div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section ref={dialogRef} onKeyDown={onDialogKeyDown} className="modal" role="dialog" aria-modal="true" aria-label="Chỉnh sản phẩm"><form onSubmit={submit} noValidate><div className="panelhead"><h2>{editing==='new'?'Thêm món':'Chỉnh sản phẩm'}</h2><button type="button" className="close" onClick={()=>onClose()} aria-label="Đóng">×</button></div><label htmlFor="product-name">Tên món</label><input ref={nameRef} id="product-name" value={name} onChange={e=>onNameChange(e.target.value)} maxLength={120}/>{editing==='new'&&<><label htmlFor="product-category">Nhóm món</label><input id="product-category" value={category} onChange={e=>onCategoryChange(e.target.value)}/></>}{remote&&<p className="info">Yêu cầu từ xa có thể chờ tới khi POS kết nối Internet. Món mới chưa xuất hiện trên menu nhân viên trước khi POS xác nhận.</p>}<label htmlFor="product-price">Giá bán (VNĐ)</label><input ref={priceRef} id="product-price" inputMode="numeric" autoComplete="off" value={price} onChange={e=>{setFieldError('');onPriceChange(e.target.value)}} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError?'product-price-error':undefined}/><label className="checkbox"><input type="checkbox" checked={active} onChange={e=>onActiveChange(e.target.checked)}/> Đang bán</label>{fieldError&&<p id="product-price-error" className="alert" role="alert">{fieldError}</p>}{error&&<p className="alert" role="alert">{error}</p>}<button type="submit" className="primary" disabled={busy||!name.trim()||price===''}>Lưu sản phẩm</button></form></section></div>);
}
