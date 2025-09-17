-- Fix edge functions authentication issues

-- First, let's check if we have the subscribers table structure we need
CREATE TABLE IF NOT EXISTS public.subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  subscribed BOOLEAN NOT NULL DEFAULT false,
  subscription_tier TEXT,
  subscription_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own subscription info (if it doesn't exist)
DO $$ BEGIN
  CREATE POLICY "select_own_subscription" ON public.subscribers
  FOR SELECT
  USING (user_id = auth.uid() OR email = auth.email());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create policy for edge functions to update subscription info (if it doesn't exist)
DO $$ BEGIN
  CREATE POLICY "update_subscription_service" ON public.subscribers
  FOR UPDATE
  USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create policy for edge functions to insert subscription info (if it doesn't exist)
DO $$ BEGIN
  CREATE POLICY "insert_subscription_service" ON public.subscribers
  FOR INSERT
  WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;