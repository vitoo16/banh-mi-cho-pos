/** Pure money and payment rules. VND integer math only. */
export const ensureMoney=(value:unknown,allowZero=true):number=>{
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>1_000_000_000||(!allowZero&&value===0))throw new Error('INVALID_MONEY');
 return value;
};
export const ensureQty=(n:unknown):number=>{
 if(!Number.isSafeInteger(n)||Number(n)<1||Number(n)>100)throw new Error('INVALID_QUANTITY');
 return Number(n);
};
export function makeCashSettlement(due:number,tendered:number){
 ensureMoney(due,false);ensureMoney(tendered);
 if(tendered<due)throw new Error('INSUFFICIENT_CASH');
 return {tendered,change:tendered-due,net:due};
}
export function closingCash(opening:number,movements:number[]){
 ensureMoney(opening);const total=movements.reduce((sum,v)=>sum+v,opening);
 if(!Number.isSafeInteger(total))throw new Error('INVALID_MONEY');
 return total;
}
