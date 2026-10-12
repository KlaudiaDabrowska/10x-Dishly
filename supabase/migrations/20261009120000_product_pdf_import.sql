-- Separate end-user imports from the F-01 evaluation channel while retaining the shared ledger.

alter table public.pdf_imports
  add column channel text not null default 'evaluation'
  check (channel in ('product', 'evaluation'));

create function public.protect_pdf_import_channel()
returns trigger
language plpgsql
set search_path = ''
as $protect$
begin
  if new.channel is distinct from old.channel then
    raise exception 'immutable import channel';
  end if;
  return new;
end;
$protect$;

create trigger pdf_imports_protect_channel
  before update of channel on public.pdf_imports
  for each row execute function public.protect_pdf_import_channel();

-- Channel-aware creation. The route supplies the channel; a retry must use the same channel.
create function public.create_pdf_import(
  p_owner_id uuid,
  p_import_id uuid,
  p_channel text,
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
  if p_owner_id is null or p_import_id is null or p_channel is null or
     p_channel not in ('product', 'evaluation') or
     p_expires_at is null or p_file_fingerprint is null or p_manifest_digest is null or p_source_filename is null or
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

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pdf-validation:' || p_owner_id::text, 0));
  if exists (select 1 from public.pdf_imports where id = p_import_id) then
    if exists (
      select 1 from public.pdf_imports
      where id = p_import_id and owner_id = p_owner_id and channel = p_channel and batch_count is not null and
        manifest_digest = p_manifest_digest and file_fingerprint = p_file_fingerprint
    ) then
      return query
        select i.id, i.status, i.expires_at, i.created_at from public.pdf_imports as i where i.id = p_import_id;
      return;
    end if;
    raise exception 'import id conflict';
  end if;
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
    id, owner_id, channel, file_fingerprint, manifest_digest, expires_at, batch_count, manifest, source_filename
  ) values (
    p_import_id, p_owner_id, p_channel, p_file_fingerprint, p_manifest_digest, p_expires_at, v_count, p_manifest,
    p_source_filename
  );
  return query
    select i.id, i.status, i.expires_at, i.created_at from public.pdf_imports as i where i.id = p_import_id;
end;
$create$;

