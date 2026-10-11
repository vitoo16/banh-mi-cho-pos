import {Injectable,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {Pool,type PoolClient} from 'pg';
@Injectable()
export class CloudDb implements OnModuleInit,OnModuleDestroy{
 readonly pool:Pool;
 constructor(){
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
  this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:7000,idleTimeoutMillis:30000,ssl:process.env.CLOUD_PG_SSL==='1'?{rejectUnauthorized:true}:undefined});
 }
 async onModuleInit(){
  await this.pool.query(`
CREATE TABLE IF NOT EXISTS owner_sessions(token_hash text PRIMARY KEY,secret_fingerprint text NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS owner_sessions_expiry ON owner_sessions(expires_at);
CREATE TABLE IF NOT EXISTS owner_login_attempts(bucket text PRIMARY KEY,attempts integer NOT NULL,window_started timestamptz NOT NULL,blocked_until timestamptz);
CREATE TABLE IF NOT EXISTS synced_events(store_id text NOT NULL,event_id text NOT NULL,entity text NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(store_id,event_id));
CREATE TABLE IF NOT EXISTS mirror_orders(store_id text NOT NULL,id text NOT NULL,display_code text NOT NULL,created_at timestamptz NOT NULL,created_by text NOT NULL,status text NOT NULL,payment_status text NOT NULL,requested_method text NOT NULL,total_vnd bigint NOT NULL,version integer NOT NULL,lines_json jsonb NOT NULL,PRIMARY KEY(store_id,id));
CREATE INDEX IF NOT EXISTS mirror_orders_created ON mirror_orders(store_id,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS mirror_payments(store_id text NOT NULL,id text NOT NULL,order_id text NOT NULL,method text NOT NULL,amount_vnd bigint NOT NULL,created_at timestamptz NOT NULL,PRIMARY KEY(store_id,id));
CREATE TABLE IF NOT EXISTS sepay_events(store_id text NOT NULL,sepay_id text NOT NULL,reference text,account_number text NOT NULL,bank_gateway text NOT NULL,amount_vnd bigint NOT NULL,state text NOT NULL,reason text,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(store_id,sepay_id));
CREATE TABLE IF NOT EXISTS cloud_bank_settlements(seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,store_id text NOT NULL,provider_tx_id text NOT NULL,order_id text NOT NULL,reference text NOT NULL,account_number text NOT NULL,bank_code text NOT NULL,amount_vnd bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(store_id,provider_tx_id),UNIQUE(store_id,order_id));
CREATE INDEX IF NOT EXISTS idx_cloud_settlements_store_seq ON cloud_bank_settlements(store_id,seq);
CREATE TABLE IF NOT EXISTS mirror_bank_intents(store_id text NOT NULL,order_id text NOT NULL,reference text NOT NULL,account_number text NOT NULL,bank_code text NOT NULL,amount_vnd bigint NOT NULL,status text NOT NULL,PRIMARY KEY(store_id,order_id),UNIQUE(store_id,reference));
CREATE TABLE IF NOT EXISTS mirror_bank_events(store_id text NOT NULL,provider_tx_id text NOT NULL,order_id text,reference text NOT NULL,amount_vnd bigint NOT NULL,state text NOT NULL,reason text,received_at timestamptz NOT NULL,PRIMARY KEY(store_id,provider_tx_id));
CREATE TABLE IF NOT EXISTS mirror_cash_movements(store_id text NOT NULL,id text NOT NULL,shift_id text NOT NULL,order_id text,kind text NOT NULL,amount_vnd bigint NOT NULL,created_at timestamptz NOT NULL,PRIMARY KEY(store_id,id));
CREATE TABLE IF NOT EXISTS mirror_refunds(store_id text NOT NULL,id text NOT NULL,order_id text NOT NULL,amount_vnd bigint NOT NULL,created_at timestamptz NOT NULL,PRIMARY KEY(store_id,id));
CREATE TABLE IF NOT EXISTS mirror_products(store_id text NOT NULL,id text NOT NULL,name text NOT NULL,category text NOT NULL,price_vnd bigint NOT NULL,is_active boolean NOT NULL,PRIMARY KEY(store_id,id));
CREATE TABLE IF NOT EXISTS remote_product_commands(
 id text PRIMARY KEY,store_id text NOT NULL,idem_key text NOT NULL,payload_hash text NOT NULL,
 product_id text NOT NULL,name text NOT NULL,price_vnd bigint NOT NULL CHECK(price_vnd>=0 AND price_vnd<=1000000000),
 expected_price_vnd bigint NOT NULL CHECK(expected_price_vnd>=0 AND expected_price_vnd<=1000000000),
 is_active boolean NOT NULL,status text NOT NULL DEFAULT 'PENDING'
 CHECK(status IN ('PENDING','APPLIED','CONFLICT')),
 result_code text,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 UNIQUE(store_id,idem_key)
);
CREATE INDEX IF NOT EXISTS idx_remote_commands_pending ON remote_product_commands(store_id,status,created_at,id);
ALTER TABLE remote_product_commands ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'UPDATE' CHECK(operation IN ('CREATE','UPDATE'));
ALTER TABLE remote_product_commands ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Khác';

CREATE TABLE IF NOT EXISTS mirror_shifts(store_id text NOT NULL,id text NOT NULL,cashier_id text NOT NULL,opening_float_vnd bigint NOT NULL,status text NOT NULL,opened_at timestamptz NOT NULL,closed_at timestamptz,counted_cash_vnd bigint,variance_vnd bigint,PRIMARY KEY(store_id,id));
-- Additive monotonic projection checkpoint. Legacy rows start with sequence 0;
-- a delayed old batch must never revert a higher-sequence projection.
ALTER TABLE mirror_products ADD COLUMN IF NOT EXISTS source_seq bigint NOT NULL DEFAULT 0;
ALTER TABLE mirror_shifts ADD COLUMN IF NOT EXISTS source_seq bigint NOT NULL DEFAULT 0;
`);
 }
 async transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{
  const c=await this.pool.connect();
  try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result}
  catch(e){await c.query('ROLLBACK');throw e}
  finally{c.release()}
 }
 async onModuleDestroy(){await this.pool.end()}
}
