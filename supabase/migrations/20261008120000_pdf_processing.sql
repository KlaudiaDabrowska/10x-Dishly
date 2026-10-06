-- PDF processing (F-01) schema, consolidated.
-- This single migration replaces the nine F-01 migrations dated 2026-09-30 to 2026-10-08:
--   20260930090000_pdf_processing_ledger, 20261004090000_pdf_processing_page_limit_115,
--   20261005090000_pdf_processing_rate_limit, 20261006090000_pdf_processing_f01_budget_6,
--   20261006120000_pdf_processing_f01_budget_7, 20261007090000_pdf_processing_recipes,
--   20261007100000_pdf_processing_review_fixes, 20261008090000_pdf_processing_f01_carryover,
--   20261008100000_pdf_processing_benchmark_read.
-- It creates their final schema directly: every table with its final columns and constraints,
-- every function in its latest definition only, and the final effective grants. The one-time
-- f01 limit updates of the originals are omitted; a fresh database has no f01 scope until the
-- first reservation or carry-over creates it with the USD 7 default (7,000,000,000 nano-USD).
-- scripts/pdf-migration-equivalence.mjs proves this file yields the same schema as the nine
-- originals (npm run test:pdf:migration).

-- ---------------------------------------------------------------------------------------------
-- Ledger tables
-- ---------------------------------------------------------------------------------------------

-- Validation-screen imports (batch_count set) also keep non-content metadata (core ranges,
-- digests, counts); raw source text and unsaved candidate content never reach the database.
create table public.pdf_imports (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_fingerprint text not null check (length(file_fingerprint) between 32 and 128),
  manifest_digest text not null check (length(manifest_digest) between 32 and 128),
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'committed', 'failed', 'cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  batch_count integer check (batch_count is null or (batch_count between 1 and 32)),
  manifest jsonb check (manifest is null or jsonb_typeof(manifest) = 'object'),
  source_filename text check (source_filename is null or length(source_filename) between 1 and 255),
  unique (owner_id, id)
);

create table public.pdf_import_batches (
  import_id uuid not null references public.pdf_imports(id) on delete cascade,
  batch_index integer not null check (batch_index >= 0 and batch_index < 32),
  input_digest text not null check (length(input_digest) between 32 and 128),
  core_page_start integer not null
    constraint pdf_import_batches_core_page_start_check check (core_page_start >= 1 and core_page_start <= 115),
  core_page_end integer not null
    constraint pdf_import_batches_core_page_end_check check (core_page_end >= core_page_start and core_page_end <= 115),
  status text not null default 'created'
    check (status in ('created', 'dispatch-claimed', 'reconciled', 'failed', 'rate-limited')),
  output_digest text check (output_digest is null or length(output_digest) between 32 and 128),
  expires_at timestamptz not null,
  attempt_id uuid,
  reservation_id uuid unique,
  actual_cost_nano_usd bigint check (actual_cost_nano_usd is null or actual_cost_nano_usd >= 0),
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (import_id, batch_index)
);

create table public.pdf_budget_scopes (
  scope_key text primary key,
  kind text not null check (kind in ('f01', 'import', 'month')),
  period_start timestamptz,
  period_end timestamptz,
  limit_nano_usd bigint not null check (limit_nano_usd > 0),
  spent_nano_usd bigint not null default 0 check (spent_nano_usd >= 0),
  held_nano_usd bigint not null default 0 check (held_nano_usd >= 0),
  check ((kind = 'month' and period_start is not null and period_end is not null) or
    (kind <> 'month' and period_start is null and period_end is null)),
  check (spent_nano_usd + held_nano_usd <= limit_nano_usd)
);

create table public.pdf_budget_reservations (
  id uuid primary key,
  import_id uuid not null,
  batch_index integer not null,
  owner_id uuid not null,
  attempt_id uuid not null unique,
  state text not null
    check (state in ('reserved', 'dispatch-claimed', 'reconciled', 'released', 'rate-limited')),
  reserved_nano_usd bigint not null check (reserved_nano_usd > 0),
  actual_nano_usd bigint check (actual_nano_usd is null or actual_nano_usd >= 0),
  pricing_snapshot jsonb not null,
  reserved_at timestamptz not null default clock_timestamp(),
  dispatched_at timestamptz,
  reconciled_at timestamptz,
  foreign key (import_id, batch_index) references public.pdf_import_batches(import_id, batch_index),
  foreign key (owner_id, import_id) references public.pdf_imports(owner_id, id)
);

