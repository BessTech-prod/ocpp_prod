# STRATO README

Detta dokument ar startsidan for all STRATO-relaterad dokumentation i projektet.

Anvand detta dokument nar ni ska:
- forbereda drift pa STRATO,
- migrera fran AWS/Simply till STRATO,
- genomfora go-live,
- eller verifiera vilka sakerhetskrav som galler i STRATO-miljon.

## Lasordning

### Om ni borjar fran noll

1. `Manuals/STRATO_README.md`  
   Las detta for att forsta dokumentpaketet.
2. `Manuals/STRATO_ENV_TEMPLATE.md`  
   Faststall vilka `.env`-variabler som faktiskt kravs.
3. `Manuals/STRATO_DEPLOY_SEQUENCE.md`  
   Folj kortaste sakra deployordningen fram till frisk stack.
4. `Manuals/STRATO_GO_LIVE_CHECKLIST.md`  
   Anvand under sjalva produktionssattningen.
5. `Manuals/STRATO_MIGRATION_RUNBOOK.md`  
   Anvand for hela migreringsforloppet, DNS-cutover och rollback.
6. `Manuals/SAKERHETS_FUNKTIONER.md`  
   Verifiera vad som ar `MASTE` respektive `TILLVAL`.

### Om stacken redan ar uppe pa STRATO och ni bara ska ga live

1. `Manuals/STRATO_GO_LIVE_CHECKLIST.md`
2. `Manuals/SAKERHETS_FUNKTIONER.md`
3. `Manuals/STRATO_MIGRATION_RUNBOOK.md`

### Om ni bara ska verifiera konfigurationen

1. `Manuals/STRATO_ENV_TEMPLATE.md`
2. `Manuals/SAKERHETS_FUNKTIONER.md`

### Om ni bara ska felsoka eller planera rollback

1. `Manuals/STRATO_MIGRATION_RUNBOOK.md`
2. `Manuals/STRATO_GO_LIVE_CHECKLIST.md`

---

## Vad varje dokument ar till for

### `Manuals/STRATO_ENV_TEMPLATE.md`
Anvand detta dokument for att:
- skapa eller granska `.env`
- se vilka variabler som ar `MASTE`
- skilja pa vad som ar aktivt i kod, aktivt i compose, eller bara dokumenterat

### `Manuals/STRATO_DEPLOY_SEQUENCE.md`
Anvand detta dokument for att:
- deploya i ratt ordning
- undvika att missa lokala verifieringar innan go-live
- komma fram till en frisk STRATO-stack snabbt

### `Manuals/STRATO_GO_LIVE_CHECKLIST.md`
Anvand detta dokument for att:
- genomfora sjalva go-live-fonstret
- verifiera lokalt, externt och efter DNS-switch
- fa en tydlig rollback-checklista

### `Manuals/STRATO_MIGRATION_RUNBOOK.md`
Anvand detta dokument for att:
- planera hela flytten fran AWS/Simply till STRATO
- satta DNS/TLS/cutover i ratt ordning
- ha tydlig rollback- och stabiliseringsplan

### `Manuals/SAKERHETS_FUNKTIONER.md`
Anvand detta dokument for att:
- verifiera sakerhetskrav
- skilja pa `MASTE` och `TILLVAL`
- se hur CP-auth ska hanteras separat fran normal drift

---

## Snabb beslutsguide

### Ni ska snart producera pa STRATO
Las i denna ordning:
- `Manuals/STRATO_ENV_TEMPLATE.md`
- `Manuals/STRATO_DEPLOY_SEQUENCE.md`
- `Manuals/STRATO_GO_LIVE_CHECKLIST.md`

### Ni planerar hela migreringen nu
Las i denna ordning:
- `Manuals/STRATO_MIGRATION_RUNBOOK.md`
- `Manuals/STRATO_ENV_TEMPLATE.md`
- `Manuals/SAKERHETS_FUNKTIONER.md`
- `Manuals/STRATO_GO_LIVE_CHECKLIST.md`

### Ni vill bara veta vad som ar krav for go-live
Las:
- `Manuals/STRATO_GO_LIVE_CHECKLIST.md`
- `Manuals/SAKERHETS_FUNKTIONER.md`

---

## Viktiga principer for nuvarande STRATO-sparet

- `APP_SECRET` och `REDIS_PASSWORD` ar krav.
- `SESSION_COOKIE_SECURE=true` ar krav.
- `redis-service` ska inte publiceras externt.
- `api-service` och `ocpp-ws-service` ska publiceras via reverse proxy/TLS.
- `CP_AUTH_REQUIRED=false` galler for initial drift och go-live.
- CP-auth ar ett separat, planerat steg och ska inte aktiveras slentrianmassigt.

---

## Rekommenderad startsida under arbete

Om ni ska jobba operativt med STRATO nu, oppna samtidigt:
- `Manuals/STRATO_README.md`
- `Manuals/STRATO_ENV_TEMPLATE.md`
- `Manuals/STRATO_DEPLOY_SEQUENCE.md`
- `Manuals/STRATO_GO_LIVE_CHECKLIST.md`

