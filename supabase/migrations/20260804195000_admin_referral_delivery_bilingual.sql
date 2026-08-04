drop view if exists public.admin_referrals_rewards_dashboard_readable;
create view public.admin_referrals_rewards_dashboard_readable as
select
  r.id,
  r.id as referral_id,
  u.full_name as referrer_name,
  u.primary_email as referrer_email,
  u.mobile as referrer_mobile,
  u.full_name as rewarded_user_name,
  r.referral_code,
  r.referral_url,
  r.confirmed_registrations,
  r.target_confirmed_registrations,
  r.standard_target_confirmed_registrations,
  r.first_milestone_target_confirmed_registrations,
  r.reward_type,
  reward.id as reward_id,
  reward.delivery_status,
  reward.delivered_at,
  reward.milestone_number,
  reward.qualified_registrations,
  greatest(
    case when reward.id is null
      then r.first_milestone_target_confirmed_registrations
      else r.standard_target_confirmed_registrations
    end - greatest(r.confirmed_registrations - coalesce(reward.qualified_registrations, 0), 0),
    0
  ) as remaining_registrations,
  case
    when reward.id is null and r.confirmed_registrations < r.first_milestone_target_confirmed_registrations then 'لم تستحق مكافأة بعد'
    when reward.id is null then 'بانتظار إنشاء المكافأة'
    when reward.delivery_status::text = 'delivered' then 'تم تسليم المكافأة'
    else 'المكافأة مستحقة'
  end as status_ar,
  case
    when reward.id is null and r.confirmed_registrations < r.first_milestone_target_confirmed_registrations then 'Not eligible yet'
    when reward.id is null then 'Reward creation pending'
    when reward.delivery_status::text = 'delivered' then 'Reward delivered'
    else 'Reward earned'
  end as status_en,
  case
    when reward.id is null then 'لا توجد مكافأة مستحقة بعد'
    when reward.delivery_status::text = 'delivered' then 'تم التسليم'
    when reward.delivery_status::text = 'approved' then 'معتمدة وبانتظار التسليم'
    when reward.delivery_status::text = 'rejected' then 'مرفوضة'
    else 'بانتظار المراجعة'
  end as reward_delivery_status_ar,
  case
    when reward.id is null then 'No reward is due yet'
    when reward.delivery_status::text = 'delivered' then 'Delivered'
    when reward.delivery_status::text = 'approved' then 'Approved, awaiting delivery'
    when reward.delivery_status::text = 'rejected' then 'Rejected'
    else 'Pending review'
  end as reward_delivery_status_en,
  concat_ws(' - ', u.full_name, u.primary_email, u.mobile, r.referral_code,
    r.confirmed_registrations::text || ' referral(s)') as row_description_ar,
  coalesce(reward.created_at, r.created_at) as created_at,
  greatest(r.updated_at, coalesce(reward.updated_at, r.updated_at)) as updated_at
from public.referrals r
join public.users u on u.id = r.referrer_user_id
left join lateral (
  select rw.*
  from public.referral_rewards rw
  where rw.referral_id = r.id
  order by rw.created_at desc
  limit 1
) reward on true
where r.confirmed_registrations > 0;

grant select on public.admin_referrals_rewards_dashboard_readable to service_role;
