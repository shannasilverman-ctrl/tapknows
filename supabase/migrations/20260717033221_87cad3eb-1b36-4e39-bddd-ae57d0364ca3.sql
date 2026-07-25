
-- Roles infrastructure
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Alerts
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  action_label TEXT,
  deep_link TEXT,
  entity_type TEXT,
  entity_id TEXT,
  dedupe_key TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  UNIQUE(user_id, dedupe_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own alerts" ON public.alerts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX alerts_user_created_idx ON public.alerts(user_id, created_at DESC);

-- Push subscriptions
CREATE TABLE public.user_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_subscriptions TO authenticated;
GRANT ALL ON public.user_push_subscriptions TO service_role;
ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own push subs" ON public.user_push_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Quarterly category spend tracking (manual entry)
CREATE TABLE public.user_category_spend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_card_id UUID NOT NULL REFERENCES public.user_cards(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL,
  quarter TEXT NOT NULL,
  spend_cents INTEGER NOT NULL DEFAULT 0,
  cap_cents INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, user_card_id, category_key, quarter)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_category_spend TO authenticated;
GRANT ALL ON public.user_category_spend TO service_role;
ALTER TABLE public.user_category_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own category spend" ON public.user_category_spend FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Signup bonus alert tracking
ALTER TABLE public.user_signup_bonuses ADD COLUMN alerts_sent JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Retention: sessions + daily active + alert events
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ping_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_path TEXT,
  entry_source TEXT NOT NULL DEFAULT 'direct',
  alert_id UUID REFERENCES public.alerts(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions insert" ON public.user_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own sessions update" ON public.user_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own sessions select" ON public.user_sessions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX user_sessions_user_started_idx ON public.user_sessions(user_id, started_at DESC);

CREATE TABLE public.user_daily_active (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  PRIMARY KEY (user_id, date)
);
GRANT SELECT, INSERT ON public.user_daily_active TO authenticated;
GRANT ALL ON public.user_daily_active TO service_role;
ALTER TABLE public.user_daily_active ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dau insert" ON public.user_daily_active FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own dau select" ON public.user_daily_active FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES public.alerts(id) ON DELETE SET NULL,
  alert_kind TEXT,
  event TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.alert_events TO authenticated;
GRANT ALL ON public.alert_events TO service_role;
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own alert events insert" ON public.alert_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own alert events select" ON public.alert_events FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX alert_events_created_idx ON public.alert_events(created_at DESC);
