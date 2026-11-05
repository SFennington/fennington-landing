// Ted Towne's own dashboard for T3 Inspections: who may use it, and the pure rules behind
// manual bookings, blockouts, settings and the ZIP map. No Firestore or network in here, so it
// is tested directly; the routes live in index.ts under /t3-inspections/admin/.
import { T3_ADDONS, T3_TYPES, type T3InspectionType } from "./t3-catalog";
import {
  DEFAULT_CATALOG, T3_BASEMENTS, T3_FOLLOWUP_DEFAULTS, T3_SETTINGS, T3_STYLES, T3_TED_EMAIL, addDays, isDateString, isTimeString, nyToMs, splitEmails,
  type T3Catalog, type T3FollowupTemplate, type T3Hold, type T3RangeConfig, type T3Settings
} from "./t3-booking";

/**
 * The one extra way into the dashboard: Ted's verified Google account. Anyone who already passes the
 * Fennington admin check (Stephen) is let in by the caller. Ted is never added to the admin lists, so
 * this account can never reach leads, outreach or product admin.
 */
export function isT3Owner(token: { email?: unknown; email_verified?: unknown } | null | undefined): boolean {
  if (!token) return false;
  const email = typeof token.email === "string" ? token.email.trim().toLowerCase() : "";
  return token.email_verified === true && email === T3_TED_EMAIL.toLowerCase();
}

// ---- Settings (t3Config/settings) ----

export type T3SavedConfig = T3Settings & { typeOverrides: Record<string, { priceCents?: number; minutes?: number }>; addonPrices: Record<string, number>; followup: T3FollowupTemplate };

/** The review email text. Anything missing or blank falls back to the built-in wording; a link must be https. */
function followupFrom(saved: any): T3FollowupTemplate {
  const d = T3_FOLLOWUP_DEFAULTS;
  const text = (v: unknown, fallback: string, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\r\n/g, "\n").slice(0, max) : fallback);
  const url = typeof saved?.reviewUrl === "string" && /^https:\/\/[^\s]+$/.test(saved.reviewUrl.trim()) ? saved.reviewUrl.trim().slice(0, 500) : d.reviewUrl;
  return { reviewUrl: url, subject: text(saved?.subject, d.subject, 150), body: text(saved?.body, d.body, 4000), reminderSubject: text(saved?.reminderSubject, d.reminderSubject, 150), reminderBody: text(saved?.reminderBody, d.reminderBody, 4000) };
}

export function defaultConfig(): T3SavedConfig {
  return { startTimes: { ...T3_SETTINGS.startTimes }, noticeHours: T3_SETTINGS.noticeHours, daysAhead: T3_SETTINGS.daysAhead, typeOverrides: {}, addonPrices: {}, followup: followupFrom(null) };
}

