import type {Catalog} from '@bmc/contracts';
import {hub,newKey,remote} from '../../api';
import {queryClient} from '../../app/queryClient';
import {catalogKey} from './queries';
import {catalogRetryStorageKey,readCatalogRetry} from './catalog-retry';

export type CatalogChangeInput={
 target:string;
 name:string;
 category:string;
 price:string;
 active:boolean;
 ownerId:string;
};

/**
 * OR-03: One operator-requested write. No automatic mutation retries.
 * Store the exact original payload + idempotency key BEFORE the first write:
 * a timeout may mean the server committed even though the client saw no ACK.
 * Cloud commands stay PENDING until Hub confirms them, never optimistic APPLIED.
 */
export async function submitCatalogChange(input:CatalogChangeInput):Promise<string>{
 const draft={remote,target:input.target,name:input.name.trim(),category:input.category.trim(),
  price_vnd:Number(input.price),is_active:input.active};
 if(!draft.name||!Number.isSafeInteger(draft.price_vnd)||
  draft.price_vnd<0||draft.price_vnd>1_000_000_000||
  (input.target==='new'&&(!draft.category||draft.category.length>80)))
  throw new Error('Kiểm tra tên, nhóm và giá bán (số nguyên VNĐ) trước khi gửi');
 const prior=readCatalogRetry();
 if(prior&&JSON.stringify(prior.draft)!==JSON.stringify(draft))
  throw new Error('Còn yêu cầu menu chưa xác nhận với nội dung khác. Hãy khôi phục và gửi lại yêu cầu cũ, không tạo mã mới.');
 let payload=prior?.payload;
 if(!payload){
  payload=input.target==='new'
   ?{name:draft.name,category:draft.category,price_vnd:draft.price_vnd,is_active:input.active}
   :{name:draft.name,price_vnd:draft.price_vnd,is_active:input.active};
  if(remote&&input.target!=='new'){
   const product=queryClient.getQueryData<Catalog>(catalogKey(input.ownerId))?.products.find(p=>p.id===input.target);
   if(!product)throw new Error('Giá gốc chưa được tải; vui lòng tải lại menu');
   payload.expected_price_vnd=product.price_vnd;
  }
 }
 const stableKey=prior?.key||newKey();
 if(!prior)sessionStorage.setItem(catalogRetryStorageKey,JSON.stringify({draft,payload,key:stableKey}));
 // Reuse exact JSON + key even if the original response was lost.
 if(remote){
  if(input.target==='new')await hub.queueRemoteProductCreate(payload as {name:string;category:string;price_vnd:number;is_active:boolean},stableKey);
  else await hub.queueRemoteProductUpdate(input.target,payload as {name:string;price_vnd:number;is_active:boolean;expected_price_vnd:number},stableKey);
 }else{
  if(input.target==='new')await hub.request('/v1/owner/products',{method:'POST',body:JSON.stringify(payload)},stableKey);
  else await hub.updateProduct(input.target,payload,stableKey);
 }
 // Removal is only after a confirmed ACK. Other HTTP/network failures keep it.
 sessionStorage.removeItem(catalogRetryStorageKey);
 return remote?'Đã gửi yêu cầu. POS phải xác nhận trước khi thay đổi có hiệu lực.':
  'Đã lưu sản phẩm. Đơn cũ vẫn giữ giá trước đây.';
}
