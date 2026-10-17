-- Accounts, activity and dashboards (docs/plans/dashboards-accounts-profiles.md).

-- Every user has at least one way to sign in.
ALTER TABLE users ADD CONSTRAINT users_identifier_ck CHECK (phone_e164 IS NOT NULL OR username IS NOT NULL);
--> statement-breakpoint

-- Column-level privileges: the app role can never read password hashes, lockout counters or
-- phone numbers, even for colleagues it may otherwise see. Those go through the functions below.
REVOKE SELECT, INSERT, UPDATE ON users FROM wes_app, wes_worker;
--> statement-breakpoint
GRANT SELECT (id, username, display_name, locale, avatar_blob_key, is_platform_admin, status,
  must_change_password, last_seen_at, created_at, updated_at) ON users TO wes_app, wes_worker;
--> statement-breakpoint
GRANT UPDATE (display_name, locale, avatar_blob_key, updated_at) ON users TO wes_app;
--> statement-breakpoint

-- Activity days: a user may record their own activity; nobody reads rows directly.
ALTER TABLE user_activity_days ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY activity_insert_own ON user_activity_days FOR INSERT WITH CHECK (user_id = app.user_id());
--> statement-breakpoint
REVOKE SELECT, UPDATE, DELETE ON user_activity_days FROM wes_app, wes_worker;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT is_platform_admin AND status = 'active' FROM users WHERE id = app.user_id()), false)
$$;
--> statement-breakpoint

-- ---------- Password sign-in ----------
CREATE OR REPLACE FUNCTION app.auth_password_lookup(p_username text)
RETURNS TABLE (user_id uuid, password_hash text, must_change boolean, locked_until timestamptz, status user_status)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, password_hash, must_change_password, locked_until, status
  FROM users WHERE username = lower(trim(p_username)) AND password_hash IS NOT NULL
$$;
--> statement-breakpoint

