-- Sync missing users from auth.users to public.users
-- First, correct the inconsistent ID for joaosaralho@gmail.com
UPDATE public.users 
SET id = '03822091-dea0-4104-808b-a7d73c2725a7'
WHERE email = 'joaosaralho@gmail.com' AND id = '0773f4ba-0673-494e-b8e3-ba68b6645c9d';

-- Insert missing users from auth.users to public.users
INSERT INTO public.users (id, email, name, level_id, status_users, plan_type, email_verified, created_at)
SELECT 
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', split_part(au.email, '@', 1)) as name,
    1 as level_id,
    CASE 
        WHEN au.email_confirmed_at IS NOT NULL THEN 'active'
        ELSE 'pending'
    END as status_users,
    'free' as plan_type,
    (au.email_confirmed_at IS NOT NULL) as email_verified,
    au.created_at
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
WHERE pu.id IS NULL;

-- Create or replace trigger function to sync new auth users to public users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (
        id, 
        email, 
        name, 
        level_id, 
        status_users, 
        plan_type, 
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
        'free',
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

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user insertions
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- Create trigger for user updates (email confirmation)
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
    AFTER UPDATE ON auth.users
    FOR EACH ROW
    WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
    EXECUTE FUNCTION public.handle_new_auth_user();