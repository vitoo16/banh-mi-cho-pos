import {Controller,Get,Post,Patch,Param,Body,Req,Headers,Query} from '@nestjs/common';
import {RemoteProductCommands} from './product-commands';
import {SePayService} from './sepay';import {CloudService} from './service';
@Controller('v1')
export class CloudController{
 constructor(private readonly s:CloudService,private readonly sepay:SePayService,private readonly productsCmd:RemoteProductCommands){}
 @Post('providers/sepay/webhook')sepayWebhook(@Req()r:any,@Headers('x-sepay-timestamp')stamp:string,@Headers('x-sepay-signature')signature:string){
  return this.sepay.receiveWebhook(r.rawBody,stamp,signature);
 }
 @Get('sync/settlements')bankInbox(@Req()r:any,@Query('after')after:string,@Headers('x-bmc-store')store:string,@Headers('x-bmc-timestamp')stamp:string,@Headers('x-bmc-signature')signature:string){
  return this.sepay.signedSettlements(after,store,stamp,signature);
 }
 @Get('health')health(){return {status:'ok',cloud_owner_mode:'read_only',bank_provider:'UNVERIFIED'}}
 @Post('auth/login')login(@Body()b:any,@Req()r:any){return this.s.login(b?.user_id,b?.pin,r.ip||'unknown')}
 @Post('auth/logout')logout(@Req()r:any){return this.s.logout(r.headers.authorization)}
 @Post('sync/events')receive(@Body()b:any,@Headers('x-bmc-timestamp')ts:string,@Headers('x-bmc-signature')sig:string,@Headers('x-bmc-store')store:string){return this.s.ingest(b?.events,ts,sig,store)}
 @Get('owner/dashboard')async dashboard(@Req()r:any){await this.s.authorize(r.headers.authorization);return this.s.summary()}
 @Get('owner/products')async products(@Req()r:any){await this.s.authorize(r.headers.authorization);return this.s.products()}
 @Patch('owner/products/:id')async updateProduct(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){
  await this.s.authorize(r.headers.authorization);return this.productsCmd.enqueue(id,b,key);
 }
 @Get('owner/product-commands')async productCommands(@Req()r:any){
  await this.s.authorize(r.headers.authorization);return this.productsCmd.list();
 }
 @Get('sync/product-commands')commands(@Headers('x-bmc-store')store:string,@Headers('x-bmc-timestamp')stamp:string,@Headers('x-bmc-signature')sig:string){
  return this.productsCmd.poll(store,stamp,sig);
 }
 @Post('sync/product-command-results')ackCommands(@Body()body:any,@Headers('x-bmc-store')store:string,@Headers('x-bmc-timestamp')stamp:string,@Headers('x-bmc-signature')sig:string){
  return this.productsCmd.acknowledge(body,stamp,sig,store);
 }
 @Get('orders')async orders(@Req()r:any){await this.s.authorize(r.headers.authorization);return this.s.orders()}
 @Get('orders/history')async history(@Req()r:any,@Query('cursor')cursor?:string){await this.s.authorize(r.headers.authorization);return this.s.orderHistory(cursor)}
 @Get('owner/employees')async employees(@Req()r:any){await this.s.authorize(r.headers.authorization);return []}
 @Get('owner/bank-exceptions')async exceptions(@Req()r:any){await this.s.authorize(r.headers.authorization);return this.s.bankExceptions()}
}
