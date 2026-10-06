-- Phase 5: private recipe persistence and atomic finalization for the restricted F-01 screen.
-- Additive only. Imports keep non-content metadata (core ranges, digests, counts); raw source
-- text and unsaved candidate content never reach the database. Recipes are written only by the
-- backend finalization RPC; browsers can read their own rows through RLS and nothing else.

alter table public.pdf_imports
  drop constraint pdf_imports_status_check,
  add constraint pdf_imports_status_check
    check (status in ('processing', 'ready', 'committed', 'failed', 'cancelled')),
  add column batch_count integer check (batch_count is null or (batch_count between 1 and 32)),
  add column manifest jsonb check (manifest is null or jsonb_typeof(manifest) = 'object'),
  add column source_filename text check (source_filename is null or length(source_filename) between 1 and 255);

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

alter table public.pdf_batch_results enable row level security;
alter table public.pdf_batch_candidates enable row level security;
alter table public.pdf_import_outcomes enable row level security;
alter table public.recipes enable row level security;

revoke all on table public.pdf_batch_results from public, anon, authenticated, service_role;
revoke all on table public.pdf_batch_candidates from public, anon, authenticated, service_role;
revoke all on table public.pdf_import_outcomes from public, anon, authenticated, service_role;
revoke all on table public.recipes from public, anon, authenticated, service_role;

-- Owner-only reads; no insert/update/delete grant for any browser role.
grant select on table public.recipes to authenticated;
create policy recipes_owner_read on public.recipes
  for select to authenticated
  using ((select auth.uid()) = owner_id);

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

revoke all on function public.protect_recipe_identity() from public, anon, authenticated;
revoke all on function public.create_pdf_validation_import(uuid, uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.get_pdf_validation_import(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_pdf_batch_result(uuid, uuid, integer, text, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.fail_pdf_validation_import(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pdf_validation_outcome(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.cancel_pdf_validation_import(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_pdf_validation_import(uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_pdf_validation_import(uuid, uuid, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.get_pdf_validation_import(uuid, uuid) to service_role;
grant execute on function public.record_pdf_batch_result(uuid, uuid, integer, text, integer, integer, jsonb) to service_role;
grant execute on function public.fail_pdf_validation_import(uuid, uuid) to service_role;
grant execute on function public.cancel_pdf_validation_import(uuid, uuid) to service_role;
grant execute on function public.finalize_pdf_validation_import(uuid, uuid, text, jsonb, jsonb) to service_role;
