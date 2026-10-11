/**
 * Persist an uncertain catalog mutation with the original request body/key.
 * NEVER rotate the idempotency key or rebuild its payload after an ACK is lost.
 * The storage key is deliberately unchanged for upgrades from older versions.
 */
export type CatalogRetry={
 key:string;
 draft:{remote:boolean;target:string|null;name:string;category:string;price_vnd:number;is_active:boolean};
 payload:{name:string;category?:string;price_vnd:number;is_active:boolean;expected_price_vnd?:number};
};
export const catalogRetryStorageKey='bmc_owner_pending_catalog_v1';

export function readCatalogRetry():CatalogRetry|null{
 const raw=sessionStorage.getItem(catalogRetryStorageKey);
 if(!raw)return null;
 let item:CatalogRetry;
 try{item=JSON.parse(raw) as CatalogRetry}catch{throw new Error('Bản ghi yêu cầu menu chưa xác nhận bị lỗi; không tạo yêu cầu mới. Kiểm tra Cloud/POS.')}
 if(!item||typeof item.key!=='string'||item.key.length<8||!item.draft||
  typeof item.draft.name!=='string'||typeof item.draft.price_vnd!=='number'||
  !item.payload||typeof item.payload.name!=='string')
  throw new Error('Bản ghi yêu cầu menu chưa xác nhận không hợp lệ; kiểm tra trước khi tạo yêu cầu mới.');
 return item;
}
