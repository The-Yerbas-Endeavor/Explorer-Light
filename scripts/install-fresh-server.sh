#!/usr/bin/env bash
set -Eeuo pipefail

# Yerbas Explorer Light fresh-server installer
#
# Supported:
#   Ubuntu 22.04 / 24.04 / 26.04 (official Core release binaries)
#   Debian/other Ubuntu versions (source-build fallback)
#
# Installs:
#   - Yerbas Core
#   - official Explorer bootstrap-index blockchain snapshot
#   - powcache.dat
#   - Core indexes used by explorer/AI
#   - Explorer Light
#   - generated RPC credentials
#   - systemd services
#   - nginx
#   - optional Let's Encrypt HTTPS
#
# Example:
#   sudo ./install-fresh-server.sh --domain explorer2.yerbas.org
#
# HTTPS, once DNS points at this server:
#   sudo ./install-fresh-server.sh \
#     --domain explorer2.yerbas.org \
#     --https \
#     --email admin@example.org

DOMAIN="_"
EMAIL=""
HTTPS=0
EXPLORER_BRANCH="feature/rpc-first-test-build"
CORE_REF="main"
FORCE_SOURCE_BUILD=0
SKIP_BOOTSTRAP=0
KEEP_DOWNLOADS=0
JOBS=""
ADMIN_USER="yerbasadmin"
SSH_HARDENED=0
CORE_SYNC_TIMEOUT_SECONDS="${CORE_SYNC_TIMEOUT_SECONDS:-10800}"

CORE_REPO="https://github.com/The-Yerbas-Endeavor/yerbas.git"
CORE_RELEASE_API="https://api.github.com/repos/The-Yerbas-Endeavor/yerbas/releases/latest"
BOOTSTRAP_RELEASE_API="https://api.github.com/repos/The-Yerbas-Endeavor/YERB-Bootstrap/releases/latest"
EXPLORER_REPO="https://github.com/The-Yerbas-Endeavor/Explorer-Light.git"

CORE_USER="yerbas"
EXPLORER_USER="explorer-light"
CORE_HOME="/home/yerbas"
CORE_DATA="/home/yerbas/.yerbascore"
CORE_SRC="/usr/local/src/yerbas-core"
EXPLORER_DIR="/opt/yerbas-explorer-light"
RPC_PORT="9998"
APP_PORT="3001"

WORKDIR=""

log() {
  printf '\n\033[1;32m[Explorer-Light]\033[0m %s\n' "$*"
}

warn() {
  printf '\n\033[1;33m[Explorer-Light WARNING]\033[0m %s\n' "$*" >&2
}

die() {
  printf '\n\033[1;31m[Explorer-Light ERROR]\033[0m %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "$WORKDIR" && -d "$WORKDIR" && "$KEEP_DOWNLOADS" -eq 0 ]]; then
    rm -rf "$WORKDIR"
  fi
}

on_error() {
  local exit_code=$?
  local line_no="${BASH_LINENO[0]:-unknown}"
  local command="${BASH_COMMAND:-unknown}"
  printf '\n\033[1;31m[Explorer-Light ERROR]\033[0m Installer stopped at line %s (exit %s): %s\n'     "$line_no" "$exit_code" "$command" >&2
  printf '[Explorer-Light] Re-run the same one-command installer after the issue is corrected; completed steps are designed to be safe to repeat.\n' >&2
  exit "$exit_code"
}

trap cleanup EXIT
trap on_error ERR

