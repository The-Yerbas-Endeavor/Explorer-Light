#!/usr/bin/env bash
set -Eeuo pipefail

# One-command bootstrap for the Explorer-Light test deployment.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/The-Yerbas-Endeavor/Explorer-Light/feature/rpc-first-test-build/install.sh | sudo bash
#
# Optional overrides:
#   EXPLORER_DOMAIN=example.org
#   EXPLORER_ADMIN_USER=exploreradmin
#   EXPLORER_HTTPS=1
#   EXPLORER_EMAIL=admin@example.org
#
# Extra arguments passed after "bash -s --" are forwarded to the full installer.

INSTALLER_URL="https://raw.githubusercontent.com/The-Yerbas-Endeavor/Explorer-Light/feature/rpc-first-test-build/scripts/install-fresh-server.sh"

DOMAIN="${EXPLORER_DOMAIN:-explorer2.yerbas.org}"
ADMIN_USER="${EXPLORER_ADMIN_USER:-yerbasadmin}"
HTTPS="${EXPLORER_HTTPS:-0}"
EMAIL="${EXPLORER_EMAIL:-}"

[[ "$EUID" -eq 0 ]] || {
  echo "[Explorer-Light ERROR] Run through sudo, for example:" >&2
  echo "curl -fsSL https://raw.githubusercontent.com/The-Yerbas-Endeavor/Explorer-Light/feature/rpc-first-test-build/install.sh | sudo bash" >&2
  exit 1
}

tmp="$(mktemp /tmp/yerbas-explorer-installer.XXXXXX)"
cleanup() {
  rm -f "$tmp"
}
trap cleanup EXIT

echo "[Explorer-Light] One-command installer"
echo "[Explorer-Light] Domain: $DOMAIN"
echo "[Explorer-Light] Admin user: $ADMIN_USER"

curl -fsSL "$INSTALLER_URL" -o "$tmp"
chmod 0700 "$tmp"

args=(
  --domain "$DOMAIN"
  --admin-user "$ADMIN_USER"
)

if [[ "$HTTPS" == "1" ]]; then
  [[ -n "$EMAIL" ]] || {
    echo "[Explorer-Light ERROR] EXPLORER_HTTPS=1 requires EXPLORER_EMAIL." >&2
    exit 1
  }
  args+=(--https --email "$EMAIL")
fi

bash "$tmp" "${args[@]}" "$@"
