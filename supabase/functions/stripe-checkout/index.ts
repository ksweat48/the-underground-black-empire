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

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe is not configured" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    let stripePriceId = tier.stripe_price_id;
    if (!stripePriceId) {
      // Search for an existing recurring price that matches this tier
      const pricesUrl = new URL("https://api.stripe.com/v1/prices");
      pricesUrl.searchParams.set("active", "true");
      pricesUrl.searchParams.set("type", "recurring");
      pricesUrl.searchParams.set("limit", "100");
      pricesUrl.searchParams.append("expand[]", "data.product");

      const pricesResponse = await fetch(pricesUrl, {
        headers: { "Authorization": `Bearer ${stripeSecretKey}` },
      });
      if (!pricesResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Unable to verify Stripe pricing" }),
          { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      const pricesPayload = await pricesResponse.json() as {
        data?: Array<Record<string, unknown>>;
      };
      const expectedAmount = Math.round(Number(tier.price_monthly) * 100);
      const normalizedTierName = tier.display_name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const amountMatches = (pricesPayload.data ?? []).filter((price) => {
        const recurring = price.recurring as Record<string, unknown> | undefined;
        return price.unit_amount === expectedAmount && price.currency === "usd" && recurring?.interval === "month";
      });
      const namedMatches = amountMatches.filter((price) => {
        const product = price.product as Record<string, unknown> | undefined;
        const productName = typeof product?.name === "string"
          ? product.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
          : "";
        const metadata = product?.metadata as Record<string, unknown> | undefined;
        return metadata?.tier_id === tierId || productName.includes(normalizedTierName);
      });
      const matchingPrices = namedMatches.length > 0 ? namedMatches : amountMatches;

      if (matchingPrices.length === 1) {
        stripePriceId = matchingPrices[0].id as string;
      } else {
        // No existing price found — create a product and recurring price for this tier
        const productParams = new URLSearchParams({
          name: tier.display_name,
          "metadata[tier_id]": tierId,
        });

        const productResponse = await fetch("https://api.stripe.com/v1/products", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: productParams,
        });

        if (!productResponse.ok) {
          return new Response(
            JSON.stringify({ error: "Failed to create Stripe product for this tier" }),
            { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
          );
        }

        const product = await productResponse.json();
        const productId = product.id as string;

        const priceParams = new URLSearchParams({
          product: productId,
          currency: "usd",
          "unit_amount": String(expectedAmount),
          "recurring[interval]": "month",
          "metadata[tier_id]": tierId,
        });

        const priceResponse = await fetch("https://api.stripe.com/v1/prices", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: priceParams,
        });

        if (!priceResponse.ok) {
          return new Response(
            JSON.stringify({ error: "Failed to create Stripe price for this tier" }),
            { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
          );
        }

        const priceData = await priceResponse.json();
        stripePriceId = priceData.id as string;
      }

      // Cache the resolved or created price ID back to the database
      await adminClient
        .from("membership_tiers")
        .update({ stripe_price_id: stripePriceId })
        .eq("id", tierId);
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

    if (
      member?.stripe_subscription_id &&
      member?.stripe_subscription_status === "active" &&
      member?.membership_tier === tierId
    ) {
      return new Response(
        JSON.stringify({ error: "You are already on this membership" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Existing paid members switching tiers: upgrades apply now (prorated),
    // downgrades are scheduled for the end of the current billing period.
    if (
      member?.stripe_subscription_id &&
      member?.stripe_subscription_status === "active" &&
      member?.membership_tier !== "white" &&
      member?.membership_tier !== tierId
    ) {
      const subResponse = await fetch(
        `https://api.stripe.com/v1/subscriptions/${member.stripe_subscription_id}`,
        { headers: { "Authorization": `Bearer ${stripeSecretKey}` } },
      );
      const subscription = await subResponse.json();
      const currentPriceId = subscription?.items?.data?.[0]?.price?.id as string | undefined;
      const itemId = subscription?.items?.data?.[0]?.id as string | undefined;

      if (!subResponse.ok || !itemId) {
        return new Response(
          JSON.stringify({ error: "Could not retrieve subscription details" }),
          { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      const { data: tierOrder } = await adminClient
        .from("membership_tiers")
        .select("id, sort_order")
        .in("id", [member.membership_tier, tierId]);
      const rank = (id: string) => tierOrder?.find((t) => t.id === id)?.sort_order ?? 0;
      const isUpgrade = rank(tierId) > rank(member.membership_tier);

      const updateParams = new URLSearchParams();
      updateParams.append("items[0][id]", itemId);
      updateParams.append("items[0][price]", stripePriceId);
      updateParams.append("cancel_at_period_end", "false");
      updateParams.append("metadata[supabase_user_id]", user.id);
      updateParams.append("metadata[tier_id]", tierId);
      if (isUpgrade) {
        updateParams.append("proration_behavior", "always_invoice");
        updateParams.append("payment_behavior", "pending_if_incomplete");
      } else {
        updateParams.append("proration_behavior", "none");
      }

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
          JSON.stringify({ error: isUpgrade ? "Your card could not be charged for the upgrade" : "Failed to update subscription" }),
          { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      await adminClient.from("members").update(
        isUpgrade
          ? { scheduled_tier: null, scheduled_previous_price_id: null, cancel_at_period_end: false }
          : { scheduled_tier: tierId, scheduled_previous_price_id: currentPriceId ?? null, cancel_at_period_end: false },
      ).eq("id", user.id);

      return new Response(
        JSON.stringify({ url: `${SITE_URL}/membership?checkout=${isUpgrade ? "upgraded" : "scheduled"}&tier=${tierId}` }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // No existing active subscription — create a new checkout session
    const checkoutParams = new URLSearchParams({
      customer: customerId,
      "line_items[0][price]": stripePriceId,
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
