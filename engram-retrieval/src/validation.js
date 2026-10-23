export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function text(value, name, max = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new ApiError(400, `${name} must be a nonempty string (max ${max})`);
  return value.trim();
}
export function id(value, name = "id") {
  const result = text(value, name, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new ApiError(400, `Invalid ${name}`);
  return result;
}
export function date(value, name) {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new ApiError(400, `${name} requires ISO datetime with timezone`);
  return new Date(value);
}
export function choice(value, choices, name) {
  if (!choices.includes(value)) throw new ApiError(400, `Invalid ${name}; choose ${choices.join(", ")}`);
  return value;
}
export function unitNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new ApiError(400, `${name} must be a number between 0 and 1`);
  return value;
}
export function ids(value, name, max = 10) {
  if (!Array.isArray(value) || value.length > max) throw new ApiError(400, `Invalid ${name}`);
  return [...new Set(value.map(v => id(v, name)))];
}
export function scopeFor(subjectId, cfg) {
  id(subjectId, "subjectId");
  if (!cfg.subjectIds.includes(subjectId)) throw new ApiError(403, "Subject not authorized by this service deployment");
  return { householdId: cfg.householdId, subjectId };
}
export function range(input) {
  const from = input.from ? date(input.from, "from") : undefined;
  const to = input.to ? date(input.to, "to") : undefined;
  if (from && to && from >= to) throw new ApiError(400, "from must precede to");
  return { from, to };
}
