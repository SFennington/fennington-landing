// Draft copy for the business's own Meta ads, one per service. Ad Studio normally
// drafts this copy automatically; it was unavailable for this round, so it is
// written by hand here. Hand each entry to parseAdConcept (meta-ads.ts) once a
// creative image is attached, then POST to /digital-products/fennington-solutions/meta/upload-ads.

export type AdConceptDraft = {
  trackingCode: string;
  service: string;
  cta: string;
  angle: string;
  headline: string;
  primaryText: string;
  description: string;
};

export const FENNINGTON_SOLUTIONS_AD_CONCEPTS: AdConceptDraft[] = [
  {
    trackingCode: "FS-A1",
    service: "review",
    cta: "Get Offer",
    angle: "Free website review",
    headline: "Is Your Website Losing You Customers?",
    primaryText:
      "Send us your website and we'll reply with a free, no-obligation review: what's working, what's costing you calls and leads, and exactly what to fix first. No sales pitch, just practical feedback from Fennington Solutions.",
    description: "Free website review, no obligation"
  },
  {
    trackingCode: "FS-A2",
    service: "websites",
    cta: "Get Quote",
    angle: "Websites & landing pages",
    headline: "A Website That Brings In Calls and Bookings",
    primaryText:
      "Fennington Solutions builds fast, mobile-friendly websites with lead forms and online booking built in, so visitors turn into customers. Free consultation and a written quote before any work starts.",
    description: "Websites built to bring in business"
  },
  {
    trackingCode: "FS-A3",
    service: "automation",
    cta: "Contact Us",
    angle: "Business automation",
    headline: "Stop Doing the Same Task Twice",
    primaryText:
      "Fennington Solutions connects the tools you already use, so follow-ups, orders, invoices and records move along on their own. Get hours back every week. Free consultation and a written quote before any work starts.",
    description: "Business automation that saves you hours"
  }
];
