# STRATO Deploy Sequence

Detta dokument ar den kortaste rekommenderade deploy-sekvensen for `evcsms` pa STRATO.

Det ar inte en full migreringsmanual. Det ar den praktiska ordningen for att:
1. lagga in ratt filer,
2. verifiera `.env`,
3. starta stacken,
4. verifiera lokalt,
5. verifiera externt via proxy/TLS,
6. ga vidare till go-live.

Anvand tillsammans med:
- `Manuals/STRATO_ENV_TEMPLATE.md`
- `Manuals/STRATO_GO_LIVE_CHECKLIST.md`
- `Manuals/STRATO_MIGRATION_RUNBOOK.md`

## Klassning

- **[MASTE]** = ska goras i denna ordning for normal STRATO-drift.
- **[TILLVAL]** = gor endast om ert fonster eller er hardningsplan kraver det.

---

## 1. Forbered katalog och kod

```bash
mkdir -p ~/projects1/ocpp_projekt2.0
cd ~/projects1/ocpp_projekt2.0

git clone git@github.com:BessTech-prod/ocpp_projekt2.0.git .
cd evcsms
```

Checklist:
- [ ] **[MASTE]** Repo finns pa `~/projects1/ocpp_projekt2.0/evcsms`
- [ ] **[MASTE]** Ratt branch/tag ar deployad

---

## 2. Kopiera in driftfiler

Lagg in era produktionsfiler:
- `.env`
- `config/`
- `data/`

Verifiering:

```bash
cd ~/projects1/ocpp_projekt2.0/evcsms
ls -la .env
ls -la config
ls -la data
```

Checklist:
- [ ] **[MASTE]** `.env` finns
- [ ] **[MASTE]** `config/` finns
- [ ] **[MASTE]** `data/` finns

---

## 3. Verifiera `.env`

Anvand `Manuals/STRATO_ENV_TEMPLATE.md` som sanning for initial STRATO-drift.

Minimikrav:

```bash
cd ~/projects1/ocpp_projekt2.0/evcsms

grep -E '^(APP_SECRET|REDIS_PASSWORD|SESSION_COOKIE_SECURE|MAX_IMPORT_FILE_BYTES|CP_AUTH_REQUIRED)=' .env
```

Detta ska galla initialt:

```bash
CP_AUTH_REQUIRED=false
```

Checklist:
- [ ] **[MASTE]** `APP_SECRET` satt
- [ ] **[MASTE]** `REDIS_PASSWORD` satt
- [ ] **[MASTE]** `SESSION_COOKIE_SECURE=true`
- [ ] **[MASTE]** `MAX_IMPORT_FILE_BYTES` satt
- [ ] **[MASTE]** `CP_AUTH_REQUIRED=false`
- [ ] **[TILLVAL]** `CP_SHARED_TOKEN` satt endast om ni planerar separat CP-auth-fas senare

---

## 4. Bygg och starta stacken

```bash
cd ~/projects1/ocpp_projekt2.0/evcsms
./run.sh build
./run.sh up
```

Checklist:
- [ ] **[MASTE]** Build klar utan fel
- [ ] **[MASTE]** Alla containers startar

---

## 5. Lokal verifiering pa STRATO-host

```bash
cd ~/projects1/ocpp_projekt2.0/evcsms

docker compose -f docker-compose.yml ps
curl -f http://localhost:8000/health
curl -I http://localhost/
docker compose -f docker-compose.yml logs --tail=200 api-service
docker compose -f docker-compose.yml logs --tail=200 ocpp-ws-service
ss -tuln | grep -E '(:6379|:8000|:9000)'
```

Godkant resultat:
- `api-service` healthy
- `ui-service` svarar lokalt
- `ocpp-ws-service` utan kritiska startupfel
- `6379` inte externt publicerad
- `8000` och `9000` bundna till `127.0.0.1`

Checklist:
- [ ] **[MASTE]** API health OK
- [ ] **[MASTE]** UI svarar
- [ ] **[MASTE]** OCPP startup-loggar ser normala ut
- [ ] **[MASTE]** Portbindningar ar korrekta

---

## 6. Reverse proxy och TLS

Er proxy ska publicera:
- `https://<ui-host>/` -> `ui-service`
- `https://<api-host>/health` -> `api-service:8000`
- `wss://<ocpp-host>/...` -> `ocpp-ws-service:9000`

Verifiering:

```bash
curl -vkI https://<ui-host>/
curl -vkI https://<api-host>/health
```

Checklist:
- [ ] **[MASTE]** TLS-certifikat korrekt
- [ ] **[MASTE]** UI extern URL OK
- [ ] **[MASTE]** API extern URL OK
- [ ] **[MASTE]** WebSocket upgrade ar korrekt proxad
- [ ] **[TILLVAL]** Labsimulator/testladdare verifierar OCPP mot STRATO innan DNS-switch

---

## 7. Go-live overlamning

Nar steg 1-6 ar godkanda:
- ga vidare till `Manuals/STRATO_GO_LIVE_CHECKLIST.md`
- genomfor DNS-cutover
- overvaga laddaranslutningar och logs minut-for-minut

Checklist:
- [ ] **[MASTE]** Alla forberedande steg ar PASS
- [ ] **[MASTE]** Go-live-checklistan ar oppen och ansvarig operator utsedd

---

## 8. Direkt rollback om lokal deploy inte ar stabil

Om lokal STRATO-miljo inte ar stabil innan DNS-switch:

```bash
cd ~/projects1/ocpp_projekt2.0/evcsms
./run.sh logs
./run.sh down
```

Checklist:
- [ ] **[MASTE]** Stoppa vidare cutover tills lokal miljo ar stabil
- [ ] **[MASTE]** Behall AWS som aktiv produktionsmiljo

---

## 9. Tillval efter stabilisering

- [ ] **[TILLVAL]** Aktivera CP-auth i separat fonster
- [ ] **[TILLVAL]** Lagg till rate limiting
- [ ] **[TILLVAL]** Harda containers ytterligare
- [ ] **[TILLVAL]** Utoka overvakning/logghantering

