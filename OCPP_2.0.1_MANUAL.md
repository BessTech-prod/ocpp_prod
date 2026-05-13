# OCPP 2.0.1 Configuration Manual: RFID Authentication

This manual explains how to configure an OCPP 2.0.1 Charging Station (CP) to authenticate against the RFIDs of the organization it is assigned to in the TakoramaCharge portal.

---

## 1. Prerequisites
- The Charging Station must be connected to the portal via the **OCPP 2.0.1** protocol.
- The Charging Station must be assigned to the correct **Organization** in the **Laddare** (Chargers) section of the portal.

---

## 2. Assignment to Organization
Before configuring authentication, ensure the charger is correctly assigned:
1. Navigate to **Laddare** (Chargers).
2. Find the charger (check "Nya laddare" if it is new).
3. Click **Redigera** (Edit).
4. Select the correct **Organisation** and give it an **Alias**.
5. Click **Spara** (Save).

*This assignment is crucial because the server uses it to determine which RFIDs are allowed to use this specific charger.*

---

## 3. Configuring Authentication (OCPP 2.0.1)
To enable mandatory RFID authentication on the Charging Station, follow these steps:

1. Navigate to **Live driftpanel** (Live Operations).
2. Select your Charging Station from the **Laddare** dropdown.
3. Select the command **Konfigurera (OCPP 2.0.1)** (SetVariables).
4. Enter the following values:

| Field | Value | Description |
| :--- | :--- | :--- |
| **Komponent** | `AuthCtrlr` | The Authorization Controller component. |
| **Variabel** | `Enabled` | The variable that controls if auth is required. |
| **Värde** | `true` | Set to `true` to enable mandatory RFID check. |

5. Click **Skicka kommando** (Send Command).
6. Wait for the status to show **Kommando klart**.

---

## 4. Recommended Security Settings
To ensure maximum security and server-side control, we recommend setting these additional variables:

### A. Authorize Remote Starts
Ensure that even starts from the portal or API are validated.
- **Component**: `AuthCtrlr`
- **Variable**: `AuthorizeRemoteStart`
- **Value**: `true`

### B. Disable Offline Charging
If you want to prevent charging when the charger is offline (and cannot reach the server):
- **Component**: `AuthCtrlr`
- **Variable**: `LocalAuthorizeOffline`
- **Value**: `false`

### C. Reject Unknown Tags Offline
- **Component**: `AuthCtrlr`
- **Variable**: `OfflineTxForUnknownIdEnabled`
- **Value**: `false`

---

## 5. Troubleshooting
- **Charger does not request RFID**: Some chargers require a reboot after `Enabled` is changed. Send a **Reset (Hard)** command if necessary.
- **Authentication Failed**: Verify that the RFID tag is **Aktiv** (Active) and assigned to the **same Organization** as the charger.
- **Protocol Error**: Ensure the charger is connected using the **OCPP 2.0.1** sub-protocol. Check the "Uppdaterad" column in the Live panel; it should show recent activity.

---
*TakoramaCharge - OCPP 2.0.1 Implementation Guide*
