import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs'; import {dirname} from 'node:path';
export class StoreDb {
 readonly db:DatabaseSync;
 constructor(path=process.env.STORE_DB_PATH||'./store-data/bmc.sqlite'){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  this.db.exec(`
CREATE TABLE IF NOT EXISTS device_pairing_codes(code_hash TEXT PRIMARY KEY,label TEXT NOT NULL,created_by TEXT NOT NULL,expires_at INTEGER NOT NULL,claimed_at INTEGER);
CREATE TABLE IF NOT EXISTS staff_devices(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,label TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,last_seen_at TEXT,revoked_at TEXT);
CREATE INDEX IF NOT EXISTS idx_staff_devices_user ON staff_devices(user_id,revoked_at);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,pin_hash TEXT NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS login_attempts(user_id TEXT PRIMARY KEY,attempts INTEGER NOT NULL,blocked_until INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Bánh mì',price_vnd INTEGER NOT NULL CHECK(price_vnd>=0),is_active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS order_sequence(id INTEGER PRIMARY KEY AUTOINCREMENT);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,display_code TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'COMMITTED',payment_status TEXT NOT NULL DEFAULT 'UNPAID',requested_method TEXT NOT NULL,total_vnd INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,note TEXT NOT NULL DEFAULT '',lines_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shifts(id TEXT PRIMARY KEY,cashier_id TEXT NOT NULL,opening_float_vnd INTEGER NOT NULL,status TEXT NOT NULL,opened_at TEXT NOT NULL,closed_at TEXT,counted_cash_vnd INTEGER,variance_vnd INTEGER,close_reason TEXT);
CREATE TABLE IF NOT EXISTS cash_movements(id TEXT PRIMARY KEY,shift_id TEXT NOT NULL,order_id TEXT,kind TEXT NOT NULL,amount_vnd INTEGER NOT NULL,created_at TEXT NOT NULL,reason TEXT,actor_id TEXT NOT NULL,FOREIGN KEY(shift_id) REFERENCES shifts(id));
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,method TEXT NOT NULL,amount_vnd INTEGER NOT NULL,tendered_vnd INTEGER,change_vnd INTEGER,created_at TEXT NOT NULL,actor_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,order_id TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'QUEUED',attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,UNIQUE(batch_id,kind));
CREATE TABLE IF NOT EXISTS receipt_print_attempts(id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL REFERENCES receipts(id),started_at TEXT NOT NULL,finished_at TEXT,status TEXT NOT NULL,error_code TEXT);
CREATE INDEX IF NOT EXISTS idx_print_attempts_receipt ON receipt_print_attempts(receipt_id,started_at);
CREATE TABLE IF NOT EXISTS cash_refunds(id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE,shift_id TEXT NOT NULL,amount_vnd INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,actor_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bank_intents(order_id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE,account_number TEXT NOT NULL,bank_code TEXT NOT NULL,amount_vnd INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING');
CREATE TABLE IF NOT EXISTS bank_events(provider_tx_id TEXT PRIMARY KEY,order_id TEXT,reference TEXT NOT NULL,amount_vnd INTEGER NOT NULL,state TEXT NOT NULL,reason TEXT,received_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS idempotency(scope TEXT NOT NULL,key TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(scope,key));
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,created_at TEXT NOT NULL,details_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_shift ON cash_movements(shift_id);
CREATE INDEX IF NOT EXISTS idx_receipts_order ON receipts(order_id);
CREATE INDEX IF NOT EXISTS idx_receipts_operational ON receipts(status,created_at,id);
CREATE TABLE IF NOT EXISTS sync_outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),entity TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,delivered_at TEXT);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(delivered_at,seq);
CREATE TRIGGER IF NOT EXISTS sync_order_created AFTER INSERT ON orders BEGIN
 INSERT INTO sync_outbox(entity,payload_json) VALUES('order',json_object('id',NEW.id,'display_code',NEW.display_code,'created_at',NEW.created_at,'created_by',NEW.created_by,'status',NEW.status,'payment_status',NEW.payment_status,'requested_method',NEW.requested_method,'total_vnd',NEW.total_vnd,'version',NEW.version,'lines_json',NEW.lines_json));
END;
CREATE TRIGGER IF NOT EXISTS sync_order_updated AFTER UPDATE ON orders BEGIN
 INSERT INTO sync_outbox(entity,payload_json) VALUES('order',json_object('id',NEW.id,'display_code',NEW.display_code,'created_at',NEW.created_at,'created_by',NEW.created_by,'status',NEW.status,'payment_status',NEW.payment_status,'requested_method',NEW.requested_method,'total_vnd',NEW.total_vnd,'version',NEW.version,'lines_json',NEW.lines_json));
END;
CREATE TRIGGER IF NOT EXISTS sync_payment_created AFTER INSERT ON payments BEGIN
 INSERT INTO sync_outbox(entity,payload_json) VALUES('payment',json_object('id',NEW.id,'order_id',NEW.order_id,'method',NEW.method,'amount_vnd',NEW.amount_vnd,'created_at',NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_bank_intent_created AFTER INSERT ON bank_intents BEGIN
 INSERT INTO sync_outbox(entity,payload_json) VALUES('bank_intent',json_object('order_id',NEW.order_id,'reference',NEW.reference,'account_number',NEW.account_number,'bank_code',NEW.bank_code,'amount_vnd',NEW.amount_vnd,'status',NEW.status));
END;
CREATE TRIGGER IF NOT EXISTS sync_bank_intent_updated AFTER UPDATE ON bank_intents BEGIN
 INSERT INTO sync_outbox(entity,payload_json) VALUES('bank_intent',json_object('order_id',NEW.order_id,'reference',NEW.reference,'account_number',NEW.account_number,'bank_code',NEW.bank_code,'amount_vnd',NEW.amount_vnd,'status',NEW.status));
END;
CREATE TRIGGER IF NOT EXISTS sync_bank_event AFTER INSERT ON bank_events BEGIN
 INSERT INTO sync_outbox(entity,payload_json) VALUES('bank_exception',json_object('provider_tx_id',NEW.provider_tx_id,'order_id',NEW.order_id,'reference',NEW.reference,'amount_vnd',NEW.amount_vnd,'state',NEW.state,'reason',NEW.reason,'received_at',NEW.received_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_cash_movement AFTER INSERT ON cash_movements BEGIN
 INSERT INTO sync_outbox(entity,payload_json) VALUES('cash_movement',json_object('id',NEW.id,'shift_id',NEW.shift_id,'order_id',NEW.order_id,'kind',NEW.kind,'amount_vnd',NEW.amount_vnd,'created_at',NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_refund_created AFTER INSERT ON cash_refunds BEGIN
 INSERT INTO sync_outbox(entity,payload_json) VALUES('refund',json_object('id',NEW.id,'order_id',NEW.order_id,'amount_vnd',NEW.amount_vnd,'created_at',NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_product_created AFTER INSERT ON products BEGIN
 INSERT INTO sync_outbox(entity,payload_json) VALUES('product',json_object('id',NEW.id,'name',NEW.name,'category',NEW.category,'price_vnd',NEW.price_vnd,'is_active',NEW.is_active));
END;
CREATE TRIGGER IF NOT EXISTS sync_product_updated AFTER UPDATE ON products BEGIN
 INSERT INTO sync_outbox(entity,payload_json) VALUES('product',json_object('id',NEW.id,'name',NEW.name,'category',NEW.category,'price_vnd',NEW.price_vnd,'is_active',NEW.is_active));
END;
CREATE TRIGGER IF NOT EXISTS sync_shift_created AFTER INSERT ON shifts BEGIN
 INSERT INTO sync_outbox(entity,payload_json) VALUES('shift',json_object('id',NEW.id,'cashier_id',NEW.cashier_id,'opening_float_vnd',NEW.opening_float_vnd,'status',NEW.status,'opened_at',NEW.opened_at,'closed_at',NEW.closed_at,'counted_cash_vnd',NEW.counted_cash_vnd,'variance_vnd',NEW.variance_vnd));
END;
CREATE TRIGGER IF NOT EXISTS sync_shift_updated AFTER UPDATE ON shifts BEGIN
 INSERT INTO sync_outbox(entity,payload_json) VALUES('shift',json_object('id',NEW.id,'cashier_id',NEW.cashier_id,'opening_float_vnd',NEW.opening_float_vnd,'status',NEW.status,'opened_at',NEW.opened_at,'closed_at',NEW.closed_at,'counted_cash_vnd',NEW.counted_cash_vnd,'variance_vnd',NEW.variance_vnd));
END;

`);
  // Additive migration for previously created shops.
  const columns=this.db.prepare('PRAGMA table_info(sessions)').all() as Array<{name:string}>;
  if(!columns.some(c=>c.name==='device_id'))this.db.exec('ALTER TABLE sessions ADD COLUMN device_id TEXT');
  if(!this.db.prepare("SELECT 1 FROM settings WHERE key='catalog_version'").get())this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('catalog_version','1');
 }
/** Backfill existing local rows BEFORE first cloud sync. One atomic snapshot, one marker per store.
 * Events already emitted by SQLite triggers may repeat logically; mirror upserts/payment IDs
 * are idempotent. A crash rolls marker and all snapshot events back together.
 */
 prepareCloudBackfill(storeId:string):number{
  if(!/^[a-zA-Z0-9._-]{1,72}$/.test(storeId))throw new Error('Invalid CLOUD_STORE_ID');
  return this.transaction(()=>{
   const marker='cloud_backfill_v1:'+storeId;
   if(this.row<{value:string}>('SELECT value FROM settings WHERE key=?',marker))return 0;
   const statements=[
    `INSERT INTO sync_outbox(entity,payload_json) SELECT 'order',json_object('id',id,'display_code',display_code,'created_at',created_at,'created_by',created_by,'status',status,'payment_status',payment_status,'requested_method',requested_method,'total_vnd',total_vnd,'version',version,'lines_json',lines_json) FROM orders`,
    `INSERT INTO sync_outbox(entity,payload_json) SELECT 'payment',json_object('id',id,'order_id',order_id,'method',method,'amount_vnd',amount_vnd,'created_at',created_at) FROM payments`,
    `INSERT INTO sync_outbox(entity,payload_json) SELECT 'refund',json_object('id',id,'order_id',order_id,'amount_vnd',amount_vnd,'created_at',created_at) FROM cash_refunds`,
    `INSERT INTO sync_outbox(entity,payload_json) SELECT 'product',json_object('id',id,'name',name,'category',category,'price_vnd',price_vnd,'is_active',is_active) FROM products`,
    `INSERT INTO sync_outbox(entity,payload_json) SELECT 'shift',json_object('id',id,'cashier_id',cashier_id,'opening_float_vnd',opening_float_vnd,'status',status,'opened_at',opened_at,'closed_at',closed_at,'counted_cash_vnd',counted_cash_vnd,'variance_vnd',variance_vnd) FROM shifts`,
    `INSERT INTO sync_outbox(entity,payload_json) SELECT 'cash_movement',json_object('id',id,'shift_id',shift_id,'order_id',order_id,'kind',kind,'amount_vnd',amount_vnd,'created_at',created_at) FROM cash_movements`,
    `INSERT INTO sync_outbox(entity,payload_json) SELECT 'bank_exception',json_object('provider_tx_id',provider_tx_id,'order_id',order_id,'reference',reference,'amount_vnd',amount_vnd,'state',state,'reason',reason,'received_at',received_at) FROM bank_events`
   ];
   let rows=0;
   for(const sql of statements)rows+=Number(this.run(sql).changes);
   this.run('INSERT INTO settings(key,value) VALUES(?,?)',marker,new Date().toISOString());
   return rows;
  });
 }
 /** Versioned snapshot for bank intents when adding provider integration to an existing store. */
 prepareBankIntentBackfill(storeId:string):number{
  if(!/^[a-zA-Z0-9._-]{1,72}$/.test(storeId))throw new Error('Invalid CLOUD_STORE_ID');
  return this.transaction(()=>{
   const marker='bank_intent_backfill_v1:'+storeId;
   if(this.row('SELECT 1 FROM settings WHERE key=?',marker))return 0;
   const result=this.run(`INSERT INTO sync_outbox(entity,payload_json)
 SELECT 'bank_intent',json_object('order_id',order_id,'reference',reference,'account_number',account_number,'bank_code',bank_code,'amount_vnd',amount_vnd,'status',status) FROM bank_intents`);
   this.run('INSERT INTO settings(key,value) VALUES(?,?)',marker,new Date().toISOString());
   return Number(result.changes);
  });
 }
 transaction<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const out=fn();this.db.exec('COMMIT');return out}catch(e){this.db.exec('ROLLBACK');throw e}}
 row<T>(sql:string,...args:any[]):T|undefined{return this.db.prepare(sql).get(...args) as T|undefined}
 all<T>(sql:string,...args:any[]):T[]{return this.db.prepare(sql).all(...args) as T[]}
 run(sql:string,...args:any[]){return this.db.prepare(sql).run(...args)}
}
