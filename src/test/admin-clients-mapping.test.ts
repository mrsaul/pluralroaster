import { describe, it, expect } from "vitest";
import { companyRowToAppClient, ADMIN_CLIENTS_SELECT } from "@/lib/adminClients";

const row = {
  id: "c1",
  name: "AMULETTE",
  email: "amulette.cafe@example.com",
  phone: null,
  client_data_mode: "sellsy",
  onboarding_status: "completed",
  sellsy_client_id: "135",
  pricing_tier_id: "t100",
  pricing_tiers: { name: "100 kilos" },
  free_delivery: false,
  last_synced_at: null,
  created_at: "2026-05-15T10:00:00Z",
  updated_at: "2026-05-15T10:00:00Z",
  contacts: [{ user_id: "u1", first_name: "Camille", last_name: "Dupont", email: null, phone: null, is_primary: true }],
  company_addresses: [{ label: "Delivery", address_line1: "8 rue Sainte Marthe, 75010 Paris" }],
};

describe("admin client list rows", () => {
  it("shows the name of the tier assigned to the client", () => {
    const client = companyRowToAppClient(row);
    expect(client.pricing_tier).toBe("100 kilos");
    expect(client.custom_pricing_tier).toBe("100 kilos");
    expect(client.pricing_tier_id).toBe("t100");
  });

  it("shows no tier when none is assigned", () => {
    const client = companyRowToAppClient({ ...row, pricing_tier_id: null, pricing_tiers: null });
    expect(client.pricing_tier).toBeNull();
  });

  it("asks the database for the tier name", () => {
    expect(ADMIN_CLIENTS_SELECT).toMatch(/pricing_tiers\s*\(\s*name\s*\)/);
  });

  it("keeps contact, email and delivery address as before", () => {
    const client = companyRowToAppClient(row);
    expect(client.contact_name).toBe("Camille Dupont");
    expect(client.email).toBe("amulette.cafe@example.com");
    expect(client.delivery_address).toBe("8 rue Sainte Marthe, 75010 Paris");
    expect(client.user_id).toBe("u1");
  });
});
