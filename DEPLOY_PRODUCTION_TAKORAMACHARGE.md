# Production Deployment Guide: TakoramaCharge

This guide provides the steps to deploy the latest EVCSMS platform updates (including the V1 External API and Admin Portal) to your existing Ubuntu VM.

**Safety First:** These steps are designed to update the application logic without interfering with your current HTTPS setup or production secrets.

---

## 1. Prerequisites
- **Ubuntu VM** with Docker and Docker Compose already running the project.
- **SSH access** to the VM.
- **Git** configured on the VM.

---

## 2. Update the Codebase
SSH into your VM and navigate to the project directory. Run the following to get the latest updates:
```bash
cd ocpp_projekt2.0/evcsms
git pull origin main
```
*Note: This command will only update the system files. It will **not** affect your local `.env`, `api_keys.json`, `rfids.json`, `users.json`, or `transactions.json` files if you have not modified them in the repository.*

---

## 3. Environment Variables & Secrets
The system will continue to use your current `.env` file. You **do not need to change** your `APP_SECRET` or `REDIS_PASSWORD` if they are already working.

**Recommendation:** Ensure `SESSION_COOKIE_SECURE=true` is set in your `.env` since you are using HTTPS. This improves security but is not strictly required for the update to work.

---

## 4. Deploy Updates with Docker Compose
Rebuild the containers to apply the new code and Nginx routing fixes:
```bash
docker compose up -d --build
```
This process:
- Updates the **API** with the new V1 External endpoints and IP whitelisting.
- Updates the **UI** with the "Integrations" portal and extensionless URL support.
- **Preserves all data** in your mapped volumes (`./data` and `./config`).

---

## 5. Host Nginx & HTTPS
Your existing Nginx configuration (handled via Certbot) should continue to work without modification. 

**Technical Note:** The update includes internal Nginx changes inside the `ui-service` container to handle extensionless URLs (e.g., `/login`). This is compatible with your host reverse proxy and does not require you to change your host-level SSL settings.

---

## 6. Post-Deployment Verification
1. **Login**: Access `https://www.takoramacharge.se/login` and verify you can log in smoothly.
2. **Integrations**: Check the new "Integrations" tab in the Admin Portal.
3. **API Integrity**: If you have an existing API key, verify it still works:
   ```bash
   curl "https://www.takoramacharge.se/api/v1/chargers?api_key=YOUR_KEY"
   ```

---

**TakoramaCharge is now updated and ready for third-party integration.**

