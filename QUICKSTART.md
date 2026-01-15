# Quick Start Guide - Fennington Business Sites

## ✅ What We Just Created

You now have a **professional business website template system** that makes it super easy to create new business sites!

### Current Sites:
1. **Landscaping** - `/landscaping/` (Green theme)
2. **Snow Removal** - `/snow-removal/` (Blue/Ice theme) 
3. **Electrical** - `/electrical/` (Yellow/Amber theme)

### Base Template:
- **Location**: `/templates/base/`
- This is your master template for creating new businesses

## 🚀 How to Create New Sites

### The Easy Way:
Just tell me:
> "Create a new [BUSINESS TYPE] site from the template"

Examples:
- "Create a new HVAC site from the template"
- "Create a new Plumbing site from the template"
- "Create a new Roofing site from the template"

I'll automatically:
✅ Copy the base template
✅ Customize all business info
✅ Add industry-specific services
✅ Create relevant FAQs
✅ Set appropriate brand colors

### The Manual Way (If You Want to Do It Yourself):

1. **Copy the template**
   ```
   Copy /templates/base/ → /your-business-name/
   ```

2. **Edit script.js** (only file you need to change!)
   - Update the `CONFIG` object at the top
   - Change business name, services, FAQs
   - That's it!

3. **Optional: Edit styles.css**
   - Change colors in the `:root` section if desired

## 📋 All Sites Use Same Contact Info

- **Phone**: (720) 555-0123
- **Address**: 1234 Main Street, Denver, CO 80202
- **Service Area**: Denver metro
- **Name Format**: "Fennington [Business]"

## 🎨 Suggested Color Schemes

| Business | Primary Color | Example |
|----------|---------------|---------|
| Landscaping | Green `#2d5016` | Already created ✓ |
| Snow Removal | Blue `#1e3a8a` | Already created ✓ |
| Electrical | Amber `#d97706` | Already created ✓ |
| HVAC | Red/Orange `#dc2626` | Ready to create |
| Plumbing | Blue `#0284c7` | Ready to create |
| Roofing | Gray/Red `#374151` | Ready to create |
| Painting | Purple `#7c3aed` | Ready to create |

## 📁 Folder Structure

```
fennington-landing/
├── templates/
│   └── base/              ← Master template (don't edit directly)
│       ├── index.html
│       ├── styles.css
│       ├── script.js
│       └── README.md
├── landscaping/           ← Live business site
├── snow-removal/          ← Live business site
├── electrical/            ← Live business site
└── BUSINESSES.md          ← Reference guide
```

## 🔥 What Makes This Special

1. **Single Config** - Just edit one CONFIG object in script.js
2. **Auto-Population** - Services, FAQs, contact info all load automatically
3. **Consistent Design** - All sites look professional and cohesive
4. **Easy to Scale** - Create unlimited businesses using the same template
5. **No Code Required** - Just copy and edit the config!

## 📝 Example: Creating HVAC Site

**Just say**: "Create a new HVAC site from the template"

Or manually:
1. Copy `/templates/base/` to `/hvac/`
2. Edit `/hvac/script.js`:
   ```javascript
   const CONFIG = {
     businessName: "Fennington HVAC",
     nicheName: "HVAC",
     phone: "(720) 555-0123",
     email: "info@fenningtonhvac.com",
     heroHeadline: "Expert Heating & Cooling Services",
     services: [
       { icon: "❄️", title: "AC Repair", description: "..." },
       { icon: "🔥", title: "Heating Services", description: "..." }
     ]
     // ... etc
   }
   ```
3. Done!

## ❓ Need Help?

See detailed instructions in:
- `/templates/base/README.md` - Template documentation
- `/BUSINESSES.md` - Business reference guide

## 🎯 Next Time You Need a New Site

Just say: **"Make a new [BUSINESS] website from the template"**

That's it! I'll handle everything else automatically.
