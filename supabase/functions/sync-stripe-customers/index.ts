import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SYNC-STRIPE-CUSTOMERS] ${step}${detailsStr}`);
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

    // Buscar todos os usuários do Supabase
    const { data: users, error: usersError } = await supabaseClient
      .from("users")
      .select("id, email, stripe_customer_id, subscription_tier")
      .order('created_at', { ascending: false });

    if (usersError) {
      throw new Error(`Error fetching users: ${usersError.message}`);
    }

    logStep("Found users in database", { count: users?.length });

    let syncedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let subscriptionsSynced = 0;

    if (users && users.length > 0) {
      for (const user of users) {
        try {
          logStep("Processing user", { email: user.email, hasStripeId: !!user.stripe_customer_id });

          let stripeCustomerId = user.stripe_customer_id;

          // Verificar se o usuário já tem stripe_customer_id
          if (!stripeCustomerId) {
            // Procurar cliente existente no Stripe por email
            const existingCustomers = await stripe.customers.list({
              email: user.email,
              limit: 1,
            });

            if (existingCustomers.data.length > 0) {
              // Cliente já existe no Stripe, atualizar o ID no Supabase
              const stripeCustomer = existingCustomers.data[0];
              stripeCustomerId = stripeCustomer.id;
              
              logStep("Found existing Stripe customer", { 
                email: user.email, 
                stripeId: stripeCustomer.id 
              });

              const { error: updateError } = await supabaseClient
                .from("users")
                .update({ stripe_customer_id: stripeCustomer.id })
                .eq("id", user.id);

              if (updateError) {
                logStep("Error updating user with Stripe ID", updateError);
              } else {
                updatedCount++;
              }
            } else {
              // Criar novo cliente no Stripe
              logStep("Creating new Stripe customer", { email: user.email });
              
              const newCustomer = await stripe.customers.create({
                email: user.email,
                metadata: {
                  supabase_user_id: user.id,
                },
              });

              stripeCustomerId = newCustomer.id;

              // Atualizar o usuário no Supabase com o novo stripe_customer_id
              const { error: updateError } = await supabaseClient
                .from("users")
                .update({ stripe_customer_id: newCustomer.id })
                .eq("id", user.id);

              if (updateError) {
                logStep("Error updating user with new Stripe ID", updateError);
              } else {
                createdCount++;
              }
            }
          }

          // Agora sincronizar subscriptions se temos stripe_customer_id
          if (stripeCustomerId) {
            try {
              // Buscar subscriptions ativas do cliente no Stripe
              const subscriptions = await stripe.subscriptions.list({
                customer: stripeCustomerId,
                status: 'all',
                limit: 10
              });

              // Verificar se há alguma subscription ativa
              const activeSubscription = subscriptions.data.find(sub => 
                sub.status === 'active' || sub.status === 'trialing'
              );

              let subscriptionUpdateData;
              if (activeSubscription) {
                // Usuário tem subscription ativa
                const subscriptionEnd = activeSubscription.current_period_end 
                  ? new Date(activeSubscription.current_period_end * 1000).toISOString()
                  : null;

                subscriptionUpdateData = {
                  subscribed: true,
                  subscription_tier: "Premium",
                  subscription_end: subscriptionEnd,
                  updated_at: new Date().toISOString()
                };

                logStep("Found active subscription", {
                  email: user.email,
                  subscriptionId: activeSubscription.id,
                  status: activeSubscription.status
                });
              } else {
                // Usuário não tem subscription ativa
                subscriptionUpdateData = {
                  subscribed: false,
                  subscription_tier: "Free",
                  subscription_end: null,
                  updated_at: new Date().toISOString()
                };

                logStep("No active subscription found", { email: user.email });
              }

              // Atualizar subscription data no Supabase
              const { error: subUpdateError } = await supabaseClient
                .from("users")
                .update(subscriptionUpdateData)
                .eq("id", user.id);

              if (subUpdateError) {
                logStep("Error updating user subscription", { 
                  email: user.email, 
                  error: subUpdateError.message 
                });
              } else {
                subscriptionsSynced++;
                logStep("Subscription synced", { 
                  email: user.email, 
                  tier: subscriptionUpdateData.subscription_tier,
                  subscribed: subscriptionUpdateData.subscribed
                });
              }
            } catch (subError) {
              logStep("Error syncing subscription", { 
                email: user.email, 
                error: subError instanceof Error ? subError.message : String(subError)
              });
            }
          }

          syncedCount++;
        } catch (userError) {
          logStep("Error processing user", { 
            email: user.email, 
            error: userError instanceof Error ? userError.message : String(userError)
          });
        }

        // Pequena pausa para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    logStep("Sync completed", { 
      syncedCount, 
      createdCount, 
      updatedCount,
      subscriptionsSynced
    });

    return new Response(JSON.stringify({ 
      success: true,
      message: `Successfully synced ${syncedCount} users and ${subscriptionsSynced} subscriptions`,
      stats: {
        total_processed: syncedCount,
        stripe_customers_created: createdCount,
        users_updated_with_stripe_id: updatedCount,
        subscriptions_synced: subscriptionsSynced
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