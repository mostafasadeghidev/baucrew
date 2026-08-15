#!/bin/sh
set -e

echo "Applying database migrations …"
cd /migrate
./node_modules/.bin/prisma migrate deploy

echo "Checking base data …"
node scripts/bootstrap.mjs

echo "Starting BauCrew …"
cd /app
exec node server.js
