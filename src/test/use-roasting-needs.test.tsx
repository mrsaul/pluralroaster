import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/services/roasting", () => ({
  getRoastingInputs: vi.fn().mockResolvedValue({
    stockKg: { br: 10 },
    productPercent: {},
    defaultPercent: 15,
    productNames: { br: "Brésil (catalogue)" },
  }),
  getOpenRoastingLines: vi.fn().mockResolvedValue([
    { orderId: "a", productId: "br", productName: "Brésil (ligne)", quantityKg: 25, kind: "coffee", deliveryDate: "2026-12-01" },
  ]),
  addRoastedStock: vi.fn(),
  setGreenPercent: vi.fn(),
  setDefaultGreenPercent: vi.fn(),
}));

import { useRoastingNeeds } from "@/hooks/useRoasting";

describe("useRoastingNeeds", () => {
  it("nets stock and prefers catalogue names", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRoastingNeeds(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.needs).not.toBeNull());
    expect(result.current.needs).toHaveLength(1);
    expect(result.current.needs![0]).toMatchObject({ productName: "Brésil (catalogue)", toRoastKg: 15 });
    expect(result.current.inputs?.defaultPercent).toBe(15);
    expect(result.current.error).toBeNull();
  });
});
