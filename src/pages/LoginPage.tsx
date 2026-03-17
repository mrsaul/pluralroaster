import { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LoginPageProps {
  onLogin: (role: "client" | "admin") => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      const role = email.includes("admin") ? "admin" : "client";
      onLogin(role);
      setLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        <div className="mb-8">
          <h1 className="text-xl font-medium tracking-tight text-foreground">PluralRoaster</h1>
          <p className="text-sm text-muted-foreground mt-1">Replenish Inventory.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm text-foreground">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="barista@cafe.com"
              required
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm text-foreground">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              required
              className="h-11"
            />
          </div>

          <motion.button
            type="submit"
            whileTap={{ scale: 0.98 }}
            disabled={loading}
            className="w-full h-11 bg-primary text-primary-foreground text-sm font-medium rounded-lg transition-opacity duration-150 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign In"}
          </motion.button>

          <p className="text-xs text-muted-foreground text-center mt-4">
            Use "admin@" email to access admin dashboard
          </p>
        </form>
      </motion.div>
    </div>
  );
}
