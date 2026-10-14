-- Product-only resolution of canonical incomplete recipes. Pending candidate content remains
-- browser-local: the database stores only source identity, omission codes and a bound digest.

create function public.pdf_omission_codes_valid(p_codes text[], p_allow_source_metadata boolean default false)
returns boolean
language sql
immutable
set search_path = ''
as $valid$
  select p_codes is not null
    and not ('missing-source-metadata' = any(p_codes) and not p_allow_source_metadata)
    and cardinality(p_codes) = (
      select count(distinct item.code) from unnest(p_codes) as item(code)
    )
    and p_codes = array(
      select allowed.code from unnest(array[
        'missing-title', 'missing-ingredients', 'missing-instructions', 'missing-category',
        'missing-source-metadata', 'missing-ingredient-content', 'missing-variant-content',
        'missing-continuation', 'absent-servings', 'absent-footnotes'
      ]) as allowed(code)
      where allowed.code = any(p_codes)
    );
$valid$;

create function public.pdf_has_required_omission(p_codes text[])
returns boolean
language sql
immutable
set search_path = ''
as $required$
  select p_codes && array[
    'missing-title', 'missing-ingredients', 'missing-instructions', 'missing-category',
    'missing-source-metadata', 'missing-ingredient-content', 'missing-variant-content',
    'missing-continuation'
  ]::text[];
$required$;

create function public.pdf_instructions_match_omissions(p_instructions jsonb, p_codes text[])
returns boolean
language sql
immutable
set search_path = ''
as $instructions$
  select jsonb_typeof(p_instructions) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(p_instructions) as instruction(value)
      where jsonb_typeof(instruction.value) is distinct from 'string' or btrim(instruction.value #>> '{}') = ''
    )
    and (jsonb_array_length(p_instructions) = 0) = ('missing-instructions' = any(p_codes));
$instructions$;

create function public.pdf_ingredient_groups_match_omissions(p_groups jsonb, p_codes text[])
returns boolean
language sql
immutable
set search_path = ''
as $ingredients$
  select jsonb_typeof(p_groups) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(p_groups) as ingredient_group(value)
      where jsonb_typeof(ingredient_group.value) is distinct from 'object'
        or jsonb_typeof(ingredient_group.value -> 'ingredients') is distinct from 'array'
    )
    and (
      jsonb_array_length(p_groups) = 0 or exists (
        select 1 from jsonb_array_elements(p_groups) as ingredient_group(value)
        where jsonb_array_length(ingredient_group.value -> 'ingredients') = 0
      )
    ) = ('missing-ingredients' = any(p_codes));
$ingredients$;

alter table public.recipes
  drop constraint recipes_title_check,
  drop constraint recipes_category_check,
  drop constraint recipes_ingredient_groups_check,
  drop constraint recipes_instructions_check,
  alter column title drop not null,
  alter column category drop not null,
  add column incomplete_at_import boolean not null default false,
  add column import_missing_reason_codes text[] not null default '{}',
  add column current_missing_reason_codes text[] not null default '{}',
  add column kept_from_decision_id uuid,
  add constraint recipes_title_omission_check check (
    (title is null) = ('missing-title' = any(current_missing_reason_codes))
    and (title is null or (length(title) <= 2000 and length(btrim(title)) >= 1))
    and (
      title is not null
      or (
        incomplete_at_import
        and kept_from_decision_id is not null
        and 'missing-title' = any(import_missing_reason_codes)
      )
    )
  ),
  add constraint recipes_category_omission_check check (
    (category is null) = ('missing-category' = any(current_missing_reason_codes))
    and (category is null or category in ('breakfast', 'lunch', 'dinner', 'dessert'))
    and (
      category is not null
      or (
        incomplete_at_import
        and kept_from_decision_id is not null
        and 'missing-category' = any(import_missing_reason_codes)
      )
    )
  ),
  add constraint recipes_ingredient_groups_omission_check check (
    public.pdf_ingredient_groups_match_omissions(ingredient_groups, current_missing_reason_codes)
    and (
      not ('missing-ingredients' = any(current_missing_reason_codes))
      or (
        incomplete_at_import
        and kept_from_decision_id is not null
        and 'missing-ingredients' = any(import_missing_reason_codes)
      )
    )
  ),
  add constraint recipes_instructions_omission_check check (
    public.pdf_instructions_match_omissions(instructions, current_missing_reason_codes)
    and (
      not ('missing-instructions' = any(current_missing_reason_codes))
      or (
        incomplete_at_import
        and kept_from_decision_id is not null
        and 'missing-instructions' = any(import_missing_reason_codes)
      )
    )
  ),
  add constraint recipes_omission_codes_check check (
    public.pdf_omission_codes_valid(import_missing_reason_codes)
    and public.pdf_omission_codes_valid(current_missing_reason_codes)
    and incomplete_at_import = public.pdf_has_required_omission(import_missing_reason_codes)
    and (
      (incomplete_at_import and kept_from_decision_id is not null)
      or (not incomplete_at_import and import_missing_reason_codes = '{}' and kept_from_decision_id is null)
    )
    and (not ('absent-servings' = any(current_missing_reason_codes)) or servings is null)
    and (not ('absent-footnotes' = any(current_missing_reason_codes)) or footnotes = '[]'::jsonb)
  );

