import {rpc} from '@/lib/db';

export const dynamic='force-dynamic';

export async function GET(){
 try{
  const data=await rpc('sms_mission_snapshot');
  return Response.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch{
  return Response.json({error:'Mission progress is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
