create table public.pdf_imports (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_fingerprint text not null check (length(file_fingerprint) between 32 and 128),
  manifest_digest text not null check (length(manifest_digest) between 32 and 128),
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed', 'cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (owner_id, id)
);

create table public.pdf_import_batches (
  import_id uuid not null references public.pdf_imports(id) on delete cascade,
  batch_index integer not null check (batch_index >= 0 and batch_index < 32),
  input_digest text not null check (length(input_digest) between 32 and 128),
  core_page_start integer not null check (core_page_start >= 1 and core_page_start <= 100),
  core_page_end integer not null check (core_page_end >= core_page_start and core_page_end <= 100),
  status text not null default 'created' check (status in ('created', 'dispatch-claimed', 'reconciled', 'failed')),
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
  state text not null check (state in ('reserved', 'dispatch-claimed', 'reconciled', 'released')),
  reserved_nano_usd bigint not null check (reserved_nano_usd > 0),
  actual_nano_usd bigint check (actual_nano_usd is null or actual_nano_usd >= 0),
  pricing_snapshot jsonb not null,
  reserved_at timestamptz not null default clock_timestamp(),
  dispatched_at timestamptz,
  reconciled_at timestamptz,
  foreign key (import_id, batch_index) references public.pdf_import_batches(import_id, batch_index),
  foreign key (owner_id, import_id) references public.pdf_imports(owner_id, id),
  unique (import_id, batch_index)
);

alter table public.pdf_import_batches
  add constraint pdf_import_batches_reservation_fk
  foreign key (reservation_id) references public.pdf_budget_reservations(id) deferrable initially deferred;

create table public.pdf_budget_allocations (
  reservation_id uuid not null references public.pdf_budget_reservations(id) on delete cascade,
  scope_key text not null references public.pdf_budget_scopes(scope_key),
  reserved_nano_usd bigint not null check (reserved_nano_usd > 0),
  primary key (reservation_id, scope_key)
);

create table public.pdf_usage_reports (
  report_id uuid primary key,
  reservation_id uuid not null references public.pdf_budget_reservations(id),
  actual_nano_usd bigint not null check (actual_nano_usd >= 0),
  input_tokens bigint not null check (input_tokens >= 0),
  output_tokens bigint not null check (output_tokens >= 0),
  output_digest text not null check (length(output_digest) between 32 and 128),
  recorded_at timestamptz not null default clock_timestamp()
);

alter table public.pdf_imports enable row level security;
alter table public.pdf_import_batches enable row level security;
alter table public.pdf_budget_scopes enable row level security;
alter table public.pdf_budget_reservations enable row level security;
alter table public.pdf_budget_allocations enable row level security;
alter table public.pdf_usage_reports enable row level security;

revoke all on table public.pdf_imports from public, anon, authenticated, service_role;
revoke all on table public.pdf_import_batches from public, anon, authenticated, service_role;
revoke all on table public.pdf_budget_scopes from public, anon, authenticated, service_role;
revoke all on table public.pdf_budget_reservations from public, anon, authenticated, service_role;
revoke all on table public.pdf_budget_allocations from public, anon, authenticated, service_role;
revoke all on table public.pdf_usage_reports from public, anon, authenticated, service_role;

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
     p_core_page_start < 1 or p_core_page_end < p_core_page_start or p_core_page_end > 100 or
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

  if not coalesce(v_inserted, false) then
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

revoke all on function public.reserve_pdf_batch(uuid, uuid, integer, text, text, text, integer, integer, bigint, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.reconcile_pdf_usage(uuid, uuid, uuid, bigint, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.get_pdf_import_state(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_pdf_reservation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.close_expired_pdf_import(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.get_pdf_budget_scope(text) from public, anon, authenticated;
grant execute on function public.reserve_pdf_batch(uuid, uuid, integer, text, text, text, integer, integer, bigint, jsonb, timestamptz, timestamptz) to service_role;
grant execute on function public.reconcile_pdf_usage(uuid, uuid, uuid, bigint, bigint, bigint, text) to service_role;
grant execute on function public.get_pdf_import_state(uuid, uuid) to service_role;
grant execute on function public.release_pdf_reservation(uuid, uuid) to service_role;
grant execute on function public.close_expired_pdf_import(uuid, uuid, timestamptz) to service_role;
grant execute on function public.get_pdf_budget_scope(text) to service_role;
