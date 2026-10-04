import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SITE_URL = "https://theundergroundblackempire.com";

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

    const body = await req.json();
    const { action } = body;

    // GET PARTNER STATUS
    if (action === "status") {
      const { data: partner } = await adminClient
        .from("empire_partners")
        .select("member_id, stripe_connect_account_id, stripe_connect_status, is_active, joined_at")
        .eq("member_id", user.id)
        .maybeSingle();

      return new Response(
        JSON.stringify({ partner }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // CREATE CONNECT ACCOUNT AND ONBOARDING LINK
    if (action === "onboard") {
      const { data: partner } = await adminClient
        .from("empire_partners")
        .select("stripe_connect_account_id, stripe_connect_status")
        .eq("member_id", user.id)
        .maybeSingle();

      if (!partner) {
        return new Response(
          JSON.stringify({ error: "You must join the Partner program first" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      let connectAccountId = partner.stripe_connect_account_id;

      // Create a new Connect Express account if none exists
      if (!connectAccountId) {
        const { data: member } = await adminClient
          .from("members")
          .select("email, display_name")
          .eq("id", user.id)
          .maybeSingle();

        const accountParams = new URLSearchParams({
          type: "express",
          email: member?.email ?? user.email ?? "",
          "metadata[supabase_user_id]": user.id,
          "capabilities[transfers][requested]": "true",
        });

        const accountResponse = await fetch("https://api.stripe.com/v1/accounts", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: accountParams,
        });

        if (!accountResponse.ok) {
          return new Response(
            JSON.stringify({ error: "Failed to create Connect account" }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const account = await accountResponse.json();
        connectAccountId = account.id;

        await adminClient
          .from("empire_partners")
          .update({
            stripe_connect_account_id: connectAccountId,
            stripe_connect_status: "onboarding",
          })
          .eq("member_id", user.id);
      }

      // Create an Account Link for onboarding
      const linkParams = new URLSearchParams({
        account: connectAccountId!,
        refresh_url: `${SITE_URL}/profile?partner=refresh`,
        return_url: `${SITE_URL}/profile?partner=complete`,
        type: "account_onboarding",
      });

      const linkResponse = await fetch("https://api.stripe.com/v1/account_links", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: linkParams,
      });

      if (!linkResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to create onboarding link" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const link = await linkResponse.json();
      return new Response(
        JSON.stringify({ url: link.url }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // CHECK CONNECT ACCOUNT STATUS (after returning from onboarding)
    if (action === "check_status") {
      const { data: partner } = await adminClient
        .from("empire_partners")
        .select("stripe_connect_account_id")
        .eq("member_id", user.id)
        .maybeSingle();

      if (!partner?.stripe_connect_account_id) {
        return new Response(
          JSON.stringify({ status: "not_connected" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const accountResponse = await fetch(
        `https://api.stripe.com/v1/accounts/${partner.stripe_connect_account_id}`,
        {
          headers: { "Authorization": `Bearer ${stripeSecretKey}` },
        },
      );

      if (!accountResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to check account status" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const account = await accountResponse.json();
      const chargesEnabled = account.charges_enabled === true;
      const payoutsEnabled = account.payouts_enabled === true;
      const detailsSubmitted = account.details_submitted === true;

      const connectStatus = payoutsEnabled && detailsSubmitted
        ? "verified"
        : detailsSubmitted ? "restricted" : "onboarding";

      await adminClient
        .from("empire_partners")
        .update({ stripe_connect_status: connectStatus })
        .eq("member_id", user.id);

      return new Response(
        JSON.stringify({ status: connectStatus, charges_enabled: chargesEnabled, payouts_enabled: payoutsEnabled }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
