# Third-Party Integration Guide: Billing & Analytics

This guide explains how to integrate the CSMS External API with a third-party billing or analytics platform.

## 1. Onboarding a Third-Party Partner

To allow a third-party company to access data for a specific organization, follow these steps:

1.  **Generate an API Key**: Use the internal `ApiKeyManager` to generate a key for the target `org_id`.
    *   Currently, this can be done via the `evcsms/app/api_keys.py` utility or by adding a temporary admin route.
    *   The key format will be `org_id:random_uuid`.
2.  **Securely Share the Key**: Share the **Raw Key** with the third-party company.
    *   *Warning*: Never share the key hash stored in `api_keys.json`.
3.  **Set Rate Limits**: The default limit is **120 requests per hour**. Ensure the partner is aware of this limit.

## 2. Technical Implementation for the Third Party

### Authentication
The third party must include the API key in every request as a query parameter:
`GET /api/v1/chargers?api_key=OrgName:abc123...`

### Data Polling Strategy (Recommended)
Since the primary use case is billing and analytics, real-time polling is not required.
*   **Hourly Sync**: We recommend the third party pools data once per hour.
*   **Batch Retrieval**: Use the `/api/v1/energy` endpoint with `period=24h`, `period=1m`, or `period=6m` to get accumulated consumption. The API now supports up to 50,000 records per call, making it suitable for long-term reporting.

## 3. Implementation Scenarios

### Scenario A: Monthly/Multi-Month Billing
1.  **Call**: `GET /api/v1/energy?group_by=user&period=1m&api_key=...` (or `period=6m` for semi-annual reporting)
2.  **Process**:
    *   Iterate through the `groups`.
    *   Each group contains a `user_email` and `total_kwh`.
    *   The `sessions` list provides the exact start/stop times and meter readings for audit trails (up to 1,000 sessions per user).
3.  **Verify**: Compare the `totals.total_kwh` in the response with the sum of all users to ensure consistency.

### Scenario B: Live Charger Dashboard
1.  **Call**: `GET /api/v1/chargers?api_key=...`
2.  **Process**:
    *   Iterate through `chargers`.
    *   Check `current_status` (Available, Charging, Occupied, Faulted, Offline).
    *   Display `total_kwh_lifetime` for cumulative statistics.

## 4. Error Handling for Third Parties
The third party should implement logic to handle the following standard responses:
*   **401 Unauthorized**: The key has expired or was revoked. Stop polling and contact the administrator.
*   **429 Too Many Requests**: The polling frequency is too high. Implement an exponential backoff or reduce frequency to once every 10-15 minutes.
*   **403 Forbidden**: If the third party tries to pass an `org_id` that doesn't match their key's authorization.

## 5. Security Best Practices
*   **IP Whitelisting**: (Optional) In the future, we recommend adding IP whitelisting for third-party keys.
*   **TLS**: Ensure all API calls are made over HTTPS in production.
*   **Key Rotation**: Recommend rotating API keys every 6-12 months.