const int = (value: unknown, min: number, max: number): number | undefined => {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

/** What a saved settings document means. Anything missing or damaged falls back to the built-in default. */
export function configFrom(saved: any): T3SavedConfig {
  const base = defaultConfig();
  if (!saved || typeof saved !== "object") return base;
  const result: T3SavedConfig = { ...base };
  if (saved.startTimes && typeof saved.startTimes === "object") {
    const times: Record<number, string[]> = {};
    for (let day = 0; day < 7; day++) {
      const list = saved.startTimes[day] ?? saved.startTimes[String(day)];
      if (Array.isArray(list)) times[day] = Array.from(new Set(list.filter(isTimeString))).sort();
    }
    result.startTimes = times;
  }
  result.followup = followupFrom(saved.followup);
  result.noticeHours = int(saved.noticeHours, 0, 720) ?? base.noticeHours;
  result.daysAhead = int(saved.daysAhead, 1, 365) ?? base.daysAhead;
  if (saved.typeOverrides && typeof saved.typeOverrides === "object") {
    for (const [id, o] of Object.entries<any>(saved.typeOverrides)) {
      const price = int(o?.priceCents, 0, 10_000_000);
      const minutes = int(o?.minutes, 15, 720);
      if (T3_TYPES.some((t) => String(t.id) === id) && (price !== undefined || minutes !== undefined)) {
        result.typeOverrides[id] = { ...(price !== undefined ? { priceCents: price } : {}), ...(minutes !== undefined ? { minutes } : {}) };
      }
    }
  }
  if (saved.addonPrices && typeof saved.addonPrices === "object") {
    for (const [id, cents] of Object.entries<any>(saved.addonPrices)) {
      const price = int(cents, 0, 10_000_000);
      if (T3_ADDONS.some((a) => String(a.id) === id) && price !== undefined) result.addonPrices[id] = price;
    }
  }
  return result;
}

/** Checks what Ted submitted from the settings page. Returns a message he can read if something is off. */
export function validateConfigInput(body: any): { ok: true; value: T3SavedConfig } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Nothing to save." };
  for (let day = 0; day < 7; day++) {
    const list = body.startTimes?.[day] ?? body.startTimes?.[String(day)];
    if (list !== undefined && (!Array.isArray(list) || list.length > 8 || !list.every(isTimeString))) return { ok: false, error: "Start times must look like 09:00 (up to 8 a day)." };
  }
  if (int(body.noticeHours, 0, 720) === undefined) return { ok: false, error: "Notice hours must be a whole number from 0 to 720." };
  if (int(body.daysAhead, 1, 365) === undefined) return { ok: false, error: "Days ahead must be a whole number from 1 to 365." };
  for (const [id, o] of Object.entries<any>(body.typeOverrides || {})) {
    if (!T3_TYPES.some((t) => String(t.id) === id)) return { ok: false, error: "Unknown inspection type." };
    if (o?.priceCents !== undefined && int(o.priceCents, 0, 10_000_000) === undefined) return { ok: false, error: "A price is not a valid amount." };
    if (o?.minutes !== undefined && int(o.minutes, 15, 720) === undefined) return { ok: false, error: "A duration must be 15 to 720 minutes." };
  }
  for (const [id, cents] of Object.entries<any>(body.addonPrices || {})) {
    if (!T3_ADDONS.some((a) => String(a.id) === id)) return { ok: false, error: "Unknown add-on." };
    if (int(cents, 0, 10_000_000) === undefined) return { ok: false, error: "An add-on price is not a valid amount." };
  }
  const f = body.followup;
  if (f !== undefined) {
    if (!f || typeof f !== "object") return { ok: false, error: "The review email isn't valid." };
    if (typeof f.reviewUrl === "string" && f.reviewUrl.trim() && !/^https:\/\/[^\s]+$/.test(f.reviewUrl.trim())) return { ok: false, error: "The review link must start with https://" };
    for (const key of ["body", "reminderBody"]) if (typeof f[key] === "string" && f[key].trim() && !f[key].includes("{reviewLink}")) return { ok: false, error: "Keep {reviewLink} in the email, or customers get no link." };
  }
  return { ok: true, value: configFrom(body) };
}

/** The inspection types and add-ons with Ted's saved prices and durations applied. */
export function catalogFor(config: T3SavedConfig): T3Catalog {
  const types: T3InspectionType[] = T3_TYPES.map((t) => ({ ...t, ...(config.typeOverrides[String(t.id)] || {}) }));
  const addons = T3_ADDONS.map((a) => (config.addonPrices[String(a.id)] !== undefined ? { ...a, priceCents: config.addonPrices[String(a.id)] } : a));
  return { types, addons };
}

// ---- The ZIP map (t3Config/range) ----

const ZIP = /^\d{5}$/;

export function validateRangeInput(body: any): { ok: true; value: T3RangeConfig } | { ok: false; error: string } {
  const list = (value: unknown) => (Array.isArray(value) ? value : null);
  const included = list(body?.included);
  const extended = list(body?.extended);
  if (!included || !extended) return { ok: false, error: "Nothing to save." };
  if (![...included, ...extended].every((zip) => typeof zip === "string" && ZIP.test(zip))) return { ok: false, error: "Every ZIP must be 5 digits." };
  if (included.length > 2000 || extended.length > 2000) return { ok: false, error: "That is too many ZIP codes." };
  const inc = Array.from(new Set(included as string[])).sort();
  const ext = Array.from(new Set(extended as string[])).filter((zip) => !inc.includes(zip)).sort();
  const fee = int(body?.extendedFeeCents, 0, 1_000_000);
  if (fee === undefined) return { ok: false, error: "The travel fee must be an amount from $0 to $10,000." };
  if (ext.length && fee === 0) return { ok: false, error: "Set a travel fee for the blue ZIPs first, or move them back to green." };
  return { ok: true, value: { included: inc, extended: ext, extendedFeeCents: fee } };
}

