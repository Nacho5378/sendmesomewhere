import {verifyWebhook,whopRequest,normalizePayment,API_VERSION} from '@/lib/whop.mjs';
import {rpc} from '@/lib/db';
export const runtime='nodejs';
export async function POST(request:Request){
 if(!process.env.WHOP_WEBHOOK_SECRET)return new Response('Webhook not configured',{status:503});
 if(Number(request.headers.get('content-length')||0)>262144)return new Response(null,{status:413});
 let event;try{const raw=await request.text();if(raw.length>262144)return new Response(null,{status:413});event=verifyWebhook(raw,request.headers,process.env.WHOP_WEBHOOK_SECRET)}catch{return new Response('Invalid signature',{status:401})}
 if(event.account_id!==process.env.WHOP_ACCOUNT_ID||event.api_version_date!==API_VERSION||event.api_version!=='v1')return new Response('Incorrect webhook scope or version',{status:400});
 if(event.type!=='payment.succeeded')return new Response('Ignored',{status:200});
 const id=event.data?.id;if(typeof id!=='string'||!/^pay_[a-zA-Z0-9]+$/.test(id))return new Response('Invalid payment id',{status:400});
 try{
 // Independently retrieve authoritative payment state; redirect URLs never grant ownership.
 const payment=await whopRequest(`/payments/${encodeURIComponent(id)}`);
 let normalized;
 try{normalized=normalizePayment(payment,process.env.WHOP_ACCOUNT_ID)}catch{
 await rpc('sms_payment_review',{p_event:event.id,p_payment:id,p_reason:'Payment eligibility or schema needs review'});
 return new Response('Recorded for review',{status:200});}
 await rpc('sms_apply_payment',{p_event:event.id,p_payment:normalized.paymentId,p_reservation:normalized.reservationId,p_checkout:normalized.checkoutId,p_plan:normalized.planId,p_amount:normalized.amountCents,p_paid_at:normalized.paidAt});
 return new Response('OK',{status:200});
 }catch{return new Response('Retry required',{status:503})}
}