-- HTTP 429 is an unbilled pre-processing rejection: a rate-limited batch may be reserved exactly
-- once more. Historical rate-limited reservations stay as evidence; every other state remains
-- unique per batch.
create unique index pdf_budget_reservations_active_batch_key
  on public.pdf_budget_reservations (import_id, batch_index)
  where state <> 'rate-limited';

alter table public.pdf_import_batches
  add constraint pdf_import_batches_reservation_fk
  foreign key (reservation_id) references public.pdf_budget_reservations(id) deferrable initially deferred;

create table public.pdf_budget_allocations (
  reservation_id uuid not null references public.pdf_budget_reservations(id) on delete cascade,
  scope_key text not null references public.pdf_budget_scopes(scope_key),
  reserved_nano_usd bigint not null check (reserved_nano_usd > 0),
  primary key (reservation_id, scope_key)
);

-- A rate-limited (429) reservation is reconciled at zero cost under a dedicated report kind.
create table public.pdf_usage_reports (
  report_id uuid primary key,
  reservation_id uuid not null references public.pdf_budget_reservations(id),
  actual_nano_usd bigint not null check (actual_nano_usd >= 0),
  input_tokens bigint not null check (input_tokens >= 0),
  output_tokens bigint not null check (output_tokens >= 0),
  output_digest text check (length(output_digest) between 32 and 128),
  recorded_at timestamptz not null default clock_timestamp(),
  kind text not null default 'usage' check (kind in ('usage', 'rate-limited')),
  constraint pdf_usage_reports_kind_digest_check check (
    (kind = 'usage' and output_digest is not null) or
    (kind = 'rate-limited' and output_digest is null and actual_nano_usd = 0 and input_tokens = 0 and output_tokens = 0)
  )
);

-- One-time carry-over of the cumulative F-01 ledger, recorded in the local evaluation ledger only,
-- into this database's f01 scope, bound to an evidence digest. The carried hold has no reservation
-- of its own, so it stays held (fail-closed) until a separate trusted reconciliation.
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

-- ---------------------------------------------------------------------------------------------
-- Validation results and recipes
-- ---------------------------------------------------------------------------------------------

-- One canonical validated payload digest per returned candidate, bound to owner/import/batch/schema.
create table public.pdf_batch_results (
  import_id uuid not null,
  batch_index integer not null check (batch_index >= 0 and batch_index < 32),
  owner_id uuid not null,
  schema_name text not null check (length(schema_name) between 1 and 100),
  contract_version integer not null check (contract_version > 0),
  candidate_count integer not null check (candidate_count between 0 and 100),
  invalid_count integer not null check (invalid_count between 0 and 100),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (import_id, batch_index),
  foreign key (import_id, batch_index) references public.pdf_import_batches(import_id, batch_index) on delete cascade,
  foreign key (owner_id, import_id) references public.pdf_imports(owner_id, id) on delete cascade
);

create table public.pdf_batch_candidates (
  import_id uuid not null,
  batch_index integer not null,
  candidate_index integer not null check (candidate_index between 0 and 99),
  source_start_page integer not null check (source_start_page between 1 and 115),
  source_start_item integer not null check (source_start_item >= 0),
  status text not null check (status in ('complete', 'incomplete')),
  payload_digest text not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  primary key (import_id, batch_index, candidate_index),
  foreign key (import_id, batch_index) references public.pdf_batch_results(import_id, batch_index) on delete cascade
);

-- Committed outcome only: counts and row identities, recoverable after a lost response.
create table public.pdf_import_outcomes (
  import_id uuid primary key,
  owner_id uuid not null,
  saved_count integer not null check (saved_count >= 0),
  existing_count integer not null check (existing_count >= 0),
  pending_count integer not null check (pending_count >= 0),
  saved_ids uuid[] not null,
  existing_ids uuid[] not null,
  committed_at timestamptz not null default clock_timestamp(),
  foreign key (owner_id, import_id) references public.pdf_imports(owner_id, id) on delete cascade
);

