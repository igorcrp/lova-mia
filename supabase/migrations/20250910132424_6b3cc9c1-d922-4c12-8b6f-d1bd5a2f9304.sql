-- Fix user ID mismatch between auth.users and public.users for igorcrp@yahoo.com.br
UPDATE public.users 
SET id = '1bef457f-e534-4fc2-9a4f-102b3bc7ef47'
WHERE email = 'igorcrp@yahoo.com.br' AND id = 'c557f72e-5332-4f00-94f5-5713834fb037';

-- Ensure the user status is properly set
UPDATE public.users 
SET status_users = 'active', email_verified = true, updated_at = now()
WHERE id = '1bef457f-e534-4fc2-9a4f-102b3bc7ef47';