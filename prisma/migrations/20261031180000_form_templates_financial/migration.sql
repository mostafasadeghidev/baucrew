-- A form template — and every form made from it — may hold prices, a
-- contract's sums say; such forms are seen only by users who may see money.
ALTER TABLE "FormTemplate" ADD COLUMN "financial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FilledForm" ADD COLUMN "financial" BOOLEAN NOT NULL DEFAULT false;
