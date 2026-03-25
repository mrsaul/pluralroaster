import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
      const { email, role } = body;
      if (!email || !role) {
        return new Response(JSON.stringify({ error: "Email and role are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const validRoles = ["admin", "user", "roaster", "packaging"];
      if (!validRoles.includes(role)) {
        return new Response(JSON.stringify({ error: `Invalid role: ${role}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Invite user via Supabase Admin API
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email);

      if (inviteError) {
        // User might already exist
        if (inviteError.message?.includes("already been registered")) {
          // Find existing user and assign role
          const { data: { users } } = await adminClient.auth.admin.listUsers();
          const existingUser = users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
          if (existingUser) {
            // Delete old roles and assign new one
            await adminClient.from("user_roles").delete().eq("user_id", existingUser.id);
            await adminClient.from("user_roles").insert({
              user_id: existingUser.id,
              role,
              status: "active",
              invited_by: caller.id,
              invited_at: new Date().toISOString(),
            });
            return new Response(JSON.stringify({ success: true, message: "Role updated for existing user" }), {
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
        await adminClient.from("user_roles").delete().eq("user_id", inviteData.user.id);
        await adminClient.from("user_roles").insert({
          user_id: inviteData.user.id,
          role,
          status: "invited",
          invited_by: caller.id,
          invited_at: new Date().toISOString(),
        });
      }

      return new Response(JSON.stringify({ success: true, userId: inviteData?.user?.id }), {
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

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("user_id, role, status, invited_at, invited_by");

      const userIds = [...new Set((roles ?? []).map((r) => r.user_id))];
      
      // Get profiles for names/emails
      const { data: profiles } = userIds.length > 0
        ? await adminClient.from("profiles").select("id, full_name, email").in("id", userIds)
        : { data: [] };
      
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      // Get auth users for last sign in
      const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers();
      const authMap = new Map((authUsers ?? []).map((u) => [u.id, u]));

      const result = (roles ?? []).map((r) => {
        const profile = profileMap.get(r.user_id);
        const authUser = authMap.get(r.user_id);
        return {
          userId: r.user_id,
          email: profile?.email || authUser?.email || "Unknown",
          fullName: profile?.full_name || null,
          role: r.role,
          status: r.status,
          invitedAt: r.invited_at,
          lastSignIn: authUser?.last_sign_in_at || null,
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
