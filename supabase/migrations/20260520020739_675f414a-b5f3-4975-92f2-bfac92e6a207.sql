ALTER TABLE public.cards_catalog
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS cards_catalog_user_id_idx ON public.cards_catalog(user_id);

DROP POLICY IF EXISTS catalogs_select_authenticated_cc ON public.cards_catalog;

CREATE POLICY cards_catalog_select_visible
  ON public.cards_catalog
  FOR SELECT
  TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY cards_catalog_insert_own
  ON public.cards_catalog
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_custom = true);

CREATE POLICY cards_catalog_update_own
  ON public.cards_catalog
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND is_custom = true)
  WITH CHECK (user_id = auth.uid() AND is_custom = true);

CREATE POLICY cards_catalog_delete_own
  ON public.cards_catalog
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND is_custom = true);