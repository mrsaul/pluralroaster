# Order Confirmation Share & Download — Design Spec

> **For agentic workers:** Use `superpowers:writing-plans` to turn this spec into an implementation plan before touching code.

**Goal:** Add Share, PDF, and Copy actions to the CheckoutPage success screen so B2B clients can forward their order recap to colleagues, save it for records, or share via WhatsApp — without leaving the app.

**Decisions made:**
- PDF approach: Browser Print (`window.print()`) — no new packages
- Button placement: inline row between order summary and the "new order" CTA
- Plain-text format: compact / WhatsApp-first (Option A)

---

## 1. Architecture

### Files created
| File | Purpose |
|---|---|
| `src/pages/OrderReceiptPage.tsx` | Print-ready A4 receipt page, served at `/order-receipt` |
| `src/lib/orderUtils.ts` | Shared helpers: `inferGrind`, `buildPlainTextSummary`, `formatDeliveryDate` |

### Files modified
| File | Change |
|---|---|
| `src/pages/CheckoutPage.tsx` | Add three action buttons + share/copy/PDF handlers to success screen |
| `src/App.tsx` | Add `/order-receipt` lazy route |
| `.gitignore` | Add `.superpowers/` |

### No new npm packages
Everything uses APIs already in the project: `date-fns` (fr locale), `lucide-react`, `navigator.share`, `navigator.clipboard`, `window.print`, `sessionStorage`.

---

## 2. Data Flow

The CheckoutPage success screen already holds all needed data in local state — no Supabase re-query needed:

```ts
confirmedOrderId: string          // full UUID → show slice(0,8).toUpperCase() only
confirmedItems:   CartItem[]      // product name, sizeLabel, sizeKg, quantity, unitPrice, pricePerKg
confirmedTotal:   number          // subtotal HT
deliveryDate:     string          // YYYY-MM-DD
notes:            string          // may be empty
```

Computed on the success screen (already present):
```ts
const snapHT  = confirmedTotal;
const snapVAT = snapHT * 0.20;
const snapTTC = snapHT + snapVAT;
```

**Passing data to the receipt page:** Written to `sessionStorage` under the key `plural_order_receipt` as JSON immediately before opening the new tab. The receipt page reads it on mount. If the key is absent (direct navigation), the page shows a graceful "Commande introuvable" message.

```ts
// Shape stored in sessionStorage
type OrderReceiptData = {
  orderId:      string;         // full UUID (receipt page shows slice(0,8).toUpperCase())
  placedAt:     string;         // ISO timestamp — captured at confirm time
  deliveryDate: string;         // YYYY-MM-DD
  notes:        string | null;
  items: {
    name:       string;         // item.product.name — NO SKU
    sizeLabel:  string | null;  // '250g', '1 kg', etc.
    sizeKg:     number | null;
    quantity:   number;
    unitPrice:  number | null;  // per-bag price when variant pricing applies
    pricePerKg: number;
  }[];
  totalHT:  number;
  vatRate:  0.20;
  totalTTC: number;
};
```

---

## 3. Shared Utilities — `src/lib/orderUtils.ts`

### `formatDeliveryDate(dateStr: string): string`
```ts
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

export function formatDeliveryDate(dateStr: string): string {
  return format(parseISO(dateStr), "EEEE d MMMM yyyy", { locale: fr });
  // → "vendredi 22 mai 2026"
}
```

### `inferGrind(productName: string, grindType: string | null): { key: string | null; inferred: boolean }`
Extracted verbatim from `PackagingView.tsx`. Same logic, now importable by both PackagingView and the receipt/share features. PackagingView updated to import from here.

### `buildPlainTextSummary(data: OrderReceiptData): string`
Produces the compact format (Option A):

```
Commande Plural Café — #A1B2C3D4
Livraison souhaitée : vendredi 22 mai 2026
[Notes : Livraison avant 9h svp]        ← only when notes present

- Colombie Golden Huila — 250g Espresso × 4 — 24,00 €
- Éthiopie FILTRE Sidama Bensa — 1 kg Filtre × 2 — 58,00 €
- Pérou Pichanaki Espresso lavé — 250g Espresso × 6 — 39,00 €
- Nicaragua Macucane Nature — 1 kg Grain entier × 1 — 32,00 €

Total TTC : 183,60 €

pluralcafe.fr
```

