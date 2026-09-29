import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    // Stripe signature verification using WebCrypto API
    // signature format: t=<timestamp>,v1=<signature>
    const parts = signature.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const signaturePart = parts.find((p) => p.startsWith("v1="));
    if (!timestampPart || !signaturePart) return false;

    const timestamp = timestampPart.split("=")[1];
    const providedSignature = signaturePart.split("=")[1];
    const signedPayload = `${timestamp}.${payload}`;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const computedSignature = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computedSignature !== providedSignature) return false;

    const toleranceMs = 5 * 60 * 1000;
    const ageMs = Math.abs(Date.now() - Number(timestamp) * 1000);
    if (ageMs > toleranceMs) return false;

    return true;
  } catch {
    return false;
  }
}

const TIER_MAP: Record<string, string> = {
  price_1UHTtEP3p25EmYAKBK54T3gP: "black",
  price_1UHTtEP3p25EmYAKS3s5mYZQ: "black_plus",
  price_1UHTtFP3p25EmYAKzOzMjR38: "emerald",
  price_1UHTtFP3p25EmYAKmfTBM6ek: "plum",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Read webhook secret from database (stored securely, only service role can access)
    const { data: secretRow } = await adminClient
      .from("app_secrets")
      .select("value")
      .eq("key", "stripe_webhook_secret")
      .maybeSingle();

    const webhookSecret = secretRow?.value;
    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = await req.text();
    const signature = req.headers.get("Stripe-Signature") ?? "";

    const verified = await verifyStripeSignature(payload, signature, webhookSecret);
    if (!verified) {
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const event = JSON.parse(payload);

    // Record the event for audit
    const extractUserId = (obj: Record<string, unknown>): string | null => {
      const metadata = obj?.metadata as Record<string, unknown> | undefined;
      return (metadata?.supabase_user_id as string) ?? null;
    };

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Record<string, unknown>;
      const userId = extractUserId(session);
      const subscriptionId = session.subscription as string;
      const customerId = session.customer as string;

      if (userId) {
        // Retrieve subscription to get the price
        const subResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
          headers: { "Authorization": `Bearer ${stripeSecretKey}` },
        });
        const subscription = await subResponse.json();
        const priceId = subscription?.items?.data?.[0]?.price?.id;
        const tierId = TIER_MAP[priceId] ?? null;

        if (tierId) {
          await adminClient.from("members").update({
            membership_tier: tierId,
            membership_started_at: new Date().toISOString(),
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            stripe_subscription_status: "active",
          }).eq("id", userId);
        }

        await adminClient.from("stripe_payment_events").insert({
          member_id: userId,
          stripe_event_id: event.id,
          event_type: event.type,
          subscription_id: subscriptionId,
          customer_id: customerId,
          amount_total: session.amount_total ?? null,
          currency: session.currency ?? null,
          tier_id: tierId,
        });
      }
    } else if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Record<string, unknown>;
      const userId = extractUserId(subscription);
      const subscriptionId = subscription.id as string;
      const status = subscription.status as string;

      if (userId) {
        if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
          await adminClient.from("members").update({
            membership_tier: "white",
            membership_started_at: null,
            stripe_subscription_status: status,
          }).eq("id", userId);
        } else {
          await adminClient.from("members").update({
            stripe_subscription_status: status,
          }).eq("id", userId);
        }
      }

      await adminClient.from("stripe_payment_events").insert({
        member_id: userId,
        stripe_event_id: event.id,
        event_type: event.type,
        subscription_id: subscriptionId,
        customer_id: subscription.customer as string,
        tier_id: null,
      });
    } else {
      // Log unhandled events
      const data = event.data?.object as Record<string, unknown> | undefined;
      const userId = data ? extractUserId(data) : null;
      await adminClient.from("stripe_payment_events").insert({
        member_id: userId,
        stripe_event_id: event.id,
        event_type: event.type,
        subscription_id: data?.subscription as string ?? null,
        customer_id: data?.customer as string ?? null,
      });
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
