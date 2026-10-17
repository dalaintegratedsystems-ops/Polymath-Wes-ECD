-- Milestone 1: narrowly scoped SECURITY DEFINER functions for the few operations that cannot
-- run under a centre context: signing in (no user yet), listing a user's own centres, creating a
-- centre, linking a guardian's phone to their account, and withdrawing consent atomically.
-- Each function checks the caller itself and is executable only by wes_app. See ADR-0003.

-- Sign-in: find or create a user by phone. Called only after the OTP has been verified.
CREATE OR REPLACE FUNCTION app.auth_upsert_user(p_phone text, p_display_name text)
RETURNS TABLE (user_id uuid, is_new boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  SELECT u.id INTO v_id FROM users u WHERE u.phone_e164 = p_phone;
  IF v_id IS NOT NULL THEN
    UPDATE users SET last_seen_at = now() WHERE id = v_id;
    RETURN QUERY SELECT v_id, false;
    RETURN;
  END IF;
  INSERT INTO users (phone_e164, display_name, last_seen_at)
  VALUES (p_phone, coalesce(nullif(trim(p_display_name), ''), 'Friend'), now())
  RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, true;
END $$;
--> statement-breakpoint

-- A guardian who signs in with the phone a centre recorded becomes a parent member there.
CREATE OR REPLACE FUNCTION app.auth_link_guardians(p_user_id uuid, p_blind_index text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  UPDATE guardians SET user_id = p_user_id
  WHERE phone_blind_index = p_blind_index AND user_id IS NULL;
  INSERT INTO memberships (user_id, centre_id, role)
  SELECT DISTINCT p_user_id, g.centre_id, 'parent'::role
  FROM guardians g WHERE g.user_id = p_user_id
  ON CONFLICT (user_id, centre_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
--> statement-breakpoint

-- The signed-in user's centres and roles (for the centre picker), across centres.
CREATE OR REPLACE FUNCTION app.my_memberships()
RETURNS TABLE (centre_id uuid, centre_name text, role role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.centre_id, c.name, m.role
  FROM memberships m JOIN centres c ON c.id = m.centre_id
  WHERE m.user_id = app.user_id()
  ORDER BY c.name
$$;
--> statement-breakpoint

-- Onboarding: the signed-in user creates a centre and becomes its principal and designated
-- safeguarding person (they can hand that role on later).
CREATE OR REPLACE FUNCTION app.onboard_centre(
  p_name text, p_address_line text, p_suburb text, p_city text, p_province province,
  p_min_months integer, p_max_months integer, p_child_count integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := app.user_id(); v_centre uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  INSERT INTO centres (name, address_line, suburb, city, province, ages_served_min_months,
                       ages_served_max_months, child_count, registration_status,
                       designated_safeguarding_user_id)
  VALUES (p_name, p_address_line, p_suburb, p_city, p_province, p_min_months, p_max_months,
          p_child_count, 'in_progress', v_user)
  RETURNING id INTO v_centre;
  INSERT INTO memberships (user_id, centre_id, role) VALUES (v_user, v_centre, 'principal');
  RETURN v_centre;
END $$;
--> statement-breakpoint

-- Withdraw consent: delete the child's identifiable records, keep anonymous daily headcounts
-- (Milestone 0 decision #1), and remove guardians who no longer have a child at the centre.
CREATE OR REPLACE FUNCTION app.revoke_child_consent(p_child_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_centre uuid;
BEGIN
  SELECT c.centre_id INTO v_centre FROM children c WHERE c.id = p_child_id;
  IF v_centre IS NULL OR v_centre IS DISTINCT FROM app.centre_id() THEN
    RETURN false;
  END IF;
  IF NOT (app.is_staff() OR (app.role() = 'parent' AND EXISTS (
      SELECT 1 FROM child_guardians cg JOIN guardians g ON g.id = cg.guardian_id
      WHERE cg.child_id = p_child_id AND g.user_id = app.user_id()))) THEN
    RAISE EXCEPTION 'not allowed to withdraw consent for this child' USING ERRCODE = '42501';
  END IF;

  INSERT INTO attendance_daily_counts (centre_id, day, present_count, enrolled_count)
  SELECT v_centre, a.day, count(*) FILTER (WHERE a.status = 'present'), count(*)
  FROM attendance_records a
  WHERE a.centre_id = v_centre
    AND a.day IN (SELECT r.day FROM attendance_records r WHERE r.child_id = p_child_id)
  GROUP BY a.day
  ON CONFLICT (centre_id, day) DO UPDATE SET
    present_count = greatest(attendance_daily_counts.present_count, excluded.present_count),
    enrolled_count = greatest(attendance_daily_counts.enrolled_count, excluded.enrolled_count);

  UPDATE consents SET revoked_at = now() WHERE child_id = p_child_id AND revoked_at IS NULL;

  DELETE FROM memberships m
  USING guardians g
  WHERE m.user_id = g.user_id AND m.centre_id = v_centre AND m.role = 'parent'
    AND g.id IN (SELECT cg.guardian_id FROM child_guardians cg WHERE cg.child_id = p_child_id)
    AND NOT EXISTS (SELECT 1 FROM child_guardians o WHERE o.guardian_id = g.id AND o.child_id <> p_child_id);

  DELETE FROM guardians g
  WHERE g.id IN (SELECT cg.guardian_id FROM child_guardians cg WHERE cg.child_id = p_child_id)
    AND NOT EXISTS (SELECT 1 FROM child_guardians o WHERE o.guardian_id = g.id AND o.child_id <> p_child_id);

  DELETE FROM child_intakes WHERE child_id = p_child_id;
  DELETE FROM children WHERE id = p_child_id;
  RETURN true;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.auth_upsert_user(text, text), app.auth_link_guardians(uuid, text),
  app.my_memberships(), app.onboard_centre(text, text, text, text, province, integer, integer, integer),
  app.revoke_child_consent(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.auth_upsert_user(text, text), app.auth_link_guardians(uuid, text),
  app.my_memberships(), app.onboard_centre(text, text, text, text, province, integer, integer, integer),
  app.revoke_child_consent(uuid) TO wes_app;
