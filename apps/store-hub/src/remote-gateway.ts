import {StoreError,StoreService} from './service';

// Direct LAN socket peer, never X-Forwarded-For or caller-supplied IP headers.
const LOOPBACK=new Set(['127.0.0.1','::1','::ffff:127.0.0.1']);
const STAFF_GET=new Set(['/v1/catalog','/v1/orders','/v1/orders/history']);
const STAFF_POST=new Set(['/v1/orders','/v1/auth/logout']);
const UUID_ORDER=/^\/v1\/orders\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function assertRemoteStaffRequest(
 service:StoreService, peerIp:unknown, method:unknown, rawUrl:unknown,
 authorization:unknown, deviceToken:unknown, body:unknown,
):void{
 if(typeof peerIp==='string'&&LOOPBACK.has(peerIp))return;
 const verb=typeof method==='string'?method.toUpperCase():'';
 const path=typeof rawUrl==='string'?rawUrl.split('?')[0]:'';
 // CORS preflight/health have no financial effects.
 if(verb==='OPTIONS'||(verb==='GET'&&path==='/v1/health'))return;
 if(verb==='POST'&&path==='/v1/auth/login'){
  // Do not even issue OWNER/CASHIER bearer tokens on remote sockets.
  service.assertRemoteStaffAccount(
   body!==null&&typeof body==='object'?(body as {user_id?:unknown}).user_id:undefined,
  );
  return; // Existing login verifies PIN + pairing code/device token.
 }
 const allowed=(verb==='GET'&&(STAFF_GET.has(path)||UUID_ORDER.test(path)))
  ||(verb==='POST'&&STAFF_POST.has(path));
 if(!allowed)throw new StoreError(403,'REMOTE_ROUTE_FORBIDDEN','Điện thoại nhân viên không được truy cập chức năng này');
 // Role, live session and matching unrevoked device token are enforced together.
 service.actor(authorization,['STAFF'],deviceToken);
}
