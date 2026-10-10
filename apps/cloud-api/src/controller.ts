import {Controller,Get,Post,Body,Req,Headers,Query} from '@nestjs/common';
import {CloudService} from './service';
@Controller('v1')
export class CloudController{
 constructor(private readonly s:CloudService){}
 @Get('health')health(){return {status:'ok',cloud_owner_mode:'read_only',bank_provider:'UNVERIFIED'}}
 @Post('auth/login')login(@Body()b:any){return this.s.login(b?.user_id,b?.pin)}
 @Post('sync/events')receive(@Body()b:any,@Headers('x-bmc-timestamp')ts:string,@Headers('x-bmc-signature')sig:string,@Headers('x-bmc-store')store:string){return this.s.ingest(b?.events,ts,sig,store)}
 @Get('owner/dashboard')dashboard(@Req()r:any){this.s.authorize(r.headers.authorization);return this.s.summary()}
 @Get('owner/products')products(@Req()r:any){this.s.authorize(r.headers.authorization);return this.s.products()}
 @Get('orders')orders(@Req()r:any){this.s.authorize(r.headers.authorization);return this.s.orders()}
 @Get('orders/history')history(@Req()r:any,@Query('cursor')cursor?:string){this.s.authorize(r.headers.authorization);return this.s.orderHistory(cursor)}
 @Get('owner/employees')employees(@Req()r:any){this.s.authorize(r.headers.authorization);return []}
 @Get('owner/bank-exceptions')exceptions(@Req()r:any){this.s.authorize(r.headers.authorization);return []}
}
