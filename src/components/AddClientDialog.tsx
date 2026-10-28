import { useState } from "react";
import { Loader2, Link2, Unlink2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useDraftPersistence } from "@/hooks/useDraftPersistence";
import { DraftBanner } from "@/components/DraftBanner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

// ── Draft-persisted form data type ────────────────────────────────────────────
type ClientFormData = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  deliveryAddress: string;
  pricingTier: string;
  notes: string;
  sellsyClientId: string;
  dataMode: "custom" | "sellsy";
};

const CLIENT_FORM_DEFAULT: ClientFormData = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  deliveryAddress: "",
  pricingTier: "standard",
  notes: "",
  sellsyClientId: "",
  dataMode: "custom",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function AddClientDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();

  // Transient UI state — not persisted
  const [saving, setSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  // ── Draft-persisted form state ───────────────────────────────────────────
  const {
    value: form,
    setValue: setForm,
    clearDraft,
    discardDraft,
    savedAt: draftSavedAt,
    showBanner: showDraftBanner,
  } = useDraftPersistence<ClientFormData>("add-client", CLIENT_FORM_DEFAULT);

  // Destructure for JSX readability
  const { companyName, contactName, email, phone, deliveryAddress,
    pricingTier, notes, sellsyClientId, dataMode } = form;

  // Field-specific setters
  const setCompanyName = (v: string) => setForm(p => ({ ...p, companyName: v }));
  const setContactName = (v: string) => setForm(p => ({ ...p, contactName: v }));
  const setEmail = (v: string) => setForm(p => ({ ...p, email: v }));
  const setPhone = (v: string) => setForm(p => ({ ...p, phone: v }));
  const setDeliveryAddress = (v: string) => setForm(p => ({ ...p, deliveryAddress: v }));
  const setPricingTier = (v: string) => setForm(p => ({ ...p, pricingTier: v }));
  const setNotes = (v: string) => setForm(p => ({ ...p, notes: v }));
  const setSellsyClientId = (v: string) => setForm(p => ({ ...p, sellsyClientId: v }));
  const setDataMode = (v: "custom" | "sellsy") => setForm(p => ({ ...p, dataMode: v }));

  const resetForm = () => {
    discardDraft();
    setDuplicateWarning(false);
  };

  const checkDuplicate = async (emailValue: string) => {
    if (!emailValue.trim()) { setDuplicateWarning(false); return; }
    const { data } = await supabase
      .from("client_onboarding")
      .select("id")
      .eq("email", emailValue.trim())
      .limit(1);
    setDuplicateWarning((data ?? []).length > 0);
  };

  const handleSave = async () => {
    if (!companyName.trim()) {
      toast({ title: "Le nom de l'entreprise est obligatoire", variant: "destructive" });
      return;
    }
    if (!email.trim()) {
      toast({ title: "L'e-mail est obligatoire", variant: "destructive" });
      return;
    }
    if (!deliveryAddress.trim()) {
      toast({ title: "L'adresse de livraison est obligatoire", variant: "destructive" });
      return;
    }
    if (dataMode === "sellsy" && !sellsyClientId.trim()) {
      toast({ title: "L'ID client Sellsy est obligatoire en mode synchronisé", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non connecté");

      const { error } = await supabase.from("client_onboarding").insert({
        user_id: crypto.randomUUID(),
        company_name: companyName.trim(),
        contact_name: contactName.trim() || null,
        email: email.trim(),
        phone: phone.trim() || null,
        delivery_address: deliveryAddress.trim(),
        pricing_tier: pricingTier,
        notes: notes.trim() || null,
        sellsy_client_id: sellsyClientId.trim() || null,
        client_data_mode: dataMode,
        custom_company_name: dataMode === "custom" ? companyName.trim() : null,
        custom_contact_name: dataMode === "custom" ? (contactName.trim() || null) : null,
        custom_email: dataMode === "custom" ? email.trim() : null,
        custom_phone: dataMode === "custom" ? (phone.trim() || null) : null,
        custom_delivery_address: dataMode === "custom" ? deliveryAddress.trim() : null,
        custom_pricing_tier: dataMode === "custom" ? pricingTier : null,
        onboarding_status: "completed",
        current_step: 5,
      });

      if (error) throw error;

      toast({ title: "Client créé" });
      clearDraft();
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Impossible de créer le client", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { /* keep draft alive on close */ } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouveau client</DialogTitle>
          <DialogDescription>Créer une nouvelle fiche client B2B.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {showDraftBanner && draftSavedAt && (
            <DraftBanner savedAt={draftSavedAt} onDiscard={resetForm} />
          )}

          {/* Basic Info */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Informations générales</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Nom de l'entreprise *</p>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Nom de l'entreprise" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Nom du contact</p>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Nom du contact" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">E-mail *</p>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => void checkDuplicate(email)}
                  placeholder="email@company.com"
                />
                {duplicateWarning && (
                  <p className="text-xs text-primary font-medium">⚠️ Un client existe peut-être déjà avec cet e-mail</p>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Téléphone</p>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 6 12 34 56 78" />
              </div>
            </div>
          </div>

          {/* Delivery */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Livraison</p>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Adresse de livraison *</p>
              <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Adresse de livraison complète" />
            </div>
          </div>

          {/* Business Settings */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Paramètres commerciaux</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Palier tarifaire</p>
                <div className="flex gap-1.5">
                  {["standard", "premium", "wholesale"].map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setPricingTier(tier)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors capitalize",
                        pricingTier === tier
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                      )}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Notes</p>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes internes…" rows={2} />
              </div>
            </div>
          </div>

          {/* Sellsy Integration */}
          <div className="rounded-xl border-2 border-border p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Intégration Sellsy</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDataMode("custom")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                  dataMode === "custom"
                    ? "border-accent-foreground bg-accent/50"
                    : "border-border hover:border-muted-foreground/50"
                )}
              >
                <Unlink2 className={cn("h-4 w-4 shrink-0", dataMode === "custom" ? "text-accent-foreground" : "text-muted-foreground")} />
                <div>
                  <p className={cn("text-sm font-medium", dataMode === "custom" ? "text-accent-foreground" : "text-foreground")}>App uniquement</p>
                  <p className="text-[11px] text-muted-foreground">Modifiable dans l'app</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDataMode("sellsy")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                  dataMode === "sellsy"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                )}
              >
                <Link2 className={cn("h-4 w-4 shrink-0", dataMode === "sellsy" ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className={cn("text-sm font-medium", dataMode === "sellsy" ? "text-primary" : "text-foreground")}>Synchronisé avec Sellsy</p>
                  <p className="text-[11px] text-muted-foreground">Read-only data</p>
                </div>
              </button>
            </div>

            {dataMode === "sellsy" && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">ID client Sellsy *</p>
                <Input value={sellsyClientId} onChange={(e) => setSellsyClientId(e.target.value)} placeholder="e.g. 12345678" className="font-mono" />
              </div>
            )}

            {dataMode === "custom" && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">ID client Sellsy (facultatif)</p>
                <Input value={sellsyClientId} onChange={(e) => setSellsyClientId(e.target.value)} placeholder="À lier à Sellsy plus tard" className="font-mono" />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Créer le client
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
