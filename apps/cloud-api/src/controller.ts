import {Controller,Get,Post,Body,Req,Headers,Query,HttpException,HttpCode} from '@nestjs/common';import {CloudService,CloudError} from './service';import {verifySepayWebhook,parseSepayTransfer} from './sepay';
@Controller('v1')
export class CloudController{
 constructor(private s:CloudService){}
 private async safe<T>(fn:()=>Promise<T>):Promise<T>{try{return await fn()}catch(e){if(e instanceof CloudError)throw new HttpException({code:e.code,message:e.message},e.status);throw e}}
 @Post('sync/events')@HttpCode(200)events(@Req()req:any,@Body()body:any){return this.safe(()=>{this.s.authorize(req.headers.authorization);return this.s.ingest(body?.events)})}
 @Get('sync/settlements')settlements(@Req()req:any,@Query('after')after?:string){return this.safe(()=>{this.s.authorize(req.headers.authorization);return this.s.settlements(after)})}
 @Get('sync/exceptions')exceptions(@Req()req:any){return this.safe(()=>{this.s.authorize(req.headers.authorization);return this.s.exceptions()})}
 @Post('webhooks/sepay')@HttpCode(200)sepay(@Req()req:any,@Body()body:unknown,@Headers('x-sepay-signature')sig:unknown,@Headers('x-sepay-timestamp')ts:unknown){
  const secret=process.env.SEPAY_WEBHOOK_SECRET||'',raw=req.rawBody as Buffer|undefined;
  if(!raw||!verifySepayWebhook(raw,sig,ts,secret))throw new HttpException({success:false,code:'INVALID_SIGNATURE'},401);
  let payload;
  try{payload=parseSepayTransfer(body)}catch{throw new HttpException({success:false,code:'INVALID_PAYLOAD'},400)}
  return this.safe(()=>this.s.webhook(payload));
 }
}
