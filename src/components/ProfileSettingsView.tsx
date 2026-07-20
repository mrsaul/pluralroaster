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
        toast({ title: "Confirmation email sent", description: "Check your inbox to confirm the new email address." });
      } else {
        toast({ title: "Profile updated" });
      }
      clearDraft();
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "Failed to save profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Minimum 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Password updated" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "Failed to update password", variant: "destructive" });
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
        <h2 className="text-xl font-semibold text-foreground">Profile Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage your account information</p>
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
            Personal Information
          </CardTitle>
          <CardDescription>Update your name and email address</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
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
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground" />
            Change Password
          </CardTitle>
          <CardDescription>Set a new password for your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-destructive">Passwords don't match</p>
            )}
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={!newPassword || newPassword !== confirmPassword || savingPassword}
            variant="outline"
            className="w-full sm:w-auto"
          >
            {savingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
            Update Password
          </Button>
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Push Notifications
          </CardTitle>
          <CardDescription>
            Receive a notification on this device when a new order is placed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!supported ? (
            <p className="text-sm text-muted-foreground">
              {supportStatus === "no-sw" && "Push notifications require a browser that supports service workers."}
              {supportStatus === "no-push" && "Push notifications are not supported in this browser. On iOS, add the app to your home screen first."}
              {supportStatus === "no-vapid-key" && "Push notifications are not configured (missing VITE_VAPID_PUBLIC_KEY)."}
            </p>
          ) : permission === "denied" ? (
            <p className="text-sm text-destructive">
              Notifications are blocked by your browser. Open browser settings → Site settings → Notifications and allow this site.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm">
                {subscribed
                  ? <><BellOff className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Notifications active on this device</span></>
                  : <><Bell className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Not enabled on this device</span></>}
              </div>
              <Button
                variant={subscribed ? "outline" : "default"}
                size="sm"
                disabled={pushLoading}
                onClick={subscribed ? unsubscribe : subscribe}
                className="gap-2 shrink-0"
              >
                {pushLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {subscribed ? "Disable" : "Enable notifications"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
