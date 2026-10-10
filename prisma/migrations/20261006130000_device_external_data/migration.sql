-- What an outside system (Wattro) knows about a device beyond the fields it
-- owns: current location, brand, model, last scan, position, tags.
-- Nullable and written by the sync only; dropping it loses nothing that the
-- next sync would not bring back.
ALTER TABLE "Device" ADD COLUMN "externalData" JSONB;
