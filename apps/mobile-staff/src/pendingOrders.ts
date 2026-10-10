import * as SQLite from 'expo-sqlite';
import type {CreateOrderInput} from '@bmc/contracts';

/** One durable in-flight create command per device. The Hub remains the authority.
 * The exact immutable body + idempotency key survive app termination and network loss.
 */
export type PendingOrder = {
  key:string;
  staff_id:string;
  body:CreateOrderInput;
  created_at:number;
};
let opening:Promise<SQLite.SQLiteDatabase>|undefined;
async function database():Promise<SQLite.SQLiteDatabase>{
  if(!opening){
    opening=SQLite.openDatabaseAsync('bmc-staff-pending.db').then(async db=>{
      await db.execAsync("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS pending_order (slot INTEGER PRIMARY KEY CHECK(slot=1), key TEXT NOT NULL UNIQUE, staff_id TEXT NOT NULL, body_json TEXT NOT NULL, created_at INTEGER NOT NULL)");
      return db;
    }).catch(e=>{opening=undefined;throw e});
  }
  return opening;
}
export async function loadPending():Promise<PendingOrder|null>{
  const db=await database();
  const row=await db.getFirstAsync<{key:string;staff_id:string;body_json:string;created_at:number}>('SELECT key,staff_id,body_json,created_at FROM pending_order WHERE slot=1');
  if(!row)return null;
  let body:CreateOrderInput;
  try{
    body=JSON.parse(row.body_json) as CreateOrderInput;
    if(!body||!Array.isArray(body.items)||typeof body.catalog_version!=='number')throw Error('Invalid queue body');
  }catch{
    // Deliberately refuse to silently discard a potentially committed order.
    throw new Error('Bản ghi đơn đang chờ bị hỏng. Không tạo đơn trùng; chủ tiệm cần kiểm tra POS.');
  }
  return {key:row.key,staff_id:row.staff_id,body,created_at:row.created_at};
}
export async function stagePending(p:PendingOrder):Promise<void>{
  if(!p.key||!p.staff_id||!p.body.items.length)throw Error('Invalid pending command');
  const db=await database();
  const existing=await db.getFirstAsync<{key:string}>('SELECT key FROM pending_order WHERE slot=1');
  if(existing&&existing.key!==p.key)throw new Error('Thiết bị đã có đơn chưa xác nhận. Phải kiểm tra đơn trước khi tạo mới.');
  await db.runAsync('INSERT INTO pending_order(slot,key,staff_id,body_json,created_at) VALUES(1,?,?,?,?) ON CONFLICT(slot) DO UPDATE SET key=excluded.key,staff_id=excluded.staff_id,body_json=excluded.body_json,created_at=excluded.created_at',
    [p.key,p.staff_id,JSON.stringify(p.body),p.created_at]);
}
export async function clearPending(key:string):Promise<void>{
  const db=await database();
  await db.runAsync('DELETE FROM pending_order WHERE slot=1 AND key=?',[key]);
}
