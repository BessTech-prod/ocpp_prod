# External API v1 Documentation

This document describes the external API available for third-party billing and analytics systems.

## Base URL
The base URL for all v1 endpoints is `/api/v1`.

## Authentication
All requests must include an `api_key` query parameter. Each API key is bound to a specific organization and grants access to that organization's data only.

Example: `GET /api/v1/chargers?api_key=YOUR_API_KEY`

## Rate Limiting
API calls are rate-limited. The default limit is **120 requests per hour** per API key, but this can be adjusted by the system administrator for specific integrations. If the limit is exceeded, the server will return a `429 Too Many Requests` response.

## Error Handling
Errors are returned as JSON objects with the following structure:

```json
{
  "error": "error_code",
  "message": "Human readable message",
  "code": 400
}
```

Common error codes:
- `invalid_api_key` (401): The provided API key is invalid or inactive.
- `rate_limit_exceeded` (429): You have exceeded the hourly request limit.
- `forbidden` (403): You are trying to access data for an organization that the API key is not authorized for.
- `invalid_parameter` (400): One or more query parameters are invalid.

---

## IP Whitelisting
Administrators can optionally restrict API keys to specific IP addresses. If a whitelist is configured, requests from non-authorized IPs will return a `401 Unauthorized` response.

---

## Endpoints

### 1. Get Chargers (`GET /api/v1/chargers`)
Returns a list of all chargers belonging to the authenticated organization, including their current status and lifetime metrics.

**Parameters:**
- `api_key` (required): Your API key.

**Response Structure:**
```json
{
  "ok": true,
  "org_id": "string",
  "org_name": "string",
  "generated_at": "ISO8601",
  "chargers": [
    {
      "cp_id": "string",
      "alias": "string",
      "org_id": "string",
      "org_name": "string",
      "current_status": "string",
      "last_updated": "ISO8601 or null",
      "total_kwh_lifetime": float,
      "session_count": int,
      "connector_count": int,
      "location": "string or null",
      "owner": "string or null"
    }
  ],
  "count": int
}
```

---

### 2. Get Energy Consumption (`GET /api/v1/energy`)
Returns aggregated energy consumption and detailed session data for the organization.

**Parameters:**
- `api_key` (required): Your API key.
- `group_by` (required): How to group the data. One of: `user`, `connector`, `charger`.
- `period` (optional): Time period for the report. One of: `24h` (default), `1m` (last 30 days).
- `org_id` (optional): If provided, the API will verify that the API key is authorized for this specific organization.

**Response Structure:**
```json
{
  "ok": true,
  "org_id": "string",
  "org_name": "string",
  "period": "string",
  "group_by": "string",
  "generated_at": "ISO8601",
  "groups": [
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
          "duration_minutes": float or null,
          "user_name": "string",
          "user_email": "string or null",
          "cp_id": "string",
          "connector_id": int,
          "cp_alias": "string",
          "meter_start": float,
          "meter_stop": float
        }
      ]
    }
  ],
  "count": int,
  "totals": {
    "total_kwh": float,
    "total_sessions": int
  },
  "pagination": {
    "limit": 10000,
    "returned_sessions": int
  }
}
```

**Note on Data Volume:** The response is limited to a total of 10,000 session records across all groups. Groups are sorted by total energy consumption descending.

---

## Data Privacy
- `user_email` and `user_name` are included in the reports as they are required for billing and analytics purposes.
- Access is strictly restricted to the organization's own data.
