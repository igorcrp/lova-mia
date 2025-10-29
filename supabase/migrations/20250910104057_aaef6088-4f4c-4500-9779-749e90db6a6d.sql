-- Security Fix: Strengthen RLS policies for users table to protect sensitive customer data

-- First, drop existing redundant and potentially insecure policies
DROP POLICY IF EXISTS "users_can_read_own_data" ON public.users;
DROP POLICY IF EXISTS "users_select_own_secure" ON public.users;  
DROP POLICY IF EXISTS "users_update_own_only" ON public.users;
DROP POLICY IF EXISTS "Permitir leitura do próprio usuário" ON public.users;

-- Create a secure SELECT policy for users to access their own data
CREATE POLICY "users_select_own_data_secure" ON public.users
FOR SELECT 
USING (auth.uid() = id);

-- Create a restricted UPDATE policy that prevents users from modifying sensitive fields
CREATE POLICY "users_update_own_profile_only" ON public.users
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id 
  AND level_id = (SELECT level_id FROM public.users WHERE id = auth.uid())
  AND subscription_tier = (SELECT subscription_tier FROM public.users WHERE id = auth.uid())
  AND stripe_customer_id = (SELECT stripe_customer_id FROM public.users WHERE id = auth.uid())
  AND subscribed = (SELECT subscribed FROM public.users WHERE id = auth.uid())
  AND subscription_end = (SELECT subscription_end FROM public.users WHERE id = auth.uid())
);

-- Create a function to get user profile data without sensitive payment information
CREATE OR REPLACE FUNCTION public.get_user_profile()
RETURNS TABLE(
  id uuid,
  email text,
  name text,
  status_users text,
  email_verified boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    u.id,
    u.email,
    u.name,
    u.status_users,
    u.email_verified,
    u.created_at,
    u.updated_at
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

-- Create a function to get subscription status without exposing stripe_customer_id
CREATE OR REPLACE FUNCTION public.get_subscription_info()
RETURNS TABLE(
  subscribed boolean,
  subscription_tier text,
  subscription_end timestamp with time zone
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    u.subscribed,
    u.subscription_tier,
    u.subscription_end
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

-- Grant execute permissions to authenticated users for the secure functions
GRANT EXECUTE ON FUNCTION public.get_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_info() TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION public.get_user_profile() IS 'Secure function to get user profile data without exposing payment information';
COMMENT ON FUNCTION public.get_subscription_info() IS 'Secure function to get subscription status without exposing Stripe customer ID';