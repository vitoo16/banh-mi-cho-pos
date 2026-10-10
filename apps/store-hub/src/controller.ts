import {Controller,Get,Post,Patch,Body,Param,Req,Headers,Query,HttpException} from '@nestjs/common';
import {StoreService,StoreError} from './service';
@Controller('v1')
export class StoreController {
 constructor(private readonly s:StoreService){}
 private call<T>(fn:()=>T):T{try{return fn()}catch(e:any){if(e instanceof StoreError)throw new HttpException({code:e.code,message:e.message},e.status);if(e?.message&&['INVALID_MONEY','INVALID_QUANTITY','INSUFFICIENT_CASH'].includes(e.message))throw new HttpException({code:e.message,message:e.message},422);throw e}}
 @Get('health') health(){return {status:'ok',mode:'PILOT_LOCAL',bank_integration:'DISABLED',printing:'UNVERIFIED'}}
 @Post('auth/login')login(@Body()b:any){return this.call(()=>this.s.login(b?.user_id,b?.pin))}
 @Get('catalog')catalog(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization);return this.s.catalog()})}
 @Get('orders')orders(@Req()r:any){return this.call(()=>this.s.orders(this.s.actor(r.headers.authorization)))}
 @Get('orders/history')history(@Req()r:any,@Query('cursor')cursor?:string,@Query('limit')limit?:string){return this.call(()=>this.s.history(this.s.actor(r.headers.authorization),cursor,limit?Number(limit):100))}
 @Get('orders/:id')order(@Req()r:any,@Param('id')id:string){return this.call(()=>this.s.order(this.s.actor(r.headers.authorization),id))}
 @Post('orders')create(@Req()r:any,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.createOrder(this.s.actor(r.headers.authorization),b,key))}
 @Post('orders/:id/void')voidOrder(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.voidOrder(this.s.actor(r.headers.authorization,['OWNER','CASHIER']),id,b,key))}
 @Get('cash-shifts/current')shift(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization,['OWNER','CASHIER']);return this.s.currentShift()})}
 @Post('cash-shifts/open')open(@Req()r:any,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.openShift(this.s.actor(r.headers.authorization,['CASHIER']),b,key))}
 @Post('cash-shifts/:id/movements')movement(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.movement(this.s.actor(r.headers.authorization,['CASHIER']),id,b,key))}
 @Post('cash-shifts/:id/close')close(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.closeShift(this.s.actor(r.headers.authorization,['CASHIER']),id,b,key))}
 @Post('orders/:id/payments/cash')cash(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.cash(this.s.actor(r.headers.authorization,['CASHIER']),id,b,key))}
 @Post('orders/:id/refunds/cash')refundCash(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.refundCash(this.s.actor(r.headers.authorization,['CASHIER']),id,b,key))}
 @Post('orders/:id/payments/bank-intent')bank(@Req()r:any,@Param('id')id:string,@Headers('idempotency-key')key:string){return this.call(()=>this.s.bankIntent(this.s.actor(r.headers.authorization,['CASHIER']),id,key))}
 @Post('internal/bank-events')bankEvent(@Body()body:any,@Headers('x-bmc-timestamp')ts:string,@Headers('x-bmc-signature')sig:string){return this.call(()=>this.s.bankEvent(JSON.stringify(body),ts,sig))}
 @Get('owner/bank-exceptions')bankExceptions(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization,['OWNER']);return this.s.bankExceptions()})}
 @Get('orders/:id/receipts')receipts(@Req()r:any,@Param('id')id:string){return this.call(()=>this.s.receipts(this.s.actor(r.headers.authorization,['OWNER','CASHIER']),id))}
 @Post('receipt-copies/:id/reprint')reprint(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.reprint(this.s.actor(r.headers.authorization,['CASHIER']),id,b,key))}
 @Get('owner/employees')employees(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization,['OWNER']);return this.s.employees()})}
 @Post('owner/employees')addEmployee(@Req()r:any,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.addEmployee(this.s.actor(r.headers.authorization,['OWNER']),b,key))}
 @Patch('owner/employees/:id')employeeState(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.setEmployeeActive(this.s.actor(r.headers.authorization,['OWNER']),id,b,key))}
 @Get('owner/dashboard')summary(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization,['OWNER']);return this.s.summary()})}
 @Get('owner/products')products(@Req()r:any){return this.call(()=>{this.s.actor(r.headers.authorization,['OWNER']);return this.s.allProducts()})}
 @Post('owner/products')addProduct(@Req()r:any,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.createProduct(this.s.actor(r.headers.authorization,['OWNER']),b,key))}
 @Patch('owner/products/:id')updateProduct(@Req()r:any,@Param('id')id:string,@Body()b:any,@Headers('idempotency-key')key:string){return this.call(()=>this.s.updateProduct(this.s.actor(r.headers.authorization,['OWNER']),id,b,key))}
}
