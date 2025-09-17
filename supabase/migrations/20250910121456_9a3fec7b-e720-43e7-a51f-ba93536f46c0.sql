-- Fix search path vulnerabilities in database functions
-- This prevents SQL injection attacks through schema manipulation

-- Update get_stock_data function with secure search path
CREATE OR REPLACE FUNCTION public.get_stock_data(p_table_name text, p_stock_code_param text, p_limit_rows integer DEFAULT 300)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  query_text text;
  result_json json;
BEGIN
  -- Validate the table exists to prevent SQL injection
  IF NOT (SELECT table_exists(p_table_name)) THEN
    RAISE EXCEPTION 'Table % does not exist', p_table_name;
  END IF;
  
  -- Dynamic SQL to get stock data
  query_text := format('
    SELECT json_agg(t) 
    FROM (
      SELECT * FROM %I 
      WHERE stock_code = $1 
      ORDER BY date DESC 
      LIMIT $2
    ) t', p_table_name);
  
  -- Execute the query
  EXECUTE query_text INTO result_json USING p_stock_code_param, p_limit_rows;
  
  -- Return empty array if null
  IF result_json IS NULL THEN
    result_json := '[]'::json;
  END IF;
  
  RETURN result_json;
END;
$function$;

-- Update get_unique_stock_codes function with secure search path
CREATE OR REPLACE FUNCTION public.get_unique_stock_codes(p_table_name text)
 RETURNS SETOF text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  query_text text;
  result_row text;
BEGIN
  -- Validate the table exists to prevent SQL injection
  IF NOT (SELECT table_exists(p_table_name)) THEN
    RAISE EXCEPTION 'Table % does not exist', p_table_name;
  END IF;
  
  -- Dynamic SQL to get unique stock codes
  query_text := format('SELECT DISTINCT stock_code FROM %I ORDER BY stock_code', p_table_name);
  
  -- Execute the query and return results
  FOR result_row IN EXECUTE query_text
  LOOP
    RETURN NEXT result_row;
  END LOOP;
  
  RETURN;
END;
$function$;

-- Update table_exists function with secure search path
CREATE OR REPLACE FUNCTION public.table_exists(p_table_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = p_table_name
  );
END;
$function$;

-- Update other security definer functions to include secure search path
CREATE OR REPLACE FUNCTION public.current_user_level()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  RETURN (
    SELECT COALESCE(level_id, 1) FROM public.users 
    WHERE id = auth.uid()
  );
END;
$function$;

-- Update get_current_user function with secure search path
CREATE OR REPLACE FUNCTION public.get_current_user()
 RETURNS TABLE(id uuid, email text, name text, status_users text, level_id integer, plan_type text, email_verified boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
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
END;$function$;

-- Update all other security definer functions with proper search path
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND level_id >= 2
  );
END;
$function$;

-- Update update_user_level_admin_only function with secure search path  
CREATE OR REPLACE FUNCTION public.update_user_level_admin_only(target_user_id uuid, new_level integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  -- Check if current user is admin (level >= 2)
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND level_id >= 2
  ) THEN
    RAISE EXCEPTION 'Only administrators can update user levels';
  END IF;
  
  -- Update the target user's level
  UPDATE public.users 
  SET level_id = new_level, updated_at = now()
  WHERE id = target_user_id;
END;
$function$;