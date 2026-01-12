# GoHighLevel Recreation Map

## How to Recreate Each Section in GHL

### SECTION 1: Header (Sticky)
- **GHL:** Section → Row → 3 Columns
- Col 1: Text element (business name logo)
- Col 2: Nav menu widget or button group
- Col 3: Button + phone number text
- Settings: Enable sticky header, white background

### SECTION 2: Hero
- **GHL:** Section (full-width, gradient background)
- Row → 1 Column (centered)
- Elements: Heading (H1), Subheadline text, 2 Buttons (primary/secondary)
- Add custom row below for trust badges → 3 columns with icon + text in each

### SECTION 3: Services
- **GHL:** Section (light gray background)
- Row → Heading + subtitle (centered)
- Row → Multi-column layout (3-4 columns, repeat 2-3 times for 6-9 cards)
- Each column: Icon (emoji or image), Heading (H3), Paragraph
- Card styling: White background, border radius, subtle shadow

### SECTION 4: Why Choose Us + Process
- **GHL:** Section (white background)
- Row → 2 Columns
- Left column: Heading + List widget with checkmark icons
- Right column: Heading + 3 rows (numbered circles + text)

### SECTION 5: Testimonials
- **GHL:** Section (light background)
- Row → Heading + star rating image (centered)
- Row → 3 Columns
- Each column: Star icons, quote text, author name/location
- Card styling: White background, padding

### SECTION 6: Service Area
- **GHL:** Section (white background)
- Row → Heading + subtitle (centered)
- Row → Multi-column grid with city names (3-4 cols, multiple rows)
- Each city in a pill-style button or text block

### SECTION 7: FAQ
- **GHL:** Section (light background)
- Row → Heading (centered)
- Use GHL Accordion widget OR
- Multiple rows with toggle/collapse elements
- Each FAQ: Bold question + hidden answer

### SECTION 8: Contact
- **GHL:** Section (white background)
- Row → Heading (centered)
- Row → 2 Columns
- Left column: Icon + contact info blocks (phone, email, address, hours)
- Right column: GHL Form widget with fields: name, phone, email, dropdown, textarea, submit button

### SECTION 9: Footer
- **GHL:** Section (dark background)
- Row → Nav links (centered, horizontal)
- Row → Copyright text + disclaimer
- Text color: White or light gray

## Key GHL Settings to Match
- **Container max-width:** 1100px
- **Section padding:** 80px top/bottom (60px on mobile)
- **Border radius:** 8px
- **Primary color:** #2563eb (blue)
- **Accent color:** #f59e0b (amber)
- **Fonts:** System default (Arial, sans-serif)
- **Mobile breakpoint:** Stack columns at 768px

## Quick Niche Swap Checklist
1. Update CONFIG object in script.js
2. Update meta title/description in HTML
3. Update JSON-LD schema data
4. Replace service icons/descriptions
5. Update FAQ questions/answers
6. Change city names in service area
7. Update testimonials
8. Adjust color variables in CSS if needed

## Form Integration
- Update form action URL in HTML
- Or use GHL native form and map fields
- Enable email notifications in GHL
- Set up lead pipeline automation