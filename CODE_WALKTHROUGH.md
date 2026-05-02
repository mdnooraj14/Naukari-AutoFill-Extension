# 🔍 Code Walkthrough - Deep Dive

This guide explains the actual code logic and function flow.

---

## 🏗️ Architecture Overview

```
Chrome Extension
├── manifest.json (Config)
├── background.js (Lifecycle)
├── content.js (Runs on Naukri pages)
│   ├── Detects questions
│   ├── Finds matches in storage
│   └── Auto-fills or asks user
├── popup.js (UI when you click icon)
│   ├── Displays Q&A library
│   ├── Manages add/edit/delete
│   └── Handles settings
└── CSS files (Styling)
```

---

## 📊 Data Flow

### When User Applies for a Job

```
1. User visits naukri.com job application
   ↓
2. content.js detects the page & loads Q&A storage
   ↓
3. For each question on the form:
   a. Extract & normalize question text
   b. Look up in Q&A library
   c. If FOUND: Auto-fill the answer
   d. If NOT found: Show overlay asking user
   ↓
4. User answers (or extension auto-fills)
   ↓
5. Save to Q&A library (chrome.storage.local)
   ↓
6. User submits form
```

---

## 🔑 Key Functions Explained

### **content.js** (Main Logic)

#### `loadStorage(cb)`
```javascript
function loadStorage(cb) {
  chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], (result) => {
    qnaStore = result[STORAGE_KEY] || {};  // Get saved Q&As
    if (cb) cb();
  });
}
```
**What it does:** Loads all saved Q&As from browser storage into memory

**When it's called:** When content script starts, before checking questions

---

#### `normalize(text)`
```javascript
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')     // Remove special chars
    .replace(/\s+/g, ' ')             // Remove extra spaces
    .trim();
}
```
**What it does:** Converts a question to a consistent format for matching

**Example:**
```javascript
normalize("What is your Expected C.T.C.?")
// Returns: "what is your expected ctc"
```

**Why needed:** To match variations like:
- "What is your expected CTC?"
- "What is your EXPECTED c.t.c."
- "expected ctc"
- All normalize to the same key!

---

#### `isVisible(el)`
```javascript
function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const s = window.getComputedStyle(el);
  return s.display !== 'none' && 
         s.visibility !== 'hidden' && 
         parseFloat(s.opacity) > 0;
}
```
**What it does:** Checks if an element is actually visible on the page

**Why needed:** Ignore hidden questions or form fields

---

#### `findContainer()`
```javascript
function findContainer() {
  const tries = [
    '.chatbot_DrawerContentWrapper',
    '[class*="DrawerContentWrapper"]',
    '[class*="questionnaire"]',
    // ... 10+ selectors
  ];
  for (const sel of tries) {
    const el = document.querySelector(sel);
    if (el && isVisible(el)) return el;
  }
}
```
**What it does:** Finds the question form container on Naukri pages

**Why needed:** Different pages have different HTML structures; try multiple CSS selectors

---

#### `syncSession()`
```javascript
let sessionQuestions = new Set();  // Questions seen THIS session

function syncSession() {
  const container = findContainer();
  const open = !!container;
  
  if (!chatWasOpen && open) {
    // Chat just opened → clear old questions
    sessionQuestions.clear();
    chatWasOpen = true;
  }
  if (chatWasOpen && !open) {
    // Chat just closed → remember this
    chatWasOpen = false;
  }
}
```
**What it does:** Tracks if the questionnaire is open/closed

**Why:** Reset the list of "already seen questions" when user opens a new application form

---

#### `detectQuestions()`
**Flow:**
1. Find all question elements on the page
2. For each question:
   - Extract the question text
   - Determine the answer type (TEXT, RADIO, CHECKBOX, UNKNOWN)
   - Normalize the question text
   - Check if it's in our Q&A library
   - If YES → auto-fill
   - If NO → show overlay asking user

---

