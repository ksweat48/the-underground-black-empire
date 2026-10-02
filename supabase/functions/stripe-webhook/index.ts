import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
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

    const extractUserId = (obj: Record<string, unknown>): string | null => {
      const metadata = obj?.metadata as Record<string, unknown> | undefined;
      return (metadata?.supabase_user_id as string) ?? null;
    };

    // Resolve tier ID from a Stripe price ID by looking up the membership_tiers table
    async function resolveTierFromPrice(priceId: string): Promise<string | null> {
      if (!priceId) return null;
      const { data } = await adminClient
        .from("membership_tiers")
        .select("id")
        .eq("stripe_price_id", priceId)
        .maybeSingle();
      return data?.id ?? null;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Record<string, unknown>;
      const userId = extractUserId(session);
      const subscriptionId = session.subscription as string;
      const customerId = session.customer as string;

      if (userId) {
        const subResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
          headers: { "Authorization": `Bearer ${stripeSecretKey}` },
        });
        const subscription = await subResponse.json();
        const priceId = subscription?.items?.data?.[0]?.price?.id;
        const tierId = await resolveTierFromPrice(priceId);

        if (tierId) {
          await adminClient.from("members").update({
            membership_tier: tierId,
            membership_started_at: new Date().toISOString(),
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            stripe_subscription_status: "active",
          }).eq("id", userId);

          await adminClient.rpc("grant_initial_voting_credits", { p_member_id: userId });
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
    } else if (event.type === "invoice.paid") {
      // Recurring payment — generate commission and treasury allocation
      const invoice = event.data.object as Record<string, unknown>;
      const subscriptionId = invoice.subscription as string;
      const customerId = invoice.customer as string;

      // Skip the first invoice (handled by checkout.session.completed)
      const billingReason = invoice.billing_reason as string;
      if (billingReason === "subscription_create") {
        // First invoice — still generate commission for the initial payment
        // Look up member by subscription ID
        const { data: member } = await adminClient
          .from("members")
          .select("id, membership_tier")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();

        if (member?.id && member.membership_tier !== "white") {
          await adminClient.rpc("generate_partner_commission", {
            p_referred_member_id: member.id,
            p_stripe_event_id: event.id,
            p_tier_id: member.membership_tier,
          });
        }

        await adminClient.from("stripe_payment_events").insert({
          member_id: member?.id ?? null,
          stripe_event_id: event.id,
          event_type: event.type,
          subscription_id: subscriptionId,
          customer_id: customerId,
          amount_total: invoice.amount_paid ?? null,
          currency: invoice.currency ?? null,
          tier_id: member?.membership_tier ?? null,
        });
      } else {
        // Renewal payment — generate commission
        const { data: member } = await adminClient
          .from("members")
          .select("id, membership_tier")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();

        if (member?.id && member.membership_tier !== "white") {
          await adminClient.rpc("generate_partner_commission", {
            p_referred_member_id: member.id,
            p_stripe_event_id: event.id,
            p_tier_id: member.membership_tier,
          });
        }

        await adminClient.from("stripe_payment_events").insert({
          member_id: member?.id ?? null,
          stripe_event_id: event.id,
          event_type: event.type,
          subscription_id: subscriptionId,
          customer_id: customerId,
          amount_total: invoice.amount_paid ?? null,
          currency: invoice.currency ?? null,
          tier_id: member?.membership_tier ?? null,
        });
      }
    } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      // Refund or chargeback — reverse commission
      const charge = event.data.object as Record<string, unknown>;
      const invoiceId = charge.invoice as string;

      // Find the original invoice.paid event to get its stripe_event_id
      if (invoiceId) {
        const { data: originalEvents } = await adminClient
          .from("stripe_payment_events")
          .select("stripe_event_id")
          .eq("subscription_id", (charge as Record<string, unknown>).subscription as string ?? "")
          .eq("event_type", "invoice.paid")
          .order("created_at", { ascending: false })
          .limit(1);

        if (originalEvents?.[0]?.stripe_event_id) {
          await adminClient.rpc("reverse_partner_commission", {
            p_stripe_event_id: originalEvents[0].stripe_event_id,
          });
        }
      }

      const userId = extractUserId(charge);
      await adminClient.from("stripe_payment_events").insert({
        member_id: userId,
        stripe_event_id: event.id,
        event_type: event.type,
        subscription_id: (charge as Record<string, unknown>).subscription as string ?? null,
        customer_id: charge.customer as string ?? null,
        amount_total: charge.amount_refunded ?? charge.amount ?? null,
        currency: charge.currency ?? null,
      });
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
        } else if (status === "active") {
          // Subscription updated with active status — check if price changed
          const priceId = (subscription as Record<string, unknown>).items
            ? ((subscription as Record<string, unknown>).items as Record<string, unknown>)?.data
              ? (((subscription as Record<string, unknown>).items as Record<string, unknown>).data as Array<Record<string, unknown>>)?.[0]?.price
                ? ((((subscription as Record<string, unknown>).items as Record<string, unknown>).data as Array<Record<string, unknown>>)?.[0]?.price as Record<string, unknown>)?.id as string
                : null
              : null
            : null;

          const newTierId = priceId ? await resolveTierFromPrice(priceId) : null;

          if (newTierId) {
            await adminClient.from("members").update({
              membership_tier: newTierId,
              stripe_subscription_status: status,
            }).eq("id", userId);
          } else {
            await adminClient.from("members").update({
              stripe_subscription_status: status,
            }).eq("id", userId);
          }
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
