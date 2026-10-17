-- Profile photos and centre logos. Visible to whoever can already see that user or centre
-- (the subqueries run under the caller's own RLS); writable only by the user themselves or
-- the centre's principal.
ALTER TABLE profile_images ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE profile_images ADD CONSTRAINT profile_images_size_ck CHECK (octet_length(bytes) <= 524288);
--> statement-breakpoint
ALTER TABLE profile_images ADD CONSTRAINT profile_images_mime_ck
  CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'));
--> statement-breakpoint
-- True when the caller is that user, works at or belongs to a centre with them, or is a
-- platform admin. Independent of which centre the current request is scoped to.
CREATE OR REPLACE FUNCTION app.shares_centre_with(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_user = app.user_id() OR app.is_platform_admin() OR EXISTS (
    SELECT 1 FROM memberships mine JOIN memberships theirs ON theirs.centre_id = mine.centre_id
    WHERE mine.user_id = app.user_id() AND theirs.user_id = p_user
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.shares_centre_with(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.shares_centre_with(uuid) TO wes_app;
--> statement-breakpoint
CREATE POLICY profile_images_read ON profile_images FOR SELECT USING (
  (owner_kind = 'user' AND app.shares_centre_with(owner_id))
  OR (owner_kind = 'centre' AND EXISTS (SELECT 1 FROM centres c WHERE c.id = owner_id))
);
--> statement-breakpoint
CREATE POLICY profile_images_write ON profile_images FOR ALL USING (
  (owner_kind = 'user' AND owner_id = app.user_id())
  OR (owner_kind = 'centre' AND app.in_centre(owner_id) AND app.is_principal())
) WITH CHECK (
  (owner_kind = 'user' AND owner_id = app.user_id())
  OR (owner_kind = 'centre' AND app.in_centre(owner_id) AND app.is_principal())
);
--> statement-breakpoint
REVOKE ALL ON profile_images FROM wes_worker;
