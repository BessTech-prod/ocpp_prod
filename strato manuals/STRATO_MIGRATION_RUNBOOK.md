# Runbook: Migration AWS + Simply -> STRATO (EV CSMS)

Detta runbook beskriver en kontrollerad flytt av `evcsms` från nuvarande AWS-hosting (med doman/DNS hos Simply) till STRATO, utan att bryta laddarnas OCPP-anslutning.

Kompletterande dokument:
- `Manuals/STRATO_ENV_TEMPLATE.md` - exakt `.env`-mall och variabelklassning
- `Manuals/STRATO_DEPLOY_SEQUENCE.md` - kortaste deployordning fram till frisk stack
- `Manuals/STRATO_GO_LIVE_CHECKLIST.md` - operativ go-live-checklista
- `Manuals/SAKERHETS_FUNKTIONER.md` - sakerhetskontroller med `MASTE` vs `TILLVAL`

## Malbild

- Behall samma externa endpointnamn for laddare och klienter (FQDN).
- Flytta drift till STRATO med samma funktionalitet som i `evcsms/docker-compose.yml`.
- Genomfor cutover med tydlig rollback inom minuter.

## Klassning

- **[MASTE]** = krav for migration, cutover eller stabil drift pa STRATO.
- **[TILLVAL]** = forberett eller rekommenderat, men ska bara aktiveras om ni planerat for det.

## Galler for nuvarande stack

Bekraftat i repo (`evcsms/docker-compose.yml`):
- `redis-service` (6379)
- `ocpp-ws-service` (9000)
- `api-service` (8000)
- `ui-service` (intern port 80 via proxy)

Sakerhetsviktigt i nuvarande konfiguration:
- **[MASTE]** `redis-service` publiceras inte pa host-port (intern trafik endast).
- **[MASTE]** `api-service` binds till `127.0.0.1:8000`.
- **[MASTE]** `ocpp-ws-service` binds till `127.0.0.1:9000`.
- **[MASTE]** `APP_SECRET` och `REDIS_PASSWORD` ar obligatoriska (ingen osaker fallback).
- **[TILLVAL]** OCPP-stod for anslutningsautentisering finns (`CP_AUTH_REQUIRED`, `CP_SHARED_TOKEN`) men ska vara avstangt i daglig drift tills migrationsfonster.

## Viktig princip for laddare

For att laddarna ska fortsatta fungera utan omkonfiguration:
1. Behall samma OCPP-hostname (ex. `ocpp.dindoman.se`).
2. Behall samma protokoll/path (`wss://.../samma-path`).
3. Se till att TLS-certifikatet pa STRATO matchar exakt samma hostname.
4. Byt endast DNS-pekning vid cutover.

Om hostname byts maste manga laddare reprovisioneras manuellt.

---

## Fas 0 - Beslut och roller

- [ ] Utsedd migreringsansvarig
- [ ] Utsedd DNS-ansvarig
- [ ] Utsedd rollback-beslutare
- [ ] Godkant migreringsfonster (lag trafik)
- [ ] Kommunikationsplan (vem informeras vid Go/No-Go)

---

## Fas 1 - Forinventering (obligatorisk)

Skapa en migreringslogg med dessa punkter innan tekniskt arbete:

### 1.1 Endpoints och trafik
- [ ] UI URL (ex. `https://takoramacharge.se/`)
- [ ] API URL (ex. `https://api.takoramacharge.se/`)
- [ ] OCPP URL for laddare (exakt FQDN, path, port)
- [ ] Eventuella webhookar/callbacks till er miljo

### 1.2 DNS hos Simply
- [ ] Exportera alla DNS-records (A/AAAA/CNAME/TXT/MX)
- [ ] Dokumentera nuvarande TTL per kritisk record
- [ ] Identifiera records for OCPP/API/UI separat

### 1.3 Certifikat/TLS
- [ ] Vem utfardar cert idag (Lets Encrypt/annan)
- [ ] SAN/CN innehaller alla anvanda hostnames
- [ ] Fornyelseflode dokumenterat

### 1.4 Driftdata och secrets
- [ ] **[MASTE]** Backup av `evcsms/.env`
- [ ] **[MASTE]** Backup av `evcsms/data/`
- [ ] **[MASTE]** Backup av `evcsms/config/`
- [ ] **[MASTE]** Lista externa credentials (SMTP, API-nycklar, etc.)
- [ ] **[MASTE]** Verifiera att dessa finns i `.env`: `REDIS_PASSWORD`, `APP_SECRET`, `SESSION_COOKIE_SECURE`, `CP_AUTH_REQUIRED`
- [ ] **[MASTE]** Bekrafta driftlage fore migration: `CP_AUTH_REQUIRED=false`
- [ ] **[TILLVAL]** Om ni vill aktivera CP-auth under migration: verifiera utrullad `CP_SHARED_TOKEN`-plan till laddare

### 1.5 Beroenden
- [ ] IP-whitelist hos tredjepart (om nagon)
- [ ] Overvakning/alarmering som maste uppdateras
- [ ] Firewallregler pa malmiljon

---

