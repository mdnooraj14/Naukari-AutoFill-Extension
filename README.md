# 🤖 Naukri Auto-Fill Assistant

A Chrome extension that intelligently auto-fills repetitive job application questions on **Naukri.com** to save time and improve productivity.

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [How It Works](#how-it-works)
4. [File Explanations](#file-explanations)
5. [Installation & Setup](#installation--setup)
6. [Features](#features)

---

## 🎯 Overview

**Purpose:** Automate job applications on Naukri.com by remembering answers to common questions and filling them in automatically.

**Key Benefits:**
- Save time filling repetitive questions
- Build a personal Q&A library
- Support for 4 question types (text, description, single-choice, multi-choice)
- Import/export Q&A data as JSON
- Settings for auto-submit and notifications

**Target Users:** Job seekers applying to multiple jobs on Naukri.com

---

## 📁 Project Structure

```
Naukri-AutoFill/
├── manifest.json          # Extension configuration & permissions
├── background.js          # Service worker (lifecycle management)
├── content.js             # Content script (runs on Naukri.com pages)
├── content.css            # Styles for content script overlays
├── popup.html             # Popup UI (when you click the extension icon)
├── popup.js               # Popup logic & Q&A management
├── popup.css              # Popup styles
├── generate_icons.js      # Script to generate extension icons
├── icons/                 # Extension icons (16x16, 48x48, 128x128)
└── upi_qr.png            # Support/donation QR code
```

---

## 🔧 How It Works

### Extension Lifecycle

1. **User installs extension** → `background.js` initializes default settings
2. **User visits Naukri.com** → `content.js` detects new questions
3. **For each question:**
   - Tries to match against saved Q&A library
   - If found: auto-fills the answer (or prompts for confirmation)
   - If not found: shows an overlay asking user to answer it
   - Saves the new answer to the library
4. **Q&A Library Management:**
   - User can view/edit/delete Q&As in the popup
   - Export Q&As as JSON for backup
   - Import Q&As from JSON
   - Search and filter by type

---

## 📖 File Explanations

### **1. manifest.json**
- **What it is:** Configuration file for the Chrome extension
- **Key parts:**
  - `manifest_version: 3` → Using latest Chrome extension API (V3)
  - `permissions` → `storage` (to save Q&As locally), `activeTab`
  - `host_permissions` → Access only naukri.com
  - `background: service_worker` → Runs `background.js` for lifecycle
  - `content_scripts` → Injects `content.js` & `content.css` on Naukri pages
  - `action` → Defines popup.html as the popup interface

```json
{
  "manifest_version": 3,
  "name": "Naukri Auto-Fill Assistant",
  "version": "1.0.0",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["https://www.naukri.com/*"]
}
```

---

### **2. background.js**
- **What it does:** Service worker that runs in the background
- **Key functionality:**
  - Listens for extension **install** → Sets default settings
  - Listens for extension **update** → Logs version info
  - Default settings:
    - `autoSubmit: true` (auto-click Save after filling)
    - `notifications: true` (show toast when filling)

```javascript
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      naukriSettings: {
        autoSubmit: true,
        notifications: true,
      },
      naukriQnA: {},
    });
  }
});
```

---

### **3. content.js** (31KB - Main Logic)
- **What it does:** Runs on every Naukri.com page and handles auto-filling
- **Key Components:**

#### **Storage Management**
- Loads Q&A library from Chrome storage
- Saves new questions and answers

#### **Question Detection**
- Scans the page for questions in 4 types:
  - **TEXT** → Single/multi-line text inputs
  - **RADIO** → Single-choice radio buttons
  - **CHECKBOX** → Multi-choice checkboxes
  - **UNKNOWN** → Falls back to text overlay

#### **Question Normalization**
```javascript
// Example: "What is your salary?" → "what is your salary"
// Removes special chars and extra spaces for matching
function normalize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

#### **Session Tracking**
- Remembers questions already seen in the current session
- 5-second cooldown if user cancels a question (don't ask again immediately)
- Clears history when chat closes/reopens

#### **Auto-fill Flow**
1. Find question on page
2. Normalize question text
3. Look up in Q&A library
4. If found: fill the answer automatically
5. If NOT found: show overlay asking user to answer it
6. Save the new answer to the library

#### **UI Overlays**
- **Overlay:** Transparent input for new questions (styled in content.css)
- **Toast:** Brief notification when answers are filled

---

### **4. popup.html** (12KB - UI Structure)
- **What it is:** The HTML for the extension popup (opens when you click extension icon)
- **Structure:**

```html
Header (with Q&A count)
├── Tabs:
│   ├── 📋 Q&A Library (view/search/filter saved Q&As)
│   ├── ➕ Add Custom (manually add Q&As)
│   └── ⚙️ Settings (configure behavior)
├── Modals:
│   ├── Edit modal (edit existing Q&As)
│   ├── Confirm modal (delete confirmation)
│   └── Support modal (donation QR code)
└── Footer (About info)
```

#### **Tab 1: Q&A Library**
- Search box to find questions
- Filter chips: All, Single Choice, Multi Choice, Short Answer, Description
- List of all saved Q&As with edit/delete buttons
- Export to JSON, Clear All buttons

#### **Tab 2: Add Custom**
- Form to manually add new Q&As
- Question Type dropdown (4 options)
- Dynamic answer input based on type
- For multi-choice: option builder

#### **Tab 3: Settings**
- Toggle: Auto Submit (auto-click Save)
- Toggle: Show Notifications
- Import/Export JSON section
- About info
- Danger zone: Delete all data

---

### **5. popup.js** (26KB - Popup Logic)
- **What it does:** Handles all popup interactions and Q&A management
- **Key Functions:**

#### **Storage Operations**
```javascript
loadAll(callback)        // Load Q&As and settings from storage
saveQnA(callback)        // Save Q&As to storage
saveSettings(callback)   // Save settings (autoSubmit, notifications)
notifyContentScript()    // Tell content.js to reload
```

#### **Q&A Management**
```javascript
renderQnaList()          // Display all Q&As with filters/search
addOrUpdateQnA()         // Create/update a Q&A
deleteQnA(key)           // Delete a Q&A
editQnA(key)             // Open edit modal for a Q&A
```

#### **Import/Export**
```javascript
exportToJSON()           // Download Q&As as JSON
importJSON(replace)      // Import from JSON (merge or replace)
```

#### **Filter & Search**
- Real-time search across question text and answers
- Filter by question type (single, multi, short, long)
- Sort by date (newest first)

#### **UI Interactions**
- Tab navigation
- Modal open/close
- Settings toggle
- Toast notifications for actions

---

### **6. content.css** (5.8KB)
- **Styles for content script overlays:**
  - **Overlay styling:** Semi-transparent background, styled input for new questions
  - **Toast styling:** Small notification popup (bottom-right)
  - **Buttons & hover effects**

```css
#naukri-autofill-overlay {
  position: fixed;
  background: rgba(0, 0, 0, 0.7);
  /* Semi-transparent overlay for new questions */
}

#naukri-autofill-toast {
  position: fixed;
  bottom: 20px;
  right: 20px;
  /* Toast notification */
}
```

---

### **7. popup.css** (19KB)
- **Styles for the popup interface:**
  - Header with stats
  - Tab navigation
  - Form controls (inputs, textareas, selects)
  - Modals (edit, confirm, support)
  - Filter chips
  - Q&A list items
  - Settings toggles

**Color scheme:** Modern, clean design with:
- Primary color: Blue (#2563eb)
- Danger color: Red (#dc2626)
- Neutral: Grays
- Responsive layout

---

### **8. generate_icons.js** (5.8KB)
- **Purpose:** Script to programmatically generate extension icons
- **Usage:** `node generate_icons.js` (one-time setup)
- **Creates:** 16x16, 48x48, 128x128 PNG icons with the 🤖 emoji
- **Why:** Icon generation ensures consistent branding

---

## 🚀 Installation & Setup

### **For End Users (Install from Chrome Web Store)**
1. Go to Chrome Web Store
2. Search "Naukri Auto-Fill Assistant"
3. Click "Add to Chrome"
4. Grant permissions when prompted
5. Start applying to jobs!

### **For Developers (Local Testing)**

#### **Step 1: Extract the zip**
```bash
unzip Naukri-AutoFill.zip
cd Naukri-AutoFill
```

#### **Step 2: Open in VS Code**
```bash
code .
```

#### **Step 3: Load into Chrome**
1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (top-right toggle)
4. Click "Load unpacked"
5. Select the extension folder
6. Extension now active! 🎉

#### **Step 4: Test the Extension**
1. Visit any job posting on **naukri.com**
2. Look for the extension icon in the toolbar
3. Click it to open the popup
4. Go to "Add Custom" tab to add a test Q&A
5. The extension will auto-fill those Q&As when you see them again

---

## ✨ Features

### **Core Features**
- ✅ Auto-fill supported question types (text, radio, checkbox)
- ✅ Save Q&As automatically or manually
- ✅ Search & filter Q&A library
- ✅ Edit/delete saved Q&As
- ✅ Auto-submit forms (optional)
- ✅ Toast notifications (optional)

### **Import/Export**
- ✅ Export all Q&As as JSON for backup
- ✅ Import Q&As from JSON
- ✅ Merge or replace existing data

### **Privacy & Security**
- ✅ All data stored **locally** in browser (Chrome storage)
- ✅ No data sent to servers
- ✅ No tracking or analytics
- ✅ Works offline (except initial page load)

### **Browser Support**
- ✅ Chrome/Chromium-based browsers (80+)
- ✅ Works on desktop only (mobile Chrome has limited extension support)

---

## 🔐 Data Storage

**Location:** Chrome's local storage (`chrome.storage.local`)

**What's stored:**
```javascript
{
  naukriQnA: {
    "normalize_question_text": {
      originalText: "Full question...",
      type: "single|multi|short|long",
      answer: "answer or [options]",
      savedAt: "2024-03-30T16:18:00Z"
    }
  },
  naukriSettings: {
    autoSubmit: true|false,
    notifications: true|false
  }
}
```

---

## 🛠️ Development Notes

### **Extending the Extension**

1. **Add a new question type:**
   - Update `TYPE` constant in content.js
   - Add detection logic
   - Update popup.html form
   - Test on Naukri pages

2. **Add a new setting:**
   - Add to `naukriSettings` in background.js
   - Add UI toggle in popup.html
   - Add event listener in popup.js
   - Save & load from storage

3. **Modify styles:**
   - Edit `popup.css` for popup UI
   - Edit `content.css` for page overlays

### **Debugging**

**In Chrome DevTools:**
```
Right-click extension icon → Options
Or: chrome://extensions/ → Details → inspect views → background
```

**Console logs:**
All logs prefixed with `[NAF]` (Naukri AutoFill)

---

## 📞 Support & Contact

- **Email:** aadilshaik.dtov@gmail.com
- **Feature requests:** Email with description
- **Bug reports:** Email with steps to reproduce
- **Support the developer:** UPI QR code in the popup 🙏

---

## 📜 License & Credits

Developed by **Mohammed Zakir Nooraj** | 
Published by **Aadil Shaik** | Version 1.0.0

---

## ❓ FAQ

**Q: Will this work on mobile?**
A: No, Chrome Extensions have limited support on mobile Chrome.

**Q: Can I use this on other job sites?**
A: Currently works only on Naukri.com. To add support for other sites, update `host_permissions` in manifest.json.

**Q: Is my data secure?**
A: Yes! All data is stored locally in your browser. Nothing is sent to servers.

**Q: Can I export my Q&As?**
A: Yes! Go to Q&A Library tab → "Export JSON" → save the file. Use "Import & Merge" to restore later.

**Q: What happens if I disable the extension?**
A: Your Q&As are saved in Chrome storage. Re-enable the extension and they'll be back.

---

**Happy job hunting! 🚀**
