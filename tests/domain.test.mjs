import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {POSITIONS,nextPrice,remainingMs,initialCampaign,DURATION_MS} from '../lib/domain.mjs';
import {verifyWebhook,normalizePayment,usdCents} from '../lib/whop.mjs';
test('all 15 positions have exact campaign opening prices',()=>{
 assert.equal(POSITIONS.length,15);assert.equal(new Set(POSITIONS.map(p=>p.id)).size,15);
 assert.deepEqual(POSITIONS.map(p=>p.openingCents),[100000,100000,50000,50000,50000,50000,50000,50000,25000,25000,50000,50000,25000,25000,25000]);
 assert.equal(POSITIONS.reduce((sum,p)=>sum+p.openingCents,0),725000);
});
test('takeover quote doubles after each verified purchase',()=>assert.deepEqual([0,1,2,3].map(n=>nextPrice(25000,n)),[25000,50000,100000,200000]));
test('invalid prices and unsafe amounts fail closed',()=>{assert.throws(()=>nextPrice(25000,-1));assert.throws(()=>nextPrice(25000,30));assert.throws(()=>nextPrice(.1,1))});
test('preview has no timer, payments, sponsors or activity',()=>{const p=initialCampaign();assert.equal(p.startsAt,null);assert.equal(p.paymentsEnabled,false);assert.equal(p.totalCents,0);assert.deepEqual(p.activity,[]);assert.ok(p.positions.every(p=>p.owner===null));assert.equal(remainingMs(null),null)});
test('countdown uses a fixed server start, never visit time',()=>{const start='2026-09-20T12:00:00Z',t=Date.parse(start);assert.equal(remainingMs(start,t),DURATION_MS);assert.equal(remainingMs(start,t+3600000),71*3600000);assert.equal(remainingMs(start,t+DURATION_MS+1),0)});
const secret='ws_local_test_secret';const now=Date.parse('2026-09-20T12:00:00Z');const stamp=String(now/1000);
const raw=JSON.stringify({id:'msg_test',type:'payment.succeeded'});
function signedHeaders(timestamp=stamp,payload=raw){return new Headers({'webhook-id':'msg_test','webhook-timestamp':timestamp,'webhook-signature':'v1,'+createHmac('sha256',secret).update(`msg_test.${timestamp}.${payload}`).digest('base64')})}
test('webhook validates exact bytes, signature and event identity',()=>{assert.equal(verifyWebhook(raw,signedHeaders(),secret,now).id,'msg_test');assert.throws(()=>verifyWebhook(raw+' ',signedHeaders(),secret,now));assert.throws(()=>verifyWebhook(raw,signedHeaders(),'wrong',now));const altered=JSON.stringify({id:'msg_other'});assert.throws(()=>verifyWebhook(altered,signedHeaders(stamp,altered),secret,now))});
test('webhook rejects stale and future timestamps',()=>{for(const t of [String(now/1000-301),String(now/1000+301)])assert.throws(()=>verifyWebhook(raw,signedHeaders(t),secret,now))});
test('money conversion is exact and rejects unsupported currencies',()=>{assert.equal(usdCents({amount:'250.00',currency:'usd',decimals:2}),25000);assert.equal(usdCents({amount:'0.29',currency:'usd',decimals:2}),29);assert.throws(()=>usdCents({amount:'250.001',currency:'usd',decimals:2}));assert.throws(()=>usdCents({amount:'250',currency:'eur',decimals:2}))});
const payment={id:'pay_test',account_id:'biz_test',status:'paid',substatus:'succeeded',auto_refunded:false,checkout_configuration_id:'ch_test',plan_id:'plan_test',metadata:{reservation_id:'6fb3f284-5910-4431-9b64-dcf8583597a9'},subtotal:{amount:'250.00',currency:'usd',decimals:2},paid_at:'2026-09-20T12:00:00Z'};
test('only verified paid, unrefunded payments from the correct merchant qualify',()=>{assert.equal(normalizePayment(payment,'biz_test').amountCents,25000);for(const changed of [{account_id:'biz_other'},{status:'pending'},{substatus:'refunded'},{metadata:{}},{auto_refunded:true},{discount_amount:{amount:'1.00',currency:'usd',decimals:2}}])assert.throws(()=>normalizePayment({...payment,...changed},'biz_test'))});
