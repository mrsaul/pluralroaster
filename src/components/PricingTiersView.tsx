import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { describeRules, tierRulesFromRow } from "@/lib/tierRules";
import { useDraftPersistence } from "@/hooks/useDraftPersistence";
import { DraftBanner } from "@/components/DraftBanner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export type PricingTier = {
  id: string;
  name: string;
  description: string | null;
  product_discount_percent: number;
  delivery_discount_percent: number;
  kg_discount_percent?: number | null;
  bag_discount_percent?: number | null;
  volume_threshold_kg?: number | null;
  volume_kg_discount_percent?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type TierFormData = {
  name: string;
  description: string;
  /** Percent fields are kept as text so the step fields can be empty. */
  kgDiscount: string;
  bagDiscount: string;
  thresholdKg: string;
  kgAbove: string;
  isActive: boolean;
};

const TIER_FORM_DEFAULT: TierFormData = {
  name: "", description: "", kgDiscount: "0", bagDiscount: "0", thresholdKg: "", kgAbove: "", isActive: true,
};

const parseNum = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

const tierSummary = (tier: PricingTier): string => {
  const text = describeRules(tierRulesFromRow(tier));
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Aucune remise";
};

const NO_STEP_ERROR = "Le seuil (kg) et la remise au-delà vont ensemble : renseignez les deux, ou laissez-les vides.";

