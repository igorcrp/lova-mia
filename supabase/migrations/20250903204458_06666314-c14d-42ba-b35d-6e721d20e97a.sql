-- Enhance subscribers table security with additional constraints and functions

-- Create a security definer function to mask sensitive data for non-admin users
CREATE OR REPLACE FUNCTION public.get_masked_subscriber_data()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  email text,
  subscribed boolean,
  subscription_tier text,
  subscription_end timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only return full data for the user's own record or if user is admin
  IF NOT EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.level_id >= 2) THEN
    -- Non-admin users only see their own data with masked email
    RETURN QUERY
    SELECT 
      s.id,
      s.user_id,
      CASE 
        WHEN s.user_id = auth.uid() THEN s.email
        ELSE substring(s.email, 1, 3) || '*****@' || split_part(s.email, '@', 2)
      END as email,
      s.subscribed,
      s.subscription_tier,
      s.subscription_end,
      s.created_at,
      s.updated_at
    FROM subscribers s
    WHERE s.user_id = auth.uid();
  ELSE
    -- Admin users see all data unmasked
    RETURN QUERY
    SELECT 
      s.id,
      s.user_id,
      s.email,
      s.subscribed,
      s.subscription_tier,
      s.subscription_end,
      s.created_at,
      s.updated_at
    FROM subscribers s;
  END IF;
END;
$$;

-- Add additional constraints to ensure data integrity
ALTER TABLE public.subscribers
ADD CONSTRAINT subscribers_email_format_check 
CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Add constraint to ensure user_id is always set for non-admin operations
ALTER TABLE public.subscribers
ADD CONSTRAINT subscribers_user_id_required 
CHECK (user_id IS NOT NULL);

-- Create an audit log function for sensitive operations
CREATE OR REPLACE FUNCTION public.audit_subscriber_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log subscription changes for security monitoring
  IF TG_OP = 'UPDATE' THEN
    -- Only log if sensitive fields changed
    IF OLD.subscribed != NEW.subscribed OR 
       OLD.subscription_tier != NEW.subscription_tier OR
       OLD.stripe_customer_id != NEW.stripe_customer_id THEN
      
      INSERT INTO public.audit_log (
        table_name,
        operation,
        user_id,
        old_values,
        new_values,
        timestamp
      ) VALUES (
        'subscribers',
        TG_OP,
        auth.uid(),
        row_to_json(OLD),
        row_to_json(NEW),
        now()
      );
    END IF;
    RETURN NEW;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create audit log table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  operation text NOT NULL,
  user_id uuid,
  old_values jsonb,
  new_values jsonb,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "audit_log_admin_only" ON public.audit_log
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.level_id >= 2
  )
);

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS audit_subscriber_changes_trigger ON public.subscribers;
CREATE TRIGGER audit_subscriber_changes_trigger
  AFTER UPDATE ON public.subscribers
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_subscriber_changes();

-- Update existing RLS policies to be more restrictive
DROP POLICY IF EXISTS "subscribers_strict_select" ON public.subscribers;
CREATE POLICY "subscribers_strict_select" ON public.subscribers
FOR SELECT
TO authenticated
USING (
  -- Users can only see their own records
  (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
  -- Admins can see all records
  (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.level_id >= 2))
);

-- Ensure stripe_customer_id is only visible to the user and admins
DROP POLICY IF EXISTS "subscribers_stripe_data_restricted" ON public.subscribers;
CREATE POLICY "subscribers_stripe_data_restricted" ON public.subscribers
FOR SELECT
TO authenticated
USING (
  -- Only the user themselves or admins can see stripe_customer_id
  (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
  (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.level_id >= 2))
);

-- Add function to safely retrieve subscription status without exposing sensitive data
CREATE OR REPLACE FUNCTION public.get_user_subscription_status()
RETURNS TABLE(
  subscribed boolean,
  subscription_tier text,
  subscription_end timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.subscribed,
    s.subscription_tier,
    s.subscription_end
  FROM subscribers s
  WHERE s.user_id = auth.uid()
  LIMIT 1;
END;
$$;