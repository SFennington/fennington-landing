// Online booking for Ted Towne's T3 Inspections (demo/t3-inspections), replacing Acuity.
// Everything here is pure (no Firestore, no network) so it can be tested directly; the routes
// and the database live in index.ts.
import { T3_ADDONS, T3_TYPES, type T3Addon, type T3InspectionType } from "./t3-catalog";
import T3_ZIPS from "./t3-zips.json";

export const T3_TIMEZONE = "America/New_York";
export const T3_TED_EMAIL = "T3Towne@gmail.com";
export const T3_PHONE = "(413) 282-8616";
export const T3_SITE = "https://t3inspections.com";

export const T3_SETTINGS = {
  // Day of week (0 = Sunday) to start times, New York time. Copied from Acuity on 2026-11-04.
  startTimes: { 1: ["09:00", "13:00"], 2: ["09:00", "13:00"], 3: ["09:00", "13:00"], 4: ["09:00", "13:00"], 5: ["09:00", "13:00"] } as Record<number, string[]>,
  // No online booking, rescheduling or cancelling inside this many hours of the start.
  noticeHours: 24,
  // How far ahead the calendar opens.
  daysAhead: 30
};
/** The scheduling rules Ted can change from his dashboard (t3Config/settings). */
export type T3Settings = { startTimes: Record<number, string[]>; noticeHours: number; daysAhead: number };

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** A stretch of Ted's calendar that is taken: a booking or a blockout he added. */
export type T3Hold = { id: string; startMs: number; endMs: number; kind: "booking" | "blockout"; label?: string };

// ---- Time, always as New York wall-clock time ----

function nyParts(ms: number): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: T3_TIMEZONE, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short"
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    year: Number(get("year")), month: Number(get("month")), day: Number(get("day")),
    hour: Number(get("hour")), minute: Number(get("minute")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"))
  };
}

