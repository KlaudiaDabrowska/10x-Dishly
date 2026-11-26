-- Saved recipe edits cross one narrow service-role boundary. Browser roles retain SELECT-only
-- access, while provenance and import metadata remain outside the writable column list.

create function public.update_owned_recipe(
  p_owner_id uuid,
  p_recipe_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_ingredient_groups jsonb,
  p_instructions jsonb,
  p_current_missing_reason_codes text[]
)
returns table (recipe_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $update$
declare
  v_recipe public.recipes%rowtype;
begin
  select r.* into v_recipe
  from public.recipes as r
  where r.id = p_recipe_id and r.owner_id = p_owner_id
  for update;

  if not found then
    raise exception 'recipe not found';
  end if;
  if v_recipe.updated_at is distinct from p_expected_updated_at then
    raise exception 'recipe conflict';
  end if;

  return query
    update public.recipes as r
    set title = p_title,
        ingredient_groups = p_ingredient_groups,
        instructions = p_instructions,
        current_missing_reason_codes = p_current_missing_reason_codes
    where r.id = v_recipe.id
    returning r.id, r.updated_at;
end;
$update$;

revoke all on function public.update_owned_recipe(uuid, uuid, timestamptz, text, jsonb, jsonb, text[])
  from public, anon, authenticated;
grant execute on function public.update_owned_recipe(uuid, uuid, timestamptz, text, jsonb, jsonb, text[])
  to service_role;
