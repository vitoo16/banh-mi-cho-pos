import {Injectable,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {createCanvas} from '@napi-rs/canvas';import {Socket} from 'node:net';import {randomUUID} from 'node:crypto';
import {StoreService} from './service';
const formatVnd=(v:number)=>new Intl.NumberFormat('vi-VN').format(v)+'đ';
export type ReceiptLine={left:string;right?:string;size?:'large'};
export type RecordedReceiptPayment={
 method:string;
 amount_vnd:number;
 tendered_vnd:number|null;
 change_vnd:number|null;
};
/**
 * Receipt text uses only the ACTUAL settled payment row; requested_method
 * from Staff is never a source of truth for tender or bank settlement.
 * Pure formatter supports unit tests without thermal-print hardware.
 */
export function buildReceiptLines(
 order:{display_code:string;created_at:string;total_vnd:number;lines_json:string},
 receipt:{kind:'CUSTOMER'|'STORE';attempts:number},
 payment:RecordedReceiptPayment|null,
):ReceiptLine[]{
 if(!payment||!Number.isSafeInteger(payment.amount_vnd)||payment.amount_vnd<0||
  payment.amount_vnd!==order.total_vnd||
  !['CASH','BANK'].includes(payment.method)){
  throw new Error('RECEIPT_SETTLEMENT_INVALID');
 }
 if(payment.method==='CASH'&&(
  !Number.isSafeInteger(payment.tendered_vnd)||
  !Number.isSafeInteger(payment.change_vnd)||
  (payment.tendered_vnd as number)<0||
  (payment.change_vnd as number)<0||
  (payment.tendered_vnd as number)-(payment.change_vnd as number)!==payment.amount_vnd
 ))throw new Error('RECEIPT_CASH_LEGS_INVALID');

 const lines:ReceiptLine[]=[
  {left:'BÁNH MÌ CHỢ',size:'large'},
  {left:receipt.kind==='CUSTOMER'?'LIÊN KHÁCH':'LIÊN TIỆM'},
  {left:'Mã đơn: '+order.display_code},
  {left:new Date(order.created_at).toLocaleString('vi-VN')},
  {left:'-------------------------------------'},
 ];
 const items=JSON.parse(order.lines_json) as Array<{name_snapshot:string;qty:number;line_total_vnd:number;note:string}>;
 for(const item of items){
  lines.push({left:item.name_snapshot+' × '+item.qty,right:formatVnd(item.line_total_vnd)});
  if(item.note&&receipt.kind==='STORE')lines.push({left:'  Ghi chú: '+item.note});
 }
 lines.push({left:'-------------------------------------'});
 lines.push({left:'TỔNG',right:formatVnd(order.total_vnd),size:'large'});
 lines.push({left:'TRẠNG THÁI: ĐÃ THANH TOÁN'});
 lines.push({left:'Hình thức',right:payment.method==='CASH'?'Tiền mặt':'Chuyển khoản'});
 if(payment.method==='CASH'&&receipt.kind==='STORE'){
  lines.push({left:'Khách đưa',right:formatVnd(payment.tendered_vnd as number)});
  lines.push({left:'Tiền thối',right:formatVnd(payment.change_vnd as number)});
 }else if(payment.method==='BANK'){
  lines.push({left:'Chuyển khoản xác minh',right:formatVnd(payment.amount_vnd)});
 }
 if(receipt.attempts>0)lines.push({left:'*** BẢN IN LẠI ***',size:'large'});
 lines.push({left:'Cảm ơn quý khách!'});
 return lines;
}

/** Pilot ESC/POS over TCP: sends bitmapped Vietnamese text to configured 80mm printer.
 * SENT only means bytes were sent over socket, NOT physical paper acknowledged.
 * UNKNOWN after crash/connection loss is never auto-resubmitted.
 */
@Injectable()
export class ReceiptPrinter implements OnModuleInit,OnModuleDestroy{
 private timer:NodeJS.Timeout|undefined;private running=false;
 constructor(private readonly service:StoreService){}
 onModuleInit(){if(process.env.PRINTER_HOST){this.timer=setInterval(()=>void this.dispatch(),2000);this.timer.unref()}}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer)}
 private async dispatch(){
  if(this.running)return;this.running=true;
  try{
   const db=this.service.store;
   const r=db.row<any>("SELECT id,order_id,kind,attempts FROM receipts WHERE status='WAITING_FOR_PRINTER' ORDER BY created_at,id LIMIT 1");
   if(!r)return;
   const o=db.row<any>('SELECT * FROM orders WHERE id=?',r.order_id);
   if(!o)return;
   const p=db.row<any>("SELECT method,amount_vnd,tendered_vnd,change_vnd FROM payments WHERE order_id=? ORDER BY created_at,id LIMIT 1",r.order_id);
   // Claim and journal before I/O. A crash leaves a durable UNKNOWN attempt,
   // which must never be retried without an explicit cashier reprint request.
   const attemptId=randomUUID(),started=new Date().toISOString(),attemptNo=r.attempts+1;
   const claimed=db.transaction(()=>{
    const claim=db.run("UPDATE receipts SET status='UNKNOWN',attempts=attempts+1 WHERE id=? AND status='WAITING_FOR_PRINTER' AND attempts=?",r.id,r.attempts);
    if(!claim.changes)return false;
    db.run("INSERT INTO receipt_print_attempts(id,receipt_id,started_at,status) VALUES(?,?,?,'UNKNOWN')",attemptId,r.id,started);
    return true;
   });
   if(!claimed)return;
   try{
    const payload=this.render(o,r,p);
    await this.send(payload);
    db.transaction(()=>{
     // If the cashier queued a deliberate reprint during this network send,
     // do not erase the newer WAITING request with an old SENT result.
     db.run("UPDATE receipts SET status='SENT' WHERE id=? AND status='UNKNOWN' AND attempts=?",r.id,attemptNo);
     db.run("UPDATE receipt_print_attempts SET status='SENT',finished_at=? WHERE id=?",new Date().toISOString(),attemptId);
    });
   }catch(err){
    db.run("UPDATE receipt_print_attempts SET status='UNKNOWN',finished_at=?,error_code='SEND_UNCERTAIN' WHERE id=?",new Date().toISOString(),attemptId);
    console.error('Receipt send uncertain; manual inspection required',r.id);
   }
  }finally{this.running=false}
 }
 private render(o:any,r:any,p:any):Buffer{
  const lines=buildReceiptLines(o,r,p);
  const width=576,left=16,lineHeight=29;const wrapped:{left:string;right?:string;size?:'large'}[]=[];
  for(const line of lines){
   if(line.left.length>42&&!line.right){
    for(let i=0;i<line.left.length;i+=39)wrapped.push({left:line.left.slice(i,i+39),size:line.size});
   }else wrapped.push(line);
  }
  const height=wrapped.length*lineHeight+60;
  const canvas=createCanvas(width,height);const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#000';ctx.textBaseline='middle';
  wrapped.forEach((line,i)=>{
   const y=25+i*lineHeight;const big=line.size==='large';ctx.font=(big?'bold 26px ':'20px ')+'Arial';
   ctx.fillText(line.left,left,y,line.right?360:width-32);
   if(line.right){ctx.textAlign='right';ctx.font='bold 20px Arial';ctx.fillText(line.right,width-16,y,195);ctx.textAlign='left'}
  });
  const data=ctx.getImageData(0,0,width,height).data;const bytesPerRow=width/8;
  const bitmap=Buffer.alloc(bytesPerRow*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const off=(y*width+x)*4;const lum=data[off]*0.299+data[off+1]*0.587+data[off+2]*0.114;if(lum<160)bitmap[y*bytesPerRow+(x>>3)]|=0x80>>(x&7)}
  const head=Buffer.from([0x1b,0x40,0x1d,0x76,0x30,0,width/8&255,width/8>>8,height&255,height>>8]);
  return Buffer.concat([head,bitmap,Buffer.from([0x0a,0x0a,0x1d,0x56,0x42,0])]);
 }
 private send(buffer:Buffer):Promise<void>{
  const host=process.env.PRINTER_HOST!,port=Number(process.env.PRINTER_PORT||9100);
  return new Promise((resolve,reject)=>{
   const socket=new Socket();let completed=false;
   const end=(error?:Error)=>{if(completed)return;completed=true;socket.destroy();error?reject(error):resolve()};
   socket.setTimeout(7000,()=>end(new Error('Printer timeout')));
   socket.on('error',end);
   socket.connect(port,host,()=>socket.end(buffer));
   socket.on('close',(hadError)=>{if(!hadError)end()});
  });
 }
}
