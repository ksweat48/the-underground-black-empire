import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Missing authorization token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Monthly payout run: Financial Admin only. Partners request payouts in-app; this sends them.
    const { data: allowed, error: roleError } = await userClient.rpc("has_sub_role", { p_sub_role: "financial_admin" });
    if (roleError || allowed !== true) return json({ error: "Not authorized" }, 403);

    const { data: queue, error: queueError } = await adminClient
      .from("partner_payouts")
      .select("id")
      .eq("status", "requested")
      .order("requested_at", { ascending: true })
      .limit(100);
    if (queueError) return json({ error: "Could not load payout requests" }, 500);

    let paid = 0;
    let failed = 0;
    for (const row of queue ?? []) {
      const { data: started, error: startError } = await adminClient.rpc("start_partner_payout", {
        p_payout_id: row.id,
        p_admin_id: user.id,
      });
      if (startError || !started) continue;

      if (!started.partner_active || !started.account_id) {
        await adminClient.rpc("fail_partner_payout", { p_payout_id: row.id, p_reason: "Partner account inactive or payout account missing" });
        failed++;
        continue;
      }

      const transferResponse = await fetch("https://api.stripe.com/v1/transfers", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": `partner-payout-${row.id}`,
        },
        body: new URLSearchParams({
          amount: String(started.net_cents),
          currency: "usd",
          destination: started.account_id,
          "metadata[partner_id]": started.partner_id,
          "metadata[payout_id]": row.id,
          "metadata[gross_cents]": String(started.gross_cents),
          "metadata[fee_cents]": String(started.fee_cents),
        }),
      });

      if (!transferResponse.ok) {
        console.error("Stripe transfer failed", row.id, await transferResponse.text());
        await adminClient.rpc("fail_partner_payout", { p_payout_id: row.id, p_reason: "Transfer was declined by the payment processor" });
        failed++;
        continue;
      }

      const transfer = await transferResponse.json();
      const { error: completeError } = await adminClient.rpc("complete_partner_payout", {
        p_payout_id: row.id,
        p_transfer_id: transfer.id,
      });
      if (completeError) console.error("Payout recorded late", row.id, completeError.message);
      paid++;
    }

    return json({ success: true, processed: (queue ?? []).length, paid, failed });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
