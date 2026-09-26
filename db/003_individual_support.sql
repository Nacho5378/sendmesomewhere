-- Individual support for Mission 01. Independent from sponsor ownership/takeover tables.
create table public.sms_support_checkouts (
 id uuid primary key default gen_random_uuid(),
 amount_cents bigint not null check (amount_cents between 100 and 820000),
 source text not null default 'direct' check (source in ('instagram','tiktok','x','reddit','creator','sponsor_email','linkedin','direct','other')),
 referral_code text,
 client_hash text not null,
 checkout_id text unique,
 state text not null default 'pending' check (state in ('pending','applied','canceled','review')),
 created_at timestamptz not null default now()
);

create table public.sms_support_payments (
 payment_id text primary key,
 event_id text not null unique,
 support_checkout_id uuid references public.sms_support_checkouts,
 supporter_key text,
 amount_cents bigint,
 source text not null default 'direct' check (source in ('instagram','tiktok','x','reddit','creator','sponsor_email','linkedin','direct','other')),
 referral_code text,
 state text not null check (state in ('applied','review')),
 reason text,
 paid_at timestamptz,
 created_at timestamptz not null default now()
);

alter table public.sms_support_checkouts enable row level security;
alter table public.sms_support_payments enable row level security;
revoke all on public.sms_support_checkouts,public.sms_support_payments from public,anon,authenticated;

create index sms_support_client_created_idx on public.sms_support_checkouts(client_hash,created_at);
create index sms_support_paid_at_idx on public.sms_support_payments(paid_at) where state='applied';
create index sms_support_source_idx on public.sms_support_payments(source) where state='applied';

create function public.sms_mission_snapshot() returns jsonb language sql stable security definer set search_path=public as $$
 with support as (
  select coalesce(sum(amount_cents),0)::bigint as cents,
         count(*)::bigint as contributions,
         count(distinct coalesce(supporter_key,payment_id))::bigint as supporters
  from sms_support_payments where state='applied'
 ), corporate as (
  select coalesce(sum(amount_cents),0)::bigint as cents
  from sms_payments where state='applied'
 ), sponsors as (
  select count(distinct owner_name)::bigint as companies
  from sms_positions where owner_name is not null
 ), source_rows as (
  select source, sum(amount_cents)::bigint as cents, count(*)::bigint as contributions
  from sms_support_payments where state='applied' group by source
 ), totals as (
  select 820000::bigint as goal_cents, support.cents as individual_cents, corporate.cents as corporate_cents,
         support.contributions, support.supporters, sponsors.companies
  from support,corporate,sponsors
 )
 select jsonb_build_object(
  'goalCents',goal_cents,
  'raisedCents',individual_cents+corporate_cents,
  'remainingCents',greatest(goal_cents-(individual_cents+corporate_cents),0),
  'individualCents',individual_cents,
  'corporateCents',corporate_cents,
  'individualContributions',contributions,
  'individualSupporters',supporters,
  'sponsorCompanies',companies,
  'sourceBreakdown',coalesce((select jsonb_object_agg(source,jsonb_build_object('amountCents',cents,'contributions',contributions)) from source_rows),'{}'::jsonb),
  'serverNow',now()
 ) from totals;
$$;

create function public.sms_support_reserve(p_amount bigint,p_source text,p_ref text,p_client text) returns jsonb language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 if p_amount<100 or p_amount>820000 then raise exception 'Amount out of range'; end if;
 if p_source not in ('instagram','tiktok','x','reddit','creator','sponsor_email','linkedin','direct','other') then raise exception 'Invalid source'; end if;
 if p_ref is not null and (length(p_ref)>80 or p_ref !~ '^[A-Za-z0-9._-]+$') then raise exception 'Invalid referral code'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client,1));
 if (select count(*) from sms_support_checkouts where client_hash=p_client and created_at>now()-interval '1 hour')>=10 then raise exception 'Rate limit'; end if;
 insert into sms_support_checkouts(amount_cents,source,referral_code,client_hash)
 values(p_amount,p_source,nullif(p_ref,''),p_client) returning id into rid;
 return jsonb_build_object('id',rid,'amountCents',p_amount);
end; $$;

create function public.sms_support_bind_checkout(p_id uuid,p_checkout text) returns void language plpgsql security definer set search_path=public as $$
begin
 update sms_support_checkouts set checkout_id=p_checkout where id=p_id and state='pending' and checkout_id is null;
 if not found then raise exception 'Invalid support checkout'; end if;
end; $$;

create function public.sms_support_payment_review(p_event text,p_payment text,p_reason text) returns void language plpgsql security definer set search_path=public as $$
begin
 insert into sms_support_payments(payment_id,event_id,state,reason,source)
 values(p_payment,p_event,'review',p_reason,'direct') on conflict do nothing;
end; $$;

create function public.sms_support_apply_payment(p_event text,p_payment text,p_support_checkout uuid,p_checkout text,p_amount bigint,p_paid_at timestamptz,p_supporter_key text) returns text language plpgsql security definer set search_path=public as $$
declare r sms_support_checkouts; reason text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_payment,1));
 if exists(select 1 from sms_support_payments where payment_id=p_payment or event_id=p_event) then return 'duplicate'; end if;
 select * into r from sms_support_checkouts where id=p_support_checkout for update;
 if not found then perform sms_support_payment_review(p_event,p_payment,'Unknown support checkout');return 'review'; end if;
 if p_paid_at is null or p_amount is null or p_checkout is null then reason:='Missing payment binding';
 elsif r.state<>'pending' or r.checkout_id is null or r.checkout_id<>p_checkout then reason:='Checkout mismatch';
 elsif p_amount<>r.amount_cents then reason:='Amount mismatch';
 end if;
 if reason is not null then
  insert into sms_support_payments(payment_id,event_id,support_checkout_id,amount_cents,source,referral_code,state,reason,paid_at,supporter_key)
  values(p_payment,p_event,r.id,p_amount,r.source,r.referral_code,'review',reason,p_paid_at,p_supporter_key);
  if r.state='pending' then update sms_support_checkouts set state='review' where id=r.id; end if;
  return 'review';
 end if;
 insert into sms_support_payments(payment_id,event_id,support_checkout_id,supporter_key,amount_cents,source,referral_code,state,paid_at)
 values(p_payment,p_event,r.id,p_supporter_key,p_amount,r.source,r.referral_code,'applied',p_paid_at);
 update sms_support_checkouts set state='applied' where id=r.id;
 return 'applied';
end; $$;

revoke all on function public.sms_mission_snapshot() from public,anon,authenticated;
revoke all on function public.sms_support_reserve(bigint,text,text,text) from public,anon,authenticated;
revoke all on function public.sms_support_bind_checkout(uuid,text) from public,anon,authenticated;
revoke all on function public.sms_support_payment_review(text,text,text) from public,anon,authenticated;
revoke all on function public.sms_support_apply_payment(text,text,uuid,text,bigint,timestamptz,text) from public,anon,authenticated;
grant execute on function public.sms_mission_snapshot(),public.sms_support_reserve(bigint,text,text,text),public.sms_support_bind_checkout(uuid,text),public.sms_support_payment_review(text,text,text),public.sms_support_apply_payment(text,text,uuid,text,bigint,timestamptz,text) to service_role;
