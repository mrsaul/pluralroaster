import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Mail, ArrowLeft, Coffee, Loader2, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

// Flag key used by Index.tsx to detect the in-app OTP reset flow
export const OTP_FLOW_KEY = "pr_otp_flow";

type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "otp-sent";

// ── 6-digit OTP input ─────────────────────────────────────────────────────────

function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      const next = [...value];
      next[idx] = "";
      onChange(next);
      return;
    }
    // Paste of multiple digits
    if (raw.length > 1) {
      const next = [...value];
      raw.split("").slice(0, 6 - idx).forEach((d, i) => { next[idx + i] = d; });
      onChange(next);
      const focusAt = Math.min(idx + raw.length, 5);
      setTimeout(() => refs.current[focusAt]?.focus(), 0);
      return;
    }
    const next = [...value];
    next[idx] = raw;
    onChange(next);
    if (idx < 5) setTimeout(() => refs.current[idx + 1]?.focus(), 0);
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[idx]) {
        const next = [...value];
        next[idx] = "";
        onChange(next);
      } else if (idx > 0) {
        const next = [...value];
        next[idx - 1] = "";
        onChange(next);
        refs.current[idx - 1]?.focus();
      }
    }
    if (e.key === "ArrowLeft" && idx > 0) refs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = Array(6).fill("");
    pasted.split("").forEach((d, i) => { next[i] = d; });
    onChange(next);
    const focusAt = Math.min(pasted.length, 5);
    setTimeout(() => refs.current[focusAt]?.focus(), 0);
  };

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {Array(6).fill(null).map((_, idx) => (
        <motion.input
          key={idx}
          ref={(el) => { refs.current[idx] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={value[idx]}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: idx * 0.04, duration: 0.18 }}
          className={cn(
            "w-11 h-14 rounded-xl border-2 text-center text-xl font-bold tabular-nums",
            "focus:outline-none transition-all duration-150",
            "disabled:opacity-40",
            value[idx]
              ? "border-primary bg-primary/8 text-foreground shadow-sm shadow-primary/10"
              : "border-border bg-muted/30 text-foreground hover:border-muted-foreground/40",
            "focus:border-primary focus:ring-2 focus:ring-primary/20",
          )}
        />
      ))}
    </div>
  );
}

// ── Resend countdown ──────────────────────────────────────────────────────────

