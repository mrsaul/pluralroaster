import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Mail, CheckCircle2, ArrowLeft, Coffee } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";

type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "reset-sent";

export default function LoginPage() {
  const t = useT();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goTo = (next: AuthMode) => {
    setError(null);
    setMode(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "forgot-password") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setMode("reset-sent");
        return;
      }

      if (mode === "sign-up") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim() },
          },
        });
        if (signUpError) throw signUpError;
        goTo("sign-in");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
    } catch (authError) {
      const raw = authError instanceof Error ? authError.message : t.login.errAuthFailed;
      const friendly = raw.toLowerCase().includes("rate limit") ? t.login.errRateLimit : raw;
      setError(friendly);
    } finally {
      setLoading(false);
    }
  };

  // ── Reset-sent success screen ─────────────────────────────────────────────
  if (mode === "reset-sent") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-sm text-center space-y-6"
        >
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">Vérifiez votre email</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Un lien de réinitialisation a été envoyé à{" "}
              <span className="font-medium text-foreground">{email}</span>.
              <br />
              Vérifiez vos spams si vous ne le trouvez pas.
            </p>
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => goTo("forgot-password")}
              className="w-full h-11 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Renvoyer le lien
            </button>
            <button
              type="button"
              onClick={() => goTo("sign-in")}
              className="w-full h-11 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour à la connexion
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const isForgot = mode === "forgot-password";
  const isSignUp = mode === "sign-up";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="w-full max-w-sm"
      >
        {/* Brand header */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Coffee className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
            </div>
            <span className="text-base font-semibold tracking-tight text-foreground">PluralRoaster</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground leading-tight">
            {isForgot ? "Mot de passe oublié ?" : isSignUp ? "Créer un compte" : "Bon retour !"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {isForgot
              ? "Entrez votre email et nous vous enverrons un lien de réinitialisation."
              : isSignUp
                ? t.login.subtitleSignUp
                : t.login.subtitleSignIn}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full name (sign-up only) */}
          <AnimatePresence initial={false}>
            {isSignUp && (
              <motion.div
                key="fullName"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5 pb-0.5">
                  <Label htmlFor="fullName" className="text-sm font-medium text-foreground">{t.login.fullName}</Label>
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jean Dupont"
                    required={isSignUp}
                    maxLength={100}
                    className="h-11"
                    autoComplete="name"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium text-foreground">{t.login.email}</Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="barista@cafepluralcafe.fr"
                required
                className="h-11 pl-10"
                autoComplete="email"
              />
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Password (hidden in forgot mode) */}
          <AnimatePresence initial={false}>
            {!isForgot && (
              <motion.div
                key="password"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5 pb-0.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium text-foreground">{t.login.password}</Label>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={() => goTo("forgot-password")}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {t.login.linkForgot}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={8}
                      required={!isForgot}
                      className="h-11 pr-10"
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <motion.button
            type="submit"
            whileTap={{ scale: 0.98 }}
            disabled={loading}
            className="w-full h-11 bg-primary text-primary-foreground text-sm font-semibold rounded-lg transition-opacity disabled:opacity-50 mt-2"
          >
            {loading
              ? (isForgot ? "Envoi…" : isSignUp ? t.login.btnCreating : t.login.btnSigningIn)
              : (isForgot ? t.login.btnForgot : isSignUp ? t.login.btnSignUp : t.login.btnSignIn)}
          </motion.button>
        </form>

        {/* Footer links */}
        <div className="mt-6 space-y-2 text-center">
          {isForgot ? (
            <button
              type="button"
              onClick={() => goTo("sign-in")}
              className="flex items-center justify-center gap-1.5 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t.login.linkBack}
            </button>
          ) : isSignUp ? (
            <button
              type="button"
              onClick={() => goTo("sign-in")}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.login.linkBack}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goTo("sign-up")}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.login.linkCreate}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
