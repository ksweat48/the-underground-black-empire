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

    // Already handled: acknowledge so Stripe stops retrying.
    const { data: seen, error: seenError } = await adminClient
      .from("stripe_payment_events")
      .select("id")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    if (seenError) throw seenError;
    if (seen) {
      return new Response(
        JSON.stringify({ received: true, duplicate: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const must = async <T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> => {
      const { data, error } = await p;
      if (error) throw error;
      return data;
    };

    const stripeGet = async (path: string) => {
      const res = await fetch(`https://api.stripe.com/v1/${path}`, {
        headers: { "Authorization": `Bearer ${stripeSecretKey}` },
      });
      if (!res.ok) throw new Error(`Stripe GET ${path.split("?")[0]} failed: ${res.status}`);
      return await res.json();
    };

    const extractUserId = (obj: Record<string, unknown>): string | null => {
      const metadata = obj?.metadata as Record<string, unknown> | undefined;
      return (metadata?.supabase_user_id as string) ?? null;
    };

    const tierCache = new Map<string, { id: string; sort_order: number } | null>();
    async function resolveTierFromPrice(priceId: string | null | undefined) {
      if (!priceId) return null;
      if (tierCache.has(priceId)) return tierCache.get(priceId)!;
      const data = await must(adminClient
        .from("membership_tiers")
        .select("id, sort_order")
        .eq("stripe_price_id", priceId)
        .maybeSingle());
      tierCache.set(priceId, data ?? null);
      return data ?? null;
    }

    async function tierRank(tierId: string) {
      const data = await must(adminClient.from("membership_tiers").select("sort_order").eq("id", tierId).maybeSingle());
      return data?.sort_order ?? 0;
    }

    const isoFromUnix = (sec: unknown) => typeof sec === "number" ? new Date(sec * 1000).toISOString() : null;

    const subPriceId = (sub: Record<string, unknown>) =>
      ((sub.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data?.[0]?.price?.id) ?? null;

    const subPeriodEnd = (sub: Record<string, unknown>) =>
      isoFromUnix(sub.current_period_end ??
        (sub.items as { data?: Array<{ current_period_end?: number }> } | undefined)?.data?.[0]?.current_period_end);

    async function findMember(subscriptionId?: string | null, customerId?: string | null, userId?: string | null) {
      const cols = "id, membership_tier, scheduled_tier, good_standing_since, past_due_since";
      if (userId) {
        const m = await must(adminClient.from("members").select(cols).eq("id", userId).maybeSingle());
        if (m) return m;
      }
      if (subscriptionId) {
        const m = await must(adminClient.from("members").select(cols).eq("stripe_subscription_id", subscriptionId).maybeSingle());
        if (m) return m;
      }
      if (customerId) {
        const m = await must(adminClient.from("members").select(cols).eq("stripe_customer_id", customerId).maybeSingle());
        if (m) return m;
      }
      return null;
    }

    async function notify(memberId: string, type: string, title: string, body: string) {
      await must(adminClient.from("notifications").insert({
        member_id: memberId, type, title, body, link_url: "/membership",
      }));
    }

    const record: Record<string, unknown> = { stripe_event_id: event.id, event_type: event.type };

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Record<string, unknown>;
      const userId = extractUserId(session);
      const subscriptionId = session.subscription as string;
      const customerId = session.customer as string;
      Object.assign(record, {
        member_id: userId, subscription_id: subscriptionId, customer_id: customerId,
        amount_total: session.amount_total ?? null, currency: session.currency ?? null,
      });

      if (userId && subscriptionId) {
        const subscription = await stripeGet(`subscriptions/${subscriptionId}`);
        const tier = await resolveTierFromPrice(subPriceId(subscription));
        record.tier_id = tier?.id ?? null;

        if (tier) {
          const member = await findMember(null, null, userId);
          const oldTier = member?.membership_tier ?? "white";
          const now = new Date().toISOString();
          await must(adminClient.from("members").update({
            membership_tier: tier.id,
            membership_started_at: now,
            good_standing_since: member?.good_standing_since ?? now,
            past_due_since: null,
            cancel_at_period_end: false,
            scheduled_tier: null,
            scheduled_previous_price_id: null,
            current_period_end: subPeriodEnd(subscription),
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            stripe_subscription_status: "active",
          }).eq("id", userId));

          if (oldTier === "white") {
            await must(adminClient.rpc("grant_initial_voting_credits", { p_member_id: userId }));
          } else {
            await must(adminClient.rpc("grant_upgrade_voting_credits", {
              p_member_id: userId, p_old_tier: oldTier, p_new_tier: tier.id,
            }));
          }
        }
      }
    } else if (event.type === "invoice.paid") {
      const invoice = event.data.object as Record<string, unknown>;
      const subscriptionId = (invoice.subscription as string) ??
        ((invoice.parent as Record<string, unknown> | undefined)?.subscription_details as Record<string, unknown> | undefined)?.subscription as string ?? null;
      const customerId = invoice.customer as string;
      const amountPaid = (invoice.amount_paid as number) ?? 0;
      const chargeId = (invoice.charge as string) ?? null;

      const member = await findMember(subscriptionId, customerId, null);

      const line = (invoice.lines as { data?: Array<Record<string, unknown>> } | undefined)?.data?.slice(-1)[0];
      const linePriceId = (line?.price as { id?: string } | undefined)?.id ??
        ((line?.pricing as Record<string, unknown> | undefined)?.price_details as { price?: string } | undefined)?.price ?? null;
      const lineTier = await resolveTierFromPrice(linePriceId);
      const periodEnd = isoFromUnix((line?.period as { end?: number } | undefined)?.end);

      let feeCents = 0;
      if (chargeId && amountPaid > 0) {
        const charge = await stripeGet(`charges/${chargeId}?expand[]=balance_transaction`);
        feeCents = Number(charge?.balance_transaction?.fee ?? 0);
      }

      let effectiveTier = member?.membership_tier ?? null;
      if (member) {
        const updates: Record<string, unknown> = {
          past_due_since: null,
          stripe_subscription_status: "active",
        };
        if (periodEnd) updates.current_period_end = periodEnd;

        if (lineTier && lineTier.id !== member.membership_tier &&
          (member.scheduled_tier === lineTier.id || member.membership_tier === "white")) {
          updates.membership_tier = lineTier.id;
          updates.scheduled_tier = null;
          updates.scheduled_previous_price_id = null;
          if (member.membership_tier === "white") {
            updates.membership_started_at = new Date().toISOString();
            updates.good_standing_since = new Date().toISOString();
          }
          effectiveTier = lineTier.id;
        }
        await must(adminClient.from("members").update(updates).eq("id", member.id));

        if (member.past_due_since) {
          await notify(member.id, "membership_payment_recovered", "Payment received",
            "Thanks for updating your card. Your membership is back in good standing.");
        }
        if (member.membership_tier === "white" && effectiveTier && effectiveTier !== "white") {
          await must(adminClient.rpc("grant_initial_voting_credits", { p_member_id: member.id }));
        }

        if (effectiveTier && effectiveTier !== "white" && amountPaid > 0) {
          await must(adminClient.rpc("generate_partner_commission", {
            p_referred_member_id: member.id,
            p_stripe_event_id: event.id,
            p_tier_id: effectiveTier,
            p_net_collected_cents: amountPaid - feeCents,
            p_stripe_fee_cents: feeCents,
          }));
        }
      }

      Object.assign(record, {
        member_id: member?.id ?? null, subscription_id: subscriptionId, customer_id: customerId,
        invoice_id: (invoice.id as string) ?? null, charge_id: chargeId,
        amount_total: amountPaid, currency: invoice.currency ?? null, tier_id: effectiveTier,
      });
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Record<string, unknown>;
      const subscriptionId = (invoice.subscription as string) ?? null;
      const customerId = invoice.customer as string;
      const member = await findMember(subscriptionId, customerId, null);

      if (member && member.membership_tier !== "white") {
        await must(adminClient.from("members").update({
          past_due_since: member.past_due_since ?? new Date().toISOString(),
          stripe_subscription_status: "past_due",
        }).eq("id", member.id));
        if (!member.past_due_since) {
          await notify(member.id, "membership_past_due", "Update your card to keep your membership",
            "We could not process your membership payment. Update your card within 7 days to keep your benefits.");
        }
      }
      Object.assign(record, {
        member_id: member?.id ?? null, subscription_id: subscriptionId, customer_id: customerId,
        invoice_id: (invoice.id as string) ?? null, amount_total: invoice.amount_due ?? null,
        currency: invoice.currency ?? null,
      });
    } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      const obj = event.data.object as Record<string, unknown>;
      const isDispute = event.type === "charge.dispute.created";
      const chargeId = (isDispute ? obj.charge : obj.id) as string | undefined;
      const invoiceId = isDispute ? undefined : (obj.invoice as string | undefined);
      const customerId = (obj.customer as string | undefined) ?? null;

      const findOriginal = async (column: "invoice_id" | "charge_id", value: string) => {
        const data = await must(adminClient
          .from("stripe_payment_events")
          .select("stripe_event_id, member_id, subscription_id")
          .eq(column, value)
          .eq("event_type", "invoice.paid")
          .order("created_at", { ascending: false })
          .limit(1));
        return (data as Array<{ stripe_event_id: string; member_id: string | null; subscription_id: string | null }>)?.[0] ?? null;
      };

      let original = chargeId ? await findOriginal("charge_id", chargeId) : null;
      if (!original && invoiceId) original = await findOriginal("invoice_id", invoiceId);

      // amount_refunded is cumulative on the charge; disputes claw back the disputed amount.
      const totalReversed = Number(isDispute ? obj.amount : obj.amount_refunded) || 0;

      if (original?.stripe_event_id && totalReversed > 0) {
        await must(adminClient.rpc("apply_payment_refund", {
          p_original_event_id: original.stripe_event_id,
          p_refund_event_id: event.id,
          p_total_refunded_cents: totalReversed,
        }));
      } else {
        console.error("No original payment found for reversal", event.id);
      }

      Object.assign(record, {
        member_id: original?.member_id ?? extractUserId(obj),
        subscription_id: original?.subscription_id ?? null,
        customer_id: customerId, invoice_id: invoiceId ?? null, charge_id: chargeId ?? null,
        amount_total: totalReversed, currency: obj.currency ?? null,
      });
    } else if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Record<string, unknown>;
      const subscriptionId = subscription.id as string;
      const status = subscription.status as string;
      const member = await findMember(subscriptionId, subscription.customer as string, extractUserId(subscription));
      const ended = event.type === "customer.subscription.deleted" ||
        ["canceled", "unpaid", "incomplete_expired"].includes(status);

      if (member) {
        if (ended) {
          await must(adminClient.from("members").update({
            membership_tier: "white",
            membership_started_at: null,
            good_standing_since: null,
            past_due_since: null,
            cancel_at_period_end: false,
            scheduled_tier: null,
            scheduled_previous_price_id: null,
            stripe_subscription_status: status,
          }).eq("id", member.id));
          if (member.membership_tier !== "white") {
            await notify(member.id, "membership_ended", "Your paid membership has ended",
              "You are now a White member. You can rejoin a paid tier at any time.");
          }
        } else {
          const updates: Record<string, unknown> = {
            stripe_subscription_status: status,
            cancel_at_period_end: subscription.cancel_at_period_end === true,
          };
          const periodEnd = subPeriodEnd(subscription);
          if (periodEnd) updates.current_period_end = periodEnd;

          const newTier = status === "active" ? await resolveTierFromPrice(subPriceId(subscription)) : null;
          const isScheduledDowngrade = newTier && member.scheduled_tier === newTier.id;
          if (newTier && newTier.id !== member.membership_tier && !isScheduledDowngrade && member.membership_tier !== "white") {
            updates.membership_tier = newTier.id;
            updates.scheduled_tier = null;
            updates.scheduled_previous_price_id = null;
            if (newTier.sort_order > await tierRank(member.membership_tier)) {
              await must(adminClient.rpc("grant_upgrade_voting_credits", {
                p_member_id: member.id, p_old_tier: member.membership_tier, p_new_tier: newTier.id,
              }));
            }
          }
          await must(adminClient.from("members").update(updates).eq("id", member.id));
        }
      }

      Object.assign(record, {
        member_id: member?.id ?? null, subscription_id: subscriptionId,
        customer_id: subscription.customer as string,
      });
    } else {
      const data = event.data?.object as Record<string, unknown> | undefined;
      Object.assign(record, {
        member_id: data ? extractUserId(data) : null,
        subscription_id: (data?.subscription as string) ?? null,
        customer_id: (data?.customer as string) ?? null,
      });
    }

    const { error: recordError } = await adminClient.from("stripe_payment_events").insert(record);
    if (recordError && (recordError as { code?: string }).code !== "23505") throw recordError;

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("stripe-webhook failed", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
