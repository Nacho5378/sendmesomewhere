import 'server-only';
export function databaseConfigured(){return Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY)}
export async function rpc<T>(name:string,body:Record<string,unknown>={}):Promise<T>{
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Database is not configured');
 const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error(`Database operation failed (${response.status})`);
 return response.json() as Promise<T>;
}
