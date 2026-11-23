-- Public import ids are client-chosen recovery keys scoped to one owner. Relational rows keep a
-- separate globally unique primary key so another owner can safely reuse the same public id.

alter table public.pdf_imports add column client_import_id uuid;
update public.pdf_imports set client_import_id = id;
alter table public.pdf_imports alter column client_import_id set not null;
alter table public.pdf_imports
  add constraint pdf_imports_owner_client_import_id_key unique (owner_id, client_import_id);

create function public.default_pdf_import_client_id()
returns trigger
language plpgsql
set search_path = ''
as $default$
begin
  if new.client_import_id is null then
    new.client_import_id := new.id;
  end if;
  return new;
end;
$default$;

create trigger pdf_imports_default_client_id
  before insert on public.pdf_imports
  for each row execute function public.default_pdf_import_client_id();

create function public.protect_pdf_import_client_id()
returns trigger
language plpgsql
set search_path = ''
as $protect$
begin
  if new.client_import_id is distinct from old.client_import_id then
    raise exception 'immutable client import id';
  end if;
  return new;
end;
$protect$;

create trigger pdf_imports_protect_client_id
  before update of client_import_id on public.pdf_imports
  for each row execute function public.protect_pdf_import_client_id();

-- Trusted wrappers use this resolver before calling the pre-existing implementations, whose ids
-- remain internal primary keys. It is service-role only for diagnostics and integration cleanup.
create function public.pdf_import_internal_id(p_owner_id uuid, p_client_import_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $resolve$
  select i.id
  from public.pdf_imports as i
  where i.owner_id = p_owner_id and i.client_import_id = p_client_import_id;
$resolve$;

-- Preserve the proven implementations under internal-only names. The wrappers below retain every
-- public signature while translating the owner-scoped id at the boundary.
alter function public.reserve_pdf_batch(uuid, uuid, integer, text, text, text, integer, integer, bigint, jsonb, timestamptz, timestamptz)
  rename to reserve_pdf_batch_internal_id;
alter function public.close_expired_pdf_import(uuid, uuid, timestamptz)
  rename to close_expired_pdf_import_internal_id;
alter function public.get_pdf_import_state(uuid, uuid)
  rename to get_pdf_import_state_internal_id;
alter function public.create_pdf_validation_import(uuid, uuid, text, text, text, jsonb, timestamptz)
  rename to create_pdf_validation_import_internal_id;
alter function public.get_pdf_validation_import(uuid, uuid)
  rename to get_pdf_validation_import_internal_id;
alter function public.record_pdf_batch_result(uuid, uuid, integer, text, integer, integer, jsonb)
  rename to record_pdf_batch_result_internal_id;
alter function public.fail_pdf_validation_import(uuid, uuid)
  rename to fail_pdf_validation_import_internal_id;
alter function public.cancel_pdf_validation_import(uuid, uuid)
  rename to cancel_pdf_validation_import_internal_id;
alter function public.finalize_pdf_validation_import(uuid, uuid, text, jsonb, jsonb)
  rename to finalize_pdf_validation_import_internal_id;
alter function public.get_pdf_import_recipes(uuid, uuid)
  rename to get_pdf_import_recipes_internal_id;
alter function public.create_pdf_import(uuid, uuid, text, text, text, text, jsonb, timestamptz)
  rename to create_pdf_import_internal_id;
alter function public.get_pdf_import(uuid, uuid, text)
  rename to get_pdf_import_internal_id;
alter function public.finalize_pdf_product_import(uuid, uuid, text, jsonb, jsonb, jsonb)
  rename to finalize_pdf_product_import_internal_id;
alter function public.resolve_pdf_product_decision(uuid, uuid, uuid, text, text, jsonb)
  rename to resolve_pdf_product_decision_internal_id;
alter function public.get_pdf_product_decisions(uuid, uuid)
  rename to get_pdf_product_decisions_internal_id;

-- Channel-aware create is the only implementation that must create both identities itself.
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
  v_import public.pdf_imports%rowtype;
  v_internal_id uuid := gen_random_uuid();
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
  select * into v_import
  from public.pdf_imports
  where owner_id = p_owner_id and client_import_id = p_import_id;
  if found then
    if v_import.channel = p_channel and v_import.batch_count is not null and
       v_import.manifest_digest = p_manifest_digest and v_import.file_fingerprint = p_file_fingerprint then
      return query select p_import_id, v_import.status, v_import.expires_at, v_import.created_at;
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
    id, client_import_id, owner_id, channel, file_fingerprint, manifest_digest, expires_at,
    batch_count, manifest, source_filename
  ) values (
    v_internal_id, p_import_id, p_owner_id, p_channel, p_file_fingerprint, p_manifest_digest,
    p_expires_at, v_count, p_manifest, p_source_filename
  );
  return query
    select p_import_id, i.status, i.expires_at, i.created_at
    from public.pdf_imports as i where i.id = v_internal_id;
