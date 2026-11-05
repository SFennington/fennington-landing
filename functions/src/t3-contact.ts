// Contact form on Ted Towne's T3 Inspections site (demo/t3-inspections). Each message
// goes to Ted's own inbox, with Reply-To set to the visitor so he can answer from Gmail.
export const T3_CONTACT_EMAIL = "T3Towne@gmail.com";

export type T3ContactMessage = {
  name: string;
  email: string;
  phone: string;
  address: string;
  message: string;
  pageUrl: string;
};

export function t3ContactEmail(contact: T3ContactMessage, fromEmail: string) {
  const fromAddress = /<([^<>]+)>/.exec(fromEmail)?.[1] || fromEmail;
  const senderName = contact.name.replace(/["<>\\\r\n]/g, "").slice(0, 60);
  const details: Array<[string, string]> = [
    ["Name", contact.name],
    ["Email", contact.email],
    ["Phone", contact.phone],
    ["Property address", contact.address],
    ["Sent from", contact.pageUrl]
  ];
  return {
    from: `${senderName || "Website visitor"} via T3 Inspections website <${fromAddress}>`,
    to: [T3_CONTACT_EMAIL],
    reply_to: contact.email,
    subject: `Website message from ${senderName || contact.email}`,
    text: `${contact.message || "(No message, see details below.)"}\n\n${details.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join("\n")}`
  };
}