-- Recipes are written only by the backend finalization RPC; browsers can read their own rows
-- through RLS and nothing else.
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_fingerprint text not null check (file_fingerprint ~ '^[0-9a-f]{64}$'),
  source_start_page integer not null check (source_start_page between 1 and 115),
  source_start_item integer not null check (source_start_item >= 0),
  import_id uuid not null,
  source_filename text not null check (length(source_filename) between 1 and 255),
  source_pages integer[] not null check (cardinality(source_pages) between 1 and 115),
  title text not null check (length(title) between 1 and 2000),
  category text not null check (category in ('breakfast', 'lunch', 'dinner', 'dessert')),
  source_category text check (source_category is null or length(source_category) <= 2000),
  ingredient_groups jsonb not null check (jsonb_typeof(ingredient_groups) = 'array' and jsonb_array_length(ingredient_groups) > 0),
  instructions jsonb not null check (jsonb_typeof(instructions) = 'array' and jsonb_array_length(instructions) > 0),
  servings text check (servings is null or length(servings) <= 2000),
  footnotes jsonb not null default '[]'::jsonb check (jsonb_typeof(footnotes) = 'array'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  -- Stable identity never depends on editable text or the (renameable) filename.
  constraint recipes_source_identity_key unique (owner_id, file_fingerprint, source_start_page, source_start_item)
);

