-- An API key may be limited to part of the app: "feedback" opens only the
-- feedback tools over MCP. Existing keys stay as they were (null = everything).
ALTER TABLE "ApiKey" ADD COLUMN "scope" TEXT;
