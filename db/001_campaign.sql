-- Run once in a dedicated Supabase project. Nothing here launches an auction.
create table public.sms_campaign (
 id text primary key, status text not null default 'preview' check(status in ('preview','scheduled','live','paused','closed')),
 starts_at timestamptz, ends_at timestamptz,
 check ((starts_at is null and ends_at is null) or (starts_at is not null and ends_at=starts_at+interval '72 hours')),
 check (status not in ('live','scheduled') or starts_at is not null)
);
insert into public.sms_campaign(id) values ('addis-dubai-2026');
create table public.sms_positions (
 id text primary key, name text not null, number int not null unique, category text not null, description text not null,
 opening_cents bigint not null check(opening_cents>0), current_price_cents bigint not null check(current_price_cents>0),
 owner_name text, paid_cents bigint not null default 0, purchases int not null default 0 check(purchases>=0)
);
create table public.sms_plan_mappings (position_id text primary key references public.sms_positions, plan_id text not null unique, unique(position_id,plan_id));
alter table public.sms_plan_mappings enable row level security;
revoke all on public.sms_plan_mappings from public,anon,authenticated;
create table public.sms_reservations (
 id uuid primary key default gen_random_uuid(), position_id text not null references public.sms_positions,
 sponsor_name text not null check(length(sponsor_name) between 2 and 60), price_cents bigint not null,
 client_hash text not null, plan_id text not null, checkout_id text unique, created_at timestamptz not null default now(),
 state text not null default 'pending' check(state in ('pending','applied','canceled','review')),
 foreign key(position_id,plan_id) references public.sms_plan_mappings(position_id,plan_id)
);
create unique index sms_one_pending on public.sms_reservations(position_id) where state in ('pending','review');
create table public.sms_payments (
 payment_id text primary key, event_id text not null unique, reservation_id uuid references public.sms_reservations,
 amount_cents bigint, state text not null check(state in ('applied','review')), reason text, paid_at timestamptz, created_at timestamptz not null default now()
);
create table public.sms_activity (
 id uuid primary key default gen_random_uuid(), payment_id text not null unique references public.sms_payments,
 sponsor_name text not null, position_name text not null, amount_cents bigint not null, created_at timestamptz not null default now()
);
-- No direct browser access, including reads of reservations or payment identifiers.
alter table public.sms_campaign enable row level security;
alter table public.sms_positions enable row level security;
alter table public.sms_reservations enable row level security;
alter table public.sms_payments enable row level security;
alter table public.sms_activity enable row level security;
revoke all on public.sms_campaign,public.sms_positions,public.sms_reservations,public.sms_payments,public.sms_activity from anon,authenticated;

create function public.sms_public_snapshot() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',c.id,'status',case when c.status='live' and now()>=c.ends_at then 'closed' when c.status='live' and now()<c.starts_at then 'scheduled' else c.status end,
 'startsAt',c.starts_at,'endsAt',c.ends_at,'serverNow',now(),'paymentsEnabled',false,'dataSource','database',
 'totalCents',coalesce((select sum(amount_cents) from sms_payments where state='applied'),0),
 'positions',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'number',p.number,'category',p.category,'description',p.description,
 'openingCents',p.opening_cents,'currentPriceCents',p.current_price_cents,'paidCents',p.paid_cents,'purchases',p.purchases,'owner',case when p.owner_name is null then null else jsonb_build_object('name',p.owner_name) end) order by p.number) from sms_positions p),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.sponsor_name,'position',a.position_name,'amountCents',a.amount_cents,'at',a.created_at) order by a.created_at desc) from (select * from sms_activity order by created_at desc limit 20) a),'[]'::jsonb)) from sms_campaign c where c.id='addis-dubai-2026';
$$;

create function public.sms_reserve(p_position text,p_name text,p_client text,p_plan text) returns jsonb language plpgsql security definer set search_path=public as $$
declare c sms_campaign; p sms_positions; rid uuid;
begin
 select * into c from sms_campaign where id='addis-dubai-2026' for share;
 if c.status<>'live' or c.starts_at is null or now()<c.starts_at or now()>=c.ends_at then raise exception 'Auction is not open'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client,0));
 if (select count(*) from sms_reservations where client_hash=p_client and created_at>now()-interval '1 hour')>=5 then raise exception 'Rate limit'; end if;
 select * into p from sms_positions where id=p_position for update;
 if not found then raise exception 'Unknown position'; end if;
 -- Takeover and refund workflow intentionally not implemented or enabled.
 if p.owner_name is not null or p.purchases<>0 then raise exception 'Takeovers are disabled'; end if;
 if exists(select 1 from sms_reservations where position_id=p.id and state in ('pending','review')) then raise exception 'Position reserved'; end if;
 insert into sms_reservations(position_id,sponsor_name,price_cents,client_hash,plan_id) values(p.id,p_name,p.current_price_cents,p_client,p_plan) returning id into rid;
 return jsonb_build_object('id',rid,'priceCents',p.current_price_cents);
