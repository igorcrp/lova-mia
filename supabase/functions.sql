
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
