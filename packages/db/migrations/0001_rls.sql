-- Row-level security, grants and session-context helpers. See docs/adr/0003-rls-and-session-context.md.
--
-- The API connects as wes_app and, inside every request transaction, runs:
--   SELECT set_config('app.user_id', $1, true), set_config('app.centre_id', $2, true), set_config('app.role', $3, true);
-- Policies below read those settings. wes_app has no BYPASSRLS and owns nothing.

-- Roles: created by infra (docker/postgres/init.sql, Bicep) as LOGIN roles. Create NOLOGIN
-- placeholders when missing so migrations also run in tests and fresh environments.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wes_app') THEN
    CREATE ROLE wes_app NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wes_worker') THEN
    CREATE ROLE wes_worker NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint

CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.user_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.centre_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.centre_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.role', true), '') $$;
--> statement-breakpoint
-- Staff = principal or practitioner in the current centre. The worker may act as 'system'.
CREATE OR REPLACE FUNCTION app.is_staff() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(app.role() IN ('principal', 'practitioner')
                   OR (app.role() = 'system' AND current_user = 'wes_worker'), false) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.is_principal() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(app.role() = 'principal', false) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.in_centre(c uuid) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT c IS NOT NULL AND c = app.centre_id() $$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public, app TO wes_app, wes_worker;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO wes_app, wes_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wes_app, wes_worker;
--> statement-breakpoint
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO wes_app, wes_worker;
--> statement-breakpoint
-- Future tables get the same grants. A test asserts every table also has RLS enabled.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wes_app, wes_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO wes_app, wes_worker;
--> statement-breakpoint
-- Audit log is append-only for application roles.
REVOKE SELECT, UPDATE, DELETE ON audit_log FROM wes_app, wes_worker;
--> statement-breakpoint
-- Catalogue tables: read-only for the API; only the worker (ingestion) and owner write.
REVOKE INSERT, UPDATE, DELETE ON compliance_items, knowledge_sources, knowledge_chunks FROM wes_app;
--> statement-breakpoint

-- Enable RLS on every table except the pre-authentication OTP table (no centre data,
-- codes hashed; access only through the auth module).
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('otp_challenges', '__drizzle_migrations')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- ---------- Centres, people, memberships ----------
CREATE POLICY centres_read ON centres FOR SELECT
  USING (app.in_centre(id) OR app.role() = 'admin');
--> statement-breakpoint
CREATE POLICY centres_update ON centres FOR UPDATE
  USING (app.in_centre(id) AND (app.is_principal() OR app.role() = 'admin'))
  WITH CHECK (app.in_centre(id));
--> statement-breakpoint

CREATE POLICY memberships_read ON memberships FOR SELECT
  USING (app.in_centre(centre_id) OR user_id = app.user_id());
--> statement-breakpoint
CREATE POLICY memberships_write ON memberships FOR ALL
  USING (app.in_centre(centre_id) AND app.is_principal())
  WITH CHECK (app.in_centre(centre_id) AND app.is_principal());
--> statement-breakpoint

-- Users: yourself, or people who share the current centre.
CREATE POLICY users_read ON users FOR SELECT
  USING (
    id = app.user_id()
    OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND app.in_centre(m.centre_id))
  );
--> statement-breakpoint
CREATE POLICY users_update_self ON users FOR UPDATE
  USING (id = app.user_id()) WITH CHECK (id = app.user_id());
--> statement-breakpoint

CREATE POLICY refresh_tokens_own ON refresh_tokens FOR ALL
  USING (user_id = app.user_id()) WITH CHECK (user_id = app.user_id());
--> statement-breakpoint
CREATE POLICY idempotency_own ON idempotency_keys FOR ALL
  USING (user_id = app.user_id()) WITH CHECK (user_id = app.user_id());
--> statement-breakpoint

-- ---------- Staff-only, centre-scoped tables ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invitations', 'groups', 'child_intakes', 'compliance_documents', 'audit_runs',
    'policies', 'weekly_plans', 'printables', 'reminders', 'usage_ledger',
    'agent_runs', 'tool_calls'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %1$s_staff ON %1$I FOR ALL
         USING (app.in_centre(centre_id) AND app.is_staff())
         WITH CHECK (app.in_centre(centre_id) AND app.is_staff())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- ---------- Child data: staff in centre; parents only their own children ----------
-- Funders and platform admins get no child-level rows at all (POPIA minimisation).
CREATE POLICY guardians_staff ON guardians FOR ALL
  USING (app.in_centre(centre_id) AND app.is_staff())
  WITH CHECK (app.in_centre(centre_id) AND app.is_staff());
--> statement-breakpoint
CREATE POLICY guardians_self ON guardians FOR SELECT
  USING (app.role() = 'parent' AND app.in_centre(centre_id) AND user_id = app.user_id());
