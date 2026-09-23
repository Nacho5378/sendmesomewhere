-- One-production-payment readiness test. This does not launch the campaign.
alter table public.sms_reservations
 add column controlled_test boolean not null default false;

create function public.sms_reserve_controlled_wildcard(
 p_name text,
 p_client text,
 p_plan text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare c sms_campaign; p sms_positions; r sms_reservations;
begin
 perform pg_advisory_xact_lock(hashtextextended('sms-controlled-production-wildcard',0));
 select * into c from sms_campaign where id='addis-dubai-2026' for share;
 if c.status<>'preview' or c.starts_at is not null or c.ends_at is not null then
  raise exception 'Controlled test requires an unopened preview campaign';
 end if;
 if length(p_name) not between 2 and 60 then raise exception 'Invalid sponsor name'; end if;
 select * into p from sms_positions where id='wildcard' for update;
 if not found or p.opening_cents<>25000 or p.current_price_cents<>25000 or p.owner_name is not null or p.purchases<>0 then
  raise exception 'Wildcard is not in its pristine opening state';
 end if;
 if p_plan is distinct from (select plan_id from sms_plan_mappings where position_id='wildcard') then
  raise exception 'Invalid Wildcard plan';
 end if;
 if exists(select 1 from sms_payments) or exists(select 1 from sms_ownership_history) or exists(select 1 from sms_takeover_history) then
  raise exception 'Production ledger is not pristine';
 end if;
 select * into r from sms_reservations
  where position_id='wildcard' and controlled_test and client_hash=p_client and state='pending'
  order by created_at desc limit 1 for update;
 if found then
  return jsonb_build_object('id',r.id,'priceCents',r.price_cents,'checkoutId',r.checkout_id);
 end if;
 if exists(select 1 from sms_reservations where position_id='wildcard' and state in ('pending','review')) then
  raise exception 'Wildcard is already reserved';
 end if;
 insert into sms_reservations(position_id,sponsor_name,price_cents,client_hash,plan_id,controlled_test)
 values('wildcard',p_name,25000,p_client,p_plan,true) returning * into r;
 return jsonb_build_object('id',r.id,'priceCents',r.price_cents,'checkoutId',r.checkout_id);
end; $$;

create or replace function public.sms_apply_payment(p_event text,p_payment text,p_reservation uuid,p_checkout text,p_plan text,p_amount bigint,p_paid_at timestamptz) returns text language plpgsql security definer set search_path=public as $$
declare r sms_reservations; p sms_positions; c sms_campaign; reason text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_payment,0));
 if exists(select 1 from sms_payments where payment_id=p_payment or event_id=p_event) then return 'duplicate'; end if;
 select * into r from sms_reservations where id=p_reservation for update;
 if not found then
  perform sms_payment_review(p_event,p_payment,'Unknown reservation');return 'review';
 end if;
 select * into p from sms_positions where id=r.position_id for update;
 select * into c from sms_campaign where id='addis-dubai-2026' for share;
 if p_paid_at is null or p_amount is null or p_checkout is null or p_plan is null then reason:='Missing payment binding';
 elsif r.controlled_test and (r.position_id<>'wildcard' or c.status<>'preview' or c.starts_at is not null or c.ends_at is not null) then reason:='Invalid controlled test state';
 elsif not r.controlled_test and (c.starts_at is null or c.status not in ('live','closed') or p_paid_at<c.starts_at or p_paid_at>=c.ends_at) then reason:='Payment outside approved auction window';
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

revoke all on function public.sms_reserve_controlled_wildcard(text,text,text) from public,anon,authenticated;
grant execute on function public.sms_reserve_controlled_wildcard(text,text,text) to service_role;
