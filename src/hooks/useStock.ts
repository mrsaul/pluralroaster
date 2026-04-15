import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { getStockList, updateStock, getStockHistory, initStock } from "@/services/stock";

export function useStockList() {
  return useQuery({
    queryKey: ["stock"],
    queryFn: getStockList,
    refetchOnWindowFocus: true, // override the app-level default (false)
  });
}

export function useUpdateStock() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      stockId,
      newQuantityKg,
      newThresholdKg,
      note,
    }: {
      stockId: string;
      productName: string;
      newQuantityKg: number;
      newThresholdKg: number;
      note?: string;
    }) => updateStock(stockId, newQuantityKg, newThresholdKg, note),

    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["stock-history", variables.stockId] });
      toast({ title: `Stock updated — ${variables.productName}` });
    },

    onError: (err: Error) => {
      toast({
        title: "Failed to update stock",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}

export function useInitStock() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ productId }: { productId: string; productName: string }) =>
      initStock(productId),

    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      toast({ title: `Stock tracking enabled for ${variables.productName}` });
    },

    onError: (err: Error) => {
      toast({
        title: "Failed to enable stock tracking",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}

export function useStockHistory(stockId: string | null) {
  return useQuery({
    queryKey: ["stock-history", stockId],
    queryFn: () => getStockHistory(stockId!),
    enabled: !!stockId,
  });
}
