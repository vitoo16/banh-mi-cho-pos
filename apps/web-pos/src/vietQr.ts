/** QR encodes payment *instructions*, never bank settlement proof.
 * Bank details come only from Hub POST /v1/orders/:id/payments/bank-intent.
 * SePay public QR image endpoint, docs: https://developer.sepay.vn/vi/tien-ich-khac/tao-qr-code
 */
export interface TransferIntent {
 status:string;
 bank_code:string;
 account_number:string;
 amount_vnd:number;
 reference:string;
}

export function vietQrImageUrl(intent:TransferIntent):string|null{
 // Strict allow-list before sending a URL to an external QR image service.
 if(intent.status!=='PENDING')return null;
 const bank=intent.bank_code?.trim();
 const account=intent.account_number?.trim();
 const reference=intent.reference?.trim().toUpperCase();
 if(typeof bank!=='string'||!(/^[0-9]{6}$/.test(bank)||/^[A-Za-z][A-Za-z0-9]{1,24}$/.test(bank)))return null;
 if(typeof account!=='string'||!/^[A-Za-z0-9]{1,19}$/.test(account))return null;
 if(typeof reference!=='string'||!/^[A-Z0-9]{8,50}$/.test(reference))return null;
 if(!Number.isSafeInteger(intent.amount_vnd)||intent.amount_vnd<=0||intent.amount_vnd>9_999_999_999_999)return null;
 const query=new URLSearchParams({
  acc:account,bank,amount:String(intent.amount_vnd),des:reference,template:'qronly',
 });
 return 'https://vietqr.app/img?'+query.toString();
}