function useResendTimer(active: boolean) {
  const [seconds, setSeconds] = useState(60);
  const canResend = seconds === 0;

  useEffect(() => {
    if (!active) { setSeconds(60); return; }
    setSeconds(60);
    const interval = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) { clearInterval(interval); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);

  const reset = useCallback(() => setSeconds(60), []);

  return { seconds, canResend, reset };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LoginPage() {
  const t = useT();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState(""); // email that received OTP
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OTP state
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(""));
  const [otpVerifying, setOtpVerifying] = useState(false);

  const { seconds: resendSeconds, canResend, reset: resetTimer } = useResendTimer(mode === "otp-sent");

  const goTo = useCallback((next: AuthMode) => {
    setError(null);
    setMode(next);
  }, []);

  // ── Sign in / Sign up ───────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "forgot-password") {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });
        if (otpError) throw otpError;
        setSentEmail(email);
        setOtpDigits(Array(6).fill(""));
        goTo("otp-sent");
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

  // ── OTP verify ──────────────────────────────────────────────────────────────

  const handleOtpVerify = useCallback(async () => {
    const code = otpDigits.join("");
    if (code.length < 6) return;
    setOtpVerifying(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: sentEmail,
        token: code,
        type: "email",
      });
      if (verifyError) throw verifyError;
      // Signal Index.tsx to intercept the resulting session and show set-password
      localStorage.setItem(OTP_FLOW_KEY, "1");
      // onAuthStateChange in Index.tsx fires; loading spinner shows while syncing
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Code incorrect ou expiré.";
      setError(msg);
      setOtpVerifying(false);
    }
  }, [otpDigits, sentEmail]);

  // Auto-verify when all 6 digits filled
  useEffect(() => {
    if (mode === "otp-sent" && otpDigits.every((d) => d.length === 1)) {
      void handleOtpVerify();
    }
  }, [otpDigits, mode, handleOtpVerify]);

  // ── OTP resend ──────────────────────────────────────────────────────────────

  const handleResend = async () => {
    if (!canResend) return;
    setError(null);
    setOtpDigits(Array(6).fill(""));
    resetTimer();
    try {
      await supabase.auth.signInWithOtp({
        email: sentEmail,
        options: { shouldCreateUser: false },
      });
    } catch {
      // Silently ignore — user can retry again
    }
  };

  // ── OTP entry screen ────────────────────────────────────────────────────────

  if (mode === "otp-sent") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          key="otp-sent"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22 }}
          className="w-full max-w-sm"
        >
          {/* Brand */}
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Coffee style={{ width: 18, height: 18 }} className="text-primary" />
            </div>
            <span className="text-base font-semibold tracking-tight text-foreground">PluralRoaster</span>
          </div>

          {/* Icon + heading */}
          <div className="mb-7">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Code de vérification
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Nous avons envoyé un code à 6 chiffres à{" "}
              <span className="font-medium text-foreground">{sentEmail}</span>.
            </p>
          </div>

          {/* OTP boxes */}
          <div className="mb-6">
            <OtpInput value={otpDigits} onChange={setOtpDigits} disabled={otpVerifying} />
          </div>

          {/* Verifying / error */}
          <AnimatePresence mode="wait">
            {otpVerifying ? (
              <motion.div
                key="verifying"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Vérification…
              </motion.div>
            ) : error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive mb-4 text-center"
              >
                {error}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Confirm button (fallback if auto-verify doesn't fire) */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => void handleOtpVerify()}
            disabled={otpDigits.join("").length < 6 || otpVerifying}
            className="w-full h-11 bg-primary text-primary-foreground text-sm font-semibold rounded-lg transition-opacity disabled:opacity-40 mb-4"
          >
            Confirmer le code
          </motion.button>

          {/* Resend + back */}
          <div className="space-y-2 text-center">
            <div className="text-sm">
              {canResend ? (
                <button
                  type="button"
                  onClick={() => void handleResend()}
                  className="text-primary font-medium hover:underline transition-colors"
                >
                  Renvoyer le code
                </button>
              ) : (
                <span className="text-muted-foreground">
                  Renvoyer dans{" "}
                  <span className="font-medium tabular-nums text-foreground">{resendSeconds}s</span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => goTo("forgot-password")}
              className="flex items-center justify-center gap-1.5 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Changer d'adresse email
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Sign-in / Sign-up / Forgot forms ─────────────────────────────────────────

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
              <Coffee className="text-primary" style={{ width: 18, height: 18 }} />
            </div>
            <span className="text-base font-semibold tracking-tight text-foreground">PluralRoaster</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground leading-tight">
            {isForgot ? "Mot de passe oublié ?" : isSignUp ? "Créer un compte" : "Bon retour !"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {isForgot
              ? "Entrez votre email — vous recevrez un code à 6 chiffres."
              : isSignUp
                ? t.login.subtitleSignUp
                : t.login.subtitleSignIn}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full name — sign-up only */}
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
                placeholder="barista@pluralcafe.fr"
                required
                className="h-11 pl-10"
                autoComplete="email"
              />
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Password — hidden in forgot mode */}
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
            className="w-full h-11 flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg transition-opacity disabled:opacity-50 mt-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading
              ? (isForgot ? "Envoi…" : isSignUp ? t.login.btnCreating : t.login.btnSigningIn)
              : (isForgot ? "Envoyer le code" : isSignUp ? t.login.btnSignUp : t.login.btnSignIn)}
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
