
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const signature = req.headers.get("stripe-signature");
    const body = await req.text();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!signature || !webhookSecret) {
      throw new Error("Missing signature or webhook secret");
    }

    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    console.log("Webhook event type:", event.type);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const userId = session.metadata?.user_id;

        if (userId && session.mode === "subscription") {
          // Update user plan to premium
          await supabaseClient
            .from("users")
            .update({ plan_type: "premium" })
            .eq("id", userId);

          // Update subscribers table
          await supabaseClient
            .from("subscribers")
            .upsert({
              user_id: userId,
              email: session.customer_details?.email || "",
              stripe_customer_id: customerId,
              subscribed: true,
              subscription_tier: "premium",
              updated_at: new Date().toISOString(),
            });

          console.log("Updated user to premium plan:", userId);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Get user by customer ID
        const { data: subscriber } = await supabaseClient
          .from("subscribers")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (subscriber?.user_id) {
          const isActive = subscription.status === "active";
          const planType = isActive ? "premium" : "free";

          // Update user plan
          await supabaseClient
            .from("users")
            .update({ plan_type: planType })
            .eq("id", subscriber.user_id);

          // Update subscribers table
          await supabaseClient
            .from("subscribers")
            .update({
              subscribed: isActive,
              subscription_tier: isActive ? "premium" : "free",
              subscription_end: subscription.current_period_end 
                ? new Date(subscription.current_period_end * 1000).toISOString()
                : null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", subscriber.user_id);

          console.log(`Updated subscription status for user ${subscriber.user_id}: ${planType}`);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Get user by customer ID
        const { data: subscriber } = await supabaseClient
          .from("subscribers")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (subscriber?.user_id) {
          // Downgrade to free plan on payment failure
          await supabaseClient
            .from("users")
            .update({ plan_type: "free" })
            .eq("id", subscriber.user_id);

          await supabaseClient
            .from("subscribers")
            .update({
              subscribed: false,
              subscription_tier: "free",
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", subscriber.user_id);

          console.log("Downgraded user to free plan due to payment failure:", subscriber.user_id);
        }
        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
