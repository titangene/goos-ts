# ADR-0004: MQTT Broker 部署為獨立 Render Web Service
# 見 docs/adr/ADR-0004-mqtt-broker-deployment.md
FROM eclipse-mosquitto:2
COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY start-mosquitto.sh /start-mosquitto.sh
CMD ["/start-mosquitto.sh"]
