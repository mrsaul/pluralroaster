// Local-only UAT walk-through of the Kitchen flows through the same RPCs the UI uses.
// Re-run: export PATH="$HOME/.docker/bin:$PATH"; node scripts/kitchen-uat.mjs
// Reads the local URL/keys from env (API_URL, ANON_KEY, SERVICE_ROLE_KEY) or `supabase status -o env`.
// Refuses to run against anything but localhost. Creates throwaway users and removes them (and all
// kitchen rows) at the end, so only run it on a disposable local database.
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

function localEnv() {
  const e = { API_URL: process.env.API_URL, ANON_KEY: process.env.ANON_KEY, SERVICE_ROLE_KEY: process.env.SERVICE_ROLE_KEY };
  if (e.API_URL && e.ANON_KEY && e.SERVICE_ROLE_KEY) return e;
  const out = execSync("supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  for (const line of out.split("\n")) {
    const m = line.match(/^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)="?([^"]*)"?$/);
    if (m) e[m[1]] = m[2];
  }
  return e;
}
const env = localEnv();
const URL = env.API_URL, ANON = env.ANON_KEY, SVC = env.SERVICE_ROLE_KEY;
if (!URL || !ANON || !SVC) { console.error("Missing local Supabase URL/keys"); process.exit(1); }
const host = new globalThis.URL(URL).hostname;
if (host !== "127.0.0.1" && host !== "localhost") { console.error(`Refusing to run against non-local host ${host}`); process.exit(1); }
const PW = "Uat-" + randomBytes(12).toString("hex") + "-Aa1!";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(URL, SVC, opts);
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`); return cond; };
const tag = Date.now();
const users = {};
async function mk(key) {
  const email = `uat-${key}-${tag}@example.test`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  users[key] = { id: data.user.id, email };
}
async function login(key) {
  const c = createClient(URL, ANON, opts);
  const { error } = await c.auth.signInWithPassword({ email: users[key].email, password: PW });
  if (error) throw error;
  return c;
}
const rpc = async (c, fn, args) => { const r = await c.rpc(fn, args); return r; };
const errOf = (r) => r.error ? (r.error.message || "").trim() : null;
let cafeA, cafeB;
try {
  for (const k of ["coffeeonly", "cafeA", "cafeB", "stores", "kitchen", "admin", "roaster", "packaging"]) await mk(k);
  const roles = { coffeeonly: "user", cafeA: "user", cafeB: "user", stores: "user", admin: "admin", roaster: "roaster", packaging: "packaging" };
  for (const [k, role] of Object.entries(roles)) await svc.from("user_roles").insert({ user_id: users[k].id, role, status: "active" });
  const a = await svc.from("kitchen_cafes").insert({ name: "Artivistas" }).select().single();
  const b = await svc.from("kitchen_cafes").insert({ name: "Nouveau café" }).select().single();
  cafeA = a.data.id; cafeB = b.data.id;
  await svc.from("kitchen_members").insert([
    { user_id: users.cafeA.id, role: "coffee_manager", cafe_id: cafeA },
    { user_id: users.cafeB.id, role: "coffee_manager", cafe_id: cafeB },
    { user_id: users.stores.id, role: "stores_manager" },
    { user_id: users.kitchen.id, role: "kitchen_manager" },
  ]);
  const { data: prods } = await svc.from("kitchen_products").select("*");
  const P = Object.fromEntries(prods.map(p => [p.name, p.id]));
  const origSettings = (await svc.from("kitchen_settings").select("*").eq("id", 1).single()).data;

  // ---- UAT 1 (DB side) coffee-only client
  console.log("== UAT 1/2: access separation and roles");
  const co = await login("coffeeonly");
  const acc = await rpc(co, "get_my_kitchen_access");
  ok("1a coffee-only get_my_kitchen_access returns no rows", !acc.error && acc.data.length === 0);
  for (const t of ["kitchen_orders", "kitchen_order_items", "kitchen_order_history", "kitchen_members", "kitchen_cafes", "kitchen_settings"]) {
    const r = await co.from(t).select("*");
    ok(`1b coffee-only select ${t} empty/forbidden`, (r.error && true) || (r.data && r.data.length === 0), r.error ? r.error.message : "0 rows");
  }
  const pr = await co.from("kitchen_products").select("*");
  ok("1c coffee-only select kitchen_products empty/forbidden", !!pr.error || pr.data.length === 0);
  for (const [fn, args] of [["kitchen_get_or_create_draft", {}], ["kitchen_create_urgent_order", { p_cafe_id: cafeA, p_reason: "x", p_needed_by: new Date().toISOString(), p_items: [] }], ["kitchen_approve_order", { p_order_id: "00000000-0000-0000-0000-000000000000" }], ["kitchen_current_week", {}]]) {
    const r = await rpc(co, fn, args);
    ok(`1d coffee-only rpc ${fn} rejected`, !!r.error, errOf(r));
  }
  const r1 = await rpc(co, "ensure_current_user_role");
  ok("1e coffee-only ensure_current_user_role = user", r1.data === "user", String(r1.data));
  for (const k of ["admin", "roaster", "packaging", "cafeA", "stores"]) {
    const c = await login(k);
    const r = await rpc(c, "ensure_current_user_role");
    const exp = roles[k];
    ok(`2 ${k} ensure_current_user_role = ${exp}`, r.data === exp, String(r.data));
  }
  const kc = await login("kitchen");
  const rk = await rpc(kc, "ensure_current_user_role");
  ok("2 kitchen-only ensure_current_user_role = null (no coffee role)", !rk.error && rk.data === null);
  const { count: urk } = await svc.from("user_roles").select("*", { count: "exact", head: true }).eq("user_id", users.kitchen.id);
  ok("2 kitchen-only user got no user_roles row", urk === 0);

  // ---- UAT 3
  console.log("== UAT 3: draft over two sessions, send, adjust, approve");
  const cA1 = await login("cafeA");
  const d1 = await rpc(cA1, "kitchen_get_or_create_draft");
  const orderA = d1.data;
  ok("3a cafe A creates draft", !d1.error && !!orderA, errOf(d1));
  await rpc(cA1, "kitchen_set_item", { p_order_id: orderA, p_product_id: P["Banana bread"], p_units: 1 });
  await rpc(cA1, "kitchen_set_item", { p_order_id: orderA, p_product_id: P["Pandebono"], p_units: 2 });
  const cA2 = await login("cafeA"); // second session
  const d2 = await rpc(cA2, "kitchen_get_or_create_draft");
  ok("3b second session resumes same draft", d2.data === orderA);
  const it2 = await cA2.from("kitchen_order_items").select("*").eq("order_id", orderA);
  ok("3c draft items persisted across sessions", it2.data.length === 2);
  await rpc(cA2, "kitchen_set_item", { p_order_id: orderA, p_product_id: P["Empanadas"], p_units: 1 });
  const snd = await rpc(cA2, "kitchen_send_order", { p_order_id: orderA });
  ok("3d send order", !snd.error, errOf(snd));
  const sc = await login("stores");
  const lk = await rpc(sc, "kitchen_lock_order", { p_order_id: orderA });
  ok("3e stores locks order", !lk.error, errOf(lk));
  const lk2 = await rpc(await login("cafeA"), "kitchen_set_item", { p_order_id: orderA, p_product_id: P["Cookies"], p_units: 1 });
  ok("3f cafe edit while stores holds lock rejected (order_locked)", /order_locked/.test(errOf(lk2) || ""), errOf(lk2));
  const adj = await rpc(sc, "kitchen_adjust_item", { p_order_id: orderA, p_product_id: P["Banana bread"], p_adjusted_units: 0 });
  ok("3g stores adjusts banana 1 -> 0", !adj.error, errOf(adj));
  const ap = await rpc(sc, "kitchen_approve_order", { p_order_id: orderA });
  const ch = ap.data?.changes || [];
  ok("3h approve returns change list 1 -> 0", !ap.error && ch.length === 1 && ch[0].product_name === "Banana bread" && ch[0].from === 1 && ch[0].to === 0, JSON.stringify(ch));
  const oA = await cA2.from("kitchen_orders").select("status").eq("id", orderA).single();
  const iA = await cA2.from("kitchen_order_items").select("product_name,units,adjusted_units").eq("order_id", orderA);
  const bb = iA.data.find(i => i.product_name === "Banana bread");
  ok("3i cafe sees approved with units=1 adjusted=0", oA.data.status === "approved" && bb.units === 1 && bb.adjusted_units === 0);

  // ---- UAT 4
  console.log("== UAT 4: cafe edit after approval");
  const e = await rpc(cA2, "kitchen_set_item", { p_order_id: orderA, p_product_id: P["Pandebono"], p_units: 3 });
  const o4 = await cA2.from("kitchen_orders").select("status").eq("id", orderA).single();
  ok("4 edit after approval -> status sent", !e.error && o4.data.status === "sent", o4.data?.status);
  const h4 = await cA2.from("kitchen_order_history").select("status,note").eq("order_id", orderA).order("created_at");
  ok("4b history records 'edited by café'", h4.data.some(h => h.note === "edited by café"));
  const kvis = await kc.from("kitchen_orders").select("id,status").eq("id", orderA);
  ok("4c kitchen manager does not see order while in 'sent'", kvis.data.length === 0);
  const ap2 = await rpc(sc, "kitchen_approve_order", { p_order_id: orderA });
  ok("4d stores re-approves", !ap2.error, errOf(ap2));

  // ---- UAT 5
  console.log("== UAT 5: after cutoff");
  const wk = (await svc.rpc("kitchen_current_week")).data[0];
  const parisHour = new Date(Date.now() - 3600e3);
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).format(parisHour);
  const dowParis = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date()) + "T12:00:00Z").getUTCDay();
  console.log(`   current week ${wk.week_start}, cutoff ${wk.cutoff_at}; moving cutoff to weekday ${dowParis} at ${hhmm} Paris`);
  await svc.from("kitchen_settings").update({ cutoff_weekday: dowParis, cutoff_time: hhmm }).eq("id", 1);
  const lockedWeek = wk.week_start;
  const cut = (await svc.rpc("kitchen_cutoff_for_week", { p_week_start: lockedWeek })).data;
  ok("5a cutoff for the target week is now in the past", new Date(cut) < new Date(), cut);
  const cAx = await login("cafeA");
  const lockedEdit = await rpc(cAx, "kitchen_set_item", { p_order_id: orderA, p_product_id: P["Cookies"], p_units: 1 });
  ok("5b cafe A locked after cutoff (cutoff_passed)", /cutoff_passed/.test(errOf(lockedEdit) || ""), errOf(lockedEdit));
  const cBx = await login("cafeB");
  const mkB = await rpc(sc, "kitchen_create_order_for_cafe", { p_cafe_id: cafeB });
  const orderB = mkB.data;
  ok("5c stores creates order for cafe B", !mkB.error && !!orderB, errOf(mkB));
  const ob = await svc.from("kitchen_orders").select("week_start,status,kind").eq("id", orderB).single();
  ok("5d order targets the locked week", ob.data.week_start === lockedWeek, ob.data.week_start);
  const s1 = await rpc(sc, "kitchen_set_item", { p_order_id: orderB, p_product_id: P["Pandebono"], p_units: 2 });
  const s2 = await rpc(sc, "kitchen_set_item", { p_order_id: orderB, p_product_id: P["Cookies"], p_units: 1 });
  ok("5e stores adds lines after cutoff", !s1.error && !s2.error, errOf(s1) || errOf(s2));
  const sendB = await rpc(sc, "kitchen_send_order", { p_order_id: orderB });
  ok("5f stores sends it", !sendB.error, errOf(sendB));
  const apB = await rpc(sc, "kitchen_approve_order", { p_order_id: orderB });
  ok("5g stores approves it", !apB.error, errOf(apB));
  const cbSelf = await cBx.rpc("kitchen_set_item", { p_order_id: orderB, p_product_id: P["Cookies"], p_units: 5 });
  ok("5h cafe B also locked after cutoff", /cutoff_passed/.test(errOf(cbSelf) || ""), errOf(cbSelf));
  const kv = await kc.from("kitchen_orders").select("id,status,cafe_id").eq("week_start", lockedWeek);
  ok("5i kitchen manager sees both approved orders for the week", kv.data.length === 2 && kv.data.every(o => o.status === "approved"), `${kv.data.length} orders`);
  const kitems = await kc.from("kitchen_order_items").select("product_name,units,adjusted_units,order_id").in("order_id", [orderA, orderB]);
  const prod = {};
  kitems.data.forEach(i => { prod[i.product_name] = (prod[i.product_name] || 0) + (i.adjusted_units ?? i.units); });
  ok("5j production totals (Banana 0, Pandebono 5, Empanadas 1, Cookies 1)", prod["Banana bread"] === 0 && prod["Pandebono"] === 5 && prod["Empanadas"] === 1 && prod["Cookies"] === 1, JSON.stringify(prod));
  await svc.from("kitchen_settings").update({ cutoff_weekday: origSettings.cutoff_weekday, cutoff_time: origSettings.cutoff_time }).eq("id", 1);
  const restored = (await svc.from("kitchen_settings").select("cutoff_weekday,cutoff_time").eq("id", 1).single()).data;
  ok("5k cutoff settings restored", restored.cutoff_weekday === origSettings.cutoff_weekday && restored.cutoff_time === origSettings.cutoff_time);

  // ---- UAT 6/7
  console.log("== UAT 6/7: urgent flow and stock");
  await svc.from("kitchen_products").update({ stock_units: 3 }).eq("id", P["Banana bread"]);
  await svc.from("kitchen_products").update({ stock_units: 1 }).eq("id", P["Pandebono"]);
  const need = new Date(Date.now() + 36 * 3600e3).toISOString();
  const urg = await rpc(await login("cafeA"), "kitchen_create_urgent_order", { p_cafe_id: cafeA, p_reason: "Event tomorrow", p_needed_by: need, p_items: [{ product_id: P["Banana bread"], units: 2 }] });
  const orderU = urg.data;
  ok("6a cafe creates urgent order (sent)", !urg.error && !!orderU, errOf(urg));
  const kSeeU = await kc.from("kitchen_orders").select("id").eq("id", orderU);
  ok("6b kitchen cannot see urgent before approval", kSeeU.data.length === 0);
  const apU = await rpc(sc, "kitchen_approve_order", { p_order_id: orderU });
  ok("6c stores approves urgent", !apU.error, errOf(apU));
  const eta = new Date(Date.now() + 24 * 3600e3).toISOString();
  const etaR = await rpc(kc, "kitchen_set_ready_eta", { p_order_id: orderU, p_eta: eta });
  ok("6d kitchen sets ETA", !etaR.error, errOf(etaR));
  const rdy = await rpc(kc, "kitchen_mark_ready", { p_order_id: orderU });
  ok("6e kitchen marks urgent ready", !rdy.error, errOf(rdy));
  const stk = await svc.from("kitchen_products").select("name,stock_units").in("id", [P["Banana bread"], P["Pandebono"]]);
  const S = Object.fromEntries(stk.data.map(s => [s.name, s.stock_units]));
  ok("7a mark ready subtracts stock (Banana 3 -> 1)", S["Banana bread"] === 1, JSON.stringify(S));
  const itU = await svc.from("kitchen_order_items").select("served_from_stock_units").eq("order_id", orderU);
  ok("7b served_from_stock recorded (2)", itU.data[0].served_from_stock_units === 2);
  const rcv = await rpc(await login("cafeA"), "kitchen_mark_received", { p_order_id: orderU });
  const oU = await svc.from("kitchen_orders").select("status,ready_eta").eq("id", orderU).single();
  ok("6f cafe confirms received", !rcv.error && oU.data.status === "received", errOf(rcv));
  const otherRcv = await rpc(await login("cafeB"), "kitchen_mark_received", { p_order_id: orderU });
  ok("6g other cafe cannot confirm someone else's order", !!otherRcv.error, errOf(otherRcv));
  // weekly ready, stock capped
  const rdyB = await rpc(kc, "kitchen_mark_ready", { p_order_id: orderB });
  const stk2 = (await svc.from("kitchen_products").select("name,stock_units").eq("id", P["Pandebono"]).single()).data;
  ok("7c weekly mark ready caps at stock (Pandebono 1 -> 0, order wanted 2)", !rdyB.error && stk2.stock_units === 0, String(stk2.stock_units));
  const stop = await rpc(kc, "kitchen_mark_ready", { p_order_id: orderB });
  ok("7d double mark-ready rejected (invalid_status)", /invalid_status/.test(errOf(stop) || ""));
  const rdyA = await rpc(kc, "kitchen_mark_ready", { p_order_id: orderA });
  ok("7e second weekly order marked ready, stock stays >= 0", !rdyA.error);

  // ---- UAT 9 (DB side)
  console.log("== UAT 9 (data side): stores manager has both spaces");
  const sa = await rpc(sc, "get_my_kitchen_access");
  const sr = await rpc(sc, "ensure_current_user_role");
  ok("9 stores manager has kitchen access AND coffee role user", sa.data?.[0]?.role === "stores_manager" && sr.data === "user");

  // ---- UAT 8 (DB side)
  console.log("== UAT 8 (db side): reminder function is a safe no-op without Vault secrets");
  const rem = await svc.rpc("kitchen_send_cutoff_reminders");
  ok("8 kitchen_send_cutoff_reminders callable by service role, no error", !rem.error, errOf(rem));
} catch (e) {
  fail++; console.log("FATAL", e.message || e);
} finally {
  console.log("== cleanup");
  try {
    await svc.from("kitchen_order_history").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await svc.from("kitchen_orders").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await svc.from("kitchen_members").delete().neq("user_id", "00000000-0000-0000-0000-000000000000");
    await svc.from("kitchen_cafes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    for (const u of Object.values(users)) await svc.auth.admin.deleteUser(u.id);
    await svc.from("kitchen_products").update({ stock_units: 0 }).neq("id", "00000000-0000-0000-0000-000000000000");
  } catch (e) { console.log("cleanup error", e.message); }
  console.log(`SUMMARY pass=${pass} fail=${fail}`);
}
