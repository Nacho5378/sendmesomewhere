import {initialCampaign} from '@/lib/domain.mjs';
import {databaseConfigured,rpc} from '@/lib/db';
import {RELEASE_APPROVED} from '@/lib/release';
import type {Campaign} from '@/lib/types';
export const dynamic='force-dynamic';
export async function GET(){
 try{const data:Campaign=databaseConfigured()?await rpc<Campaign>('sms_public_snapshot'):initialCampaign() as Campaign;
 data.paymentsEnabled=RELEASE_APPROVED&&process.env.PAYMENTS_ENABLED==='true'&&data.status==='live';
 return Response.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Sponsorship data is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
