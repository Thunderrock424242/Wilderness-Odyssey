# Minecraft Modpack Website

A fully configurable website for your Minecraft modpack with home page, gallery, and community-editable wiki.

## 🚀 Quick Start

1. **Edit `config.json`** - This controls ALL content on your website
2. **Add your screenshots** to the `images/` folder
3. **Set up your GitHub wiki repository** (instructions below)
4. **Deploy** to GitHub Pages, Netlify, or any static host

## 📝 Configuration Guide

Everything is controlled through `config.json`. No code editing required!

### Basic Information

```json
"modpack": {
    "name": "Your Modpack Name",
    "tagline": "An Epic Adventure Awaits",
    "description": "Your modpack description here...",
    "version": "1.0.0",
    "minecraftVersion": "1.20.1"
}
```

### Links

```json
"links": {
    "curseforge": "https://www.curseforge.com/minecraft/modpacks/your-modpack",
    "discord": "https://discord.gg/your-invite",
    "github": "yourusername/modpack-wiki"
}
```

### Features

Add or remove features as needed:

```json
"features": [
    {
        "title": "Epic Exploration",
        "description": "Discover dozens of new biomes...",
        "icon": "🗺️"
    }
]
```

Icons can be any emoji! 🎮⚔️🏰🌍🔥💎⭐

### Gallery Images

```json
"gallery": {
    "images": [
        {
            "url": "images/screenshot1.png",
            "title": "Exploring New Dimensions",
            "description": "Venture into mysterious new worlds"
        }
    ]
}
```

### Wiki Categories

```json
"wiki": {
    "githubRepo": "yourusername/modpack-wiki",
    "branch": "main",
    "categories": [
        "Getting Started",
        "Mods List",
        "Progression Guide"
    ]
}
```

### Theme Colors

Customize the color scheme:

```json
"theme": {
    "primaryColor": "#d97706",
    "secondaryColor": "#92400e",
    "accentColor": "#fbbf24",
    "backgroundColor": "#1c1917",
    "textColor": "#fafaf9"
}
```

## 🖼️ Adding Screenshots

1. Create an `images/` folder in your website directory
2. Add your screenshots (PNG or JPG recommended)
3. Update `config.json` with the image paths:

```json
"gallery": {
    "images": [
        {
            "url": "images/my-screenshot.png",
            "title": "Amazing Build",
            "description": "Check out this structure"
        }
    ]
}
```

## 📚 Setting Up the Community Wiki

The wiki lives in a separate GitHub repository that anyone can contribute to via pull requests.

### Step 1: Create Wiki Repository

1. Go to GitHub and create a new repository (e.g., `yourname/modpack-wiki`)
2. Initialize it with a README
3. Create a `wiki/` folder

### Step 2: Create Wiki Pages

Create markdown files in the `wiki/` folder:

```
modpack-wiki/
├── README.md
└── wiki/
    ├── getting-started.md
    ├── mods-list.md
    ├── progression-guide.md
    ├── dimensions.md
    ├── bosses.md
    └── faq.md
```

### Step 3: Wiki Template

Here's a template for wiki pages:

```markdown
# Getting Started

Welcome to the modpack! This guide will help you begin your adventure.

## Installation

1. Download the modpack from [CurseForge](your-link-here)
2. Install using your preferred launcher
3. Allocate at least 6GB of RAM

## First Steps

- Spawn in and gather basic resources
- Follow the quest book
- Explore nearby areas

## Tips for Beginners

- Start with basic tools
- Join our Discord for help
- Check the progression guide
```

### Step 4: Enable Community Contributions

1. In your repo settings, enable "Issues" and "Pull Requests"
2. Add a `CONTRIBUTING.md` file with guidelines
3. Users can now fork, edit, and submit improvements!

### Step 5: Update Your Website

Update `config.json`:

```json
"links": {
    "github": "yourusername/modpack-wiki"
},
"wiki": {
    "githubRepo": "yourusername/modpack-wiki",
    "branch": "main",
    "categories": [
        "Getting Started",
        "Mods List",
        "Progression Guide",
        "Dimensions",
        "Bosses",
        "FAQ"
    ]
}
```

The category names should match your markdown filenames (converted to lowercase with hyphens).

## 🌐 Deployment Options

### GitHub Pages (Free & Easy)

1. Create a GitHub repository for your website
2. Push these files to the repository
3. Go to Settings → Pages
4. Select "Deploy from branch" → main → root
5. Your site will be live at `https://yourusername.github.io/repo-name`

### Netlify (Free & Automatic)

1. Sign up at [Netlify](https://netlify.com)
2. Drag and drop your website folder
3. Done! You get a custom URL instantly
4. Optional: Connect your GitHub repo for automatic updates

### Vercel (Free & Fast)

1. Sign up at [Vercel](https://vercel.com)
2. Import your GitHub repository
3. Deploy with one click

## 📁 File Structure

```
your-website/
├── index.html          # Main HTML (don't edit unless needed)
├── styles.css          # Styling (customize if desired)
├── script.js           # JavaScript (handles config loading)
├── config.json         # ⭐ EDIT THIS to configure everything
├── images/             # Your screenshots go here
│   ├── screenshot1.png
│   ├── screenshot2.png
│   └── ...
└── README.md           # This file
```

## 🎨 Customization Tips

### Change the Font

In `index.html`, find the Google Fonts link and replace with your preferred fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=YourFont:wght@400;700&display=swap" rel="stylesheet">
```

Then update in `styles.css`:

```css
body {
    font-family: 'YourFont', sans-serif;
}
```

### Add More Sections

You can add custom sections by editing `index.html` and `styles.css`. Follow the existing pattern.

### Animations

The site includes smooth animations and transitions. These are defined in `styles.css` if you want to adjust them.

## 🔧 Troubleshooting

### Images not showing?

- Make sure the image paths in `config.json` match your actual file locations
- Use relative paths like `images/screenshot.png`
- Check file names are spelled correctly (case-sensitive!)

### Config changes not appearing?

- Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
- Clear browser cache
- Make sure `config.json` is valid JSON (use a JSON validator)

### Links not working?

- Double-check URLs in `config.json`
- Make sure URLs include `https://`
- For GitHub repos, use format: `username/repository-name`

## 📜 License

This template is free to use for your modpack website. Customize it however you like!

## 🤝 Contributing to This Template

Found a bug or want to improve this template? Feel free to submit issues or pull requests!

---

Made with ❤️ for the Minecraft modding community
