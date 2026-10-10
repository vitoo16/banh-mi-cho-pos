import {createHmac,timingSafeEqual} from 'node:crypto';
export interface SepayTransfer {id:number;accountNumber:string;transferType:string;transferAmount:number;code:string|null;content:string;referenceCode:string;gateway:string}
export function verifySepayWebhook(rawBody:Buffer,signature:unknown,timestamp:unknown,secret:string,at=Date.now()):boolean{
 if(!secret||secret.length<32||typeof signature!=='string'||typeof timestamp!=='string'||!/^[0-9]{10}$/.test(timestamp)||!/^sha256=[0-9a-f]{64}$/i.test(signature))return false;
 const t=Number(timestamp);if(Math.abs(Math.floor(at/1000)-t)>300)return false;
 const expected='sha256='+createHmac('sha256',secret).update(timestamp+'.').update(rawBody).digest('hex');
 const a=Buffer.from(signature.toLowerCase()),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export function parseSepayTransfer(input:unknown):SepayTransfer{
 const p=input as Record<string,unknown>|null;
 if(!p||!Number.isSafeInteger(p.id)||Number(p.id)<1||typeof p.accountNumber!=='string'||typeof p.transferType!=='string'||typeof p.transferAmount!=='number'||!Number.isSafeInteger(p.transferAmount)||p.transferAmount<=0||typeof p.content!=='string')throw new Error('INVALID_TRANSFER');
 return {id:Number(p.id),accountNumber:p.accountNumber,transferType:p.transferType,transferAmount:p.transferAmount,code:typeof p.code==='string'?p.code:null,content:p.content,referenceCode:typeof p.referenceCode==='string'?p.referenceCode:'',gateway:typeof p.gateway==='string'?p.gateway:''};
}
export function findExactMemoReference(content:string,reference:string,code:string|null){
 if(code===reference)return true;
 const tokens=content.toUpperCase().match(/BMC[A-F0-9]{16}/g)||[];
 return tokens.length===1&&tokens[0]===reference;
}
