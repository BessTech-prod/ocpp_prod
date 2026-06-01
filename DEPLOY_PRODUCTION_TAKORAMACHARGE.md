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
SSH into your VM and navigate to the project directory. 

### ⚠️ CRITICAL: Backup your Data
Before pulling updates, manually copy your current data files to a safe location. This prevents any risk of Git overwriting your production history:
```bash
# Create a backup folder
mkdir -p ~/evcsms_backups/$(date +%Y%m%d)

# Copy all current JSON data
cp evcsms/config/*.json ~/evcsms_backups/$(date +%Y%m%d)/
cp evcsms/data/*.json ~/evcsms_backups/$(date +%Y%m%d)/
```

### Pull latest code
Run the following to get the latest updates:
```bash
git pull origin main
```
*Note: We have updated the system to stop tracking data files in Git. After this pull, your `.json` files will be safe from future Git operations.*

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

## 7. Data Recovery
In the event of accidental data loss or corruption during an update, refer to the [RECOVERY_MANUAL.md](RECOVERY_MANUAL.md) for step-by-step instructions on:
- Recovering data from Git's internal storage.
- Extracting transactions from Redis logs.
- Normalizing and merging recovered data.

---

**TakoramaCharge is now updated and ready for third-party integration.**

