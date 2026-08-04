-- Existing referred buyers keep the one-invite reduction for the first milestone.
update public.referrals r
set first_milestone_target_confirmed_registrations = greatest(r.standard_target_confirmed_registrations - 1, 1),
    target_confirmed_registrations = greatest(r.standard_target_confirmed_registrations - 1, 1),
    metadata = coalesce(r.metadata, '{}'::jsonb) || jsonb_build_object(
      'registered_with_referral', true,
      'first_target_discount', 1,
      'backfilled_at', now()
    ),
    updated_at = now()
where r.confirmed_registrations = 0
  and not exists (select 1 from public.referral_rewards rw where rw.referral_id = r.id)
  and exists (select 1 from public.referral_events e where e.referred_user_id = r.referrer_user_id);

-- An approved merchant that registered with a valid referral code receives one
-- saved month. The function is idempotent and does not activate the credit.
do $block$
declare v_merchant record;
begin
  for v_merchant in
    select m.id
    from public.merchants m
    where m.approval_status = 'approved'::public.approval_status
      and nullif(btrim(coalesce(m.referral_code_used, '')), '') is not null
  loop
    perform private.register_merchant_referral_after_approval(v_merchant.id, null);
  end loop;
end;
$block$;
