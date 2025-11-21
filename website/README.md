# Sigil Website

Modern, responsive static website for Sigil built with:
- **Tailwind CSS** - Utility-first CSS framework
- **Alpine.js** - Lightweight JavaScript framework
- **shadcn UI** inspired design - Clean, modern component design

## Features

- ✨ Modern, clean design
- 📱 Fully responsive (mobile, tablet, desktop)
- 🎨 Tailwind CSS with custom theme
- ⚡ Alpine.js for interactivity
- 🚀 Zero build step required
- 📦 CDN-based (no npm dependencies for the website)
- 🌙 Ready for dark mode expansion

## Structure

```
website/
├── index.html          # Main landing page
├── assets/            # Static assets
│   ├── css/          # Custom CSS (if needed)
│   └── js/           # Custom JS (if needed)
└── docs/             # Documentation pages (future)
```

## Local Development

Simply open `index.html` in a browser:

```bash
# Using Python
python -m http.server 8000 --directory website

# Using Node.js
npx serve website

# Using PHP
php -S localhost:8000 -t website
```

Then visit: http://localhost:8000

## Deployment

The website is automatically deployed to GitHub Pages when changes are pushed to the `main` or `master` branch.

### Manual Deployment

To manually trigger deployment:
1. Go to GitHub Actions
2. Select "Deploy Website to GitHub Pages"
3. Click "Run workflow"

## GitHub Pages Setup

1. Go to repository Settings
2. Navigate to Pages section
3. Source: GitHub Actions
4. The workflow will handle the rest!

## Customization

### Colors

Edit the Tailwind config in the `<script>` tag in `index.html`:

```javascript
tailwind.config = {
    theme: {
        extend: {
            colors: {
                primary: { /* Your colors */ },
                // ...
            }
        }
    }
}
```

### Content

All content is in `index.html`. Sections:
- Hero Section
- Features Section
- Stats Section
- Quick Start Section
- Footer

### Adding Pages

1. Create new HTML file in `website/`
2. Copy navigation from `index.html`
3. Link in navigation menu

## Technologies

- **Tailwind CSS v3** - Via CDN
- **Alpine.js v3** - Via CDN
- **Custom Theme** - shadcn UI inspired colors
- **No Build Step** - Pure static HTML

## Performance

- ✅ Fast load times
- ✅ CDN-based dependencies
- ✅ Minimal JavaScript
- ✅ Optimized for Core Web Vitals

## Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

Same as Sigil repository

## Contributing

To improve the website:
1. Edit `website/index.html`
2. Test locally
3. Submit PR

## Credits

- Design inspired by shadcn UI
- Built with Tailwind CSS
- Powered by Alpine.js
