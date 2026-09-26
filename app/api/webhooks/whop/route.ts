import {verifyWebhook,whopRequest,normalizePayment,normalizeSupportPayment,API_VERSION} from '@/lib/whop.mjs';
import {rpc} from '@/lib/db';
export const runtime='nodejs';
const log=(stage:string,eventId?:string,paymentId?:string)=>console.info(JSON.stringify({service:'whop-webhook',stage,eventId,paymentId}));
export async function POST(request:Request){
 if(!process.env.WHOP_WEBHOOK_SECRET)return new Response('Webhook not configured',{status:503});
 if(Number(request.headers.get('content-length')||0)>262144)return new Response(null,{status:413});
 let event;try{const raw=await request.text();if(raw.length>262144)return new Response(null,{status:413});event=verifyWebhook(raw,request.headers,process.env.WHOP_WEBHOOK_SECRET)}catch{return new Response('Invalid signature',{status:401})}
 const eventAccount=event.account_id??event.company_id;
 const versionDateAccepted=event.api_version_date==null||event.api_version_date===API_VERSION;
 if(eventAccount!==process.env.WHOP_ACCOUNT_ID||!versionDateAccepted||event.api_version!=='v1')return new Response('Incorrect webhook scope or version',{status:400});
 if(event.type!=='payment.succeeded')return new Response('Ignored',{status:200});
 const id=event.data?.id;if(typeof id!=='string'||!/^pay_[a-zA-Z0-9]+$/.test(id))return new Response('Invalid payment id',{status:400});
 try{
  // Support payments are retrieved with the dedicated support key; corporate remains on the existing key.
  const supportEvent=!!event.data?.metadata?.support_checkout_id;
  const apiKey=supportEvent?process.env.WHOP_SUPPORT_API_KEY:process.env.WHOP_API_KEY;
  if(!apiKey)throw new Error('Whop key missing');
  const payment=await whopRequest(`/payments/${encodeURIComponent(id)}`,{apiKey});
  if(payment.id!==id)throw new Error('Payment identity mismatch');
  if(payment.metadata?.support_checkout_id){
   let normalized;
   try{normalized=normalizeSupportPayment(payment,process.env.WHOP_ACCOUNT_ID)}catch{
    await rpc('sms_support_payment_review',{p_event:event.id,p_payment:id,p_reason:'Support payment eligibility or schema needs review'});
    log('support_review',event.id,id);
    return new Response('Recorded for review',{status:200});
   }
   const outcome=await rpc('sms_support_apply_payment',{p_event:event.id,p_payment:normalized.paymentId,p_support_checkout:normalized.supportCheckoutId,p_checkout:normalized.checkoutId,p_amount:normalized.amountCents,p_paid_at:normalized.paidAt,p_supporter_key:normalized.supporterKey});
   log(`support_${String(outcome)}`,event.id,id);
   return new Response('OK',{status:200});
  }
  let normalized;
  try{normalized=normalizePayment(payment,process.env.WHOP_ACCOUNT_ID)}catch{
   await rpc('sms_payment_review',{p_event:event.id,p_payment:id,p_reason:'Payment eligibility or schema needs review'});
   log('review',event.id,id);
   return new Response('Recorded for review',{status:200});
  }
  const outcome=await rpc('sms_apply_payment',{p_event:event.id,p_payment:normalized.paymentId,p_reservation:normalized.reservationId,p_checkout:normalized.checkoutId,p_plan:normalized.planId,p_amount:normalized.amountCents,p_paid_at:normalized.paidAt});
  log(String(outcome),event.id,id);
  return new Response('OK',{status:200});
 }catch{log('processing_failed_retry_required',event.id,id);return new Response('Retry required',{status:503})}
}
