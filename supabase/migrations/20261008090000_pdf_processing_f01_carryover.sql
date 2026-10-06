-- Phase 6 (2026-10-06): one-time carry-over of the cumulative F-01 ledger into this database.
-- The F-01 history (smoke, tuning and acceptance runs) was recorded in the local evaluation ledger
-- only. A trusted operator carries its confirmed spend and held unknown charges into this database's
-- f01 scope exactly once, bound to an evidence digest. Additive only: existing spend and holds are
-- never reduced, other scopes are untouched, and the carried hold has no reservation of its own, so
-- it stays held (fail-closed) until a separate trusted reconciliation. Service role only.

create table public.pdf_budget_carryovers (
  scope_key text primary key references public.pdf_budget_scopes(scope_key) check (scope_key = 'f01'),
  carried_spent_nano_usd bigint not null check (carried_spent_nano_usd >= 0),
  carried_held_nano_usd bigint not null check (carried_held_nano_usd >= 0),
  source_limit_nano_usd bigint not null check (source_limit_nano_usd > 0),
  evidence_digest text not null check (evidence_digest ~ '^[0-9a-f]{64}$'),
  spent_before_nano_usd bigint not null check (spent_before_nano_usd >= 0),
  held_before_nano_usd bigint not null check (held_before_nano_usd >= 0),
  applied_at timestamptz not null default clock_timestamp(),
  check (carried_spent_nano_usd + carried_held_nano_usd > 0),
  check (carried_spent_nano_usd + carried_held_nano_usd <= source_limit_nano_usd)
);

alter table public.pdf_budget_carryovers enable row level security;
revoke all on table public.pdf_budget_carryovers from public, anon, authenticated, service_role;

create function public.carry_over_pdf_f01_budget(
  p_spent_nano_usd bigint,
  p_held_nano_usd bigint,
  p_source_limit_nano_usd bigint,
  p_evidence_digest text
)
returns table (
  applied boolean,
  scope_limit_nano_usd bigint,
  scope_spent_nano_usd bigint,
  scope_held_nano_usd bigint,
  carried_spent_total_nano_usd bigint,
  carried_held_total_nano_usd bigint,
  carry_over_digest text
)
language plpgsql
security definer
set search_path = ''
as $carryover$
declare
  v_scope public.pdf_budget_scopes%rowtype;
  v_existing public.pdf_budget_carryovers%rowtype;
begin
  if p_spent_nano_usd is null or p_held_nano_usd is null or p_source_limit_nano_usd is null or
     p_evidence_digest is null or p_spent_nano_usd < 0 or p_held_nano_usd < 0 or
     p_spent_nano_usd + p_held_nano_usd = 0 or p_source_limit_nano_usd <= 0 or
     p_spent_nano_usd + p_held_nano_usd > p_source_limit_nano_usd or
     p_evidence_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid carry-over';
  end if;

  -- Same default as reserve_pdf_batch when the scope is first created.
  insert into public.pdf_budget_scopes (scope_key, kind, limit_nano_usd)
  values ('f01', 'f01', 7000000000)
  on conflict (scope_key) do nothing;

  -- Locks the scope row, so this serializes with every reservation and reconciliation.
  select * into v_scope from public.pdf_budget_scopes as s where s.scope_key = 'f01' for update;

  select * into v_existing from public.pdf_budget_carryovers as c where c.scope_key = 'f01';
  if found then
    -- A replay of the identical carry-over changes nothing; any other second carry-over is refused.
    if v_existing.carried_spent_nano_usd = p_spent_nano_usd and
       v_existing.carried_held_nano_usd = p_held_nano_usd and
       v_existing.source_limit_nano_usd = p_source_limit_nano_usd and
       v_existing.evidence_digest = p_evidence_digest then
      return query select false, v_scope.limit_nano_usd, v_scope.spent_nano_usd, v_scope.held_nano_usd,
        v_existing.carried_spent_nano_usd, v_existing.carried_held_nano_usd, v_existing.evidence_digest;
      return;
    end if;
    raise exception 'carry-over already applied';
  end if;

  if v_scope.spent_nano_usd + v_scope.held_nano_usd + p_spent_nano_usd + p_held_nano_usd >
     v_scope.limit_nano_usd then
    raise exception 'carry-over exceeds f01 limit';
  end if;

  insert into public.pdf_budget_carryovers (
    scope_key, carried_spent_nano_usd, carried_held_nano_usd, source_limit_nano_usd, evidence_digest,
    spent_before_nano_usd, held_before_nano_usd
  ) values (
    'f01', p_spent_nano_usd, p_held_nano_usd, p_source_limit_nano_usd, p_evidence_digest,
    v_scope.spent_nano_usd, v_scope.held_nano_usd
  );

  update public.pdf_budget_scopes as s
  set spent_nano_usd = s.spent_nano_usd + p_spent_nano_usd,
      held_nano_usd = s.held_nano_usd + p_held_nano_usd
  where s.scope_key = 'f01';

  select * into v_scope from public.pdf_budget_scopes as s where s.scope_key = 'f01';
  return query select true, v_scope.limit_nano_usd, v_scope.spent_nano_usd, v_scope.held_nano_usd,
    p_spent_nano_usd, p_held_nano_usd, p_evidence_digest;
end;
$carryover$;

create function public.get_pdf_budget_carryover(p_scope_key text)
returns table (
  scope_key text,
  carried_spent_nano_usd bigint,
  carried_held_nano_usd bigint,
  source_limit_nano_usd bigint,
  evidence_digest text,
  spent_before_nano_usd bigint,
  held_before_nano_usd bigint,
  applied_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $get_carryover$
  select c.scope_key, c.carried_spent_nano_usd, c.carried_held_nano_usd, c.source_limit_nano_usd,
    c.evidence_digest, c.spent_before_nano_usd, c.held_before_nano_usd, c.applied_at
  from public.pdf_budget_carryovers as c
  where c.scope_key = p_scope_key;
$get_carryover$;

revoke all on function public.carry_over_pdf_f01_budget(bigint, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.get_pdf_budget_carryover(text) from public, anon, authenticated;
grant execute on function public.carry_over_pdf_f01_budget(bigint, bigint, bigint, text) to service_role;
grant execute on function public.get_pdf_budget_carryover(text) to service_role;