#### `fillQuestion(question, answer)`
```javascript
function fillQuestion(question, answer) {
  const type = detectType(question);
  
  switch(type) {
    case TYPE.TEXT:
      // Find the input/textarea and set value
      const input = question.querySelector('input, textarea');
      input.value = answer;
      break;
      
    case TYPE.RADIO:
      // Find radio button with matching text and click it
      const radio = Array.from(question.querySelectorAll('input[type="radio"]'))
        .find(r => r.value === answer || r.nextElementSibling.textContent === answer);
      radio?.click();
      break;
      
    case TYPE.CHECKBOX:
      // Find checkboxes and click all matching ones
      const answerArray = answer.split('|');
      question.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (answerArray.includes(cb.value)) cb.click();
      });
      break;
  }
  
  showToast(`Filled: "${question.textContent}"`);
}
```
**What it does:** Takes a question element and fills it with the answer

---

#### `showOverlay(question)`
**When called:** User has NOT answered this question before

**What it shows:** A semi-transparent overlay asking the user to answer

**Input field:** Allows user to type their answer

**Buttons:**
- ✅ Save → Stores answer & fills form
- ❌ Cancel → Skips this question (5s cooldown)

---

### **popup.js** (UI Logic)

#### `loadAll(callback)`
```javascript
function loadAll(callback) {
  chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], (result) => {
    qnaStore = result[STORAGE_KEY] || {};
    settings = result[SETTINGS_KEY] || { autoSubmit: true, notifications: true };
    if (callback) callback();
  });
}
```
**What it does:** Load everything from storage when popup opens

**Called:** On `DOMContentLoaded` event

---

#### `renderQnaList()`
```javascript
function renderQnaList() {
  const entries = Object.entries(qnaStore);
  
  // Apply current filter & search
  let filtered = entries.filter(([key, val]) => {
    if (currentFilter !== 'all' && val.type !== currentFilter) return false;
    if (currentSearchQuery && 
        !val.originalText.includes(currentSearchQuery) &&
        !val.answer.includes(currentSearchQuery)) return false;
    return true;
  });
  
  // Sort by date
  filtered.sort((a, b) => {
    const dateA = new Date(a[1].savedAt || 0);
    const dateB = new Date(b[1].savedAt || 0);
    return dateB - dateA;  // Newest first
  });
  
  // Create HTML for each Q&A
  const html = filtered.map(([key, val]) => `
    <div class="qna-item">
      <div class="qna-question">${val.originalText}</div>
      <div class="qna-answer">${formatAnswer(val.answer)}</div>
      <button onclick="editQnA('${key}')">✏️ Edit</button>
      <button onclick="deleteQnA('${key}')">🗑️ Delete</button>
    </div>
  `).join('');
  
  document.getElementById('qna-list').innerHTML = html;
}
```
**What it does:** Display all saved Q&As in a list (with filters applied)

**Called:** When popup opens, when user adds/deletes, when typing in search

---

#### `addOrUpdateQnA(question, type, answer)`
```javascript
function addOrUpdateQnA(question, type, answer) {
  const normalizedQ = normalizeQuestion(question);
  
  qnaStore[normalizedQ] = {
    originalText: question,    // Keep original for display
    type: type,                 // short|long|single|multi
    answer: answer,             // User's answer
    savedAt: new Date().toISOString()
  };
  
  saveQnA(() => {
    renderQnaList();
    showToast(`✅ Saved: "${question}"`);
  });
}
```
**What it does:** Save a Q&A (new or updated) to storage

**Key detail:** Uses normalized question as the key, but stores original for display

---

#### `exportToJSON()`
```javascript
function exportToJSON() {
  const json = JSON.stringify(qnaStore, null, 2);
  document.getElementById('json-output').value = json;
  document.getElementById('json-panel').classList.remove('hidden');
}
```
**What it does:** Convert Q&A store to JSON and show in a textarea

**User can then:** Copy-paste into a text file for backup

---

