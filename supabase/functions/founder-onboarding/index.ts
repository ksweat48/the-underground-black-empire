import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OnboardingRequest {
  action: "create_member" | "select_city";
  email?: string;
  display_name?: string;
  referred_by_code?: string;
  city_id?: string;
}

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

    // Create a client with the user's JWT to identify them
    const userClient = createClient(supabaseUrl, authHeader.replace("Bearer ", ""), {
      auth: { persistSession: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body: OnboardingRequest = await req.json();

    if (body.action === "create_member") {
      // Create member record using the SECURITY DEFINER function
      const { data, error } = await userClient.rpc("create_member", {
        p_email: body.email ?? user.email ?? "",
        p_display_name: body.display_name ?? null,
        p_referred_by_code: body.referred_by_code ?? null,
      });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ member_id: data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.action === "select_city") {
      if (!body.city_id) {
        return new Response(
          JSON.stringify({ error: "city_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Assign founder number using the SECURITY DEFINER function
      const { data: founderNumber, error: assignError } = await userClient.rpc(
        "assign_founder_number",
        { p_city_id: body.city_id },
      );

      if (assignError) {
        return new Response(
          JSON.stringify({ error: assignError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Refresh empire progress after city assignment
      await userClient.rpc("refresh_empire_progress");

      return new Response(
        JSON.stringify({ founder_number: founderNumber }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'create_member' or 'select_city'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