## Fas 2 - Bygg malmiljo pa STRATO (parallellt)

## 2.1 Basinstallation

```bash
# Exempel pa ny host
ssh root@<strato-host>

# Skapa driftanvandare om behovs
adduser deploy
usermod -aG docker deploy
```

## 2.2 Deploy katalog

```bash
# Som deploy-anvandare
mkdir -p ~/projects1/ocpp_projekt2.0
cd ~/projects1/ocpp_projekt2.0

# Klona repo
# (SSH eller HTTPS beroende pa er policy)
git clone git@github.com:BessTech-prod/ocpp_projekt2.0.git .

cd evcsms
```

## 2.3 Konfiguration och data

```bash
# Kopiera in produktionsfiler fran AWS-backup
# .env, config/, data/

ls -la .env
ls -la config
ls -la data
```

Verifiera kravda sakerhetsvariabler i `.env` innan start:

```bash
grep -E '^(REDIS_PASSWORD|APP_SECRET|SESSION_COOKIE_SECURE|MAX_IMPORT_FILE_BYTES|CP_AUTH_REQUIRED|CP_SHARED_TOKEN)=' .env
```

Rekommenderat fore migration (for att skydda lopande drift):

```bash
CP_AUTH_REQUIRED=false
```

**[MASTE]** Behall detta lage tills basmigreringen ar verifierad.

## 2.4 Starta tjanster

```bash
cd ~/projects1/ocpp_projekt2.0/evcsms
./run.sh build
./run.sh up
./run.sh logs
```

## 2.5 Basverifiering lokalt pa STRATO-host

```bash
curl -f http://localhost:8000/health
curl -I http://localhost/
```

---

## Fas 3 - Reverse proxy + TLS pa STRATO

Malsattning: exponera samma externa hostnames som idag, med giltigt certifikat.

- [ ] **[MASTE]** Proxy for `https://<ui-host>/` -> `ui-service`
- [ ] **[MASTE]** Proxy for `https://<api-host>/` -> `api-service:8000`
- [ ] **[MASTE]** Proxy for `wss://<ocpp-host>/...` -> `ocpp-ws-service:9000`
- [ ] **[MASTE]** WebSocket upgrade headers aktiverade
- [ ] **[MASTE]** Certifikat installerat for alla hostnames
- [ ] **[MASTE]** Reverse proxy ar pa samma host/nat som `127.0.0.1:8000` och `127.0.0.1:9000`

Verifiera TLS innan cutover (med temporar hostfil eller testsubdoman):

```bash
# Kontrollera cert och handshake
curl -vkI https://<ui-host>/
curl -vkI https://<api-host>/health
```

For OCPP kan ni verifiera handshake med testklient/simulator i labb.
**[TILLVAL]** Om ni valjer att aktivera CP-auth under migration: verifiera att token skickas i anslutnings-URL (ex. `wss://<ocpp-host>/<ChargeBoxId>?token=<token>`).

---

## Fas 4 - DNS-forberedelse hos Simply

24-48 timmar innan cutover:
- [ ] Sank TTL for kritiska records till 60-300 sek
- [ ] Bekrafta att TTL faktiskt slagit igenom

```bash
# Kontrollera aktuella records och TTL
# (fran valfri klient)
dig <ocpp-host> +noall +answer

dig <api-host> +noall +answer

dig <ui-host> +noall +answer
```

---

## Fas 5 - Pre-Cutover test (Go/No-Go)

Krav innan DNS-switch:
- [ ] **[MASTE]** Alla containers friska (`docker compose ps`)
- [ ] **[MASTE]** API health OK via planerad extern URL
- [ ] **[MASTE]** UI inloggning fungerar
- [ ] **[MASTE]** OCPP testladdare ansluter stabilt mot STRATO endpoint
- [ ] **[MASTE]** Loggar utan kritiska fel senaste 30 min
- [ ] **[MASTE]** Portkontroll visar ingen extern Redis-port
- [ ] **[MASTE]** Om CP-auth inte aktiveras i detta steg: `CP_AUTH_REQUIRED=false` verifierat

```bash
cd ~/projects1/ocpp_projekt2.0/evcsms
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs --tail=200 api-service
docker compose -f docker-compose.yml logs --tail=200 ocpp-ws-service
ss -tuln | grep -E '(:6379|:8000|:9000)'
```

---

## Fas 6 - Cutover (DNS-switch)

## 6.1 Frys andringar under fonster
- [ ] Ingen deploy under cutover
- [ ] Beslutad starttid och rollback-grans satt

## 6.2 Andra DNS hos Simply
- [ ] Peka `A/AAAA` (eller CNAME enligt design) for OCPP/API/UI till STRATO
- [ ] Spara skarmdump/export av gamla och nya records

## 6.3 Omedelbar verifikation

```bash
# Externa kontroller
dig +short <ocpp-host>
dig +short <api-host>
dig +short <ui-host>

curl -I https://<ui-host>/
curl -I https://<api-host>/health
```

