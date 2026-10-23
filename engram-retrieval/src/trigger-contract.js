import { ApiError } from "./validation.js";

// Naming adapter only: scope, timing and delivery policy stay in EngramService.
export class TriggerContract {
  constructor(service) { this.service = service; }
  subject(input) {
    this.service.scope(input.patient_id);
    return input.patient_id;
  }
  async create(input) {
    if (input.status !== "carer_verified") throw new ApiError(400, "Plan requires explicit carer_verified approval");
    const plan = await this.service.createPlan({ subjectId: this.subject(input), id: input.id,
      kind: input.kind, triggerType: input.trigger_type, personId: input.person_id,
      placeId: input.place_id, eventStart: input.event_start, dueAt: input.due_at, expiresAt: input.expires_at });
    return { plan };
  }
  async cancel(input) {
    return { plan: await this.service.cancelPlan({ subjectId: this.subject(input), planId: input.plan_id }) };
  }
  async context(input) {
    return this.service.context({ subjectId: this.subject(input), eventId: input.event_id,
      placeId: input.place_id, observedAt: input.observed_at });
  }
  async poll(input) {
    return { patient_id: this.subject(input), prompts: await this.service.prompts(input.patient_id) };
  }
  async respond(input) {
    return { prompt: await this.service.respond({ subjectId: this.subject(input), promptId: input.prompt_id, action: input.action }) };
  }
}
