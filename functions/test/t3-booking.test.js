// Runs against the compiled output: `npm test` builds first.
const test = require("node:test");
const assert = require("node:assert/strict");
const b = require("../lib/t3-booking.js");
const { T3_TYPES } = require("../lib/t3-catalog.js");

const FROM = "Fennington <noreply@fennington.com>";
// Tuesday 2026-11-03, noon in New York (17:00 UTC; EST).
const NOW = Date.UTC(2026, 10, 3, 17, 0);

test("New York times are right on both sides of daylight saving", () => {
  // EDT (UTC-4) in summer, EST (UTC-5) in winter.
  assert.equal(b.nyToMs("2026-07-15", "09:00"), Date.UTC(2026, 6, 15, 13, 0));
  assert.equal(b.nyToMs("2026-12-15", "09:00"), Date.UTC(2026, 11, 15, 14, 0));
  // Spring forward 2027-03-14 and fall back 2026-11-01: the 9:00 AM that morning is still 9:00 AM.
  assert.equal(b.nyToMs("2027-03-14", "09:00"), Date.UTC(2027, 2, 14, 13, 0));
  assert.equal(b.nyToMs("2027-03-13", "13:00"), Date.UTC(2027, 2, 13, 18, 0));
  assert.equal(b.nyToMs("2026-11-01", "09:00"), Date.UTC(2026, 10, 1, 14, 0));
  assert.equal(b.nyToMs("2026-10-31", "13:00"), Date.UTC(2026, 9, 31, 17, 0));
  for (const [date, time] of [["2027-03-14", "09:00"], ["2026-11-01", "13:00"], ["2026-07-04", "09:00"]]) {
    const ms = b.nyToMs(date, time);
    assert.equal(b.nyDateOf(ms), date);
    assert.equal(b.nyTimeOf(ms), time);
  }
});

test("only Monday to Friday, 9:00 and 1:00", () => {
  const monday = b.slotsForDate({ date: "2026-11-09", minutes: 120, holds: [], nowMs: NOW });
  assert.deepEqual(monday.map((s) => s.time), ["09:00", "13:00"]);
  assert.deepEqual(b.slotsForDate({ date: "2026-11-07", minutes: 120, holds: [], nowMs: NOW }), []); // Saturday
  assert.deepEqual(b.slotsForDate({ date: "2026-11-08", minutes: 120, holds: [], nowMs: NOW }), []); // Sunday
});

test("nothing inside 24 hours, and the boundary is exact", () => {
  // Tuesday noon now: Wednesday 9:00 is 21 hours away, Wednesday 1:00 PM is 25 hours away.
  const wed = b.slotsForDate({ date: "2026-11-04", minutes: 120, holds: [], nowMs: NOW });
  assert.deepEqual(wed.map((s) => s.time), ["13:00"]);
  // Exactly 24 hours is allowed; one minute short is not.
  const exactly = b.nyToMs("2026-11-04", "13:00") - 24 * 3_600_000;
  assert.equal(b.slotsForDate({ date: "2026-11-04", minutes: 120, holds: [], nowMs: exactly }).length, 1);
  assert.equal(b.slotsForDate({ date: "2026-11-04", minutes: 120, holds: [], nowMs: exactly + 60_000 }).filter((s) => s.time === "13:00").length, 0);
  assert.equal(b.canChangeOnline(b.nyToMs("2026-11-04", "13:00"), NOW), true);
  assert.equal(b.canChangeOnline(b.nyToMs("2026-11-04", "09:00"), NOW), false);
});

test("the calendar opens 30 days ahead and no further", () => {
  assert.equal(b.slotsForDate({ date: "2026-12-03", minutes: 120, holds: [], nowMs: NOW }).length, 2);
  assert.equal(b.slotsForDate({ date: "2026-12-04", minutes: 120, holds: [], nowMs: NOW }).length, 0);
});

