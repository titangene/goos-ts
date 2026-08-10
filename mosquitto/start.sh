#!/usr/bin/env bash
# ADR-0004、ADR-0005：獨立於 npm/node 之外啟動 Mosquitto，
# 讓 docker 需要的權限（若有）跟 npm/node 工具鏈的執行權限分開處理，
# 不要透過 npm script 間接把整條 JS 工具鏈一起拉高權限。
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
docker run --rm --name goos-mosquitto -p 1883:1883 -p 9001:9001 \
  -v "$(pwd)/mosquitto.conf:/mosquitto/config/mosquitto.conf" \
  eclipse-mosquitto:2
