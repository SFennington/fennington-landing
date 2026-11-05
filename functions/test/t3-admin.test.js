// Runs against the compiled output: `npm test` builds first.
const test = require("node:test");
const assert = require("node:assert/strict");
const a = require("../lib/t3-admin.js");
const b = require("../lib/t3-booking.js");

const NOW = Date.UTC(2026, 10, 3, 17, 0); // Tuesday 2026-11-03, noon in New York

test("Ted's verified Google account is allowed, nobody else is", () => {
  assert.equal(a.isT3Owner({ email: "T3Towne@gmail.com", email_verified: true }), true);
  assert.equal(a.isT3Owner({ email: "t3towne@gmail.com", email_verified: true }), true); // case does not matter
  assert.equal(a.isT3Owner({ email: "someone@gmail.com", email_verified: true }), false);
  assert.equal(a.isT3Owner({ email: "T3Towne@gmail.com.evil.com", email_verified: true }), false);
  assert.equal(a.isT3Owner({ email: "xT3Towne@gmail.com", email_verified: true }), false);
});

test("an unverified email is refused, and so is a missing token", () => {
  assert.equal(a.isT3Owner({ email: "T3Towne@gmail.com", email_verified: false }), false);
  assert.equal(a.isT3Owner({ email: "T3Towne@gmail.com" }), false);
  assert.equal(a.isT3Owner({ email: "T3Towne@gmail.com", email_verified: "true" }), false);
  assert.equal(a.isT3Owner({ email_verified: true }), false);
  assert.equal(a.isT3Owner(null), false);
  assert.equal(a.isT3Owner(undefined), false);
});

test("ZIP zones: green books, blue books with a fee, anything else cannot", () => {
  const range = { included: ["01001"], extended: ["01002"], extendedFeeCents: 7500 };
  assert.deepEqual(b.zoneFor("01001", range), { zone: "included", inRange: true, town: b.townOf("01001"), feeCents: 0 });
  const blue = b.zoneFor("01002", range);
  assert.equal(blue.zone, "extended");
  assert.equal(blue.inRange, true);
  assert.equal(blue.feeCents, 7500);
  assert.equal(b.zoneFor("02101", range).zone, "none");
  assert.equal(b.zoneFor("02101", range).inRange, false);
  assert.equal(b.zoneFor("1001", range).zone, "none");
  assert.equal(b.zoneFor(undefined, range).zone, "none");
});

test("without a saved map the built-in list is used and nothing carries a fee", () => {
  assert.equal(b.zoneFor("01001").zone, "included");
  assert.equal(b.zoneFor("01001", b.defaultRange()).zone, "included");
  assert.equal(b.zoneFor("99999").zone, "none");
  assert.equal(b.zipRange("01001").inRange, true);
});

test("saving the map: de-duplicates, keeps green over blue, needs a fee for blue", () => {
  const ok = a.validateRangeInput({ included: ["01001", "01001", "01002"], extended: ["01002", "01003"], extendedFeeCents: 5000 });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.included, ["01001", "01002"]);
  assert.deepEqual(ok.value.extended, ["01003"]);
  assert.equal(a.validateRangeInput({ included: [], extended: ["01003"], extendedFeeCents: 0 }).ok, false);
  assert.equal(a.validateRangeInput({ included: ["abc"], extended: [], extendedFeeCents: 0 }).ok, false);
  assert.equal(a.validateRangeInput({ included: ["01001"], extended: [], extendedFeeCents: -5 }).ok, false);
  assert.equal(a.validateRangeInput({ included: "01001" }).ok, false);
  assert.equal(a.validateRangeInput({ included: [], extended: [], extendedFeeCents: 0 }).ok, true); // an empty map is allowed: nothing books online
  assert.equal(a.rangeFrom(null), null);
  assert.equal(a.rangeFrom({ included: ["01001", "bad"], extended: [], extendedFeeCents: 100 }).included.length, 1);
});