create index recipes_owner_created_idx on public.recipes (owner_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Row level security and table privileges
-- ---------------------------------------------------------------------------------------------

alter table public.pdf_imports enable row level security;
alter table public.pdf_import_batches enable row level security;
alter table public.pdf_budget_scopes enable row level security;
alter table public.pdf_budget_reservations enable row level security;
alter table public.pdf_budget_allocations enable row level security;
alter table public.pdf_usage_reports enable row level security;
alter table public.pdf_budget_carryovers enable row level security;
alter table public.pdf_batch_results enable row level security;
alter table public.pdf_batch_candidates enable row level security;
alter table public.pdf_import_outcomes enable row level security;
alter table public.recipes enable row level security;

revoke all on table public.pdf_imports from public, anon, authenticated, service_role;
revoke all on table public.pdf_import_batches from public, anon, authenticated, service_role;
revoke all on table public.pdf_budget_scopes from public, anon, authenticated, service_role;
revoke all on table public.pdf_budget_reservations from public, anon, authenticated, service_role;
revoke all on table public.pdf_budget_allocations from public, anon, authenticated, service_role;
revoke all on table public.pdf_usage_reports from public, anon, authenticated, service_role;
revoke all on table public.pdf_budget_carryovers from public, anon, authenticated, service_role;
revoke all on table public.pdf_batch_results from public, anon, authenticated, service_role;
revoke all on table public.pdf_batch_candidates from public, anon, authenticated, service_role;
revoke all on table public.pdf_import_outcomes from public, anon, authenticated, service_role;
revoke all on table public.recipes from public, anon, authenticated, service_role;

-- Owner-only reads; no insert/update/delete grant for any browser role. The service role has no
-- table grant on recipes; it reads them only through get_pdf_import_recipes.
grant select on table public.recipes to authenticated;
create policy recipes_owner_read on public.recipes
  for select to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------------------------
-- Budget ledger functions (service role only)
-- ---------------------------------------------------------------------------------------------

-- Reserves the maximum cost of one batch against the f01, import and month scopes before dispatch.
-- Admits one new reservation for a batch whose only previous attempt was reconciled as
-- rate-limited, while its import is still open.
create function public.reserve_pdf_batch(
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

create function public.reconcile_pdf_usage(
  p_owner_id uuid,
  p_reservation_id uuid,
  p_usage_report_id uuid,
  p_actual_cost_nano_usd bigint,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_output_digest text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.pdf_budget_reservations%rowtype;
  v_inserted boolean;
begin
  if p_actual_cost_nano_usd < 0 or p_input_tokens < 0 or p_output_tokens < 0 or
     length(p_output_digest) not between 32 and 128 then
    raise exception 'invalid usage report';
  end if;

  select * into v_reservation
  from public.pdf_budget_reservations
  where id = p_reservation_id
  for update;

  if not found or v_reservation.owner_id <> p_owner_id then
    raise exception 'reservation not found';
  end if;
  if p_actual_cost_nano_usd > v_reservation.reserved_nano_usd then
    raise exception 'actual cost exceeds reserved maximum';
  end if;

  insert into public.pdf_usage_reports (
    report_id, reservation_id, actual_nano_usd, input_tokens, output_tokens, output_digest
  ) values (
    p_usage_report_id, p_reservation_id, p_actual_cost_nano_usd, p_input_tokens, p_output_tokens, p_output_digest
  ) on conflict (report_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    if not exists (
      select 1 from public.pdf_usage_reports
      where report_id = p_usage_report_id and reservation_id = p_reservation_id and
        actual_nano_usd = p_actual_cost_nano_usd and input_tokens = p_input_tokens and
        output_tokens = p_output_tokens and output_digest = p_output_digest
    ) then
      raise exception 'usage report identity mismatch';
    end if;
    return false;
  end if;

  if v_reservation.state = 'reconciled' then
    raise exception 'reservation already reconciled by another report';
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
  set held_nano_usd = scope.held_nano_usd - allocation.reserved_nano_usd,
      spent_nano_usd = scope.spent_nano_usd + p_actual_cost_nano_usd
  from public.pdf_budget_allocations as allocation
  where allocation.reservation_id = p_reservation_id and allocation.scope_key = scope.scope_key;

  update public.pdf_budget_reservations
  set state = 'reconciled', actual_nano_usd = p_actual_cost_nano_usd, reconciled_at = clock_timestamp()
  where id = p_reservation_id;

  update public.pdf_import_batches
  set status = 'reconciled', output_digest = p_output_digest,
    actual_cost_nano_usd = p_actual_cost_nano_usd, input_tokens = p_input_tokens,
    output_tokens = p_output_tokens, updated_at = clock_timestamp()
  where pdf_import_batches.import_id = v_reservation.import_id and
    pdf_import_batches.batch_index = v_reservation.batch_index;

  return true;
end;
$$;

-- HTTP 429 is an unbilled pre-processing rejection. A dispatch-claimed reservation that received it
-- is reconciled at zero cost under a dedicated usage-report kind. Timeouts and unknown outcomes keep
-- using the fail-closed paths above.
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

create function public.release_pdf_reservation(p_owner_id uuid, p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $release$
declare
  v_reservation public.pdf_budget_reservations%rowtype;
begin
  select * into v_reservation
  from public.pdf_budget_reservations
  where id = p_reservation_id
  for update;

  if not found or v_reservation.owner_id <> p_owner_id then
    raise exception 'reservation not found';
  end if;
  if v_reservation.state <> 'reserved' or v_reservation.dispatched_at is not null then
    raise exception 'only a proven undispatched reservation may be released';
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
  set state = 'released'
  where id = p_reservation_id;
  return true;
end;
$release$;

create function public.close_expired_pdf_import(
  p_owner_id uuid,
  p_import_id uuid,
  p_accounting_time timestamptz default clock_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $close$
declare
  v_closed boolean;
begin
  update public.pdf_imports
  set status = 'failed', updated_at = clock_timestamp()
  where id = p_import_id and owner_id = p_owner_id and status = 'processing' and expires_at <= p_accounting_time
  returning true into v_closed;

  if coalesce(v_closed, false) then
    update public.pdf_import_batches
    set status = 'failed', updated_at = clock_timestamp()
    where import_id = p_import_id and status = 'created';
  end if;
  return coalesce(v_closed, false);
end;
$close$;

-- Batches expose the current reservation identity for trusted reconciliation tooling.
create function public.get_pdf_import_state(p_owner_id uuid, p_import_id uuid)
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

create function public.get_pdf_budget_scope(p_scope_key text)
returns table (
  scope_key text,
  kind text,
  period_start timestamptz,
  period_end timestamptz,
  limit_nano_usd bigint,
  spent_nano_usd bigint,
  held_nano_usd bigint
)
language sql
security definer
set search_path = ''
stable
as $scope$
  select s.scope_key, s.kind, s.period_start, s.period_end, s.limit_nano_usd,
    s.spent_nano_usd, s.held_nano_usd
  from public.pdf_budget_scopes as s
  where s.scope_key = p_scope_key;
$scope$;

-- ---------------------------------------------------------------------------------------------
-- F-01 budget carry-over (service role only)
-- ---------------------------------------------------------------------------------------------

-- A trusted operator carries the confirmed spend and held unknown charges into the f01 scope
-- exactly once. Additive only: existing spend and holds are never reduced, other scopes are
-- untouched.
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

-- ---------------------------------------------------------------------------------------------
-- Recipe identity trigger
-- ---------------------------------------------------------------------------------------------

create function public.protect_recipe_identity()
returns trigger
language plpgsql
set search_path = ''
as $identity$
begin
  if new.id <> old.id or new.owner_id <> old.owner_id or new.file_fingerprint <> old.file_fingerprint or
     new.source_start_page <> old.source_start_page or new.source_start_item <> old.source_start_item or
     new.import_id <> old.import_id or new.created_at <> old.created_at then
    raise exception 'recipe source identity is immutable';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$identity$;

create trigger recipes_protect_identity
  before update on public.recipes
  for each row execute function public.protect_recipe_identity();

-- ---------------------------------------------------------------------------------------------
-- Validation import and finalization functions (service role only)
-- ---------------------------------------------------------------------------------------------

-- Idempotent creation keyed by a client-chosen import id (see the comment in the body).
create function public.create_pdf_validation_import(
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

create function public.get_pdf_validation_import(p_owner_id uuid, p_import_id uuid)
returns table (
  import_id uuid,
  status text,
  file_fingerprint text,
  manifest_digest text,
  batch_count integer,
  manifest jsonb,
  source_filename text,
  created_at timestamptz,
  expires_at timestamptz,
  batches jsonb,
  results jsonb,
  outcome jsonb
)
language sql
security definer
set search_path = ''
stable
as $get$
  select i.id, i.status, i.file_fingerprint, i.manifest_digest, i.batch_count, i.manifest, i.source_filename,
    i.created_at, i.expires_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('batchIndex', b.batch_index, 'status', b.status) order by b.batch_index)
      from public.pdf_import_batches as b where b.import_id = i.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'batchIndex', r.batch_index,
          'schemaName', r.schema_name,
          'contractVersion', r.contract_version,
          'invalidCount', r.invalid_count,
          'candidates', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'candidateIndex', c.candidate_index,
                'sourceStartPage', c.source_start_page,
                'sourceStartItem', c.source_start_item,
                'status', c.status,
                'digest', c.payload_digest
              ) order by c.candidate_index
            )
            from public.pdf_batch_candidates as c
            where c.import_id = r.import_id and c.batch_index = r.batch_index
          ), '[]'::jsonb)
        ) order by r.batch_index
      )
      from public.pdf_batch_results as r where r.import_id = i.id
    ), '[]'::jsonb),
    (
      select jsonb_build_object(
        'saved', o.saved_count,
        'alreadySaved', o.existing_count,
        'pending', o.pending_count,
        'savedIds', to_jsonb(o.saved_ids),
        'existingIds', to_jsonb(o.existing_ids),
        'committedAt', o.committed_at
      )
      from public.pdf_import_outcomes as o where o.import_id = i.id
    )
  from public.pdf_imports as i
  where i.id = p_import_id and i.owner_id = p_owner_id and i.batch_count is not null;
