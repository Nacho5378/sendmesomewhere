-- Isolated Whop Sandbox state. These objects never read or write sms_positions,
-- sms_payments, sms_activity, or any other production campaign ownership table.
create table public.sms_sandbox_positions (
 id text primary key,
 name text not null,
 opening_cents bigint not null check(opening_cents>0),
 current_price_cents bigint not null check(current_price_cents>0),
 owner_name text,
 paid_cents bigint not null default 0,
 purchases int not null default 0 check(purchases>=0)
);

create table public.sms_sandbox_plan_mappings (
 position_id text primary key references public.sms_sandbox_positions,
 plan_id text not null unique,
 unique(position_id,plan_id)
);

create table public.sms_sandbox_reservations (
 id uuid primary key default gen_random_uuid(),
 position_id text not null references public.sms_sandbox_positions,
 sponsor_name text not null check(length(sponsor_name) between 2 and 60),
 price_cents bigint not null,
 plan_id text not null,
 checkout_id text unique,
 state text not null default 'pending' check(state in ('pending','applied','review','closed')),
 created_at timestamptz not null default now(),
 foreign key(position_id,plan_id) references public.sms_sandbox_plan_mappings(position_id,plan_id)
);
create unique index sms_sandbox_one_pending on public.sms_sandbox_reservations(position_id) where state='pending';

create table public.sms_sandbox_payments (
 payment_id text primary key,
 event_id text not null unique,
 reservation_id uuid references public.sms_sandbox_reservations,
 amount_cents bigint not null,
 state text not null check(state in ('applied','review')),
 reason text,
 paid_at timestamptz,
 created_at timestamptz not null default now()
);

create table public.sms_sandbox_activity (
 id uuid primary key default gen_random_uuid(),
 payment_id text not null unique references public.sms_sandbox_payments,
 sponsor_name text not null,
 position_name text not null,
 amount_cents bigint not null,
 created_at timestamptz not null default now()
);

create table public.sms_sandbox_ownership_history (
 id uuid primary key default gen_random_uuid(),
 payment_id text not null unique references public.sms_sandbox_payments,
 position_id text not null references public.sms_sandbox_positions,
 previous_owner text,
 new_owner text not null,
 paid_cents bigint not null,
 next_price_cents bigint not null,
 created_at timestamptz not null default now()
);

alter table public.sms_sandbox_positions enable row level security;
alter table public.sms_sandbox_plan_mappings enable row level security;
alter table public.sms_sandbox_reservations enable row level security;
alter table public.sms_sandbox_payments enable row level security;
alter table public.sms_sandbox_activity enable row level security;
alter table public.sms_sandbox_ownership_history enable row level security;
revoke all on public.sms_sandbox_positions,public.sms_sandbox_plan_mappings,public.sms_sandbox_reservations,public.sms_sandbox_payments,public.sms_sandbox_activity,public.sms_sandbox_ownership_history from public,anon,authenticated;

create function public.sms_sandbox_reserve(p_name text,p_plan text) returns jsonb language plpgsql security definer set search_path=public as $$
declare p sms_sandbox_positions; rid uuid;
begin
 select * into p from sms_sandbox_positions where id='wildcard' for update;
 if not found then raise exception 'Sandbox position is not configured'; end if;
 if p.owner_name is not null or p.purchases<>0 then raise exception 'Sandbox test already completed'; end if;
 if not exists(select 1 from sms_sandbox_plan_mappings where position_id=p.id and plan_id=p_plan) then raise exception 'Invalid sandbox plan'; end if;
 if exists(select 1 from sms_sandbox_reservations where position_id=p.id and state='pending') then raise exception 'Sandbox position reserved'; end if;
 insert into sms_sandbox_reservations(position_id,sponsor_name,price_cents,plan_id)
 values(p.id,p_name,p.current_price_cents,p_plan) returning id into rid;
 return jsonb_build_object('id',rid,'priceCents',p.current_price_cents);
end; $$;

