import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('database enforces ownership, idempotency, exact prices, and launch boundaries',async t=>{
 const db=new PGlite();await db.exec('create role anon; create role authenticated; create role service_role;');
 await db.exec(await readFile(new URL('../db/001_campaign.sql',import.meta.url),'utf8'));
 const q=(sql,args=[])=>db.query(sql,args);
 await t.test('initial database is a truthful closed preview',async()=>{const {rows}=await q('select sms_public_snapshot() as snapshot');const p=rows[0].snapshot;assert.equal(p.positions.length,15);assert.equal(p.totalCents,0);assert.equal(p.status,'preview');assert.equal(p.startsAt,null);assert.deepEqual(p.activity,[]);await assert.rejects(q("select sms_reserve('wildcard','Test Brand','client1','plan_test')"),/not open/)});
 await q("update sms_campaign set status='live', starts_at=now()-interval '1 hour', ends_at=now()+interval '71 hours'");
 let reservation;
 await t.test('one reservation per position prevents conflicting checkouts',async()=>{const {rows}=await q("select sms_reserve('wildcard','Test Brand','client1','plan_test') as r");reservation=rows[0].r;assert.equal(reservation.priceCents,25000);await assert.rejects(q("select sms_reserve('wildcard','Other Brand','client2','plan_test')"),/reserved/);await q('select sms_bind_checkout($1,$2)',[reservation.id,'ch_test'])});
 await t.test('successful payment atomically sets ownership, doubles price and records one activity',async()=>{const args=['evt_1','pay_1',reservation.id,'ch_test','plan_test',25000];const sql='select sms_apply_payment($1,$2,$3,$4,$5,$6,now()) as result';assert.equal((await q(sql,args)).rows[0].result,'applied');assert.equal((await q(sql,args)).rows[0].result,'duplicate');assert.equal((await q(sql,['evt_another',...args.slice(1)])).rows[0].result,'duplicate');const p=(await q('select sms_public_snapshot() as s')).rows[0].s;assert.equal(p.totalCents,25000);assert.equal(p.activity.length,1);const wildcard=p.positions.find(p=>p.id==='wildcard');assert.equal(wildcard.owner.name,'Test Brand');assert.equal(wildcard.currentPriceCents,50000);await assert.rejects(q("select sms_reserve('wildcard','Takeover Brand','client3','plan_test')"),/disabled/)});
 await t.test('underpaid checkout is held for review without changing ownership',async()=>{const r=(await q("select sms_reserve('hat','Hat Brand','client4','plan_hat') as r")).rows[0].r;await q('select sms_bind_checkout($1,$2)',[r.id,'ch_hat']);const result=await q('select sms_apply_payment($1,$2,$3,$4,$5,$6,now()) as r',['evt_2','pay_2',r.id,'ch_hat','plan_hat',1]);assert.equal(result.rows[0].r,'review');assert.equal((await q("select owner_name from sms_positions where id='hat'")).rows[0].owner_name,null)});
 await t.test('payment outside the auction window cannot claim a position',async()=>{const r=(await q("select sms_reserve('laptop','Laptop Brand','client5','plan_laptop') as r")).rows[0].r;await q('select sms_bind_checkout($1,$2)',[r.id,'ch_laptop']);const result=await q("select sms_apply_payment($1,$2,$3,$4,$5,$6,now()+interval '73 hours') as r",['evt_3','pay_3',r.id,'ch_laptop','plan_laptop',50000]);assert.equal(result.rows[0].r,'review');assert.equal((await q("select owner_name from sms_positions where id='laptop'")).rows[0].owner_name,null)});
 await t.test('anonymous clients cannot directly read private records or invoke payment RPCs',async()=>{await q('set role anon');await assert.rejects(q('select * from sms_reservations'),/permission denied/);await assert.rejects(q('select sms_public_snapshot()'),/permission denied/);await q('reset role')});
 await db.close();
});