export function PricingTiersView() {
  const { toast } = useToast();
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTier, setEditTier] = useState<PricingTier | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTier, setDeleteTier] = useState<PricingTier | null>(null);
  const [saving, setSaving] = useState(false);

  // Dynamic draft key: per-tier for edits, fixed for create
  const draftKey = editTier ? `pricing-tier-edit:${editTier.id}` : "pricing-tier-create";
  const draftDefault = editTier
    ? (() => {
        const r = tierRulesFromRow(editTier);
        return {
          name: editTier.name, description: editTier.description ?? "",
          kgDiscount: String(r.kg), bagDiscount: String(r.bag),
          thresholdKg: r.thresholdKg != null ? String(r.thresholdKg) : "",
          kgAbove: r.kgAbove != null ? String(r.kgAbove) : "",
          isActive: editTier.is_active,
        };
      })()
    : TIER_FORM_DEFAULT;

  const {
    value: form,
    setValue: setForm,
    clearDraft,
    discardDraft,
    savedAt: draftSavedAt,
    showBanner: showDraftBanner,
  } = useDraftPersistence<TierFormData>(draftKey, draftDefault);

  const { name, description, isActive } = form;
  // Drafts saved before the rules existed lack these keys
  const kgDiscount = form.kgDiscount ?? "0";
  const bagDiscount = form.bagDiscount ?? "0";
  const thresholdKg = form.thresholdKg ?? "";
  const kgAbove = form.kgAbove ?? "";
  const [stepError, setStepError] = useState<string | null>(null);
  const setName = (v: string) => setForm(p => ({ ...p, name: v }));
  const setDescription = (v: string) => setForm(p => ({ ...p, description: v }));
  const setField = (k: "kgDiscount" | "bagDiscount" | "thresholdKg" | "kgAbove", v: string) => {
    setStepError(null);
    setForm(p => ({ ...p, [k]: v }));
  };
  const setIsActive = (v: boolean) => setForm(p => ({ ...p, isActive: v }));

  const loadTiers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pricing_tiers")
        .select("*")
        .order("name");
      if (error) throw error;
      setTiers((data ?? []) as PricingTier[]);
    } catch (err) {
      toast({ title: "Impossible de charger les paliers tarifaires", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void loadTiers(); }, [loadTiers]);

  const resetForm = () => { setStepError(null); discardDraft(); };

  const openEdit = (tier: PricingTier) => {
    // Setting editTier changes the draftKey, which triggers hook re-init
    // and loads that tier's draft (or its current DB values as default)
    setEditTier(tier);
  };

  const openCreate = () => {
    setEditTier(null);
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Le nom est obligatoire", variant: "destructive" });
      return;
    }
    const kg = parseNum(kgDiscount) ?? 0;
    const bag = parseNum(bagDiscount) ?? 0;
    const threshold = parseNum(thresholdKg);
    const above = parseNum(kgAbove);
    const inPercent = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
    if (!inPercent(kg) || !inPercent(bag) || (above !== null && !inPercent(above))) {
      setStepError("Les remises doivent être comprises entre 0 et 100 %.");
      return;
    }
    if ((threshold === null) !== (above === null) || (threshold !== null && !(threshold > 0))) {
      setStepError(NO_STEP_ERROR);
      return;
    }
    setStepError(null);
    setSaving(true);
    try {
      // product_discount_percent mirrors the kg rate for older app versions;
      // delivery_discount_percent is left untouched (no effect on pricing).
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        kg_discount_percent: kg,
        bag_discount_percent: bag,
        volume_threshold_kg: threshold,
        volume_kg_discount_percent: above,
        product_discount_percent: kg,
        is_active: isActive,
      };

      if (editTier) {
        const { error } = await supabase
          .from("pricing_tiers")
          .update(payload)
          .eq("id", editTier.id);
        if (error) throw error;
        clearDraft();
        toast({ title: "Palier mis à jour" });
        setEditTier(null);
      } else {
        const { error } = await supabase
          .from("pricing_tiers")
          .insert(payload);
        if (error) throw error;
        clearDraft();
        toast({ title: "Palier créé" });
        setShowCreate(false);
      }
      void loadTiers();
    } catch (err) {
      toast({ title: "Échec de l'enregistrement", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTier) return;
    try {
      const { error } = await supabase.from("pricing_tiers").delete().eq("id", deleteTier.id);
      if (error) throw error;
      toast({ title: "Palier supprimé" });
      setDeleteTier(null);
      void loadTiers();
    } catch (err) {
      toast({ title: "Échec de la suppression", description: String(err), variant: "destructive" });
    }
  };

  const dialogOpen = showCreate || !!editTier;

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Paliers tarifaires</h2>
          <p className="text-sm text-muted-foreground">Créez des modèles de prix réutilisables à attribuer aux clients.</p>
        </div>
        <Button size="sm" className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Nouveau palier
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {/* Phones: one card per tier */}
        <ul aria-label="Paliers tarifaires" className="md:hidden divide-y divide-border">
          {loading ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">Chargement…</li>
          ) : tiers.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun palier tarifaire. Créez-en un pour commencer.</li>
          ) : (
            tiers.map((tier) => (
              <li key={tier.id} className="flex items-start gap-2 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground break-words">{tier.name}</p>
                    <Badge variant={tier.is_active ? "default" : "secondary"} className="text-[10px]">
                      {tier.is_active ? "Actif" : "Inactif"}
                    </Badge>
                  </div>
                  {tier.description && <p className="text-xs text-muted-foreground break-words">{tier.description}</p>}
                  <p className="text-xs text-foreground break-words pt-0.5">{tierSummary(tier)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    aria-label={`Modifier ${tier.name}`}
                    className="w-10 h-10 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                    onClick={() => openEdit(tier)}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    aria-label={`Supprimer ${tier.name}`}
                    className="w-10 h-10 rounded flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() => setDeleteTier(tier)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>

        {/* Wider screens: full table */}
        <div data-wide-table className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Nom</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Remises</TableHead>
              <TableHead className="text-center">Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Chargement…</TableCell>
              </TableRow>
            ) : tiers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Aucun palier tarifaire. Créez-en un pour commencer.
                </TableCell>
              </TableRow>
            ) : (
              tiers.map((tier) => (
                <TableRow key={tier.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium text-foreground">{tier.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{tier.description ?? "—"}</TableCell>
                  <TableCell className="text-sm text-foreground">{tierSummary(tier)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={tier.is_active ? "default" : "secondary"} className="text-[10px]">
                      {tier.is_active ? "Actif" : "Inactif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        aria-label={`Modifier ${tier.name}`}
                        className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                        onClick={() => openEdit(tier)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        aria-label={`Supprimer ${tier.name}`}
                        className="w-7 h-7 rounded flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => setDeleteTier(tier)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setShowCreate(false); setEditTier(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTier ? "Modifier le palier tarifaire" : "Nouveau palier tarifaire"}</DialogTitle>
            <DialogDescription>
              {editTier ? "Modifier ce modèle de prix." : "Définir un modèle de prix réutilisable pour les clients."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {showDraftBanner && draftSavedAt && (
              <DraftBanner savedAt={draftSavedAt} onDiscard={resetForm} />
            )}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Nom</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Palier VIP" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex. Restaurants partenaires" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="tier-kg" className="text-sm font-medium text-foreground mb-1.5 block">Remise café au kg (%)</label>
                <Input id="tier-kg" type="number" min={0} max={100} step="any" value={kgDiscount} onChange={(e) => setField("kgDiscount", e.target.value)} />
              </div>
              <div>
                <label htmlFor="tier-bag" className="text-sm font-medium text-foreground mb-1.5 block">Remise sachets (%)</label>
                <Input id="tier-bag" type="number" min={0} max={100} step="any" value={bagDiscount} onChange={(e) => setField("bagDiscount", e.target.value)} />
                <p className="text-[11px] text-muted-foreground mt-1">Sachets de 150 g et 250 g</p>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Palier de volume (optionnel) : une remise plus forte sur le café au kg dès un certain volume par commande.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="tier-threshold" className="text-sm font-medium text-foreground mb-1.5 block">À partir de (kg)</label>
                  <Input id="tier-threshold" type="number" min={0} step="any" value={thresholdKg} onChange={(e) => setField("thresholdKg", e.target.value)} />
                </div>
                <div>
                  <label htmlFor="tier-above" className="text-sm font-medium text-foreground mb-1.5 block">Remise au kg au-delà (%)</label>
                  <Input id="tier-above" type="number" min={0} max={100} step="any" value={kgAbove} onChange={(e) => setField("kgAbove", e.target.value)} />
                </div>
              </div>
              {stepError && <p role="alert" className="text-xs text-destructive">{stepError}</p>}
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <label className="text-sm text-foreground">Actif</label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowCreate(false); setEditTier(null); resetForm(); }}>Annuler</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editTier ? "Enregistrer" : "Créer le palier"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTier} onOpenChange={(v) => !v && setDeleteTier(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTier?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Ce palier tarifaire sera supprimé. Les clients qui l'avaient n'auront plus de palier. Les commandes existantes ne changent pas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