create function public.sms_sandbox_bind_checkout(p_id uuid,p_checkout text) returns void language plpgsql security definer set search_path=public as $$
begin
 update sms_sandbox_reservations set checkout_id=p_checkout where id=p_id and state='pending' and checkout_id is null;
 if not found then raise exception 'Invalid sandbox reservation'; end if;
end; $$;

create function public.sms_sandbox_payment_review(p_event text,p_payment text,p_reason text,p_amount bigint default 0) returns text language plpgsql security definer set search_path=public as $$
begin
 insert into sms_sandbox_payments(payment_id,event_id,amount_cents,state,reason)
 values(p_payment,p_event,p_amount,'review',p_reason) on conflict do nothing;
 return 'review';
end; $$;

create function public.sms_sandbox_apply_payment(p_event text,p_payment text,p_reservation uuid,p_checkout text,p_plan text,p_amount bigint,p_paid_at timestamptz) returns text language plpgsql security definer set search_path=public as $$
declare r sms_sandbox_reservations; p sms_sandbox_positions; reason text; previous_owner text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_payment,0));
 if exists(select 1 from sms_sandbox_payments where payment_id=p_payment or event_id=p_event) then return 'duplicate'; end if;
 select * into r from sms_sandbox_reservations where id=p_reservation for update;
 if not found then return sms_sandbox_payment_review(p_event,p_payment,'Unknown sandbox reservation',coalesce(p_amount,0)); end if;
 select * into p from sms_sandbox_positions where id=r.position_id for update;
 previous_owner:=p.owner_name;
 if p_paid_at is null or p_amount is null or p_checkout is null or p_plan is null then reason:='Missing payment binding';
 elsif r.state<>'pending' or r.checkout_id is null or r.checkout_id<>p_checkout or r.plan_id<>p_plan then reason:='Checkout or reservation mismatch';
 elsif p_amount<>r.price_cents or p_amount<>p.current_price_cents then reason:='Price mismatch';
 elsif p.owner_name is not null or p.purchases<>0 then reason:='Sandbox test already completed; takeovers disabled';
 end if;
 if reason is not null then
  insert into sms_sandbox_payments(payment_id,event_id,reservation_id,amount_cents,state,reason,paid_at)
  values(p_payment,p_event,r.id,coalesce(p_amount,0),'review',reason,p_paid_at);
  update sms_sandbox_reservations set state='review' where id=r.id;
  return 'review';
 end if;
 insert into sms_sandbox_payments(payment_id,event_id,reservation_id,amount_cents,state,paid_at)
 values(p_payment,p_event,r.id,p_amount,'applied',p_paid_at);
 update sms_sandbox_positions set owner_name=r.sponsor_name,paid_cents=p_amount,purchases=1,current_price_cents=p_amount*2 where id=p.id;
 update sms_sandbox_reservations set state='applied' where id=r.id;
 insert into sms_sandbox_activity(payment_id,sponsor_name,position_name,amount_cents,created_at)
 values(p_payment,r.sponsor_name,p.name,p_amount,p_paid_at);
 insert into sms_sandbox_ownership_history(payment_id,position_id,previous_owner,new_owner,paid_cents,next_price_cents,created_at)
 values(p_payment,p.id,previous_owner,r.sponsor_name,p_amount,p_amount*2,p_paid_at);
 return 'applied';
end; $$;

revoke all on function public.sms_sandbox_reserve(text,text),public.sms_sandbox_bind_checkout(uuid,text),public.sms_sandbox_payment_review(text,text,text,bigint),public.sms_sandbox_apply_payment(text,text,uuid,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.sms_sandbox_reserve(text,text),public.sms_sandbox_bind_checkout(uuid,text),public.sms_sandbox_payment_review(text,text,text,bigint),public.sms_sandbox_apply_payment(text,text,uuid,text,text,bigint,timestamptz) to service_role;

insert into public.sms_sandbox_positions(id,name,opening_cents,current_price_cents)
values('wildcard','Wildcard',25000,25000);
-- The sandbox plan mapping is inserted separately after Whop creates the plan.