Rules:
- Order ref: `orderId.slice(0, 8).toUpperCase()` — never full UUID
- Delivery date: `formatDeliveryDate(deliveryDate)`
- Notes line: included only when `notes` is non-empty
- Item line: `{name} — {sizeLabel || qty+' kg'} {grindLabel} × {quantity} — {lineHT} €`
  - `grindLabel` from `inferGrind(name, null).key` → GRIND_LABEL map (e.g. `"Espresso"`, `"Filtre"`, `"Grain entier"`)
  - If no grind inferred: grind label omitted
  - Prices formatted as French locale: `183,60 €` (comma decimal, space before €)
- No markdown, no dashes/rulers, no emoji
- Footer: blank line then `pluralcafe.fr`

---

## 4. Success Screen — Three Action Buttons

### Placement
Inserted between the order summary card and the "Passer une nouvelle commande" button.

```tsx
{/* ── Share actions ── */}
<div className="grid grid-cols-3 gap-2">
  <Button variant="outline" size="sm" onClick={handleShare}>
    <Share2 className="w-4 h-4 mr-1.5" />
    Partager
  </Button>
  <Button variant="outline" size="sm" onClick={handlePdf}>
    <FileText className="w-4 h-4 mr-1.5" />
    PDF
  </Button>
  <Button variant="outline" size="sm" onClick={handleCopy} disabled={copied}>
    {copied
      ? <><Check className="w-4 h-4 mr-1.5" />Copié !</>
      : <><Copy className="w-4 h-4 mr-1.5" />Copier</>}
  </Button>
</div>
```

- `copied` is local state (`useState(false)`), reset to false after 2 seconds
- Icons from `lucide-react` (already installed): `Share2`, `FileText`, `Copy`, `Check`
- No toast needed — the button label change is the feedback for Copy

### `handleShare`
```ts
const handleShare = useCallback(async () => {
  const text = buildPlainTextSummary(receiptData);
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Commande Plural Café', text });
    } catch (err) {
      // AbortError = user dismissed sheet — silent no-op
      if (err instanceof Error && err.name !== 'AbortError') {
        // Any other error: fall back to clipboard
        await navigator.clipboard.writeText(text).catch(() => {});
      }
    }
  } else {
    // Desktop / unsupported: copy to clipboard silently
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
}, [receiptData]);
```

### `handlePdf`
```ts
const handlePdf = useCallback(() => {
  sessionStorage.setItem('plural_order_receipt', JSON.stringify(receiptData));
  window.open('/order-receipt', '_blank', 'noopener');
}, [receiptData]);
```

### `handleCopy`
```ts
const handleCopy = useCallback(async () => {
  const text = buildPlainTextSummary(receiptData);
  await navigator.clipboard.writeText(text).catch(() => {});
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
}, [receiptData]);
```

### `receiptData` construction (in success screen)
```ts
const receiptData: OrderReceiptData = useMemo(() => ({
  orderId:      confirmedOrderId ?? '',
  placedAt:     new Date().toISOString(),  // captured at confirm time via useState
  deliveryDate: deliveryDate ?? '',
  notes:        notes.trim() || null,
  items: confirmedItems.map(item => ({
    name:       item.product.name,
    sizeLabel:  item.sizeLabel ?? null,
    sizeKg:     item.sizeKg ?? null,
    quantity:   item.quantity,
    unitPrice:  item.unitPrice ?? null,
    pricePerKg: item.product.pricePerKg,
  })),
  totalHT:  confirmedTotal,
  vatRate:  0.20,
  totalTTC: confirmedTotal * 1.20,
}), [confirmedOrderId, confirmedItems, confirmedTotal, deliveryDate, notes]);
```

Note: `placedAt` needs a `confirmedAt` state variable added to CheckoutPage, set at the same time as `confirmedOrderId` in `handleConfirm`.

---

## 5. Receipt Page — `src/pages/OrderReceiptPage.tsx`

### Route
Added lazily in `App.tsx`:
```tsx
const OrderReceiptPage = lazy(() => import('./pages/OrderReceiptPage'));
// ...
<Route path="/order-receipt" element={<OrderReceiptPage />} />
```

