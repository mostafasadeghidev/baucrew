# ── Build stage ──────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Generate the Prisma client, then build Next.js (standalone output)
RUN npx prisma generate && npm run build

# ── Migration tooling (kept separate from the app bundle) ────
FROM node:24-alpine AS migrate-deps
WORKDIR /migrate
RUN npm init -y >/dev/null && npm install --no-audit --no-fund prisma@^7 dotenv@^17 pg@^8 bcryptjs@^3

# ── Runtime stage ────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Next.js standalone server
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma migrations + CLI (run on container start via entrypoint)
COPY --from=migrate-deps --chown=nextjs:nodejs /migrate /migrate
COPY --chown=nextjs:nodejs prisma /migrate/prisma
COPY --chown=nextjs:nodejs prisma.config.ts /migrate/prisma.config.ts
COPY --chown=nextjs:nodejs scripts/bootstrap.mjs /migrate/scripts/bootstrap.mjs

COPY --chown=nextjs:nodejs docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Uploaded project files (docker-compose mounts a volume here)
RUN mkdir -p /app/storage && chown nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["/docker-entrypoint.sh"]
