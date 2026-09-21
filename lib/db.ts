import 'server-only';
function databaseKey(){return process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY}
export function databaseConfigured(){return Boolean(process.env.SUPABASE_URL&&databaseKey())}
export async function rpc<T>(name:string,body:Record<string,unknown>={}):Promise<T>{
 const url=process.env.SUPABASE_URL,key=databaseKey();
 if(!url||!key)throw new Error('Database is not configured');
 const headers:Record<string,string>={apikey:key,'Content-Type':'application/json'};
 // Legacy service_role keys are JWTs; current sb_secret_ keys must use apikey only.
 if(key.startsWith('eyJ'))headers.Authorization=`Bearer ${key}`;
 const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error(`Database operation failed (${response.status})`);
 return response.json() as Promise<T>;
}