end;
$create$;

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
language sql
security definer
set search_path = ''
as $create$
  select * from public.create_pdf_import(
    p_owner_id, p_import_id, 'evaluation', p_file_fingerprint, p_manifest_digest,
    p_source_filename, p_manifest, p_expires_at
  );
$create$;

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
as $reserve$
declare
  v_internal_id uuid;
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

  insert into public.pdf_imports (
    id, client_import_id, owner_id, file_fingerprint, manifest_digest, expires_at
  ) values (
    gen_random_uuid(), p_import_id, p_owner_id, p_file_fingerprint, p_manifest_digest, p_expires_at
  ) on conflict (owner_id, client_import_id) do nothing;

  v_internal_id := public.pdf_import_internal_id(p_owner_id, p_import_id);
  return query
    select r.claimed, p_import_id, r.batch_index, r.attempt_id, r.reservation_id, r.status
    from public.reserve_pdf_batch_internal_id(
      p_owner_id, v_internal_id, p_batch_index, p_file_fingerprint, p_manifest_digest,
      p_input_digest, p_core_page_start, p_core_page_end, p_maximum_cost_nano_usd,
      p_pricing_snapshot, p_expires_at, p_accounting_time
    ) as r;
end;
$reserve$;

create function public.close_expired_pdf_import(
  p_owner_id uuid,
  p_import_id uuid,
  p_accounting_time timestamptz default clock_timestamp()
)
returns boolean
language sql
security definer
set search_path = ''
as $close$
  select public.close_expired_pdf_import_internal_id(
    p_owner_id, public.pdf_import_internal_id(p_owner_id, p_import_id), p_accounting_time
  );
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
as $state$
  select p_import_id, s.owner_id, s.file_fingerprint, s.manifest_digest, s.status, s.expires_at, s.batches
  from public.get_pdf_import_state_internal_id(
    p_owner_id, public.pdf_import_internal_id(p_owner_id, p_import_id)
  ) as s;
$state$;

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
  select p_import_id, i.channel, i.status, i.file_fingerprint, i.manifest_digest, i.batch_count,
    i.manifest, i.source_filename, i.created_at, i.expires_at, i.batches, i.results, i.outcome
  from public.get_pdf_import_internal_id(
    p_owner_id, public.pdf_import_internal_id(p_owner_id, p_import_id), p_channel
  ) as i;
$get$;

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
  select i.import_id, i.status, i.file_fingerprint, i.manifest_digest, i.batch_count, i.manifest,
    i.source_filename, i.created_at, i.expires_at, i.batches, i.results, i.outcome
  from public.get_pdf_import(p_owner_id, p_import_id, 'evaluation') as i;
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
language sql
security definer
set search_path = ''
as $record$
  select public.record_pdf_batch_result_internal_id(
    p_owner_id, public.pdf_import_internal_id(p_owner_id, p_import_id), p_batch_index,
    p_schema_name, p_contract_version, p_invalid_count, p_candidates
  );
$record$;

create function public.fail_pdf_validation_import(p_owner_id uuid, p_import_id uuid)
returns text
language sql
security definer
set search_path = ''
as $fail$
  select public.fail_pdf_validation_import_internal_id(
    p_owner_id, public.pdf_import_internal_id(p_owner_id, p_import_id)
  );
$fail$;

create function public.cancel_pdf_validation_import(p_owner_id uuid, p_import_id uuid)
returns table (
  status text,
  saved_count integer,
  existing_count integer,
  pending_count integer,
  saved_ids uuid[],
  existing_ids uuid[]
)
language sql
security definer
set search_path = ''
as $cancel$
  select * from public.cancel_pdf_validation_import_internal_id(
    p_owner_id, public.pdf_import_internal_id(p_owner_id, p_import_id)
  );
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
language sql
security definer
set search_path = ''
as $finalize$
  select * from public.finalize_pdf_validation_import_internal_id(
    p_owner_id, public.pdf_import_internal_id(p_owner_id, p_import_id),
    p_manifest_digest, p_submitted, p_recipes
  );
$finalize$;

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
as $recipes$
  select * from public.get_pdf_import_recipes_internal_id(
    p_owner_id, public.pdf_import_internal_id(p_owner_id, p_import_id)
  );
$recipes$;