usage() {
  cat <<EOF
Usage: sudo bash install-fresh-server.sh [options]

Options:
  --domain NAME          Public domain. Default: nginx catch-all / server IP.
  --https                Configure Let's Encrypt HTTPS.
  --email ADDRESS        Optional Let's Encrypt contact email.
  --branch REF           Explorer-Light branch.
                         Default: feature/rpc-first-test-build
  --core-ref REF         Core source fallback branch/tag. Default: main
  --source-build         Force Core to build from source.
  --skip-bootstrap       Do not download bootstrap-index.zip / powcache.dat.
  --keep-downloads       Keep installer downloads under /var/tmp.
  --jobs N               Source-build parallel jobs.
  --admin-user NAME       Sudo/build administrator. Default: yerbasadmin
  -h, --help             Show help.

The default path uses the latest matching official Yerbas Core Ubuntu release
and the latest YERB-Bootstrap bootstrap-index.zip release.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      [[ $# -ge 2 ]] || die "Missing domain."
      DOMAIN="$2"
      shift 2
      ;;
    --https)
      HTTPS=1
      shift
      ;;
    --email)
      [[ $# -ge 2 ]] || die "Missing email."
      EMAIL="$2"
      shift 2
      ;;
    --branch)
      [[ $# -ge 2 ]] || die "Missing Explorer branch."
      EXPLORER_BRANCH="$2"
      shift 2
      ;;
    --core-ref)
      [[ $# -ge 2 ]] || die "Missing Core ref."
      CORE_REF="$2"
      shift 2
      ;;
    --source-build)
      FORCE_SOURCE_BUILD=1
      shift
      ;;
    --skip-bootstrap)
      SKIP_BOOTSTRAP=1
      shift
      ;;
    --keep-downloads)
      KEEP_DOWNLOADS=1
      shift
      ;;
    --jobs)
      [[ $# -ge 2 ]] || die "Missing jobs value."
      JOBS="$2"
      shift 2
      ;;
    --admin-user)
      [[ $# -ge 2 ]] || die "Missing admin username."
      ADMIN_USER="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

[[ "$EUID" -eq 0 ]] || die "Run this installer with sudo/root."
[[ "$ADMIN_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || die "Invalid --admin-user value."
[[ "$ADMIN_USER" != "root" ]] || die "--admin-user cannot be root."

if (( HTTPS )); then
  [[ "$DOMAIN" != "_" ]] || die "--https requires --domain."
fi

[[ -r /etc/os-release ]] || die "Cannot identify operating system."
source /etc/os-release

case "$ID" in
  ubuntu|debian) ;;
  *) die "This installer currently supports Ubuntu and Debian." ;;
esac

export DEBIAN_FRONTEND=noninteractive
WORKDIR="$(mktemp -d /var/tmp/yerbas-explorer-install.XXXXXX)"

MEM_MB="$(awk '/MemTotal:/ {print int($2/1024)}' /proc/meminfo)"
FREE_KB="$(df -Pk / | awk 'NR==2 {print $4}')"
FREE_GB=$(( FREE_KB / 1024 / 1024 ))

if (( FREE_GB < 15 )); then
  warn "Only about $FREE_GB GiB is free. A full Explorer Core node and indexed blockchain require substantial disk space."
fi

if [[ -z "$JOBS" ]]; then
  JOBS="$(nproc)"
  MEM_JOBS=$(( MEM_MB / 1400 ))
  (( MEM_JOBS < 1 )) && MEM_JOBS=1
  (( JOBS > MEM_JOBS )) && JOBS="$MEM_JOBS"
  (( JOBS > 4 )) && JOBS=4
fi
[[ "$JOBS" =~ ^[0-9]+$ ]] || die "--jobs must be numeric."

log "Installing operating-system packages"
apt-get update
apt-get install -y \
  ca-certificates \
  curl \
  fail2ban \
  git \
  jq \
  nginx \
  openssh-server \
  openssl \
  python3 \
  python3-systemd \
  sudo \
  tar \
  ufw \
  unattended-upgrades \
  unzip

node_ok=0
if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -p 'process.versions.node' 2>/dev/null || true)"
  if [[ -n "$NODE_VERSION" ]] && dpkg --compare-versions "$NODE_VERSION" ge "24.0.0"; then
    node_ok=1
  fi
fi

if (( ! node_ok )); then
  log "Installing Node.js 24"
  curl -fsSL https://deb.nodesource.com/setup_24.x -o "$WORKDIR/nodesource.sh"
  bash "$WORKDIR/nodesource.sh"
  apt-get install -y nodejs
fi

command -v node >/dev/null || die "Node.js installation failed."
log "Using Node.js $(node --version)"

create_admin_user() {
  local source_keys=""
  local admin_home

  log "Creating hardened sudo/build administrator: $ADMIN_USER"

  if ! id -u "$ADMIN_USER" >/dev/null 2>&1; then
    adduser --disabled-password --gecos "" "$ADMIN_USER"
  fi

  usermod -aG sudo "$ADMIN_USER"
  passwd -l "$ADMIN_USER" >/dev/null 2>&1 || true

  admin_home="$(getent passwd "$ADMIN_USER" | cut -d: -f6)"
  [[ -n "$admin_home" ]] || die "Unable to determine home directory for $ADMIN_USER."

  if [[ -n "${SUDO_USER:-}" && "${SUDO_USER:-}" != "root" ]]; then
    local sudo_home
    sudo_home="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
    if [[ -s "$sudo_home/.ssh/authorized_keys" ]]; then
      source_keys="$sudo_home/.ssh/authorized_keys"
    fi
  fi

  if [[ -z "$source_keys" && -s /root/.ssh/authorized_keys ]]; then
    source_keys="/root/.ssh/authorized_keys"
  fi

  install -d -m 0700 -o "$ADMIN_USER" -g "$ADMIN_USER" "$admin_home/.ssh"

  if [[ -n "$source_keys" ]]; then
    install -m 0600 -o "$ADMIN_USER" -g "$ADMIN_USER" \
      "$source_keys" "$admin_home/.ssh/authorized_keys"
    SSH_HARDENED=1
    log "Copied existing SSH authorized_keys to $ADMIN_USER"
  else
    SSH_HARDENED=0
    warn "No existing authorized_keys file was found."
    warn "Root/password SSH authentication will NOT be disabled automatically."
  fi

  cat > "/etc/sudoers.d/90-$ADMIN_USER" <<EOF
$ADMIN_USER ALL=(ALL:ALL) NOPASSWD: ALL
EOF
  chmod 0440 "/etc/sudoers.d/90-$ADMIN_USER"
  visudo -cf "/etc/sudoers.d/90-$ADMIN_USER" >/dev/null \
    || die "Generated sudoers configuration is invalid."
}

harden_server() {
  log "Applying base server hardening"

  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
  systemctl enable --now unattended-upgrades.service >/dev/null 2>&1 || true

  cat > /etc/sysctl.d/99-yerbas-explorer-hardening.conf <<'EOF'
kernel.kptr_restrict=2
kernel.dmesg_restrict=1
kernel.yama.ptrace_scope=1
fs.protected_hardlinks=1
fs.protected_symlinks=1
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.all.send_redirects=0
net.ipv4.conf.default.send_redirects=0
net.ipv4.conf.all.accept_source_route=0
net.ipv4.conf.default.accept_source_route=0
net.ipv4.tcp_syncookies=1
net.ipv6.conf.all.accept_redirects=0
net.ipv6.conf.default.accept_redirects=0
EOF
  sysctl --system >/dev/null

  cat > /etc/fail2ban/jail.d/sshd-local.conf <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
  if fail2ban-client -t >/dev/null 2>&1; then
    systemctl enable fail2ban >/dev/null 2>&1 || true
    if ! systemctl restart fail2ban; then
      warn "Fail2ban could not be started; continuing installation."
      warn "Check later with: systemctl status fail2ban --no-pager"
    fi
  else
    warn "Fail2ban configuration validation failed; continuing installation."
    warn "Check later with: fail2ban-client -t"
  fi

  local ssh_port
  ssh_port="$(sshd -T 2>/dev/null | awk '$1 == "port" {port=$2} END {if (port != "") print port}')"
  [[ "$ssh_port" =~ ^[0-9]+$ ]] || ssh_port=22

  ufw --force reset >/dev/null
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow "$ssh_port/tcp" comment 'SSH'
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 15420/tcp comment 'Yerbas P2P' || true
  ufw --force enable

  if (( SSH_HARDENED )); then
    log "Hardening SSH for key-only administration"

    cat > /etc/ssh/sshd_config.d/99-yerbas-explorer-hardening.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PubkeyAuthentication yes
X11Forwarding no
AllowUsers $ADMIN_USER
EOF

    sshd -t || die "Hardened sshd configuration failed validation."
    systemctl reload ssh || systemctl reload sshd
  else
    warn "SSH key migration was not verified; sshd login policy was left unchanged."
  fi
}

create_admin_user
harden_server


if ! id -u "$CORE_USER" >/dev/null 2>&1; then
  useradd \
    --system \
    --create-home \
    --home-dir "$CORE_HOME" \
    --shell /usr/sbin/nologin \
    "$CORE_USER"
fi

if ! id -u "$EXPLORER_USER" >/dev/null 2>&1; then
  useradd \
    --system \
    --create-home \
    --home-dir "/var/lib/$EXPLORER_USER" \
    --shell /usr/sbin/nologin \
    "$EXPLORER_USER"
fi

verify_sha256() {
  local file="$1"
  local expected="$2"
  local actual

  [[ "$expected" =~ ^[0-9a-fA-F]{64}$ ]] || die "Missing/invalid SHA-256 digest for $(basename "$file")."
  actual="$(sha256sum "$file" | awk '{print $1}')"
  [[ "$actual" == "$expected" ]] || die "SHA-256 verification failed for $(basename "$file")."
}

install_core_from_release() {
  local release_json
  local arch
  local pattern
  local url
  local digest
  local asset_name
  local archive
  local extract_dir
  local yerbasd_bin
  local yerbas_cli_bin
  local tag

  [[ "$ID" == "ubuntu" ]] || return 1

  case "$(uname -m)" in
    x86_64)
      arch="x86"
      ;;
    aarch64|arm64)
      arch="arm64"
      ;;
    *)
      return 1
      ;;
  esac

  release_json="$(curl -fsSL "$CORE_RELEASE_API")" || return 1
  tag="$(printf '%s' "$release_json" | jq -r '.tag_name // empty')"
  pattern="^yerbas-ubuntu-$VERSION_ID-$arch-release-.*\\.tar\\.gz$"

  url="$(printf '%s' "$release_json" | jq -r --arg p "$pattern" \
    'first(.assets[] | select(.name | test($p)) | .browser_download_url) // empty')"
  digest="$(printf '%s' "$release_json" | jq -r --arg p "$pattern" \
    'first(.assets[] | select(.name | test($p)) | (.digest // "")) // empty')"
  digest="${digest#sha256:}"
  asset_name="$(printf '%s' "$release_json" | jq -r --arg p "$pattern" \
    'first(.assets[] | select(.name | test($p)) | .name) // empty')"

  [[ -n "$url" && "$url" != "null" ]] || return 1

  archive="$WORKDIR/$asset_name"
  extract_dir="$WORKDIR/core-release"
  mkdir -p "$extract_dir"

  log "Downloading official Yerbas Core $tag for Ubuntu $VERSION_ID / $arch"
  curl -fL --retry 3 --retry-delay 2 --progress-bar "$url" -o "$archive"
  verify_sha256 "$archive" "$digest"

  tar -xzf "$archive" -C "$extract_dir"

  yerbasd_bin="$(find "$extract_dir" -type f -name yerbasd -print -quit)"
  yerbas_cli_bin="$(find "$extract_dir" -type f -name yerbas-cli -print -quit)"

  [[ -n "$yerbasd_bin" && -f "$yerbasd_bin" ]] || die "Official Core archive did not contain yerbasd."
  [[ -n "$yerbas_cli_bin" && -f "$yerbas_cli_bin" ]] || die "Official Core archive did not contain yerbas-cli."

  install -m 0755 "$yerbasd_bin" /usr/local/bin/yerbasd
  install -m 0755 "$yerbas_cli_bin" /usr/local/bin/yerbas-cli

  log "Installed official Yerbas Core release $tag"
  return 0
}

