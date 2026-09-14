#!/bin/bash
set -e

# WORKDIR may be packages/backend when the container starts; run migrate from monorepo root.
if [ -f /usr/app/pnpm-workspace.yaml ]; then
    cd /usr/app
fi

# Migrate db before starting the app (includes merge / cache / table_groups migrations).
pnpm -F backend migrate-production

# Restore dockerfile WORKDIR so CMD `node dist/index.js` resolves correctly.
cd /usr/app/packages/backend

# Run prod
exec "$@"