alter table public.pdf_import_outcomes
  add column kept_count integer not null default 0 check (kept_count >= 0),
  add column discarded_count integer not null default 0 check (discarded_count >= 0);

create table public.pdf_incomplete_recipe_decisions (
  id uuid primary key,
  owner_id uuid not null,
  import_id uuid not null,
  source_start_page integer not null check (source_start_page between 1 and 115),
  source_start_item integer not null check (source_start_item >= 0),
  payload_digest text not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  missing_reason_codes text[] not null,
  state text not null default 'pending',
  recipe_id uuid references public.recipes(id),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  foreign key (owner_id, import_id) references public.pdf_imports(owner_id, id) on delete cascade,
  constraint pdf_incomplete_recipe_decisions_source_key
    unique (import_id, source_start_page, source_start_item),
  constraint pdf_incomplete_recipe_decisions_omissions_check check (
    public.pdf_omission_codes_valid(missing_reason_codes)
    and public.pdf_has_required_omission(missing_reason_codes)
  ),
  constraint pdf_incomplete_recipe_decisions_state_value_check check (
    state in ('pending', 'kept', 'discarded')
  ),
  constraint pdf_incomplete_recipe_decisions_state_check check (
    (state = 'pending' and recipe_id is null and resolved_at is null)
    or (state = 'kept' and recipe_id is not null and resolved_at is not null)
    or (state = 'discarded' and recipe_id is null and resolved_at is not null)
  )
);

alter table public.recipes
  add constraint recipes_kept_from_decision_fk
  foreign key (kept_from_decision_id) references public.pdf_incomplete_recipe_decisions(id)
  deferrable initially deferred;

create index pdf_incomplete_recipe_decisions_owner_import_idx
  on public.pdf_incomplete_recipe_decisions (owner_id, import_id, source_start_page, source_start_item);

alter table public.pdf_incomplete_recipe_decisions enable row level security;
revoke all on table public.pdf_incomplete_recipe_decisions from public, anon, authenticated, service_role;

create function public.protect_pdf_incomplete_decision()
returns trigger
language plpgsql
set search_path = ''
as $protect$
begin
  if not exists (
    select 1 from public.pdf_imports
    where id = new.import_id and owner_id = new.owner_id and channel = 'product'
  ) then
    raise exception 'decision import must be product';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id or
       new.import_id is distinct from old.import_id or new.source_start_page is distinct from old.source_start_page or
       new.source_start_item is distinct from old.source_start_item or
       new.payload_digest is distinct from old.payload_digest or
       new.missing_reason_codes is distinct from old.missing_reason_codes or
       new.created_at is distinct from old.created_at then
      raise exception 'decision identity is immutable';
    end if;
    if old.state <> 'pending' and new is distinct from old then
      raise exception 'decision is already resolved';
    end if;
  end if;
  return new;
end;
$protect$;

create trigger pdf_incomplete_recipe_decisions_protect
  before insert or update on public.pdf_incomplete_recipe_decisions
  for each row execute function public.protect_pdf_incomplete_decision();

create function public.protect_recipe_import_provenance()
returns trigger
language plpgsql
set search_path = ''
as $protect$
begin
  if tg_op = 'INSERT' then
    if new.incomplete_at_import and new.current_missing_reason_codes is distinct from new.import_missing_reason_codes then
      raise exception 'initial recipe omissions mismatch';
    end if;
    return new;
  end if;
  if new.incomplete_at_import is distinct from old.incomplete_at_import or
     new.import_missing_reason_codes is distinct from old.import_missing_reason_codes or
     new.kept_from_decision_id is distinct from old.kept_from_decision_id then
    raise exception 'recipe import provenance is immutable';
  end if;
  return new;
