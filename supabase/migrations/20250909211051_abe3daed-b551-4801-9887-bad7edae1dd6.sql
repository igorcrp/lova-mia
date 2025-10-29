-- Primeiro, atualizar todas as políticas RLS que usam plan_type para usar subscription_tier

-- Atualizar políticas na tabela stock_results
DROP POLICY IF EXISTS "Premium users have full access" ON public.stock_results;
DROP POLICY IF EXISTS "Free users have limited access" ON public.stock_results;

CREATE POLICY "Premium users have full access" ON public.stock_results
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.users 
  WHERE id = auth.uid() AND subscription_tier = 'Premium'
));

CREATE POLICY "Free users have limited access" ON public.stock_results
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.users 
  WHERE id = auth.uid() AND subscription_tier = 'Free'
));

-- Remover política antiga que usa plan_type
DROP POLICY IF EXISTS users_can_update_own_data_secure ON public.users;

-- Migrar dados de plan_type para subscription_tier
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

-- Agora remover a coluna plan_type
ALTER TABLE public.users DROP COLUMN plan_type CASCADE;

-- Recriar política sem plan_type
CREATE POLICY "users_can_update_own_data_secure" ON public.users
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  (auth.uid() = id) AND 
  (level_id = (SELECT users_1.level_id FROM users users_1 WHERE users_1.id = auth.uid())) AND 
  (subscription_tier = (SELECT users_1.subscription_tier FROM users users_1 WHERE users_1.id = auth.uid()))
);