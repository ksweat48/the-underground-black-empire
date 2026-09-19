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

const SITE_URL = "https://theundergroundblackempire.com";

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

    const body = await req.json();
    const { tierId } = body;

    if (!tierId || typeof tierId !== "string") {
      return new Response(
        JSON.stringify({ error: "tierId is required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Look up the tier and its Stripe price
    const { data: tier, error: tierError } = await adminClient
      .from("membership_tiers")
      .select("id, display_name, stripe_price_id, price_monthly")
      .eq("id", tierId)
      .maybeSingle();

    if (tierError || !tier) {
      return new Response(
        JSON.stringify({ error: "Invalid membership tier" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    if (!tier.stripe_price_id) {
      return new Response(
        JSON.stringify({ error: "This tier does not require payment" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Get or create Stripe customer
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe is not configured" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Check if member already has a Stripe customer ID
    const { data: member } = await adminClient
      .from("members")
      .select("stripe_customer_id, email, display_name")
      .eq("id", user.id)
      .maybeSingle();

    let customerId = member?.stripe_customer_id;

    if (!customerId) {
      const customerResponse = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          email: user.email ?? "",
          name: member?.display_name ?? "",
          metadata: { supabase_user_id: user.id },
        }),
      });

      if (!customerResponse.ok) {
        const errBody = await customerResponse.text();
        return new Response(
          JSON.stringify({ error: "Failed to create Stripe customer", details: errBody }),
          { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      const customer = await customerResponse.json();
      customerId = customer.id;

      await adminClient
        .from("members")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Create Stripe Checkout session for subscription
    const checkoutParams = new URLSearchParams({
      customer: customerId,
      "line_items[0][price]": tier.stripe_price_id,
      "line_items[0][quantity]": "1",
      mode: "subscription",
      success_url: `${SITE_URL}/membership?checkout=success&tier=${tierId}`,
      cancel_url: `${SITE_URL}/membership?checkout=cancelled`,
      metadata: JSON.stringify({ supabase_user_id: user.id, tier_id: tierId }),
      "subscription_data[metadata][supabase_user_id]": user.id,
      "subscription_data[metadata][tier_id]": tierId,
    });

    const checkoutResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: checkoutParams,
    });

    if (!checkoutResponse.ok) {
      const errBody = await checkoutResponse.text();
      return new Response(
        JSON.stringify({ error: "Failed to create checkout session", details: errBody }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const session = await checkoutResponse.json();

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
