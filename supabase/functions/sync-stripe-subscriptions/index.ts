import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SYNC-STRIPE-SUBSCRIPTIONS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Pegar dados do request (opcional para sincronizar usuário específico)
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const targetEmail = body.email || body.user_email;
    const targetCustomerId = body.customer_id;

    let users;
    if (targetEmail) {
      // Sincronizar apenas um usuário específico por email
      const { data: userData, error: userError } = await supabaseClient
        .from("users")
        .select("id, email, stripe_customer_id, subscription_tier, subscribed")
        .eq("email", targetEmail)
        .single();

      if (userError) {
        throw new Error(`Error fetching user: ${userError.message}`);
      }
      users = [userData];
      logStep("Syncing specific user by email", { email: targetEmail });
    } else if (targetCustomerId) {
      // Sincronizar apenas um usuário específico por customer_id
      const { data: userData, error: userError } = await supabaseClient
        .from("users")
        .select("id, email, stripe_customer_id, subscription_tier, subscribed")
        .eq("stripe_customer_id", targetCustomerId)
        .single();

      if (userError) {
        throw new Error(`Error fetching user: ${userError.message}`);
      }
      users = [userData];
      logStep("Syncing specific user by customer_id", { customerId: targetCustomerId });
    } else {
      // Sincronizar todos os usuários que têm stripe_customer_id
      const { data: usersData, error: usersError } = await supabaseClient
        .from("users")
        .select("id, email, stripe_customer_id, subscription_tier, subscribed")
        .not("stripe_customer_id", "is", null)
        .order('created_at', { ascending: false });

      if (usersError) {
        throw new Error(`Error fetching users: ${usersError.message}`);
      }
      users = usersData || [];
      logStep("Syncing all users with Stripe customer ID", { count: users.length });
    }

    let syncedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        logStep("Processing user", { 
          email: user.email, 
          stripeId: user.stripe_customer_id,
          currentTier: user.subscription_tier 
        });

        if (!user.stripe_customer_id) {
          logStep("User has no Stripe customer ID, skipping", { email: user.email });
          continue;
        }

        // Buscar subscriptions ativas do cliente no Stripe
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripe_customer_id,
          status: 'all',
          limit: 10
        });

        logStep("Found subscriptions", { 
          email: user.email, 
          count: subscriptions.data.length 
        });

        // Verificar se há alguma subscription ativa
        const activeSubscription = subscriptions.data.find(sub => 
          sub.status === 'active' || sub.status === 'trialing'
        );

        let updateData;
        if (activeSubscription) {
          // Usuário tem subscription ativa
          const subscriptionEnd = activeSubscription.current_period_end 
            ? new Date(activeSubscription.current_period_end * 1000).toISOString()
            : null;

          updateData = {
            subscribed: true,
            subscription_tier: "Premium",
            subscription_end: subscriptionEnd,
            updated_at: new Date().toISOString()
          };

          logStep("Found active subscription", {
            email: user.email,
            subscriptionId: activeSubscription.id,
            status: activeSubscription.status,
            currentPeriodEnd: subscriptionEnd
          });
        } else {
          // Usuário não tem subscription ativa
          updateData = {
            subscribed: false,
            subscription_tier: "Free",
            subscription_end: null,
            updated_at: new Date().toISOString()
          };

          logStep("No active subscription found", { email: user.email });
        }

        // Atualizar o usuário no Supabase
        const { error: updateError } = await supabaseClient
          .from("users")
          .update(updateData)
          .eq("id", user.id);

        if (updateError) {
          logStep("Error updating user", { 
            email: user.email, 
            error: updateError.message 
          });
          errorCount++;
        } else {
          logStep("User updated successfully", { 
            email: user.email, 
            newTier: updateData.subscription_tier,
            subscribed: updateData.subscribed
          });
          updatedCount++;
        }

        syncedCount++;
      } catch (userError) {
        logStep("Error processing user", { 
          email: user.email, 
          error: userError instanceof Error ? userError.message : String(userError)
        });
        errorCount++;
      }

      // Pequena pausa para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logStep("Sync completed", { 
      syncedCount, 
      updatedCount,
      errorCount
    });

    return new Response(JSON.stringify({ 
      success: true,
      message: `Successfully synced ${syncedCount} users`,
      stats: {
        total_processed: syncedCount,
        users_updated: updatedCount,
        errors: errorCount
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});