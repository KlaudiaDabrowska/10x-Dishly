-- HTTP 429 is an unbilled pre-processing rejection. A dispatch-claimed reservation that
-- received it may be reconciled at zero cost under a dedicated usage-report kind, and its
-- batch may then be reserved exactly once more under a new reservation. Timeouts and
-- unknown outcomes keep using the fail-closed paths of the original ledger.
alter table public.pdf_usage_reports
  add column kind text not null default 'usage' check (kind in ('usage', 'rate-limited')),
  alter column output_digest drop not null,
  add constraint pdf_usage_reports_kind_digest_check check (
    (kind = 'usage' and output_digest is not null) or
    (kind = 'rate-limited' and output_digest is null and actual_nano_usd = 0 and input_tokens = 0 and output_tokens = 0)
  );

alter table public.pdf_budget_reservations
  drop constraint pdf_budget_reservations_state_check,
  add constraint pdf_budget_reservations_state_check
    check (state in ('reserved', 'dispatch-claimed', 'reconciled', 'released', 'rate-limited')),
  drop constraint pdf_budget_reservations_import_id_batch_index_key;

-- Historical rate-limited reservations stay as evidence; every other state remains unique per batch.
create unique index pdf_budget_reservations_active_batch_key
  on public.pdf_budget_reservations (import_id, batch_index)
  where state <> 'rate-limited';

alter table public.pdf_import_batches
  drop constraint pdf_import_batches_status_check,
  add constraint pdf_import_batches_status_check
    check (status in ('created', 'dispatch-claimed', 'reconciled', 'failed', 'rate-limited'));

