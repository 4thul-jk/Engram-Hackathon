# Connect the team's website backend

`src/client.js` is a Node.js 20.18+ client for Engram. It does not require Gemini. It belongs in the website's backend; the existing developer page is not a patient application.

## Private backend configuration

```text
ENGRAM_URL=http://127.0.0.1:4317
ENGRAM_COMPANION_TOKEN=<same private companion token as retrieval service>
```

Use the real deployment origin if services run on different computers. Keep tokens out of public frontend environment variables. Authenticate the website user, then map them to an authorized patient on the server. Our shared service tokens are not individual patient login sessions.

```js
import { EngramClient } from './path/to/engram-retrieval/src/client.js';

const patient = new EngramClient({
  baseUrl: process.env.ENGRAM_URL,
  token: process.env.ENGRAM_COMPANION_TOKEN,
  patientId: verifiedSession.patientId
});

const memories = await patient.retrieve({ query: 'Who visited?', mode: 'hybrid' });
await patient.checkIn({ eventId: uniqueObservationId, placeId: 'desk' });
const { prompts } = await patient.prompts();
await patient.respond({ promptId: prompts[0]._id, action: 'acknowledged' });
```

Handle an empty `prompts` array before responding. A check-in must originate from a real fresh observation or be explicitly labelled a simulation. Supply the actual `observedAt` for delayed events; the client otherwise defaults to its current time. Reuse `eventId` for retries of the same observation. Avoid generating a new event ID on each network retry.

## Live prompt forwarding

`examples/patient-session.js` provides a reminder forwarding function. Connect it to your existing authenticated WebSocket or server-sent-event connection. It does not implement those website transports or identity verification itself.

```js
const stop = new AbortController();
// Bind this to your framework's connection-close lifecycle:
// connection.on('close', () => stop.abort());
try {
  for await (const prompt of patient.watchPrompts({ signal: stop.signal })) {
    await sendToThisAuthenticatedPatient({
      id: prompt._id, message: prompt.message, expiresAt: prompt.expiresAt
    });
  }
} catch (error) {
  // Surface connection/authentication failure; don't announce "no reminders".
  showBackendConnectionFailure(error.status);
}
```

Polling is sequential every three seconds with bounded request timeouts. It emits a prompt once while continuously visible in that watcher. If a prompt disappears and returns after snooze, it emits again. Across restarts/reconnects, pending prompts may repeat: the website should update cards by ID rather than append duplicates. Do not automatically acknowledge merely because a prompt was displayed. Once a prompt expires, clear the card; after cancellation it will be absent from the next full `prompts()` snapshot. The watcher yields new arrivals, not cancellation/removal notifications, so use full snapshots when synchronizing all visible cards.

Do not silently swallow poll failures. Authentication failures need configuration correction. A disconnected website does not receive prompts; no background mobile notification service is included.

## Caregiver plans

Instantiate a separate client using the private admin token only inside caregiver-authorized server routes. `createPlan()` requires explicit `status: 'carer_verified'`; `cancelPlan(planId)` cancels it. Both use the client's bound patient ID. See [TEAM-HANDOFF.md](TEAM-HANDOFF.md) for complete plan payloads and response actions. Location is not proof of activity completion, and acknowledgement is not completion.

## Checks

Run `npm test`. Tests cover request mapping, patient binding, prompt polling deduplication, abort, private error handling and a real local HTTP plan-to-prompt-to-response flow. The HTTP flow uses the in-memory store; it is not a new Atlas or Gemini live test.
