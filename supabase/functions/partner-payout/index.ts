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

    // Verify the user is an active partner with an active Connect account
    const { data: partner } = await adminClient
      .from("empire_partners")
      .select("member_id, stripe_connect_account_id, stripe_connect_status, is_active")
      .eq("member_id", user.id)
      .maybeSingle();

    if (!partner || !partner.is_active) {
      return new Response(
        JSON.stringify({ error: "You are not an active partner" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (partner.stripe_connect_status !== "active" || !partner.stripe_connect_account_id) {
      return new Response(
        JSON.stringify({ error: "Your Stripe Connect account must be fully set up before requesting payouts" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check available balance
    const { data: dashboard } = await userClient.rpc("get_partner_dashboard");
    const availableCents = dashboard?.available_cents ?? 0;

    if (availableCents < 10000) {
      return new Response(
        JSON.stringify({ error: `Minimum payout is $100. Your available balance is $${(availableCents / 100).toFixed(2)}.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Calculate net after 3% processing fee
    const feeCents = Math.round(availableCents * 0.03);
    const netCents = availableCents - feeCents;

    // Create a Stripe Transfer to the Connected account
    const transferParams = new URLSearchParams({
      amount: String(netCents),
      currency: "usd",
      destination: partner.stripe_connect_account_id,
      "metadata[partner_id]": user.id,
      "metadata[gross_cents]": String(availableCents),
      "metadata[fee_cents]": String(feeCents),
    });

    const transferResponse = await fetch("https://api.stripe.com/v1/transfers", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: transferParams,
    });

    if (!transferResponse.ok) {
      const errBody = await transferResponse.text();
      console.error("Stripe transfer failed:", errBody);
      return new Response(
        JSON.stringify({ error: "Failed to process payout. Please try again later." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const transfer = await transferResponse.json();

    // Record the payout and mark commissions as paid
    const { data: payoutResult, error: payoutError } = await adminClient.rpc("request_partner_payout", {
      p_partner_id: user.id,
      p_stripe_transfer_id: transfer.id,
    });

    if (payoutError) {
      console.error("Payout recording failed:", payoutError.message);
      return new Response(
        JSON.stringify({ error: "Payout was sent but recording failed. Contact support." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        payout_id: payoutResult?.payout_id,
        gross_cents: availableCents,
        fee_cents: feeCents,
        net_cents: netCents,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