create function public.reconcile_pdf_rate_limited(
  p_owner_id uuid,
  p_reservation_id uuid,
  p_usage_report_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $rate_limited$
declare
  v_reservation public.pdf_budget_reservations%rowtype;
  v_inserted boolean;
begin
  select * into v_reservation
  from public.pdf_budget_reservations
  where id = p_reservation_id
  for update;

  if not found or v_reservation.owner_id <> p_owner_id then
    raise exception 'reservation not found';
  end if;

  insert into public.pdf_usage_reports (
    report_id, reservation_id, actual_nano_usd, input_tokens, output_tokens, output_digest, kind
  ) values (
    p_usage_report_id, p_reservation_id, 0, 0, 0, null, 'rate-limited'
  ) on conflict (report_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    if not exists (
      select 1 from public.pdf_usage_reports
      where report_id = p_usage_report_id and reservation_id = p_reservation_id and kind = 'rate-limited'
    ) then
      raise exception 'usage report identity mismatch';
    end if;
    return false;
  end if;

  if v_reservation.state <> 'dispatch-claimed' then
    raise exception 'reservation is not dispatch claimed';
  end if;

  perform 1
  from public.pdf_budget_scopes
  where scope_key in (
    select scope_key from public.pdf_budget_allocations where reservation_id = p_reservation_id
  )
  order by scope_key
  for update;

  update public.pdf_budget_scopes as scope
  set held_nano_usd = scope.held_nano_usd - allocation.reserved_nano_usd
  from public.pdf_budget_allocations as allocation
  where allocation.reservation_id = p_reservation_id and allocation.scope_key = scope.scope_key;

  update public.pdf_budget_reservations
  set state = 'rate-limited', actual_nano_usd = 0, reconciled_at = clock_timestamp()
  where id = p_reservation_id;

  update public.pdf_import_batches
  set status = 'rate-limited', updated_at = clock_timestamp()
  where pdf_import_batches.import_id = v_reservation.import_id and
    pdf_import_batches.batch_index = v_reservation.batch_index and
    pdf_import_batches.reservation_id = p_reservation_id;

  return true;
end;
$rate_limited$;

-- Same identity and permissions; additionally admits one new reservation for a batch whose
-- only previous attempt was reconciled as rate-limited, while its import is still open.
create or replace function public.reserve_pdf_batch(
  p_owner_id uuid,
  p_import_id uuid,
  p_batch_index integer,
  p_file_fingerprint text,
  p_manifest_digest text,
  p_input_digest text,
  p_core_page_start integer,
  p_core_page_end integer,
  p_maximum_cost_nano_usd bigint,
  p_pricing_snapshot jsonb,
  p_expires_at timestamptz,
  p_accounting_time timestamptz default clock_timestamp()
)
returns table (
  claimed boolean,
  import_id uuid,
  batch_index integer,
  attempt_id uuid,
  reservation_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted boolean;
  v_import public.pdf_imports%rowtype;
  v_batch public.pdf_import_batches%rowtype;
  v_attempt_id uuid := gen_random_uuid();
  v_reservation_id uuid := gen_random_uuid();
  v_month_start timestamptz := date_trunc('month', p_accounting_time at time zone 'UTC') at time zone 'UTC';
  v_month_end timestamptz;
  v_scope record;
begin
  if p_owner_id is null or p_import_id is null or p_maximum_cost_nano_usd <= 0 or
     p_maximum_cost_nano_usd > 500000000 or p_batch_index < 0 or p_batch_index >= 32 or
     p_core_page_start < 1 or p_core_page_end < p_core_page_start or p_core_page_end > 115 or
     length(p_file_fingerprint) not between 32 and 128 or
     length(p_manifest_digest) not between 32 and 128 or
     length(p_input_digest) not between 32 and 128 or
     jsonb_typeof(p_pricing_snapshot) <> 'object' or
     not (p_pricing_snapshot ?& array['provider', 'model', 'inputNanoUsdPerMillionTokens', 'outputNanoUsdPerMillionTokens']) or
     p_pricing_snapshot - array['provider', 'model', 'inputNanoUsdPerMillionTokens', 'outputNanoUsdPerMillionTokens'] <> '{}'::jsonb or
     jsonb_typeof(p_pricing_snapshot -> 'provider') <> 'string' or
     jsonb_typeof(p_pricing_snapshot -> 'model') <> 'string' or
     jsonb_typeof(p_pricing_snapshot -> 'inputNanoUsdPerMillionTokens') <> 'number' or
     jsonb_typeof(p_pricing_snapshot -> 'outputNanoUsdPerMillionTokens') <> 'number' or
     p_expires_at <= p_accounting_time then
    raise exception 'invalid reservation';
  end if;
  v_month_end := v_month_start + interval '1 month';

  insert into public.pdf_imports (id, owner_id, file_fingerprint, manifest_digest, expires_at)
  values (p_import_id, p_owner_id, p_file_fingerprint, p_manifest_digest, p_expires_at)
  on conflict (id) do nothing;

  select * into v_import from public.pdf_imports where id = p_import_id for update;
  if not found or v_import.owner_id <> p_owner_id or v_import.file_fingerprint <> p_file_fingerprint or
     v_import.manifest_digest <> p_manifest_digest then
    raise exception 'immutable import identity mismatch';
  end if;

  insert into public.pdf_import_batches (
    import_id, batch_index, input_digest, core_page_start, core_page_end, expires_at
  ) values (
    p_import_id, p_batch_index, p_input_digest, p_core_page_start, p_core_page_end, p_expires_at
  ) on conflict on constraint pdf_import_batches_pkey do nothing
  returning true into v_inserted;

  select * into v_batch
  from public.pdf_import_batches
  where pdf_import_batches.import_id = p_import_id and pdf_import_batches.batch_index = p_batch_index
  for update;

  if v_batch.input_digest <> p_input_digest or v_batch.core_page_start <> p_core_page_start or
     v_batch.core_page_end <> p_core_page_end then
    raise exception 'immutable batch identity mismatch';
  end if;

  if not coalesce(v_inserted, false) and not (
    v_batch.status = 'rate-limited' and
    v_import.status = 'processing' and
    v_import.expires_at > p_accounting_time and
    (
      select count(*) from public.pdf_budget_reservations as r
      where r.import_id = p_import_id and r.batch_index = p_batch_index
    ) = 1
  ) then
    return query select false, p_import_id, p_batch_index, v_batch.attempt_id,
      v_batch.reservation_id, v_batch.status;
    return;
  end if;

  insert into public.pdf_budget_scopes (scope_key, kind, limit_nano_usd)
  values
    ('f01', 'f01', 5000000000),
    ('import:' || p_import_id::text, 'import', 500000000)
  on conflict (scope_key) do nothing;

  insert into public.pdf_budget_scopes (scope_key, kind, period_start, period_end, limit_nano_usd)
  values (
    'month:' || to_char(v_month_start at time zone 'UTC', 'YYYY-MM'),
    'month', v_month_start, v_month_end, 10000000000
  ) on conflict (scope_key) do nothing;

  for v_scope in
    select pdf_budget_scopes.scope_key, pdf_budget_scopes.spent_nano_usd,
      pdf_budget_scopes.held_nano_usd, pdf_budget_scopes.limit_nano_usd
    from public.pdf_budget_scopes
    where pdf_budget_scopes.scope_key in (
      'f01',
      'import:' || p_import_id::text,
      'month:' || to_char(v_month_start at time zone 'UTC', 'YYYY-MM')
    )
    order by pdf_budget_scopes.scope_key
    for update
  loop
    if v_scope.spent_nano_usd + v_scope.held_nano_usd + p_maximum_cost_nano_usd > v_scope.limit_nano_usd then
      raise exception 'budget exceeded for %', v_scope.scope_key using errcode = 'P0001';
    end if;
  end loop;

  insert into public.pdf_budget_reservations (
    id, import_id, batch_index, owner_id, attempt_id, state, reserved_nano_usd,
    pricing_snapshot, dispatched_at
  ) values (
    v_reservation_id, p_import_id, p_batch_index, p_owner_id, v_attempt_id,
    'dispatch-claimed', p_maximum_cost_nano_usd, p_pricing_snapshot, clock_timestamp()
  );

  insert into public.pdf_budget_allocations (reservation_id, scope_key, reserved_nano_usd)
  select v_reservation_id, pdf_budget_scopes.scope_key, p_maximum_cost_nano_usd
  from public.pdf_budget_scopes
  where pdf_budget_scopes.scope_key in (
    'f01',
    'import:' || p_import_id::text,
    'month:' || to_char(v_month_start at time zone 'UTC', 'YYYY-MM')
  );

  update public.pdf_budget_scopes
  set held_nano_usd = held_nano_usd + p_maximum_cost_nano_usd
  where pdf_budget_scopes.scope_key in (
    'f01',
    'import:' || p_import_id::text,
    'month:' || to_char(v_month_start at time zone 'UTC', 'YYYY-MM')
  );

  update public.pdf_import_batches
  set status = 'dispatch-claimed', attempt_id = v_attempt_id,
    reservation_id = v_reservation_id, updated_at = clock_timestamp()
  where pdf_import_batches.import_id = p_import_id and pdf_import_batches.batch_index = p_batch_index;

  return query select true, p_import_id, p_batch_index, v_attempt_id,
    v_reservation_id, 'dispatch-claimed'::text;
end;
$$;

-- Same signature; batches additionally expose the current reservation identity for
-- trusted reconciliation tooling (service_role only).
create or replace function public.get_pdf_import_state(p_owner_id uuid, p_import_id uuid)
returns table (
  import_id uuid,
  owner_id uuid,
  file_fingerprint text,
  manifest_digest text,
  status text,
  expires_at timestamptz,
  batches jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  select i.id, i.owner_id, i.file_fingerprint, i.manifest_digest, i.status, i.expires_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'batchIndex', b.batch_index,
          'inputDigest', b.input_digest,
          'corePageStart', b.core_page_start,
          'corePageEnd', b.core_page_end,
          'status', b.status,
          'outputDigest', b.output_digest,
          'expiresAt', b.expires_at,
          'attemptId', b.attempt_id,
          'reservationId', b.reservation_id,
          'reservationState', r.state,
          'reservedCostNanoUsd', r.reserved_nano_usd,
          'actualCostNanoUsd', b.actual_cost_nano_usd,
          'inputTokens', b.input_tokens,
          'outputTokens', b.output_tokens,
          'pricingSnapshot', r.pricing_snapshot
        ) order by b.batch_index
      ) filter (where b.batch_index is not null),
      '[]'::jsonb
    )
  from public.pdf_imports as i
  left join public.pdf_import_batches as b on b.import_id = i.id
  left join public.pdf_budget_reservations as r on r.id = b.reservation_id
  where i.id = p_import_id and i.owner_id = p_owner_id
  group by i.id;
$$;

revoke all on function public.reconcile_pdf_rate_limited(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.reserve_pdf_batch(uuid, uuid, integer, text, text, text, integer, integer, bigint, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.get_pdf_import_state(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reconcile_pdf_rate_limited(uuid, uuid, uuid) to service_role;
grant execute on function public.reserve_pdf_batch(uuid, uuid, integer, text, text, text, integer, integer, bigint, jsonb, timestamptz, timestamptz) to service_role;
grant execute on function public.get_pdf_import_state(uuid, uuid) to service_role;
