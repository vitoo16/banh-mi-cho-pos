import {Injectable,OnModuleDestroy,OnModuleInit} from '@nestjs/common';
import {Pool,PoolClient} from 'pg';
@Injectable()
export class CloudDb implements OnModuleInit,OnModuleDestroy{
 readonly pool=new Pool({connectionString:process.env.DATABASE_URL,max:8,ssl:process.env.DATABASE_SSL==='require'?{rejectUnauthorized:true}:undefined});
 async onModuleInit(){
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
  await this.pool.query(`
CREATE TABLE IF NOT EXISTS sync_events(event_id uuid PRIMARY KEY,kind text NOT NULL,payload jsonb NOT NULL,received_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS cloud_orders(order_id uuid PRIMARY KEY,display_code text NOT NULL,total_vnd bigint NOT NULL CHECK(total_vnd>0),status text NOT NULL,created_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS bank_intents(reference text PRIMARY KEY,order_id uuid NOT NULL UNIQUE REFERENCES cloud_orders(order_id),account_number text NOT NULL,bank_bin text NOT NULL,amount_vnd bigint NOT NULL CHECK(amount_vnd>0),status text NOT NULL DEFAULT 'PENDING',created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS bank_transactions(provider_tx_id bigint PRIMARY KEY,account_number text NOT NULL,amount_vnd bigint NOT NULL,payload jsonb NOT NULL,matched_reference text,status text NOT NULL DEFAULT 'PENDING',reason text,received_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS cloud_cash_events(event_id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES cloud_orders(order_id),kind text NOT NULL,amount_vnd bigint NOT NULL CHECK(amount_vnd>0),received_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS bank_settlements(seq bigserial PRIMARY KEY,order_id uuid NOT NULL UNIQUE REFERENCES cloud_orders(order_id),reference text NOT NULL UNIQUE,provider_tx_id bigint NOT NULL UNIQUE REFERENCES bank_transactions(provider_tx_id),amount_vnd bigint NOT NULL CHECK(amount_vnd>0),created_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_bank_tx_pending ON bank_transactions(status) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS idx_sync_events_time ON sync_events(received_at);
`);
 }
 async onModuleDestroy(){await this.pool.end()}
 async txn<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{const c=await this.pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
}
