import {createHash} from 'node:crypto';
import {rpc} from '@/lib/db';
import {whopRequest} from '@/lib/whop.mjs';
import {RELEASE_APPROVED} from '@/lib/release';
import recordedPlans from '@/lib/whop-plans.json';
export const runtime='nodejs';
export async function POST(request:Request){
 if(!RELEASE_APPROVED||process.env.PAYMENTS_ENABLED!=='true')return Response.json({error:'The auction has not launched. No payments are being accepted.'},{status:423});
 const origin=process.env.SITE_URL;if(!origin||request.headers.get('origin')!==new URL(origin).origin)return Response.json({error:'Invalid request origin.'},{status:403});
 if(Number(request.headers.get('content-length')||0)>4096)return new Response(null,{status:413});
 let body;try{const raw=await request.text();if(raw.length>4096)return new Response(null,{status:413});body=JSON.parse(raw)}catch{return Response.json({error:'Invalid request.'},{status:400})}
 if(typeof body.positionId!=='string'||!/^[-a-z]{3,30}$/.test(body.positionId)||typeof body.sponsorName!=='string'||body.sponsorName.trim().length<2||body.sponsorName.trim().length>60||/[\u0000-\u001f<>]/.test(body.sponsorName))return Response.json({error:'Enter a valid position and public sponsor name.'},{status:400});
 try{
 const plans:Record<string,string>=process.env.WHOP_PLAN_IDS_JSON ? JSON.parse(process.env.WHOP_PLAN_IDS_JSON) : recordedPlans;const planId=plans[body.positionId];if(!planId||!process.env.WHOP_ACCOUNT_ID)throw new Error('Checkout setup incomplete');
 const clientKey=createHash('sha256').update(`${process.env.RATE_LIMIT_SALT}:${request.headers.get('x-vercel-forwarded-for')||'unknown'}`).digest('hex');
 const reservation=await rpc<{id:string;priceCents:number}>('sms_reserve',{p_position:body.positionId,p_name:body.sponsorName.trim(),p_client:clientKey,p_plan:planId});
 // Only preconfigured, verified one-time USD plans are allowed. No price from the browser is trusted.
 const config=await whopRequest('/checkout_configurations',{method:'POST',headers:{'Idempotency-Key':reservation.id},body:JSON.stringify({account_id:process.env.WHOP_ACCOUNT_ID,plan_id:planId,mode:'payment',metadata:{reservation_id:reservation.id},redirect_url:new URL('/?checkout=returned',origin).href})});
 if(config.account_id!==process.env.WHOP_ACCOUNT_ID||config.plan?.id!==planId||config.plan?.plan_type!=='one_time'||config.plan?.currency!=='usd'||Math.round(Number(config.plan?.initial_price)*100)!==reservation.priceCents)throw new Error('Checkout price verification failed');
 const url=new URL(config.purchase_url);if(url.protocol!=='https:'||!(url.hostname==='whop.com'||url.hostname.endsWith('.whop.com')))throw new Error('Invalid checkout URL');
 await rpc('sms_bind_checkout',{p_id:reservation.id,p_checkout:config.id});
 return Response.json({url:url.href},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'This position cannot be checked out right now. Please try again later.'},{status:409})}
}
