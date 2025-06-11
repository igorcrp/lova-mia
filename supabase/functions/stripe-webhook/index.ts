
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature!, webhookSecret!);
  } catch (err) {
    return new Response(`Webhook signature verification failed.`, {
      status: 400,
    });
  }

  console.log("Received event:", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        
        if (session.mode === "subscription") {
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;
          const userId = session.metadata?.user_id;

          if (userId) {
            // Get customer details
            const customer = await stripe.customers.retrieve(customerId);
            const customerEmail = typeof customer !== 'string' ? customer.email : '';

            // Update or insert subscriber record
            const { error } = await supabase
              .from("subscribers")
              .upsert({
                user_id: userId,
                email: customerEmail,
                stripe_customer_id: customerId,
                subscribed: true,
                subscription_tier: "premium",
                subscription_end: null, // Will be updated when we get subscription details
                updated_at: new Date().toISOString(),
              }, {
                onConflict: "user_id"
              });

            if (error) {
              console.error("Error updating subscriber:", error);
            }
          }
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by customer ID
        const { data: subscriber } = await supabase
          .from("subscribers")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (subscriber) {
          const isActive = subscription.status === "active";
          const subscriptionEnd = subscription.current_period_end 
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null;

          await supabase
            .from("subscribers")
            .update({
              subscribed: isActive,
              subscription_tier: isActive ? "premium" : "free",
              subscription_end: subscriptionEnd,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", subscriber.user_id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by customer ID and downgrade to free
        const { data: subscriber } = await supabase
          .from("subscribers")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (subscriber) {
          await supabase
            .from("subscribers")
            .update({
              subscribed: false,
              subscription_tier: "free",
              subscription_end: null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", subscriber.user_id);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(`Webhook handler failed: ${error.message}`, {
      status: 400,
    });
  }
});
