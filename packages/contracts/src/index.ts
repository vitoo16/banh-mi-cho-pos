/** Transport definitions follow docs/contracts/openapi.yaml; VND are safe integers, NEVER float. */
export type PaymentMethod='CASH'|'BANK'|'MOMO'|'MIXED';
export type PaymentStatus='UNPAID'|'PARTIAL'|'PAID'|'PARTIALLY_REFUNDED'|'REFUNDED';
export type Role='OWNER'|'CASHIER'|'STAFF';
export interface Product {id:string; name:string; category:string; price_vnd:number; is_active:boolean}
export interface Catalog {version:number;products:Product[];enabled_payment_methods:PaymentMethod[]}
export interface OrderItem {product_id:string;name_snapshot:string;qty:number;unit_price_vnd:number;line_total_vnd:number;note:string}
export interface Order {order_id:string;display_code:string;created_at:string;created_by:string;status:'COMMITTED'|'VOIDED';payment_status:PaymentStatus;requested_payment_method:PaymentMethod;total_vnd:number;version:number;items:OrderItem[];note:string}
export interface Shift {id:string;cashier_id:string;opening_float_vnd:number;status:'OPEN'|'CLOSED';opened_at:string;closed_at?:string;expected_cash_vnd:number;counted_cash_vnd?:number;variance_vnd?:number}
export interface PaymentReceipt {payment_id:string;cash_tendered_vnd:number;cash_change_vnd:number;cash_net_vnd:number;payment_status:PaymentStatus;receipt_batch_id:string}
export interface ReceiptCopy {id:string;kind:'CUSTOMER'|'STORE';status:'QUEUED'|'SENT'|'UNKNOWN'|'FAILED'|'WAITING_FOR_PRINTER';attempts:number}
export interface OrderPage {items:Order[];next_cursor:string|null}
export interface Summary {paid_orders:number;net_revenue_vnd:number;cash_vnd:number;bank_vnd:number;/** Cloud only: verified bank funds held outside sales until a cash/bank conflict is resolved. */unallocated_bank_vnd?:number;/** Cloud only: orders with both cash and verified bank funds. */bank_conflict_orders?:number;pending_orders:number;bank_pending:number;last_synced_at:string|null;shift:Shift|null}
export interface Employee {id:string;name:string;role:Role;active:boolean}
export interface User {id:string;name:string;role:Role}
export interface Session {token:string;user:User;device_token?:string}
export interface StaffDevice {id:string;user_id:string;label:string;created_at:string;last_seen_at:string|null;revoked_at:string|null}
export interface PairingCode {pairing_code:string;label:string;expires_at:number}
export interface CreateOrderInput {catalog_version:number;requested_payment_method:PaymentMethod;items:{product_id:string;qty:number;note?:string}[];note?:string}
export function formatVnd(value:number):string {return new Intl.NumberFormat('vi-VN').format(value)+'đ'}
export const money = (x:unknown):number=>{if(typeof x!=='number'||!Number.isSafeInteger(x)||x<0||x>1_000_000_000)throw new Error('Số tiền không hợp lệ');return x};
export class ApiError extends Error {constructor(public status:number,public code:string,message:string){super(message)}}
export class HubClient {
  constructor(public readonly baseUrl:string,private getToken:()=>string|undefined,private getDeviceToken:()=>string|undefined=()=>undefined){}
  async request<T>(path:string,init:RequestInit={},key?:string):Promise<T>{
    const headers:Record<string,string>={'Content-Type':'application/json',...(init.headers as Record<string,string>||{})};
    const token=this.getToken(); if(token)headers.Authorization='Bearer '+token;
    const deviceToken=this.getDeviceToken();if(deviceToken)headers['x-device-token']=deviceToken;
    if(key)headers['Idempotency-Key']=key;
    // LAN disconnects must not leave cash/order screens spinning indefinitely.
    // A timeout is an UNKNOWN write result: callers must retry their original idempotency key.
    const controller=new AbortController();
    const onAbort=()=>controller.abort();
    if(init.signal?.aborted)controller.abort();
    else init.signal?.addEventListener('abort',onAbort,{once:true});
    const timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const res=await fetch(this.baseUrl.replace(/\/$/,'')+path,{...init,headers,signal:controller.signal});
      const body=await res.json().catch(()=>({}));
      if(!res.ok)throw new ApiError(res.status,String(body.code||'HTTP_ERROR'),String(body.message||'Không thể thực hiện thao tác'));
      return body as T;
    }finally{
      clearTimeout(timeout);
      init.signal?.removeEventListener('abort',onAbort);
    }
  }
  login(pin:string,user_id:string,pairing_code?:string){return this.request<Session>('/v1/auth/login',{method:'POST',body:JSON.stringify({user_id,pin,...pairing_code?{pairing_code}:{}})})}
  logout(){return this.request<{ok:boolean}>('/v1/auth/logout',{method:'POST',body:'{}'})}
  catalog(){return this.request<Catalog>('/v1/catalog')}
  orders(){return this.request<Order[]>('/v1/orders')}
  orderHistory(cursor?:string){return this.request<OrderPage>('/v1/orders/history?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''))}
  order(id:string){return this.request<Order>('/v1/orders/'+encodeURIComponent(id))}
  createOrder(body:CreateOrderInput,key:string){return this.request<Order>('/v1/orders',{method:'POST',body:JSON.stringify(body)},key)}
  voidOrder(id:string,reason:string,key:string){return this.request<Order>('/v1/orders/'+id+'/void',{method:'POST',body:JSON.stringify({reason})},key)}
  shift(){return this.request<Shift|null>('/v1/cash-shifts/current')}
  openShift(opening_float_vnd:number,key:string){return this.request<Shift>('/v1/cash-shifts/open',{method:'POST',body:JSON.stringify({opening_float_vnd})},key)}
  captureCash(id:string,shift_id:string,cash_tendered_vnd:number,expected_order_version:number,key:string){return this.request<PaymentReceipt>('/v1/orders/'+id+'/payments/cash',{method:'POST',body:JSON.stringify({shift_id,cash_tendered_vnd,expected_order_version})},key)}
  refundCash(id:string,shift_id:string,reason:string,key:string){return this.request<{refund_id:string;amount_vnd:number;payment_status:'REFUNDED'}>('/v1/orders/'+id+'/refunds/cash',{method:'POST',body:JSON.stringify({shift_id,reason})},key)}
  receipts(id:string){return this.request<ReceiptCopy[]>('/v1/orders/'+id+'/receipts')}
  reprint(id:string,reason:string,key:string){return this.request<ReceiptCopy>('/v1/receipt-copies/'+id+'/reprint',{method:'POST',body:JSON.stringify({reason})},key)}
  movement(shift_id:string,kind:'ADD'|'WITHDRAW'|'EXPENSE',amount_vnd:number,reason:string,key:string){return this.request<Shift>('/v1/cash-shifts/'+shift_id+'/movements',{method:'POST',body:JSON.stringify({kind,amount_vnd,reason})},key)}
  closeShift(id:string,counted_cash_vnd:number,reason:string,key:string){return this.request<Shift>('/v1/cash-shifts/'+id+'/close',{method:'POST',body:JSON.stringify({counted_cash_vnd,reason})},key)}
  summary(){return this.request<Summary>('/v1/owner/dashboard')}
  products(){return this.request<Catalog>('/v1/owner/products')}
  updateProduct(id:string,body:{name:string;price_vnd:number;is_active:boolean},key:string){return this.request<Product>('/v1/owner/products/'+id,{method:'PATCH',body:JSON.stringify(body)},key)}
  bankExceptions(){return this.request<Array<{provider_tx_id:string;reference:string;amount_vnd:number;reason:string;received_at:string}>>('/v1/owner/bank-exceptions')}
  issuePairing(label:string,key:string){return this.request<PairingCode>('/v1/owner/device-pairings',{method:'POST',body:JSON.stringify({label})},key)}
  devices(){return this.request<StaffDevice[]>('/v1/owner/devices')}
  revokeDevice(id:string,reason:string,key:string){return this.request<{ok:boolean;revoked:boolean}>('/v1/owner/devices/'+encodeURIComponent(id)+'/revoke',{method:'POST',body:JSON.stringify({reason})},key)}
  employees(){return this.request<Employee[]>('/v1/owner/employees')}
  addEmployee(body:{id:string;name:string;role:'STAFF'|'CASHIER';pin:string},key:string){return this.request<Employee>('/v1/owner/employees',{method:'POST',body:JSON.stringify(body)},key)}
  setEmployeeActive(id:string,active:boolean,key:string){return this.request<Employee>('/v1/owner/employees/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({active})},key)}
  bankIntent(id:string,key:string){return this.request<{status:string;reference:string;amount_vnd:number;bank_code:string;account_number:string}>('/v1/orders/'+id+'/payments/bank-intent',{method:'POST',body:'{}'},key)}
}