-- Record a sign-in attempt; locks the account after too many failures. Returns locked_until.
CREATE OR REPLACE FUNCTION app.auth_password_result(p_user_id uuid, p_ok boolean, p_max_failures integer, p_lock_minutes integer)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_locked timestamptz;
BEGIN
  IF p_ok THEN
    UPDATE users SET failed_logins = 0, locked_until = NULL, last_seen_at = now() WHERE id = p_user_id;
    RETURN NULL;
  END IF;
  UPDATE users SET
    failed_logins = CASE WHEN failed_logins + 1 >= p_max_failures THEN 0 ELSE failed_logins + 1 END,
    locked_until = CASE WHEN failed_logins + 1 >= p_max_failures THEN now() + make_interval(mins => p_lock_minutes) ELSE locked_until END
  WHERE id = p_user_id
  RETURNING locked_until INTO v_locked;
  RETURN v_locked;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.change_own_password(p_hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE users SET password_hash = p_hash, must_change_password = false, failed_logins = 0, locked_until = NULL
  WHERE id = app.user_id()
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.user_status(p_user_id uuid) RETURNS user_status
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT status FROM users WHERE id = p_user_id
$$;
--> statement-breakpoint

-- ---------- User management ----------
-- Platform admins manage anyone; a principal manages practitioners and parents of their centre.
CREATE OR REPLACE FUNCTION app.can_manage_user(p_target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app.is_platform_admin() OR (
    p_target <> app.user_id()
    AND NOT coalesce((SELECT is_platform_admin FROM users WHERE id = p_target), false)
    AND EXISTS (
      SELECT 1 FROM memberships mine JOIN memberships theirs ON theirs.centre_id = mine.centre_id
      WHERE mine.user_id = app.user_id() AND mine.role = 'principal'
        AND theirs.user_id = p_target AND theirs.role IN ('practitioner', 'parent')
    )
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.manage_create_user(
  p_display_name text, p_username text, p_phone text, p_password_hash text, p_centre_id uuid, p_role role
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT (app.is_platform_admin() OR (
      p_role IN ('practitioner', 'parent') AND EXISTS (
        SELECT 1 FROM memberships WHERE user_id = app.user_id() AND centre_id = p_centre_id AND role = 'principal'))) THEN
    RAISE EXCEPTION 'not allowed to add people to this centre' USING ERRCODE = '42501';
  END IF;
  IF p_phone IS NOT NULL THEN
    SELECT id INTO v_user FROM users WHERE phone_e164 = p_phone;
  END IF;
  IF v_user IS NULL THEN
    INSERT INTO users (display_name, username, phone_e164, password_hash, must_change_password)
    VALUES (p_display_name, lower(nullif(trim(p_username), '')), p_phone, p_password_hash, p_password_hash IS NOT NULL)
    RETURNING id INTO v_user;
  ELSIF p_username IS NOT NULL AND p_password_hash IS NOT NULL THEN
    UPDATE users SET username = coalesce(username, lower(trim(p_username))),
      password_hash = p_password_hash, must_change_password = true
    WHERE id = v_user;
  END IF;
  IF p_centre_id IS NOT NULL THEN
    INSERT INTO memberships (user_id, centre_id, role) VALUES (v_user, p_centre_id, p_role)
    ON CONFLICT (user_id, centre_id) DO UPDATE SET role = excluded.role;
  END IF;
  RETURN v_user;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.manage_set_password(p_user_id uuid, p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app.can_manage_user(p_user_id) THEN
    RAISE EXCEPTION 'not allowed to manage this person' USING ERRCODE = '42501';
  END IF;
  UPDATE users SET password_hash = p_hash, must_change_password = true, failed_logins = 0, locked_until = NULL
  WHERE id = p_user_id AND username IS NOT NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = p_user_id AND revoked_at IS NULL;
  RETURN true;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.manage_set_status(p_user_id uuid, p_status user_status) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app.can_manage_user(p_user_id) THEN
    RAISE EXCEPTION 'not allowed to manage this person' USING ERRCODE = '42501';
  END IF;
  UPDATE users SET status = p_status WHERE id = p_user_id;
  IF p_status = 'deactivated' THEN
    UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = p_user_id AND revoked_at IS NULL;
  END IF;
END $$;
--> statement-breakpoint

-- People a caller may manage, with masked phones only.
CREATE OR REPLACE FUNCTION app.manage_list_users(p_centre_id uuid)
RETURNS TABLE (user_id uuid, display_name text, username text, phone_masked text, role role, centre_id uuid,
               centre_name text, status user_status, last_seen_at timestamptz, must_change boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.display_name, u.username,
         CASE WHEN u.phone_e164 IS NULL THEN NULL
              ELSE substr(u.phone_e164, 1, 5) || ' *** **' || right(u.phone_e164, 2) END,
         m.role, m.centre_id, c.name, u.status, u.last_seen_at, u.must_change_password
  FROM memberships m JOIN users u ON u.id = m.user_id JOIN centres c ON c.id = m.centre_id
  WHERE (p_centre_id IS NULL OR m.centre_id = p_centre_id)
    AND (app.is_platform_admin() OR EXISTS (
          SELECT 1 FROM memberships mine WHERE mine.user_id = app.user_id()
            AND mine.centre_id = m.centre_id AND mine.role = 'principal'))
  ORDER BY c.name, m.role, u.display_name
$$;
--> statement-breakpoint

-- ---------- Centre dashboard (staff of that centre) ----------
CREATE OR REPLACE FUNCTION app.centre_dashboard(p_centre_id uuid, p_from date, p_to date, p_weeks integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT (app.in_centre(p_centre_id) AND app.role() IN ('principal', 'practitioner')) THEN
    RAISE EXCEPTION 'not allowed to view this dashboard' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'registrationStatus', (SELECT registration_status FROM centres WHERE id = p_centre_id),
    'childrenActive', (SELECT count(*) FROM children WHERE centre_id = p_centre_id AND status = 'active'),
    'awaitingConsent', (SELECT count(*) FROM child_intakes WHERE centre_id = p_centre_id),
    'consentsGranted', (SELECT count(*) FROM consents WHERE centre_id = p_centre_id AND granted_at::date BETWEEN p_from AND p_to),
    'staff', (SELECT count(*) FROM memberships WHERE centre_id = p_centre_id AND role IN ('principal', 'practitioner')),
    'parentsLinked', (SELECT count(*) FROM memberships WHERE centre_id = p_centre_id AND role = 'parent'),
    'wesQuestions', (SELECT count(*) FROM messages WHERE centre_id = p_centre_id AND role = 'user' AND created_at::date BETWEEN p_from AND p_to),
    'wesHelpful', (SELECT count(*) FROM feedback WHERE centre_id = p_centre_id AND rating = 'up' AND created_at::date BETWEEN p_from AND p_to),
    'wesNotHelpful', (SELECT count(*) FROM feedback WHERE centre_id = p_centre_id AND rating = 'down' AND created_at::date BETWEEN p_from AND p_to),
    'attendanceRate', (SELECT round(100.0 * count(*) FILTER (WHERE status = 'present') / nullif(count(*), 0), 1)
                       FROM attendance_records WHERE centre_id = p_centre_id AND day BETWEEN p_from AND p_to),
    'weekly', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'weekStart', w.week_start,
        'wesQuestions', (SELECT count(*) FROM messages WHERE centre_id = p_centre_id AND role = 'user'
                         AND created_at >= w.week_start AND created_at < w.week_start + 7),
        'childrenAdded', (SELECT count(*) FROM consents WHERE centre_id = p_centre_id
                          AND granted_at >= w.week_start AND granted_at < w.week_start + 7),
        'attendanceRate', (SELECT round(100.0 * count(*) FILTER (WHERE status = 'present') / nullif(count(*), 0), 1)
                           FROM attendance_records WHERE centre_id = p_centre_id
                           AND day >= w.week_start AND day < w.week_start + 7)
      ) ORDER BY w.week_start)
      FROM (SELECT (date_trunc('week', p_to::timestamp) - make_interval(weeks => g))::date AS week_start
            FROM generate_series(0, greatest(p_weeks, 1) - 1) AS g) w
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
--> statement-breakpoint

-- ---------- Platform dashboard (Dala admins; aggregates only, never child rows) ----------
CREATE OR REPLACE FUNCTION app.filtered_centres(p_province text, p_city text, p_size text, p_status text)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM centres
  WHERE (p_province IS NULL OR province::text = p_province)
    AND (p_city IS NULL OR city ILIKE p_city)
    AND (p_status IS NULL OR registration_status::text = p_status)
    AND (p_size IS NULL
         OR (p_size = 'small' AND child_count < 20)
         OR (p_size = 'medium' AND child_count BETWEEN 20 AND 50)
         OR (p_size = 'large' AND child_count > 50))
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.platform_dashboard(
  p_from date, p_to date, p_province text, p_city text, p_size text, p_status text, p_role text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT app.is_platform_admin() THEN
    RAISE EXCEPTION 'platform admins only' USING ERRCODE = '42501';
  END IF;

  WITH fc AS (SELECT * FROM app.filtered_centres(p_province, p_city, p_size, p_status) AS id),
  members AS (
    SELECT DISTINCT m.user_id FROM memberships m
    WHERE m.centre_id IN (SELECT id FROM fc) AND (p_role IS NULL OR m.role::text = p_role)
  ),
  activity AS (
    SELECT a.* FROM user_activity_days a
    WHERE a.user_id IN (SELECT user_id FROM members)
  ),
  runs AS (
    SELECT r.* FROM agent_runs r
    WHERE r.centre_id IN (SELECT id FROM fc) AND r.created_at::date BETWEEN p_from AND p_to
  ),
  fb AS (
    SELECT f.* FROM feedback f
    WHERE f.centre_id IN (SELECT id FROM fc) AND f.created_at::date BETWEEN p_from AND p_to
  )
  SELECT jsonb_build_object(
    'centres', jsonb_build_object(
      'total', (SELECT count(*) FROM fc),
      'new', (SELECT count(*) FROM centres WHERE id IN (SELECT id FROM fc) AND created_at::date BETWEEN p_from AND p_to),
      'byProvince', coalesce((SELECT jsonb_agg(jsonb_build_object('label', province, 'count', n) ORDER BY n DESC)
                              FROM (SELECT province, count(*) n FROM centres WHERE id IN (SELECT id FROM fc) GROUP BY province) x), '[]'::jsonb),
      'funnel', coalesce((SELECT jsonb_agg(jsonb_build_object('label', s, 'count', n))
                          FROM (SELECT registration_status s, count(*) n FROM centres WHERE id IN (SELECT id FROM fc) GROUP BY 1) x), '[]'::jsonb),
      'childrenActive', (SELECT count(*) FROM children WHERE centre_id IN (SELECT id FROM fc) AND status = 'active')
    ),
    'users', jsonb_build_object(
      'total', (SELECT count(*) FROM members),
      'new', (SELECT count(*) FROM users WHERE id IN (SELECT user_id FROM members) AND created_at::date BETWEEN p_from AND p_to),
      'dau', (SELECT count(DISTINCT user_id) FROM activity WHERE day = p_to),
      'wau', (SELECT count(DISTINCT user_id) FROM activity WHERE day > p_to - 7 AND day <= p_to),
      'mau', (SELECT count(DISTINCT user_id) FROM activity WHERE day > p_to - 30 AND day <= p_to),
      'daily', coalesce((SELECT jsonb_agg(jsonb_build_object('day', d, 'active', n) ORDER BY d)
                         FROM (SELECT day d, count(DISTINCT user_id) n FROM activity WHERE day BETWEEN p_from AND p_to GROUP BY day) x), '[]'::jsonb),
      'retention', coalesce((
        SELECT jsonb_agg(jsonb_build_object('cohort', cohort, 'size', size, 'month1', m1, 'month2', m2) ORDER BY cohort)
        FROM (
          SELECT to_char(date_trunc('month', u.created_at), 'YYYY-MM') AS cohort, count(*) AS size,
                 count(*) FILTER (WHERE EXISTS (SELECT 1 FROM activity a WHERE a.user_id = u.id
                   AND date_trunc('month', a.day) = date_trunc('month', u.created_at) + interval '1 month')) AS m1,
                 count(*) FILTER (WHERE EXISTS (SELECT 1 FROM activity a WHERE a.user_id = u.id
                   AND date_trunc('month', a.day) = date_trunc('month', u.created_at) + interval '2 month')) AS m2
          FROM users u WHERE u.id IN (SELECT user_id FROM members)
            AND u.created_at >= date_trunc('month', p_to::timestamp) - interval '5 month'
          GROUP BY 1
        ) c), '[]'::jsonb)
    ),
    'wes', jsonb_build_object(
      'questions', (SELECT count(*) FROM runs),
      'costUsd', (SELECT round(coalesce(sum(cost_micro_usd), 0) / 1000000.0, 4) FROM runs),
      'tokens', (SELECT coalesce(sum(input_tokens + output_tokens), 0) FROM runs),
      'avgLatencyMs', (SELECT round(avg(latency_ms)) FROM runs),
      'errors', (SELECT count(*) FROM runs WHERE error IS NOT NULL),
      'escalations', (SELECT count(*) FROM runs WHERE escalated),
      'topIntents', coalesce((SELECT jsonb_agg(jsonb_build_object('label', intent, 'count', n) ORDER BY n DESC)
                              FROM (SELECT intent, count(*) n FROM runs WHERE intent IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8) x), '[]'::jsonb),
      'feedback', jsonb_build_object(
        'up', (SELECT count(*) FROM fb WHERE rating = 'up'),
        'down', (SELECT count(*) FROM fb WHERE rating = 'down'),
        'reasons', coalesce((SELECT jsonb_agg(jsonb_build_object('label', reason, 'count', n) ORDER BY n DESC)
                             FROM (SELECT reason, count(*) n FROM fb WHERE rating = 'down' AND reason IS NOT NULL GROUP BY 1) x), '[]'::jsonb)
      )
    )
  ) INTO result;
  RETURN result;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.platform_centres(
  p_from date, p_to date, p_province text, p_city text, p_size text, p_status text, p_limit integer
) RETURNS TABLE (centre_id uuid, name text, province text, city text, registration_status text, children bigint,
                 staff bigint, wes_questions bigint, cost_usd numeric, last_active date, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app.is_platform_admin() THEN
    RAISE EXCEPTION 'platform admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.id, c.name, c.province::text, c.city, c.registration_status::text,
         (SELECT count(*) FROM children ch WHERE ch.centre_id = c.id AND ch.status = 'active'),
         (SELECT count(*) FROM memberships m WHERE m.centre_id = c.id AND m.role IN ('principal', 'practitioner')),
         (SELECT count(*) FROM agent_runs r WHERE r.centre_id = c.id AND r.created_at::date BETWEEN p_from AND p_to),
         (SELECT round(coalesce(sum(r.cost_micro_usd), 0) / 1000000.0, 4) FROM agent_runs r
           WHERE r.centre_id = c.id AND r.created_at::date BETWEEN p_from AND p_to),
         (SELECT max(a.day) FROM user_activity_days a WHERE a.centre_id = c.id),
         c.created_at
  FROM centres c
  WHERE c.id IN (SELECT * FROM app.filtered_centres(p_province, p_city, p_size, p_status))
  ORDER BY c.created_at DESC
  LIMIT greatest(least(p_limit, 500), 1);
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.is_platform_admin(), app.auth_password_lookup(text),
  app.auth_password_result(uuid, boolean, integer, integer), app.change_own_password(text), app.user_status(uuid),
  app.can_manage_user(uuid), app.manage_create_user(text, text, text, text, uuid, role),
  app.manage_set_password(uuid, text), app.manage_set_status(uuid, user_status), app.manage_list_users(uuid),
  app.centre_dashboard(uuid, date, date, integer), app.filtered_centres(text, text, text, text),
  app.platform_dashboard(date, date, text, text, text, text, text),
  app.platform_centres(date, date, text, text, text, text, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.is_platform_admin(), app.auth_password_lookup(text),
  app.auth_password_result(uuid, boolean, integer, integer), app.change_own_password(text), app.user_status(uuid),
  app.can_manage_user(uuid), app.manage_create_user(text, text, text, text, uuid, role),
  app.manage_set_password(uuid, text), app.manage_set_status(uuid, user_status), app.manage_list_users(uuid),
  app.centre_dashboard(uuid, date, date, integer), app.filtered_centres(text, text, text, text),
  app.platform_dashboard(date, date, text, text, text, text, text),
  app.platform_centres(date, date, text, text, text, text, integer) TO wes_app;