--> statement-breakpoint

CREATE POLICY child_guardians_staff ON child_guardians FOR ALL
  USING (app.in_centre(centre_id) AND app.is_staff())
  WITH CHECK (app.in_centre(centre_id) AND app.is_staff());
--> statement-breakpoint
CREATE POLICY child_guardians_parent ON child_guardians FOR SELECT
  USING (
    app.role() = 'parent' AND app.in_centre(centre_id)
    AND guardian_id IN (SELECT g.id FROM guardians g WHERE g.user_id = app.user_id())
  );
--> statement-breakpoint

CREATE POLICY children_staff ON children FOR ALL
  USING (app.in_centre(centre_id) AND app.is_staff())
  WITH CHECK (app.in_centre(centre_id) AND app.is_staff());
--> statement-breakpoint
CREATE POLICY children_parent ON children FOR SELECT
  USING (
    app.role() = 'parent' AND app.in_centre(centre_id)
    AND id IN (SELECT cg.child_id FROM child_guardians cg)
  );
--> statement-breakpoint

CREATE POLICY consents_staff ON consents FOR ALL
  USING (app.in_centre(centre_id) AND app.is_staff())
  WITH CHECK (app.in_centre(centre_id) AND app.is_staff());
--> statement-breakpoint
-- Parents can see, grant and revoke their own consents.
CREATE POLICY consents_parent ON consents FOR ALL
  USING (
    app.role() = 'parent' AND app.in_centre(centre_id)
    AND guardian_id IN (SELECT g.id FROM guardians g WHERE g.user_id = app.user_id())
  )
  WITH CHECK (
    app.role() = 'parent' AND app.in_centre(centre_id)
    AND guardian_id IN (SELECT g.id FROM guardians g WHERE g.user_id = app.user_id())
  );
--> statement-breakpoint

CREATE POLICY attendance_staff ON attendance_records FOR ALL
  USING (app.in_centre(centre_id) AND app.is_staff())
  WITH CHECK (app.in_centre(centre_id) AND app.is_staff());
--> statement-breakpoint
CREATE POLICY attendance_parent ON attendance_records FOR SELECT
  USING (
    app.role() = 'parent' AND app.in_centre(centre_id)
    AND child_id IN (SELECT cg.child_id FROM child_guardians cg)
  );
--> statement-breakpoint

-- Anonymous headcounts: staff write; funders may read (aggregate only).
CREATE POLICY daily_counts_staff ON attendance_daily_counts FOR ALL
  USING (app.in_centre(centre_id) AND app.is_staff())
  WITH CHECK (app.in_centre(centre_id) AND app.is_staff());
--> statement-breakpoint
CREATE POLICY daily_counts_funder ON attendance_daily_counts FOR SELECT
  USING (app.role() = 'funder' AND app.in_centre(centre_id));
--> statement-breakpoint

-- ---------- Assistant: you see your own conversations ----------
CREATE POLICY conversations_own ON conversations FOR ALL
  USING (app.in_centre(centre_id) AND user_id = app.user_id())
  WITH CHECK (app.in_centre(centre_id) AND user_id = app.user_id());
--> statement-breakpoint
CREATE POLICY messages_own ON messages FOR ALL
  USING (app.in_centre(centre_id) AND conversation_id IN (SELECT c.id FROM conversations c))
  WITH CHECK (app.in_centre(centre_id) AND conversation_id IN (SELECT c.id FROM conversations c));
--> statement-breakpoint
CREATE POLICY feedback_own ON feedback FOR ALL
  USING (app.in_centre(centre_id) AND user_id = app.user_id())
  WITH CHECK (app.in_centre(centre_id) AND user_id = app.user_id());
--> statement-breakpoint

-- ---------- Shared catalogues ----------
CREATE POLICY compliance_items_read ON compliance_items FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY knowledge_sources_read ON knowledge_sources FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY knowledge_chunks_read ON knowledge_chunks FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY knowledge_sources_worker ON knowledge_sources FOR ALL TO wes_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY knowledge_chunks_worker ON knowledge_chunks FOR ALL TO wes_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY feature_flags_read ON feature_flags FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY activities_read ON activities FOR SELECT
  USING (centre_id IS NULL OR app.in_centre(centre_id));
--> statement-breakpoint
CREATE POLICY activities_write ON activities FOR ALL
  USING (app.in_centre(centre_id) AND app.is_staff())
  WITH CHECK (app.in_centre(centre_id) AND app.is_staff());
--> statement-breakpoint

-- ---------- Audit log: insert-only ----------
CREATE POLICY audit_log_insert ON audit_log FOR INSERT WITH CHECK (true);
