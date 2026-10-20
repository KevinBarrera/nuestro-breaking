-- Activity kind list (#249): an activity's `kind` becomes one of 'competition', 'workshop' and
-- 'social' instead of any non-blank text, because check-in and the admin labels depend on the
-- exact code. Existing rows are normalized first: trimmed, lowercased, and the Spanish labels
-- 'taller' and 'competencia' mapped to their codes. The retired 'battle' kind and its Spanish
-- label 'batalla' map to 'competition', because a battle is the format of a competition. This
-- UPDATE is a data repair, not a catalog edit: it writes no event_catalog_audit row and does not
-- bump `version`. Any row still outside the list stops the migration with its id and kind, so an
-- operator fixes it by hand and runs the migration again.
UPDATE "activities" SET "kind" = "normalized"."kind"
FROM (
  SELECT "id", CASE lower(btrim("kind"))
    WHEN 'taller' THEN 'workshop'
    WHEN 'battle' THEN 'competition'
    WHEN 'batalla' THEN 'competition'
    WHEN 'competencia' THEN 'competition'
    ELSE lower(btrim("kind"))
  END AS "kind"
  FROM "activities"
) AS "normalized"
WHERE "activities"."id" = "normalized"."id" AND "activities"."kind" <> "normalized"."kind";--> statement-breakpoint
DO $$
DECLARE unknown_kinds text;
BEGIN
  SELECT string_agg(format('%s (%s)', "id", "kind"), ', ' ORDER BY "id") INTO unknown_kinds
    FROM "activities" WHERE "kind" NOT IN ('competition', 'workshop', 'social');
  IF unknown_kinds IS NOT NULL THEN
    RAISE EXCEPTION 'activities with a kind outside competition, workshop and social: %. Set each to one of those codes and run the migration again.', unknown_kinds;
  END IF;
END;
$$;--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT "activities_kind_ck";--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_kind_ck" CHECK ("activities"."kind" IN ('competition', 'workshop', 'social'));
