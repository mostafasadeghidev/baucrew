-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardColumn" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL,
    "title" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BoardColumn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardColumn_boardId_status_key" ON "BoardColumn"("boardId", "status");

-- AddForeignKey
ALTER TABLE "BoardColumn" ADD CONSTRAINT "BoardColumn_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The board the office already had: its columns come from the old setting, in
-- the order they were dragged into; every status when nothing had been chosen.
INSERT INTO "Board" ("id", "name", "sortOrder", "createdAt", "updatedAt")
VALUES ('board_all', 'Alle', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

DO $$
BEGIN
  INSERT INTO "BoardColumn" ("id", "boardId", "status", "sortOrder")
  SELECT gen_random_uuid()::text, 'board_all', c.status::"ProjectStatus", c.pos - 1
  FROM "AppSetting" a,
       LATERAL jsonb_array_elements_text((a."value")::jsonb -> 'statuses') WITH ORDINALITY AS c(status, pos)
  WHERE a."key" = 'projectBoard'
    AND c.status IN ('LEAD', 'QUOTED', 'APPROVED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'CANCELLED')
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN others THEN
  NULL; -- a setting that is not the JSON it should be: the board gets every column below
END $$;

INSERT INTO "BoardColumn" ("id", "boardId", "status", "sortOrder")
SELECT gen_random_uuid()::text, 'board_all', s.status::"ProjectStatus", s.pos
FROM (VALUES ('LEAD', 0), ('QUOTED', 1), ('APPROVED', 2), ('PLANNED', 3), ('IN_PROGRESS', 4), ('COMPLETED', 5), ('INVOICED', 6), ('PAID', 7), ('CANCELLED', 8)) AS s(status, pos)
WHERE NOT EXISTS (SELECT 1 FROM "BoardColumn" WHERE "boardId" = 'board_all');

DELETE FROM "AppSetting" WHERE "key" = 'projectBoard';
