import 'server-only';
import {createHash,timingSafeEqual} from 'node:crypto';

export function controlledTestAuthorized(request:Request){
 if(process.env.PRODUCTION_E2E_ENABLED!=='true')return false;
 const expected=process.env.WHOP_PRODUCTION_TEST_TOKEN;
 const supplied=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
 if(!expected||!supplied)return false;
 const a=createHash('sha256').update(expected).digest();
 const b=createHash('sha256').update(supplied).digest();
 return timingSafeEqual(a,b);
}