end; $$;

create function public.sms_bind_checkout(p_id uuid,p_checkout text) returns void language plpgsql security definer set search_path=public as $$
begin
 update sms_reservations set checkout_id=p_checkout where id=p_id and state='pending' and checkout_id is null;
 if not found then raise exception 'Invalid reservation'; end if;
end; $$;

create function public.sms_payment_review(p_event text,p_payment text,p_reason text) returns void language plpgsql security definer set search_path=public as $$
begin
 insert into sms_payments(payment_id,event_id,state,reason) values(p_payment,p_event,'review',p_reason) on conflict do nothing;
end; $$;

create function public.sms_apply_payment(p_event text,p_payment text,p_reservation uuid,p_checkout text,p_plan text,p_amount bigint,p_paid_at timestamptz) returns text language plpgsql security definer set search_path=public as $$
declare r sms_reservations; p sms_positions; c sms_campaign; reason text;
begin
 -- A repeated delivery or distinct event for the same payment is idempotent.
 perform pg_advisory_xact_lock(hashtextextended(p_payment,0));
 if exists(select 1 from sms_payments where payment_id=p_payment or event_id=p_event) then return 'duplicate'; end if;
 select * into r from sms_reservations where id=p_reservation for update;
 if not found then
  perform sms_payment_review(p_event,p_payment,'Unknown reservation');return 'review';
 end if;
 select * into p from sms_positions where id=r.position_id for update;
 select * into c from sms_campaign where id='addis-dubai-2026' for share;
 -- Compare paid_at, not arrival time: delayed webhooks from valid in-window payments are accepted.
 if p_paid_at is null or p_amount is null or p_checkout is null or p_plan is null then reason:='Missing payment binding';
 elsif c.starts_at is null or c.status not in ('live','closed') or p_paid_at<c.starts_at or p_paid_at>=c.ends_at then reason:='Payment outside approved auction window';
 elsif r.state<>'pending' or r.checkout_id is null or r.checkout_id<>p_checkout or r.plan_id<>p_plan then reason:='Checkout or reservation mismatch';
 elsif p_amount<>r.price_cents or p_amount<>p.current_price_cents then reason:='Price mismatch';
 elsif p.owner_name is not null or p.purchases<>0 then reason:='Conflicting ownership; takeover workflow is disabled';
 end if;
 if reason is not null then
  insert into sms_payments(payment_id,event_id,reservation_id,amount_cents,state,reason,paid_at) values(p_payment,p_event,r.id,p_amount,'review',reason,p_paid_at);
  if r.state='pending' then update sms_reservations set state='review' where id=r.id; end if;
  return 'review';
 end if;
 insert into sms_payments(payment_id,event_id,reservation_id,amount_cents,state,paid_at) values(p_payment,p_event,r.id,p_amount,'applied',p_paid_at);
 update sms_positions set owner_name=r.sponsor_name,paid_cents=p_amount,purchases=purchases+1,current_price_cents=p_amount*2 where id=p.id;
 update sms_reservations set state='applied' where id=r.id;
 insert into sms_activity(payment_id,sponsor_name,position_name,amount_cents,created_at) values(p_payment,r.sponsor_name,p.name,p_amount,p_paid_at);
 return 'applied';
end; $$;