$get$;

create function public.record_pdf_batch_result(
  p_owner_id uuid,
  p_import_id uuid,
  p_batch_index integer,
  p_schema_name text,
  p_contract_version integer,
  p_invalid_count integer,
  p_candidates jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $record$
declare
  v_import public.pdf_imports%rowtype;
  v_batch public.pdf_import_batches%rowtype;
  v_candidate jsonb;
  v_position integer := 0;
begin
  if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates) > 100 or
     p_invalid_count is null or p_invalid_count < 0 or p_invalid_count > 100 or p_batch_index is null then
    raise exception 'invalid batch result';
  end if;
  select * into v_import from public.pdf_imports where id = p_import_id for update;
  if not found or v_import.owner_id <> p_owner_id or v_import.batch_count is null then
    raise exception 'import not found';
  end if;
  if v_import.status <> 'processing' or v_import.expires_at <= clock_timestamp() then
    raise exception 'import is not processing';
  end if;
  if p_batch_index < 0 or p_batch_index >= v_import.batch_count then
    raise exception 'invalid batch result';
  end if;
  select * into v_batch from public.pdf_import_batches
  where pdf_import_batches.import_id = p_import_id and pdf_import_batches.batch_index = p_batch_index;
  if not found or v_batch.status <> 'reconciled' or
     v_batch.input_digest is distinct from (v_import.manifest -> 'batches' -> p_batch_index ->> 'inputDigest') then
    raise exception 'batch is not reconciled';
  end if;

  -- A batch result is immutable: a replayed or altered recording never replaces it.
  insert into public.pdf_batch_results (
    import_id, batch_index, owner_id, schema_name, contract_version, candidate_count, invalid_count
  ) values (
    p_import_id, p_batch_index, p_owner_id, p_schema_name, p_contract_version,
    jsonb_array_length(p_candidates), p_invalid_count
  );
  for v_candidate in select value from jsonb_array_elements(p_candidates) loop
    if (v_candidate ->> 'candidateIndex')::integer is distinct from v_position then
      raise exception 'invalid batch result';
    end if;
    insert into public.pdf_batch_candidates (
      import_id, batch_index, candidate_index, source_start_page, source_start_item, status, payload_digest
    ) values (
      p_import_id, p_batch_index, v_position,
      (v_candidate ->> 'sourceStartPage')::integer, (v_candidate ->> 'sourceStartItem')::integer,
      v_candidate ->> 'status', v_candidate ->> 'digest'
    );
    v_position := v_position + 1;
  end loop;
  return true;
