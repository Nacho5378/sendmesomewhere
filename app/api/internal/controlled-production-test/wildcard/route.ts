import {createHash} from 'node:crypto';
import {controlledTestAuthorized} from '@/lib/controlled-test';
import {rpc} from '@/lib/db';
import {whopRequest} from '@/lib/whop.mjs';
import recordedPlans from '@/lib/whop-plans.json';

export const runtime='nodejs';
const privateHeaders={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive'};

export async function POST(request:Request){
 if(!controlledTestAuthorized(request))return Response.json({error:'Not found'},{status:404,headers:privateHeaders});
 try{
  const planId=(process.env.WHOP_PLAN_IDS_JSON?JSON.parse(process.env.WHOP_PLAN_IDS_JSON):recordedPlans).wildcard;
  const sponsorName=process.env.PRODUCTION_E2E_SPONSOR_NAME||'Send Me Somewhere E2E Test';
  if(planId!=='plan_8x39ZI3KtNaSe'||process.env.WHOP_ACCOUNT_ID!=='biz_l9YXvnbpgpyuVv')throw new Error('Production binding mismatch');
  const client=createHash('sha256').update(`controlled-production-e2e:${process.env.WHOP_PRODUCTION_TEST_TOKEN}`).digest('hex');
  const reservation=await rpc<{id:string;priceCents:number;checkoutId:string|null}>('sms_reserve_controlled_wildcard',{p_name:sponsorName,p_client:client,p_plan:planId});
  if(reservation.priceCents!==25000)throw new Error('Wildcard price mismatch');
  const origin=process.env.SITE_URL;if(!origin)throw new Error('Site URL missing');
  const config=await whopRequest('/checkout_configurations',{method:'POST',headers:{'Idempotency-Key':reservation.id},body:JSON.stringify({
   account_id:process.env.WHOP_ACCOUNT_ID,plan_id:planId,mode:'payment',
   metadata:{reservation_id:reservation.id,test_scope:'controlled-production-e2e',position_id:'wildcard'},
   redirect_url:new URL('/?checkout=controlled-test-returned',origin).href
  })});
  if(config.account_id!==process.env.WHOP_ACCOUNT_ID||config.plan?.id!==planId||config.plan?.plan_type!=='one_time'||config.plan?.currency!=='usd'||Math.round(Number(config.plan?.initial_price)*100)!==25000)throw new Error('Checkout verification failed');
  if(reservation.checkoutId&&reservation.checkoutId!==config.id)throw new Error('Checkout binding mismatch');
  const url=new URL(config.purchase_url);if(url.protocol!=='https:'||!(url.hostname==='whop.com'||url.hostname.endsWith('.whop.com')))throw new Error('Invalid checkout URL');
  if(!reservation.checkoutId)await rpc('sms_bind_checkout',{p_id:reservation.id,p_checkout:config.id});
  return Response.json({state:reservation.checkoutId?'ready':'created',checkoutId:config.id,url:url.href},{headers:privateHeaders});
 }catch(error){
  console.error(JSON.stringify({service:'controlled-production-e2e',stage:'checkout_failed',message:error instanceof Error?error.message:'unknown'}));
  return Response.json({error:'Controlled checkout could not be prepared.'},{status:409,headers:privateHeaders});
 }
}
