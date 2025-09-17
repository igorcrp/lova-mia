import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Secure CORS headers - restrict origins in production
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // TODO: Replace with specific origins in production
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400", // 24 hours
};

const logStep = (step: string, details?: any) => {
  // Sanitize sensitive data from logs
  const sanitizedDetails = details ? sanitizeLogData(details) : null;
  const detailsStr = sanitizedDetails ? ` - ${JSON.stringify(sanitizedDetails)}` : '';
  console.log(`[STRIPE-WEBHOOKS] ${step}${detailsStr}`);
};

const sanitizeLogData = (data: any): any => {
  if (typeof data !== 'object' || data === null) return data;
  
  const sanitized = { ...data };
  const sensitiveFields = ['email', 'customer_email', 'name', 'phone', 'address'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
};

const validateWebhookPayload = (body: string): boolean => {
  // Basic validation - check if body is not empty and is valid JSON structure
  if (!body || body.length === 0) return false;
  if (body.length > 10 * 1024 * 1024) return false; // Max 10MB
  
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object';
  } catch {
    return false;
  }
};

const validateStripeCustomerId = (customerId: string): boolean => {
  return typeof customerId === 'string' && 
         customerId.startsWith('cus_') && 
         customerId.length > 10 && 
         customerId.length < 100;
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    logStep("Webhook received", { method: req.method, userAgent: req.headers.get("user-agent") });

    // Validate environment variables
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!stripeKey || !webhookSecret) {
      logStep("ERROR: Missing Stripe configuration");
      throw new Error("Missing Stripe configuration");
    }

    const stripe = new Stripe(stripeKey, { 
      apiVersion: "2023-10-16",
      typescript: true,
    });
    
    // Use service role key to update user data
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      logStep("ERROR: Missing Supabase configuration");
      throw new Error("Missing Supabase configuration");
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, { 
      auth: { persistSession: false } 
    });

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    // Validate payload
    if (!validateWebhookPayload(body)) {
      logStep("ERROR: Invalid webhook payload");
      return new Response("Invalid payload", { status: 400, headers: corsHeaders });
    }

    if (!signature) {
      logStep("ERROR: Missing stripe-signature header");
      throw new Error("Missing stripe-signature header");
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      logStep("Webhook signature verified", { eventType: event.type, eventId: event.id });
    } catch (err) {
      logStep("Webhook signature verification failed", { error: err instanceof Error ? err.message : String(err) });
      return new Response("Webhook signature verification failed", { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // Handle different event types
    switch (event.type) {
      case "customer.created":
        await handleCustomerCreated(event.data.object as Stripe.Customer, supabaseClient);
        break;
      
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription, supabaseClient);
        break;
      
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, supabaseClient);
        break;
      
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, supabaseClient);
        break;
      
      default:
        logStep("Unhandled event type", { eventType: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: "Internal server error" }), // Don't leak sensitive error details
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

async function handleCustomerCreated(customer: Stripe.Customer, supabaseClient: any) {
  logStep("Handling customer.created", { customerId: customer.id });
  
  if (!customer.email) {
    logStep("Customer has no email, skipping");
    return;
  }

  // Validate customer ID format
  if (!validateStripeCustomerId(customer.id)) {
    logStep("Invalid customer ID format", { customerId: customer.id });
    return;
  }

  // Update user record with stripe_customer_id if not already set
  const { error } = await supabaseClient
    .from("users")
    .update({ stripe_customer_id: customer.id })
    .eq("email", customer.email)
    .is("stripe_customer_id", null);

  if (error) {
    logStep("Error updating user with stripe_customer_id", { error: error.message });
  } else {
    logStep("User updated with stripe_customer_id", { customerId: customer.id });
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription, supabaseClient: any) {
  logStep("Handling customer.subscription.created", { 
    subscriptionId: subscription.id, 
    customerId: subscription.customer,
    status: subscription.status 
  });

  await updateUserPlanFromSubscription(subscription, supabaseClient);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, supabaseClient: any) {
  logStep("Handling customer.subscription.updated", { 
    subscriptionId: subscription.id, 
    customerId: subscription.customer,
    status: subscription.status 
  });

  await updateUserPlanFromSubscription(subscription, supabaseClient);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, supabaseClient: any) {
  logStep("Handling customer.subscription.deleted", { 
    subscriptionId: subscription.id, 
    customerId: subscription.customer 
  });

  // Validate customer ID
  if (!validateStripeCustomerId(subscription.customer as string)) {
    logStep("Invalid customer ID in subscription deletion", { customerId: subscription.customer });
    return;
  }

  // Set user subscription to free when subscription is deleted
  const { error } = await supabaseClient
    .from("users")
    .update({ 
      subscription_tier: "Free",
      subscribed: false, 
      subscription_end: null,
      updated_at: new Date().toISOString()
    })
    .eq("stripe_customer_id", subscription.customer);

  if (error) {
    logStep("Error updating user subscription to free", { error: error.message });
  } else {
    logStep("User subscription updated to free", { customerId: subscription.customer });
  }
}

async function updateUserPlanFromSubscription(subscription: Stripe.Subscription, supabaseClient: any) {
  const isActive = subscription.status === "active" || subscription.status === "trialing";
  const subscriptionTier = isActive ? "Premium" : "Free";
  
  // Validate customer ID
  if (!validateStripeCustomerId(subscription.customer as string)) {
    logStep("Invalid customer ID in subscription update", { customerId: subscription.customer });
    return;
  }
  
  logStep("Updating user subscription", { 
    customerId: subscription.customer, 
    status: subscription.status,
    subscriptionTier: subscriptionTier 
  });

  // Calculate subscription end date
  const subscriptionEnd = subscription.current_period_end 
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  // Update users table subscription fields
  const { error } = await supabaseClient
    .from("users")
    .update({
      subscribed: isActive,
      subscription_tier: isActive ? "Premium" : "Free",
      subscription_end: subscriptionEnd,
      updated_at: new Date().toISOString()
    })
    .eq("stripe_customer_id", subscription.customer);

  if (error) {
    logStep("Error updating users subscription fields", { error: error.message });
  } else {
    logStep("Users subscription fields updated", { 
      customerId: subscription.customer, 
      subscribed: isActive,
      subscriptionTier: subscriptionTier
    });
  }
}