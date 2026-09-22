-- Allows an authenticated contact to update all editable fields on their own company.

create or replace function public.update_company_info(
  p_company_id  uuid,
  p_name        text,
  p_legal_name  text,
  p_siret       text,
  p_vat_number  text
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
  set name               = p_name,
      legal_company_name = p_legal_name,
      siret              = p_siret,
      vat_number         = p_vat_number
  where id = p_company_id;
end;
$$;

grant execute on function public.update_company_info(uuid, text, text, text, text) to authenticated;
