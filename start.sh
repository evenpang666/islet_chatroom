#!/usr/bin/env sh
set -eu
CHATROOM_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$CHATROOM_ROOT"
. "$CHATROOM_ROOT/scripts/bootstrap-node.sh"
chatroom_prepare_node
if [ "$#" -eq 0 ]; then set -- --open; fi
exec "$CHATROOM_NODE" "$CHATROOM_ROOT/scripts/environment.mjs" "$@"
