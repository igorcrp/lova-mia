-- Security Fix: Strengthen RLS policies for users table to protect sensitive customer data

-- First, drop existing redundant and potentially insecure policies
DROP POLICY IF EXISTS "users_can_read_own_data" ON public.users;
DROP POLICY IF EXISTS "users_select_own_secure" ON public.users;  
DROP POLICY IF EXISTS "users_update_own_only" ON public.users;
DROP POLICY IF EXISTS "Permitir leitura do próprio usuário" ON public.users;

-- Create a secure SELECT policy for regular users (they can only see their own data)
CREATE POLICY "users_select_own_data_secure" ON public.users
FOR SELECT 
TO authenticated
USING (auth.uid() = id);

-- Create a restricted UPDATE policy that prevents users from modifying sensitive fields
CREATE POLICY "users_update_own_profile_only" ON public.users
FOR UPDATE
TO authenticated
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
CREATE OR REPLACE FUNCTION public.get_user_profile_secure()
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
CREATE OR REPLACE FUNCTION public.get_subscription_status_secure()
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

-- Create audit function for sensitive data access (for admin use)
CREATE OR REPLACE FUNCTION public.audit_payment_data_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only log when sensitive fields are being accessed by non-admin users
  IF TG_OP = 'UPDATE' AND NOT is_admin() THEN
    IF OLD.stripe_customer_id IS DISTINCT FROM NEW.stripe_customer_id OR
       OLD.subscription_tier IS DISTINCT FROM NEW.subscription_tier OR
       OLD.subscribed IS DISTINCT FROM NEW.subscribed THEN
      INSERT INTO public.audit_log (
        table_name,
        operation,
        user_id,
        old_values,
        new_values
      ) VALUES (
        'users',
        'UNAUTHORIZED_PAYMENT_MODIFICATION_ATTEMPT',
        auth.uid(),
        json_build_object('stripe_customer_id', 'REDACTED', 'subscription_tier', OLD.subscription_tier),
        json_build_object('stripe_customer_id', 'REDACTED', 'subscription_tier', NEW.subscription_tier)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION public.get_user_profile_secure() IS 'Secure function to get user profile data without exposing payment information';
COMMENT ON FUNCTION public.get_subscription_status_secure() IS 'Secure function to get subscription status without exposing Stripe customer ID';
COMMENT ON FUNCTION public.audit_payment_data_access() IS 'Audit function to log unauthorized attempts to modify payment data';

-- Grant execute permissions to authenticated users for the secure functions
GRANT EXECUTE ON FUNCTION public.get_user_profile_secure() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_status_secure() TO authenticated;