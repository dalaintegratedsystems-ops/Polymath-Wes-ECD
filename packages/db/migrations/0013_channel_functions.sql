-- WhatsApp channel (Milestone 6). The webhook runs without a signed-in user, so each thing it
-- needs is a narrow, definer function: nothing else is readable from that context.
ALTER TABLE channel_inbound ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON channel_inbound FROM wes_app, wes_worker;
--> statement-breakpoint

-- True the first time a provider message id is seen; false for Meta's retries.
CREATE OR REPLACE FUNCTION app.channel_claim_inbound(p_id text, p_channel text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO channel_inbound (provider_message_id, channel) VALUES (p_id, p_channel)
  ON CONFLICT (provider_message_id) DO NOTHING;
  RETURN FOUND;
END $$;
--> statement-breakpoint

-- Who is writing from this number, and in which centre (principal first, then practitioner,
-- then parent). Active accounts only. Returns no row for unknown numbers.
CREATE OR REPLACE FUNCTION app.channel_lookup_user(p_phone text)
RETURNS TABLE (user_id uuid, display_name text, centre_id uuid, centre_name text, role role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.display_name, m.centre_id, c.name, m.role
  FROM users u
  JOIN memberships m ON m.user_id = u.id
  JOIN centres c ON c.id = m.centre_id
  WHERE u.phone_e164 = p_phone AND u.status = 'active'
  ORDER BY CASE m.role WHEN 'principal' THEN 1 WHEN 'practitioner' THEN 2 WHEN 'parent' THEN 3 ELSE 4 END,
           m.created_at
  LIMIT 1
$$;
--> statement-breakpoint

-- Reminders that are due, claimed atomically (safe with several API replicas), with the
-- phone number and the time of the person's last WhatsApp message (for the 24-hour window).
CREATE OR REPLACE FUNCTION app.claim_due_reminders(p_now timestamptz, p_limit integer)
RETURNS TABLE (reminder_id uuid, centre_id uuid, message text, phone text, last_inbound_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT r.id FROM reminders r
    WHERE r.sent_at IS NULL AND r.due_at <= p_now
    ORDER BY r.due_at
    LIMIT greatest(least(p_limit, 200), 1)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE reminders r SET sent_at = p_now FROM due WHERE r.id = due.id
    RETURNING r.id, r.centre_id, r.message, r.user_id
  )
  SELECT cl.id, cl.centre_id, cl.message, u.phone_e164,
         (SELECT max(cv.last_inbound_at) FROM conversations cv
           WHERE cv.user_id = cl.user_id AND cv.channel = 'whatsapp')
  FROM claimed cl
  LEFT JOIN users u ON u.id = cl.user_id AND u.status = 'active';
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.channel_claim_inbound(text, text), app.channel_lookup_user(text),
  app.claim_due_reminders(timestamptz, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.channel_claim_inbound(text, text), app.channel_lookup_user(text),
  app.claim_due_reminders(timestamptz, integer) TO wes_app;