end;
$record$;

-- Cancel and failure also close batches that were never dispatched, as close_expired_pdf_import does.
-- Dispatch-claimed/rate-limited batches and their reservations are untouched (possibly charged).
create function public.fail_pdf_validation_import(p_owner_id uuid, p_import_id uuid)
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

create function public.pdf_validation_outcome(p_import_id uuid, p_status text)
returns table (
  status text,
  saved_count integer,
  existing_count integer,
  pending_count integer,
  saved_ids uuid[],
  existing_ids uuid[]
)
language sql
set search_path = ''
stable
as $outcome$
  select p_status, coalesce(o.saved_count, 0), coalesce(o.existing_count, 0), coalesce(o.pending_count, 0),
    coalesce(o.saved_ids, '{}'::uuid[]), coalesce(o.existing_ids, '{}'::uuid[])
  from (select 1) as anchor
  left join public.pdf_import_outcomes as o on o.import_id = p_import_id;
$outcome$;

-- Finalize and cancel lock the same import row, so they serialize. A committed import always
-- returns its stored outcome; cancellation or failure before commit writes no recipe.
create function public.cancel_pdf_validation_import(p_owner_id uuid, p_import_id uuid)
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

create function public.finalize_pdf_validation_import(
  p_owner_id uuid,
  p_import_id uuid,
  p_manifest_digest text,
  p_submitted jsonb,
  p_recipes jsonb
)
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
as $finalize$
declare
  v_import public.pdf_imports%rowtype;
  v_recipe jsonb;
  v_id uuid;
  v_saved uuid[] := '{}';
  v_existing uuid[] := '{}';
  v_keys integer;
  v_pending integer;