/** What is stored may be damaged by hand; trust only well-formed entries. */
export function rangeFrom(saved: any): T3RangeConfig | null {
  if (!saved || !Array.isArray(saved.included) || !Array.isArray(saved.extended)) return null;
  const ok = (v: unknown): v is string => typeof v === "string" && ZIP.test(v);
  return { included: saved.included.filter(ok), extended: saved.extended.filter(ok), extendedFeeCents: int(saved.extendedFeeCents, 0, 1_000_000) ?? 0 };
}

// ---- Overlaps ----

/** Everything on Ted's calendar that a job from startMs to endMs would sit on top of. */
export function findOverlaps(holds: T3Hold[], startMs: number, endMs: number, ignoreId?: string): T3Hold[] {
  return holds.filter((hold) => hold.id !== ignoreId && hold.startMs < endMs && hold.endMs > startMs);
}

// ---- Blockouts ----

export type T3Blockout = { startDate: string; endDate: string; allDay: boolean; startTime: string; endTime: string; label: string };

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

export function validateBlockout(body: any): { ok: true; value: T3Blockout } | { ok: false; error: string } {
  const startDate = body?.startDate;
  const endDate = body?.endDate || startDate;
  if (!isDateString(startDate) || !isDateString(endDate)) return { ok: false, error: "Please choose the date." };
  if (endDate < startDate) return { ok: false, error: "The last day can't be before the first day." };
  if (endDate > addDays(startDate, 366)) return { ok: false, error: "A blockout can be at most a year long." };
  const allDay = body?.allDay !== false;
  const startTime = allDay ? "00:00" : body?.startTime;
  const endTime = allDay ? "24:00" : body?.endTime;
  if (!allDay) {
    if (!isTimeString(startTime) || !isTimeString(endTime)) return { ok: false, error: "Please choose a start and end time." };
    if (endTime <= startTime) return { ok: false, error: "The end time must be after the start time." };
  }
  return { ok: true, value: { startDate, endDate, allDay, startTime, endTime, label: clean(body?.label, 80) } };
}

/** One hold per date, so the public calendar (which reads one document per date) respects it straight away. */
export function holdsForBlockout(id: string, b: T3Blockout): Array<{ date: string; hold: T3Hold }> {
  const out: Array<{ date: string; hold: T3Hold }> = [];
  for (let date = b.startDate; date <= b.endDate; date = addDays(date, 1)) {
    const startMs = nyToMs(date, b.startTime === "24:00" ? "00:00" : b.startTime);
    const endMs = b.endTime === "24:00" ? nyToMs(addDays(date, 1), "00:00") : nyToMs(date, b.endTime);
    out.push({ date, hold: { id, startMs, endMs, kind: "blockout", ...(b.label ? { label: b.label } : {}) } });
  }
  return out;
}

// ---- Manual bookings and edits ----

/** The fields on a booking Ted can type in. None are required beyond a name. */
export type T3Fields = {
  firstName: string; lastName: string; phone: string; emails: string[];
  realtorName: string; realtorEmail: string; realtorPhone: string;
  street: string; town: string; zip: string; unit: string; style: string; sqft: string; basement: string; utilities: string; notes: string;
};

