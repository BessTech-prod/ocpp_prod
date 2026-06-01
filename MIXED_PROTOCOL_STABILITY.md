# Technical Reference: Mixed OCPP Protocol Stability (1.6J & 2.0.1)

This document details the architectural changes implemented to ensure stable operation when running both OCPP 1.6J and 2.0.1 chargers on the same platform.

## 1. The Challenge
The two protocols have fundamental differences in how they identify and track charging sessions:
- **OCPP 1.6J**: Uses numeric (integer) `transactionId`.
- **OCPP 2.0.1**: Uses alphanumeric (string/UUID) `transactionId`.
- **Logic Conflict**: Previous backend code assumed numeric IDs, leading to `TypeError` or `KeyError` when processing 2.0.1 chargers.

## 2. Key Improvements

### A. Type-Agnostic Transaction IDs
All backend components (API and WebSocket service) have been updated to handle transaction IDs as either integers or strings.
- **Sorting**: Instead of sorting by numeric ID, the system now uses `start_time` (ISO timestamp) for chronological sorting in `resolve_latest_transaction_id_for_cp`.
- **API Payloads**: The command validation logic now accepts and preserves string IDs for 2.0.1 chargers while keeping integers for 1.6J.

### B. Redis Key Standardizing
To prevent collisions and improve lookups, Redis keys for active transactions have been standardized.
- **New Format**: `open_tx:{cp_id}:{tx_id}`
- **Isolation**: Including `cp_id` in the key prevents ID collisions between different chargers.
- **Migration Path**: The code includes a fallback to the legacy `open_tx:{tx_id}` format to ensure active sessions aren't lost during system updates.

### C. Feature Parity (Live Monitoring)
OCPP 2.0.1 chargers now support the same level of live monitoring as 1.6J:
- **Latest Meter Tracking**: Real-time energy values are extracted from `TransactionEvent` messages (v2.0.1) and stored in `latest_meter:{cp_id}:{connector_id}` Redis keys, matching the behavior of `MeterValues` (v1.6).
- **Enriched Status API**: The `/api/portal/live/chargers` endpoint aggregates these values, showing real-time progress for both old and new chargers.

### D. Missing Handler Fixes
Added default handlers for several OCPP messages that were previously unhandled, causing `NotImplementedError` logs:
- **1.6J**: `MeterValues`, `DataTransfer`, `DiagnosticsStatusNotification`, `FirmwareStatusNotification`.
- **2.0.1**: `FirmwareStatusNotification`, `LogStatusNotification`.

## 3. Verification & Safety
- **JSON Stability**: Transaction records in `transactions.json` remain consistent, as JSON handles mixed-type IDs natively as long as comparison logic is type-aware.
- **API Robustness**: Error handling in `api.py` was improved to catch and log malformed data without crashing the entire status aggregation loop.

---
*Last Updated: 2026-06-01*
