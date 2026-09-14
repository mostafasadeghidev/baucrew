-- A project imported from a Trello card whose id was kept as its external id
-- (24 hex characters) is linked to that card. A project whose external id is
-- the job number from the card title is not: it is linked the first time an
-- automation sends the card, matched by the card's short link.
INSERT INTO "ProjectLink" ("id", "projectId", "system", "externalId", "url", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", 'trello', p."externalId", p."externalUrl", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Project" p
WHERE p."externalSystem" = 'trello' AND p."externalId" ~ '^[0-9a-f]{24}$'
ON CONFLICT DO NOTHING;
