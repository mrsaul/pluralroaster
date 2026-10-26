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
  weekStart: string;
  kind: "weekly" | "urgent";
  status: "draft" | "sent" | "approved" | "ready" | "received" | "declined";
  urgentReason: string | null;
  neededBy: string | null;
  readyEta: string | null;
  items: KitchenOrderItem[];
};
