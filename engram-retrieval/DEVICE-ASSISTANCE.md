# Device reports and assistance queue

This backend accepts reports from a future phone/watch app. It does not obtain GPS, detect Bluetooth changes, send external notifications, make calls or determine that a person is lost. It is not an emergency monitoring service. Existing memory and reminder flows are unchanged.

## Endpoints

All requests use existing bearer authentication and patient scope. Admin means the caregiver/backend token; the website must enforce its own authenticated user-to-patient mapping. Device IDs identify registered devices, but are not device-specific authentication credentials. A mobile app should talk through the team's authenticated backend, which checks the device/session binding. Do not distribute the shared service tokens in public mobile or browser builds.

| Method / route | Token | Purpose |
| --- | --- | --- |
| POST `/admin/devices` | Admin | Register device with patient |
| POST `/device-events` | Companion or admin | Save immutable timestamped status observation |
| GET `/device-status?patient_id=margaret` | Companion or admin | Latest reports, freshness and device locations |
| POST `/assistance/request` | Companion or admin | Explicit help or connection-loss report |
| GET `/admin/assistance?patient_id=margaret` | Admin | Pending guardian review queue plus current device reports |
| POST `/admin/assistance/acknowledge` | Admin | Acknowledge a request; does not confirm rescue or a call |

### 1. Register a device

```json
{"patient_id":"margaret","device_id":"phone1","kind":"phone","label":"Margaret phone"}
```

Kinds: phone, watch, glasses, headset. Registration is caregiver-controlled. Repeated registration returns 409. This version does not implement revocation or per-device credentials.

### 2. Report status

Replace timestamps with the actual observation times:

```json
{
  "patient_id":"margaret",
  "device_id":"phone1",
  "event_id":"observation_001",
  "observed_at":"2026-10-24T12:00:00Z",
  "connection":"connected",
  "battery_fraction":0.75,
  "location":{
    "latitude":51.5,
    "longitude":-0.1,
    "accuracy_meters":35,
    "observed_at":"2026-10-24T11:59:50Z"
  }
}
```

Connection means the reporting app's asserted state for the registered device: connected, disconnected or unknown. For example, a phone backend can report its observed headset state against a registered headset; it must not imply that the headset contacted the server itself. It is not proof of the person's whereabouts. No hardware capabilities are inferred from device kind.

Observations must be within two minutes, allowing ten seconds future skew. Location is optional and has its own timestamp, no later than the status observation. Old cached coordinates may be retained but flagged stale. Coordinates and accuracy are validated. Battery is optional, from 0 to 1.

Reuse event_id on retry of the identical payload. Different content with the same scoped event ID returns 409. Latest status is selected by observed time, so out-of-order arrivals do not roll it backwards. Reports stop being current after two minutes. Monitoring is `reporting` only for a fresh connected report; other cases are `unavailable`. Reporting does not imply the person is safe. Location is explicitly `device_location_not_verified_person_location`, with source device, accuracy and freshness. Do not label a phone left at home as the person's location.

### 3. Request help

```json
{"patient_id":"margaret","device_id":"phone1","request_id":"help_001","reason":"user_requested_help"}
```

Alternatively use reason `connection_lost`. That is an observation requiring review, not proof the person is lost. It is not automatically generated from telemetry in this step. Help requests require a registered device but no fresh telemetry, so lack of location does not block a request.

The response contains `request.status: pending_guardian_review` and `deliveryStatus: not_sent`. Patient wording explicitly says that notification has not been confirmed. Do not announce that a guardian was contacted. Repeated request IDs preserve the original request, including any acknowledgement; changed device/reason returns 409. Distinct IDs create separate requests; cross-ID debounce and abuse/rate controls remain production work.

Guardian polls the admin queue, then acknowledges with:

```json
{"patient_id":"margaret","request_id":"help_001"}
```

Acknowledgement is idempotent and removes the item from the pending queue. It records server acknowledgement time, not delivery confirmation or incident resolution. Actor-level audit attribution, contact policies, escalation, notification delivery receipts and resolution are future work. No external communication occurs in this version.

## Integration and storage

EngramClient provides `reportDevice(event)`, `deviceStatus()` and `requestHelp({requestId, deviceId, reason})`. Device/location data should only be exposed to the correct authenticated patient/caregiver session.

New collections: devices, device_observations, assistance_requests. `npm run atlas:indexes` provisions their scoped indexes alongside existing indexes. The new index provisioning has not been run against Atlas in this checkpoint. No destructive migration. No TTL or automatic deletion: set consent/access and retention policies before collecting real location history. Status/queue reads are capped at 100 registered devices/pending requests per patient in this prototype.

Tests use fictional coordinates, a controlled clock, in-memory storage and localhost HTTP. Run `npm test`. Mobile background operation, real GPS/Bluetooth, independent watch connectivity and external notification delivery remain untested and unimplemented.
