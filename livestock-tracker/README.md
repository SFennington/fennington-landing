# Livestock Tracker Landing Page

Landing page for the Livestock Tracker mobile app at fennington.com/livestock-tracker

## Features

- **App Overview**: Highlights key features of the Livestock Tracker app
- **Download Links**: App Store and Google Play Store buttons (to be updated with actual URLs)
- **Tutorials**: Video tutorial placeholders for user onboarding
- **FAQ Section**: Comprehensive answers to common questions
- **Privacy Policy**: Detailed privacy information emphasizing offline-first, no-tracking approach
- **Contact Form**: Multiple contact methods for support, bugs, and feedback

## Sections

1. **Hero**: Eye-catching introduction with download CTAs
2. **Features**: 9 key features with icons and descriptions
3. **Screenshots**: App interface preview carousel
4. **Tutorials**: 6 video tutorial cards
5. **Download**: Prominent app store buttons
6. **FAQ**: 10 frequently asked questions with accordion UI
7. **Privacy**: Complete privacy policy
8. **Contact**: Support emails and contact form
9. **Footer**: Quick links and additional information

## Setup

Simply open `index.html` in a browser. No build process required—pure HTML, CSS, and vanilla JavaScript.

## Customization

### Update Store URLs

When app store links are available, update in `script.js`:

```javascript
// Replace the alert() calls in initStoreButtons() with:
if (appStoreBtn) {
  appStoreBtn.href = 'https://apps.apple.com/...';
}

if (playStoreBtn) {
  playStoreBtn.href = 'https://play.google.com/...';
}
```

### Update Contact Emails

Replace placeholder emails in HTML:
- `support@fennington.com`
- `bugs@fennington.com`
- `feedback@fennington.com`
- `privacy@fennington.com`

### Add Tutorial Videos

When tutorial videos are ready, replace the thumbnail placeholders with embedded YouTube/Vimeo players or link to video URLs.

### Add Screenshots

Replace `.screenshot-placeholder` divs with actual app screenshots in the Screenshots section.

## Brand Colors

```css
--brand: #2d5016 (dark green)
--brand-dark: #1a3009 (darker green)
--accent: #7cb342 (light green)
```

## Mobile Responsive

Fully responsive design with breakpoints at:
- 768px (tablet)
- 480px (mobile)

## Browser Support

Works in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Deployment

Upload the `livestock-tracker` folder to your web server at `fennington.com/livestock-tracker/`

Access at: `https://fennington.com/livestock-tracker/`

## TODO

- [ ] Add actual App Store URL
- [ ] Add actual Play Store URL  
- [ ] Create and embed tutorial videos
- [ ] Add real app screenshots
- [ ] Set up contact form backend (currently shows alert)
- [ ] Add analytics tracking (Google Analytics, etc.)
- [ ] Create favicon and app icon
