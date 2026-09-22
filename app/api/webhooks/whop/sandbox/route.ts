import {verifyWebhook,whopRequestWith,normalizePayment,API_VERSION} from '@/lib/whop.mjs';
import {rpc} from '@/lib/db';
export const runtime='nodejs';
const BASE='https://sandbox-api.whop.com/api/v1';
const log=(stage:string,eventId?:string,paymentId?:string)=>console.info(JSON.stringify({service:'whop-sandbox-webhook',stage,eventId,paymentId}));
export async function POST(request:Request){
 if(process.env.WHOP_SANDBOX_E2E_ENABLED!=='true')return new Response('Sandbox test closed',{status:410});
 const secret=process.env.WHOP_SANDBOX_WEBHOOK_SECRET,key=process.env.WHOP_SANDBOX_API_KEY,account=process.env.WHOP_SANDBOX_ACCOUNT_ID;
 if(!secret||!key||!account)return new Response('Sandbox webhook not configured',{status:503});
 if(Number(request.headers.get('content-length')||0)>262144)return new Response(null,{status:413});
 let event;try{const raw=await request.text();if(raw.length>262144)return new Response(null,{status:413});event=verifyWebhook(raw,request.headers,secret)}catch{return new Response('Invalid signature',{status:401})}
 const eventAccount=event.account_id??event.company_id;
 const versionDateAccepted=event.api_version_date==null||event.api_version_date===API_VERSION;
 if(eventAccount!==account||!versionDateAccepted||event.api_version!=='v1')return new Response('Incorrect sandbox webhook scope or version',{status:400});
 if(event.type!=='payment.succeeded')return new Response('Ignored',{status:200});
 const id=event.data?.id;if(typeof id!=='string'||!/^pay_[a-zA-Z0-9]+$/.test(id))return new Response('Invalid payment id',{status:400});
 try{
  const payment=await whopRequestWith(BASE,key,`/payments/${encodeURIComponent(id)}`);
  let normalized;
  try{if(payment.id!==id)throw new Error('Payment identity mismatch');normalized=normalizePayment(payment,account)}catch{
   await rpc('sms_sandbox_payment_review',{p_event:event.id,p_payment:id,p_reason:'Sandbox payment eligibility or schema needs review',p_amount:0});
   log('review',event.id,id);return new Response('Recorded for review',{status:200});
  }
  const outcome=await rpc('sms_sandbox_apply_payment',{p_event:event.id,p_payment:normalized.paymentId,p_reservation:normalized.reservationId,p_checkout:normalized.checkoutId,p_plan:normalized.planId,p_amount:normalized.amountCents,p_paid_at:normalized.paidAt});
  log(String(outcome),event.id,id);return new Response(String(outcome),{status:200});
 }catch{log('processing_failed_retry_required',event.id,id);return new Response('Retry required',{status:503})}
}
