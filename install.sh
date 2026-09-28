#!/usr/bin/env bash
set -Eeuo pipefail

# Generic one-command bootstrap for Explorer-Light.
# When no domain is supplied through EXPLORER_DOMAIN or --domain, the wrapper
# prompts for the public hostname using /dev/tty so curl | sudo bash remains interactive.
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

DOMAIN="${EXPLORER_DOMAIN:-}"
ADMIN_USER="${EXPLORER_ADMIN_USER:-yerbasadmin}"
HTTPS="${EXPLORER_HTTPS:-1}"
EMAIL="${EXPLORER_EMAIL:-}"

[[ "$EUID" -eq 0 ]] || {
  echo "[Explorer-Light ERROR] Run through sudo, for example:" >&2
  echo "curl -fsSL https://raw.githubusercontent.com/The-Yerbas-Endeavor/Explorer-Light/feature/rpc-first-test-build/install.sh | sudo bash" >&2
  exit 1
}

DOMAIN_ARG=""
argv=("$@")
for (( i = 0; i < ${#argv[@]}; i++ )); do
  if [[ "${argv[$i]}" == "--domain" && $((i + 1)) -lt ${#argv[@]} ]]; then
    DOMAIN_ARG="${argv[$((i + 1))]}"
    break
  fi
done

[[ -z "$DOMAIN_ARG" ]] || DOMAIN="$DOMAIN_ARG"

valid_domain() {
  local value="$1"
  [[ "$value" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$ ]]
}

if [[ -z "$DOMAIN" ]]; then
  if [[ -r /dev/tty && -w /dev/tty ]]; then
    while true; do
      printf '\n[Explorer-Light] Enter the public explorer domain (example: explorer.example.org): ' > /dev/tty
      IFS= read -r DOMAIN < /dev/tty
      DOMAIN="${DOMAIN,,}"

      if valid_domain "$DOMAIN"; then
        break
      fi

      printf '[Explorer-Light ERROR] Enter a hostname only, without http://, https://, a path, or port.\n' > /dev/tty
    done
  else
    echo "[Explorer-Light ERROR] No interactive terminal is available to enter the domain." >&2
    echo "[Explorer-Light ERROR] Set EXPLORER_DOMAIN=explorer.example.org or pass --domain explorer.example.org." >&2
    exit 1
  fi
elif ! valid_domain "$DOMAIN"; then
  echo "[Explorer-Light ERROR] Invalid domain: $DOMAIN" >&2
  echo "[Explorer-Light ERROR] Use a hostname such as explorer.example.org." >&2
  exit 1
fi

tmp="$(mktemp /tmp/yerbas-explorer-installer.XXXXXX)"
cleanup() {
  rm -f "$tmp"
}
trap cleanup EXIT

echo "[Explorer-Light] One-command installer"
echo "[Explorer-Light] Domain: $DOMAIN"
echo "[Explorer-Light] HTTPS: $([[ "$HTTPS" == "1" ]] && echo enabled || echo disabled)"
echo "[Explorer-Light] Admin user: $ADMIN_USER"

curl -fsSL "$INSTALLER_URL" -o "$tmp"
chmod 0700 "$tmp"

args=(
  --domain "$DOMAIN"
  --admin-user "$ADMIN_USER"
)

if [[ "$HTTPS" == "1" ]]; then
  args+=(--https)
  if [[ -n "$EMAIL" ]]; then
    args+=(--email "$EMAIL")
  fi
fi

bash "$tmp" "${args[@]}" "$@"