### On mount behaviour
```ts
useEffect(() => {
  const raw = sessionStorage.getItem('plural_order_receipt');
  if (!raw) { setMissing(true); return; }
  setData(JSON.parse(raw) as OrderReceiptData);
  // Trigger print after fonts settle
  const t = setTimeout(() => window.print(), 400);
  return () => clearTimeout(t);
}, []);
```

### Visual design (matches PDF mockup v2)

**Screen view** (visible before/after print dialog):
- Cream background `#FAF6F0`, centred A4-proportioned card with box-shadow
- "Enregistrer en PDF" button at top (manual trigger for users who dismissed dialog)

**Print layout** (`@media print`):
- `@page { size: A4; margin: 15mm 18mm; }`
- Background colours preserved: `-webkit-print-color-adjust: exact; print-color-adjust: exact`
- Button hidden, no box-shadow, full width

**Layout (top to bottom):**

1. **Header row** — logo badge left, order meta right
   - Logo: `<img src="/favicon.png" width="64" height="64" style={{ borderRadius: '50%' }}>`
   - Wordmark: "Plural" (bold, uppercase, letter-spaced) + "Coffee made by several humans" (small, muted)
   - Order meta: `#{ref}` in monospace, "Passée le {date}", right-aligned

2. **4-colour accent bar** — `linear-gradient(90deg, #C9A8E0, #F4A261, #A8D5A2, #5B8DB8)`, 3px tall

3. **Document title**
   - Label: "Document de confirmation" (10px, muted, uppercase, spaced)
   - Heading: "Confirmation de commande" (Georgia serif, ~26px, uppercase, bold)

4. **Delivery strip** — two cells, rounded, `#F0EBE3` background
   - Cell 1: "Date de livraison souhaitée" / `{formattedDate}`
   - Cell 2 (only if notes present): "Notes" / `{notes}`

5. **Items table**
   - Header: dark `#1A1A18` background, white text — columns: Produit | Conditionnement | Qté | Prix unit. HT | Total HT
   - Rows: alternating white / `#F0EBE3`
   - Product cell: `item.name` bold, "Café de spécialité" as subtitle (muted, small)
   - Conditionnement cell: `{sizeLabel} · {grindLabel}` — grind only if inferred/known
   - Price/total: right-aligned, tabular nums, `€` formatted with comma decimal
   - **No SKU anywhere**

6. **Totals block** — right-aligned, 220px wide
   - Sous-total HT / TVA 20 % / **Total TTC** (bold, larger, top border)

7. **Footer** (absolute bottom of page)
   - Left: "Merci pour votre commande !" (italic, slightly larger)
   - Right: `contact@pluralcafe.fr · pluralcafe.fr`

### Graceful fallback (no sessionStorage data)
```tsx
if (missing) return (
  <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center">
    <p className="text-sm text-muted-foreground">
      Commande introuvable. Veuillez revenir depuis l'application.
    </p>
  </div>
);
```

---

## 6. Confidentiality Rules (enforced in code)

| Must NOT appear | Enforced by |
|---|---|
| `item.product.sku` | Never included in `OrderReceiptData` |
| Full order UUID | Only `orderId.slice(0,8).toUpperCase()` used |
| Internal status fields | Not in scope of this screen |
| Sellsy IDs | Not available on success screen |
| Other clients' data | Single-session data only |

---

## 7. `.gitignore` Addition

```
.superpowers/
```

---

## 8. What Changes in Existing Files

### `PackagingView.tsx`
- Remove local `inferGrind` function
- Import `inferGrind` from `@/lib/orderUtils`
- All other logic unchanged

### `CheckoutPage.tsx`
- Add `confirmedAt` state (`useState<string | null>(null)`), set alongside `confirmedOrderId`
- Add `copied` state (`useState(false)`)
- Construct `receiptData` memo in success screen
- Add three buttons (Share / PDF / Copier) between summary card and CTA
- Import `buildPlainTextSummary`, `formatDeliveryDate` from `@/lib/orderUtils`

### `App.tsx`
- Add lazy import for `OrderReceiptPage`
- Add `<Route path="/order-receipt" element={<OrderReceiptPage />} />`
