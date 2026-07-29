-- Applied to production on 2026-07-29.
-- Keep the bulk tier recalculation callable only by the Admin Web server.
revoke execute on function public.admin_apply_founder_trial_tiers_as(uuid) from authenticated;
grant execute on function public.admin_apply_founder_trial_tiers_as(uuid) to service_role;