const STRING_FIELDS: Array<[keyof T3Fields, number]> = [
  ["firstName", 60], ["lastName", 60], ["phone", 30], ["realtorName", 80], ["realtorPhone", 30],
  ["street", 160], ["town", 80], ["unit", 60], ["sqft", 20], ["notes", 1000]
];
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** Only the fields that were sent, cleaned. Style/basement/utilities are free to be blank here, unlike the public form. */
export function sanitizeFields(body: any): { ok: true; value: Partial<T3Fields> } | { ok: false; error: string } {
  const value: Partial<T3Fields> = {};
  for (const [key, max] of STRING_FIELDS) if (body?.[key] !== undefined) (value as any)[key] = clean(body[key], max);
  if (body?.zip !== undefined) {
    const zip = clean(body.zip, 10).slice(0, 5);
    if (zip && !ZIP.test(zip)) return { ok: false, error: "The ZIP must be 5 digits." };
    value.zip = zip;
  }
  if (body?.emails !== undefined || body?.email !== undefined) {
    const emails = splitEmails(body.emails ?? body.email);
    if (!emails.every((e) => EMAIL.test(e))) return { ok: false, error: "One of the email addresses doesn't look right." };
    if (emails.length > 4) return { ok: false, error: "Please use no more than 4 email addresses." };
    value.emails = emails;
  }
  if (body?.realtorEmail !== undefined) {
    const email = splitEmails(body.realtorEmail)[0] || "";
    if (email && !EMAIL.test(email)) return { ok: false, error: "The Realtor's email doesn't look right." };
    value.realtorEmail = email;
  }
  for (const [key, allowed] of [["style", T3_STYLES], ["basement", T3_BASEMENTS], ["utilities", ["yes", "no"]]] as Array<[keyof T3Fields, string[]]>) {
    if (body?.[key] === undefined) continue;
    if (body[key] !== "" && !allowed.includes(body[key])) return { ok: false, error: `That ${key} choice isn't valid.` };
    (value as any)[key] = body[key];
  }
  return { ok: true, value };
}

export type T3ManualBooking = {
  type: T3InspectionType; addonIds: number[]; date: string; time: string; minutes: number;
  /** Total price before any travel fee. */
  basePriceCents: number; travelFeeCents: number; fields: T3Fields;
  notify: { customer: boolean; realtor: boolean };
};

const EMPTY_FIELDS: T3Fields = {
  firstName: "", lastName: "", phone: "", emails: [], realtorName: "", realtorEmail: "", realtorPhone: "",
  street: "", town: "", zip: "", unit: "", style: "", sqft: "", basement: "", utilities: "", notes: ""
};

/**
 * Ted adds a booking by hand. Notice and range rules are skipped (he decides), a custom price
 * replaces the computed one, and nothing is required beyond a name.
 */
export function validateManualBooking(body: any, catalog: T3Catalog = DEFAULT_CATALOG, feeForZip: (zip: string) => number = () => 0): { ok: true; value: T3ManualBooking } | { ok: false; error: string } {
  const type = catalog.types.find((t) => t.id === Number(body?.typeId));
  if (!type) return { ok: false, error: "Please choose an inspection type." };
  const addonIds = Array.from(new Set((Array.isArray(body?.addonIds) ? body.addonIds : []).map(Number))) as number[];
  if (addonIds.some((id) => !catalog.addons.some((a) => a.id === id))) return { ok: false, error: "One of the add-ons isn't valid." };
  if (!isDateString(body?.date) || !isTimeString(body?.time)) return { ok: false, error: "Please choose a date and time." };
  const sanitized = sanitizeFields(body);
  if (!sanitized.ok) return sanitized;
  const fields: T3Fields = { ...EMPTY_FIELDS, ...sanitized.value };
  if (!fields.firstName && !fields.lastName) return { ok: false, error: "Please add a name." };
  const minutes = body?.minutes === undefined || body.minutes === "" ? type.minutes : int(body.minutes, 15, 720);
  if (minutes === undefined) return { ok: false, error: "The duration must be 15 to 720 minutes." };
  let basePriceCents = type.priceCents + addonIds.reduce((sum, id) => sum + (catalog.addons.find((a) => a.id === id)?.priceCents || 0), 0);
  if (body?.customPriceCents !== undefined && body.customPriceCents !== null && body.customPriceCents !== "") {
    const custom = int(body.customPriceCents, 0, 10_000_000);
    if (custom === undefined) return { ok: false, error: "The price isn't a valid amount." };
    basePriceCents = custom;
  }
  // Ted may charge a travel fee by hand; if he doesn't say, an extended-zone ZIP gets the usual one.
  const fee = body?.travelFeeCents === undefined || body.travelFeeCents === "" ? feeForZip(fields.zip) : int(body.travelFeeCents, 0, 1_000_000);
  if (fee === undefined) return { ok: false, error: "The travel fee isn't a valid amount." };
  return {
    ok: true,
    value: {
      type, addonIds, date: body.date, time: body.time, minutes, basePriceCents, travelFeeCents: fee, fields,
      notify: { customer: body?.notifyCustomer === true, realtor: body?.notifyRealtor === true }
    }
  };
}