end;
$protect$;

create trigger recipes_protect_import_provenance
  before insert or update on public.recipes
  for each row execute function public.protect_recipe_import_provenance();

-- Only the decision that first created an incomplete recipe is its origin. A later keep may point
-- at that row after source deduplication without sharing the row's original import id.
create function public.check_incomplete_recipe_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $origin$
declare
  v_recipe public.recipes%rowtype;
  v_decision public.pdf_incomplete_recipe_decisions%rowtype;
  v_import public.pdf_imports%rowtype;
begin
  if tg_table_name = 'recipes' then
    v_recipe := new;
    if not v_recipe.incomplete_at_import then
      return null;
    end if;
    select * into v_decision from public.pdf_incomplete_recipe_decisions where id = v_recipe.kept_from_decision_id;
  else
    v_decision := new;
    if v_decision.state <> 'kept' then
      return null;
    end if;
    select * into v_recipe from public.recipes where id = v_decision.recipe_id;
  end if;
  select * into v_import from public.pdf_imports
  where id = v_decision.import_id and owner_id = v_decision.owner_id;
  if not found or v_decision.state <> 'kept' or v_decision.recipe_id is distinct from v_recipe.id or
     v_decision.owner_id is distinct from v_recipe.owner_id or
     v_import.file_fingerprint is distinct from v_recipe.file_fingerprint or
     v_decision.source_start_page is distinct from v_recipe.source_start_page or
     v_decision.source_start_item is distinct from v_recipe.source_start_item then
    raise exception 'invalid incomplete recipe origin';
  end if;
  if v_recipe.kept_from_decision_id = v_decision.id and
     v_decision.import_id is distinct from v_recipe.import_id then
    raise exception 'invalid incomplete recipe origin';
  end if;
  return null;
end;
$origin$;

create constraint trigger recipes_check_incomplete_origin
  after insert or update on public.recipes
  deferrable initially deferred
  for each row execute function public.check_incomplete_recipe_origin();

create constraint trigger decisions_check_incomplete_origin
  after insert or update on public.pdf_incomplete_recipe_decisions
  deferrable initially deferred
  for each row execute function public.check_incomplete_recipe_origin();

create function public.pdf_product_decision_references(p_import_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $references$
  select coalesce(jsonb_agg(jsonb_build_object(
    'decisionId', d.id,
    'sourceStart', jsonb_build_object('page', d.source_start_page, 'itemIndex', d.source_start_item),
    'state', d.state,
    'missingReasonCodes', to_jsonb(d.missing_reason_codes),
    'recipeId', d.recipe_id,
    'resolvedAt', d.resolved_at
  ) order by d.source_start_page, d.source_start_item), '[]'::jsonb)
  from public.pdf_incomplete_recipe_decisions as d
  where d.import_id = p_import_id;
$references$;

-- Keep the shared status signature stable. Only product outcome JSON gains decision fields, so the
-- evaluation-only get_pdf_validation_import wrapper continues to expose its established shape.
create or replace function public.get_pdf_import(p_owner_id uuid, p_import_id uuid, p_channel text)
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
      select case when i.channel = 'product' then jsonb_build_object(
        'saved', o.saved_count,
        'alreadySaved', o.existing_count,
        'pending', o.pending_count,
        'kept', o.kept_count,
        'discarded', o.discarded_count,
        'savedIds', to_jsonb(o.saved_ids),
        'existingIds', to_jsonb(o.existing_ids),
        'decisions', public.pdf_product_decision_references(i.id),
        'committedAt', o.committed_at
      ) else jsonb_build_object(
        'saved', o.saved_count,
        'alreadySaved', o.existing_count,
        'pending', o.pending_count,
        'savedIds', to_jsonb(o.saved_ids),
        'existingIds', to_jsonb(o.existing_ids),
        'committedAt', o.committed_at
      ) end
      from public.pdf_import_outcomes as o where o.import_id = i.id
    )
  from public.pdf_imports as i
  where i.id = p_import_id and i.owner_id = p_owner_id and i.channel = p_channel and i.batch_count is not null;
$get$;

create function public.pdf_product_outcome(p_import_id uuid, p_status text)
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
stable
set search_path = ''
as $outcome$
  select p_status, coalesce(o.saved_count, 0), coalesce(o.existing_count, 0), coalesce(o.pending_count, 0),
    coalesce(o.kept_count, 0), coalesce(o.discarded_count, 0), coalesce(o.saved_ids, '{}'::uuid[]),
    coalesce(o.existing_ids, '{}'::uuid[]), public.pdf_product_decision_references(p_import_id)
  from (select 1) as anchor
  left join public.pdf_import_outcomes as o on o.import_id = p_import_id;
