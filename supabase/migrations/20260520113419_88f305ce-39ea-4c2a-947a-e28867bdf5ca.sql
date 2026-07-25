-- Remove the overly broad SELECT policy on waitlist
-- Waitlist entries should not be readable by authenticated users;
-- admin access should use service-role client only.
DROP POLICY IF EXISTS "Authenticated users can view waitlist" ON public.waitlist;