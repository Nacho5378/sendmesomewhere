import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const port=4317,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{stdio:'pipe',env:{...process.env,PAYMENTS_ENABLED:'true',SUPABASE_URL:'',SUPABASE_SECRET_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',WHOP_WEBHOOK_SECRET:''}});
let log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
try{
 let ready=false;for(let i=0;i<80;i++){try{const r=await fetch(base);if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,150))}
 assert.ok(ready,log);
 const page=await fetch(base);assert.equal(page.status,200);assert.equal(page.headers.get('x-content-type-options'),'nosniff');
 const state=await (await fetch(base+'/api/campaign')).json();assert.equal(state.paymentsEnabled,false);assert.equal(state.status,'preview');assert.equal(state.positions.length,15);assert.equal(state.startsAt,null);
 const checkout=await fetch(base+'/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({positionId:'wildcard',sponsorName:'Smoke Test'})});assert.equal(checkout.status,423);
 const webhook=await fetch(base+'/api/webhooks/whop',{method:'POST',body:'{}'});assert.equal(webhook.status,503);
 console.log('PASS: production page, campaign API, headers, hard payment lock even with env enabled, unconfigured webhook rejection.');
}finally{server.kill('SIGTERM')}