$outcome$;

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
language plpgsql
security definer
set search_path = ''
as $finalize$
declare
  v_import public.pdf_imports%rowtype;
  v_recipe jsonb;
  v_decision jsonb;
  v_codes text[];
  v_id uuid;
  v_saved uuid[] := '{}';
  v_existing uuid[] := '{}';
begin
  select * into v_import from public.pdf_imports where id = p_import_id for update;
  if not found or v_import.owner_id <> p_owner_id or v_import.batch_count is null or v_import.channel <> 'product' then
    raise exception 'import not found';
  end if;
  if v_import.status <> 'processing' then
    return query select * from public.pdf_product_outcome(p_import_id, v_import.status);
    return;
  end if;
  if v_import.expires_at <= clock_timestamp() then
    update public.pdf_imports set status = 'failed', updated_at = clock_timestamp() where id = p_import_id;
    return query select * from public.pdf_product_outcome(p_import_id, 'failed');
    return;
  end if;
  if p_manifest_digest is distinct from v_import.manifest_digest then
    raise exception 'manifest mismatch';
  end if;
  if jsonb_typeof(p_submitted) is distinct from 'array' or jsonb_typeof(p_recipes) is distinct from 'array' or
     jsonb_typeof(p_decisions) is distinct from 'array' then
    raise exception 'invalid product finalization';
  end if;
  if (select count(*) from public.pdf_batch_results where import_id = p_import_id) <> v_import.batch_count then
    raise exception 'batch results missing';
  end if;
  if jsonb_array_length(p_submitted) <> (
       select count(*) from public.pdf_batch_candidates where import_id = p_import_id
     ) or exists (
       select 1 from jsonb_array_elements(p_submitted) as submitted(value)
       where not exists (
         select 1 from public.pdf_batch_candidates as candidate
         where candidate.import_id = p_import_id
           and candidate.batch_index = (submitted.value ->> 'batchIndex')::integer
           and candidate.candidate_index = (submitted.value ->> 'candidateIndex')::integer
           and candidate.payload_digest = submitted.value ->> 'digest'
       )
     ) or (
       select count(distinct ((submitted.value ->> 'batchIndex'), (submitted.value ->> 'candidateIndex')))
       from jsonb_array_elements(p_submitted) as submitted(value)
     ) <> jsonb_array_length(p_submitted) then
    raise exception 'payload digest mismatch';
  end if;
  if exists (
       select 1 from jsonb_array_elements(p_recipes) as recipe(value)
       where not exists (
         select 1 from public.pdf_batch_candidates as candidate
         where candidate.import_id = p_import_id
           and candidate.batch_index = (recipe.value ->> 'batchIndex')::integer
           and candidate.candidate_index = (recipe.value ->> 'candidateIndex')::integer
           and candidate.payload_digest = recipe.value ->> 'digest'
           and candidate.status = 'complete'
           and candidate.source_start_page = (recipe.value ->> 'sourceStartPage')::integer
           and candidate.source_start_item = (recipe.value ->> 'sourceStartItem')::integer
       )
     ) or (
       select count(distinct ((recipe.value ->> 'sourceStartPage'), (recipe.value ->> 'sourceStartItem')))
       from jsonb_array_elements(p_recipes) as recipe(value)
     ) <> jsonb_array_length(p_recipes) then
    raise exception 'recipe is not a recorded complete candidate';
  end if;
  if (
       select count(distinct ((decision.value ->> 'sourceStartPage'), (decision.value ->> 'sourceStartItem')))
       from jsonb_array_elements(p_decisions) as decision(value)
     ) <> jsonb_array_length(p_decisions) or exists (
       select 1 from jsonb_array_elements(p_decisions) as decision(value)
       where coalesce(decision.value ->> 'decisionId', '') !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or coalesce(decision.value ->> 'digest', '') !~ '^[0-9a-f]{64}$'
         or jsonb_typeof(decision.value -> 'missingReasonCodes') is distinct from 'array'
         or not exists (
           select 1 from public.pdf_batch_candidates as candidate
           where candidate.import_id = p_import_id and candidate.status = 'incomplete'
             and candidate.source_start_page = (decision.value ->> 'sourceStartPage')::integer
             and candidate.source_start_item = (decision.value ->> 'sourceStartItem')::integer
         )
         or exists (
           select 1 from jsonb_array_elements(p_recipes) as recipe(value)
           where (recipe.value ->> 'sourceStartPage')::integer = (decision.value ->> 'sourceStartPage')::integer
             and (recipe.value ->> 'sourceStartItem')::integer = (decision.value ->> 'sourceStartItem')::integer
         )
     ) then
    raise exception 'invalid product decision';
  end if;

  for v_recipe in select value from jsonb_array_elements(p_recipes) loop
    v_id := null;
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
    ) on conflict on constraint recipes_source_identity_key do nothing returning id into v_id;
    if v_id is not null then
      v_saved := v_saved || v_id;
    else
      select recipe.id into v_id from public.recipes as recipe
      where recipe.owner_id = p_owner_id and recipe.file_fingerprint = v_import.file_fingerprint
        and recipe.source_start_page = (v_recipe ->> 'sourceStartPage')::integer
        and recipe.source_start_item = (v_recipe ->> 'sourceStartItem')::integer;
      v_existing := v_existing || v_id;
    end if;
  end loop;

  for v_decision in select value from jsonb_array_elements(p_decisions) loop
    select array_agg(code order by position) into v_codes
    from jsonb_array_elements_text(v_decision -> 'missingReasonCodes') with ordinality as omission(code, position);
    insert into public.pdf_incomplete_recipe_decisions (
      id, owner_id, import_id, source_start_page, source_start_item, payload_digest, missing_reason_codes
    ) values (
      (v_decision ->> 'decisionId')::uuid, p_owner_id, p_import_id,
      (v_decision ->> 'sourceStartPage')::integer, (v_decision ->> 'sourceStartItem')::integer,
      v_decision ->> 'digest', coalesce(v_codes, '{}')
    );
  end loop;

  insert into public.pdf_import_outcomes (
    import_id, owner_id, saved_count, existing_count, pending_count, kept_count, discarded_count,
    saved_ids, existing_ids
  ) values (
    p_import_id, p_owner_id, cardinality(v_saved), cardinality(v_existing), jsonb_array_length(p_decisions), 0, 0,
    v_saved, v_existing
  );
  update public.pdf_imports set status = 'committed', updated_at = clock_timestamp() where id = p_import_id;
  return query select * from public.pdf_product_outcome(p_import_id, 'committed');
