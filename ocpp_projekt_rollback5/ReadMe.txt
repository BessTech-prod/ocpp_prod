Lägg till behörigheter via auth_tag.json i den befintliga listan.
separera tagar med ","  .

Kan på distans uppdatera listan genom REST-API
GET http://<server>:8000/auth/tags
POST http://<server>:8000/auth/tags  body: {"tag": "NYTTAGG"}
DELETE http://<server>:8000/auth/tags body: {"tag": "TAGG"}



För att köra i docker:

docker compose up --build -d
# Dashboard: http://<server-lan-ip>:8000/
# REST:      http://<server-lan-ip>:8000/api/...
# OCPP-WS:   ws://<server-lan-ip>:9000/<ChargeBoxId>
 sätt occp endpoint till ws://<local-sever-ip>:9000/<laddbox_kontor>



 Dashboard (web UI):
http://<din-linux-ip>:8000/</din-linux-ip>


Backend/ ocpp konf:
endpoint ws://<min lokala ip>:9000/ <laddbox_kontor>
chargebox id: samma som innan (laddbox_kontor)




framtida docker yml

version: "3.8"

services:
  ocpp-csms:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ocpp-csms
    # Kör EN uvicorn-worker så HTTP-API och OCPP-WS delar minne/state
    command: >
      uvicorn app.main:app
      --host 0.0.0.0
      --port 8000
      --workers 1
      --no-server-header
    environment:
      # *** Byt detta till ett starkt hemligt värde i produktion ***
      APP_SECRET: "${APP_SECRET:-change-me-dev-secret}"
      # Om true → portal_admin/admin-taggar får ladda på alla CP (oavsett org)
      PORTAL_TAGS_GLOBAL: "${PORTAL_TAGS_GLOBAL:-false}"
      # Bootstrap för portal_admin om users.json är tom (endast första gången)
      ADMIN_BOOTSTRAP_EMAIL:  "${ADMIN_BOOTSTRAP_EMAIL:-admin@example.com}"
      ADMIN_BOOTSTRAP_FIRST_NAME: "${ADMIN_BOOTSTRAP_FIRST_NAME:-Portal}"
      ADMIN_BOOTSTRAP_LAST_NAME:  "${ADMIN_BOOTSTRAP_LAST_NAME:-Admin}"
      ADMIN_BOOTSTRAP_PASSWORD:   "${ADMIN_BOOTSTRAP_PASSWORD:-BytMig123!}"
      ADMIN_BOOTSTRAP_RFID:       "${ADMIN_BOOTSTRAP_RFID:-ADMIN}"
      ADMIN_BOOTSTRAP_ORG_ID:     "${ADMIN_BOOTSTRAP_ORG_ID:-default}"
      # Tidszon (frivilligt)
      TZ: "${TZ:-Europe/Stockholm}"
    volumes:
      # Persistens för data och konfiguration
      - ./data:/data
      # (Valfritt i utveckling) Mounta koden så du kan iterera utan rebuild
      # - ./app:/app:ro
    ports:
      # HTTP-API + statiska filer (UI)
      - "8000:8000"
      # OCPP 1.6J WebSocket
      - "9000:9000"
    healthcheck:
      # Enkel hälsokontroll: kontrollera att inloggningssidan kan serveras.
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8000/ui/login.html >/dev/null 2>&1 || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 10s
    restart: unless-stopped
    # (Valfritt) Begränsa resurser om du vill
    # deploy:
    #   resources:
    #     limits:
    #       cpus: "1.0"
    #       memory: 512M

  # --- Valfritt: Nginx-proxy framför ocpp-csms (HTTP/2, TLS, caching av statiskt) ---
  # Ta bort hela denna service om du inte använder en reverse proxy.
  nginx:
    image: nginx:1.25-alpine
    container_name: ocpp-nginx
    depends_on:
      ocpp-csms:
        condition: service_healthy
    ports:
      # Exponera port 80 (och 443 om du sätter TLS)
      - "80:80"
      # - "443:443"
    volumes:
      - ./ops/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      # Lägg cert/nycklar här om du vill köra TLS
      # - ./ops/nginx/certs:/etc/nginx/certs:ro
    restart: unless-stopped