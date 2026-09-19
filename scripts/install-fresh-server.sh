#!/usr/bin/env bash
set -Eeuo pipefail

# Yerbas Explorer Light fresh-server installer.
# Supported: fresh Ubuntu/Debian server.
#
# Default install:
#   - headless/wallet-disabled Yerbas Core
#   - txindex=1, addressindex=1, assetindex=1
#   - Node.js 24
#   - Explorer Light
#   - systemd services
#   - nginx reverse proxy
#
# Examples:
#   sudo bash install-fresh-server.sh
#   sudo bash install-fresh-server.sh --domain explorer.example.org
#   sudo bash install-fresh-server.sh --domain explorer.example.org --https --email admin@example.org

DOMAIN="_"
EMAIL=""
HTTPS=0
CORE_REF="main"
EXPLORER_BRANCH="feature/rpc-first-test-build"
JOBS=""
CORE_REPO="https://github.com/The-Yerbas-Endeavor/yerbas.git"
EXPLORER_REPO="https://github.com/The-Yerbas-Endeavor/Explorer-Light.git"

CORE_USER="yerbas"
EXPLORER_USER="explorer-light"
CORE_HOME="/home/yerbas"
CORE_DATA="/home/yerbas/.yerbascore"
CORE_SRC="/usr/local/src/yerbas-core"
EXPLORER_DIR="/opt/yerbas-explorer-light"
RPC_PORT="9998"
APP_PORT="3001"

log() { printf '\n[Explorer-Light] %s\n' "$*"; }
die() { printf '\n[Explorer-Light ERROR] %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: sudo bash install-fresh-server.sh [options]

Options:
  --domain NAME       Public domain. Default: server IP / nginx catch-all.
  --https             Configure Let's Encrypt HTTPS with certbot.
  --email ADDRESS     Required with --https.
  --core-ref REF      Yerbas Core branch/tag. Default: main
  --branch REF        Explorer-Light branch. Default: feature/rpc-first-test-build
  --jobs N            Core build jobs. Default: based on CPU/RAM.
  -h, --help          Show help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) [[ $# -ge 2 ]] || die "Missing domain"; DOMAIN="$2"; shift 2 ;;
    --https) HTTPS=1; shift ;;
    --email) [[ $# -ge 2 ]] || die "Missing email"; EMAIL="$2"; shift 2 ;;
    --core-ref) [[ $# -ge 2 ]] || die "Missing Core ref"; CORE_REF="$2"; shift 2 ;;
    --branch) [[ $# -ge 2 ]] || die "Missing explorer branch"; EXPLORER_BRANCH="$2"; shift 2 ;;
    --jobs) [[ $# -ge 2 ]] || die "Missing jobs value"; JOBS="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

[[ "$EUID" -eq 0 ]] || die "Run with sudo/root."

if (( HTTPS )); then
  [[ "$DOMAIN" != "_" ]] || die "--https requires --domain."
  [[ -n "$EMAIL" ]] || die "--https requires --email."
fi

[[ -r /etc/os-release ]] || die "Cannot identify operating system."
source /etc/os-release
case "$ID" in
  ubuntu|debian) ;;
  *) die "This installer currently supports Ubuntu and Debian." ;;
esac

export DEBIAN_FRONTEND=noninteractive

MEM_MB="$(awk '/MemTotal:/ {print int($2/1024)}' /proc/meminfo)"
if [[ -z "$JOBS" ]]; then
  JOBS="$(nproc)"
  MEM_JOBS=$(( MEM_MB / 1400 ))
  (( MEM_JOBS < 1 )) && MEM_JOBS=1
  (( JOBS > MEM_JOBS )) && JOBS="$MEM_JOBS"
  (( JOBS > 4 )) && JOBS=4
fi
[[ "$JOBS" =~ ^[0-9]+$ ]] || die "--jobs must be a number."

FREE_KB="$(df -Pk / | awk 'NR==2 {print $4}')"
if (( FREE_KB < 20 * 1024 * 1024 )); then
  log "WARNING: less than 20 GiB is free. Core + blockchain needs substantial disk space."
fi

SWAP_MB="$(awk '/SwapTotal:/ {print int($2/1024)}' /proc/meminfo)"
if (( MEM_MB < 4096 && SWAP_MB < 512 )) && [[ ! -e /swapfile ]]; then
  log "Creating 2 GiB swap for the Core build"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "Installing packages"
apt-get update
apt-get install -y \
  ca-certificates curl git jq nginx openssl python3 \
  autoconf automake build-essential cmake libtool pkg-config patch

if apt-cache show bsdmainutils >/dev/null 2>&1; then
  apt-get install -y bsdmainutils
elif apt-cache show bsdextrautils >/dev/null 2>&1; then
  apt-get install -y bsdextrautils
fi

node_ok=0
if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -p 'process.versions.node' 2>/dev/null || true)"
  if [[ -n "$NODE_VERSION" ]] && dpkg --compare-versions "$NODE_VERSION" ge "24.0.0"; then
    node_ok=1
  fi
fi

if (( ! node_ok )); then
  log "Installing Node.js 24"
  curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource.sh
  bash /tmp/nodesource.sh
  rm -f /tmp/nodesource.sh
  apt-get install -y nodejs
fi

command -v node >/dev/null || die "Node.js install failed."
log "Node: $(node --version)"

if ! id -u "$CORE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$CORE_HOME" --shell /usr/sbin/nologin "$CORE_USER"
fi
if ! id -u "$EXPLORER_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/var/lib/$EXPLORER_USER" --shell /usr/sbin/nologin "$EXPLORER_USER"
fi

log "Cloning Yerbas Core: $CORE_REF"
rm -rf "$CORE_SRC"
git clone --depth 1 --branch "$CORE_REF" "$CORE_REPO" "$CORE_SRC"
cd "$CORE_SRC"

if [[ -x ./build-aux/config.guess ]]; then
  HOST_TRIPLE="$(./build-aux/config.guess)"
else
  case "$(uname -m)" in
    x86_64) HOST_TRIPLE="x86_64-pc-linux-gnu" ;;
    aarch64|arm64) HOST_TRIPLE="aarch64-linux-gnu" ;;
    *) die "Unsupported architecture: $(uname -m)" ;;
  esac
