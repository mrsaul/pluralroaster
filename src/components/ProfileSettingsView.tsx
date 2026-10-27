import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Lock, Save, Loader2, Bell, BellOff } from "lucide-react";
import { useDraftPersistence } from "@/hooks/useDraftPersistence";
import { DraftBanner } from "@/components/DraftBanner";
import { usePushNotifications } from "@/hooks/usePushNotifications";

type ProfileFormData = { fullName: string; email: string };
const PROFILE_FORM_DEFAULT: ProfileFormData = { fullName: "", email: "" };

export function ProfileSettingsView() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [originalName, setOriginalName] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // ── Draft-persisted profile form ──────────────────────────────────────────
  const {
    value: form,
    setValue: setForm,
    clearDraft,
    discardDraft,
    savedAt: draftSavedAt,
    showBanner: showDraftBanner,
  } = useDraftPersistence<ProfileFormData>("profile-settings", PROFILE_FORM_DEFAULT);

  const fullName = form.fullName;
  const email = form.email;
  const setFullName = (v: string) => setForm(p => ({ ...p, fullName: v }));
  const setEmail = (v: string) => setForm(p => ({ ...p, email: v }));

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const dbEmail = user.email ?? "";
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const dbName = profile?.full_name ?? "";

      setOriginalEmail(dbEmail);
      setOriginalName(dbName);

      // If no draft was restored, populate form from DB.
      // We check showDraftBanner indirectly: if the current form is still
      // the blank default, no draft was loaded — set from DB.
      setForm(prev => {
        const noDraftLoaded = prev.fullName === "" && prev.email === "";
        return noDraftLoaded ? { fullName: dbName, email: dbEmail } : prev;
      });
    } finally {
      setLoading(false);
    }
  }, [setForm]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  // Auto-clear draft when form values match DB originals (form is "clean")
  useEffect(() => {
    if (loading) return;
    if (form.fullName === originalName && form.email === originalEmail) {
      clearDraft();
    }
  }, [form, originalName, originalEmail, loading, clearDraft]);

  const { permission, subscribed, loading: pushLoading, supported, supportStatus, subscribe, unsubscribe } = usePushNotifications();

  const profileDirty = fullName !== originalName || email !== originalEmail;

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Votre session a expiré. Veuillez vous reconnecter.");

      if (fullName !== originalName) {
        const { error } = await supabase
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", user.id);
        if (error) throw error;
        setOriginalName(fullName);
      }

      if (email !== originalEmail) {
        const { error } = await supabase.auth.updateUser({ email });
        if (error) throw error;
        setOriginalEmail(email);
        toast({ title: "E-mail de confirmation envoyé", description: "Vérifiez votre boîte de réception pour confirmer la nouvelle adresse." });
      } else {
        toast({ title: "Profil mis à jour" });
      }
      clearDraft();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message ?? "Impossible d'enregistrer le profil", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Mot de passe trop court", description: "6 caractères minimum.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Mot de passe mis à jour" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message ?? "Impossible de modifier le mot de passe", variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Profil</h2>
        <p className="text-sm text-muted-foreground mt-1">Gérez les informations de votre compte</p>
      </div>

      {showDraftBanner && draftSavedAt && (
        <DraftBanner savedAt={draftSavedAt} onDiscard={() => {
          discardDraft();
          setForm({ fullName: originalName, email: originalEmail });
        }} />
      )}

      {/* Profile Info */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            Informations personnelles
          </CardTitle>
          <CardDescription>Modifiez votre nom et votre adresse e-mail</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nom complet</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Votre nom"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
            />
          </div>

          <Button
            onClick={handleSaveProfile}
            disabled={!profileDirty || saving}
            className="w-full sm:w-auto"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Enregistrer
          </Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground" />
            Changer le mot de passe
          </CardTitle>
          <CardDescription>Choisissez un nouveau mot de passe</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nouveau mot de passe</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-destructive">Les mots de passe ne correspondent pas</p>
            )}
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={!newPassword || newPassword !== confirmPassword || savingPassword}
            variant="outline"
            className="w-full sm:w-auto"
          >
            {savingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
            Modifier le mot de passe
          </Button>
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Notifications
          </CardTitle>
          <CardDescription>
            Recevoir une notification sur cet appareil à chaque nouvelle commande.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!supported ? (
            <p className="text-sm text-muted-foreground">
              {supportStatus === "no-sw" && "Les notifications nécessitent un navigateur compatible (service workers)."}
              {supportStatus === "no-push" && "Ce navigateur ne gère pas les notifications. Sur iPhone, ajoutez d'abord l'app à l'écran d'accueil."}
              {supportStatus === "no-vapid-key" && "Les notifications ne sont pas configurées (VITE_VAPID_PUBLIC_KEY manquante)."}
            </p>
          ) : permission === "denied" ? (
            <p className="text-sm text-destructive">
              Les notifications sont bloquées par votre navigateur. Ouvrez Réglages → Réglages du site → Notifications et autorisez ce site.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm">
                {subscribed
                  ? <><BellOff className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Notifications actives sur cet appareil</span></>
                  : <><Bell className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Non activées sur cet appareil</span></>}
              </div>
              <Button
                variant={subscribed ? "outline" : "default"}
                size="sm"
                disabled={pushLoading}
                onClick={subscribed ? unsubscribe : subscribe}
                className="gap-2 shrink-0"
              >
                {pushLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {subscribed ? "Désactiver" : "Activer les notifications"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
