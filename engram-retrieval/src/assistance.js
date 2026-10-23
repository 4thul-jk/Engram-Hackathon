import { createHash } from "node:crypto";
import { ApiError, id, text, date, choice, unitNumber } from "./validation.js";

const key = (...parts) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
function number(value, name, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new ApiError(400, `Invalid ${name}`);
  return value;
}

export class AssistanceService {
  constructor(service) { this.service = service; this.store = service.store; }
  scope(input) { return this.service.scope(input.patient_id); }
  async device(input) {
    const scope = this.scope(input), deviceId = id(input.device_id, "device_id");
    const device = await this.store.one("devices", { ...scope, deviceId });
    if (!device) throw new ApiError(404, "Registered device not found for patient");
    return { scope, device };
  }
  async register(input) {
    const scope = this.scope(input), deviceId = id(input.device_id, "device_id");
    const doc = { _id: key(scope, deviceId), ...scope, deviceId,
      kind: choice(input.kind, ["phone", "watch", "glasses", "headset"], "kind"),
      label: text(input.label, "label", 100), registeredAt: this.service.clock() };
    if (!await this.store.insert("devices", doc)) throw new ApiError(409, "Device already registered");
    return { device: doc };
  }
  async telemetry(input) {
    const { scope, device } = await this.device(input), now = this.service.clock();
    const observedAt = date(input.observed_at, "observed_at"), age = +now - +observedAt;
    if (age < -10000 || age > 120000) throw new ApiError(400, "Observation must be within two minutes, max ten seconds future skew");
    let location = null;
    if (input.location != null) {
      const l = input.location;
      if (typeof l !== "object" || Array.isArray(l)) throw new ApiError(400, "Invalid location");
      location = { latitude: number(l.latitude, "latitude", -90, 90), longitude: number(l.longitude, "longitude", -180, 180),
        accuracyMeters: number(l.accuracy_meters, "accuracy_meters", 0, 100000),
        observedAt: date(l.observed_at, "location.observed_at"), sourceDeviceId: device.deviceId };
      if (location.observedAt > observedAt) throw new ApiError(400, "Location cannot postdate observation");
    }
    const doc = { _id: key(scope, id(input.event_id, "event_id")), ...scope, deviceId: device.deviceId, observedAt,
      connection: choice(input.connection, ["connected", "disconnected", "unknown"], "connection"),
      batteryFraction: input.battery_fraction == null ? null : unitNumber(input.battery_fraction, "battery_fraction"), location };
    const existing = await this.store.one("device_observations", { _id: doc._id, ...scope });
    if (existing) {
      const { receivedAt, ...saved } = existing;
      if (JSON.stringify(saved) !== JSON.stringify(doc)) throw new ApiError(409, "Event ID reused with different observation");
      return { accepted: true, duplicate: true };
    }
    if (!await this.store.insert("device_observations", { ...doc, receivedAt: now })) return this.telemetry(input);
    return { accepted: true, duplicate: false };
  }
  async status(input) {
    const scope = this.scope(input), now = this.service.clock();
    const devices = await this.store.list("devices", scope, { registeredAt: 1 }, 100);
    const reports = await Promise.all(devices.map(async device => {
      const latest = (await this.store.list("device_observations", { ...scope, deviceId: device.deviceId }, { observedAt: -1, receivedAt: -1 }, 1))[0];
      const fresh = latest && +now - +latest.observedAt <= 120000;
      const location = latest?.location;
      return { deviceId: device.deviceId, kind: device.kind, label: device.label,
        monitoring: fresh && latest.connection === "connected" ? "reporting" : "unavailable",
        lastObservedAt: latest?.observedAt ?? null, connection: latest?.connection ?? "unknown",
        batteryFraction: latest?.batteryFraction ?? null,
        lastDeviceLocation: location ? { ...location, fresh: +now - +location.observedAt <= 120000,
          attribution: "device_location_not_verified_person_location" } : null };
    }));
    return { patient_id: input.patient_id, devices: reports, checkedAt: now };
  }
  async request(input) {
    const { scope, device } = await this.device(input);
    const requestId = id(input.request_id, "request_id");
    const reason = choice(input.reason, ["user_requested_help", "connection_lost"], "reason");
    const doc = { _id: key(scope, requestId), ...scope, requestId, deviceId: device.deviceId, reason,
      status: "pending_guardian_review", deliveryStatus: "not_sent", createdAt: this.service.clock() };
    const created = await this.store.insert("assistance_requests", doc);
    const saved = await this.store.one("assistance_requests", { ...scope, _id: doc._id });
    if (saved.deviceId !== doc.deviceId || saved.reason !== reason) throw new ApiError(409, "Request ID reused with different content");
    return { created, request: saved, message: "Your help request was saved. A guardian has not yet been confirmed as notified." };
  }
  async queue(input) {
    const scope = this.scope(input);
    return { requests: await this.store.list("assistance_requests", { ...scope, status: "pending_guardian_review" }, { createdAt: 1 }, 100),
      deviceStatus: await this.status(input), externalNotificationsEnabled: false };
  }
  async acknowledge(input) {
    const scope = this.scope(input), requestId = id(input.request_id, "request_id");
    const filter = { ...scope, _id: key(scope, requestId) };
    const existing = await this.store.one("assistance_requests", filter);
    if (!existing) throw new ApiError(404, "Assistance request not found");
    if (existing.status === "acknowledged") return { request: existing };
    const result = await this.store.update("assistance_requests", { ...filter, status: "pending_guardian_review" },
      { status: "acknowledged", acknowledgedAt: this.service.clock() });
    return { request: result || await this.store.one("assistance_requests", filter) };
  }
}
