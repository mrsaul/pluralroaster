// ── Order receipt utilities ────────────────────────────────────────────────────

export const GRIND_LABEL: Record<string, string> = {
  whole: 'Grains entiers',
  espresso: 'Espresso',
  filter: 'Filtre',
  'coarse-filter': 'Filtre grossier',
  'fine-filter': 'Filtre fin',
  moka: 'Moka',
};

export function inferGrind(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes('espresso')) return 'espresso';
  if (lower.includes('moka')) return 'moka';
  if (lower.includes('filtre') || lower.includes('filter')) return 'filter';
  if (lower.includes('grains')) return 'whole';
  return null;
}

export interface OrderReceiptData {
  orderId: string;
  createdAt: string;          // ISO date string
  deliveryDate: string;       // ISO date string
  clientName: string;
  items: Array<{
    name: string;
    sizeLabel?: string;
    sizeKg?: number;
    quantity: number;
    unitPrice?: number;
    pricePerKg: number;
    grind?: string;
    kind?: 'coffee' | 'service';   // optional for back-compat
  }>;
  subtotalHT: number;
  vatRate: number;            // e.g. 0.20
  vatAmount: number;
  totalTTC: number;
  notes?: string | null;
}

// ── Currency helper ───────────────────────────────────────────────────────────

function fmtEur(amount: number): string {
  return `${amount.toFixed(2)} €`;
}

// ── Plain-text summary ────────────────────────────────────────────────────────

export function buildPlainTextSummary(data: OrderReceiptData): string {
  const lines: string[] = [];

  lines.push(`Commande #${data.orderId.slice(0, 8).toUpperCase()}`);
  lines.push(`Date : ${formatDeliveryDate(data.createdAt)}`);
  lines.push(`Livraison : ${formatDeliveryDate(data.deliveryDate)}`);
  lines.push(`Client : ${data.clientName}`);
  lines.push('');
  lines.push('Articles :');

  for (const item of data.items) {
    if (item.kind === 'service') {
      lines.push(`- ${item.name} × ${item.quantity} — ${fmtEur(item.unitPrice ?? item.pricePerKg)}`);
      continue;
    }

    // Coffee item formatting
    const grindKey = item.grind ?? inferGrind(item.name);
    const grindLabel = grindKey ? (GRIND_LABEL[grindKey] ?? grindKey) : null;
    const sizeStr = item.sizeLabel ?? (item.sizeKg ? `${item.sizeKg} kg` : null);
    const conditioning = [sizeStr || null, grindLabel].filter(Boolean).join(' · ');
    const lineHT = item.unitPrice != null
      ? item.unitPrice * item.quantity
      : (item.sizeKg ?? 1) * item.quantity * item.pricePerKg;

    lines.push(
      `- ${item.name}${conditioning ? ` (${conditioning})` : ''} × ${item.quantity} — ${fmtEur(lineHT)}`
    );
  }

  lines.push('');
  lines.push(`Sous-total HT : ${fmtEur(data.subtotalHT)}`);
  lines.push(`TVA (${(data.vatRate * 100).toFixed(0)} %) : ${fmtEur(data.vatAmount)}`);
  lines.push(`Total TTC : ${fmtEur(data.totalTTC)}`);

  if (data.notes) {
    lines.push('');
    lines.push(`Notes : ${data.notes}`);
  }

  return lines.join('\n');
}

// ── Date formatter ────────────────────────────────────────────────────────────

export function formatDeliveryDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}
