// Import into your authenticated WEBSITE BACKEND; not into a browser bundle.
import { EngramClient } from "../src/client.js";

export function patientSession(patientId) {
  // patientId must come from your verified server-side user/patient mapping.
  return new EngramClient({ baseUrl: process.env.ENGRAM_URL,
    token: process.env.ENGRAM_COMPANION_TOKEN, patientId });
}

export async function forwardReminders(patientId, sendToAuthenticatedPatient, signal) {
  const client = patientSession(patientId);
  // sendToAuthenticatedPatient can forward via your website's WebSocket/SSE.
  // Stop this session with AbortController when that website connection closes.
  for await (const prompt of client.watchPrompts({ signal })) {
    await sendToAuthenticatedPatient({ id: prompt._id, message: prompt.message,
      availableAt: prompt.availableAt, expiresAt: prompt.expiresAt });
  }
}

// On user response:
// await patientSession(verifiedPatientId).respond({ promptId, action: "acknowledged" });
// On a real, fresh location observation (not an inferred completed activity):
// await patientSession(verifiedPatientId).checkIn({ eventId: uniqueObservationId, placeId: "desk" });
