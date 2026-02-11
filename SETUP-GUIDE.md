# 🚀 Quick Setup Guide

Get your modpack website up and running in minutes!

## What You Got

✅ **Fully functional website** with home, gallery, and wiki sections  
✅ **100% configurable** through `config.json`  
✅ **Community wiki system** with example pages and templates  
✅ **Modern, responsive design** with smooth animations  
✅ **Ready to deploy** to any static hosting platform

## 📦 Files Overview

### Website Files (Main Directory)
- `index.html` - The website (usually don't need to edit)
- `styles.css` - Styling (customize if you want)
- `script.js` - Functionality (handles config loading)
- **`config.json`** ⭐ **EDIT THIS FILE** to customize everything
- `README.md` - Detailed documentation
- `images/` - Put your screenshots here

### Wiki Files (`wiki-example/` folder)
- `README.md` - Wiki repository readme
- `CONTRIBUTING.md` - Contribution guidelines
- `wiki/` folder with example pages:
  - `getting-started.md`
  - `mods-list.md`
  - `progression-guide.md`
  - `dimensions.md`
  - `bosses.md`
  - `faq.md`

## ⚡ 5-Minute Setup

### Step 1: Configure Your Website

Edit `config.json`:

```json
{
  "modpack": {
    "name": "YOUR MODPACK NAME HERE",
    "tagline": "Your tagline here",
    "description": "Your description...",
    "version": "1.0.0",
    "minecraftVersion": "1.20.1"
  },
  "links": {
    "curseforge": "https://www.curseforge.com/minecraft/modpacks/YOUR-PACK",
    "discord": "https://discord.gg/YOUR-INVITE",
    "github": "yourusername/modpack-wiki"
  }
}
```

### Step 2: Add Screenshots (Optional Now, Required Later)

1. Place images in `images/` folder
2. Update the `gallery` section in `config.json`:

```json
"gallery": {
    "images": [
        {
            "url": "images/screenshot1.png",
            "title": "Amazing Build",
            "description": "Check this out!"
        }
    ]
}
```

### Step 3: Deploy Your Website

**Option A: GitHub Pages (Recommended)**

1. Create GitHub account if you don't have one
2. Create new repository (e.g., `yourname/modpack-website`)
3. Upload all website files (index.html, config.json, etc.)
4. Go to Settings → Pages → Enable GitHub Pages
5. Done! Your site is at `https://yourname.github.io/modpack-website`

**Option B: Netlify**

1. Go to [netlify.com](https://netlify.com)
2. Drag and drop your website folder
3. Done! You get instant URL

### Step 4: Set Up Wiki Repository

1. Create another GitHub repo (e.g., `yourname/modpack-wiki`)
2. Upload the contents of `wiki-example/` folder
3. Customize the wiki pages with your actual content
4. Update `config.json` with your repo name:

```json
"links": {
    "github": "yourname/modpack-wiki"
}
```

## 🎨 Customization Options

### Change Colors

In `config.json`, edit the `theme` section:

```json
"theme": {
    "primaryColor": "#d97706",
    "secondaryColor": "#92400e",
    "accentColor": "#fbbf24"
}
```

Use a color picker to find hex codes!

### Change Features

Add/remove/edit in `config.json`:

```json
"features": [
    {
        "title": "Your Feature",
        "description": "Description here",
        "icon": "🎮"
    }
]
```

Use any emoji as icons!

### Change Wiki Categories

```json
"wiki": {
    "categories": [
        "Getting Started",
        "Your Custom Category",
        "Another Category"
    ]
}
```

## 📝 Wiki Customization

### Edit Wiki Pages

1. Go to your wiki repository
2. Edit files in the `wiki/` folder
3. Replace template content with your actual info
4. Commit changes

### Add New Wiki Pages

1. Create new `.md` file in `wiki/` folder
2. Write content in Markdown format
3. Add to categories in `config.json`
4. Link from other pages

### Enable Community Contributions

1. Make sure repository is public
2. Enable Issues and Pull Requests in settings
3. Add `CONTRIBUTING.md` (already included!)
4. Share repository link with community

## 🔧 Common Tasks

### Update Modpack Name
→ Edit `config.json` → `modpack.name`

### Change CurseForge Link
→ Edit `config.json` → `links.curseforge`

### Add Discord Link
→ Edit `config.json` → `links.discord`

### Add More Screenshots
→ Put images in `images/` → Update `config.json` → `gallery.images`

### Change Website Colors
→ Edit `config.json` → `theme`

### Update Wiki Content
→ Edit files in your wiki repository

## 🆘 Troubleshooting

**Website looks broken?**
- Make sure all files are in same folder
- Check `config.json` for syntax errors (use JSON validator)
- Hard refresh browser (Ctrl+Shift+R)

**Images not showing?**
- Check file paths in `config.json`
- Make sure images are in `images/` folder
- Check file names match exactly (case-sensitive!)

**Wiki links not working?**
- Update GitHub repo name in `config.json`
- Make sure wiki files exist in repository
- Check category names match file names

**Changes not appearing?**
- Clear browser cache
- Wait a few minutes for GitHub Pages to update
- Check for JavaScript errors (F12 → Console)

## 📚 Next Steps

1. ✅ Customize `config.json` with your info
2. ✅ Add your screenshots
3. ✅ Deploy website to GitHub Pages/Netlify
4. ✅ Set up wiki repository
5. ✅ Customize wiki pages
6. ✅ Share with your community!

## 💡 Pro Tips

- Start with basics, add features later
- Take screenshots in high quality
- Keep wiki organized and updated
- Enable community contributions
- Share on Discord/Reddit
- Add link to CurseForge page

## 🎯 Ready to Launch?

Checklist before going live:

- [ ] `config.json` has your actual modpack info
- [ ] CurseForge link is correct
- [ ] At least 4-6 screenshots added
- [ ] Wiki repository created
- [ ] Wiki pages customized
- [ ] Website deployed and accessible
- [ ] Discord/social links work
- [ ] Tested on mobile

## 🤝 Need Help?

- Read the detailed `README.md`
- Check examples in `wiki-example/`
- Look at `config.json` comments
- Test locally before deploying

---

**You're all set!** Your modpack deserves an awesome website. Go make it happen! 🚀
