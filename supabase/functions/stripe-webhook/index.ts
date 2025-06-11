
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
  
  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature!,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        
        if (customer && typeof customer === 'object' && 'email' in customer) {
          const email = customer.email;
          const isActive = subscription.status === "active";
          
          await supabase.from("subscribers").upsert({
            email: email,
            stripe_customer_id: subscription.customer as string,
            subscribed: isActive,
            subscription_tier: isActive ? "premium" : "free",
            subscription_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'email' });

          await supabase.from("users").update({
            plan_type: isActive ? "premium" : "free"
          }).eq("email", email);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        
        if (customer && typeof customer === 'object' && 'email' in customer) {
          const email = customer.email;
          
          await supabase.from("subscribers").upsert({
            email: email,
            stripe_customer_id: subscription.customer as string,
            subscribed: false,
            subscription_tier: "free",
            subscription_end: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'email' });

          await supabase.from("users").update({
            plan_type: "free"
          }).eq("email", email);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }
});