test("a booking or blockout removes the slots it overlaps, and only those", () => {
  const nine = b.nyToMs("2026-11-09", "09:00");
  // A 3-hour inspection at 9:00 ends at noon; 1:00 PM stays open.
  const booked = [{ id: "a", startMs: nine, endMs: nine + 3 * 3_600_000, kind: "booking" }];
  assert.deepEqual(b.slotsForDate({ date: "2026-11-09", minutes: 120, holds: booked, nowMs: NOW }).map((s) => s.time), ["13:00"]);
  // A job that runs into the next slot blocks it too: 9:00 for 4.5 hours covers 1:00 PM.
  const long = [{ id: "a", startMs: nine, endMs: nine + 4.5 * 3_600_000, kind: "booking" }];
  assert.deepEqual(b.slotsForDate({ date: "2026-11-09", minutes: 120, holds: long, nowMs: NOW }), []);
  // A noon-to-2 blockout: a 3-hour inspection at 9:00 ends exactly at noon, so it still fits; 1:00 PM does not.
  const blockout = [{ id: "x", startMs: b.nyToMs("2026-11-09", "12:00"), endMs: b.nyToMs("2026-11-09", "14:00"), kind: "blockout" }];
  assert.deepEqual(b.slotsForDate({ date: "2026-11-09", minutes: 180, holds: blockout, nowMs: NOW }).map((s) => s.time), ["09:00"]);
  // An 11:00 to 12:00 blockout cuts into a 3-hour job starting at 9:00, but not a 2-hour one.
  const midMorning = [{ id: "y", startMs: b.nyToMs("2026-11-09", "11:00"), endMs: b.nyToMs("2026-11-09", "12:00"), kind: "blockout" }];
  assert.deepEqual(b.slotsForDate({ date: "2026-11-09", minutes: 180, holds: midMorning, nowMs: NOW }).map((s) => s.time), ["13:00"]);
  assert.deepEqual(b.slotsForDate({ date: "2026-11-09", minutes: 120, holds: midMorning, nowMs: NOW }).map((s) => s.time), ["09:00", "13:00"]);
  // Rescheduling ignores the booking's own hold.
  assert.equal(b.slotsForDate({ date: "2026-11-09", minutes: 120, holds: booked, nowMs: NOW, ignoreId: "a" }).length, 2);
});

test("month view marks days with an open slot", () => {
  const days = b.openDaysInMonth({ month: "2026-11", minutes: 120, holdsByDate: {}, nowMs: NOW });
  assert.equal(Object.keys(days).length, 30);
  assert.equal(days["2026-11-03"], false); // today, inside 24 hours
  assert.equal(days["2026-11-04"], true);
  assert.equal(days["2026-11-07"], false);
  assert.equal(days["2026-11-30"], true);
  assert.deepEqual(b.openDaysInMonth({ month: "nonsense", minutes: 120, holdsByDate: {}, nowMs: NOW }), {});
});

test("range: three counties and the I-91 corridor are in, Pittsfield and out-of-state are out", () => {
  for (const [zip, town] of [["01027", "Easthampton"], ["01103", "Springfield"], ["01301", "Greenfield"], ["01060", "Northampton"]]) {
    assert.equal(b.zipRange(zip).inRange, true, zip);
    assert.equal(b.zipRange(zip).town, town);
  }
  assert.equal(b.zipRange("01201").inRange, false); // Pittsfield, Berkshire County
  assert.equal(b.zipRange("06103").inRange, false); // Hartford, CT
  assert.equal(b.zipRange("abcde").inRange, false);
  assert.equal(b.zipRange("").inRange, false);
  assert.equal(b.zipRange(undefined).inRange, false);
  assert.equal(b.zipRange("01027-1234").inRange, true); // ZIP+4 is accepted
});

const goodBody = (overrides = {}) => ({
  typeId: 218559, addonIds: [15826], date: "2026-11-11", time: "13:00",
  firstName: "Danny", lastName: "Dickinson", phone: "413-572-5770", email: "danny@example.com, wife@example.com",
  realtorName: "Diana", realtorEmail: "diana@example.com", realtorPhone: "413-588-4114",
  street: "275 Dewey Ave", town: "Easthampton", zip: "01027", unit: "No", style: "2 Story", sqft: "1260", basement: "Basement", utilities: "yes",
  ...overrides
});

test("a good request validates and the price adds the add-ons", () => {
  const result = b.validateBookingRequest(goodBody());
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.emails, ["danny@example.com", "wife@example.com"]);
  assert.equal(b.priceFor(result.value.type, result.value.addonIds), 55000 + 17500);
});

test("bad requests are refused with a plain reason", () => {
  const refuse = (overrides, pattern) => {
    const result = b.validateBookingRequest(goodBody(overrides));
    assert.equal(result.ok, false);
    assert.match(result.error, pattern);
  };
  refuse({ typeId: 1 }, /inspection type/);
  refuse({ addonIds: [498304] }, /add-on/); // a Hampden termite add-on is not offered on this type
  refuse({ date: "2026-02-30" }, /date and time/);
  refuse({ time: "9am" }, /date and time/);
  refuse({ firstName: "" }, /First name/);
  refuse({ phone: "123" }, /phone/);
  refuse({ email: "nope" }, /email/);
  refuse({ email: "a@x.com,b@x.com,c@x.com,d@x.com,e@x.com" }, /no more than 4/);
  refuse({ realtorEmail: "bad" }, /Realtor/);
  refuse({ zip: "12" }, /full address/);
  refuse({ unit: "" }, /unit/);
  refuse({ style: "Castle" }, /style/);
  refuse({ basement: "Moat" }, /basement/);
  refuse({ utilities: "maybe" }, /utilities/);
});

