import { setTimeout as delay } from "node:timers/promises";

export class EngramClientError extends Error {
  constructor(status) {
    super(`Engram request failed (${status})`);
    this.name = "EngramClientError";
    this.status = status;
  }
}

// Server-side client. The website backend must authenticate its own users and
// choose their allowed patient ID; never trust a browser-supplied patient ID.
export class EngramClient {
  constructor({ baseUrl = "http://127.0.0.1:4317", token, patientId, timeoutMs = 30000, fetchImpl = fetch }) {
    const url = new URL(baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Use an HTTP(S) backend origin without credentials or path");
    if (!token || typeof token !== "string") throw new Error("Backend token required");
    if (typeof patientId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(patientId)) throw new Error("Valid patientId required");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error("Invalid timeoutMs");
    this.baseUrl = url.origin; this.token = token; this.patientId = patientId;
    this.timeoutMs = timeoutMs; this.fetch = fetchImpl;
  }
  async request(path, payload, signal) {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const response = await this.fetch(this.baseUrl + path, {
      method: payload === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    });
    // Do not propagate provider payloads, tokens or private records in errors.
    if (!response.ok) throw new EngramClientError(response.status);
    return response.json();
  }
  retrieve({ query, time_range, mode = "hybrid", min_confidence } = {}, signal) {
    return this.request("/retrieve", { patient_id: this.patientId, query, time_range, mode, min_confidence }, signal);
  }
  memoryContext(options, signal) {
    return this.request("/memory-context", { ...options, patient_id: this.patientId }, signal);
  }
  checkIn({ eventId, placeId, observedAt = new Date().toISOString() }, signal) {
    return this.request("/context-events", { patient_id: this.patientId, event_id: eventId, place_id: placeId, observed_at: observedAt }, signal);
  }
  prompts(signal) { return this.request(`/prompts?patient_id=${encodeURIComponent(this.patientId)}`, undefined, signal); }
  respond({ promptId, action }, signal) {
    return this.request("/prompts/respond", { patient_id: this.patientId, prompt_id: promptId, action }, signal);
  }
  createPlan(plan, signal) {
    return this.request("/plans", { ...plan, patient_id: this.patientId }, signal);
  }
  cancelPlan(planId, signal) {
    return this.request("/plans/cancel", { patient_id: this.patientId, plan_id: planId }, signal);
  }
  reportDevice(event, signal) {
    return this.request("/device-events", { ...event, patient_id: this.patientId }, signal);
  }
  deviceStatus(signal) {
    return this.request(`/device-status?patient_id=${encodeURIComponent(this.patientId)}`, undefined, signal);
  }
  requestHelp({ requestId, deviceId, reason = "user_requested_help" }, signal) {
    return this.request("/assistance/request", { patient_id: this.patientId, request_id: requestId, device_id: deviceId, reason }, signal);
  }
  addDailyLog(log, signal) {
    return this.request("/daily-logs", { ...log, patient_id: this.patientId }, signal);
  }
  dailyLogs({ day, activity } = {}, signal) {
    const query = new URLSearchParams({ patient_id: this.patientId });
    if (day) query.set("day", day);
    if (activity) query.set("activity", activity);
    return this.request(`/daily-logs?${query}`, undefined, signal);
  }
  addPersonalRecord(record, signal) {
    return this.request("/personal-records", { ...record, patient_id: this.patientId }, signal);
  }
  personalRecords({ kind, personId } = {}, signal) {
    const query = new URLSearchParams({ patient_id: this.patientId });
    if (kind) query.set("kind", kind);
    if (personId) query.set("person_id", personId);
    return this.request(`/personal-records?${query}`, undefined, signal);
  }
  // Sequential polling avoids overlapping requests. Failures surface to the
  // caller rather than being mistaken for an empty prompt list.
  async *watchPrompts({ intervalMs = 3000, signal } = {}) {
    if (!Number.isInteger(intervalMs) || intervalMs < 100 || intervalMs > 60000) throw new Error("Invalid polling interval");
    let visible = new Set();
    try {
      while (!signal?.aborted) {
        const result = await this.prompts(signal);
        if (!Array.isArray(result.prompts)) throw new Error("Malformed prompt response");
        const next = new Set(result.prompts.map(p => p._id));
        for (const prompt of result.prompts) {
          if (signal?.aborted) return;
          if (!visible.has(prompt._id)) yield prompt;
        }
        visible = next;
        await delay(intervalMs, undefined, { signal });
      }
    } catch (error) {
      if (!signal?.aborted) throw error;
    }
  }
}
