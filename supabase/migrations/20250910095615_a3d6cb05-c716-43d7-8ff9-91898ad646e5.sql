-- Limpar todas as referências restantes ao plan_type

-- Remover triggers que ainda fazem referência ao plan_type
DROP TRIGGER IF EXISTS prevent_privilege_escalation_trigger ON public.users;
DROP TRIGGER IF EXISTS audit_sensitive_changes_trigger ON public.users;

-- Remover funções antigas que referenciam plan_type
DROP FUNCTION IF EXISTS public.prevent_privilege_escalation() CASCADE;
DROP FUNCTION IF EXISTS public.audit_sensitive_changes() CASCADE;

-- Recriar a função prevent_privilege_escalation sem referência ao plan_type
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Only allow admins to change level_id and subscription_tier
  IF OLD.level_id != NEW.level_id OR OLD.subscription_tier != NEW.subscription_tier THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND level_id >= 2
    ) THEN
      RAISE EXCEPTION 'Only administrators can modify user levels and subscription tiers';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Recriar a função audit_sensitive_changes sem referência ao plan_type
CREATE OR REPLACE FUNCTION public.audit_sensitive_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Log changes to level_id or subscription_tier
  IF TG_OP = 'UPDATE' AND (OLD.level_id != NEW.level_id OR OLD.subscription_tier != NEW.subscription_tier) THEN
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
      json_build_object('level_id', OLD.level_id, 'subscription_tier', OLD.subscription_tier),
      json_build_object('level_id', NEW.level_id, 'subscription_tier', NEW.subscription_tier)
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Recriar os triggers com as funções atualizadas
CREATE TRIGGER prevent_privilege_escalation_trigger
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privilege_escalation();

CREATE TRIGGER audit_sensitive_changes_trigger
  AFTER UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_sensitive_changes();