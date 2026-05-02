# 🎯 Quick Setup Guide

## Installation in Chrome

### Step 1: Open Developer Mode
1. Open **Google Chrome**
2. Go to `chrome://extensions/`
3. Toggle **"Developer mode"** (top-right corner)

### Step 2: Load the Extension
1. Click **"Load unpacked"**
2. Navigate to your project folder: `D:\Naukari-Bot`
3. Click **"Select Folder"**
4. ✅ Extension is now installed!

### Step 3: Verify Installation
1. You should see "Naukri Auto-Fill Assistant" in the extensions list
2. The extension icon (🤖) should appear in your Chrome toolbar
3. Click the icon to open the popup

---

## First Time Usage

### Add a Test Q&A
1. Click extension icon → Go to **"➕ Add Custom"** tab
2. Enter a question: `"What is your expected CTC?"`
3. Select type: `"Short Answer"`
4. Enter answer: `"8 LPA"`
5. Click **"💾 Save Q&A"**

### Test Auto-Fill
1. Visit any job application on **naukri.com**
2. When a matching question appears, the extension will auto-fill it
3. You'll see a notification toast confirming it filled

### View Your Library
1. Click extension icon → **"📋 Q&A Library"** tab
2. See all your saved Q&As
3. Use search or filters to find specific ones
4. Click edit icon (✏️) to modify
5. Click delete icon (🗑️) to remove

---

## Settings Overview

### Auto Submit (Behavior Tab)
- ✅ **ON:** Extension will auto-click "Save" after filling all fields
- ❌ **OFF:** You manually click "Save"

### Show Notifications (Behavior Tab)
- ✅ **ON:** Brief toast appears when answers are auto-filled
- ❌ **OFF:** Silent operation, no notifications

---

## Backup & Restore

### Export Your Q&As
1. Click extension icon → **"📋 Q&A Library"** tab
2. Click **"📤 Export JSON"**
3. Copy the JSON code that appears
4. Save it in a text file on your computer

### Import Q&As
1. Click extension icon → **"⚙️ Settings"** tab
2. Paste your JSON into the text box
3. Click **"📥 Import & Merge"** (add to existing)
   - OR **"🔄 Import & Replace"** (overwrite all)

---

## Troubleshooting

### Extension not showing on Naukri pages
- Make sure you're on **naukri.com** (not google.com)
- Try refreshing the page (F5)
- Check that extension is enabled in `chrome://extensions/`

### Auto-fill not working
- Make sure Q&A is saved (check "Q&A Library" tab)
- Question text must match what's on the page (try editing the Q&A)
- Some custom form fields might not be supported

### Lost my Q&As
- If you exported a backup, you can import it back
- Otherwise, they're in Chrome storage and can be recovered
- Try opening DevTools → Application → Storage → Local Storage

### Extension crashes on a page
- Right-click extension → "Manage extension"
- Disable and re-enable it
- Try refreshing the page

---

## File Structure for Developers

```
Naukri-AutoFill/
├── manifest.json        # Extension config (permissions, icons, scripts)
├── background.js        # Lifecycle (install, update)
├── content.js           # Auto-fill logic
├── content.css          # Overlay styles
├── popup.html           # Extension popup UI
├── popup.js             # Popup logic & Q&A management
├── popup.css            # Popup styles
├── generate_icons.js    # Icon generator
├── icons/               # Icon files
└── README.md            # Full documentation
```

---

## Common Tasks

### Change the auto-fill behavior
Edit **content.js** → Look for the `TYPE` constants and question detection logic

### Add support for another job site
Edit **manifest.json** → Update `host_permissions`:
```json
"host_permissions": [
  "https://www.naukri.com/*",
  "https://www.linkedinin.com/*"  // Add new site
]
```

### Customize the popup appearance
Edit **popup.css** → Modify colors, fonts, layouts

### Add new settings
1. Add toggle in **popup.html** (Settings tab)
2. Add handler in **popup.js** (`bindEvents()`)
3. Add to `naukriSettings` in **background.js**

---

## Keyboard Shortcuts

Currently, the extension doesn't have custom keyboard shortcuts. You can add them:

1. In **manifest.json**, add:
```json
"commands": {
  "open-popup": {
    "suggested_key": "Ctrl+Shift+K",
    "description": "Open Naukri AutoFill popup"
  }
}
```

2. Handle in **background.js** with `chrome.commands.onCommand` listener

---

## Tips & Best Practices

✅ **Do's:**
- Keep your Q&A library organized with clear questions
- Export your Q&As regularly as backup
- Use descriptive answer text
- Test on different Naukri pages

❌ **Don'ts:**
- Don't modify manifest.json without understanding Chrome API
- Don't manually edit Chrome storage (use export/import instead)
- Don't add sensitive personal data in Q&As

---

## Performance Notes

- Extension uses minimal memory
- Q&A lookup is O(1) — instant matching
- No network requests (all local)
- Doesn't slow down Naukri.com pages

---

## Next Steps

1. ✅ Set up the extension
2. ✅ Add 5-10 common Q&As to your library
3. ✅ Start applying to jobs on Naukri
4. ✅ Extension learns and helps you save time!

---

**Questions?** Check README.md or email: aadilshaik.dtov@gmail.com

Happy applying! 🚀
