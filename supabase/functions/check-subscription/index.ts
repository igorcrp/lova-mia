import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Secure CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // TODO: Replace with specific origins in production
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400", // 24 hours
};

const logStep = (step: string, details?: any) => {
  // Sanitize sensitive data from logs
  const sanitizedDetails = details ? sanitizeLogData(details) : null;
  const detailsStr = sanitizedDetails ? ` - ${JSON.stringify(sanitizedDetails)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

const sanitizeLogData = (data: any): any => {
  if (typeof data !== 'object' || data === null) return data;
  
  const sanitized = { ...data };
  const sensitiveFields = ['email', 'token', 'apikey'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
};

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 254;
};

const validateUserId = (userId: string): boolean => {
  // UUID v4 format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(userId);
};

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const checkRateLimit = (identifier: string, maxRequests = 10, windowMs = 60000): boolean => {
  const now = Date.now();
  const userLimit = rateLimitMap.get(identifier);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (userLimit.count >= maxRequests) {
    return false;
  }
  
  userLimit.count++;
  return true;
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
    logStep("Function started", { method: req.method });

    // Validate environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey || !stripeKey) {
      logStep("ERROR: Missing required environment variables");
      throw new Error("Server configuration error");
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    logStep("Environment variables validated");

    // Get and validate authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logStep("ERROR: Invalid or missing authorization header");
      throw new Error("Invalid authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token || token.length < 10) {
      logStep("ERROR: Invalid token format");
      throw new Error("Invalid token");
    }

    logStep("Authorization header validated");
    
    // Authenticate user
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) {
      logStep("Authentication error", { error: userError.message });
      throw new Error(`Authentication error: ${userError.message}`);
    }
    
    const user = userData.user;
    if (!user?.email || !user?.id) {
      logStep("ERROR: User not authenticated or missing required data");
      throw new Error("User not authenticated");
    }

    // Validate user data
    if (!validateEmail(user.email)) {
      logStep("ERROR: Invalid user email format");
      throw new Error("Invalid user data");
    }

    if (!validateUserId(user.id)) {
      logStep("ERROR: Invalid user ID format");
      throw new Error("Invalid user data");
    }

    // Rate limiting
    if (!checkRateLimit(user.id)) {
      logStep("Rate limit exceeded", { userId: user.id });
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 429,
      });
    }

    logStep("User authenticated", { userId: user.id });

    // Initialize Stripe with proper configuration
    const stripe = new Stripe(stripeKey, { 
      apiVersion: "2023-10-16",
      typescript: true,
    });

    // Find customer by email with validation
    const customers = await stripe.customers.list({ 
      email: user.email, 
      limit: 1 
    });
    
    if (customers.data.length === 0) {
      logStep("No customer found, updating unsubscribed state");
      
      const { error: updateError } = await supabaseClient
        .from("users")
        .update({
          stripe_customer_id: null,
          subscribed: false,
          subscription_tier: 'Free',
          subscription_end: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) {
        logStep("Error updating user to unsubscribed state", { error: updateError.message });
      }

      return new Response(JSON.stringify({ 
        subscribed: false, 
        subscription_tier: 'Free',
        subscription_end: null 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Get active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0;
    let subscriptionTier = 'Free';
    let subscriptionEnd = null;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
      logStep("Active subscription found", { 
        subscriptionId: subscription.id, 
        endDate: subscriptionEnd 
      });
      
      // Determine subscription tier based on price
      if (subscription.items.data.length > 0) {
        const priceId = subscription.items.data[0].price.id;
        const price = await stripe.prices.retrieve(priceId);
        const amount = price.unit_amount || 0;
        
        if (amount >= 3900) {
          subscriptionTier = "Premium";
        } else {
          subscriptionTier = "Basic";
        }
        logStep("Determined subscription tier", { 
          priceId, 
          amount, 
          subscriptionTier 
        });
      }
    } else {
      logStep("No active subscription found");
    }

    // Update users table with subscription info
    const { error: usersError } = await supabaseClient
      .from("users")
      .update({
        stripe_customer_id: customerId,
        subscribed: hasActiveSub,
        subscription_tier: subscriptionTier,
        subscription_end: subscriptionEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (usersError) {
      logStep("ERROR updating users table", { error: usersError.message });
      throw new Error("Database update failed");
    } else {
      logStep("Updated users table", { 
        subscribed: hasActiveSub, 
        subscriptionTier 
      });
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      subscription_tier: subscriptionTier,
      subscription_end: subscriptionEnd
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    
    // Don't leak sensitive error details to client
    const publicErrorMessage = errorMessage.includes("Authentication") || 
                              errorMessage.includes("authorization") ||
                              errorMessage.includes("token") 
                              ? "Authentication failed" 
                              : "Internal server error";
    
    return new Response(JSON.stringify({ error: publicErrorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: errorMessage.includes("Authentication") ? 401 : 500,
    });
  }
});