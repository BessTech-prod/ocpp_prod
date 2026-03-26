# STRATO Env Template

Detta dokument ar den kanoniska mallen for `.env` nar `evcsms` ska driftas pa STRATO.

Anvand tillsammans med:
- `Manuals/STRATO_DEPLOY_SEQUENCE.md`
- `Manuals/STRATO_GO_LIVE_CHECKLIST.md`
- `Manuals/STRATO_MIGRATION_RUNBOOK.md`

## Klassning

- **[MASTE]** = krav for att stacken ska starta korrekt eller vara saker i produktion.
- **[TILLVAL]** = valfri hardning eller kodstod som inte maste anvandas i initial STRATO-drift.
- **[KODSTOD, EJ COMPOSE-WIRED]** = variabeln finns i koden men skickas inte in via nuvarande `docker-compose.yml`.
- **[DOKUMENTERAD MEN OANVAND]** = finns i docs idag men ingen aktiv runtime-anvandning hittades i kodgenomgangen.

---

## Rekommenderad `.env` for STRATO

```bash
# [MASTE] API/session secret
APP_SECRET=replace-with-long-random-secret

# [MASTE] Redis auth (required unless REDIS_URL is used, which compose does not use by default)
REDIS_PASSWORD=replace-with-long-random-redis-password

# [MASTE] Keep session cookies HTTPS-only in production
SESSION_COOKIE_SECURE=true

# [MASTE] Upload guardrail for import endpoints
MAX_IMPORT_FILE_BYTES=2097152

# [MASTE for initial STRATO go-live] Keep disabled until a separate migration step decides otherwise
CP_AUTH_REQUIRED=false

# [TILLVAL] Only used if CP auth is activated later
CP_SHARED_TOKEN=replace-if-you-plan-to-enable-cp-auth-later

# [TILLVAL / KODSTOD, EJ COMPOSE-WIRED] If you later wire it through compose
SESSION_TTL_MIN=720
PORTAL_TAGS_GLOBAL=false
CP_AUTOMAP_ON_CONNECT=true

# [TILLVAL / KODSTOD, EJ COMPOSE-WIRED in current compose] Alternative Redis connection style
# REDIS_URL=redis://:replace-with-long-random-redis-password@redis-service:6379/0
```

---

## Variabelmatris

| Variabel | Klassning | Kravs nu | Anvands i kod | I compose idag | Kommentar |
|---|---|---:|---:|---:|---|
| `APP_SECRET` | [MASTE] | Ja | Ja | Ja | API startar inte utan denna |
| `REDIS_PASSWORD` | [MASTE] | Ja | Ja | Ja | Redis och API/OCPP anvander den |
| `SESSION_COOKIE_SECURE` | [MASTE] | Ja | Ja | Ja | Ska vara `true` pa STRATO |
| `MAX_IMPORT_FILE_BYTES` | [MASTE] | Ja | Ja | Ja | Skyddar import-endpoints |
| `CP_AUTH_REQUIRED` | [MASTE for initial drift] | Ja | Ja | Ja | Ska vara `false` vid initial STRATO go-live |
| `CP_SHARED_TOKEN` | [TILLVAL] | Nej | Ja | Ja | Bara relevant om CP-auth aktiveras senare |
| `API_PORT` | [TILLVAL] | Nej | Ja | Delvis hardkodad | Compose satter idag `API_PORT=8000` internt |
| `OCPP_PORT` | [TILLVAL] | Nej | Ja | Delvis hardkodad | Compose satter idag `OCPP_PORT=9000` internt |
| `SESSION_TTL_MIN` | [KODSTOD, EJ COMPOSE-WIRED] | Nej | Ja | Nej | API har default `720` minuter |
| `PORTAL_TAGS_GLOBAL` | [KODSTOD, EJ COMPOSE-WIRED] | Nej | Ja | Nej | Paverkar OCPP authorize-policy |
| `CP_AUTOMAP_ON_CONNECT` | [KODSTOD, EJ COMPOSE-WIRED] | Nej | Ja | Nej | Styr auto-mappning av okanda CP i OCPP-tjansten |
| `REDIS_URL` | [KODSTOD, EJ COMPOSE-WIRED] | Nej | Ja | Nej | Alternativ till host/port/password, men ej standard i compose |
| `ADMIN_BOOTSTRAP_EMAIL` | [DOKUMENTERAD MEN OANVAND] | Nej | Nej | Nej | Hittades i README men ingen aktiv runtime-anvandning |
| `ADMIN_BOOTSTRAP_PASSWORD` | [DOKUMENTERAD MEN OANVAND] | Nej | Nej | Nej | Hittades i README men ingen aktiv runtime-anvandning |

---

## Minimikrav innan `./run.sh up`

- [ ] **[MASTE]** `APP_SECRET` satt till starkt, unikt hemligt varde
- [ ] **[MASTE]** `REDIS_PASSWORD` satt till starkt, unikt hemligt varde
- [ ] **[MASTE]** `SESSION_COOKIE_SECURE=true`
- [ ] **[MASTE]** `MAX_IMPORT_FILE_BYTES` satt (eller behall 2097152)
- [ ] **[MASTE]** `CP_AUTH_REQUIRED=false` for initial STRATO-drift

Verifiering:

```bash
cd ~/projects1/ocpp_projekt2.0/evcsms

grep -E '^(APP_SECRET|REDIS_PASSWORD|SESSION_COOKIE_SECURE|MAX_IMPORT_FILE_BYTES|CP_AUTH_REQUIRED)=' .env
```

---

## Rekommenderade STRATO-varden

```bash
APP_SECRET=$(openssl rand -hex 32)
REDIS_PASSWORD=$(openssl rand -hex 32)
SESSION_COOKIE_SECURE=true
MAX_IMPORT_FILE_BYTES=2097152
CP_AUTH_REQUIRED=false
```

Om `openssl` saknas kan ni generera motsvarande pa annan betrodd maskin.

---

## Notering om portar

I nuvarande `docker-compose.yml`:
- `api-service` binds till `127.0.0.1:8000`
- `ocpp-ws-service` binds till `127.0.0.1:9000`
- `redis-service` ar intern-only

Det betyder att extern publicering ska ske via reverse proxy/TLS, inte genom att oppna interna portar direkt.

---

## Notering om CP-auth

For nuvarande daglig drift och initial STRATO-go-live galler:

```bash
CP_AUTH_REQUIRED=false
```

Aktivera inte CP-auth i initial drift om ni inte redan testat:
- korrekt `cps.json`-inventering
- token-plan (om `CP_SHARED_TOKEN` ska anvandas)
- rollback av `ocpp-ws-service`

Se:
- `Manuals/SAKERHETS_FUNKTIONER.md`
- `Manuals/STRATO_MIGRATION_RUNBOOK.md`

---

## Notering om dokumenterade men oanvanda variabler

Foljande nycklar forekommer i dokumentation men ingen aktiv runtime-anvandning hittades i kodgenomgangen:
- `ADMIN_BOOTSTRAP_EMAIL`
- `ADMIN_BOOTSTRAP_PASSWORD`

De bor inte betraktas som krav for STRATO-go-live om inte koden senare far bootstrap-stod.

