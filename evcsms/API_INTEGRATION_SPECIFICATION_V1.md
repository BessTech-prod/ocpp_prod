# API Integrationsspecifikation v1.0

Detta dokument beskriver det externa API:et för TakoramaCharge CSMS, avsett för integration med tredjepartssystem för fakturering, analys och driftsövervakning.

---

## 1. Översikt
API:et är byggt på REST-principer och levererar data i JSON-format. All kommunikation sker över HTTPS och är isolerad per organisation för att säkerställa högsta datasäkerhet.

### Bas-URL
`https://www.takoramacharge.se/api/v1`

---

## 2. Autentisering & Säkerhet

### API-nycklar
Varje tredjepartspartner tilldelas en unik API-nyckel som är strikt bunden till en specifik organisation. Nyckeln måste bifogas i varje anrop som en query-parameter.

**Format:** `api_key=ORGANISATION_ID:UNIK_UUID`
**Exempel:** `GET /api/v1/chargers?api_key=Takorama_Storås:0d6bc267323f48e9a5e955f0ecda7cd5`

### IP-vitlistning (Valfritt)
Administratörer kan begränsa åtkomsten för en specifik nyckel till en eller flera fasta IP-adresser. Om en vitlista är konfigurerad kommer anrop från andra IP-adresser att nekas med koden `401 Unauthorized`.

### Rate Limiting
Anrop begränsas per timme för att skydda systemets prestanda.
- **Standardgräns:** 120 anrop per timme.
- **Konfigurerbart:** Gränsen kan justeras individuellt per partner vid behov.
- **Header:** Vid överskriden gräns returneras HTTP `429 Too Many Requests`.

---

## 3. Konfiguration & Onboarding (För administratörer)

Innan en tredjepart kan börja integrera måste följande konfigureras i administratörsportalen under fliken **Integrations**:

1. **Skapa nyckel:** Välj organisation och ange önskad Rate Limit.
2. **IP-vitlista:** Lägg till partnerns server-IP (t.ex. `213.114.x.x`) för ökad säkerhet.
3. **Dela uppgifter:** Kopiera den fullständiga API-URL:en direkt från portalen och dela den säkert med partnern.

---

## 4. API-referens

### 4.1 Hämta Laddstationer
`GET /chargers`

Returnerar en komplett lista över alla laddstationer som tillhör organisationen, inklusive deras realtidsstatus och livstidsstatistik.

#### Parametrar
| Parameter | Typ | Krav | Beskrivning |
| :--- | :--- | :--- | :--- |
| `api_key` | String | Ja | Din unika API-nyckel. |

#### Exempel på svar
```json
{
  "ok": true,
  "org_id": "Takorama_Storås",
  "org_name": "Takorama Storås",
  "generated_at": "2026-05-07T21:05:00Z",
  "chargers": [
    {
      "cp_id": "ocpp/laddbox_kontor",
      "alias": "Kontorsladdare 1",
      "current_status": "Available",
      "last_updated": "2026-05-07T20:45:12Z",
      "total_kwh_lifetime": 1450.5,
      "session_count": 124,
      "connector_count": 2,
      "location": "Storåsvägen 12",
      "owner": "Takorama AB"
    }
  ],
  "count": 1
}
```

---

### 4.2 Hämta Energikonsumtion
`GET /energy`

Returnerar aggregerad data för energiförbrukning och detaljerade laddsessioner. Detta endpoint är optimerat för faktureringsunderlag.

#### Parametrar
| Parameter | Typ | Krav | Beskrivning |
| :--- | :--- | :--- | :--- |
| `api_key` | String | Ja | Din unika API-nyckel. |
| `group_by` | String | Ja | Gruppering: `user`, `charger` eller `connector`. |
| `period` | String | Nej | Tidspann: `24h` (standard) eller `1m` (senaste 30 dagarna). |

#### Exempel på svar
```json
{
  "ok": true,
  "org_id": "Takorama_Storås",
  "org_name": "Takorama Storås",
  "period": "1m",
  "group_by": "user",
  "generated_at": "2026-05-07T21:05:00Z",
  "groups": [
    {
      "group_key": "user:hugo@takorama.se",
      "display": "Hugo Danielsson (hugo@takorama.se)",
      "total_kwh": 45.2,
      "session_count": 3,
      "sessions": [
        {
          "start_time": "2026-05-01T08:00:00Z",
          "stop_time": "2026-05-01T10:30:00Z",
          "energy_kwh": 15.1,
          "duration_minutes": 150,
          "user_name": "Hugo Danielsson",
          "user_email": "hugo@takorama.se",
          "cp_id": "ocpp/laddbox_kontor",
          "connector_id": 1,
          "cp_alias": "Kontorsladdare 1",
          "meter_start": 1000.5,
          "meter_stop": 1015.6
        }
      ]
    }
  ],
  "totals": {
    "total_kwh": 45.2,
    "total_sessions": 3
  },
  "pagination": {
    "limit": 10000,
    "returned_sessions": 1
  }
}
```

---

## 5. Felhantering

Systemet använder standardiserade HTTP-statuskoder och returnerar ett JSON-objekt vid fel.

| Kod | Beskrivning | Orsak |
| :--- | :--- | :--- |
| `401` | Unauthorized | Felaktig API-nyckel eller blockerad IP-adress. |
| `403` | Forbidden | Nyckeln saknar behörighet för den begärda organisationen. |
| `429` | Too Many Requests | Rate limit har överskridits. |
| `500` | Internal Server Error | Internt serverfel. |

**Exempel på felmeddelande:**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Limit: 120 requests per hour",
  "code": 429
}
```

---

## 6. Best Practices för integration

### Polling-strategi
Eftersom data används för analys och fakturering rekommenderar vi inte tät polling.
- **Fakturering:** Hämta data en gång per dygn eller en gång i timmen.
- **Monitoring:** Hämta laddstatus (`/chargers`) var 5-15 minut.

### Felhantering
Implementera en "Retry-policy" med exponential backoff vid HTTP 429 för att undvika att bli permanent blockerad.

---

## 7. Support & Kontakt
Vid frågor gällande integrationen, vänligen kontakta din systemadministratör för TakoramaCharge.
