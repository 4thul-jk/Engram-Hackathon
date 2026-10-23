// Engineering heuristic only; parameters and scores are not clinically validated.
export const MODEL_VERSION = "prototype-exponential-v1";
export const DAY_MS = 86400000;
export const DEFAULT_MODEL = Object.freeze({ alpha: 1.5, beta: 0.5, minimumDays: 0.5, target: 0.7, initialDays: 1 });
function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive`);
}
export function retention(elapsedDays, stabilityDays) {
  positive(stabilityDays, "stabilityDays");
  if (!Number.isFinite(elapsedDays) || elapsedDays < 0) throw new RangeError("elapsedDays must be nonnegative");
  return Math.exp(-elapsedDays / stabilityDays);
}
export function updateStability(stabilityDays, cueLevel, recalled, params = DEFAULT_MODEL) {
  positive(stabilityDays, "stabilityDays");
  if (!Number.isInteger(cueLevel) || cueLevel < 0 || cueLevel > 3) throw new RangeError("cueLevel must be 0, 1, 2 or 3");
  if (typeof recalled !== "boolean") throw new TypeError("recalled must be boolean");
  positive(params.minimumDays, "minimumDays");
  if (!Number.isFinite(params.alpha) || params.alpha < 0 || !Number.isFinite(params.beta) || params.beta <= 0 || params.beta > 1) throw new RangeError("Invalid model parameters");
  return recalled
    ? Math.max(params.minimumDays, stabilityDays * (1 + params.alpha * (3 - cueLevel) / 3))
    : Math.max(params.minimumDays, params.beta * stabilityDays);
}
export function nextDueAt(anchor, stabilityDays, target = DEFAULT_MODEL.target) {
  positive(stabilityDays, "stabilityDays");
  if (!Number.isFinite(target) || target <= 0 || target >= 1) throw new RangeError("target must be between 0 and 1 exclusively");
  if (!(anchor instanceof Date) || !Number.isFinite(+anchor)) throw new TypeError("Invalid anchor date");
  const result = new Date(+anchor - stabilityDays * Math.log(target) * DAY_MS);
  if (!Number.isFinite(+result)) throw new RangeError("Due date overflow");
  return result;
}
export function initialState(episode, scope) {
  const anchor = episode.eventStart;
  return {
    _id: episode._id, ...scope, episodeId: episode._id,
    stabilityDays: DEFAULT_MODEL.initialDays, anchorAt: anchor, lastRehearsalAt: null,
    nextDueAt: nextDueAt(anchor, DEFAULT_MODEL.initialDays), attempts: 0, version: 0,
    modelVersion: MODEL_VERSION
  };
}
export function localDayKey(instant, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type).value).join("-");
}
export function shiftDay(dayKey, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new RangeError("day must be YYYY-MM-DD");
  const utc = new Date(`${dayKey}T00:00:00Z`);
  if (!Number.isFinite(+utc) || utc.toISOString().slice(0, 10) !== dayKey) throw new RangeError("Invalid calendar day");
  return new Date(+utc + days * DAY_MS).toISOString().slice(0, 10);
}
export function dayBounds(dayKey, timezone) {
  const next = shiftDay(dayKey, 1);
  const boundary = day => {
    const center = Date.parse(`${day}T00:00:00Z`);
    let lo = center - 36 * 3600000, hi = center + 36 * 3600000;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (localDayKey(new Date(mid), timezone) < day) lo = mid; else hi = mid;
    }
    return new Date(hi);
  };
  const start = boundary(dayKey), end = boundary(next);
  if (localDayKey(start, timezone) !== dayKey) throw new RangeError("Calendar day does not exist in this timezone");
  return { start, end };
}