revoke all on function public.sms_public_snapshot() from public,anon,authenticated;
revoke all on function public.sms_reserve(text,text,text,text) from public,anon,authenticated;
revoke all on function public.sms_bind_checkout(uuid,text) from public,anon,authenticated;
revoke all on function public.sms_payment_review(text,text,text) from public,anon,authenticated;
revoke all on function public.sms_apply_payment(text,text,uuid,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.sms_public_snapshot(),public.sms_reserve(text,text,text,text),public.sms_bind_checkout(uuid,text),public.sms_payment_review(text,text,text),public.sms_apply_payment(text,text,uuid,text,text,bigint,timestamptz) to service_role;

insert into public.sms_positions(id,name,number,category,description,opening_cents,current_price_cents) values
('main-chest','Main Chest',1,'jacket','The centerpiece. Front and center, wherever the journey goes.',100000,100000),
('main-back','Main Back',2,'jacket','The largest back placement. A statement from every angle.',100000,100000),
('left-chest','Left Chest',3,'jacket','A close-up position on the upper left chest.',50000,50000),
('right-chest','Right Chest',4,'jacket','A close-up position on the upper right chest.',50000,50000),
('left-shoulder','Left Shoulder',5,'jacket','A distinctive patch on the left shoulder.',50000,50000),
('right-shoulder','Right Shoulder',6,'jacket','A distinctive patch on the right shoulder.',50000,50000),
('left-sleeve','Left Sleeve',7,'jacket','Travel along on the left upper sleeve.',50000,50000),
('right-sleeve','Right Sleeve',8,'jacket','Travel along on the right upper sleeve.',50000,50000),
('left-forearm','Left Forearm',9,'jacket','A compact placement on the left forearm.',25000,25000),
('right-forearm','Right Forearm',10,'jacket','A compact placement on the right forearm.',25000,25000),
('laptop','Laptop',11,'gear','Your brand on the laptop that builds the journey.',50000,50000),
('backpack','Backpack',12,'gear','From airport to event floor, on the everyday backpack.',50000,50000),
('luggage','Luggage',13,'gear','A placement on the carry-on for Mission 01.',25000,25000),
('hat','Hat',14,'gear','A front-facing placement on the mission cap.',25000,25000),
('wildcard','Wildcard',15,'gear','A special placement, with the final format agreed before launch.',25000,25000);

insert into public.sms_plan_mappings(position_id,plan_id) values
('main-chest','plan_NbZdp4aXSiPj9'),
('main-back','plan_1vPxB2OBUEVAh'),
('left-chest','plan_KmNJrt2AIco0U'),
('right-chest','plan_RbETKFIPxbZ1g'),
('left-shoulder','plan_Yi2jNLiwdrr93'),
('right-shoulder','plan_lOZ9zzXgq1IG1'),
('left-sleeve','plan_rKydDx17MTyMo'),
('right-sleeve','plan_OPgvWOAiHqThB'),
('left-forearm','plan_PDsFeu1rIMaCf'),
('right-forearm','plan_rA2ng4wKZBrCs'),
('laptop','plan_upQEocsUxBcG2'),
('backpack','plan_ml956FAQIXBZj'),
('luggage','plan_OhrnAykZK6ZF6'),
('hat','plan_wrbm2BCyRQoLN'),
('wildcard','plan_8x39ZI3KtNaSe');

-- Immutable application audit: written in the same transaction as ownership.
create table public.sms_ownership_history (
 id uuid primary key default gen_random_uuid(),
 payment_id text not null unique references public.sms_payments,
 position_id text not null references public.sms_positions,
 previous_owner text, new_owner text not null,
 paid_cents bigint not null, next_price_cents bigint not null,
 created_at timestamptz not null default now()
);
-- Review ledger only. No refund calls or takeover execution are authorized.
create table public.sms_takeover_history (
 id uuid primary key default gen_random_uuid(),
 payment_id text not null unique references public.sms_payments,
 position_id text not null references public.sms_positions,
 previous_owner text, proposed_owner text not null,
 state text not null default 'blocked' check(state='blocked'),
 reason text not null, created_at timestamptz not null default now()
);
alter table public.sms_ownership_history enable row level security;
alter table public.sms_takeover_history enable row level security;
revoke all on public.sms_ownership_history,public.sms_takeover_history from public,anon,authenticated;
create function public.sms_audit_payment() returns trigger language plpgsql set search_path=public as $$
declare r sms_reservations; p sms_positions;
begin
 if new.reservation_id is null then return new; end if;
 select * into r from sms_reservations where id=new.reservation_id;
 select * into p from sms_positions where id=r.position_id;
 if new.state='applied' then
  insert into sms_ownership_history(payment_id,position_id,previous_owner,new_owner,paid_cents,next_price_cents)
  values(new.payment_id,p.id,p.owner_name,r.sponsor_name,new.amount_cents,new.amount_cents*2);
 elsif p.owner_name is not null or p.purchases>0 then
  insert into sms_takeover_history(payment_id,position_id,previous_owner,proposed_owner,reason)
  values(new.payment_id,p.id,p.owner_name,r.sponsor_name,coalesce(new.reason,'Takeovers disabled'));
 end if;
 return new;
end; $$;
revoke all on function public.sms_audit_payment() from public,anon,authenticated;
create trigger sms_payment_audit after insert on public.sms_payments for each row execute function public.sms_audit_payment();
create index sms_payments_reservation_idx on public.sms_payments(reservation_id);
create index sms_ownership_position_idx on public.sms_ownership_history(position_id);
create index sms_takeover_position_idx on public.sms_takeover_history(position_id);
create index sms_reservation_client_created_idx on public.sms_reservations(client_hash,created_at);
