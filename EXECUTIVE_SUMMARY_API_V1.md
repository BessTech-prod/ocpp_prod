# Executive Summary: TakoramaCharge External API v1.0

Denna sammanfattning ger en överblick av TakoramaCharge externa API, utformat för sömlös integration med tredjepartssystem för fakturering, analys och övervakning.

---

### 🚀 Syfte & Mål
Att erbjuda en säker, högpresterande och skalbar brygga mellan TakoramaCharge CSMS och externa affärssystem. API:et möjliggör automatiserad datahämtning vilket minskar manuell administration och ökar precisionen i faktureringsprocesser.

### 🛡️ Säkerhet & Kontroll
*   **Isolerad Data:** Varje partner får åtkomst endast till sin specifika organisations data.
*   **IP-vitlistning:** Valfri begränsning av åtkomst till specifika server-IP-adresser.
*   **Rate Limiting:** Adaptiv kontroll (standard 120 anrop/timme) för att garantera systemstabilitet.
*   **Audit Logging:** Full spårbarhet av alla externa anrop för säkerhetsgranskning.

### 📊 Tillgängliga Datatjänster
1.  **Chargers API (`/chargers`)**
    *   Realtidsstatus (Available, Charging, Offline).
    *   Livstidsstatistik (kWh, antal sessioner).
    *   Konfigurationsdetaljer (plats, ägare, antal uttag).

2.  **Energy API (`/energy`)**
    *   Aggregerad förbrukning per användare, laddare eller kontakt.
    *   Flexibla tidsperioder (senaste 24h, 1m, 6m etc).
    *   Förbättrad precision för historisk data via RFID-koppling.
    *   Stöd för stora datamängder (upp till 50 000 sessioner per anrop).
    *   Detaljerad sessionsdata inklusive mätarvärden (MeterStart/Stop).

### ⚙️ Snabb Onboarding
Integrationen hanteras direkt via TakoramaCharge Admin Portal under fliken **Integrations**:
1.  **Generera Nyckel:** Skapa unika nycklar per partner.
2.  **Konfigurera:** Ställ in IP-vitlistor och anpassade gränser.
3.  **Implementera:** Använd de automatiskt genererade URL-exemplen för snabb start.

---

**Teknisk Dokumentation:** [API_INTEGRATION_SPECIFICATION_V1.md](./API_INTEGRATION_SPECIFICATION_V1.md)
**Support:** Kontakta TakoramaCharge Systemadministratör.
