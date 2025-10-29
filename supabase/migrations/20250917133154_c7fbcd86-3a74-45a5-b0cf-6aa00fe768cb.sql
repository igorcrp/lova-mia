-- Fix prevent_privilege_escalation to allow service-role (edge functions) to update subscription fields
-- without requiring an admin auth.uid(), while still blocking normal users from privilege changes.

-- Recreate function with safe checks
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Allow service role or any context without an authenticated user to proceed
  -- Edge Functions using the service role key have no auth context (auth.uid() IS NULL)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- If a regular authenticated user tries to change privileged fields, enforce admin-only
  IF (OLD.level_id IS DISTINCT FROM NEW.level_id)
     OR (OLD.subscription_tier IS DISTINCT FROM NEW.subscription_tier)
     OR (OLD.subscribed IS DISTINCT FROM NEW.subscribed)
     OR (OLD.subscription_end IS DISTINCT FROM NEW.subscription_end) THEN

    IF NOT EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND level_id >= 2
    ) THEN
      RAISE EXCEPTION 'Only administrators can modify user levels and subscription tiers';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists (create if missing). This is idempotent: drop and recreate.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t 
    JOIN pg_class c ON c.oid = t.tgrelid 
    WHERE c.relname = 'users' AND t.tgname = 'trg_prevent_privilege_escalation'
  ) THEN
    EXECUTE 'DROP TRIGGER trg_prevent_privilege_escalation ON public.users';
  END IF;

  EXECUTE 'CREATE TRIGGER trg_prevent_privilege_escalation
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_privilege_escalation()';
END $$;