test("settings: defaults, validation and damaged documents", () => {
  const def = a.defaultConfig();
  assert.equal(def.noticeHours, 24);
  assert.equal(def.daysAhead, 30);
  assert.deepEqual(def.startTimes[1], ["09:00", "13:00"]);
  assert.deepEqual(a.configFrom(undefined), def);
  assert.equal(a.configFrom({ noticeHours: -3, daysAhead: "x" }).noticeHours, 24);
  const saved = a.validateConfigInput({ startTimes: { 1: ["10:00"], 6: ["09:00", "09:00"] }, noticeHours: 48, daysAhead: 60, typeOverrides: { 218559: { priceCents: 59900, minutes: 130 } }, addonPrices: { 15826: 18000 } });
  assert.equal(saved.ok, true);
  assert.deepEqual(saved.value.startTimes[6], ["09:00"]);
  assert.equal(saved.value.noticeHours, 48);
  const catalog = a.catalogFor(saved.value);
  assert.equal(b.findType(218559, catalog).priceCents, 59900);
  assert.equal(b.findType(218559, catalog).minutes, 130);
  assert.equal(catalog.addons.find((x) => x.id === 15826).priceCents, 18000);
  // The built-in list itself is never changed by an override.
  assert.equal(b.findType(218559).priceCents, 55000);
  assert.equal(a.validateConfigInput({ noticeHours: 24, daysAhead: 30, startTimes: { 1: ["9am"] } }).ok, false);
  assert.equal(a.validateConfigInput({ noticeHours: 24, daysAhead: 30, typeOverrides: { 1: { priceCents: 5 } } }).ok, false);
  assert.equal(a.validateConfigInput({ noticeHours: 24, daysAhead: 30, addonPrices: { 15826: -1 } }).ok, false);
  assert.equal(a.validateConfigInput({ noticeHours: "soon", daysAhead: 30 }).ok, false);
});

test("saved settings change which slots the public calendar offers", () => {
  const cfg = a.validateConfigInput({ startTimes: { 1: ["10:00", "15:00"] }, noticeHours: 48, daysAhead: 10 }).value;
  assert.deepEqual(b.slotsForDate({ date: "2026-11-09", minutes: 120, holds: [], nowMs: NOW, settings: cfg }).map((s) => s.time), ["10:00", "15:00"]);
  // 48 hours' notice: Thursday 9:00 is under 48 hours from Tuesday noon, Friday is fine.
  assert.equal(b.slotsForDate({ date: "2026-11-05", minutes: 120, holds: [], nowMs: NOW, settings: a.validateConfigInput({ noticeHours: 48, daysAhead: 30 }).value }).length, 1);
  assert.equal(b.slotsForDate({ date: "2026-11-20", minutes: 120, holds: [], nowMs: NOW, settings: cfg }).length, 0); // beyond 10 days
  assert.equal(b.canChangeOnline(b.nyToMs("2026-11-05", "09:00"), NOW, cfg), false);
});

test("a blockout validates, and becomes one hold per day that takes slots away", () => {
  assert.equal(a.validateBlockout({ startDate: "2026-11-10" }).ok, true);
  assert.equal(a.validateBlockout({ startDate: "2026-11-10", endDate: "2026-11-09" }).ok, false);
  assert.equal(a.validateBlockout({ startDate: "nope" }).ok, false);
  assert.equal(a.validateBlockout({ startDate: "2026-11-10", allDay: false, startTime: "12:00", endTime: "10:00" }).ok, false);
  assert.equal(a.validateBlockout({ startDate: "2026-11-10", allDay: false, startTime: "12:00" }).ok, false);

  const allDay = a.validateBlockout({ startDate: "2026-11-10", endDate: "2026-11-12", label: "Vacation" }).value;
  const pieces = a.holdsForBlockout("blk", allDay);
  assert.deepEqual(pieces.map((p) => p.date), ["2026-11-10", "2026-11-11", "2026-11-12"]);
  for (const piece of pieces) {
    assert.deepEqual(b.slotsForDate({ date: piece.date, minutes: 120, holds: [piece.hold], nowMs: NOW }), []);
    assert.equal(piece.hold.kind, "blockout");
  }
  assert.equal(b.slotsForDate({ date: "2026-11-13", minutes: 120, holds: [], nowMs: NOW }).length, 2); // the day after is untouched

  // A time range takes only the slots it overlaps.
  const range = a.validateBlockout({ startDate: "2026-11-10", allDay: false, startTime: "12:00", endTime: "14:00" }).value;
  const [piece] = a.holdsForBlockout("blk2", range);
  assert.deepEqual(b.slotsForDate({ date: "2026-11-10", minutes: 120, holds: [piece.hold], nowMs: NOW }).map((s) => s.time), ["09:00"]);
});

