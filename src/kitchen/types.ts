export type KitchenProduct = {
  id: string;
  name: string;
  unitLabel: string;
  piecesPerUnit: number;
  stockUnits: number;
  productionMinutes: number;
  isVisible: boolean;
};

export type KitchenOrderItem = {
  productId: string;
  productName: string;
  unitLabel: string;
  piecesPerUnit: number;
  units: number;
  adjustedUnits: number | null;
  servedFromStockUnits: number;
};

export type KitchenOrder = {
  id: string;
  cafeId: string;
  cafeName: string;
  productionDate: string;
  roundId: string | null;
  kind: "weekly" | "urgent";
  status: "draft" | "sent" | "approved" | "ready" | "received" | "declined";
  urgentReason: string | null;
  neededBy: string | null;
  readyEta: string | null;
  declineNote: string | null;
  items: KitchenOrderItem[];
};

export type KitchenRound = {
  id: string;
  name: string;
  productionWeekday: number; // 0 = dimanche … 6 = samedi
  cutoffWeekday: number;
  cutoffTime: string; // "HH:MM"
  capacityMinutes: number;
  isActive: boolean;
};

export type RoundOccurrence = {
  roundId: string;
  roundName: string;
  productionDate: string; // YYYY-MM-DD
  cutoffAt: string; // ISO
  capacityMinutes: number;
};
