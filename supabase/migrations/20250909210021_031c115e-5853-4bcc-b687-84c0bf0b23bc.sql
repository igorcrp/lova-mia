-- Migrar dados de plan_type para subscription_tier e remover plan_type
-- Primeiro, atualizar subscription_tier baseado em plan_type para usuários existentes
UPDATE public.users 
SET subscription_tier = CASE 
  WHEN plan_type = 'premium' THEN 'Premium'
  WHEN plan_type = 'free' THEN 'Free'
  ELSE 'Free'
END
WHERE subscription_tier IS NULL OR subscription_tier = '';

-- Garantir que todos os usuários tenham subscription_tier
UPDATE public.users 
SET subscription_tier = 'Free' 
WHERE subscription_tier IS NULL OR subscription_tier = '';

-- Remover a coluna plan_type
ALTER TABLE public.users DROP COLUMN plan_type;

-- Atualizar função handle_new_auth_user para usar subscription_tier
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    INSERT INTO public.users (
        id, 
        email, 
        name, 
        level_id, 
        status_users, 
        subscription_tier,
        email_verified,
        created_at
    ) VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
        1,
        CASE 
            WHEN NEW.email_confirmed_at IS NOT NULL THEN 'active'
            ELSE 'pending'
        END,
        'Free',
        (NEW.email_confirmed_at IS NOT NULL),
        NEW.created_at
    ) ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = COALESCE(EXCLUDED.name, public.users.name),
        status_users = CASE 
            WHEN NEW.email_confirmed_at IS NOT NULL AND public.users.status_users = 'pending' THEN 'active'
            ELSE public.users.status_users
        END,
        email_verified = (NEW.email_confirmed_at IS NOT NULL),
        updated_at = now();
    
    RETURN NEW;
END;
$$;

-- Atualizar função get_current_user para remover plan_type
CREATE OR REPLACE FUNCTION public.get_current_user()
RETURNS TABLE(id uuid, email text, name text, status_users text, level_id integer, subscription_tier text, email_verified boolean, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email,
    u.name,
    u.status_users,
    u.level_id,
    u.subscription_tier,
    u.email_verified,
    u.created_at
  FROM public.users u
  WHERE u.id = auth.uid();
END;
$$;

-- Atualizar trigger prevent_privilege_escalation
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- Atualizar função audit_sensitive_changes
CREATE OR REPLACE FUNCTION public.audit_sensitive_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- Atualizar política users_can_update_own_data_secure
DROP POLICY IF EXISTS users_can_update_own_data_secure ON public.users;
CREATE POLICY "users_can_update_own_data_secure" ON public.users
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  (auth.uid() = id) AND 
  (level_id = (SELECT users_1.level_id FROM users users_1 WHERE users_1.id = auth.uid())) AND 
  (subscription_tier = (SELECT users_1.subscription_tier FROM users users_1 WHERE users_1.id = auth.uid()))
);