function nyOffsetMs(ms: number): number {
  const p = nyParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isTimeString(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** The instant a New York wall-clock date and time happens, correct across daylight saving changes. */
export function nyToMs(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const first = asUtc - nyOffsetMs(asUtc);
  const second = asUtc - nyOffsetMs(first);
  return second;
}

export function nyDateOf(ms: number): string {
  const p = nyParts(ms);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function nyTimeOf(ms: number): string {
  const p = nyParts(ms);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function timeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "Wednesday, November 11, 2026 at 1:00 PM" */
export function whenLabel(ms: number): string {
  const date = nyDateOf(ms);
  const [y, m, d] = date.split("-").map(Number);
  return `${DAYS[weekdayOf(date)]}, ${MONTHS[m - 1]} ${d}, ${y} at ${timeLabel(nyTimeOf(ms))}`;
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} hour${h === 1 ? "" : "s"}` : "", m ? `${m} minutes` : ""].filter(Boolean).join(" ");
}

export function moneyLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---- Availability ----

function overlaps(startMs: number, endMs: number, holds: T3Hold[], ignoreId?: string): boolean {
  return holds.some((hold) => hold.id !== ignoreId && hold.startMs < endMs && hold.endMs > startMs);
}

/** Start times Ted could take on one date, for an inspection that lasts `minutes`. */
export function slotsForDate(args: { date: string; minutes: number; holds: T3Hold[]; nowMs: number; ignoreId?: string; settings?: T3Settings }): Array<{ time: string; startMs: number }> {
  const { date, minutes, holds, nowMs, ignoreId } = args;
  const settings = args.settings || T3_SETTINGS;
  if (!isDateString(date)) return [];
  const today = nyDateOf(nowMs);
  if (date > addDays(today, settings.daysAhead)) return [];
  const slots: Array<{ time: string; startMs: number }> = [];
  for (const time of settings.startTimes[weekdayOf(date)] || []) {
    const startMs = nyToMs(date, time);
    if (startMs < nowMs + settings.noticeHours * HOUR_MS) continue;
    if (overlaps(startMs, startMs + minutes * MINUTE_MS, holds, ignoreId)) continue;
    slots.push({ time, startMs });
  }
  return slots;
}

/** Every date in a month ("YYYY-MM") with at least one open start time. */
export function openDaysInMonth(args: { month: string; minutes: number; holdsByDate: Record<string, T3Hold[]>; nowMs: number; settings?: T3Settings }): Record<string, boolean> {
  const { month, minutes, holdsByDate, nowMs, settings } = args;
  const result: Record<string, boolean> = {};
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return result;
  for (let date = `${month}-01`; date.startsWith(month); date = addDays(date, 1)) {
    result[date] = slotsForDate({ date, minutes, holds: holdsByDate[date] || [], nowMs, settings }).length > 0;
  }
  return result;
}

/** True while the booking is far enough away for the customer to change or cancel it online. */
export function canChangeOnline(startMs: number, nowMs: number, settings: T3Settings = T3_SETTINGS): boolean {
  return startMs - nowMs >= settings.noticeHours * HOUR_MS;
}

// ---- Catalog and range ----

/** The types and add-ons customers see: the built-in list with Ted's saved price and duration changes applied. */
export type T3Catalog = { types: T3InspectionType[]; addons: T3Addon[] };
export const DEFAULT_CATALOG: T3Catalog = { types: T3_TYPES, addons: T3_ADDONS };

export function findType(id: unknown, catalog: T3Catalog = DEFAULT_CATALOG): T3InspectionType | undefined {
  return catalog.types.find((type) => type.id === Number(id));
}

export function priceFor(type: T3InspectionType, addonIds: number[], catalog: T3Catalog = DEFAULT_CATALOG): number {
  return type.priceCents + addonIds.reduce((sum, id) => sum + (catalog.addons.find((addon) => addon.id === id)?.priceCents || 0), 0);
}

const ZIP_INDEX = new Map(T3_ZIPS.map((entry) => [entry.zip, entry]));

/** Ted's saved choice from the map: green ZIPs book normally, blue ones book with a travel fee. */
export type T3RangeConfig = { included: string[]; extended: string[]; extendedFeeCents: number };
export type T3Zone = "included" | "extended" | "none";

/** Which zone a ZIP is in. With no saved choice the built-in list is used and everything on it is "included". */
export function zoneFor(value: unknown, range?: T3RangeConfig | null): { zone: T3Zone; inRange: boolean; town?: string; feeCents: number } {
  const zip = typeof value === "string" ? value.trim().slice(0, 5) : "";
  if (!/^\d{5}$/.test(zip)) return { zone: "none", inRange: false, feeCents: 0 };
  const town = ZIP_INDEX.get(zip)?.town;
  if (!range) return town ? { zone: "included", inRange: true, town, feeCents: 0 } : { zone: "none", inRange: false, feeCents: 0 };
  if (range.included.includes(zip)) return { zone: "included", inRange: true, town, feeCents: 0 };
  if (range.extended.includes(zip)) return { zone: "extended", inRange: true, town, feeCents: range.extendedFeeCents };
  return { zone: "none", inRange: false, feeCents: 0 };
}

/** The built-in suggestion: every ZIP in t3-zips.json, all included. */
export function defaultRange(): T3RangeConfig {
  return { included: T3_ZIPS.map((entry) => entry.zip), extended: [], extendedFeeCents: 0 };
}

/** Town names for the built-in ZIPs, to label the map and the "check a ZIP" box. */
export function townOf(zip: string): string | undefined {
  return ZIP_INDEX.get(zip)?.town;
}

/** Whether a ZIP can book online. Anything else is told to contact Ted. */
export function zipRange(value: unknown, range?: T3RangeConfig | null): { inRange: boolean; town?: string } {
  const z = zoneFor(value, range);
  return z.inRange ? { inRange: true, town: z.town } : { inRange: false };
}

// ---- A booking request from the website ----

export type T3BookingRequest = {
  type: T3InspectionType;
  addonIds: number[];
  date: string;
  time: string;
  firstName: string;
  lastName: string;
  phone: string;
  emails: string[];
  realtorName: string;
  realtorEmail: string;
  realtorPhone: string;
  street: string;
  town: string;
  zip: string;
  unit: string;
  style: string;
  sqft: string;
  basement: string;
  utilities: "yes" | "no";
};

export const T3_STYLES = ["Condo", "1 Story", "2 Story", "3 Story", "Multi-family"];
export const T3_BASEMENTS = ["Basement", "Crawl Space", "Slab"];

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** Splits "a@x.com, b@y.com" into clean, lower-case, de-duplicated addresses. */
export function splitEmails(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(",") : typeof value === "string" ? value : "";
  return Array.from(new Set(raw.split(/[,;\s]+/).map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

export type T3Validation = { ok: true; value: T3BookingRequest } | { ok: false; error: string };

export function validateBookingRequest(body: any, catalog: T3Catalog = DEFAULT_CATALOG): T3Validation {
  const type = findType(body?.typeId, catalog);
  if (!type) return { ok: false, error: "Please choose an inspection type." };
  const addonIds = Array.from(new Set((Array.isArray(body?.addonIds) ? body.addonIds : []).map(Number)));
  if (addonIds.some((id) => !type.addonIds.includes(id as number))) return { ok: false, error: "One of the add-ons is not available for this inspection." };
  if (!isDateString(body?.date) || !isTimeString(body?.time)) return { ok: false, error: "Please choose a date and time." };

  const emails = splitEmails(body?.email);
  const firstName = clean(body?.firstName, 60);
  const lastName = clean(body?.lastName, 60);
  const phone = clean(body?.phone, 30);
  const street = clean(body?.street, 160);
  const town = clean(body?.town, 80);
  const zip = clean(body?.zip, 10).slice(0, 5);
  const unit = clean(body?.unit, 60);
  const sqft = clean(body?.sqft, 20);
  const realtorEmail = splitEmails(body?.realtorEmail)[0] || "";
  if (!firstName) return { ok: false, error: "First name is required." };
  if (!lastName) return { ok: false, error: "Last name is required." };
  if (phone.replace(/\D/g, "").length < 10) return { ok: false, error: "Please add a phone number." };
  if (!emails.length || !emails.every((email) => EMAIL.test(email))) return { ok: false, error: "Please add a valid email address." };
  if (emails.length > 4) return { ok: false, error: "Please add no more than 4 email addresses." };
  if (realtorEmail && !EMAIL.test(realtorEmail)) return { ok: false, error: "The Realtor's email doesn't look right." };
  if (!street || !town || !/^\d{5}$/.test(zip)) return { ok: false, error: "Please add the full address, including town and ZIP." };
  if (!unit) return { ok: false, error: 'Please add the unit number, or type "no".' };
  if (!T3_STYLES.includes(body?.style)) return { ok: false, error: "Please choose the style of the property." };
  if (!sqft) return { ok: false, error: "Please add the square footage." };
  if (!T3_BASEMENTS.includes(body?.basement)) return { ok: false, error: "Please say whether there is a basement." };
  if (body?.utilities !== "yes" && body?.utilities !== "no") return { ok: false, error: "Please say whether the utilities are on." };

  return {
    ok: true,
    value: {
      type, addonIds: addonIds as number[], date: body.date, time: body.time,
      firstName, lastName, phone, emails,
      realtorName: clean(body?.realtorName, 80), realtorEmail, realtorPhone: clean(body?.realtorPhone, 30),
      street, town, zip, unit, style: body.style, sqft, basement: body.basement, utilities: body.utilities
    }
  };
}

// ---- Emails (plain text, so nothing a customer types can become markup) ----

/** What the emails need to know about a saved booking. */
export type T3BookingRecord = {
  id: string;
  typeName: string;
  addonNames: string[];
  minutes: number;
  priceCents: number;
  /** Extended-zone travel fee, already included in priceCents. */
  travelFeeCents?: number;
  startMs: number;
  firstName: string;
  lastName: string;
  phone: string;
  emails: string[];
  realtorName: string;
  realtorEmail: string;
  realtorPhone: string;
  street: string;
  town: string;
  zip: string;
  unit: string;
  style: string;
  sqft: string;
  basement: string;
  utilities: string;
  paymentStatus: string;
};

/** The price as text. A travel fee is always its own line. */
function priceLines(b: T3BookingRecord): string {
  const fee = b.travelFeeCents || 0;
  const base = b.priceCents - fee;
  if (!fee) return `Price: ${b.priceCents ? moneyLabel(b.priceCents) : "Ted will confirm the price with you"}`;
  return `Inspection: ${base ? moneyLabel(base) : "Ted will confirm the price with you"}\nTravel fee (extended area): ${moneyLabel(fee)}\nTotal: ${base ? moneyLabel(b.priceCents) : `${moneyLabel(fee)} plus the inspection price`}`;
}

type Email = { from: string; to: string[]; reply_to: string; subject: string; text: string; attachments?: Array<{ filename: string; content: string }> };

const fromAddressOf = (fromEmail: string) => /<([^<>]+)>/.exec(fromEmail)?.[1] || fromEmail;
const noBreaks = (value: string) => value.replace(/["<>\\\r\n]/g, "").slice(0, 60);
const fullName = (b: T3BookingRecord) => `${b.firstName} ${b.lastName}`.trim();
const addressLine = (b: T3BookingRecord) => `${b.street}, ${b.town} MA ${b.zip}`;
const inspectionLine = (b: T3BookingRecord) => [b.typeName, ...b.addonNames.map((name) => `+ ${name}`)].join("\n");

function manageUrl(id: string, token: string, base = T3_SITE) {
  return `${base}/my-inspection/?b=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;
}

/** A calendar file customers can add the inspection to their own calendar with. */
export function t3Ics(b: T3BookingRecord): string {
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//T3 Inspections//Booking//EN", "BEGIN:VEVENT",
    `UID:${b.id}@t3inspections.com`, `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(b.startMs)}`, `DTEND:${stamp(b.startMs + b.minutes * MINUTE_MS)}`,
    `SUMMARY:${esc("Home inspection with T3 Inspections")}`, `LOCATION:${esc(addressLine(b))}`,
    `DESCRIPTION:${esc(b.typeName)}`, "END:VEVENT", "END:VCALENDAR", ""
  ].join("\r\n");
}

function customerFooter() {
  return `Questions? Call Ted at ${T3_PHONE} or reply to this email.\n\nT3 Inspections\n${T3_PHONE}\n${T3_SITE}`;
}

/** The three emails sent when a booking is made: customer, Realtor copy, and Ted's alert. */
export function t3BookingEmails(b: T3BookingRecord, fromEmail: string, token: string, siteBase = T3_SITE, send: { customer?: boolean; realtor?: boolean; ted?: boolean } = {}): Email[] {
  const want = { customer: true, realtor: true, ted: true, ...send };
  const from = `T3 Inspections <${fromAddressOf(fromEmail)}>`;
  const when = whenLabel(b.startMs);
  const ics = { filename: "t3-inspection.ics", content: Buffer.from(t3Ics(b)).toString("base64") };
  const emails: Email[] = [{
    from, to: b.emails, reply_to: T3_TED_EMAIL, attachments: [ics],
    subject: `Your home inspection is scheduled for ${when}`,
    text: `Hi ${b.firstName},\n\nYour home inspection is scheduled.\n\n${when}\nAbout ${durationLabel(b.minutes)}\n${addressLine(b)}${b.unit.toLowerCase() === "no" ? "" : `\nUnit: ${b.unit}`}\n\n${inspectionLine(b)}\n\n${priceLines(b)}\n${b.paymentStatus === "paid" ? "Paid online: yes" : "Paid online: not yet. Ted will take payment after the inspection."}\n\nNeed to change it? You can reschedule or cancel online up to ${T3_SETTINGS.noticeHours} hours before: ${manageUrl(b.id, token, siteBase)}\nWithin ${T3_SETTINGS.noticeHours} hours, please call Ted at ${T3_PHONE}.\n\nA reminder will arrive the day before.\n\n${customerFooter()}`
  }];
  if (b.realtorEmail) {
    emails.push({
      from, to: [b.realtorEmail], reply_to: T3_TED_EMAIL, attachments: [ics],
      subject: `Home inspection scheduled for ${addressLine(b)}: ${when}`,
      text: `Hello${b.realtorName ? ` ${b.realtorName}` : ""},\n\nYour client ${fullName(b)} scheduled a home inspection with T3 Inspections.\n\n${when}\n${addressLine(b)}\n\n${inspectionLine(b)}\n\nTed Towne III will see you there. Questions? Call ${T3_PHONE}.\n\nT3 Inspections\n${T3_PHONE}\n${T3_SITE}`
    });
  }
  const realtorLines = [b.realtorName && `Agent: ${b.realtorName}`, b.realtorEmail && `Agent email: ${b.realtorEmail}`, b.realtorPhone && `Agent phone: ${b.realtorPhone}`].filter(Boolean).join("\n");
  emails.push({
    from: `${noBreaks(fullName(b)) || "Website booking"} via T3 Inspections website <${fromAddressOf(fromEmail)}>`,
    to: [T3_TED_EMAIL], reply_to: b.emails[0] || T3_TED_EMAIL,
    subject: `New booking: ${fullName(b)}, ${when}`,
    text: `Appointment scheduled online\n\n${when}, ${durationLabel(b.minutes)}\n\nName: ${fullName(b)}\nPhone: ${b.phone}\nEmail: ${b.emails.join(", ")}\n${b.priceCents - (b.travelFeeCents || 0) ? priceLines(b) : `Price: CONTACT FOR PRICE (set the price with the customer)${b.travelFeeCents ? `\nTravel fee (extended area): ${moneyLabel(b.travelFeeCents)}` : ""}`}\nPaid online: ${b.paymentStatus === "paid" ? moneyLabel(b.priceCents) : "$0.00 (reserved without paying)"}\n\nLocation\n============\n${addressLine(b)}\n\nInspection\n============\n${inspectionLine(b)}\n\nProperty Information\n============\nAgent\n${realtorLines || "(none given)"}\n\nCondo or unit number: ${b.unit}\nStyle of the property: ${b.style}\nSquare footage: ${b.sqft}\nBasement: ${b.basement}\nUtilities turned on: ${b.utilities}\n\nBooking id: ${b.id}`
  });
  // The first email is the customer's, then the Realtor's if there is one, and Ted's alert is last.
  const hasRealtor = Boolean(b.realtorEmail);
  return emails.filter((_, i) => (i === 0 ? want.customer && b.emails.length > 0 : hasRealtor && i === 1 ? want.realtor : want.ted));
}

/** Preview mode: every email goes to Ted alone, marked as a preview, saying who it would really have gone to. */
export function previewEmails(emails: Email[]): Email[] {
  return emails.map((email) => ({
    ...email,
    to: [T3_TED_EMAIL],
    subject: `[PREVIEW] ${email.subject}`,
    text: `PREVIEW ONLY. A real booking would send this to: ${email.to.join(", ")}\n\n${email.text}`
  }));
}

/** Customer (and Realtor) heads-up the day before. */
export function t3ReminderEmail(b: T3BookingRecord, fromEmail: string, token: string): Email {
  return {
    from: `T3 Inspections <${fromAddressOf(fromEmail)}>`,
    to: Array.from(new Set([...b.emails, ...(b.realtorEmail ? [b.realtorEmail] : [])])), reply_to: T3_TED_EMAIL,
    subject: `Reminder: home inspection ${whenLabel(b.startMs)}`,
    text: `Hi ${b.firstName},\n\nA reminder that your home inspection is coming up.\n\n${whenLabel(b.startMs)}\n${addressLine(b)}\n\n${inspectionLine(b)}\n\nPlease make sure the utilities are on and there is access to the whole house, including the basement or crawl space and the attic.\n\nCan't make it? It's now within ${T3_SETTINGS.noticeHours} hours, so please call Ted at ${T3_PHONE}.\n\n${customerFooter()}`
  };
}

/** Sent to customer and Ted when a booking is cancelled or moved. */
export function t3ChangeEmails(kind: "cancelled" | "rescheduled", b: T3BookingRecord, fromEmail: string, token: string, previousStartMs?: number, siteBase = T3_SITE, send: { customer?: boolean; ted?: boolean } = {}): Email[] {
  const want = { customer: true, ted: true, ...send };
  const from = `T3 Inspections <${fromAddressOf(fromEmail)}>`;
  const verb = kind === "cancelled" ? "cancelled" : `moved to ${whenLabel(b.startMs)}`;
  const emails: Email[] = [{
    from, to: Array.from(new Set([...b.emails, ...(kind === "rescheduled" && b.realtorEmail ? [b.realtorEmail] : [])])), reply_to: T3_TED_EMAIL,
    subject: kind === "cancelled" ? "Your home inspection was cancelled" : `Your home inspection moved to ${whenLabel(b.startMs)}`,
    text: `Hi ${b.firstName},\n\nYour home inspection at ${addressLine(b)} has been ${verb}.\n${kind === "cancelled" ? `\nTo book again, visit ${T3_SITE}/schedule-now/ or call Ted at ${T3_PHONE}.\n` : (token ? `\nNeed another change? ${manageUrl(b.id, token, siteBase)}\n` : `\nNeed another change? Call Ted at ${T3_PHONE}.\n`)}\n${customerFooter()}`
  }];
  emails.push({
    from: `T3 Inspections website <${fromAddressOf(fromEmail)}>`, to: [T3_TED_EMAIL], reply_to: b.emails[0] || T3_TED_EMAIL,
    subject: `Booking ${kind}: ${fullName(b)}`,
    text: `${fullName(b)} ${kind === "cancelled" ? "cancelled" : "rescheduled"} online.\n\n${previousStartMs ? `Was: ${whenLabel(previousStartMs)}\n` : ""}${kind === "rescheduled" ? `Now: ${whenLabel(b.startMs)}\n` : ""}${addressLine(b)}\nPhone: ${b.phone}\nEmail: ${b.emails.join(", ")}\nPaid online: ${b.paymentStatus === "paid" ? `${moneyLabel(b.priceCents)} (refund may be needed)` : "no"}\n\nBooking id: ${b.id}`
  });
  return emails.filter((_, i) => (i === 0 ? want.customer && emails[0].to.length > 0 : want.ted));
}
