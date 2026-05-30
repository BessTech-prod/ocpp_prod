# Production Readiness Checklist: TakoramaCharge

Use this checklist to ensure a stable and secure deployment to the production environment.

### ⚠️ Safety & Persistence
- [ ] **Data Preservation**: Confirmed that `git pull` will not overwrite local `.env`, `api_keys.json`, `rfids.json`, `users.json`, or `transactions.json`.
- [ ] **Blocked RFID Feature**: Verified that `blocked_rfids.json` is ignored by Git and only exists locally in `/data`.
- [ ] **HTTPS Compatibility**: Host-level Nginx config is pointing to port 8080 (standard for this project's UI-service).
- [ ] **Secrets**: Existing `APP_SECRET` and `REDIS_PASSWORD` are preserved and verified working.

### 1. Code & Version Control
- [ ] All recent changes to `api.py` and `api_keys.py` (V1 API, Redis tracking, IP whitelisting) are pushed to `main`.
- [ ] Frontend assets (`ui-common.js`, `portal_api_keys.js`) are updated in the repository.
- [ ] Nginx configurations (`nginx.ui.conf`) include the extensionless URL fix.

### 2. Environment Configuration (`.env`)
- [ ] `SESSION_COOKIE_SECURE` is set to `true` (recommended for HTTPS).
- [ ] `API_PORT` (8000) and `UI_PORT` (8080) are correctly mapped in `docker-compose.yml`.

### 3. API & Security
- [ ] Verified that `/api/v1/chargers` and `/api/v1/energy` require valid API Keys.
- [ ] Verified that `last_used` tracking utilizes Redis for performance.
- [ ] Confirmed that IP Whitelisting is active and blocks unauthorized IPs (when configured).
- [ ] Verified that "Ta bort" permanently removes keys from the system.

### 4. User Interface
- [ ] Navbar shortcuts are consistent across all pages.
- [ ] Branding "Överblick" text has been removed.
- [ ] "Integrations" tab uses the production domain `https://www.takoramacharge.se` for copyable links.

### 5. Infrastructure
- [ ] Redis container is linked and communicating with the API service.
- [ ] Health check (`/health`) returns "healthy" after `docker compose up`.

### 6. Documentation
- [ ] `API_INTEGRATION_SPECIFICATION_V1.md` is ready for partners.
- [ ] `EXECUTIVE_SUMMARY_API_V1.md` is ready for stakeholders.

---
**Verified by:** ____________________  **Date:** 2026-05-07
