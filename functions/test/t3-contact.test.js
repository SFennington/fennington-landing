// Runs against the compiled output: `npm test` builds first.
const test = require("node:test");
const assert = require("node:assert/strict");
const { t3ContactEmail } = require("../lib/t3-contact.js");

const FROM = "Fennington <noreply@fennington.com>";
const contact = (overrides = {}) => ({
  name: "Pat Buyer",
  email: "pat@example.com",
  phone: "413-555-0100",
  address: "1 Main St, Easthampton",
  message: "Quote for a 3 bed ranch?",
  pageUrl: "https://t3inspections.com/contact-us/",
  ...overrides
});

test("goes to Ted's Gmail and replies go to the visitor", () => {
  const email = t3ContactEmail(contact(), FROM);
  assert.deepEqual(email.to, ["T3Towne@gmail.com"]);
  assert.equal(email.reply_to, "pat@example.com");
  assert.equal(email.from, "Pat Buyer via T3 Inspections website <noreply@fennington.com>");
  assert.equal(email.subject, "Website message from Pat Buyer");
});

test("includes everything the visitor filled in", () => {
  const { text } = t3ContactEmail(contact(), FROM);
  for (const part of ["Quote for a 3 bed ranch?", "Phone: 413-555-0100", "Property address: 1 Main St, Easthampton", "Email: pat@example.com"]) {
    assert.ok(text.includes(part), part);
  }
});

test("works when only an email was given, since that is the only required field", () => {
  const email = t3ContactEmail(contact({ name: "", phone: "", address: "", message: "" }), "noreply@fennington.com");
  assert.equal(email.from, "Website visitor via T3 Inspections website <noreply@fennington.com>");
  assert.equal(email.subject, "Website message from pat@example.com");
  assert.ok(email.text.startsWith("(No message, see details below.)"));
  assert.ok(!email.text.includes("Phone:"));
});

test("a name cannot break out of the email headers", () => {
  const email = t3ContactEmail(contact({ name: 'Eve"\r\nBcc: x@example.com <y>' }), FROM);
  assert.ok(!/[\r\n"<>]/.test(email.subject));
  assert.ok(!/[\r\n"]/.test(email.from));
  assert.deepEqual(email.to, ["T3Towne@gmail.com"]);
});
