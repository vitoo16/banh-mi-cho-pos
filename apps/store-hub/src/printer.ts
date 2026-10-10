import {Injectable,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {createCanvas} from '@napi-rs/canvas';import {Socket} from 'node:net';
import {StoreService} from './service';
const formatVnd=(v:number)=>new Intl.NumberFormat('vi-VN').format(v)+'đ';
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
   const p=db.row<any>("SELECT tendered_vnd,change_vnd FROM payments WHERE order_id=? ORDER BY created_at LIMIT 1",r.order_id);
   // Mark uncertain BEFORE any I/O so a crash cannot trigger an untracked duplicate.
   db.run("UPDATE receipts SET status='UNKNOWN',attempts=attempts+1 WHERE id=?",r.id);
   const payload=this.render(o,r,p);
   try{
    await this.send(payload);
    db.run("UPDATE receipts SET status='SENT' WHERE id=?",r.id);
   }catch(err){console.error('Receipt send uncertain; manual inspection required',r.id);/* Keep UNKNOWN */}
  }finally{this.running=false}
 }
 private render(o:any,r:any,p:any):Buffer{
  const lines:{left:string;right?:string;size?:'large'}[]=[
   {left:'BÁNH MÌ CHỢ',size:'large'},{left:r.kind==='CUSTOMER'?'LIÊN KHÁCH':'LIÊN TIỆM'},
   {left:'Mã đơn: '+o.display_code},{left:new Date(o.created_at).toLocaleString('vi-VN')},
   {left:'-------------------------------------'}];
  for(const item of JSON.parse(o.lines_json) as Array<{name_snapshot:string;qty:number;line_total_vnd:number;note:string}>){
   lines.push({left:item.name_snapshot+' × '+item.qty,right:formatVnd(item.line_total_vnd)});
   if(item.note&&r.kind==='STORE')lines.push({left:'  Ghi chú: '+item.note});
  }
  lines.push({left:'-------------------------------------'});
  lines.push({left:'TỔNG',right:formatVnd(o.total_vnd),size:'large'});
  lines.push({left:'TRẠNG THÁI: ĐÃ THANH TOÁN'});
  if(r.kind==='STORE'&&p){lines.push({left:'Khách đưa',right:formatVnd(p.tendered_vnd)},{left:'Tiền thối',right:formatVnd(p.change_vnd)})}
  if(r.attempts>0)lines.push({left:'*** BẢN IN LẠI ***',size:'large'});
  lines.push({left:'Cảm ơn quý khách!'});
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
