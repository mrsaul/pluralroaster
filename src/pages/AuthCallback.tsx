import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Handles both auth flows after email confirmation:
//   • PKCE code flow  — URL has ?code=...
//   • Hash/implicit   — URL has #access_token=... (detectSessionInUrl picks it up)
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");

    if (code) {
      // Exchange the one-time code for a session, then hand off to Index.
      supabase.auth.exchangeCodeForSession(code).then(() => {
        navigate("/", { replace: true });
      });
      return;
    }

    // Hash-based flow — Supabase processes the hash automatically because
    // detectSessionInUrl is true. Wait for the session to materialise.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        navigate("/", { replace: true });
      }
    });

    // Handle the case where the event already fired before the listener attached.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 text-sm text-muted-foreground">
      Confirming your email…
    </div>
  );
}
