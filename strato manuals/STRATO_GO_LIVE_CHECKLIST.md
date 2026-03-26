# STRATO Go-Live Checklist

Denna checklista används nar `evcsms` ska sattas i produktion pa STRATO.

Syftet ar att ge en snabb, operativ kontrollista for go-live utan att ersatta den fullstandiga migreringsrunbooken i `STRATO_MIGRATION_RUNBOOK.md`.

## Klassning

- **[MASTE]** = krav for go-live.
- **[TILLVAL]** = rekommenderat eller forberett, men inte nodvandigt for sjalva produktionssattningen.

## Dokument att ha oppna samtidigt

- `Manuals/STRATO_ENV_TEMPLATE.md`
- `Manuals/STRATO_DEPLOY_SEQUENCE.md`
- `Manuals/STRATO_MIGRATION_RUNBOOK.md`
- `Manuals/SAKERHETS_FUNKTIONER.md`

---

## A. Fore go-live (forberedelser)

- [ ] **[MASTE]** STRATO-host ar uppe och narbar via SSH.
- [ ] **[MASTE]** Repo ar deployat till `~/projects1/ocpp_projekt2.0/evcsms`.
- [ ] **[MASTE]** Produktionsfiler ar kopierade: `.env`, `config/`, `data/`.
- [ ] **[MASTE]** Backup av tidigare driftmiljo ar tagen och verifierad.
- [ ] **[MASTE]** `APP_SECRET` ar satt.
- [ ] **[MASTE]** `REDIS_PASSWORD` ar satt.
- [ ] **[MASTE]** `SESSION_COOKIE_SECURE=true`.
- [ ] **[MASTE]** `CP_AUTH_REQUIRED=false` under initial go-live.
- [ ] **[MASTE]** Reverse proxy/TLS ar klar for UI, API och OCPP.
- [ ] **[MASTE]** Extern Redis-port ar inte publicerad.
- [ ] **[TILLVAL]** `CP_SHARED_TOKEN` ar forberedd om CP-auth ska aktiveras senare.

Verifiering:

```bash
cd ~/projects1/ocpp_projekt2.0/evcsms

grep -E '^(APP_SECRET|REDIS_PASSWORD|SESSION_COOKIE_SECURE|MAX_IMPORT_FILE_BYTES|CP_AUTH_REQUIRED|CP_SHARED_TOKEN)=' .env
```

---

## B. Lokal teknisk verifiering pa STRATO innan DNS-cutover

- [ ] **[MASTE]** Stacken bygger utan fel.
- [ ] **[MASTE]** Alla containers ar uppe.
- [ ] **[MASTE]** `api-service` svarar pa lokal healthcheck.
- [ ] **[MASTE]** `ui-service` svarar lokalt.
- [ ] **[MASTE]** `ocpp-ws-service` ar startad utan kritiska loggfel.
- [ ] **[MASTE]** Redis ar endast intern.
- [ ] **[MASTE]** `api-service` ar endast bunden till `127.0.0.1`.
- [ ] **[MASTE]** `ocpp-ws-service` ar endast bunden till `127.0.0.1`.

Verifiering:

```bash
cd ~/projects1/ocpp_projekt2.0/evcsms
./run.sh build
./run.sh up

docker compose -f docker-compose.yml ps
curl -f http://localhost:8000/health
curl -I http://localhost/
docker compose -f docker-compose.yml logs --tail=200 api-service
docker compose -f docker-compose.yml logs --tail=200 ocpp-ws-service
ss -tuln | grep -E '(:6379|:8000|:9000)'
```

Godkant resultat:
- `6379` ska **inte** vara externt publicerad.
- `8000` och `9000` ska vara bundna till `127.0.0.1`.
- Inga kritiska startupfel i API/OCPP-loggar.

---

## C. Extern verifiering fore DNS-switch

