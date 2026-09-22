import {whopRequestWith} from '@/lib/whop.mjs';
export const runtime='nodejs';
const BASE='https://sandbox-api.whop.com/api/v1';
const PRODUCT_ID='prod_y7RgTUQea79j8';
export async function GET(){
 if(process.env.VERCEL_ENV!=='preview')return new Response('Not found',{status:404});
 const key=process.env.WHOP_SANDBOX_API_KEY;if(!key)return new Response('Not configured',{status:503});
 try{
  const response=await whopRequestWith(BASE,key,`/plans?product_ids=${PRODUCT_ID}`);
  const plans=Array.isArray(response?.data)?response.data:Array.isArray(response)?response:[];
  const plan=plans.find((p:any)=>p.product_id===PRODUCT_ID||p.product?.id===PRODUCT_ID);
  if(!plan)return new Response('Plan not found',{status:404});
  return Response.json({id:plan.id,productId:PRODUCT_ID,planType:plan.plan_type,currency:plan.currency,initialPrice:plan.initial_price},{headers:{'Cache-Control':'no-store'}});
 }catch{return new Response('Plan lookup failed',{status:502})}
}
