import type { AppClient } from "@/components/AdminClientDetail";

/** Columns the admin Clients list loads from `companies` (with the assigned tier's name). */
export const ADMIN_CLIENTS_SELECT = `
  id, name, email, phone,
  client_data_mode, onboarding_status, sellsy_client_id,
  pricing_tier_id, pricing_tiers(name), free_delivery, last_synced_at, created_at, updated_at,
  contacts(user_id, last_name, first_name, email, phone, is_primary),
  company_addresses(label, address_line1)
`;

/** One `companies` row (ADMIN_CLIENTS_SELECT shape) → the admin client model. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function companyRowToAppClient(company: any): AppClient {
  const contacts: any[] = company.contacts ?? [];
  const primaryContact = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;
  const deliveryAddr = (company.company_addresses ?? []).find((a: any) => a.label === "Delivery") ?? null;
  const contactName = primaryContact
    ? [primaryContact.first_name, primaryContact.last_name].filter(Boolean).join(" ") || null
    : null;
  const resolvedEmail = company.email ?? primaryContact?.email ?? null;
  const resolvedPhone = company.phone ?? primaryContact?.phone ?? null;
  const tierName: string | null = company.pricing_tier_id ? company.pricing_tiers?.name ?? null : null;

  return {
    id: company.id,
    user_id: primaryContact?.user_id ?? null,
    company_name: company.name,
    contact_name: contactName,
    email: resolvedEmail,
    phone: resolvedPhone,
    delivery_address: deliveryAddr?.address_line1 ?? null,
    pricing_tier: tierName,
    pricing_tier_id: company.pricing_tier_id ?? null,
    free_delivery: company.free_delivery === true,
    sellsy_client_id: company.sellsy_client_id ?? null,
    onboarding_status: company.onboarding_status ?? null,
    client_data_mode: company.client_data_mode ?? "custom",
    // New schema has no separate custom_* columns — map to same values
    custom_company_name: company.name,
    custom_contact_name: contactName,
    custom_email: resolvedEmail,
    custom_phone: resolvedPhone,
    custom_delivery_address: deliveryAddr?.address_line1 ?? null,
    custom_pricing_tier: tierName,
    last_synced_at: company.last_synced_at ?? null,
    created_at: company.created_at,
    updated_at: company.updated_at,
  };
}
