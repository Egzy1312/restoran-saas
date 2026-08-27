#!/usr/bin/env bash
# Redeploy skripta za produkciju na cPanel-u (bez Docker-a, vidi README.md
# "Produkcija na cPanel-u bez Node.js App Manager-a"). Pokrenuti NA SERVERU,
# iz ~/apps/restoran:  bash deploy.sh
#
# Povlaci najnoviji kod sa GitHub-a, instalira nove zavisnosti (ako ih ima),
# ponovo gradi sve servise, kopira Next.js standalone statiku, i reload-uje
# PM2 procese bez prekida (graceful reload, ne restart - kratak downtime).
set -e

cd "$(dirname "$0")"

echo "==> git pull"
git pull origin main

for svc in api websocket-gateway; do
  echo "==> $svc: npm install + build"
  (cd "$svc" && npm install && npm run build)
done

if [ -f api/prisma/schema.prisma ]; then
  echo "==> prisma migrate deploy"
  (cd api && npx prisma generate && npx prisma migrate deploy)
fi

for app in admin pwa kds waiter; do
  echo "==> $app: npm install + build + postbuild (standalone assets)"
  (cd "$app" && npm install && npm run build && npm run postbuild)
done

echo "==> pm2 reload (graceful, bez prekida)"
pm2 reload ecosystem.config.js

echo "==> gotovo. Status:"
pm2 list
