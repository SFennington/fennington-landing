// Inspection types and add-ons, copied from Ted Towne's Acuity account on 2026-11-04 so the ids,
// names and prices match what customers saw there. Ted can change prices and durations from
// his dashboard later (t3Config/booking overrides these defaults).
// priceCents 0 means "contact for price": it can be booked, and Ted sets the price afterwards.
export type T3InspectionType = { id: number; category: string; name: string; minutes: number; priceCents: number; addonIds: number[] };
export type T3Addon = { id: number; name: string; priceCents: number };

export const T3_TYPES: T3InspectionType[] = [
  {
    "id": 218559,
    "category": "1. Single Family/ Condo",
    "name": "Single family / Condo - Home Inspection (<2,400 sq.ft.)",
    "minutes": 120,
    "priceCents": 55000,
    "addonIds": [
      3626375,
      403827,
      57180,
      15826,
      6246186,
      498308,
      428439,
      428428
    ]
  },
  {
    "id": 218562,
    "category": "1. Single Family/ Condo",
    "name": "Single family / Condo - Home Inspection (2,400 sq.ft - 3,400 sq.ft) Please add extra time",
    "minutes": 150,
    "priceCents": 65000,
    "addonIds": [
      3626375,
      403827,
      57180,
      15826,
      6246186,
      498308,
      6967787,
      498304,
      428428
    ]
  },
  {
    "id": 374685,
    "category": "1. Single Family/ Condo",
    "name": "Single Family - Home Inspection (3,401-4,500 sq. ft.)",
    "minutes": 180,
    "priceCents": 75000,
    "addonIds": [
      3626375,
      403827,
      57180,
      15826,
      6246186,
      498308,
      6967787,
      498304,
      498309
    ]
  },
  {
    "id": 92803403,
    "category": "1. Single Family/ Condo",
    "name": "Single Family - Home Inspection (>4,500 sq. ft.) Please contact me for pricing",
    "minutes": 180,
    "priceCents": 0,
    "addonIds": []
  },
  {
    "id": 21911278,
    "category": "2. Multi-family",
    "name": "Multi-family (2 Units < 2,400 sq. ft.)- Home Inspection - Please contact me for pricing",
    "minutes": 180,
    "priceCents": 60000,
    "addonIds": [
      3626375,
      403827,
      57180,
      15826,
      6246186,
      498308,
      428439,
      428428
    ]
  },
  {
    "id": 374687,
    "category": "2. Multi-family",
    "name": "Multi-family (2 Units 2,400-3,400 sq. ft.) Please allow extra time",
    "minutes": 180,
    "priceCents": 70000,
    "addonIds": [
      3626375,
      403827,
      57180,
      15826,
      6246186,
      498308,
      6967787,
      428428
    ]
  },
  {
    "id": 31746069,
    "category": "2. Multi-family",
    "name": "Multi-family (2 Units >3,400 sq. ft.) Please allow extra time",
    "minutes": 180,
    "priceCents": 80000,
    "addonIds": [
      3626375,
      403827,
      57180,
      15826,
      6246186,
      498308,
      6967787,
      498304,
      498309
    ]
  },
  {
    "id": 21911365,
    "category": "2. Multi-family",
    "name": "Multi-family (3 Units) Please allow extra time",
    "minutes": 180,
    "priceCents": 70000,
    "addonIds": [
      3626375,
      403827,
      57180,
      15826,
      6246186,
      498308,
      6967787,
      498304,
      498309
    ]
  },
  {
    "id": 21911509,
    "category": "2. Multi-family",
    "name": "Multi-family (4 Units) Please allow extra time",
    "minutes": 180,
    "priceCents": 80000,
    "addonIds": [
      3626375,
      403827,
      57180,
      15826,
      6246186,
      498308,
      6967787,
      498304,
      498309
    ]
  },
  {
    "id": 21911529,
    "category": "2. Multi-family",
    "name": "Multi-family (5+ Units) Contact for price. Please allow extra time",
    "minutes": 180,
    "priceCents": 0,
    "addonIds": [
      3626375,
      403827,
      57180,
      15826,
      6246186,
      498308,
      6967787,
      498309
    ]
  }
];

export const T3_ADDONS: T3Addon[] = [
  {
    "id": 3626375,
    "name": "Basic Water Quality Test (Client Specified Belchertown Area - Quabbin Analytical Lab)",
    "priceCents": 25000
  },
  {
    "id": 403827,
    "name": "Basic Water Quality Test (Inspector Preferred - Envirotech Labs)",
    "priceCents": 17500
  },
  {
    "id": 57180,
    "name": "Radon (Water) - Test (Recommended for Well water supply)",
    "priceCents": 6500
  },
  {
    "id": 15826,
    "name": "Radon Gas (Air) - Digital Continuous Monitor Test [Note: Will need access 72 hrs before or 48 hours after inspection to set/pickup test]",
    "priceCents": 17500
  },
  {
    "id": 6246186,
    "name": "Sewer Inspection (Internal condition)",
    "priceCents": 27500
  },
  {
    "id": 498308,
    "name": "Termite Inspection (Franklin County)",
    "priceCents": 20000
  },
  {
    "id": 6967787,
    "name": "Termite Inspection (Franklin County) - Large",
    "priceCents": 25000
  },
  {
    "id": 498304,
    "name": "Termite Inspection (Hampden County - Spfd area - Large)",
    "priceCents": 15000
  },
  {
    "id": 428439,
    "name": "Termite Inspection (Hampden County - Spfd area)",
    "priceCents": 10000
  },
  {
    "id": 428428,
    "name": "Termite Inspection (Hampshire County - Easthampton/Hadley area)",
    "priceCents": 15000
  },
  {
    "id": 498309,
    "name": "Termite Inspection (Hampshire County - Large)",
    "priceCents": 20000
  }
];