test("the Realtor is optional", () => {
  const result = b.validateBookingRequest(goodBody({ realtorName: "", realtorEmail: "", realtorPhone: "" }));
  assert.equal(result.ok, true);
  assert.equal(result.value.realtorEmail, "");
});

test("contact-for-price inspections can still be booked", () => {
  const type = T3_TYPES.find((t) => t.id === 92803403);
  assert.equal(type.priceCents, 0);
  assert.equal(b.validateBookingRequest(goodBody({ typeId: 92803403, addonIds: [] })).ok, true);
});

const record = (overrides = {}) => ({
  id: "bk123", typeName: "Single family / Condo - Home Inspection (<2,400 sq.ft.)", addonNames: ["Radon Gas (Air)"], minutes: 120, priceCents: 72500,
  startMs: b.nyToMs("2026-11-11", "13:00"), firstName: "Danny", lastName: "Dickinson", phone: "413-572-5770", emails: ["danny@example.com", "wife@example.com"],
  realtorName: "Diana", realtorEmail: "diana@example.com", realtorPhone: "413-588-4114",
  street: "275 Dewey Ave", town: "Easthampton", zip: "01027", unit: "No", style: "2 Story", sqft: "1260", basement: "Basement", utilities: "yes", paymentStatus: "unpaid",
  ...overrides
});

test("booking emails: customer, Realtor and Ted, with the right addresses and no price for the Realtor", () => {
  const emails = b.t3BookingEmails(record(), FROM, "tok");
  assert.equal(emails.length, 3);
  const [customer, realtor, ted] = emails;
  assert.deepEqual(customer.to, ["danny@example.com", "wife@example.com"]);
  assert.equal(customer.reply_to, "T3Towne@gmail.com");
  assert.match(customer.text, /Wednesday, November 11, 2026 at 1:00 PM/);
  assert.match(customer.text, /\$725\.00/);
  assert.match(customer.text, /my-inspection\/\?b=bk123&t=tok/);
  assert.equal(customer.attachments[0].filename, "t3-inspection.ics");
  assert.deepEqual(realtor.to, ["diana@example.com"]);
  assert.doesNotMatch(realtor.text, /\$|my-inspection|Paid/);
  assert.deepEqual(ted.to, ["T3Towne@gmail.com"]);
  assert.equal(ted.reply_to, "danny@example.com");
  assert.match(ted.text, /Agent email: diana@example\.com/);
  assert.match(ted.text, /Utilities turned on: yes/);
});

test("no Realtor email means no Realtor copy", () => {
  assert.equal(b.t3BookingEmails(record({ realtorEmail: "" }), FROM, "tok").length, 2);
});

test("a contact-for-price booking tells Ted loudly", () => {
  const ted = b.t3BookingEmails(record({ priceCents: 0 }), FROM, "tok").pop();
  assert.match(ted.text, /CONTACT FOR PRICE/);
});

test("a customer cannot inject headers or Bcc through their name", () => {
  const ted = b.t3BookingEmails(record({ firstName: 'Eve"\r\nBcc: x@example.com <y>' }), FROM, "tok").pop();
  assert.doesNotMatch(ted.from, /[\r\n]/);
  assert.deepEqual(ted.to, ["T3Towne@gmail.com"]);
  assert.equal(Object.keys(ted).includes("bcc"), false);
});

test("the calendar file is valid and uses UTC times", () => {
  const ics = b.t3Ics(record());
  assert.match(ics, /^BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART:20261111T180000Z/); // 1:00 PM EST
  assert.match(ics, /DTEND:20261111T200000Z/);
  assert.match(ics, /LOCATION:275 Dewey Ave\\, Easthampton MA 01027/);
});

test("cancel and reschedule emails reach the customer and Ted", () => {
  const cancelled = b.t3ChangeEmails("cancelled", record({ paymentStatus: "paid" }), FROM, "tok");
  assert.match(cancelled[0].subject, /cancelled/);
  assert.match(cancelled[1].text, /refund may be needed/);
  const moved = b.t3ChangeEmails("rescheduled", record(), FROM, "tok", b.nyToMs("2026-11-10", "09:00"));
  assert.match(moved[0].subject, /moved to/);
  assert.match(moved[1].text, /Was: Tuesday, November 10, 2026 at 9:00 AM/);
});

test("the reminder goes to the customer and the Realtor", () => {
  const email = b.t3ReminderEmail(record(), FROM, "tok");
  assert.deepEqual(email.to, ["danny@example.com", "wife@example.com", "diana@example.com"]);
  assert.match(email.text, /call Ted/);
});
