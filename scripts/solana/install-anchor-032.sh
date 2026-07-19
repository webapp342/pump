#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Anchor CLI 0.32 needs pkg-config + libudev (hidapi)
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq pkg-config libudev-dev build-essential

avm install 0.32.1
avm use 0.32.1
anchor --version
