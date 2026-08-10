#!/bin/sh
# ADR-0004: Render 只轉發一個綁定 $PORT 的公開 port，且是啟動時才注入的
# 環境變數，Mosquitto 設定檔本身不支援環境變數替換，所以在啟動時把
# mosquitto.conf 裡 WS listener 的固定 port（9001，本機/CI 用）替換成
# $PORT（未設定時預設回退為 9001，讓本機 docker run 這個映像檔行為不變）。
set -eu

PORT="${PORT:-9001}"
sed "s/^listener 9001\$/listener ${PORT}/" /mosquitto/config/mosquitto.conf > /tmp/mosquitto.runtime.conf

exec mosquitto -c /tmp/mosquitto.runtime.conf
