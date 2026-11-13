#!/usr/bin/env bash
# Deploys Wegbuch to the server.
#   bun run deploy            check, build, upload, restart, verify
#   bun run deploy status     what is running, and which commit
#   bun run deploy logs       the last log lines of the app
#   bun run deploy reset      wipe the demo data now (the next start seeds the demo team again)
#   bun run deploy pause      stop the automatic reset timer (e.g. during a live demo)
#   bun run deploy resume     start the automatic reset timer again
# Settings (host, address) live in .env.deploy, which git ignores. See .env.example.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.deploy ]; then
	echo "Missing .env.deploy. Copy .env.example to .env.deploy and fill it in." >&2
	exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env.deploy
set +a
: "${DEPLOY_HOST:?Set DEPLOY_HOST in .env.deploy}"
: "${DEPLOY_DOMAIN:?Set DEPLOY_DOMAIN in .env.deploy}"
APP_DIR="${DEPLOY_APP_DIR:-/opt/wegbuch/app}"
APP_USER="${DEPLOY_APP_USER:-wegbuch}"
SERVICE="${DEPLOY_SERVICE:-wegbuch}"
remote() { ssh -o BatchMode=yes -o ConnectTimeout=15 "$DEPLOY_HOST" "$@"; }

case "${1:-deploy}" in
	status)
		remote "echo \"app: \$(systemctl is-active $SERVICE)\"; echo \"deployed: \$(cat $APP_DIR/DEPLOYED 2>/dev/null || echo unknown)\"; systemctl list-timers wegbuch-reset.timer --no-pager | head -3"
		exit 0 ;;
	logs)
		remote "journalctl -u $SERVICE -n 60 --no-pager"
		exit 0 ;;
	reset)
		remote "/usr/local/bin/wegbuch-reset" && echo "Demo data reset."
		exit 0 ;;
	pause)
		remote "systemctl stop wegbuch-reset.timer" && echo "Automatic reset paused. Start it again with: bun run deploy resume"
		exit 0 ;;
	resume)
		remote "systemctl start wegbuch-reset.timer" && echo "Automatic reset is on again."
		exit 0 ;;
	deploy) ;;
	*)
		echo "Unknown command: $1 (use: deploy, status, logs, reset, pause, resume)" >&2
		exit 1 ;;
esac

# The build and the checks need Node 24 (node:sqlite, argon2). .nvmrc says 24.
node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$node_major" -lt 24 ]; then
	echo "Node 24 is needed here (found $node_major). Run: nvm use" >&2
	exit 1
fi

if [ "${SKIP_CHECKS:-0}" != "1" ]; then
	echo "==> Checking types and running tests (SKIP_CHECKS=1 skips this)"
	bun run check
	bun run test
fi

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
	echo "Note: there are uncommitted changes. They are included in this deploy."
fi
STAMP="$(git rev-parse --short HEAD 2>/dev/null || echo no-git) $(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "==> Building for https://$DEPLOY_DOMAIN"
rm -rf build
ORIGIN="https://$DEPLOY_DOMAIN" bun run build

echo "==> Uploading to $DEPLOY_HOST:$APP_DIR"
remote "mkdir -p $APP_DIR/node_modules"
rsync -az --delete build/ "$DEPLOY_HOST:$APP_DIR/build/"
rsync -az package.json "$DEPLOY_HOST:$APP_DIR/"
# valibot is the only runtime dependency and has none of its own: copy the exact folder we tested.
rsync -a node_modules/valibot "$DEPLOY_HOST:$APP_DIR/node_modules/"
echo "$STAMP" | remote "cat > $APP_DIR/DEPLOYED"

echo "==> Restarting the app (the data stays)"
remote "chown -R $APP_USER:$APP_USER $APP_DIR && systemctl restart $SERVICE"

echo "==> Waiting for https://$DEPLOY_DOMAIN"
for _ in $(seq 1 20); do
	code="$(curl -s -o /dev/null -w '%{http_code}' "https://$DEPLOY_DOMAIN/login" || true)"
	[ "$code" = "200" ] && break
	sleep 1
done
if [ "$code" != "200" ]; then
	echo "The site did not answer 200 (got $code). Look at the logs: bun run deploy logs" >&2
	exit 1
fi
echo "Deployed $STAMP -> https://$DEPLOY_DOMAIN (login page answers 200)"
