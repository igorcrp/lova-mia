-- Function to check if a table exists
CREATE OR REPLACE FUNCTION public.table_exists(p_table_name text)
RETURNS BOOLEAN 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = p_table_name
  );
END;
$$;

-- Function to get unique stock codes from a specific table
CREATE OR REPLACE FUNCTION public.get_unique_stock_codes(p_table_name text)
RETURNS SETOF text 
LANGUAGE plpgsql
AS $$
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
$$;

-- Function to get stock data from a specific table
CREATE OR REPLACE FUNCTION public.get_stock_data(p_table_name text, p_stock_code_param text, p_limit_rows int DEFAULT 300)
RETURNS json
LANGUAGE plpgsql
AS $$
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
$$;

-- Trigger function to update user status after email confirmation
CREATE OR REPLACE FUNCTION public.handle_auth_user_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If email_confirmed_at is set and not null, update status_users to 'active'
  IF NEW.email_confirmed_at IS NOT NULL AND 
     (OLD.email_confirmed_at IS NULL OR OLD.email_confirmed_at <> NEW.email_confirmed_at) THEN
    
    UPDATE public.users
    SET status_users = 'active'
    WHERE id = NEW.id;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users table to handle email confirmation
DROP TRIGGER IF EXISTS on_auth_user_confirmation ON auth.users;
CREATE TRIGGER on_auth_user_confirmation
AFTER UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_confirmation();

-- Function to ensure new users have level_id=1 and status_users='pending'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set default values for new users
  NEW.level_id := COALESCE(NEW.level_id, 1);
  NEW.status_users := COALESCE(NEW.status_users, 'pending');
  
  RETURN NEW;
END;
$$;

-- Create trigger on public.users table to handle new user defaults
DROP TRIGGER IF EXISTS on_new_user ON public.users;
CREATE TRIGGER on_new_user
BEFORE INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Enable Row Level Security on public.users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own data
CREATE POLICY users_select_own ON public.users
    FOR SELECT
    USING (auth.uid() = id);

-- Create policy for users to update their own data
CREATE POLICY users_update_own ON public.users
    FOR UPDATE
    USING (auth.uid() = id);

-- Create policy for authentication service to select users for login
CREATE POLICY auth_select_users ON public.users
    FOR SELECT
    TO authenticated, anon
    USING (true);

-- Create policy for authentication service to insert new users
CREATE POLICY auth_insert_users ON public.users
    FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

-- Create policy for admins to manage all users
CREATE POLICY admin_manage_users ON public.users
    FOR ALL
    TO authenticated
    USING (auth.jwt() ->> 'level_id' = '2');

-- Function to get current user data
CREATE OR REPLACE FUNCTION public.get_current_user()
RETURNS SETOF public.users
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT * FROM public.users WHERE id = auth.uid();
$$;

-- Function to check if user exists by email
CREATE OR REPLACE FUNCTION public.check_user_by_email(p_email text)
RETURNS TABLE (
    exists boolean,
    status_users text,
    level_id integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) > 0 as exists,
        u.status_users,
        u.level_id
    FROM public.users u
    WHERE u.email = p_email
    GROUP BY u.status_users, u.level_id;
END;
$$;
