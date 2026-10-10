import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs'; import {dirname} from 'node:path';
export class StoreDb {
 readonly db:DatabaseSync;
 constructor(path=process.env.STORE_DB_PATH||'./store-data/bmc.sqlite'){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  this.db.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,pin_hash TEXT NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Bánh mì',price_vnd INTEGER NOT NULL CHECK(price_vnd>=0),is_active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS order_sequence(id INTEGER PRIMARY KEY AUTOINCREMENT);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,display_code TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'COMMITTED',payment_status TEXT NOT NULL DEFAULT 'UNPAID',requested_method TEXT NOT NULL,total_vnd INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,note TEXT NOT NULL DEFAULT '',lines_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shifts(id TEXT PRIMARY KEY,cashier_id TEXT NOT NULL,opening_float_vnd INTEGER NOT NULL,status TEXT NOT NULL,opened_at TEXT NOT NULL,closed_at TEXT,counted_cash_vnd INTEGER,variance_vnd INTEGER,close_reason TEXT);
CREATE TABLE IF NOT EXISTS cash_movements(id TEXT PRIMARY KEY,shift_id TEXT NOT NULL,order_id TEXT,kind TEXT NOT NULL,amount_vnd INTEGER NOT NULL,created_at TEXT NOT NULL,reason TEXT,actor_id TEXT NOT NULL,FOREIGN KEY(shift_id) REFERENCES shifts(id));
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,method TEXT NOT NULL,amount_vnd INTEGER NOT NULL,tendered_vnd INTEGER,change_vnd INTEGER,created_at TEXT NOT NULL,actor_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,order_id TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'QUEUED',attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,UNIQUE(batch_id,kind));
CREATE TABLE IF NOT EXISTS cash_refunds(id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE,shift_id TEXT NOT NULL,amount_vnd INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,actor_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bank_intents(order_id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE,account_number TEXT NOT NULL,bank_code TEXT NOT NULL,amount_vnd INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING');
CREATE TABLE IF NOT EXISTS bank_events(provider_tx_id TEXT PRIMARY KEY,order_id TEXT,reference TEXT NOT NULL,amount_vnd INTEGER NOT NULL,state TEXT NOT NULL,reason TEXT,received_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS idempotency(scope TEXT NOT NULL,key TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(scope,key));
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,created_at TEXT NOT NULL,details_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_shift ON cash_movements(shift_id);
CREATE INDEX IF NOT EXISTS idx_receipts_order ON receipts(order_id);
`);
  if(!this.db.prepare("SELECT 1 FROM settings WHERE key='catalog_version'").get())this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('catalog_version','1');
 }
 transaction<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const out=fn();this.db.exec('COMMIT');return out}catch(e){this.db.exec('ROLLBACK');throw e}}
 row<T>(sql:string,...args:any[]):T|undefined{return this.db.prepare(sql).get(...args) as T|undefined}
 all<T>(sql:string,...args:any[]):T[]{return this.db.prepare(sql).all(...args) as T[]}
 run(sql:string,...args:any[]){return this.db.prepare(sql).run(...args)}
}
