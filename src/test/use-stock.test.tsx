import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/services/stock", () => ({
  getStockList: vi.fn(),
  getStockHistory: vi.fn(),
  updateStock: vi.fn().mockResolvedValue(undefined),
  initStock: vi.fn().mockResolvedValue({ id: "s1" }),
}));

import { useInitStock, useUpdateStock } from "@/hooks/useStock";

const setup = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { spy, wrapper };
};

describe("useStock mutations", () => {
  it("a manual correction (Modifier) refreshes the À torréfier inputs", async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useUpdateStock(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ stockId: "s1", productName: "Brésil", newQuantityKg: 3, newThresholdKg: 5 }),
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["stock"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["roasting-inputs"] });
  });

  it("Configurer refreshes the À torréfier inputs", async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useInitStock(), { wrapper });
    await act(() => result.current.mutateAsync({ productId: "p1", productName: "Brésil" }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["stock"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["roasting-inputs"] });
  });
});
