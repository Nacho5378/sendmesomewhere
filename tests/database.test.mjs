import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('database enforces ownership, idempotency, exact prices, and launch boundaries',async t=>{
 const db=new PGlite();await db.exec('create role anon; create role authenticated; create role service_role;');
 await db.exec(await readFile(new URL('../db/001_campaign.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../db/002_controlled_production_test.sql',import.meta.url),'utf8'));
 const q=(sql,args=[])=>db.query(sql,args);
 await t.test('initial database is a truthful closed preview',async()=>{const {rows}=await q('select sms_public_snapshot() as snapshot');const p=rows[0].snapshot;assert.equal(p.positions.length,15);assert.equal(p.totalCents,0);assert.equal(p.status,'preview');assert.equal(p.startsAt,null);assert.deepEqual(p.activity,[]);await assert.rejects(q("select sms_reserve('wildcard','Test Brand','client1','plan_8x39ZI3KtNaSe')"),/not open/)});
 await q("update sms_campaign set status='live', starts_at=now()-interval '1 hour', ends_at=now()+interval '71 hours'");
 let reservation;
 await t.test('one reservation per position prevents conflicting checkouts',async()=>{const {rows}=await q("select sms_reserve('wildcard','Test Brand','client1','plan_8x39ZI3KtNaSe') as r");reservation=rows[0].r;assert.equal(reservation.priceCents,25000);await assert.rejects(q("select sms_reserve('wildcard','Other Brand','client2','plan_8x39ZI3KtNaSe')"),/reserved/);await q('select sms_bind_checkout($1,$2)',[reservation.id,'ch_test'])});
 await t.test('successful payment atomically sets ownership, doubles price and records one activity',async()=>{const args=['evt_1','pay_1',reservation.id,'ch_test','plan_8x39ZI3KtNaSe',25000];const sql='select sms_apply_payment($1,$2,$3,$4,$5,$6,now()) as result';assert.equal((await q(sql,args)).rows[0].result,'applied');assert.equal((await q(sql,args)).rows[0].result,'duplicate');assert.equal((await q(sql,['evt_another',...args.slice(1)])).rows[0].result,'duplicate');const p=(await q('select sms_public_snapshot() as s')).rows[0].s;assert.equal(p.totalCents,25000);assert.equal(p.activity.length,1);const wildcard=p.positions.find(p=>p.id==='wildcard');assert.equal(wildcard.owner.name,'Test Brand');assert.equal(wildcard.currentPriceCents,50000);await assert.rejects(q("select sms_reserve('wildcard','Takeover Brand','client3','plan_8x39ZI3KtNaSe')"),/disabled/)});
 await t.test('underpaid checkout is held for review without changing ownership',async()=>{const r=(await q("select sms_reserve('hat','Hat Brand','client4','plan_wrbm2BCyRQoLN') as r")).rows[0].r;await q('select sms_bind_checkout($1,$2)',[r.id,'ch_hat']);const result=await q('select sms_apply_payment($1,$2,$3,$4,$5,$6,now()) as r',['evt_2','pay_2',r.id,'ch_hat','plan_wrbm2BCyRQoLN',1]);assert.equal(result.rows[0].r,'review');assert.equal((await q("select owner_name from sms_positions where id='hat'")).rows[0].owner_name,null)});
 await t.test('payment outside the auction window cannot claim a position',async()=>{const r=(await q("select sms_reserve('laptop','Laptop Brand','client5','plan_upQEocsUxBcG2') as r")).rows[0].r;await q('select sms_bind_checkout($1,$2)',[r.id,'ch_laptop']);const result=await q("select sms_apply_payment($1,$2,$3,$4,$5,$6,now()+interval '73 hours') as r",['evt_3','pay_3',r.id,'ch_laptop','plan_upQEocsUxBcG2',50000]);assert.equal(result.rows[0].r,'review');assert.equal((await q("select owner_name from sms_positions where id='laptop'")).rows[0].owner_name,null)});
 await t.test('anonymous clients cannot directly read private records or invoke payment RPCs',async()=>{await q('set role anon');await assert.rejects(q('select * from sms_reservations'),/permission denied/);await assert.rejects(q('select sms_public_snapshot()'),/permission denied/);await q('reset role')});
 await t.test('all fifteen plan bindings match the server configuration',async()=>{
 const plans=JSON.parse(await readFile(new URL('../lib/whop-plans.json',import.meta.url),'utf8'));
 const rows=(await q('select position_id,plan_id from sms_plan_mappings')).rows;
 assert.deepEqual(Object.fromEntries(rows.map(r=>[r.position_id,r.plan_id])),plans);
 await assert.rejects(q("select sms_reserve('backpack','Wrong Plan','client6','plan_wrong')"),/foreign key/);
 });
 await t.test('ownership audit is atomic and duplicate deliveries do not duplicate history',async()=>{
 const rows=(await q('select * from sms_ownership_history')).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].payment_id,'pay_1');assert.equal(Number(rows[0].next_price_cents),50000);
 assert.equal((await q('select * from sms_takeover_history')).rows.length,0);
 });
 await db.close();
});

test('controlled production test is Wildcard-only and does not open the campaign',async()=>{
 const db=new PGlite();await db.exec('create role anon; create role authenticated; create role service_role;');
 await db.exec(await readFile(new URL('../db/001_campaign.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../db/002_controlled_production_test.sql',import.meta.url),'utf8'));
 const q=(sql,args=[])=>db.query(sql,args);
 const first=(await q("select sms_reserve_controlled_wildcard('Send Me Somewhere E2E Test','private-token-hash','plan_8x39ZI3KtNaSe') as r")).rows[0].r;
 const repeated=(await q("select sms_reserve_controlled_wildcard('Send Me Somewhere E2E Test','private-token-hash','plan_8x39ZI3KtNaSe') as r")).rows[0].r;
 assert.equal(first.id,repeated.id);assert.equal(first.priceCents,25000);
 assert.equal((await q("select status from sms_campaign where id='addis-dubai-2026'")).rows[0].status,'preview');
 await q('select sms_bind_checkout($1,$2)',[first.id,'ch_controlled']);
 const args=['evt_controlled','pay_controlled',first.id,'ch_controlled','plan_8x39ZI3KtNaSe',25000];
 assert.equal((await q('select sms_apply_payment($1,$2,$3,$4,$5,$6,now()) as r',args)).rows[0].r,'applied');
 assert.equal((await q('select sms_apply_payment($1,$2,$3,$4,$5,$6,now()) as r',args)).rows[0].r,'duplicate');
 const position=(await q("select owner_name,current_price_cents from sms_positions where id='wildcard'")).rows[0];
 assert.equal(position.owner_name,'Send Me Somewhere E2E Test');assert.equal(Number(position.current_price_cents),50000);
 assert.equal((await q('select count(*)::int as n from sms_payments')).rows[0].n,1);
 assert.equal((await q('select count(*)::int as n from sms_activity')).rows[0].n,1);
 assert.equal((await q('select count(*)::int as n from sms_ownership_history')).rows[0].n,1);
 assert.equal((await q('select count(*)::int as n from sms_takeover_history')).rows[0].n,0);
 assert.equal((await q("select count(*)::int as n from sms_positions where id<>'wildcard' and (owner_name is not null or purchases<>0 or current_price_cents<>opening_cents)")).rows[0].n,0);
 await db.close();
});