test("removing a blockout's holds gives the slots back", () => {
  const blk = a.validateBlockout({ startDate: "2026-11-10" }).value;
  const holds = a.holdsForBlockout("gone", blk).map((p) => p.hold).filter((h) => h.id !== "gone");
  assert.equal(b.slotsForDate({ date: "2026-11-10", minutes: 120, holds, nowMs: NOW }).length, 2);
});

test("overlaps are found, and a job can sit exactly next to another", () => {
  const nine = b.nyToMs("2026-11-10", "09:00");
  const hour = 3_600_000;
  const holds = [{ id: "a", startMs: nine, endMs: nine + 2 * hour, kind: "booking" }];
  assert.equal(a.findOverlaps(holds, nine + hour, nine + 3 * hour).length, 1);
  assert.equal(a.findOverlaps(holds, nine + 2 * hour, nine + 4 * hour).length, 0); // back to back
  assert.equal(a.findOverlaps(holds, nine, nine + 2 * hour, "a").length, 0); // ignoring itself
});

const MANUAL = { typeId: 218559, date: "2026-11-04", time: "07:30", firstName: "Pat" };

test("a manual booking needs only a name, and skips the notice rule and the range check", () => {
  const ok = a.validateManualBooking(MANUAL);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.time, "07:30"); // not one of the usual start times, and under 24 hours away
  assert.equal(ok.value.basePriceCents, 55000);
  assert.equal(ok.value.fields.zip, "");
  assert.deepEqual(ok.value.notify, { customer: false, realtor: false });
  assert.equal(a.validateManualBooking({ ...MANUAL, firstName: "", lastName: "" }).ok, false);
  assert.equal(a.validateManualBooking({ ...MANUAL, lastName: "Smith", firstName: "" }).ok, true);
  assert.equal(a.validateManualBooking({ ...MANUAL, typeId: 1 }).ok, false);
  assert.equal(a.validateManualBooking({ ...MANUAL, date: "2026-02-30" }).ok, false);
  assert.equal(a.validateManualBooking({ ...MANUAL, email: "not an email" }).ok, false);
  assert.equal(a.validateManualBooking({ ...MANUAL, zip: "12" }).ok, false);
  assert.equal(a.validateManualBooking({ ...MANUAL, notifyCustomer: true, notifyRealtor: true }).value.notify.realtor, true);
});

test("a manual booking can set its own price, which a contact-for-price type needs", () => {
  const contact = T3("contact"); // >4,500 sq ft: $0 until Ted sets one
  assert.equal(a.validateManualBooking({ ...MANUAL, typeId: contact.id }).value.basePriceCents, 0);
  assert.equal(a.validateManualBooking({ ...MANUAL, typeId: contact.id, customPriceCents: 90000 }).value.basePriceCents, 90000);
  assert.equal(a.validateManualBooking({ ...MANUAL, customPriceCents: 0 }).value.basePriceCents, 0); // a free job is allowed
  assert.equal(a.validateManualBooking({ ...MANUAL, customPriceCents: -1 }).ok, false);
  // Add-ons add to the type's price.
  assert.equal(a.validateManualBooking({ ...MANUAL, addonIds: [15826] }).value.basePriceCents, 55000 + 17500);
  assert.equal(a.validateManualBooking({ ...MANUAL, addonIds: [999] }).ok, false);
  // The usual travel fee applies by ZIP unless Ted types one.
  assert.equal(a.validateManualBooking({ ...MANUAL, zip: "01002" }, undefined, () => 5000).value.travelFeeCents, 5000);
  assert.equal(a.validateManualBooking({ ...MANUAL, zip: "01002", travelFeeCents: 0 }, undefined, () => 5000).value.travelFeeCents, 0);
});

