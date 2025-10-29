-- Add has_seen_tour column to users table
ALTER TABLE public.users 
ADD COLUMN has_seen_tour BOOLEAN DEFAULT FALSE;

-- Update existing users to have seen tour (so they don't get bothered)
UPDATE public.users 
SET has_seen_tour = TRUE 
WHERE has_seen_tour IS NULL OR has_seen_tour = FALSE;