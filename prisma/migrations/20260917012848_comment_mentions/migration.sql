-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- A webhook that listens for every event so far hears of comments too.
UPDATE "WebhookEndpoint"
SET "events" = array_append("events", 'comment.created')
WHERE "events" @> ARRAY['project.created', 'project.status_changed', 'project.updated', 'project.deleted', 'invoice.ready']::TEXT[]
  AND NOT ('comment.created' = ANY("events"));
