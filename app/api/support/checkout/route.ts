import {createHash} from 'node:crypto';
import {rpc} from '@/lib/db';
import {whopRequest} from '@/lib/whop.mjs';

export const runtime='nodejs';

const SOURCES=new Set(['instagram','tiktok','x','reddit','creator','sponsor_email','linkedin','direct','other']);
const PRESETS=new Set([100,500,1000,2500,5000,10000]);

function centsToPrice(cents:number){return Number((cents/100).toFixed(2));}
function planMap(){
 try{return JSON.parse(process.env.WHOP_SUPPORT_PLAN_IDS_JSON||'{}') as Record<string,string>}
 catch{return {}}
}

export async function POST(request:Request){
 if(process.env.SUPPORT_PAYMENTS_ENABLED!=='true')return Response.json({error:'Individual support is not open yet.'},{status:423});
 const origin=process.env.SITE_URL;
 if(!origin||request.headers.get('origin')!==new URL(origin).origin)return Response.json({error:'Invalid request origin.'},{status:403});
 if(Number(request.headers.get('content-length')||0)>4096)return new Response(null,{status:413});
 let body:any;
 try{const raw=await request.text();if(raw.length>4096)return new Response(null,{status:413});body=JSON.parse(raw)}catch{return Response.json({error:'Invalid request.'},{status:400})}
 const amountCents=Number(body.amountCents);
 const source=typeof body.source==='string'&&SOURCES.has(body.source)?body.source:'direct';
 const ref=typeof body.ref==='string'?body.ref.trim():'';
 if(!Number.isSafeInteger(amountCents)||amountCents<100||amountCents>820000)return Response.json({error:'Choose an amount from $1 to $8,200.'},{status:400});
 if(ref&&(!/^[A-Za-z0-9._-]+$/.test(ref)||ref.length>80))return Response.json({error:'Invalid referral code.'},{status:400});
 try{
  if(!process.env.WHOP_ACCOUNT_ID||!process.env.WHOP_SUPPORT_API_KEY)throw new Error('Support Whop setup missing');
  const clientKey=createHash('sha256').update(`${process.env.RATE_LIMIT_SALT}:${request.headers.get('x-vercel-forwarded-for')||'unknown'}`).digest('hex');
  const reservation=await rpc<{id:string;amountCents:number}>('sms_support_reserve',{p_amount:amountCents,p_source:source,p_ref:ref||null,p_client:clientKey});
  const mapped=planMap()[String(amountCents)];
  let planId=mapped;
  if(!planId){
   if(!process.env.WHOP_SUPPORT_PRODUCT_ID)throw new Error('Support product missing');
   const plan=await whopRequest('/plans',{apiKey:process.env.WHOP_SUPPORT_API_KEY,method:'POST',headers:{'Idempotency-Key':`support-plan-${amountCents}`},body:JSON.stringify({
    company_id:process.env.WHOP_ACCOUNT_ID,
    product_id:process.env.WHOP_SUPPORT_PRODUCT_ID,
    plan_type:'one_time',
    release_method:'buy_now',
    currency:'usd',
    initial_price:centsToPrice(amountCents),
    title:`Mission 01 Support $${centsToPrice(amountCents)}`.slice(0,30),
    description:'One-time support for Send Me Somewhere Mission 01: Addis Ababa to Dubai for GITEX Global 2026.',
    visibility:'hidden',
    unlimited_stock:true
   })});
   if(!plan?.id||plan.plan_type!=='one_time'||plan.currency!=='usd'||Math.round(Number(plan.initial_price)*100)!==amountCents)throw new Error('Support plan verification failed');
   planId=plan.id;
  }
  if(!/^plan_[a-zA-Z0-9]+$/.test(planId))throw new Error('Invalid support plan');
  const config=await whopRequest('/checkout_configurations',{apiKey:process.env.WHOP_SUPPORT_API_KEY,method:'POST',headers:{'Idempotency-Key':reservation.id},body:JSON.stringify({
   account_id:process.env.WHOP_ACCOUNT_ID,
   plan_id:planId,
   mode:'payment',
   metadata:{support_checkout_id:reservation.id},
   redirect_url:new URL('/?support=returned',origin).href
  })});
  if(config.account_id!==process.env.WHOP_ACCOUNT_ID||config.plan?.id!==planId||config.plan?.plan_type!=='one_time'||config.plan?.currency!=='usd'||Math.round(Number(config.plan?.initial_price)*100)!==amountCents)throw new Error('Support checkout verification failed');
  const url=new URL(config.purchase_url);
  if(url.protocol!=='https:'||!(url.hostname==='whop.com'||url.hostname.endsWith('.whop.com')))throw new Error('Invalid checkout URL');
  await rpc('sms_support_bind_checkout',{p_id:reservation.id,p_checkout:config.id});
  return Response.json({url:url.href,preset:PRESETS.has(amountCents)},{headers:{'Cache-Control':'no-store'}});
 }catch{
  return Response.json({error:'Support checkout is temporarily unavailable. Please try again later.'},{status:409});
 }
}
