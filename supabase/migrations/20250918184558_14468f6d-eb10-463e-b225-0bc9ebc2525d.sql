-- Create trigger to automatically create Stripe customer when user is created in auth.users
CREATE OR REPLACE FUNCTION public.auto_create_stripe_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Call the edge function to create a Stripe customer for the new user
  PERFORM net.http_post(
    url := 'https://rppiggskrhysmrlbkfhe.supabase.co/functions/v1/sync-stripe-customers',
    headers := '{"Authorization": "Bearer ' || current_setting('app.supabase_service_role_key', true) || '", "Content-Type": "application/json"}'::jsonb,
    body := json_build_object('email', NEW.email)::jsonb
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger on public.users table (not auth.users as we can't modify that)
DROP TRIGGER IF EXISTS trigger_auto_create_stripe_customer ON public.users;
CREATE TRIGGER trigger_auto_create_stripe_customer
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_stripe_customer();