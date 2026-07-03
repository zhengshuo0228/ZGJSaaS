
CREATE OR REPLACE FUNCTION increment_ingredient_usage(ingredient_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE ingredients SET usage_count = usage_count + 1 WHERE id = ingredient_id;
$$;