create function public.finalize_pdf_product_import(
  p_owner_id uuid,
  p_import_id uuid,
  p_manifest_digest text,
  p_submitted jsonb,
  p_recipes jsonb,
  p_decisions jsonb
)
returns table (
  status text,
  saved_count integer,
  existing_count integer,
  pending_count integer,
  kept_count integer,
  discarded_count integer,
  saved_ids uuid[],
  existing_ids uuid[],
  decisions jsonb
)
language sql
security definer
set search_path = ''
as $finalize$
  select * from public.finalize_pdf_product_import_internal_id(
    p_owner_id, public.pdf_import_internal_id(p_owner_id, p_import_id),
    p_manifest_digest, p_submitted, p_recipes, p_decisions
  );
$finalize$;

create function public.resolve_pdf_product_decision(
  p_owner_id uuid,
  p_import_id uuid,
  p_decision_id uuid,
  p_action text,
  p_payload_digest text default null,
  p_recipe jsonb default null
)
returns table (
  status text,
  saved_count integer,
  existing_count integer,
  pending_count integer,
  kept_count integer,
  discarded_count integer,
  saved_ids uuid[],
  existing_ids uuid[],
  decisions jsonb
)
language sql
security definer
set search_path = ''
as $resolve$
  select * from public.resolve_pdf_product_decision_internal_id(
    p_owner_id, public.pdf_import_internal_id(p_owner_id, p_import_id), p_decision_id,
    p_action, p_payload_digest, p_recipe
  );
$resolve$;

create function public.get_pdf_product_decisions(p_owner_id uuid, p_import_id uuid)
returns table (
  decision_id uuid,
  source_start_page integer,
  source_start_item integer,
  state text,
  missing_reason_codes text[],
  recipe_id uuid,
  resolved_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $get$
  select * from public.get_pdf_product_decisions_internal_id(
    p_owner_id, public.pdf_import_internal_id(p_owner_id, p_import_id)
  );
$get$;

-- Renamed implementations are callable only by the owning security-definer wrappers.
revoke all on function public.reserve_pdf_batch_internal_id(uuid, uuid, integer, text, text, text, integer, integer, bigint, jsonb, timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.close_expired_pdf_import_internal_id(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.get_pdf_import_state_internal_id(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_pdf_validation_import_internal_id(uuid, uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.get_pdf_validation_import_internal_id(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_pdf_batch_result_internal_id(uuid, uuid, integer, text, integer, integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.fail_pdf_validation_import_internal_id(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.cancel_pdf_validation_import_internal_id(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.finalize_pdf_validation_import_internal_id(uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.get_pdf_import_recipes_internal_id(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_pdf_import_internal_id(uuid, uuid, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.get_pdf_import_internal_id(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.finalize_pdf_product_import_internal_id(uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.resolve_pdf_product_decision_internal_id(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.get_pdf_product_decisions_internal_id(uuid, uuid) from public, anon, authenticated, service_role;

revoke all on function public.default_pdf_import_client_id() from public, anon, authenticated;
revoke all on function public.protect_pdf_import_client_id() from public, anon, authenticated;
revoke all on function public.pdf_import_internal_id(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_pdf_import(uuid, uuid, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.create_pdf_validation_import(uuid, uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.reserve_pdf_batch(uuid, uuid, integer, text, text, text, integer, integer, bigint, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.close_expired_pdf_import(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.get_pdf_import_state(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_pdf_import(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_pdf_validation_import(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_pdf_batch_result(uuid, uuid, integer, text, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.fail_pdf_validation_import(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_pdf_validation_import(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_pdf_validation_import(uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.get_pdf_import_recipes(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_pdf_product_import(uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.resolve_pdf_product_decision(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.get_pdf_product_decisions(uuid, uuid) from public, anon, authenticated;

grant execute on function public.pdf_import_internal_id(uuid, uuid) to service_role;
grant execute on function public.create_pdf_import(uuid, uuid, text, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.create_pdf_validation_import(uuid, uuid, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.reserve_pdf_batch(uuid, uuid, integer, text, text, text, integer, integer, bigint, jsonb, timestamptz, timestamptz) to service_role;
grant execute on function public.close_expired_pdf_import(uuid, uuid, timestamptz) to service_role;
grant execute on function public.get_pdf_import_state(uuid, uuid) to service_role;
grant execute on function public.get_pdf_import(uuid, uuid, text) to service_role;
grant execute on function public.get_pdf_validation_import(uuid, uuid) to service_role;
grant execute on function public.record_pdf_batch_result(uuid, uuid, integer, text, integer, integer, jsonb) to service_role;
grant execute on function public.fail_pdf_validation_import(uuid, uuid) to service_role;
grant execute on function public.cancel_pdf_validation_import(uuid, uuid) to service_role;
grant execute on function public.finalize_pdf_validation_import(uuid, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.get_pdf_import_recipes(uuid, uuid) to service_role;
grant execute on function public.finalize_pdf_product_import(uuid, uuid, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.resolve_pdf_product_decision(uuid, uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.get_pdf_product_decisions(uuid, uuid) to service_role;