#### `importJSON(replace = false)`
```javascript
function importJSON(replace = false) {
  const jsonText = document.getElementById('import-json').value;
  const imported = JSON.parse(jsonText);
  
  if (replace) {
    qnaStore = imported;  // Overwrite all
  } else {
    qnaStore = { ...qnaStore, ...imported };  // Merge
  }
  
  saveQnA(() => {
    renderQnaList();
    showToast('✅ Imported successfully!');
  });
}
```
**What it does:** Parse JSON and add/replace Q&As in storage

**Two modes:**
- **Merge:** Add imported Q&As to existing ones
- **Replace:** Delete all existing, use only imported ones

---

### **popup.html** (UI Structure)

```html
<header>
  <span>🤖 Naukri AutoFill</span>
  <span id="qna-count">42</span>  <!-- Shows number of saved Q&As -->
</header>

<nav class="tabs">
  <button data-tab="qna">📋 Q&A Library</button>
  <button data-tab="add">➕ Add Custom</button>
  <button data-tab="settings">⚙️ Settings</button>
</nav>

<!-- Tab 1: Library -->
<div id="tab-qna">
  <input type="text" id="search-input" placeholder="Search...">
  <div class="filter-chips">
    <button class="chip" data-filter="all">All</button>
    <button class="chip" data-filter="single">Single Choice</button>
    <!-- etc -->
  </div>
  <div id="qna-list"><!-- Q&As rendered here --></div>
</div>

<!-- Tab 2: Add Custom -->
<div id="tab-add">
  <input id="custom-question" placeholder="Question text...">
  <select id="custom-type">
    <option value="short">Short Answer</option>
    <option value="long">Description</option>
    <option value="single">Single Choice</option>
    <option value="multi">Multiple Choice</option>
  </select>
  <textarea id="custom-answer-short"></textarea>
  <button onclick="saveCustomQnA()">💾 Save</button>
</div>

<!-- Tab 3: Settings -->
<div id="tab-settings">
  <label>Auto Submit
    <input type="checkbox" id="setting-auto-submit" checked>
  </label>
  <label>Show Notifications
    <input type="checkbox" id="setting-notifications" checked>
  </label>
</div>
```

---

## 🔄 Event Flow Examples

### **Scenario 1: User Adds a Custom Q&A**

```
User clicks "Add Custom" tab
  ↓
User types: "What is your expected CTC?"
User selects: "Short Answer"
User types: "8 LPA"
User clicks "💾 Save Q&A"
  ↓
popup.js → saveCustomQnA()
  ↓
addOrUpdateQnA(question, type, answer)
  ↓
qnaStore["what is your expected ctc"] = {
  originalText: "What is your expected CTC?",
  type: "short",
  answer: "8 LPA",
  savedAt: "2024-03-30T16:18:00Z"
}
  ↓
saveQnA() → chrome.storage.local.set(...)
  ↓
notifyContentScript() → Tell content.js to reload
  ↓
renderQnaList() → Show in library
  ↓
showToast("✅ Saved: 'What is your expected CTC?'")
```

---

### **Scenario 2: User Visits Job Application**

```
1. User goes to naukri.com/jobs/...
   ↓
2. content.js injects into page
   ↓
3. loadStorage() → Load all saved Q&As into memory
   ↓
4. detectQuestions() → Scan page for form fields
   ↓
5. For question "What is your CTC?"
   - normalize → "what is your ctc"
   - Lookup in qnaStore → Found! ("what is your expected ctc" is similar enough)
   - fillQuestion(element, "8 LPA")
   ↓
6. <input> value set to "8 LPA"
   ↓
7. showToast("✅ Filled: 'What is your CTC?'")
   ↓
8. User clicks Submit
   ↓
9. Form submits with answers!
```

---

### **Scenario 3: User Encounters New Question**

