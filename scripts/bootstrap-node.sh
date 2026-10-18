#!/usr/bin/env sh
# Sourced by start.sh; keep the runtime and PATH local to this launch.
chatroom_node_ok() {
  "$1" -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<24||(major===24&&minor<5)||!process.allowedNodeEnvironmentFlags.has("--use-env-proxy"))process.exit(1)' >/dev/null 2>&1
}

chatroom_npm_ok() {
  chatroom_npm_version=$("$@" --version 2>/dev/null) || return 1
  chatroom_npm_major=${chatroom_npm_version%%.*}
  case "$chatroom_npm_major" in ''|*[!0-9]*) return 1 ;; esac
  [ "$chatroom_npm_major" -ge 10 ]
}

chatroom_download() {
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --connect-timeout 10 --max-time 120 --retry 1 --output "$2" "$1" ||
      curl --noproxy '*' --fail --location --connect-timeout 10 --max-time 120 --output "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget --timeout=30 --tries=2 -O "$2" "$1" ||
      HTTP_PROXY= HTTPS_PROXY= ALL_PROXY= http_proxy= https_proxy= all_proxy= wget --no-proxy --timeout=30 --tries=1 -O "$2" "$1"
  else
    printf '%s\n' 'Automatic Node.js setup needs curl or wget. Install one and start again.' >&2
    return 1
  fi
}

chatroom_install_node() (
  set -eu
  case "$(uname -s)" in Linux) chatroom_os=linux ;; Darwin) chatroom_os=darwin ;; *) printf '%s\n' 'Unsupported system. Use start.bat on Windows.' >&2; exit 1 ;; esac
  case "$(uname -m)" in x86_64|amd64) chatroom_arch=x64 ;; aarch64|arm64) chatroom_arch=arm64 ;; *) printf '%s\n' 'Automatic Node.js setup supports x64 and arm64.' >&2; exit 1 ;; esac
  command -v tar >/dev/null 2>&1 || { printf '%s\n' 'Automatic Node.js setup needs tar.' >&2; exit 1; }
  mkdir -p "$CHATROOM_ROOT/.runtime/node" || exit 1
  chatroom_stage=$(mktemp -d "$CHATROOM_ROOT/.runtime/node/.install-XXXXXX") || exit 1
  trap 'rm -rf "$chatroom_stage"' EXIT
  trap 'exit 130' INT TERM
  printf '%s\n' 'Preparing Node.js 24 LTS and npm. First launch requires a download...'
  chatroom_download 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' "$chatroom_stage/SHASUMS256.txt" || exit 1
  chatroom_archive=$(awk -v suffix="-$chatroom_os-$chatroom_arch.tar.gz" '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-/ && substr($2,length($2)-length(suffix)+1)==suffix {print $2; exit}' "$chatroom_stage/SHASUMS256.txt")
  [ -n "$chatroom_archive" ] || { printf '%s\n' 'The official Node.js archive was not found for this platform.' >&2; exit 1; }
  chatroom_release=${chatroom_archive#node-}; chatroom_release=${chatroom_release%%-*}
  chatroom_download "https://nodejs.org/dist/$chatroom_release/$chatroom_archive" "$chatroom_stage/$chatroom_archive" || exit 1
  chatroom_expected=$(awk -v name="$chatroom_archive" '$2==name {print $1}' "$chatroom_stage/SHASUMS256.txt")
  if command -v sha256sum >/dev/null 2>&1; then chatroom_actual=$(sha256sum "$chatroom_stage/$chatroom_archive" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then chatroom_actual=$(shasum -a 256 "$chatroom_stage/$chatroom_archive" | awk '{print $1}')
  elif command -v openssl >/dev/null 2>&1; then chatroom_actual=$(openssl dgst -sha256 "$chatroom_stage/$chatroom_archive" | awk '{print $NF}')
  else printf '%s\n' 'No SHA-256 verification tool is available.' >&2; exit 1; fi
  [ "$chatroom_actual" = "$chatroom_expected" ] || { printf '%s\n' 'Node.js download checksum mismatch. Start again to retry.' >&2; exit 1; }
  tar -xzf "$chatroom_stage/$chatroom_archive" -C "$chatroom_stage" || exit 1
  chatroom_unpacked="$chatroom_stage/${chatroom_archive%.tar.gz}"
  chatroom_node_ok "$chatroom_unpacked/bin/node" || { printf '%s\n' 'Downloaded Node.js cannot run on this system.' >&2; exit 1; }
  "$chatroom_unpacked/bin/node" "$chatroom_unpacked/lib/node_modules/npm/bin/npm-cli.js" --version >/dev/null || exit 1
  if [ -e "$CHATROOM_ROOT/.runtime/node/current" ]; then mv "$CHATROOM_ROOT/.runtime/node/current" "$chatroom_stage/previous"; fi
  if ! mv "$chatroom_unpacked" "$CHATROOM_ROOT/.runtime/node/current"; then
    if [ -e "$chatroom_stage/previous" ]; then mv "$chatroom_stage/previous" "$CHATROOM_ROOT/.runtime/node/current"; fi
    exit 1
  fi
)

chatroom_prepare_node() {
  CHATROOM_NODE=$(command -v node || true)
  if [ -n "$CHATROOM_NODE" ] && chatroom_node_ok "$CHATROOM_NODE" && command -v npm >/dev/null 2>&1 && chatroom_npm_ok npm; then
    PATH="$(dirname -- "$CHATROOM_NODE"):$PATH"
  else
    CHATROOM_NODE="$CHATROOM_ROOT/.runtime/node/current/bin/node"
    if ! chatroom_node_ok "$CHATROOM_NODE" || ! chatroom_npm_ok "$CHATROOM_NODE" "$CHATROOM_ROOT/.runtime/node/current/lib/node_modules/npm/bin/npm-cli.js"; then
      chatroom_install_node || return 1
    fi
    PATH="$CHATROOM_ROOT/.runtime/node/current/bin:$PATH"
    npm_execpath="$CHATROOM_ROOT/.runtime/node/current/lib/node_modules/npm/bin/npm-cli.js"
    export npm_execpath
  fi
  CHATROOM_BOOTSTRAPPED=1
  export CHATROOM_NODE PATH CHATROOM_BOOTSTRAPPED
}
