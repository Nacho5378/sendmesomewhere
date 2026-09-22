import {createHmac,timingSafeEqual} from 'node:crypto';
export const API_VERSION='2026-09-15';
export function verifyWebhook(raw,headers,secret,now=Date.now()){
 const id=headers.get('webhook-id'),stamp=headers.get('webhook-timestamp'),sig=headers.get('webhook-signature');
 if(!secret||!id||!stamp||!sig||!/^\d+$/.test(stamp)||Math.abs(now/1000-Number(stamp))>300)throw new Error('Invalid webhook');
 // Current Whop docs specify the complete ws_ secret as the HMAC key.
 const expected=createHmac('sha256',secret).update(`${id}.${stamp}.${raw}`).digest();
 const valid=sig.split(/\s+/).some(part=>{const [version,value]=part.split(',');if(version!=='v1'||!value)return false;const actual=Buffer.from(value,'base64');return actual.length===expected.length&&timingSafeEqual(actual,expected)});
 if(!valid)throw new Error('Invalid webhook');
 const event=JSON.parse(raw);if(event.id!==id)throw new Error('Webhook id mismatch');return event;
}
export function usdCents(money){
 if(!money||money.currency!=='usd'||money.decimals!==2||typeof money.amount!=='string'||!/^\d+(\.\d{1,2})?$/.test(money.amount))throw new Error('Unsupported payment amount');
 const [dollars,fraction='']=money.amount.split('.');const cents=Number(dollars)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents))throw new Error('Invalid payment amount');return cents;
}
function paymentCents(value,currency){
 if(typeof value==='number'){
  const cents=Math.round(value*100);
  if(currency!=='usd'||!Number.isFinite(value)||value<0||!Number.isSafeInteger(cents)||Math.abs(cents/100-value)>0.000001)throw new Error('Unsupported payment amount');
  return cents;
 }
 return usdCents(value);
}
export function normalizePayment(payment,account){
 const paymentAccount=payment.account_id??payment.company?.id;
 if(paymentAccount!==account||payment.status!=='paid'||payment.substatus!=='succeeded'||payment.auto_refunded||payment.refunded_at)throw new Error('Payment is not eligible for ownership');
 if(payment.refunded_amount&&paymentCents(payment.refunded_amount,payment.currency)!==0)throw new Error('Payment was refunded');
 if(payment.discount_amount&&paymentCents(payment.discount_amount,payment.currency)!==0)throw new Error('Discounted payments require review');
 const planId=payment.plan_id??payment.plan?.id;
 if(!/^pay_[a-zA-Z0-9]+$/.test(payment.id)||!/^ch_[a-zA-Z0-9]+$/.test(payment.checkout_configuration_id)||!/^plan_[a-zA-Z0-9]+$/.test(planId)||!payment.metadata?.reservation_id||!Number.isFinite(Date.parse(payment.paid_at)))throw new Error('Missing payment binding');
 return {paymentId:payment.id,reservationId:payment.metadata.reservation_id,checkoutId:payment.checkout_configuration_id,planId,amountCents:paymentCents(payment.subtotal,payment.currency),paidAt:payment.paid_at};
}
export async function whopRequest(path,options={}){
 const key=process.env.WHOP_API_KEY;if(!key)throw new Error('Whop is not configured');
 return whopRequestWith('https://api.whop.com/api/v1',key,path,options);
}
export async function whopRequestWith(baseUrl,key,path,options={}){
 if(!key)throw new Error('Whop is not configured');
 const res=await fetch(`${baseUrl.replace(/\/$/,'')}${path}`,{...options,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Api-Version-Date':API_VERSION,...options.headers},signal:AbortSignal.timeout(8000),cache:'no-store'});
 if(!res.ok)throw new Error(`Whop request failed (${res.status})`);return res.json();
}