- [ ] **[MASTE]** TLS-certifikat matchar alla planerade hostnames.
- [ ] **[MASTE]** UI svarar via extern URL.
- [ ] **[MASTE]** API health svarar via extern URL.
- [ ] **[MASTE]** OCPP WebSocket ar natverksmassigt na bar via proxy.
- [ ] **[TILLVAL]** Testladdare eller labsimulator verifierar OCPP-handshake via STRATO.

Verifiering:

```bash
curl -vkI https://<ui-host>/
curl -vkI https://<api-host>/health
```

---

## D. DNS och cutover-forberedelse

- [ ] **[MASTE]** TTL ar sankt 24-48h innan cutover.
- [ ] **[MASTE]** Nuvarande DNS-records ar exporterade/sparade.
- [ ] **[MASTE]** AWS fallback-IP ar dokumenterad.
- [ ] **[MASTE]** Rollback-beslutare ar utsedd.
- [ ] **[MASTE]** Inga andra deployer eller configandringar sker under fonstret.

Verifiering:

```bash
dig <ui-host> +noall +answer
dig <api-host> +noall +answer
dig <ocpp-host> +noall +answer
```

---

## E. Go-live (D0)

- [ ] **[MASTE]** DNS ar uppdaterad till STRATO.
- [ ] **[MASTE]** UI svarar externt efter switch.
- [ ] **[MASTE]** API health svarar externt efter switch.
- [ ] **[MASTE]** Antal uppkopplade laddare foljs minut-for-minut.
- [ ] **[MASTE]** Heartbeats/statusuppdateringar fortsatter komma in.
- [ ] **[MASTE]** Inga tydliga TLS-, proxy- eller socketfel okar.
- [ ] **[MASTE]** `CP_AUTH_REQUIRED=false` om inte ett separat beslut fattats att aktivera det senare.

Verifiering:

```bash
dig +short <ui-host>
dig +short <api-host>
dig +short <ocpp-host>

curl -I https://<ui-host>/
curl -I https://<api-host>/health

docker compose -f docker-compose.yml logs --tail=200 api-service
docker compose -f docker-compose.yml logs --tail=200 ocpp-ws-service
```

---

## F. Efter go-live (0-72 timmar)

- [ ] **[MASTE]** Overvaka reconnect-rate for laddare.
- [ ] **[MASTE]** Overvaka API-health och felloggar.
- [ ] **[MASTE]** Overvaka TLS/cert- och proxyfel.
- [ ] **[MASTE]** Hall AWS kvar som fallback under stabiliseringsperioden.
- [ ] **[TILLVAL]** Utvardera senare om CP-auth ska aktiveras i ett separat, kontrollerat steg.

---

## G. Snabb rollback-checklista

Trigger-exempel:
- >20% laddare ateransluter inte inom planerad tid
- API/UI ar instabil eller otillganglig
- Kritiska TLS- eller proxyfel

Atergang:
- [ ] **[MASTE]** Peka tillbaka DNS till AWS.
- [ ] **[MASTE]** Verifiera DNS-propagation.
- [ ] **[MASTE]** Bekrafta att UI/API ar tillbaka.
- [ ] **[MASTE]** Fortsatt kora AWS tills rotorsaken ar identifierad.

Verifiering:

```bash
dig +short <ui-host>
dig +short <api-host>
dig +short <ocpp-host>

curl -I https://<ui-host>/
curl -I https://<api-host>/health
```

---

## H. Tillval efter stabil drift

- [ ] **[TILLVAL]** Aktivera CP-auth i separat underfonster enligt `SAKERHETS_FUNKTIONER.md` och `STRATO_MIGRATION_RUNBOOK.md`.
- [ ] **[TILLVAL]** Infer rate limiting framfor API/import.
- [ ] **[TILLVAL]** Planera session-revokering pa serversidan.
- [ ] **[TILLVAL]** Fortsatt hardning med non-root containers och CI-scanning.

---

## Slutlig go-live signoff

- Datum/tid go-live:
- Operator:
- Godkannare:
- UI verifierad:
- API verifierad:
- OCPP verifierad:
- DNS verifierad:
- Rollback behovd (Y/N):
- Kommentar:

