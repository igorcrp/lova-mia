-- Fix critical security vulnerability in subscribers table RLS policies
-- Remove policies that allow public access to sensitive customer data

-- Drop existing potentially insecure policies
DROP POLICY IF EXISTS "subscribers_can_read_own" ON public.subscribers;
DROP POLICY IF EXISTS "subscribers_can_insert_authenticated" ON public.subscribers;
DROP POLICY IF EXISTS "subscribers_can_update_own" ON public.subscribers;
DROP POLICY IF EXISTS "insert_subscription_secure" ON public.subscribers;
DROP POLICY IF EXISTS "update_own_subscription_secure" ON public.subscribers;

-- Create secure RLS policies for subscribers table that only allow authenticated users to access their own data
CREATE POLICY "subscribers_select_own_only" 
ON public.subscribers 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "subscribers_insert_own_only" 
ON public.subscribers 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "subscribers_update_own_only" 
ON public.subscribers 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admin users can manage all subscribers for administrative purposes
CREATE POLICY "admin_manage_subscribers" 
ON public.subscribers 
FOR ALL 
USING (is_admin())
WITH CHECK (is_admin());