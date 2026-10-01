import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SITE_URL = "https://theundergroundblackempire.com";

Deno.serve(async (req: Request) => {
  const cors = corsHeaders;

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

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe is not configured" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Get member's Stripe info and current tier
    const { data: member } = await adminClient
      .from("members")
      .select("stripe_customer_id, stripe_subscription_id, stripe_subscription_status, membership_tier, email, display_name")
      .eq("id", user.id)
      .maybeSingle();

    let customerId = member?.stripe_customer_id;

    // Create Stripe customer if needed
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
          "metadata[supabase_user_id]": user.id,
        }),
      });

      if (!customerResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to create Stripe customer" }),
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

    // If member already has an active subscription, switch the price
    // at the next billing cycle instead of creating a new checkout.
    if (
      member?.stripe_subscription_id &&
      member?.stripe_subscription_status === "active" &&
      member?.membership_tier !== "white" &&
      member?.membership_tier !== tierId
    ) {
      const subResponse = await fetch(
        `https://api.stripe.com/v1/subscriptions/${member.stripe_subscription_id}`,
        {
          headers: { "Authorization": `Bearer ${stripeSecretKey}` },
        },
      );
      const subscription = await subResponse.json();

      const currentPriceId = subscription?.items?.data?.[0]?.price?.id;
      const itemId = subscription?.items?.data?.[0]?.id;

      if (!itemId) {
        return new Response(
          JSON.stringify({ error: "Could not retrieve subscription details" }),
          { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      // Update the subscription item with the new price.
      // proration_behavior=none means the change takes effect at the
      // next billing cycle — the member keeps their current tier until then.
      const updateParams = new URLSearchParams();
      updateParams.append("items[0][id]", itemId);
      updateParams.append("items[0][price]", tier.stripe_price_id);
      updateParams.append("proration_behavior", "none");
      updateParams.append("metadata[supabase_user_id]", user.id);
      updateParams.append("metadata[tier_id]", tierId);

      const updateResponse = await fetch(
        `https://api.stripe.com/v1/subscriptions/${member.stripe_subscription_id}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: updateParams,
        },
      );

      if (!updateResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to update subscription" }),
          { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      // The webhook will fire subscription.updated at the billing cycle
      // boundary and update the membership_tier in the database then.
      // Return a redirect to the membership page with a "scheduled" message.
      return new Response(
        JSON.stringify({ url: `${SITE_URL}/membership?checkout=scheduled&tier=${tierId}` }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // No existing active subscription — create a new checkout session
    const checkoutParams = new URLSearchParams({
      customer: customerId,
      "line_items[0][price]": tier.stripe_price_id,
      "line_items[0][quantity]": "1",
      mode: "subscription",
      success_url: `${SITE_URL}/membership?checkout=success&tier=${tierId}`,
      cancel_url: `${SITE_URL}/membership?checkout=cancelled`,
      "metadata[supabase_user_id]": user.id,
      "metadata[tier_id]": tierId,
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
      return new Response(
        JSON.stringify({ error: "Failed to create checkout session" }),
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
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
