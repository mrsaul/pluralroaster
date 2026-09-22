-- Allows an authenticated contact to update only phone and email on their own company.
-- SECURITY DEFINER bypasses companies RLS; auth check inside guards against misuse.

create or replace function public.update_company_contact(
  p_company_id uuid,
  p_phone      text,
  p_email      text
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
  set phone = p_phone,
      email = p_email
  where id = p_company_id;
end;
$$;

grant execute on function public.update_company_contact(uuid, text, text) to authenticated;