end;
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
language plpgsql
security definer
set search_path = ''
as $resolve$
declare
  v_import public.pdf_imports%rowtype;
  v_decision public.pdf_incomplete_recipe_decisions%rowtype;
  v_recipe_id uuid;
  v_inserted boolean := false;
  v_codes text[];
begin
  if p_action is null or p_action not in ('keep', 'discard') then
    raise exception 'invalid decision action';
  end if;
  if p_action = 'discard' and (p_recipe is not null or p_payload_digest is not null) then
    raise exception 'invalid decision action';
  end if;
  select * into v_import from public.pdf_imports where id = p_import_id for update;
  if not found or v_import.owner_id <> p_owner_id or v_import.channel <> 'product' or v_import.status <> 'committed' then
    raise exception 'import not found';
  end if;
  select * into v_decision from public.pdf_incomplete_recipe_decisions
  where id = p_decision_id and owner_id = p_owner_id and import_id = p_import_id for update;
  if not found then
    raise exception 'decision not found';
  end if;
  if v_decision.state <> 'pending' then
    if v_decision.state = (case p_action when 'keep' then 'kept' else 'discarded' end) then
      if p_action = 'keep' and p_payload_digest is distinct from v_decision.payload_digest then
        raise exception 'decision payload mismatch';
      end if;
      return query select * from public.pdf_product_outcome(p_import_id, 'committed');
      return;
    end if;
    raise exception 'decision conflict';
  end if;

  if p_action = 'discard' then
    update public.pdf_incomplete_recipe_decisions
    set state = 'discarded', resolved_at = clock_timestamp()
    where id = p_decision_id;
    update public.pdf_import_outcomes as outcome
    set pending_count = outcome.pending_count - 1, discarded_count = outcome.discarded_count + 1
    where outcome.import_id = p_import_id and outcome.pending_count > 0;
  else
    if p_payload_digest is distinct from v_decision.payload_digest or jsonb_typeof(p_recipe) is distinct from 'object' or
       (p_recipe -> 'sourceStart' ->> 'page')::integer is distinct from v_decision.source_start_page or
       (p_recipe -> 'sourceStart' ->> 'itemIndex')::integer is distinct from v_decision.source_start_item or
       jsonb_typeof(p_recipe -> 'missingFieldReasons') is distinct from 'array' then
      raise exception 'decision payload mismatch';
    end if;
    select array_agg(reason.value ->> 'code' order by reason.position) into v_codes
    from jsonb_array_elements(p_recipe -> 'missingFieldReasons') with ordinality as reason(value, position);
    if coalesce(v_codes, '{}') is distinct from v_decision.missing_reason_codes then
      raise exception 'decision payload mismatch';
    end if;

    insert into public.recipes (
      owner_id, file_fingerprint, source_start_page, source_start_item, import_id, source_filename,
      source_pages, title, category, source_category, ingredient_groups, instructions, servings, footnotes,
      incomplete_at_import, import_missing_reason_codes, current_missing_reason_codes, kept_from_decision_id
    ) values (
      p_owner_id, v_import.file_fingerprint, v_decision.source_start_page, v_decision.source_start_item,
      p_import_id, v_import.source_filename,
      array(select jsonb_array_elements_text(p_recipe -> 'pages')::integer),
      p_recipe ->> 'title', p_recipe ->> 'category', p_recipe ->> 'sourceCategory',
      p_recipe -> 'ingredientGroups', p_recipe -> 'instructions', p_recipe ->> 'servings',
      coalesce(p_recipe -> 'footnotes', '[]'::jsonb), true, v_codes, v_codes, p_decision_id
    ) on conflict on constraint recipes_source_identity_key do nothing
    returning id into v_recipe_id;
    v_inserted := v_recipe_id is not null;
    if not v_inserted then
      select recipe.id into v_recipe_id from public.recipes as recipe
      where recipe.owner_id = p_owner_id and recipe.file_fingerprint = v_import.file_fingerprint
        and recipe.source_start_page = v_decision.source_start_page
        and recipe.source_start_item = v_decision.source_start_item;
    end if;
    update public.pdf_incomplete_recipe_decisions
    set state = 'kept', recipe_id = v_recipe_id, resolved_at = clock_timestamp()
    where id = p_decision_id;
    if v_inserted then
      update public.pdf_import_outcomes as outcome
      set pending_count = outcome.pending_count - 1, kept_count = outcome.kept_count + 1,
        saved_count = outcome.saved_count + 1, saved_ids = outcome.saved_ids || v_recipe_id
      where outcome.import_id = p_import_id and outcome.pending_count > 0;
    else
      update public.pdf_import_outcomes as outcome
      set pending_count = outcome.pending_count - 1, kept_count = outcome.kept_count + 1,
        existing_count = outcome.existing_count + 1, existing_ids = outcome.existing_ids || v_recipe_id
      where outcome.import_id = p_import_id and outcome.pending_count > 0;
    end if;
  end if;
  return query select * from public.pdf_product_outcome(p_import_id, 'committed');