fi

log "Building Core dependencies ($HOST_TRIPLE) with $JOBS job(s)"
make -C depends -j"$JOBS" HOST="$HOST_TRIPLE" NO_QT=1 NO_WALLET=1

log "Building headless Yerbas Core"
./autogen.sh
CONFIG_SITE="$CORE_SRC/depends/$HOST_TRIPLE/share/config.site" \
  ./configure \
    --prefix="$CORE_SRC/depends/$HOST_TRIPLE" \
    --disable-wallet \
    --with-gui=no \
    --disable-tests \
    --disable-bench
make -j"$JOBS"

install -m 0755 src/yerbasd /usr/local/bin/yerbasd
install -m 0755 src/yerbas-cli /usr/local/bin/yerbas-cli

RPC_USER="explorer"
RPC_PASSWORD="$(openssl rand -hex 32)"

log "Configuring Yerbas Core"
install -d -m 0700 -o "$CORE_USER" -g "$CORE_USER" "$CORE_DATA"
cat > "$CORE_DATA/yerbas.conf" <<EOF
server=1
listen=1

txindex=1
addressindex=1
assetindex=1

rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcport=$RPC_PORT
rpcuser=$RPC_USER
rpcpassword=$RPC_PASSWORD
EOF
chown "$CORE_USER:$CORE_USER" "$CORE_DATA/yerbas.conf"
chmod 0600 "$CORE_DATA/yerbas.conf"

cat > /etc/systemd/system/yerbasd.service <<EOF
[Unit]
Description=Yerbas Core
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$CORE_USER
Group=$CORE_USER
ExecStart=/usr/local/bin/yerbasd -datadir=$CORE_DATA -conf=$CORE_DATA/yerbas.conf
ExecStop=/usr/local/bin/yerbas-cli -datadir=$CORE_DATA -conf=$CORE_DATA/yerbas.conf stop
Restart=on-failure
RestartSec=5
TimeoutStopSec=120
LimitNOFILE=65536
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$CORE_DATA

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now yerbasd

log "Installing Explorer Light: $EXPLORER_BRANCH"
rm -rf "$EXPLORER_DIR"
git clone --depth 1 --branch "$EXPLORER_BRANCH" "$EXPLORER_REPO" "$EXPLORER_DIR"

