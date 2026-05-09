---
sessionId: session-260507-162809-1f7n
isActive: false
---

# Requirements

### Overview & Goals
The goal is to expand the existing external API to support third-party billing and analytics systems. This includes providing detailed charger status/metrics and comprehensive energy consumption reports with flexible grouping and time-range filtering.

### Scope
- **In Scope**:
  - New RESTful JSON endpoints under `/api/v1/`.
  - Organization-isolated access using API keys.
  - Detailed charger information (Status, Metrics, Config).
  - Energy reports grouped by user, connector, or charger for last 24h or last month.
  - Detailed session data including user info and meter readings.
  - Standardized error reporting.
  - Comprehensive documentation for third-party developers.
- **Out of Scope**:
  - OAuth2 or Mutual TLS (sticking to simple API keys).
  - Webhooks or real-time push notifications.
  - Administrative endpoints for key management (unless requested later).

### Functional Requirements
- **Authentication**: Each request must include an `api_key` query parameter. Keys are unique per organization.
- **Rate Limiting**: 120 requests per hour per API key.
- **Chargers Endpoint (`/api/v1/chargers`)**:
  - Returns ALL chargers in the organization.
  - Fields: `cp_id`, `alias`, `org_id`, `org_name`, `current_status`, `last_updated`, `total_kwh_lifetime`, `session_count`, `connector_count`, `location`, `owner`.
- **Energy Endpoint (`/api/v1/energy`)**:
  - Grouping by `user`, `connector`, or `charger`.
  - Periods: `24h` or `1m`.
  - Optional `org_id` validation.
  - Returns summaries per group plus a detailed list of sessions.
  - Session fields: `start_time`, `stop_time`, `energy_kwh`, `duration_minutes`, `user_name`, `user_email`, `cp_id`, `connector_id`, `cp_alias`, `meter_start`, `meter_stop`.
  - Max 10,000 records per response.

# Technical Design

### Current Implementation
- **Authentication**: `validate_external_api_key` dependency in `evcsms/api.py` uses `ApiKeyManager` to verify keys and enforce rate limits in Redis.
- **Existing Endpoints**: `/api/external/chargers` and `/api/external/energy` provide basic functionality but lack the requested level of detail and grouping.

### Proposed Changes
- **Endpoints**:
  - `GET /api/v1/chargers`: Fetches data from `cps.json` (for config/alias) and `transactions.json` (for lifetime metrics). Status is pulled from Redis.
  - `GET /api/v1/energy`: Processes `transactions.json` based on the selected `period` and `group_by`. Aggregates energy and collects detailed session data.
- **Data Models**:
  - Chargers list item:
    ```json
    {
      "cp_id": "string",
      "alias": "string",
      "org_id": "string",
      "org_name": "string",
      "current_status": "string",
      "last_updated": "ISO8601",
      "total_kwh_lifetime": float,
      "session_count": int,
      "connector_count": int,
      "location": "string",
      "owner": "string"
    }
    ```
  - Energy group item:
    ```json
    {
      "group_key": "string",
      "display": "string",
      "total_kwh": float,
      "session_count": int,
      "sessions": [
        {
          "start_time": "ISO8601",
          "stop_time": "ISO8601",
          "energy_kwh": float,
          "duration_minutes": float,
          "user_name": "string",
          "user_email": "string",
          "cp_id": "string",
          "connector_id": int,
          "cp_alias": "string",
          "meter_start": float,
          "meter_stop": float
        }
      ]
    }
    ```

### File Structure
- `evcsms/api.py`: Implementation of new routes and updated logic.
- `EXTERNAL_API_DOCUMENTATION.md`: New documentation file.

### Risks
- **Performance**: Processing a large `transactions.json` file on every request might be slow.
  - *Mitigation*: The 120 req/hour limit and organization filtering help keep load manageable. For very large datasets, pagination or pre-aggregation might be needed in the future.
- **Data Privacy**: Emails and usernames are included as requested.
  - *Mitigation*: Access is strictly restricted to the organization's own data via API keys.

# Testing

### Validation Approach
I will verify the implementation by:
1.  Checking that the new `/api/v1/` routes exist and respond to valid API keys.
2.  Verifying that `/api/v1/chargers` returns all chargers in the organization with the correct fields.
3.  Testing `/api/v1/energy` with different `group_by` and `period` parameters.
4.  Confirming that session data includes all requested optional fields.
5.  Ensuring that providing an incorrect `org_id` for a valid key results in an error.
6.  Verifying that the error format matches the requested JSON structure.

### Key Scenarios
- **Scenario 1: Charger List**
  - Call `GET /api/v1/chargers?api_key=...`
  - Expect: 200 OK with list of all chargers in the org.
- **Scenario 2: Energy by User (1 Month)**
  - Call `GET /api/v1/energy?api_key=...&group_by=user&period=1m`
  - Expect: 200 OK with groups per user and full session details.
- **Scenario 3: Energy by Charger (24 Hours)**
  - Call `GET /api/v1/energy?api_key=...&group_by=charger&period=24h`
  - Expect: 200 OK with groups per charger.
- **Scenario 4: Invalid API Key**
  - Call with random `api_key`.
  - Expect: 401 Unauthorized with the specific JSON error body including `code: 401`.

# Delivery Steps

### ✓ Step 1: Implement v1 Chargers endpoint and update authentication errors
Update `validate_external_api_key` and add `/api/v1/chargers`.
- Update error responses to include the `code` field as requested.
- Implement `/api/v1/chargers` returning all chargers for the authenticated organization.
- Include Basic, Status, Metrics, and Config fields for each charger.
- Ensure organization isolation (only chargers belonging to the key's `org_id` are returned).

### ✓ Step 2: Implement v1 Energy endpoint with advanced grouping and detailed data
Add `/api/v1/energy` supporting grouping by user, connector, and charger.
- Implement grouping logic for `user`, `connector`, and `charger`.
- Support time periods `24h` and `1m`.
- Include detailed session data in the response: `start_time`, `stop_time`, `energy_kwh`, `duration_minutes`, `user_name`, `user_email`, `cp_id`, `connector_id`, `cp_alias`, `meter_start`, `meter_stop`.
- Enforce the 10,000 records limit.
- Support optional `org_id` parameter and validate it against the API key.

### ✓ Step 3: Create Third-Party API Documentation
Create a separate documentation file for third-party developers.
- Create `EXTERNAL_API_DOCUMENTATION.md` in the project root.
- Document both `/api/v1/chargers` and `/api/v1/energy` with all parameters, response structures, and example calls.
- Document authentication and rate limiting details.