#!/usr/bin/env bash
set -Eeuo pipefail

SITE="/etc/nginx/sites-available/yerbas-explorer-light"
ZONES="/etc/nginx/conf.d/yerbas-explorer-bot-zones.conf"
SNIPPET="/etc/nginx/snippets/yerbas-explorer-bot-guard.conf"
FILTER="/etc/fail2ban/filter.d/yerbas-explorer-limit-req.conf"
JAIL="/etc/fail2ban/jail.d/yerbas-explorer-limit-req.local"
BACKUP_DIR=""

log() {
  printf '\n[Explorer-Light bot guard] %s\n' "$*"
}

die() {
  printf '\n[Explorer-Light bot guard ERROR] %s\n' "$*" >&2
  exit 1
}

[[ "$(id -u)" -eq 0 ]] || die "Run this script with sudo."
[[ -f "$SITE" ]] || die "Explorer nginx site not found at $SITE."

BACKUP_DIR="$(mktemp -d /var/tmp/yerbas-explorer-bot-guard.XXXXXX)"
cp -a "$SITE" "$BACKUP_DIR/site"
[[ -f "$ZONES" ]] && cp -a "$ZONES" "$BACKUP_DIR/zones" || true
[[ -f "$SNIPPET" ]] && cp -a "$SNIPPET" "$BACKUP_DIR/snippet" || true
[[ -f "$FILTER" ]] && cp -a "$FILTER" "$BACKUP_DIR/filter" || true
[[ -f "$JAIL" ]] && cp -a "$JAIL" "$BACKUP_DIR/jail" || true

restore_file() {
  local backup="$1"
  local destination="$2"
  if [[ -f "$backup" ]]; then
    cp -a "$backup" "$destination"
  else
    rm -f "$destination"
  fi
}

rollback() {
  local status=$?
  trap - ERR
  log "Validation failed; restoring previous nginx/fail2ban configuration."
  restore_file "$BACKUP_DIR/site" "$SITE"
  restore_file "$BACKUP_DIR/zones" "$ZONES"
  restore_file "$BACKUP_DIR/snippet" "$SNIPPET"
  restore_file "$BACKUP_DIR/filter" "$FILTER"
  restore_file "$BACKUP_DIR/jail" "$JAIL"
  nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
  exit "$status"
}
trap rollback ERR

install -d -m 0755 /etc/nginx/conf.d /etc/nginx/snippets /etc/fail2ban/filter.d /etc/fail2ban/jail.d

cat > "$ZONES" <<'EOF'
map $http_user_agent $explorer_block_gptbot {
    default 0;
    ~*GPTBot 1;
}

map $http_user_agent $explorer_scraper_key {
    default "";
    ~*(?:OAI-SearchBot|Googlebot|bingbot) "";
    ~*(?:GPTBot) "";
    ~*(?:bot|crawler|spider|scrapy|curl|wget|python-requests|aiohttp|httpx|Go-http-client|libwww-perl|HeadlessChrome|PhantomJS|SemrushBot|AhrefsBot|MJ12bot|DotBot|CCBot|Bytespider|PetalBot|DataForSeoBot|rust_sniffer|masscan|zgrab|nikto|nuclei|sqlmap) $binary_remote_addr;
}

map $uri $explorer_heavy_key {
    default "";
    ~^/api/ipfs-preview/ $binary_remote_addr;
}

limit_req_zone $binary_remote_addr zone=explorer_all:10m rate=10r/s;
limit_req_zone $explorer_scraper_key zone=explorer_scraper:10m rate=1r/s;
limit_req_zone $explorer_heavy_key zone=explorer_heavy:10m rate=2r/s;
limit_conn_zone $binary_remote_addr zone=explorer_conn:10m;
limit_conn_zone $explorer_heavy_key zone=explorer_heavy_conn:10m;
EOF

cat > "$SNIPPET" <<'EOF'
if ($explorer_block_gptbot) {
    return 403;
}

limit_req zone=explorer_all burst=40 nodelay;
limit_req zone=explorer_scraper burst=5 nodelay;
limit_req zone=explorer_heavy burst=4 nodelay;
limit_conn explorer_conn 20;
limit_conn explorer_heavy_conn 4;
limit_req_status 429;
limit_conn_status 429;
limit_req_log_level warn;
EOF

if ! grep -Fq 'include /etc/nginx/snippets/yerbas-explorer-bot-guard.conf;' "$SITE"; then
  python3 - "$SITE" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text()
lines = text.splitlines(keepends=True)
out = []
inserted = 0

for line in lines:
    if re.match(r'^\s*proxy_pass\s+http://127\.0\.0\.1:\d+;', line):
        indent = re.match(r'^\s*', line).group(0)
        out.append(indent + 'include /etc/nginx/snippets/yerbas-explorer-bot-guard.conf;\n')
        inserted += 1
    out.append(line)

if inserted == 0:
    raise SystemExit('No localhost proxy_pass directives found in Explorer nginx site.')

path.write_text(''.join(out))
PY
fi

cat > "$FILTER" <<'EOF'
[Definition]
failregex = limiting requests, excess: .* by zone "explorer_(?:all|scraper|heavy)", client: <HOST>,
ignoreregex =
EOF

cat > "$JAIL" <<'EOF'
[yerbas-explorer-limit-req]
enabled = true
port = http,https
filter = yerbas-explorer-limit-req
logpath = /var/log/nginx/error.log
maxretry = 30
findtime = 10m
bantime = 1h
EOF

log "Validating nginx configuration"
nginx -t

log "Reloading nginx"
systemctl reload nginx

if command -v fail2ban-client >/dev/null 2>&1; then
  if fail2ban-client -t >/dev/null 2>&1; then
    systemctl enable fail2ban >/dev/null 2>&1 || true
    systemctl restart fail2ban || true
  else
    log "Fail2ban validation failed; nginx bot guard remains active."
  fi
fi

trap - ERR
rm -rf "$BACKUP_DIR"

log "Bot guard active."
printf '%s\n'   "  GPTBot: 403"   "  obvious scrapers: 1r/s, burst 5"   "  all clients: 10r/s, burst 40, max 20 concurrent"   "  IPFS previews: 2r/s, burst 4, max 4 concurrent"   "  OAI-SearchBot / Googlebot / Bingbot: permitted under normal limits"
