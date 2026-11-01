#!/bin/sh
cd "$(dirname "$0")"
[ -f .env.local ] || cp .env.example .env.local
echo "Навигатор: http://localhost:8080"
node server/serve.mjs
