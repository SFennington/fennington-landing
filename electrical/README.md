# Fennington Business Template

This is the **master template** for all Fennington local service business websites.

## Quick Start: Create a New Business Site

1. **Copy this folder** to create a new business (e.g., `snow-removal/`, `electrical/`, etc.)
2. **Edit `script.js`** - Update the CONFIG object at the top:
   - Change `businessName`, `nicheName`, `city`, `phone`, `email`
   - Update `heroHeadline` and `heroSubtitle`
   - Customize `services` array with business-specific services
   - Customize `faqs` array with business-specific questions
3. **Optional: Edit `styles.css`** - Change brand colors in the `:root` section if desired
4. **That's it!** Open `index.html` to view your new business site

## Structure

```
base/
├── index.html    # Template HTML (placeholders auto-filled by JS)
├── styles.css    # Complete styles (change colors at top)
├── script.js     # Business logic - EDIT CONFIG HERE
└── README.md     # This file
```

## Features

- ✅ Fully responsive design
- ✅ Sticky header with mobile menu
- ✅ Hero section with CTAs
- ✅ Services grid (auto-populated)
- ✅ FAQ accordion (auto-populated)
- ✅ Contact form
- ✅ SEO-optimized with schema markup
- ✅ Trust badges and testimonials
- ✅ Service area section

## Standard Business Info

All Fennington businesses use:
- **Phone**: (720) 555-0123
- **Address**: 1234 Main Street, Denver, CO 80202
- **Hours**: Mon-Fri 8-5, Sat by appointment
- **Service Area**: Denver metro area

## Color Customization

Edit the `:root` CSS variables in `styles.css`:

```css
:root {
  --brand: #2d5016;        /* Primary brand color */
  --brand-dark: #1a3009;   /* Darker shade for hover */
  --accent: #7cb342;       /* Accent color (stars, icons) */
}
```

### Suggested Color Schemes by Industry:

- **Landscaping**: Green (`#2d5016` / `#7cb342`)
- **Snow Removal**: Blue/Ice (`#1e3a8a` / `#60a5fa`)
- **Electrical**: Yellow/Black (`#f59e0b` / `#fbbf24`)
- **HVAC**: Orange/Red (`#dc2626` / `#f97316`)
- **Plumbing**: Blue (`#0284c7` / `#38bdf8`)
- **Roofing**: Dark Gray/Red (`#374151` / `#ef4444`)

## Next Time You Need a New Site

Just say: **"Create a new [BUSINESS TYPE] site from the template"**

I'll automatically:
1. Copy the base template
2. Update all the business-specific info
3. Customize services and FAQs
4. Set appropriate brand colors