begin
  select * into v_import from public.pdf_imports where id = p_import_id for update;
  if not found or v_import.owner_id <> p_owner_id or v_import.batch_count is null then
    raise exception 'import not found';
  end if;
  if v_import.status <> 'processing' then
    return query select * from public.pdf_validation_outcome(p_import_id, v_import.status);
    return;
  end if;
  if v_import.expires_at <= clock_timestamp() then
    update public.pdf_imports set status = 'failed', updated_at = clock_timestamp() where id = p_import_id;
    return query select * from public.pdf_validation_outcome(p_import_id, 'failed');
    return;
  end if;
  if p_manifest_digest is distinct from v_import.manifest_digest then
    raise exception 'manifest mismatch';
  end if;
  if jsonb_typeof(p_submitted) is distinct from 'array' or
     jsonb_typeof(p_recipes) is distinct from 'array' then
    raise exception 'invalid finalization';
  end if;
  if (select count(*) from public.pdf_batch_results where import_id = p_import_id) <> v_import.batch_count then
    raise exception 'batch results missing';
  end if;

  -- Submitted digests must equal the recorded set exactly: nothing missing, added or altered.
  if jsonb_array_length(p_submitted) <> (
       select count(*) from public.pdf_batch_candidates where import_id = p_import_id
     ) or exists (
       select 1 from jsonb_array_elements(p_submitted) as s(value)
       where not exists (
         select 1 from public.pdf_batch_candidates as c
         where c.import_id = p_import_id and c.batch_index = (s.value ->> 'batchIndex')::integer and
           c.candidate_index = (s.value ->> 'candidateIndex')::integer and c.payload_digest = s.value ->> 'digest'
       )
     ) or (
       select count(distinct ((s.value ->> 'batchIndex'), (s.value ->> 'candidateIndex')))
       from jsonb_array_elements(p_submitted) as s(value)
     ) <> jsonb_array_length(p_submitted) then
    raise exception 'payload digest mismatch';
  end if;

  -- Only recorded complete candidates are saved, once per stable source key.
  if exists (
       select 1 from jsonb_array_elements(p_recipes) as r(value)
       where not exists (
         select 1 from public.pdf_batch_candidates as c
         where c.import_id = p_import_id and c.batch_index = (r.value ->> 'batchIndex')::integer and
           c.candidate_index = (r.value ->> 'candidateIndex')::integer and c.payload_digest = r.value ->> 'digest' and
           c.status = 'complete' and c.source_start_page = (r.value ->> 'sourceStartPage')::integer and
           c.source_start_item = (r.value ->> 'sourceStartItem')::integer
       )
     ) or (
       select count(distinct ((r.value ->> 'sourceStartPage'), (r.value ->> 'sourceStartItem')))
       from jsonb_array_elements(p_recipes) as r(value)
     ) <> jsonb_array_length(p_recipes) then
    raise exception 'recipe is not a recorded complete candidate';
  end if;

  for v_recipe in select value from jsonb_array_elements(p_recipes) loop
    v_id := null;
    -- Never upsert mutable content: an existing source key keeps its (possibly edited) row.
    insert into public.recipes (
      owner_id, file_fingerprint, source_start_page, source_start_item, import_id, source_filename,
      source_pages, title, category, source_category, ingredient_groups, instructions, servings, footnotes
    ) values (
      p_owner_id, v_import.file_fingerprint, (v_recipe ->> 'sourceStartPage')::integer,
      (v_recipe ->> 'sourceStartItem')::integer, p_import_id, v_import.source_filename,
      array(select jsonb_array_elements_text(v_recipe -> 'pages')::integer),
      v_recipe ->> 'title', v_recipe ->> 'category', v_recipe ->> 'sourceCategory',
      v_recipe -> 'ingredientGroups', v_recipe -> 'instructions', v_recipe ->> 'servings',
      coalesce(v_recipe -> 'footnotes', '[]'::jsonb)
    )
    on conflict on constraint recipes_source_identity_key do nothing
    returning id into v_id;
    if v_id is not null then
      v_saved := v_saved || v_id;
    else
      select r.id into v_id from public.recipes as r
      where r.owner_id = p_owner_id and r.file_fingerprint = v_import.file_fingerprint and
        r.source_start_page = (v_recipe ->> 'sourceStartPage')::integer and
        r.source_start_item = (v_recipe ->> 'sourceStartItem')::integer;
      v_existing := v_existing || v_id;
    end if;
  end loop;

  select count(distinct (c.source_start_page, c.source_start_item)) into v_keys
  from public.pdf_batch_candidates as c where c.import_id = p_import_id;
  v_pending := v_keys - jsonb_array_length(p_recipes);

  insert into public.pdf_import_outcomes (
    import_id, owner_id, saved_count, existing_count, pending_count, saved_ids, existing_ids
  ) values (
    p_import_id, p_owner_id, cardinality(v_saved), cardinality(v_existing), v_pending, v_saved, v_existing
  );
  update public.pdf_imports set status = 'committed', updated_at = clock_timestamp() where id = p_import_id;
  return query select * from public.pdf_validation_outcome(p_import_id, 'committed');
