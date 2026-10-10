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
CREATE TABLE IF NOT EXISTS mirror_bank_intents(store_id text NOT NULL,order_id text NOT NULL,reference text NOT NULL,account_number text NOT NULL,bank_code text NOT NULL,amount_vnd bigint NOT NULL,status text NOT NULL,PRIMARY KEY(store_id,order_id),UNIQUE(store_id,reference));
CREATE TABLE IF NOT EXISTS mirror_bank_events(store_id text NOT NULL,provider_tx_id text NOT NULL,order_id text,reference text NOT NULL,amount_vnd bigint NOT NULL,state text NOT NULL,reason text,received_at timestamptz NOT NULL,PRIMARY KEY(store_id,provider_tx_id));
CREATE TABLE IF NOT EXISTS mirror_cash_movements(store_id text NOT NULL,id text NOT NULL,shift_id text NOT NULL,order_id text,kind text NOT NULL,amount_vnd bigint NOT NULL,created_at timestamptz NOT NULL,PRIMARY KEY(store_id,id));
CREATE TABLE IF NOT EXISTS mirror_refunds(store_id text NOT NULL,id text NOT NULL,order_id text NOT NULL,amount_vnd bigint NOT NULL,created_at timestamptz NOT NULL,PRIMARY KEY(store_id,id));
CREATE TABLE IF NOT EXISTS mirror_products(store_id text NOT NULL,id text NOT NULL,name text NOT NULL,category text NOT NULL,price_vnd bigint NOT NULL,is_active boolean NOT NULL,PRIMARY KEY(store_id,id));
CREATE TABLE IF NOT EXISTS mirror_shifts(store_id text NOT NULL,id text NOT NULL,cashier_id text NOT NULL,opening_float_vnd bigint NOT NULL,status text NOT NULL,opened_at timestamptz NOT NULL,closed_at timestamptz,counted_cash_vnd bigint,variance_vnd bigint,PRIMARY KEY(store_id,id));
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