## 6.4 OCPP-overvakning
- [ ] **[MASTE]** Folj antal uppkopplade laddare minut-for-minut
- [ ] **[MASTE]** Bekrafta nya sessioner/heartbeat
- [ ] **[MASTE]** Bekrafta att inga TLS-/socket-fel okar kraftigt
- [ ] **[TILLVAL]** Om CP-auth ar aktiverat: bekrafta att inga "Rejected CP"-loggar okar (okand CP/tokenfel)

## Fas 6.5 - CP-auth switch under migration (endast om ni valjer att aktivera den)

Anvand endast denna sektion efter att grundmigreringen fungerar stabilt pa STRATO.

### Forutsattningar
- [ ] **[MASTE]** `CP_AUTH_REQUIRED=false` har använts under basmigreringen utan driftstörning
- [ ] **[MASTE]** Alla laddare som ska tillatas finns i `cps.json`
- [ ] **[MASTE]** Rollback ar forberedd: satt tillbaka `CP_AUTH_REQUIRED=false` och starta om `ocpp-ws-service`
- [ ] **[TILLVAL]** `CP_SHARED_TOKEN` ar distribuerad till laddare om token-skydd ska anvandas

### Aktivering

Uppdatera `.env`:

```bash
CP_AUTH_REQUIRED=true
CP_SHARED_TOKEN=<shared-ocpp-token>
```

Starta om OCPP-tjansten:

```bash
cd ~/projects1/ocpp_projekt2.0/evcsms
docker compose -f docker-compose.yml up -d --no-deps ocpp-ws-service
docker compose -f docker-compose.yml logs -f --tail=200 ocpp-ws-service
```

### Omedelbar rollback

Om antalet uppkopplade laddare faller eller "Rejected CP"-loggar okar:

```bash
cd ~/projects1/ocpp_projekt2.0/evcsms
sed -i 's/^CP_AUTH_REQUIRED=.*/CP_AUTH_REQUIRED=false/' .env
docker compose -f docker-compose.yml up -d --no-deps ocpp-ws-service
docker compose -f docker-compose.yml logs --tail=200 ocpp-ws-service
```

---

## Fas 7 - Rollbackplan (maste vara klar innan cutover)

Rollback-trigger (exempel):
- >20% laddare ateransluter inte inom 15-30 min
- Kritiska API-fel eller inloggning fungerar inte
- TLS-fel pa kritiska hostnames

Rollback-atgard:
1. Aterstall DNS records till AWS-IP.
2. Bekrafta propagationsstatus med `dig`.
3. Fortsatt drifta AWS tills felorsak ar atgardad.

```bash
# Kontroll efter rollback
curl -I https://<ui-host>/
curl -I https://<api-host>/health
```

Behall AWS-miljon aktiv minst 72 timmar efter lyckad migration for snabb fallback.

---

## Fas 8 - Efter cutover (stabilisering 72h)

- [ ] Overvaka felbudget, latens, reconnect-rate
- [ ] Kontrollera certifikatfornyelse i STRATO-miljon
- [ ] Uppdatera driftdokument med nya IP/hostdetaljer
- [ ] Planera kontrollerad avveckling av AWS-resurser

Avveckla inte AWS forran:
- [ ] minst 72h stabil drift
- [ ] normal reconnect-rate for laddare
- [ ] inga kritiska incidenter oppna

---

## Vanliga fallgroppar

1. **Bytt hostname for OCPP** -> laddare maste omprovisioneras.
2. **Fel certifikatkedja/SAN** -> `wss` misslyckas trots ratt DNS.
3. **Proxy utan WebSocket headers** -> OCPP bryts intermittent.
4. **For hog TTL vid cutover** -> lang overgangen med blandad trafik.
5. **For tidig nedstangning av AWS** -> klienter med cachead DNS tappar anslutning.
6. **Glomda whitelists** -> externa integrationer slutar fungera.
7. **Ingen tydlig rollback-grans** -> forsenad aterstallning och langre avbrott.
8. **CP-auth aktiverat utan token-plan** -> laddare nekas anslutning efter cutover.

**Klassning:**
- **[MASTE att hantera]** Punkt 1-7
- **[TILLVAL / bara relevant om CP-auth aktiveras]** Punkt 8

---

## Snabb checklista (operativ)

## D-7 till D-2
- [ ] Inventering klar
- [ ] STRATO-miljo byggd
- [ ] Data/secrets migrerade
- [ ] TLS verifierad

## D-1
- [ ] TTL sankt
- [ ] Go/No-Go test PASS
- [ ] Rollbackplan verifierad

## D0 (cutover)
- [ ] DNS switch genomford
- [ ] Endpoint checks PASS
- [ ] OCPP reconnect narmar normalniva

## D+1 till D+3
- [ ] Stabil drift
- [ ] Incidentfri period
- [ ] Beslut om AWS-avveckling

---

## Migreringsprotokoll (fyll i)

- Datum/tid start:
- Datum/tid DNS-switch:
- Operator:
- Godkannare Go/No-Go:
- Gamla DNS-varden:
- Nya DNS-varden:
- Certifikatdetaljer:
- Laddare online fore/efter:
- Incidenter:
- Rollback behovd (Y/N):
- Slutsats:

