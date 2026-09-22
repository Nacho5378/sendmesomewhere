import {timingSafeEqual} from 'node:crypto';
import {rpc} from '@/lib/db';
import {whopRequestWith} from '@/lib/whop.mjs';
export const runtime='nodejs';
const BASE='https://sandbox-api.whop.com/api/v1';
function authorized(request:Request){
 const expected=process.env.WHOP_SANDBOX_TEST_TOKEN||'',actual=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!expected||expected.length!==actual.length)return false;
 return timingSafeEqual(Buffer.from(expected),Buffer.from(actual));
}
export async function POST(request:Request){
 if(process.env.WHOP_SANDBOX_E2E_ENABLED!=='true')return new Response('Sandbox test closed',{status:410});
 if(!authorized(request))return new Response('Unauthorized',{status:401});
 const key=process.env.WHOP_SANDBOX_API_KEY,account=process.env.WHOP_SANDBOX_ACCOUNT_ID,plan=process.env.WHOP_SANDBOX_WILDCARD_PLAN_ID,origin=process.env.SANDBOX_TEST_ORIGIN;
 if(!key||!account||!plan||!origin)return new Response('Sandbox checkout not configured',{status:503});
 try{
  const reservation=await rpc<{id:string;priceCents:number}>('sms_sandbox_reserve',{p_name:'Sandbox E2E Sponsor',p_plan:plan});
  const config=await whopRequestWith(BASE,key,'/checkout_configurations',{method:'POST',headers:{'Idempotency-Key':reservation.id},body:JSON.stringify({account_id:account,plan_id:plan,mode:'payment',metadata:{reservation_id:reservation.id},redirect_url:new URL('/?sandbox=returned',origin).href})});
  if(config.account_id!==account||config.plan?.id!==plan||config.plan?.plan_type!=='one_time'||config.plan?.currency!=='usd'||Math.round(Number(config.plan?.initial_price)*100)!==reservation.priceCents)throw new Error('Sandbox checkout verification failed');
  const url=new URL(config.purchase_url);if(url.protocol!=='https:'||!(url.hostname==='sandbox.whop.com'||url.hostname.endsWith('.sandbox.whop.com')))throw new Error('Invalid sandbox checkout URL');
  await rpc('sms_sandbox_bind_checkout',{p_id:reservation.id,p_checkout:config.id});
  return Response.json({url:url.href},{headers:{'Cache-Control':'no-store'}});
 }catch{return new Response('Sandbox checkout unavailable',{status:409})}
}
