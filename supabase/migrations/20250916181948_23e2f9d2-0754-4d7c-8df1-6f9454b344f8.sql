-- Fix database functions that reference the wrong column name
-- The column is 'subscription_tier' not 'plan_type'

-- Drop the old function first to avoid conflict
DROP FUNCTION IF EXISTS public.get_current_user();

-- Update handle_new_auth_user function to use correct column name
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Create the new get_current_user function with correct column name
CREATE OR REPLACE FUNCTION public.get_current_user()
 RETURNS TABLE(id uuid, email text, name text, status_users text, level_id integer, subscription_tier text, email_verified boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$BEGIN
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
END;$function$