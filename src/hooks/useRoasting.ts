import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import {
  getRoastingInputs,
  getOpenRoastingLines,
  addRoastedStock,
  setGreenPercent,
  setDefaultGreenPercent,
} from "@/services/roasting";

export function useRoastingInputs() {
  return useQuery({
    queryKey: ["roasting-inputs"],
    queryFn: getRoastingInputs,
    refetchOnWindowFocus: true,
  });
}

export function useOpenRoastingLines() {
  return useQuery({
    queryKey: ["roasting-lines"],
    queryFn: getOpenRoastingLines,
    refetchOnWindowFocus: true,
  });
}

export function useAddRoastedStock() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ productId, kg }: { productId: string; productName: string; kg: number }) =>
      addRoastedStock(productId, kg),

    onSuccess: (_, variables) => {
      for (const key of ["stock", "roasting-inputs", "roasting-lines", "stock-history"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast({ title: `Stock ajouté — ${variables.productName} +${variables.kg.toFixed(2)} kg` });
    },

    onError: (err: Error) => {
      toast({
        title: "Échec de l'ajout au stock",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}

export function useSetGreenPercent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ productId, percent }: { productId: string; percent: number | null }) =>
      setGreenPercent(productId, percent),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roasting-inputs"] });
    },

    onError: (err: Error) => {
      toast({
        title: "Échec de l'enregistrement du pourcentage",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}

export function useSetDefaultGreenPercent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ percent }: { percent: number }) => setDefaultGreenPercent(percent),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roasting-inputs"] });
    },

    onError: (err: Error) => {
      toast({
        title: "Échec de l'enregistrement du pourcentage par défaut",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}
