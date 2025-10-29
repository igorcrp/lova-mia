-- Additional security measures for subscribers table
-- Remove any remaining public access and ensure strict user isolation

-- Drop all existing policies to start clean
DROP POLICY IF EXISTS "subscribers_select_own_only" ON public.subscribers;
DROP POLICY IF EXISTS "subscribers_insert_own_only" ON public.subscribers;
DROP POLICY IF EXISTS "subscribers_update_own_only" ON public.subscribers;
DROP POLICY IF EXISTS "admin_manage_subscribers" ON public.subscribers;

-- Create ultra-secure RLS policies that require both authentication AND user_id match
CREATE POLICY "subscribers_strict_select" 
ON public.subscribers 
FOR SELECT 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND user_id = auth.uid()
);

CREATE POLICY "subscribers_strict_insert" 
ON public.subscribers 
FOR INSERT 
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND user_id = auth.uid()
  AND user_id IS NOT NULL
);

CREATE POLICY "subscribers_strict_update" 
ON public.subscribers 
FOR UPDATE 
TO authenticated
USING (
  auth.uid() IS NOT NULL 
  AND user_id = auth.uid()
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND user_id = auth.uid()
  AND user_id IS NOT NULL
);

-- Admin access with strict level check
CREATE POLICY "admin_strict_subscribers" 
ON public.subscribers 
FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND level_id >= 2
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND level_id >= 2
  )
);

-- Ensure RLS is enabled
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;