end;
$finalize$;

-- Read-only, owner- and import-scoped access to the recipes one validation import saved, for the
-- operator's benchmark scoring against the approved goldens.
create function public.get_pdf_import_recipes(p_owner_id uuid, p_import_id uuid)
returns table (
  id uuid,
  source_start_page integer,
  source_start_item integer,
  source_pages integer[],
  title text,
  category text,
  source_category text,
  ingredient_groups jsonb,
  instructions jsonb,
  servings text,
  footnotes jsonb
)
language sql
security definer
set search_path = ''
stable
as $import_recipes$
  select r.id, r.source_start_page, r.source_start_item, r.source_pages, r.title, r.category,
    r.source_category, r.ingredient_groups, r.instructions, r.servings, r.footnotes
  from public.recipes as r
  where r.owner_id = p_owner_id and r.import_id = p_import_id
  order by r.source_start_page, r.source_start_item;
$import_recipes$;

-- ---------------------------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------------------------

-- Supabase default privileges grant execute to anon, authenticated and service_role; every RPC is
-- restricted to the service role. The trigger function keeps only its service_role default, and the
-- internal outcome helper is callable only from the security definer functions that own it.
revoke all on function public.reserve_pdf_batch(uuid, uuid, integer, text, text, text, integer, integer, bigint, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.reconcile_pdf_usage(uuid, uuid, uuid, bigint, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.get_pdf_import_state(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_pdf_reservation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.close_expired_pdf_import(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.get_pdf_budget_scope(text) from public, anon, authenticated;
revoke all on function public.reconcile_pdf_rate_limited(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.protect_recipe_identity() from public, anon, authenticated;
revoke all on function public.create_pdf_validation_import(uuid, uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.get_pdf_validation_import(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_pdf_batch_result(uuid, uuid, integer, text, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.fail_pdf_validation_import(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pdf_validation_outcome(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.cancel_pdf_validation_import(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_pdf_validation_import(uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.carry_over_pdf_f01_budget(bigint, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.get_pdf_budget_carryover(text) from public, anon, authenticated;
revoke all on function public.get_pdf_import_recipes(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_pdf_batch(uuid, uuid, integer, text, text, text, integer, integer, bigint, jsonb, timestamptz, timestamptz) to service_role;
grant execute on function public.reconcile_pdf_usage(uuid, uuid, uuid, bigint, bigint, bigint, text) to service_role;
grant execute on function public.get_pdf_import_state(uuid, uuid) to service_role;
grant execute on function public.release_pdf_reservation(uuid, uuid) to service_role;
grant execute on function public.close_expired_pdf_import(uuid, uuid, timestamptz) to service_role;
grant execute on function public.get_pdf_budget_scope(text) to service_role;
grant execute on function public.reconcile_pdf_rate_limited(uuid, uuid, uuid) to service_role;
grant execute on function public.create_pdf_validation_import(uuid, uuid, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.get_pdf_validation_import(uuid, uuid) to service_role;
grant execute on function public.record_pdf_batch_result(uuid, uuid, integer, text, integer, integer, jsonb) to service_role;
grant execute on function public.fail_pdf_validation_import(uuid, uuid) to service_role;
grant execute on function public.cancel_pdf_validation_import(uuid, uuid) to service_role;
grant execute on function public.finalize_pdf_validation_import(uuid, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.carry_over_pdf_f01_budget(bigint, bigint, bigint, text) to service_role;
grant execute on function public.get_pdf_budget_carryover(text) to service_role;
grant execute on function public.get_pdf_import_recipes(uuid, uuid) to service_role;
