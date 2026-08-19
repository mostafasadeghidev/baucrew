-- Days can be taken out of the plan without losing them (project completed
-- earlier than planned); restoring them reopens the project's schedule.
ALTER TABLE "ScheduleEntry" ADD COLUMN "cancelledAt" TIMESTAMP(3);
CREATE INDEX "ScheduleEntry_cancelledAt_idx" ON "ScheduleEntry"("cancelledAt");
