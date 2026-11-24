begin;

create function public.recipe_search_tokens(p_value text)
returns jsonb
language sql
immutable
strict
set search_path = ''
as $tokens$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(
        case
          when token.value ~ '^pomidor(a|owi|em|ze|y|ów|om|ami|ach|owy|owa|owe|owego|owej|owemu|owym|ową|owych|owymi)?$'
            then 'pomidor'
          else token.value
        end
      ) order by token.position
    ),
    '[]'::jsonb
  )
  from (
    select match[1] as value, position
    from pg_catalog.regexp_matches(
      pg_catalog.lower(pg_catalog.normalize(p_value)),
      '[0-9a-ząćęłńóśźż]+',
      'g'
    ) with ordinality as matches(match, position)
  ) as token;
$tokens$;

create function public.recipe_ingredient_search_groups(p_groups jsonb)
returns jsonb
language sql
immutable
strict
set search_path = ''
as $groups$
  select coalesce(
    pg_catalog.jsonb_agg(
      public.recipe_search_tokens(ingredient.value ->> 'name')
      order by ingredient_group.position, ingredient.position
    ),
    '[]'::jsonb
  )
  from pg_catalog.jsonb_array_elements(p_groups)
    with ordinality as ingredient_group(value, position)
  cross join lateral pg_catalog.jsonb_array_elements(
    case
      when pg_catalog.jsonb_typeof(ingredient_group.value -> 'ingredients') = 'array'
        then ingredient_group.value -> 'ingredients'
      else '[]'::jsonb
    end
  ) with ordinality as ingredient(value, position)
  where pg_catalog.jsonb_typeof(ingredient.value -> 'name') = 'string';
$groups$;

alter table public.recipes
  add column ingredient_search_groups jsonb
  generated always as (public.recipe_ingredient_search_groups(ingredient_groups)) stored;

create index recipes_ingredient_search_groups_idx
  on public.recipes using gin (ingredient_search_groups jsonb_path_ops);

create function public.search_recipes(
  p_category text default null,
  p_ingredient text default null
)
returns table (
  id uuid,
  title text,
  current_missing_reason_codes text[],
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $search$
  with query_tokens as (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(
          case
            when token.value ~ '^pomidor(a|owi|em|ze|y|ów|om|ami|ach|owy|owa|owe|owego|owej|owemu|owym|ową|owych|owymi)?$'
              then 'pomidor'
            else token.value
          end
        ) order by token.position
      ),
      '[]'::jsonb
    ) as value
    from (
      select match[1] as value, position
      from pg_catalog.regexp_matches(
        pg_catalog.lower(pg_catalog.normalize(p_ingredient)),
        '[0-9a-ząćęłńóśźż]+',
        'g'
      ) with ordinality as matches(match, position)
    ) as token
  )
  select
    recipe.id,
    recipe.title,
    recipe.current_missing_reason_codes,
    recipe.created_at
  from public.recipes as recipe
  cross join query_tokens
  where recipe.owner_id = (select auth.uid())
    and (p_category is null or recipe.category = p_category)
    and (
      p_ingredient is null
      or pg_catalog.btrim(p_ingredient) = ''
      or recipe.ingredient_search_groups @> pg_catalog.jsonb_build_array(query_tokens.value)
    )
  order by recipe.created_at desc, recipe.id asc;
$search$;

revoke all on function public.recipe_search_tokens(text) from public, anon, authenticated, service_role;
revoke all on function public.recipe_ingredient_search_groups(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.search_recipes(text, text) from public, anon, service_role;
grant execute on function public.search_recipes(text, text) to authenticated;

commit;
