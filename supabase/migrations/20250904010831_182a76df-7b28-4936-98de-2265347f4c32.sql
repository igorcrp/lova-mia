-- Fix critical security issues in RLS policies and database constraints

-- 1. Drop existing problematic policies
DROP POLICY IF EXISTS "users_can_update_own_data" ON public.users;

-- 2. Create secure update policy that prevents privilege escalation
CREATE POLICY "users_can_update_own_data_secure" ON public.users
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id AND
  -- Prevent users from modifying critical security fields
  level_id = (SELECT level_id FROM public.users WHERE id = auth.uid()) AND
  plan_type = (SELECT plan_type FROM public.users WHERE id = auth.uid())
);

-- 3. Add NOT NULL constraint to user_id in subscribers table
ALTER TABLE public.subscribers ALTER COLUMN user_id SET NOT NULL;

-- 4. Create trigger to enforce security on user updates
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow admins to change level_id and plan_type
  IF OLD.level_id != NEW.level_id OR OLD.plan_type != NEW.plan_type THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND level_id >= 2
    ) THEN
      RAISE EXCEPTION 'Only administrators can modify user levels and plan types';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for user table updates
CREATE TRIGGER enforce_user_security
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privilege_escalation();

-- 5. Create audit function for sensitive operations
CREATE OR REPLACE FUNCTION public.audit_sensitive_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Log changes to level_id or plan_type
  IF TG_OP = 'UPDATE' AND (OLD.level_id != NEW.level_id OR OLD.plan_type != NEW.plan_type) THEN
    INSERT INTO public.audit_log (
      table_name,
      operation,
      user_id,
      old_values,
      new_values
    ) VALUES (
      'users',
      'PRIVILEGE_CHANGE',
      auth.uid(),
      json_build_object('level_id', OLD.level_id, 'plan_type', OLD.plan_type),
      json_build_object('level_id', NEW.level_id, 'plan_type', NEW.plan_type)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit trigger
CREATE TRIGGER audit_user_privilege_changes
  AFTER UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_sensitive_changes();