cat > "$EXPLORER_DIR/.env" <<EOF
HOST=127.0.0.1
PORT=$APP_PORT

RPC_PROTOCOL=http
RPC_HOST=127.0.0.1
RPC_PORT=$RPC_PORT
RPC_USER=$RPC_USER
RPC_PASSWORD=$RPC_PASSWORD
RPC_TIMEOUT_MS=10000

RECENT_BLOCKS=12
CACHE_MS=5000

AI_API_ENABLED=true
AI_MAX_BODY_BYTES=32768
EOF

chown -R root:"$EXPLORER_USER" "$EXPLORER_DIR"
chmod -R g+rX,o-rwx "$EXPLORER_DIR"
chmod 0640 "$EXPLORER_DIR/.env"

cd "$EXPLORER_DIR"
npm test
npm run check

NODE_BIN="$(command -v node)"
cat > /etc/systemd/system/yerbas-explorer-light.service <<EOF
[Unit]
Description=Yerbas Explorer Light
After=network-online.target yerbasd.service
Wants=network-online.target yerbasd.service

[Service]
Type=simple
User=$EXPLORER_USER
Group=$EXPLORER_USER
WorkingDirectory=$EXPLORER_DIR
EnvironmentFile=$EXPLORER_DIR/.env
ExecStart=$NODE_BIN $EXPLORER_DIR/server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now yerbas-explorer-light

log "Configuring nginx"
if [[ "$DOMAIN" == "_" ]]; then
  LISTEN_LINE="listen 80 default_server;"
else
  LISTEN_LINE="listen 80;"
fi

cat > /etc/nginx/sites-available/yerbas-explorer-light <<EOF
limit_req_zone \$binary_remote_addr zone=yerbas_ai_query:10m rate=10r/s;

server {
    $LISTEN_LINE
    server_name $DOMAIN;

    location ~ ^/(api/ai(?:/v1)?/query|ext/ai/query)\$ {
        limit_req zone=yerbas_ai_query burst=20 nodelay;
        client_max_body_size 64k;
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/yerbas-explorer-light /etc/nginx/sites-enabled/yerbas-explorer-light
nginx -t
systemctl enable --now nginx
systemctl reload nginx

if (( HTTPS )); then
  log "Configuring Let's Encrypt HTTPS"
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx --non-interactive --agree-tos --redirect --email "$EMAIL" -d "$DOMAIN"
fi

log "Removing Core build source to save disk"
rm -rf "$CORE_SRC"

log "Checking services"
systemctl is-active --quiet yerbasd || die "yerbasd failed. Run: journalctl -u yerbasd -n 100 --no-pager"
systemctl is-active --quiet yerbas-explorer-light || die "Explorer failed. Run: journalctl -u yerbas-explorer-light -n 100 --no-pager"
systemctl is-active --quiet nginx || die "nginx failed."

for attempt in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/tmp/explorer-health.json 2>/dev/null; then
    break
  fi
  sleep 1
done

printf '\n============================================================\n'
printf ' Yerbas Explorer Light installation complete\n'
printf '============================================================\n\n'

if [[ "$DOMAIN" == "_" ]]; then
  echo "Open: http://<server-ip>/"
elif (( HTTPS )); then
  echo "Open: https://$DOMAIN/"
else
  echo "Open: http://$DOMAIN/"
fi

echo
echo "Health:"
echo "  curl -s http://127.0.0.1:$APP_PORT/api/health | jq"
echo
echo "AI status:"
echo "  curl -s http://127.0.0.1:$APP_PORT/api/ai/v1/status | jq"
echo
echo "Core sync:"
echo "  sudo -u $CORE_USER yerbas-cli -datadir=$CORE_DATA -conf=$CORE_DATA/yerbas.conf getblockchaininfo"
echo
echo "Services:"
echo "  systemctl status yerbasd --no-pager"
echo "  systemctl status yerbas-explorer-light --no-pager"
echo "  systemctl status nginx --no-pager"
echo
echo "Logs:"
echo "  journalctl -u yerbasd -f"
echo "  journalctl -u yerbas-explorer-light -f"
echo
echo "Core RPC remains bound to 127.0.0.1 only."
echo "Explorer Light remains bound to 127.0.0.1 behind nginx."
echo "The AI gateway is read-only and has no arbitrary RPC endpoint."