```
1. content.js scans page
   ↓
2. Finds: "Tell us about a time you solved a problem"
   - Normalize & lookup → NOT in qnaStore
   - Question is not in sessionQuestions (first time seeing it)
   ↓
3. showOverlay(question)
   - Semi-transparent overlay appears
   - Input field for user to type
   ↓
4. User types answer: "I optimized database queries..."
   ↓
5. User clicks "✅ Save"
   ↓
6. addNewQuestion(question, answer)
   - Normalize & save to storage
   - Fill the form field
   - Add to sessionQuestions (don't ask again this session)
   ↓
7. Next time user sees this question → Auto-fill!
```

---

## 🗄️ Storage Structure

### Chrome Local Storage Format

```javascript
{
  "naukriQnA": {
    "what is your expected ctc": {
      originalText: "What is your expected CTC?",
      type: "short",
      answer: "8 LPA",
      savedAt: "2024-03-30T16:18:00Z"
    },
    "tell about yourself": {
      originalText: "Tell us about yourself",
      type: "long",
      answer: "I'm a full-stack developer with 5 years experience...",
      savedAt: "2024-03-30T16:20:00Z"
    },
    "which of these apply to you": {
      originalText: "Which of these apply to you?",
      type: "multi",
      answer: "JavaScript|Python|React",  // "|" separates multiple choices
      savedAt: "2024-03-30T16:22:00Z"
    }
  },
  "naukriSettings": {
    autoSubmit: true,
    notifications: true
  }
}
```

**Key points:**
- Keys are **normalized** for matching
- Values store **original text** for display
- Answer format varies by type:
  - **short/long:** Plain text
  - **single:** Value of selected radio
  - **multi:** Values separated by `|`

---

## 🎯 Question Type Detection Logic

### How content.js Identifies Question Types

```javascript
function detectType(element) {
  // Check for input/textarea (TEXT)
  if (element.querySelector('input[type="text"]')) return TYPE.TEXT;
  if (element.querySelector('textarea')) return TYPE.TEXT;
  
  // Check for radio buttons (SINGLE)
  if (element.querySelector('input[type="radio"]')) return TYPE.RADIO;
  
  // Check for checkboxes (MULTI)
  if (element.querySelector('input[type="checkbox"]')) return TYPE.CHECKBOX;
  
  // Fallback
  return TYPE.UNKNOWN;
}
```

**Limitations:**
- Can't detect custom form fields (UNKNOWN type)
- Can't detect dropdown selects (would need to add)
- Can't detect file uploads (security limitation)

---

## 🔐 Permissions Explained

### manifest.json Permissions

```json
{
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["https://www.naukri.com/*", "https://naukri.com/*"]
}
```

**What each means:**

| Permission | What it allows |
|-----------|---|
| `storage` | Read/write `chrome.storage.local` (saved Q&As) |
| `activeTab` | Access the active tab URL (to know when on Naukri) |
| `host_permissions` | Run content script ONLY on Naukri domains |

**Security model:**
- ✅ Works on naukri.com only
- ❌ Can't access other sites
- ❌ Can't send data to external servers
- ✅ All data stays in your browser

---

## 🚀 Future Improvements

### Potential Enhancements

1. **Support more sites**
   - Add LinkedIn, Indeed, Glassdoor
   - Update manifest.json & content.js

2. **Better matching**
   - Fuzzy matching for similar questions
   - ML-based question classification

3. **Keyboard shortcuts**
   - Ctrl+Shift+K to open popup
   - Quick access to Q&A library

4. **Keyboard navigation**
   - Tab through unsaved questions
   - Arrow keys to navigate library

5. **Sync across devices**
   - Use Chrome Sync instead of local storage
   - Requires `sync` permission

6. **Analytics**
   - Track which questions are most filled
   - Show usage statistics

---

## 📚 Learning Resources

To understand more:

1. **Chrome Extensions API:** https://developer.chrome.com/docs/extensions/
2. **Content Scripts:** https://developer.chrome.com/docs/extensions/content_scripts/
3. **Storage API:** https://developer.chrome.com/docs/extensions/reference/storage/
4. **DOM Manipulation:** https://javascript.info/dom

---

**That's a complete walkthrough of the codebase!** 🎉
