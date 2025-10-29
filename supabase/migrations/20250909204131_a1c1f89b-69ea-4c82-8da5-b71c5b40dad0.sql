-- Consolidate subscribers table into users table

-- First, add the subscription-related columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS subscribed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS subscription_tier TEXT,
ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMPTZ;

-- Migrate data from subscribers to users table
UPDATE public.users 
SET 
  subscribed = s.subscribed,
  subscription_tier = s.subscription_tier,
  subscription_end = s.subscription_end,
  stripe_customer_id = COALESCE(users.stripe_customer_id, s.stripe_customer_id)
FROM public.subscribers s 
WHERE users.id = s.user_id;

-- Also update by email if user_id didn't match but email does
UPDATE public.users 
SET 
  subscribed = s.subscribed,
  subscription_tier = s.subscription_tier,
  subscription_end = s.subscription_end,
  stripe_customer_id = COALESCE(users.stripe_customer_id, s.stripe_customer_id)
FROM public.subscribers s 
WHERE users.email = s.email 
  AND users.id != s.user_id
  AND users.subscribed IS NULL;

-- Drop functions with CASCADE to remove triggers
DROP FUNCTION IF EXISTS public.get_masked_subscriber_data() CASCADE;
DROP FUNCTION IF EXISTS public.audit_subscriber_changes() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_subscription_status() CASCADE;

-- Create new function to get user subscription status from users table
CREATE OR REPLACE FUNCTION public.get_user_subscription_status()
RETURNS TABLE(subscribed boolean, subscription_tier text, subscription_end timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.subscribed,
    u.subscription_tier,
    u.subscription_end
  FROM users u
  WHERE u.id = auth.uid()
  LIMIT 1;
END;
$$;

-- Drop the subscribers table completely (this will also drop all policies)
DROP TABLE IF EXISTS public.subscribers;