install_core_from_source() {
  log "No matching official binary selected/found; building Core from source"

  apt-get install -y \
    autoconf \
    automake \
    build-essential \
    cmake \
    libtool \
    pkg-config \
    patch

  if apt-cache show bsdmainutils >/dev/null 2>&1; then
    apt-get install -y bsdmainutils
  elif apt-cache show bsdextrautils >/dev/null 2>&1; then
    apt-get install -y bsdextrautils
  fi

  SWAP_MB="$(awk '/SwapTotal:/ {print int($2/1024)}' /proc/meminfo)"
  if (( MEM_MB < 4096 && SWAP_MB < 512 )) && [[ ! -e /swapfile ]]; then
    log "Creating 2 GiB swap for the Core source build"
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -qE '^/swapfile[[:space:]]' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi

  rm -rf "$CORE_SRC"
  install -d -m 0755 -o "$ADMIN_USER" -g "$ADMIN_USER" "$CORE_SRC"
  sudo -u "$ADMIN_USER" git clone --depth 1 --branch "$CORE_REF" "$CORE_REPO" "$CORE_SRC"
  cd "$CORE_SRC"

  if [[ -x ./build-aux/config.guess ]]; then
    HOST_TRIPLE="$(./build-aux/config.guess)"
  else
    case "$(uname -m)" in
      x86_64) HOST_TRIPLE="x86_64-pc-linux-gnu" ;;
      aarch64|arm64) HOST_TRIPLE="aarch64-linux-gnu" ;;
      *) die "Unsupported architecture for source build: $(uname -m)" ;;
    esac
  fi

  log "Building Core dependencies for $HOST_TRIPLE with $JOBS job(s)"
  make -C depends -j"$JOBS" HOST="$HOST_TRIPLE" NO_QT=1 NO_WALLET=1

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

  cd /
  rm -rf "$CORE_SRC"
}

