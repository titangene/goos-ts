#!/bin/bash -e
set -e

# 沿用官方 image entrypoint.sh 的 uid/gid 修正邏輯（見
# https://github.com/prosody/prosody-docker/blob/master/entrypoint.sh），
# 只把原本「單一帳號」的 LOCAL/PASSWORD/DOMAIN 註冊區塊換成 ADR-0003 白名單的
# 三個帳號，其餘邏輯逐行照抄，避免跳過官方原有的權限修正步驟。

data_dir_owner="$(stat -c %u "/var/lib/prosody/")"
if [[ "$(id -u prosody)" != "$data_dir_owner" ]]; then
	usermod -u "$data_dir_owner" prosody
fi
if [[ "$(stat -c %u /var/run/prosody/)" != "$data_dir_owner" ]]; then
	chown "$data_dir_owner" /var/run/prosody/
fi

if [[ "$1" != "prosody" ]]; then
	exec prosodyctl "$@"
	exit 0
fi

domain="${PROSODY_VIRTUAL_HOSTS:-localhost}"
for credential in "sniper:sniper" "auction-item-54321:auction" "auction-item-65432:auction"; do
	username="${credential%%:*}"
	password="${credential##*:}"
	if ! prosodyctl register "$username" "$domain" "$password" 2>/tmp/register.log; then
		grep -q "already exists" /tmp/register.log || cat /tmp/register.log
	fi
done

exec runuser -u prosody -- "$@"