create function public.get_pdf_import(p_owner_id uuid, p_import_id uuid, p_channel text)
returns table (
  import_id uuid,
  channel text,
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
  select i.id, i.channel, i.status, i.file_fingerprint, i.manifest_digest, i.batch_count, i.manifest,
    i.source_filename, i.created_at, i.expires_at,
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
  where i.id = p_import_id and i.owner_id = p_owner_id and i.channel = p_channel and i.batch_count is not null;
$get$;

-- Legacy F-01 readers stay pinned to evaluation imports.
create or replace function public.get_pdf_validation_import(p_owner_id uuid, p_import_id uuid)
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
as $legacy_get$
  select i.import_id, i.status, i.file_fingerprint, i.manifest_digest, i.batch_count, i.manifest,
    i.source_filename, i.created_at, i.expires_at, i.batches, i.results, i.outcome
  from public.get_pdf_import(p_owner_id, p_import_id, 'evaluation') as i;
$legacy_get$;

create or replace function public.get_pdf_import_recipes(p_owner_id uuid, p_import_id uuid)
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
  join public.pdf_imports as i on i.id = r.import_id and i.owner_id = r.owner_id
  where r.owner_id = p_owner_id and r.import_id = p_import_id and i.channel = 'evaluation'
  order by r.source_start_page, r.source_start_item;
$import_recipes$;

-- Product reservations share the per-import and monthly caps. Evaluation also consumes F-01.
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
as $reserve$
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

  select * into v_batch from public.pdf_import_batches
  where pdf_import_batches.import_id = p_import_id and pdf_import_batches.batch_index = p_batch_index for update;
  if v_batch.input_digest <> p_input_digest or v_batch.core_page_start <> p_core_page_start or
     v_batch.core_page_end <> p_core_page_end then
    raise exception 'immutable batch identity mismatch';
  end if;
  if not coalesce(v_inserted, false) and not (
    v_batch.status = 'rate-limited' and v_import.status = 'processing' and
    v_import.expires_at > p_accounting_time and
    (select count(*) from public.pdf_budget_reservations as r
      where r.import_id = p_import_id and r.batch_index = p_batch_index) = 1
  ) then
    return query select false, p_import_id, p_batch_index, v_batch.attempt_id,
      v_batch.reservation_id, v_batch.status;
    return;
  end if;

  insert into public.pdf_budget_scopes (scope_key, kind, limit_nano_usd)
  values ('import:' || p_import_id::text, 'import', 500000000)
  on conflict (scope_key) do nothing;
  if v_import.channel = 'evaluation' then
    insert into public.pdf_budget_scopes (scope_key, kind, limit_nano_usd)
    values ('f01', 'f01', 7000000000) on conflict (scope_key) do nothing;
  end if;
  insert into public.pdf_budget_scopes (scope_key, kind, period_start, period_end, limit_nano_usd)
  values (
    'month:' || to_char(v_month_start at time zone 'UTC', 'YYYY-MM'),
    'month', v_month_start, v_month_end, 10000000000
  ) on conflict (scope_key) do nothing;

  for v_scope in
    select s.scope_key, s.spent_nano_usd, s.held_nano_usd, s.limit_nano_usd
    from public.pdf_budget_scopes as s
    where s.scope_key in (
      'import:' || p_import_id::text,
      'month:' || to_char(v_month_start at time zone 'UTC', 'YYYY-MM')
    ) or (v_import.channel = 'evaluation' and s.scope_key = 'f01')
    order by s.scope_key for update
  loop
    if v_scope.spent_nano_usd + v_scope.held_nano_usd + p_maximum_cost_nano_usd > v_scope.limit_nano_usd then
      raise exception 'budget exceeded for %', v_scope.scope_key using errcode = 'P0001';
    end if;
  end loop;

  insert into public.pdf_budget_reservations (
    id, import_id, batch_index, owner_id, attempt_id, state, reserved_nano_usd, pricing_snapshot, dispatched_at
  ) values (
    v_reservation_id, p_import_id, p_batch_index, p_owner_id, v_attempt_id,
    'dispatch-claimed', p_maximum_cost_nano_usd, p_pricing_snapshot, clock_timestamp()
  );
  insert into public.pdf_budget_allocations (reservation_id, scope_key, reserved_nano_usd)
  select v_reservation_id, s.scope_key, p_maximum_cost_nano_usd
  from public.pdf_budget_scopes as s
  where s.scope_key in (
    'import:' || p_import_id::text,
    'month:' || to_char(v_month_start at time zone 'UTC', 'YYYY-MM')
  ) or (v_import.channel = 'evaluation' and s.scope_key = 'f01');
  update public.pdf_budget_scopes as s
  set held_nano_usd = held_nano_usd + p_maximum_cost_nano_usd
  where s.scope_key in (
    'import:' || p_import_id::text,
    'month:' || to_char(v_month_start at time zone 'UTC', 'YYYY-MM')
  ) or (v_import.channel = 'evaluation' and s.scope_key = 'f01');

  update public.pdf_import_batches
  set status = 'dispatch-claimed', attempt_id = v_attempt_id,
    reservation_id = v_reservation_id, updated_at = clock_timestamp()
  where pdf_import_batches.import_id = p_import_id and pdf_import_batches.batch_index = p_batch_index;
  return query select true, p_import_id, p_batch_index, v_attempt_id,
    v_reservation_id, 'dispatch-claimed'::text;
end;
$reserve$;

revoke all on function public.protect_pdf_import_channel() from public, anon, authenticated;
revoke all on function public.create_pdf_import(uuid, uuid, text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_pdf_import(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_pdf_import(uuid, uuid, text, text, text, text, jsonb, timestamptz)
  to service_role;
grant execute on function public.get_pdf_import(uuid, uuid, text) to service_role;
