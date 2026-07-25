-- Add explicit restrictive SELECT policy on waitlist to deny all regular access
-- Service-role client can still read for admin purposes.
CREATE POLICY "Deny all SELECT on waitlist"
ON public.waitlist
FOR SELECT
TO anon, authenticated
USING (false);