if (( FORCE_SOURCE_BUILD )); then
  install_core_from_source
else
  if ! install_core_from_release; then
    install_core_from_source
  fi
fi

[[ -x /usr/local/bin/yerbasd ]] || die "yerbasd was not installed."
[[ -x /usr/local/bin/yerbas-cli ]] || die "yerbas-cli was not installed."

log "Configuring Yerbas Core"

# Make re-runs safe: never replace bootstrap/index files underneath a running node.
systemctl stop yerbasd.service >/dev/null 2>&1 || true

RPC_USER="explorer"
RPC_PASSWORD=""

# Preserve generated RPC credentials across retries so an already-installed
# Explorer and Core cannot drift onto different passwords.
if [[ -s "$CORE_DATA/yerbas.conf" ]]; then
  EXISTING_RPC_USER="$(awk -F= '$1 == "rpcuser" {v=substr($0,index($0,"=")+1)} END {print v}' "$CORE_DATA/yerbas.conf")"
  EXISTING_RPC_PASSWORD="$(awk -F= '$1 == "rpcpassword" {v=substr($0,index($0,"=")+1)} END {print v}' "$CORE_DATA/yerbas.conf")"
  if [[ -n "$EXISTING_RPC_USER" && -n "$EXISTING_RPC_PASSWORD" ]]; then
    RPC_USER="$EXISTING_RPC_USER"
    RPC_PASSWORD="$EXISTING_RPC_PASSWORD"
    log "Reusing existing localhost RPC credentials"
  fi
fi

[[ -n "$RPC_PASSWORD" ]] || RPC_PASSWORD="$(openssl rand -hex 32)"

install -d -m 0700 -o "$CORE_USER" -g "$CORE_USER" "$CORE_DATA"

cat > "$CORE_DATA/yerbas.conf" <<EOF
server=1
listen=1
disablewallet=1

# Explorer indexes.
# These match the official bootstrap-index.zip snapshot.
txindex=1
addressindex=1
assetindex=1
spentindex=1
timestampindex=1

# Core RPC is localhost-only.
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcport=$RPC_PORT
rpcuser=$RPC_USER
rpcpassword=$RPC_PASSWORD
EOF

chown "$CORE_USER:$CORE_USER" "$CORE_DATA/yerbas.conf"
chmod 0600 "$CORE_DATA/yerbas.conf"

