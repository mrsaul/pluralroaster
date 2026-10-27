import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KITCHEN_ROLES = ["coffee_manager", "stores_manager", "kitchen_manager"];

// Mirrors validateKitchenAccess in src/components/kitchenAccessForm.ts (small duplication accepted).
function validateKitchen(
  coffeeRole: string,
  kitchen: { role?: string; cafeId?: string } | null | undefined,
): string | null {
  if (kitchen && !KITCHEN_ROLES.includes(kitchen.role ?? "")) return "invalid_kitchen_role";
  if (coffeeRole === "none" && !kitchen) return "needs_some_access";
  if (kitchen && ["roaster", "packaging"].includes(coffeeRole)) return "kitchen_not_for_role";
  if (kitchen?.role === "coffee_manager" && !kitchen.cafeId) return "coffee_manager_needs_cafe";
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// For coffee_manager, the café must be a UUID that exists and is active. Returns an error code or null.
// deno-lint-ignore no-explicit-any
async function checkCafe(adminClient: any, kitchen: { role?: string; cafeId?: string } | null | undefined) {
  if (!kitchen || kitchen.role !== "coffee_manager") return null;
  const id = kitchen.cafeId;
  if (typeof id !== "string" || !UUID_RE.test(id)) return "invalid_cafe";
  const { data } = await adminClient
    .from("kitchen_cafes")
    .select("id")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  return data ? null : "invalid_cafe";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify calling user is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin using their JWT
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "invite") {
      const { email, role, kitchen } = body;
      if (!email || !role) {
        return new Response(JSON.stringify({ error: "Email and role are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const validRoles = ["admin", "user", "roaster", "packaging", "none"];
      if (!validRoles.includes(role)) {
        return new Response(JSON.stringify({ error: `Invalid role: ${role}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const kitchenError = validateKitchen(role, kitchen);
      if (kitchenError) {
        return new Response(JSON.stringify({ error: kitchenError }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cafeError = await checkCafe(adminClient, kitchen);
      if (cafeError) {
        return new Response(JSON.stringify({ error: cafeError }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const upsertKitchenMember = async (userId: string) => {
        if (!kitchen) return null;
        // Callers must have run checkCafe first; this only ever returns an error object.
        const { error } = await adminClient.from("kitchen_members").upsert({
          user_id: userId,
          role: kitchen.role,
          cafe_id: kitchen.role === "coffee_manager" ? kitchen.cafeId : null,
        });
        return error;
      };

      // Invite user via Supabase Admin API
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email);

      if (inviteError) {
        // User might already exist
        if (inviteError.message?.includes("already been registered")) {
          // Find existing user and assign role
          const { data: { users } } = await adminClient.auth.admin.listUsers();
          const existingUser = users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
          if (existingUser) {
            if (role !== "none") {
              // Delete old roles and assign new one
              await adminClient.from("user_roles").delete().eq("user_id", existingUser.id);
              await adminClient.from("user_roles").insert({
                user_id: existingUser.id,
                role,
                status: "active",
                invited_by: caller.id,
                invited_at: new Date().toISOString(),
              });
            }
            const kErr = await upsertKitchenMember(existingUser.id);
            if (kErr) {
              return new Response(JSON.stringify({ error: kErr.message }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            return new Response(JSON.stringify({ success: true, message: "Access updated for existing user" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        return new Response(JSON.stringify({ error: inviteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Assign role to the invited user
      if (inviteData?.user) {
        const kErr = await upsertKitchenMember(inviteData.user.id);
        if (kErr) {
          // Roll back: otherwise the invitee has no role rows and would become a coffee client on first login.
          const { error: delErr } = await adminClient.auth.admin.deleteUser(inviteData.user.id);
          if (delErr) console.error("Rollback deleteUser failed", inviteData.user.id, delErr.message);
          return new Response(JSON.stringify({ error: kErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (role !== "none") {
          await adminClient.from("user_roles").delete().eq("user_id", inviteData.user.id);
          await adminClient.from("user_roles").insert({
            user_id: inviteData.user.id,
            role,
            status: "invited",
            invited_by: caller.id,
            invited_at: new Date().toISOString(),
          });
        }
      }

      return new Response(JSON.stringify({ success: true, userId: inviteData?.user?.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set-kitchen-access") {
      const { userId, kitchen } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (kitchen === null || kitchen === undefined) {
        await adminClient.from("kitchen_members").delete().eq("user_id", userId);
      } else {
        // Coffee role is not changed here; check the kitchen rules against the current one.
        const { data: roleRow } = await adminClient.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
        const kitchenError = validateKitchen(roleRow?.role ?? "none", kitchen);
        if (kitchenError) {
          return new Response(JSON.stringify({ error: kitchenError }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const cafeError = await checkCafe(adminClient, kitchen);
        if (cafeError) {
          return new Response(JSON.stringify({ error: cafeError }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error } = await adminClient.from("kitchen_members").upsert({
          user_id: userId,
          role: kitchen.role,
          cafe_id: kitchen.role === "coffee_manager" ? kitchen.cafeId : null,
        });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list-cafes") {
      const { data, error } = await adminClient
        .from("kitchen_cafes")
        .select("id, name, is_active")
        .order("name");
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cafes = (data ?? []).map((c) => ({ id: c.id, name: c.name, isActive: c.is_active }));
      return new Response(JSON.stringify({ success: true, cafes }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upsert-cafe") {
      const { id, name, isActive } = body;
      const trimmed = typeof name === "string" ? name.trim() : "";
      if (!trimmed) {
        return new Response(JSON.stringify({ error: "Name is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const row: Record<string, unknown> = { name: trimmed, is_active: isActive !== false };
      if (id) row.id = id;
      const { data, error } = await adminClient.from("kitchen_cafes").upsert(row).select("id").single();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, id: data?.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-role") {
      const { userId, role } = body;
      if (!userId || !role) {
        return new Response(JSON.stringify({ error: "userId and role are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("user_roles").delete().eq("user_id", userId);
      await adminClient.from("user_roles").insert({
        user_id: userId,
        role,
        status: "active",
        invited_by: caller.id,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disable") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("user_roles").update({ status: "disabled" }).eq("user_id", userId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "enable") {
      const { userId } = body;
      await adminClient.from("user_roles").update({ status: "active" }).eq("user_id", userId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "remove") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("user_roles").delete().eq("user_id", userId);
      await adminClient.from("kitchen_members").delete().eq("user_id", userId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("user_id, role, status, invited_at, invited_by");

      const { data: kitchenRows } = await adminClient
        .from("kitchen_members")
        .select("user_id, role, cafe_id");
      const kitchenMap = new Map((kitchenRows ?? []).map((k) => [k.user_id, k]));

      const { data: cafeRows } = await adminClient.from("kitchen_cafes").select("id, name");
      const cafeNameMap = new Map((cafeRows ?? []).map((c) => [c.id, c.name]));

      const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r]));
      const userIds = [...new Set([...roleMap.keys(), ...kitchenMap.keys()])];

      // Get profiles for names/emails
      const { data: profiles } = userIds.length > 0
        ? await adminClient.from("profiles").select("id, full_name, email").in("id", userIds)
        : { data: [] };

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      // Get auth users for last sign in
      const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers();
      const authMap = new Map((authUsers ?? []).map((u) => [u.id, u]));

      const result = userIds.map((userId) => {
        const r = roleMap.get(userId);
        const k = kitchenMap.get(userId);
        const profile = profileMap.get(userId);
        const authUser = authMap.get(userId);
        return {
          userId,
          email: profile?.email || authUser?.email || "Unknown",
          fullName: profile?.full_name || null,
          role: r?.role ?? null,
          status: r ? r.status : (authUser?.last_sign_in_at ? "active" : "invited"),
          invitedAt: r?.invited_at ?? null,
          lastSignIn: authUser?.last_sign_in_at || null,
          kitchenRole: k?.role ?? null,
          cafeId: k?.cafe_id ?? null,
          cafeName: k?.cafe_id ? (cafeNameMap.get(k.cafe_id) ?? null) : null,
        };
      });

      return new Response(JSON.stringify({ success: true, users: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "resend-invite") {
      const { email } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: "Email is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email);
      if (inviteError) {
        return new Response(JSON.stringify({ error: inviteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
