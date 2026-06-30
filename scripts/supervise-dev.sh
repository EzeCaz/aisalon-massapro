#!/bin/bash
# Supervise the Next.js dev server — restart it if it dies.
# Used because the local env has no Postgres DATABASE_URL, so the
# site-settings code throws PrismaClientInitializationError on every
# request (caught gracefully in code, but the dev server sometimes
# crashes anyway).
cd /home/z/my-project
while true; do
  echo "[$(date -Is)] starting next dev..."
  npx next dev -p 3000 2>&1 | tee -a /tmp/next-dev.log
  echo "[$(date -Is)] next dev exited (code $?); restarting in 2s..."
  sleep 2
done
