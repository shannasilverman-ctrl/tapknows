
CREATE TABLE public.feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT,
  chips TEXT[] NOT NULL DEFAULT '{}',
  text TEXT,
  app_version TEXT,
  path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT feedback_owner_present CHECK (user_id IS NOT NULL OR client_id IS NOT NULL),
  CONSTRAINT feedback_text_len CHECK (text IS NULL OR char_length(text) <= 2000),
  CONSTRAINT feedback_chips_len CHECK (array_length(chips, 1) IS NULL OR array_length(chips, 1) <= 10)
);

CREATE INDEX feedback_user_id_idx ON public.feedback(user_id);
CREATE INDEX feedback_created_at_idx ON public.feedback(created_at DESC);

GRANT INSERT ON public.feedback TO anon, authenticated;
GRANT SELECT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Anyone can submit; guest rows must set user_id NULL, signed-in rows must match auth.uid().
CREATE POLICY "anyone can insert feedback"
ON public.feedback FOR INSERT
TO anon, authenticated
WITH CHECK (
  (auth.uid() IS NULL AND user_id IS NULL AND client_id IS NOT NULL)
  OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

-- Signed-in users can read only their own feedback.
CREATE POLICY "users read own feedback"
ON public.feedback FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can read everything.
CREATE POLICY "admins read all feedback"
ON public.feedback FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
