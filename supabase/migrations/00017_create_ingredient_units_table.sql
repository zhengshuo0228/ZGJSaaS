
CREATE TABLE IF NOT EXISTS ingredient_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ingredient_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read units" ON ingredient_units FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can insert units" ON ingredient_units FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated can delete units" ON ingredient_units FOR DELETE TO authenticated USING (true);
