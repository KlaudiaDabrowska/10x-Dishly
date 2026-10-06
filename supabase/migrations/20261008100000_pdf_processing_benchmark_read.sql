-- Phase 6 benchmark (2026-10-06): read-only, owner- and import-scoped access to the recipes one
-- validation import saved, for the operator's benchmark scoring against the approved goldens.
-- Additive only. The service role still has no table grant on recipes; browsers keep RLS reads only.

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

revoke all on function public.get_pdf_import_recipes(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_pdf_import_recipes(uuid, uuid) to service_role;
