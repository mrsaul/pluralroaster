// scripts/generate-vapid-keys.mjs
// Run: node scripts/generate-vapid-keys.mjs
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("=== VAPID Keys (one-time setup) ===");
console.log("");
console.log("Public key (→ .env as VITE_VAPID_PUBLIC_KEY, also in Vercel env):");
console.log(keys.publicKey);
console.log("");
console.log("Private key (→ Supabase secret VAPID_PRIVATE_KEY — NEVER commit this):");
console.log(keys.privateKey);
console.log("");
console.log("Also set VAPID_SUBJECT in Supabase secrets, e.g.: mailto:admin@pluralroaster.com");