end;
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
  select d.id, d.source_start_page, d.source_start_item, d.state, d.missing_reason_codes,
    d.recipe_id, d.resolved_at
  from public.pdf_incomplete_recipe_decisions as d
  join public.pdf_imports as i on i.id = d.import_id and i.owner_id = d.owner_id
  where d.owner_id = p_owner_id and d.import_id = p_import_id and i.channel = 'product'
  order by d.source_start_page, d.source_start_item;
$get$;

revoke all on function public.pdf_omission_codes_valid(text[], boolean) from public, anon, authenticated, service_role;
revoke all on function public.pdf_has_required_omission(text[]) from public, anon, authenticated, service_role;
revoke all on function public.pdf_instructions_match_omissions(jsonb, text[]) from public, anon, authenticated, service_role;
revoke all on function public.pdf_ingredient_groups_match_omissions(jsonb, text[]) from public, anon, authenticated, service_role;
revoke all on function public.protect_pdf_incomplete_decision() from public, anon, authenticated;
revoke all on function public.protect_recipe_import_provenance() from public, anon, authenticated;
revoke all on function public.check_incomplete_recipe_origin() from public, anon, authenticated;
revoke all on function public.pdf_product_decision_references(uuid) from public, anon, authenticated, service_role;
revoke all on function public.pdf_product_outcome(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.finalize_pdf_product_import(uuid, uuid, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.resolve_pdf_product_decision(uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.get_pdf_product_decisions(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_pdf_product_import(uuid, uuid, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.resolve_pdf_product_decision(uuid, uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.get_pdf_product_decisions(uuid, uuid) to service_role;
