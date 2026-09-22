-- Allows an authenticated contact to update only the display name on their own company.

create or replace function public.update_company_name(
  p_company_id uuid,
  p_name       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from contacts
    where contacts.company_id = p_company_id
      and contacts.user_id    = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  update companies
  set name = p_name
  where id = p_company_id;
end;
$$;

grant execute on function public.update_company_name(uuid, text) to authenticated;
