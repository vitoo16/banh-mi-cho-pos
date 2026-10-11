import {Controller,Get,Post,Patch,Body,Param,Req,Headers,Query,HttpException} from '@nestjs/common';
import {StoreService,StoreError} from './service';
@Controller('v1')
export class StoreController {
 constructor(private readonly s:StoreService){}
 private call<T>(fn:()=>T):T{try{return fn()}catch(e:any){if(e instanceof StoreError)throw new HttpException({code:e.code,message:e.message},e.status);if(e?.message&&['INVALID_MONEY','INVALID_QUANTITY','INSUFFICIENT_CASH'].includes(e.message))throw new HttpException({code:e.message,message:e.message},422);throw e}}
 @Get('health') health(){return {status:'ok',mode:'PILOT_LOCAL',bank_integration:process.env.BANK_BRIDGE_SECRET?'BRIDGE_CONFIGURED_PROVIDER_UNVERIFIED':'DISABLED',printing:'UNVERIFIED'}}
 @Get('cashier/operational-status')operations(@Req()r:any){return this.call(()=>this.s.operationalStatus(this.s.actor(r.headers.authorization,['CASHIER','OWNER'],r.headers['x-device-token'])))}
 @Post('auth/login')login(@Req()r:any,@Body()b:any){return this.call(()=>this.s.login(b?.user_id,b?.pin,b?.pairing_code,r?.headers?.['x-device-token']))}
 @Post('auth/logout')logout(@Req()r:any){return this.call(()=>this.s.logout(r.headers.authorization,r.headers['x-device-token']))}
 @Get('catalog')catalog(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization,undefined,r.headers['x-device-token']);return this.s.catalog()})}
 @Get('orders')orders(@Req()r:any){return this.call(()=>this.s.orders(this.s.actor(r.headers.authorization,undefined,r.headers['x-device-token'])))}
 @Get('orders/history')history(@Req()r:any,@Query('cursor')cursor?:string,@Query('limit')limit?:string){return this.call(()=>this.s.history(this.s.actor(r.headers.authorization,undefined,r.headers['x-device-token']),cursor,limit?Number(limit):100))}
 @Get('orders/:id')order(@Req()r:any,@Param('id')id:string){return this.call(()=>this.s.order(this.s.actor(r.headers.authorization,undefined,r.headers['x-device-token']),id))}
 @Post('orders')create(@Req()r:any,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.createOrder(this.s.actor(r.headers.authorization,undefined,r.headers['x-device-token']),b,key))}
 @Post('orders/:id/void')voidOrder(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.voidOrder(this.s.actor(r.headers.authorization,['OWNER','CASHIER'],r.headers['x-device-token']),id,b,key))}
 @Get('cash-shifts/current')shift(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization,['OWNER','CASHIER'],r.headers['x-device-token']);return this.s.currentShift()})}
 @Post('cash-shifts/open')open(@Req()r:any,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.openShift(this.s.actor(r.headers.authorization,['CASHIER'],r.headers['x-device-token']),b,key))}
 @Post('cash-shifts/:id/movements')movement(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.movement(this.s.actor(r.headers.authorization,['CASHIER'],r.headers['x-device-token']),id,b,key))}
 @Post('cash-shifts/:id/close')close(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.closeShift(this.s.actor(r.headers.authorization,['CASHIER'],r.headers['x-device-token']),id,b,key))}
 @Post('orders/:id/payments/cash')cash(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.cash(this.s.actor(r.headers.authorization,['CASHIER'],r.headers['x-device-token']),id,b,key))}
 @Post('orders/:id/refunds/cash')refundCash(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.refundCash(this.s.actor(r.headers.authorization,['CASHIER'],r.headers['x-device-token']),id,b,key))}
 @Post('orders/:id/payments/bank-intent')bank(@Req()r:any,@Param('id')id:string,@Headers('idempotency-key')key:string){return this.call(()=>this.s.bankIntent(this.s.actor(r.headers.authorization,['CASHIER'],r.headers['x-device-token']),id,key))}
 @Post('internal/bank-events')bankEvent(@Body()body:any,@Headers('x-bmc-timestamp')ts:string,@Headers('x-bmc-signature')sig:string){return this.call(()=>this.s.bankEvent(JSON.stringify(body),ts,sig))}
 @Get('owner/bank-exceptions')bankExceptions(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization,['OWNER'],r.headers['x-device-token']);return this.s.bankExceptions()})}
 @Get('orders/:id/receipts')receipts(@Req()r:any,@Param('id')id:string){return this.call(()=>this.s.receipts(this.s.actor(r.headers.authorization,['OWNER','CASHIER'],r.headers['x-device-token']),id))}
 @Post('receipt-copies/:id/reprint')reprint(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.reprint(this.s.actor(r.headers.authorization,['CASHIER'],r.headers['x-device-token']),id,b,key))}
 @Post('owner/device-pairings')issuePairing(@Req()r:any,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.issuePairing(this.s.actor(r.headers.authorization,['OWNER']),b?.label,key))}
 @Get('owner/devices')devices(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization,['OWNER']);return this.s.devices()})}
 @Post('owner/devices/:id/revoke')revokeDevice(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.revokeDevice(this.s.actor(r.headers.authorization,['OWNER']),id,b?.reason,key))}
 @Get('owner/employees')employees(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization,['OWNER'],r.headers['x-device-token']);return this.s.employees()})}
 @Post('owner/employees')addEmployee(@Req()r:any,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.addEmployee(this.s.actor(r.headers.authorization,['OWNER'],r.headers['x-device-token']),b,key))}
 @Patch('owner/employees/:id')employeeState(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.setEmployeeActive(this.s.actor(r.headers.authorization,['OWNER'],r.headers['x-device-token']),id,b,key))}
 @Get('owner/analytics/today')today(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization,['OWNER'],r.headers['x-device-token']);return this.s.todayOrderCounts()})}
 @Get('owner/analytics/products')sales(@Req()r:any,@Query('period')period:string,@Query('date')date?:string){
  return this.call(()=>{
   this.s.actor(r.headers.authorization,['OWNER'],r.headers['x-device-token']);
   try{return this.s.productSales(period as import('@bmc/contracts').SalesPeriod,date)}
   catch(e){if(e instanceof Error&&['INVALID_PERIOD','INVALID_DATE'].includes(e.message))throw new StoreError(400,e.message,'Khoảng thời gian không hợp lệ');throw e}
  });
 }
 @Get('owner/dashboard')summary(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization,['OWNER'],r.headers['x-device-token']);return this.s.summary()})}
 @Get('owner/products')products(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization,['OWNER'],r.headers['x-device-token']);return this.s.allProducts()})}
 @Post('owner/products')addProduct(@Req()r:any,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.createProduct(this.s.actor(r.headers.authorization,['OWNER'],r.headers['x-device-token']),b,key))}
 @Patch('owner/products/:id')updateProduct(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.updateProduct(this.s.actor(r.headers.authorization,['OWNER'],r.headers['x-device-token']),id,b,key))}
}
