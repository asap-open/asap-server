#!/bin/sh
set -e

echo "🔄 Running database migrations..."
# Use the explicit config flag to avoid ambiguity
npx prisma migrate deploy --config prisma.config.ts

echo "🌱 Seeding database..."
npx prisma db seed --config prisma.config.ts

echo "🚀 Starting server..."
# Using exec ensures the process handles signals correctly
exec yarn start