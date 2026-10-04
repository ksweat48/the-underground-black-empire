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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Missing authorization token" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
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

    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    let action = "cancel";
    try {
      const body = await req.json();
      if (typeof body?.action === "string") action = body.action;
    } catch {
      // empty body means cancel
    }
    if (!["cancel", "undo_cancel", "undo_downgrade", "update_card"].includes(action)) {
      return json({ error: "Invalid action" }, 400);
    }

    const { data: member, error: memberError } = await adminClient
      .from("members")
      .select("stripe_customer_id, stripe_subscription_id, stripe_subscription_status, membership_tier, scheduled_tier, scheduled_previous_price_id")
      .eq("id", user.id)
      .maybeSingle();

    if (memberError || !member) return json({ error: "Member not found" }, 404);

    const stripePost = (path: string, params: URLSearchParams) =>
      fetch(`https://api.stripe.com/v1/${path}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });

    if (action === "update_card") {
      if (!member.stripe_customer_id) return json({ error: "No billing account found" }, 400);
      const origin = req.headers.get("Origin");
      const returnUrl = `${ALLOWED_ORIGINS.includes(origin ?? "") ? origin : ALLOWED_ORIGINS[0]}/membership`;
      const portal = await stripePost("billing_portal/sessions", new URLSearchParams({
        customer: member.stripe_customer_id,
        return_url: returnUrl,
      }));
      if (!portal.ok) return json({ error: "Could not open billing settings" }, 502);
      const session = await portal.json();
      return json({ url: session.url });
    }

    // Members without a live subscription are simply moved to White.
    if (!member.stripe_subscription_id || !["active", "past_due"].includes(member.stripe_subscription_status ?? "")) {
      if (action !== "cancel") return json({ error: "No active subscription" }, 400);
      const { error: updateError } = await adminClient.from("members").update({
        membership_tier: "white",
        membership_started_at: null,
        good_standing_since: null,
        past_due_since: null,
        scheduled_tier: null,
        scheduled_previous_price_id: null,
        cancel_at_period_end: false,
      }).eq("id", user.id);
      if (updateError) return json({ error: "Failed to update membership" }, 500);
      return json({ success: true, tier: "white" });
    }

    const subPath = `subscriptions/${member.stripe_subscription_id}`;

    if (action === "undo_downgrade") {
      if (!member.scheduled_tier || !member.scheduled_previous_price_id) {
        return json({ error: "No scheduled change to undo" }, 400);
      }
      const subRes = await fetch(`https://api.stripe.com/v1/${subPath}`, {
        headers: { "Authorization": `Bearer ${stripeSecretKey}` },
      });
      const sub = await subRes.json();
      const itemId = sub?.items?.data?.[0]?.id;
      if (!subRes.ok || !itemId) return json({ error: "Could not load subscription" }, 502);
      const params = new URLSearchParams();
      params.append("items[0][id]", itemId);
      params.append("items[0][price]", member.scheduled_previous_price_id);
      params.append("proration_behavior", "none");
      params.append("metadata[tier_id]", member.membership_tier);
      const res = await stripePost(subPath, params);
      if (!res.ok) return json({ error: "Could not undo the scheduled change" }, 502);
      await adminClient.from("members")
        .update({ scheduled_tier: null, scheduled_previous_price_id: null })
        .eq("id", user.id);
      return json({ success: true });
    }

    const cancelling = action === "cancel";
    const res = await stripePost(subPath, new URLSearchParams({ cancel_at_period_end: String(cancelling) }));
    if (!res.ok) return json({ error: cancelling ? "Failed to cancel subscription" : "Could not undo cancellation" }, 502);
    const sub = await res.json();

    const periodEndSec = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
    const periodEnd = periodEndSec ? new Date(periodEndSec * 1000).toISOString() : null;

    await adminClient.from("members").update({
      cancel_at_period_end: cancelling,
      current_period_end: periodEnd,
    }).eq("id", user.id);

    return json({ success: true, cancel_at_period_end: cancelling, period_end: periodEnd });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
