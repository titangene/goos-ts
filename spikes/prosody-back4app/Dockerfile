# Prosody XMPP server 部署 spike — 驗證 Back4app Containers 免費方案是否能
# 正確對外提供 XMPP over WebSocket（見 poc/docs/adr/ADR-0002 的評估過程）。
#
# 沿用官方 image（prosodyim/prosody），只覆寫 entrypoint 以在啟動時自動註冊
# ADR-0003 白名單帳號（sniper/sniper、auction-item-54321/auction、
# auction-item-65432/auction），取代官方 image 只能透過 LOCAL/PASSWORD/DOMAIN
# 三個環境變數註冊「單一」帳號的限制。
FROM prosodyim/prosody:13.0

COPY register-and-start.sh /register-and-start.sh
RUN chmod 755 /register-and-start.sh
ENTRYPOINT ["/usr/bin/tini", "--", "/register-and-start.sh"]
CMD ["prosody", "-F"]
