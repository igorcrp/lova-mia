-- Add last_login column to users table to track login activity
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS last_login timestamp with time zone;

-- Create a table to track login history for analytics
CREATE TABLE IF NOT EXISTS public.user_login_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  login_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on login history
ALTER TABLE public.user_login_history ENABLE ROW LEVEL SECURITY;

-- Only admins can read login history
CREATE POLICY "admin_read_login_history"
ON public.user_login_history
FOR SELECT
USING (is_admin());

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_login_history_user_id ON public.user_login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_login_history_login_at ON public.user_login_history(login_at DESC);

-- Function to record user login
CREATE OR REPLACE FUNCTION public.record_user_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update last_login in users table
  UPDATE public.users
  SET last_login = now()
  WHERE id = auth.uid();
  
  -- Insert into login history
  INSERT INTO public.user_login_history (user_id, login_at)
  VALUES (auth.uid(), now());
END;
$$;