function T3(kind) {
  const { T3_TYPES } = require("../lib/t3-catalog.js");
  return kind === "contact" ? T3_TYPES.find((t) => t.priceCents === 0) : T3_TYPES[0];
}

test("edits only touch the fields that were sent", () => {
  const edit = a.sanitizeFields({ phone: " 413-555-0100 ", realtorEmail: "Agent@Example.com" });
  assert.equal(edit.ok, true);
  assert.deepEqual(Object.keys(edit.value).sort(), ["phone", "realtorEmail"]);
  assert.equal(edit.value.realtorEmail, "agent@example.com");
  assert.equal(a.sanitizeFields({ style: "Castle" }).ok, false);
  assert.equal(a.sanitizeFields({ utilities: "" }).ok, true);
  assert.equal(a.sanitizeFields({ notes: "x".repeat(5000) }).value.notes.length, 1000);
});

test("the travel fee is its own line in every email, and the total is right", () => {
  const record = {
    id: "abc", typeName: "Single family", addonNames: [], minutes: 120, priceCents: 55000 + 7500, travelFeeCents: 7500, startMs: b.nyToMs("2026-11-10", "09:00"),
    firstName: "Pat", lastName: "Lee", phone: "4135550100", emails: ["pat@example.com"], realtorName: "", realtorEmail: "agent@example.com", realtorPhone: "",
    street: "1 Main St", town: "Becket", zip: "01223", unit: "no", style: "2 Story", sqft: "2000", basement: "Basement", utilities: "yes", paymentStatus: "unpaid"
  };
  const emails = b.t3BookingEmails(record, "x <noreply@fennington.com>", "tok");
  assert.equal(emails.length, 3);
  const customer = emails[0].text;
  assert.match(customer, /Inspection: \$550\.00/);
  assert.match(customer, /Travel fee \(extended area\): \$75\.00/);
  assert.match(customer, /Total: \$625\.00/);
  assert.match(emails[2].text, /Travel fee \(extended area\): \$75\.00/);
  // No fee, no extra lines.
  const plain = b.t3BookingEmails({ ...record, priceCents: 55000, travelFeeCents: 0 }, "x <noreply@fennington.com>", "tok")[0].text;
  assert.doesNotMatch(plain, /Travel fee/);
  assert.match(plain, /Price: \$550\.00/);
});

test("manual bookings can skip the customer, the Realtor and Ted's own alert", () => {
  const record = {
    id: "abc", typeName: "Single family", addonNames: [], minutes: 120, priceCents: 55000, startMs: b.nyToMs("2026-11-10", "09:00"),
    firstName: "Pat", lastName: "Lee", phone: "", emails: ["pat@example.com"], realtorName: "", realtorEmail: "agent@example.com", realtorPhone: "",
    street: "1 Main St", town: "Becket", zip: "01223", unit: "no", style: "", sqft: "", basement: "", utilities: "", paymentStatus: "unpaid"
  };
  const from = "x <noreply@fennington.com>";
  assert.equal(b.t3BookingEmails(record, from, "t", undefined, { customer: false, realtor: false, ted: false }).length, 0);
  assert.deepEqual(b.t3BookingEmails(record, from, "t", undefined, { customer: true, realtor: false, ted: false }).map((e) => e.to), [["pat@example.com"]]);
  assert.deepEqual(b.t3BookingEmails(record, from, "t", undefined, { customer: false, realtor: true, ted: false }).map((e) => e.to), [["agent@example.com"]]);
  // No customer address: nothing to send them even when asked.
  assert.equal(b.t3BookingEmails({ ...record, emails: [], realtorEmail: "" }, from, "t", undefined, { ted: false }).length, 0);
  // A move or cancel by Ted goes to the customer only, and the link becomes "call Ted" when there is no private token.
  const moved = b.t3ChangeEmails("rescheduled", record, from, "", record.startMs - 1000, undefined, { customer: true, ted: false });
  assert.equal(moved.length, 1);
  assert.doesNotMatch(moved[0].text, /my-inspection/);
  assert.equal(b.t3ChangeEmails("cancelled", { ...record, emails: [] }, from, "", undefined, undefined, { ted: false }).length, 0);
});
