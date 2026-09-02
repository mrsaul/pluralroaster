import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";

export default function ResetPasswordPage() {
  const t = useT();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // true once Supabase confirms this is a recovery session
  const [ready, setReady] = useState(false);
  // false while we wait for the PASSWORD_RECOVERY event (could take a moment)
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    // Check the hash immediately in case Supabase hasn't cleared it yet
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hashParams.get("type") === "recovery") {
      setReady(true);
      setWaiting(false);
    }

    // Listen for the authoritative PASSWORD_RECOVERY event from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setWaiting(false);
      }
    });

    // If neither fires within 3 s, stop waiting (link is invalid/expired)
    const timeout = setTimeout(() => setWaiting(false), 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const passwordMismatch = useMemo(
    () => confirmPassword.length > 0 && password !== confirmPassword,
    [password, confirmPassword],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ready) {
      setError(t.reset.errInvalidLink);
      return;
    }

    if (password.length < 8) {
      setError(t.reset.errTooShort);
      return;
    }

    if (password !== confirmPassword) {
      setError(t.reset.errMismatch);
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.reset.errUnableToUpdate);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        {/* Icon */}
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>

        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t.reset.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.reset.subtitle}
          </p>
        </div>

        {/* Waiting for Supabase to confirm the recovery token */}
        {waiting ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t.reset.verifying}
          </div>
        ) : !ready ? (
          /* Token not found / expired */
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {t.reset.errInvalidLink}
            </div>
            <a
              href="/"
              className="block w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.reset.linkBack}
            </a>
          </div>
        ) : done ? (
          /* Success */
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
              {t.reset.msgUpdated}
            </div>
            <a
              href="/"
              className="block w-full h-11 flex items-center justify-center bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              {t.reset.btnSignIn}
            </a>
          </div>
        ) : (
          /* Reset form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-foreground">
                {t.reset.newPassword}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                required
                autoFocus
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm text-foreground">
                {t.reset.confirmPassword}
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                required
                className="h-11"
              />
            </div>

            {passwordMismatch && (
              <p className="text-xs text-destructive">{t.reset.errMismatch}</p>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <motion.button
              type="submit"
              whileTap={{ scale: 0.98 }}
              disabled={loading || passwordMismatch || !password || !confirmPassword}
              className="w-full h-11 flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg transition-opacity disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? t.reset.btnUpdating : t.reset.btnUpdate}
            </motion.button>

            <a
              href="/"
              className="block w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.reset.linkBack}
            </a>
          </form>
        )}
      </motion.div>
    </div>
  );
}