install_bootstrap_tree() {
  local source_root="$1"
  local component

  [[ -d "$source_root/blocks" ]] || die "Bootstrap tree has no blocks/ directory: $source_root"
  [[ -d "$source_root/chainstate" ]] || die "Bootstrap tree has no chainstate/ directory: $source_root"

  # Official snapshots across Yerbas release generations have used both a
  # conventional indexes/ tree and older Core database directories. Move every
  # known chain/index component that is present, while never importing config,
  # wallets, peers, or other host-specific files.
  for component in blocks chainstate indexes assets evodb llmq myrestricted rewards; do
    if [[ -e "$source_root/$component" ]]; then
      rm -rf "$CORE_DATA/$component"
      mv "$source_root/$component" "$CORE_DATA/$component"
    fi
  done

  [[ -d "$CORE_DATA/blocks" ]] || die "Bootstrap installation did not create blocks/."
  [[ -d "$CORE_DATA/chainstate" ]] || die "Bootstrap installation did not create chainstate/."
}

find_bootstrap_root() {
  local stage="$1"
  local candidate

  if [[ -d "$stage/blocks" && -d "$stage/chainstate" ]]; then
    printf '%s\n' "$stage"
    return 0
  fi

  if [[ -d "$stage/bootstrap-index/blocks" && -d "$stage/bootstrap-index/chainstate" ]]; then
    printf '%s\n' "$stage/bootstrap-index"
    return 0
  fi

  while IFS= read -r -d '' candidate; do
    candidate="$(dirname "$candidate")"
    if [[ -d "$candidate/chainstate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done < <(find "$stage" -mindepth 1 -maxdepth 3 -type d -name blocks -print0)

  return 1
}

if (( ! SKIP_BOOTSTRAP )); then
  BOOTSTRAP_READY=0

  # Recover the nested layout left by older official bootstrap-index releases.
  # This also lets a failed installer retry continue without another 1.9 GiB
  # download when the previous unzip completed successfully.
  if [[ -d "$CORE_DATA/bootstrap-index/blocks" && -d "$CORE_DATA/bootstrap-index/chainstate" ]]; then
    log "Recovering previously extracted nested bootstrap"
    install_bootstrap_tree "$CORE_DATA/bootstrap-index"
    rm -rf "$CORE_DATA/bootstrap-index"
    BOOTSTRAP_READY=1
    log "Recovered blockchain bootstrap without re-downloading it"
  elif [[ -d "$CORE_DATA/blocks" && -d "$CORE_DATA/chainstate" ]]; then
    BOOTSTRAP_READY=1
    log "Existing blockchain data detected; keeping current blocks/ and chainstate/"
  fi

  log "Discovering latest official YERB-Bootstrap release"
  BOOT_JSON="$(curl -fsSL "$BOOTSTRAP_RELEASE_API")" || die "Unable to read YERB-Bootstrap release metadata."
  BOOT_TAG="$(printf '%s' "$BOOT_JSON" | jq -r '.tag_name // empty')"
  BOOT_NAME="$(printf '%s' "$BOOT_JSON" | jq -r '.name // empty')"
  BOOT_BODY="$(printf '%s' "$BOOT_JSON" | jq -r '.body // empty')"

  POW_URL="$(printf '%s' "$BOOT_JSON" | jq -r 'first(.assets[] | select(.name == "powcache.dat") | .browser_download_url) // empty')"
  POW_DIGEST="$(printf '%s' "$BOOT_JSON" | jq -r 'first(.assets[] | select(.name == "powcache.dat") | (.digest // "")) // empty')"
  POW_DIGEST="${POW_DIGEST#sha256:}"
  [[ -n "$POW_URL" && "$POW_URL" != "null" ]] || die "Latest bootstrap release has no powcache.dat."

  if (( ! BOOTSTRAP_READY )); then
    BOOT_URL="$(printf '%s' "$BOOT_JSON" | jq -r 'first(.assets[] | select(.name == "bootstrap-index.zip") | .browser_download_url) // empty')"
    BOOT_DIGEST="$(printf '%s' "$BOOT_JSON" | jq -r 'first(.assets[] | select(.name == "bootstrap-index.zip") | (.digest // "")) // empty')"
    BOOT_DIGEST="${BOOT_DIGEST#sha256:}"
    BOOT_SIZE="$(printf '%s' "$BOOT_JSON" | jq -r 'first(.assets[] | select(.name == "bootstrap-index.zip") | .size) // empty')"
    [[ -n "$BOOT_URL" && "$BOOT_URL" != "null" ]] || die "Latest bootstrap release has no bootstrap-index.zip."

    if [[ "$BOOT_SIZE" =~ ^[0-9]+$ ]]; then
      BOOT_MB=$(( BOOT_SIZE / 1024 / 1024 ))
      log "Bootstrap release $BOOT_TAG: $BOOT_NAME"
      log "bootstrap-index.zip download size: about $BOOT_MB MiB"
    else
      log "Bootstrap release $BOOT_TAG: $BOOT_NAME"
    fi

    if [[ -n "$BOOT_BODY" ]]; then
      printf '%s\n' "$BOOT_BODY" | sed 's/^/[bootstrap] /'
    fi

    BOOT_ZIP="$WORKDIR/bootstrap-index.zip"
    BOOT_STAGE="$WORKDIR/bootstrap-stage"
    mkdir -p "$BOOT_STAGE"

    log "Downloading indexed blockchain bootstrap"
    curl -fL --retry 3 --retry-delay 2 --progress-bar "$BOOT_URL" -o "$BOOT_ZIP"
    verify_sha256 "$BOOT_ZIP" "$BOOT_DIGEST"

    log "Staging indexed blockchain bootstrap"
    unzip -oq "$BOOT_ZIP" -d "$BOOT_STAGE"

    BOOT_ROOT="$(find_bootstrap_root "$BOOT_STAGE")" \
      || die "Unable to locate blocks/ and chainstate/ inside bootstrap-index.zip."

    log "Installing bootstrap tree"
    install_bootstrap_tree "$BOOT_ROOT"
    BOOTSTRAP_READY=1
  fi

  POW_FILE="$WORKDIR/powcache.dat"
  if [[ ! -s "$CORE_DATA/powcache.dat" ]]; then
    log "Downloading GhostRider PoW cache"
    curl -fL --retry 3 --retry-delay 2 --progress-bar "$POW_URL" -o "$POW_FILE"
    verify_sha256 "$POW_FILE" "$POW_DIGEST"
    install -m 0600 "$POW_FILE" "$CORE_DATA/powcache.dat"
  else
    log "Existing powcache.dat detected; keeping current cache"
  fi

  printf '%s\n' "$BOOT_TAG" > "$CORE_DATA/.explorer-light-bootstrap-release"
  chown -R "$CORE_USER:$CORE_USER" "$CORE_DATA"
  log "Official indexed blockchain bootstrap is ready"
else
  warn "Bootstrap download was skipped; Core will sync the blockchain from peers."
fi

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

log "Publishing temporary Explorer sync page"

install -d -m 0755 /var/www/yerbas-explorer-sync
cat > /var/www/yerbas-explorer-sync/index.html <<'EOF'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="60">
  <meta name="theme-color" content="#07110b">
  <title>Yerbas Explorer Light · Core Syncing</title>
  <style>
    :root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;color:#edf8ef;
    background:radial-gradient(circle at 70% 10%,rgba(77,149,96,.17),transparent 32rem),#07110b}
    main{width:min(760px,calc(100% - 34px));border:1px solid rgba(164,255,178,.18);padding:clamp(28px,7vw,68px);
    background:rgba(11,23,16,.82);box-shadow:0 32px 90px rgba(0,0,0,.35)}
    .signal{display:flex;align-items:center;gap:10px;color:#8df19e;font-size:11px;letter-spacing:.14em}
    .dot{width:8px;height:8px;border-radius:50%;background:#8df19e;box-shadow:0 0 18px #8df19e}
    h1{font-family:system-ui,sans-serif;font-size:clamp(40px,9vw,74px);line-height:.94;letter-spacing:-.055em;margin:26px 0 20px}
    p{color:#9db1a2;line-height:1.7;max-width:620px}strong{color:#b5ffc0}
    .rail{margin:30px 0 16px;height:3px;background:rgba(164,255,178,.09);overflow:hidden}
    .rail:after{content:"";display:block;width:32%;height:100%;background:#8df19e;animation:scan 2.2s ease-in-out infinite}
    .meta{display:flex;gap:14px;flex-wrap:wrap;color:#6f8876;font-size:10px;letter-spacing:.1em}
    @keyframes scan{0%{transform:translateX(-105%)}100%{transform:translateX(420%)}}
  </style>
</head>
<body>
  <main>
    <div class="signal"><span class="dot"></span><span>YERBAS MAINNET · CORE STARTING</span></div>
    <h1>Loading the chain.</h1>
    <p><strong>Yerbas Explorer Light is installed.</strong> Yerbas Core is loading and synchronizing the blockchain first so the explorer starts from authoritative chain data.</p>
    <div class="rail"></div>
    <div class="meta"><span>RPC-FIRST</span><span>DATABASE 0</span><span>AUTO-REFRESH 60S</span></div>
  </main>
</body>
</html>
EOF

if [[ "$DOMAIN" == "_" ]]; then
  SYNC_LISTEN_LINE="listen 80 default_server;"
else
  SYNC_LISTEN_LINE="listen 80;"
fi

cat > /etc/nginx/sites-available/yerbas-explorer-light <<EOF
server {
    $SYNC_LISTEN_LINE
    server_name $DOMAIN;
    root /var/www/yerbas-explorer-sync;
    index index.html;

    location / {
        try_files \$uri /index.html;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/yerbas-explorer-light /etc/nginx/sites-enabled/yerbas-explorer-light
nginx -t
systemctl enable --now nginx
systemctl reload nginx

log "Temporary website is online while Yerbas Core synchronizes"

log "Waiting for Yerbas Core RPC to become available"
CORE_RPC_READY=0
for attempt in $(seq 1 900); do
  if sudo -u "$CORE_USER" /usr/local/bin/yerbas-cli \
      -datadir="$CORE_DATA" \
      -conf="$CORE_DATA/yerbas.conf" \
      getblockchaininfo > "$WORKDIR/blockchaininfo.json" 2>/dev/null; then
    CORE_RPC_READY=1
    break
  fi

  if (( attempt % 15 == 0 )); then
    printf '[Explorer-Light] Core is loading bootstrap/index data...\n'
  fi
  sleep 2
done

(( CORE_RPC_READY )) || die "Yerbas Core RPC did not become ready. Check: journalctl -u yerbasd -n 100 --no-pager"

log "Yerbas Core RPC is responding"
jq '{
  chain,
  blocks,
  headers,
  bestblockhash,
  verificationprogress,
  initialblockdownload
}' "$WORKDIR/blockchaininfo.json" || cat "$WORKDIR/blockchaininfo.json"

log "Waiting for Yerbas Core to finish blockchain synchronization before installing Explorer Light"
log "This can take an hour or more after loading the bootstrap; timeout is $CORE_SYNC_TIMEOUT_SECONDS seconds."

SYNC_STARTED="$(date +%s)"
SYNC_LAST_REPORT=0
CORE_SYNC_READY=0

while true; do
  if sudo -u "$CORE_USER" /usr/local/bin/yerbas-cli \
      -datadir="$CORE_DATA" \
      -conf="$CORE_DATA/yerbas.conf" \
      getblockchaininfo > "$WORKDIR/blockchaininfo.json" 2>/dev/null; then

    BLOCKS="$(jq -r '.blocks // 0' "$WORKDIR/blockchaininfo.json")"
    HEADERS="$(jq -r '.headers // 0' "$WORKDIR/blockchaininfo.json")"
    VERIFY="$(jq -r '.verificationprogress // 0' "$WORKDIR/blockchaininfo.json")"

    CONNECTIONS="$(sudo -u "$CORE_USER" /usr/local/bin/yerbas-cli \
      -datadir="$CORE_DATA" \
      -conf="$CORE_DATA/yerbas.conf" \
      getconnectioncount 2>/dev/null || printf '0')"

    SYNC_NOW="$(date +%s)"
    SYNC_ELAPSED=$(( SYNC_NOW - SYNC_STARTED ))

    if (( SYNC_ELAPSED - SYNC_LAST_REPORT >= 60 )); then
      VERIFY_PERCENT="$(awk -v p="$VERIFY" 'BEGIN { printf "%.4f", p * 100 }')"
      printf '[Explorer-Light] Core sync: blocks=%s headers=%s verification=%s%% peers=%s elapsed=%ss\n' \
        "$BLOCKS" "$HEADERS" "$VERIFY_PERCENT" "$CONNECTIONS" "$SYNC_ELAPSED"
      SYNC_LAST_REPORT="$SYNC_ELAPSED"
    fi

    # A newly loaded bootstrap can report blocks == headers before it has
    # connected to peers. Require peers plus near-complete verification so the
    # explorer is never brought online against a stale bootstrap tip.
    if [[ "$BLOCKS" =~ ^[0-9]+$ && "$HEADERS" =~ ^[0-9]+$ && "$CONNECTIONS" =~ ^[0-9]+$ ]]; then
      VERIFY_READY="$(awk -v p="$VERIFY" 'BEGIN { print (p >= 0.99999) ? 1 : 0 }')"
      if (( BLOCKS >= HEADERS && CONNECTIONS > 0 && VERIFY_READY == 1 )); then
        CORE_SYNC_READY=1
        break
      fi
    fi
  else
    SYNC_NOW="$(date +%s)"
    SYNC_ELAPSED=$(( SYNC_NOW - SYNC_STARTED ))
  fi

  if (( SYNC_ELAPSED >= CORE_SYNC_TIMEOUT_SECONDS )); then
    die "Yerbas Core did not finish synchronizing within $CORE_SYNC_TIMEOUT_SECONDS seconds. Leave yerbasd running and re-run the installer later."
  fi

  sleep 15
done

log "Yerbas Core blockchain synchronization is ready"
jq '{
  chain,
  blocks,
  headers,
  bestblockhash,
  verificationprogress,
  initialblockdownload
}' "$WORKDIR/blockchaininfo.json" || cat "$WORKDIR/blockchaininfo.json"

log "Installing Explorer Light branch $EXPLORER_BRANCH as $ADMIN_USER"
systemctl stop yerbas-explorer-light.service >/dev/null 2>&1 || true
rm -rf "$EXPLORER_DIR"
install -d -m 0755 -o "$ADMIN_USER" -g "$ADMIN_USER" "$EXPLORER_DIR"
sudo -u "$ADMIN_USER" git clone --depth 1 --branch "$EXPLORER_BRANCH" "$EXPLORER_REPO" "$EXPLORER_DIR"

cat > "$EXPLORER_DIR/.env" <<EOF
# Explorer HTTP service. nginx is the public entry point.
HOST=127.0.0.1
PORT=$APP_PORT

# Local Yerbas Core RPC generated by the installer.
RPC_PROTOCOL=http
RPC_HOST=127.0.0.1
RPC_PORT=$RPC_PORT
RPC_USER=$RPC_USER
RPC_PASSWORD=$RPC_PASSWORD
RPC_TIMEOUT_MS=10000

RECENT_BLOCKS=12
CACHE_MS=5000

# Read-only Yerbas AI gateway.
AI_API_ENABLED=true
AI_MAX_BODY_BYTES=32768

# Approximate network map geolocation. Requests are made server-side and cached.
NETWORK_MAP_ENABLED=true
NETWORK_MAP_GEO_URL=https://hackmyip.com/api/bulk
NETWORK_MAP_GEO_CACHE_MS=86400000
NETWORK_MAP_GEO_TIMEOUT_MS=12000
EOF

log "Validating Explorer Light as $ADMIN_USER"
cd "$EXPLORER_DIR"
sudo -u "$ADMIN_USER" npm test
sudo -u "$ADMIN_USER" npm run check

# Lock the deployed tree down after the non-root build/test step.
chown -R root:"$EXPLORER_USER" "$EXPLORER_DIR"
chmod -R g+rX,o-rwx "$EXPLORER_DIR"
chmod 0640 "$EXPLORER_DIR/.env"

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
systemctl enable yerbas-explorer-light
systemctl restart yerbas-explorer-light

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
        proxy_read_timeout 30s;
    }

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sfn \
  /etc/nginx/sites-available/yerbas-explorer-light \
  /etc/nginx/sites-enabled/yerbas-explorer-light

nginx -t
systemctl enable --now nginx
systemctl reload nginx

if (( HTTPS )); then
  log "Configuring Let's Encrypt HTTPS for $DOMAIN"
  apt-get install -y certbot python3-certbot-nginx

  CERTBOT_ARGS=(
    --nginx
    --non-interactive
    --agree-tos
    --redirect
    -d "$DOMAIN"
  )

  if [[ -n "$EMAIL" ]]; then
    CERTBOT_ARGS+=(--email "$EMAIL")
  else
    CERTBOT_ARGS+=(--register-unsafely-without-email)
  fi

  certbot "${CERTBOT_ARGS[@]}"
  systemctl enable --now certbot.timer >/dev/null 2>&1 || true
fi

rm -rf /var/www/yerbas-explorer-sync

log "Running final local checks"
systemctl is-active --quiet yerbasd \
  || die "yerbasd failed. Run: journalctl -u yerbasd -n 100 --no-pager"
systemctl is-active --quiet yerbas-explorer-light \
  || die "Explorer failed. Run: journalctl -u yerbas-explorer-light -n 100 --no-pager"
systemctl is-active --quiet nginx \
  || die "nginx failed."

EXPLORER_HEALTH_READY=0
for attempt in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$APP_PORT/api/health" > "$WORKDIR/explorer-health.json" 2>/dev/null; then
    EXPLORER_HEALTH_READY=1
    break
  fi
  sleep 2
done

(( EXPLORER_HEALTH_READY )) || {
  systemctl status yerbas-explorer-light --no-pager || true
  journalctl -u yerbas-explorer-light -n 60 --no-pager || true
  die "Explorer health endpoint did not become ready."
}

jq . "$WORKDIR/explorer-health.json"

AI_HEALTH_READY=0
for attempt in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$APP_PORT/api/ai/v1/status" > "$WORKDIR/ai-status.json" 2>/dev/null; then
    AI_HEALTH_READY=1
    break
  fi
  sleep 2
done

(( AI_HEALTH_READY )) || die "AI status endpoint did not become ready."
jq . "$WORKDIR/ai-status.json"

printf '\n============================================================\n'
printf ' Yerbas Explorer Light installation complete\n'
printf '============================================================\n\n'

if [[ "$DOMAIN" == "_" ]]; then
  echo "Explorer: http://<server-ip>/"
elif (( HTTPS )); then
  echo "Explorer: https://$DOMAIN/"
else
  echo "Explorer: http://$DOMAIN/"
fi

echo
echo "Yerbas Core configuration:"
echo "  $CORE_DATA/yerbas.conf"
echo
echo "Explorer RPC configuration:"
echo "  $EXPLORER_DIR/.env"
echo
echo "Core synchronization:"
echo "  sudo -u $CORE_USER yerbas-cli -datadir=$CORE_DATA -conf=$CORE_DATA/yerbas.conf getblockchaininfo"
echo
echo "Explorer:"
echo "  curl -s http://127.0.0.1:$APP_PORT/api/health | jq"
echo
echo "AI:"
echo "  curl -s http://127.0.0.1:$APP_PORT/api/ai/v1/status | jq"
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
echo "Administration:"
echo "  SSH/sudo administrator: $ADMIN_USER"
echo "  This account is key-only and uses passwordless sudo."
if (( SSH_HARDENED )); then
  echo "  Root SSH login and SSH password authentication are disabled."
else
  echo "  SSH login policy was not tightened because no authorized key was found."
fi
echo
echo "Security:"
echo "  UFW is enabled with inbound deny-by-default."
echo "  Only SSH, HTTP/HTTPS, and Yerbas P2P 15420/tcp are opened."
echo "  Fail2ban SSH protection and unattended security updates are enabled."
echo "  Yerbas RPC is bound to 127.0.0.1 only."
echo "  Explorer Light is bound to 127.0.0.1 behind nginx."
echo "  The Explorer .env contains generated RPC credentials and is not web-accessible."
echo "  The AI gateway remains read-only and exposes no arbitrary RPC."
