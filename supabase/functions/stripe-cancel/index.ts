import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGINS = [
  "https://theundergroundblackempire.com",
  "https://the-underground-black-empire.netlify.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, authHeader.replace("Bearer ", ""), {
      auth: { persistSession: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe is not configured" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Get the member's Stripe subscription ID
    const { data: member, error: memberError } = await adminClient
      .from("members")
      .select("stripe_subscription_id, stripe_subscription_status, membership_tier")
      .eq("id", user.id)
      .maybeSingle();

    if (memberError || !member) {
      return new Response(
        JSON.stringify({ error: "Member not found" }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // If they already have no active subscription, just set tier to white
    if (!member.stripe_subscription_id || member.stripe_subscription_status !== "active") {
      const { error: rpcError } = await userClient.rpc("change_membership_tier", {
        target_tier: "white",
      });
      if (rpcError) {
        return new Response(
          JSON.stringify({ error: "Failed to downgrade membership" }),
          { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ success: true, tier: "white" }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Cancel the Stripe subscription immediately
    const cancelResponse = await fetch(
      `https://api.stripe.com/v1/subscriptions/${member.stripe_subscription_id}`,
      {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    if (!cancelResponse.ok) {
      const errBody = await cancelResponse.text();
      return new Response(
        JSON.stringify({ error: "Failed to cancel subscription" }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // The Stripe webhook will fire subscription.deleted and set the tier
    // to white. But we also set it immediately for instant feedback.
    const { error: rpcError } = await userClient.rpc("change_membership_tier", {
      target_tier: "white",
    });
    if (rpcError) {
      // The webhook will handle it, so don't fail the request
      console.error("RPC change_membership_tier failed:", rpcError.message);
    }

    return new Response(
      JSON.stringify({ success: true, tier: "white" }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
