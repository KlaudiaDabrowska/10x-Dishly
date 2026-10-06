-- Phase 5 review fixes (2026-10-06). Additive redefinitions only; grants are re-stated.
-- F1: a validation-screen import that is cancelled, failed, committed or expired must not reserve
-- or dispatch a new paid batch. reserve_pdf_batch is redefined from 20261006120000 with only that
-- guard added. Ledger-only imports (batch_count null) are unchanged; budgets, identity checks, the
-- 429 retry path and grants are preserved.

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

  -- Validation-screen imports (batch_count set) admit no new reservation once cancelled,
  -- failed, committed or expired. The import row is locked, so this serializes with cancel.
  if v_import.batch_count is not null and (
    v_import.status <> 'processing' or v_import.expires_at <= p_accounting_time
  ) then
    raise exception 'import is not processing';
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
    ('f01', 'f01', 7000000000),
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

revoke all on function public.reserve_pdf_batch(uuid, uuid, integer, text, text, text, integer, integer, bigint, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_pdf_batch(uuid, uuid, integer, text, text, text, integer, integer, bigint, jsonb, timestamptz, timestamptz) to service_role;

-- Cancel and failure also close batches that were never dispatched, as close_expired_pdf_import does.
-- Dispatch-claimed/rate-limited batches and their reservations are untouched (possibly charged).
create or replace function public.cancel_pdf_validation_import(p_owner_id uuid, p_import_id uuid)
returns table (
  status text,
  saved_count integer,
  existing_count integer,
  pending_count integer,
  saved_ids uuid[],
  existing_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $cancel$
declare
  v_import public.pdf_imports%rowtype;
begin
  select * into v_import from public.pdf_imports where id = p_import_id for update;
  if not found or v_import.owner_id <> p_owner_id or v_import.batch_count is null then
    raise exception 'import not found';
  end if;
  if v_import.status in ('processing', 'ready') then
    update public.pdf_imports set status = 'cancelled', updated_at = clock_timestamp() where id = p_import_id;
    update public.pdf_import_batches set status = 'failed', updated_at = clock_timestamp()
    where pdf_import_batches.import_id = p_import_id and pdf_import_batches.status = 'created';
    v_import.status := 'cancelled';
  end if;
  return query select * from public.pdf_validation_outcome(p_import_id, v_import.status);
end;
$cancel$;

create or replace function public.fail_pdf_validation_import(p_owner_id uuid, p_import_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fail$
declare
  v_import public.pdf_imports%rowtype;
begin
  select * into v_import from public.pdf_imports where id = p_import_id for update;
  if not found or v_import.owner_id <> p_owner_id or v_import.batch_count is null then
    raise exception 'import not found';
  end if;
  if v_import.status = 'processing' then
    update public.pdf_imports set status = 'failed', updated_at = clock_timestamp() where id = p_import_id;
    update public.pdf_import_batches set status = 'failed', updated_at = clock_timestamp()
    where pdf_import_batches.import_id = p_import_id and pdf_import_batches.status = 'created';
    return 'failed';
  end if;
  return v_import.status;
end;
$fail$;

revoke all on function public.cancel_pdf_validation_import(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_pdf_validation_import(uuid, uuid) to service_role;
revoke all on function public.fail_pdf_validation_import(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fail_pdf_validation_import(uuid, uuid) to service_role;

-- F2: idempotent creation keyed by a client-chosen import id (see the comment in the body).
create or replace function public.create_pdf_validation_import(
  p_owner_id uuid,
  p_import_id uuid,
  p_file_fingerprint text,
  p_manifest_digest text,
  p_source_filename text,
  p_manifest jsonb,
  p_expires_at timestamptz
)
returns table (import_id uuid, status text, expires_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $create$
declare
  v_count integer;
  v_entry jsonb;
  v_index integer := 0;
  v_next_page integer := 1;
begin
  if p_owner_id is null or p_import_id is null or p_expires_at is null or
     p_file_fingerprint is null or p_manifest_digest is null or p_source_filename is null or
     p_file_fingerprint !~ '^[0-9a-f]{64}$' or p_manifest_digest !~ '^[0-9a-f]{64}$' or
     length(p_source_filename) not between 1 and 255 or
     jsonb_typeof(p_manifest) is distinct from 'object' or
     jsonb_typeof(p_manifest -> 'batches') is distinct from 'array' or
     jsonb_typeof(p_manifest -> 'pageDigests') is distinct from 'array' or
     p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '10 minutes' then
    raise exception 'invalid validation import';
  end if;
  v_count := jsonb_array_length(p_manifest -> 'batches');
  if v_count < 1 or v_count > 32 then
    raise exception 'invalid validation import';
  end if;
  -- Core ranges are contiguous, ordered and cover every page exactly once.
  for v_entry in select value from jsonb_array_elements(p_manifest -> 'batches') loop
    if jsonb_typeof(v_entry) is distinct from 'object' or
       jsonb_typeof(v_entry -> 'batchIndex') is distinct from 'number' or
       jsonb_typeof(v_entry -> 'corePageStart') is distinct from 'number' or
       jsonb_typeof(v_entry -> 'corePageEnd') is distinct from 'number' or
       (v_entry ->> 'batchIndex')::integer is distinct from v_index or
       (v_entry ->> 'corePageStart')::integer is distinct from v_next_page or
       (v_entry ->> 'corePageEnd')::integer < v_next_page or
       (v_entry ->> 'corePageEnd')::integer > 115 or
       coalesce(v_entry ->> 'inputDigest', '') !~ '^[0-9a-f]{64}$' then
      raise exception 'invalid validation import';
    end if;
    v_next_page := (v_entry ->> 'corePageEnd')::integer + 1;
    v_index := v_index + 1;
  end loop;
  if jsonb_array_length(p_manifest -> 'pageDigests') <> v_next_page - 1 or exists (
    select 1 from jsonb_array_elements(p_manifest -> 'pageDigests') as d(value)
    where jsonb_typeof(d.value) <> 'string' or d.value #>> '{}' !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'invalid validation import';
  end if;

  -- One active import per evaluator; different evaluators share only the global budget.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pdf-validation:' || p_owner_id::text, 0));
  -- F2: the browser chooses the import id before sending text, so it can always cancel or look up the
  -- import even when the create response is lost. A retry with the same id, owner and manifest returns
  -- the existing import; any other reuse of the id is rejected without revealing whose it is.
  if exists (select 1 from public.pdf_imports where id = p_import_id) then
    if exists (
      select 1 from public.pdf_imports
      where id = p_import_id and owner_id = p_owner_id and batch_count is not null and
        manifest_digest = p_manifest_digest and file_fingerprint = p_file_fingerprint
    ) then
      return query
        select i.id, i.status, i.expires_at, i.created_at from public.pdf_imports as i where i.id = p_import_id;
      return;
    end if;
    raise exception 'import id conflict';
  end if;
  -- Abandoned imports close as failed; reservations and accounting stay untouched.
  with closed as (
    update public.pdf_imports
    set status = 'failed', updated_at = clock_timestamp()
    where owner_id = p_owner_id and pdf_imports.status in ('processing', 'ready') and batch_count is not null and
      pdf_imports.expires_at <= clock_timestamp()
    returning id
  )
  update public.pdf_import_batches as b
  set status = 'failed', updated_at = clock_timestamp()
  from closed
  where b.import_id = closed.id and b.status = 'created';
  if exists (
    select 1 from public.pdf_imports
    where owner_id = p_owner_id and pdf_imports.status in ('processing', 'ready') and batch_count is not null
  ) then
    raise exception 'active import exists';
  end if;

  insert into public.pdf_imports (
    id, owner_id, file_fingerprint, manifest_digest, expires_at, batch_count, manifest, source_filename
  ) values (
    p_import_id, p_owner_id, p_file_fingerprint, p_manifest_digest, p_expires_at, v_count, p_manifest,
    p_source_filename
  );
  return query
    select i.id, i.status, i.expires_at, i.created_at from public.pdf_imports as i where i.id = p_import_id;
end;
$create$;

revoke all on function public.create_pdf_validation_import(uuid, uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.create_pdf_validation_import(uuid, uuid, text, text, text, jsonb, timestamptz) to service_role;
