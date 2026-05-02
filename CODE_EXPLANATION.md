# 📚 Detailed Code Explanation

This document explains the actual code in simple terms with line-by-line breakdowns.

---

## 🎬 MAIN FLOW - How It Works

### Step 1: User Opens Job Application on Naukri.com
```
Browser → naukri.com/jobs/XYZ
   ↓
Chrome injects content.js into the page
   ↓
content.js starts watching for questions
```

### Step 2: Content Script Detects a Question
```
Question appears: "What is your expected CTC?"
   ↓
normalize() → "what is your expected ctc"
   ↓
Look up in qnaStore
   ├─ FOUND (user answered before) → Auto-fill
   └─ NOT found (new question) → Show overlay asking user
```

### Step 3: User Answers or Auto-Fill Happens
```
Answer typed/selected
   ↓
Save to storage (qnaStore)
   ↓
Fill the form field
   ↓
Auto-click "Save" button
   ↓
Toast notification: "✓ Answer filled"
```

---

## 📝 CODE BREAKDOWN - content.js

### **Section 1: IIFE Wrapper (Lines 13-14)**
```javascript
(function () {
  'use strict';
  // All code inside here...
})();
```
**What it does:** Creates an isolated scope so variables don't pollute global namespace.
**Why:** Prevents conflicts with Naukri's own JavaScript.

---

### **Section 2: Constants & Storage Keys (Lines 16-21)**
```javascript
const STORAGE_KEY = 'naukriQnA';           // Key for Q&A library
const SETTINGS_KEY = 'naukriSettings';     // Key for settings
const OVERLAY_ID = 'naukri-autofill-overlay';  // Our popup modal ID
const TOAST_ID = 'naukri-autofill-toast';      // Notification ID

const TYPE = { 
  TEXT: 'text',           // Text input/textarea
  RADIO: 'radio',         // Single choice
  CHECKBOX: 'checkbox',   // Multiple choice
  UNKNOWN: 'unknown'      // Can't detect type
};
```
**Purpose:** Define constants used throughout the script.

---

### **Section 3: State Variables (Lines 23-30)**
```javascript
let qnaStore = {};                    // All saved Q&As in memory
let sessionQuestions = new Set();     // Questions in THIS session
let cancelledQuestions = new Map();   // Questions user cancelled
let isProcessing = false;             // Prevents duplicate processing
let chatWasOpen = false;              // Was questionnaire open?
```
**What each tracks:**
- `qnaStore` — Your entire Q&A library loaded from storage
- `sessionQuestions` — Set of questions already processed this session (don't ask again)
- `cancelledQuestions` — Questions user closed (5s cooldown before re-asking)
- `isProcessing` — Flag to prevent processing same question twice at once
- `chatWasOpen` — Detects when questionnaire closes (to reset state)

---

### **Section 4: loadStorage() (Lines 33-43)**
```javascript
function loadStorage(cb) {
  try {
    chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.warn('[NAF] Storage read:', chrome.runtime.lastError);
        return;
      }
      qnaStore = result[STORAGE_KEY] || {};  // Load Q&As into memory
      if (cb) cb();  // Execute callback
    });
  } catch (e) {
    console.warn('[NAF] Storage error:', e);
    if (cb) cb();  // Still call callback even if error
  }
}
```
**What it does:**
1. Calls `chrome.storage.local.get()` to fetch saved data
2. Stores Q&As in `qnaStore` variable
3. Calls the callback function when done
4. Has error handling (doesn't crash if storage fails)

**When it's called:** On page load, and when popup saves new Q&As

---

### **Section 5: saveQnA() (Lines 45-57)**
```javascript
function saveQnA(cb) {
  try {
    chrome.storage.local.set({ [STORAGE_KEY]: qnaStore }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[NAF] Storage write:', chrome.runtime.lastError);
      }
      if (cb) cb();  // Always call callback
    });
  } catch (e) {
    console.warn('[NAF] Storage save:', e);
    if (cb) cb();  // Still call callback even if error
  }
}
```
**What it does:** Saves the in-memory `qnaStore` to Chrome storage
**Why always call cb?** So form still fills even if storage fails temporarily.

---

### **Section 6: normalize() (Line 60)**
```javascript
function normalize(text) {
  return text
    .toLowerCase()                    // "HELLO" → "hello"
    .replace(/[^a-z0-9\s]/g, '')      // Remove special chars: "!" → ""
    .replace(/\s+/g, ' ')              // Collapse spaces: "hello  world" → "hello world"
    .trim();                            // Remove edges: " hello " → "hello"
}
```

**Example:**
```javascript
normalize("What is your Expected C.T.C.?")
// Step 1: "what is your expected c.t.c.?"
// Step 2: "what is your expected ctc"
// Step 3: "what is your expected ctc" (already single spaces)
// Step 4: "what is your expected ctc" (no edges)
// Result: "what is your expected ctc"

// Later:
normalize("What's your expected CTC?")
// Result: "whats your expected ctc" (apostrophe removed)

// These are DIFFERENT! This is why the function is critical.
```

**Why normalize?** So "What is CTC?" and "What's your C.T.C?" both match to the same entry.

---

### **Section 7: isVisible() (Lines 65-71)**
```javascript
function isVisible(el) {
  if (!el) return false;  // No element = not visible
  
  const r = el.getBoundingClientRect();  // Get position on screen
  if (r.width === 0 && r.height === 0) return false;  // 0x0 = hidden
  
  const s = window.getComputedStyle(el);  // Get CSS styles
  return s.display !== 'none' &&           // Not display:none
         s.visibility !== 'hidden' &&      // Not visibility:hidden
         parseFloat(s.opacity) > 0;        // Not transparent
}
```

**What it checks:**
1. Element exists?
2. Has width/height (not collapsed)?
3. Not display:none?
4. Not visibility:hidden?
5. Not opacity:0 (transparent)?

**Why needed?** Some form fields are hidden behind the scenes. We only care about visible ones.

---

### **Section 8: findContainer() (Lines 74-95)**
```javascript
function findContainer() {
  const tries = [
    '.chatbot_DrawerContentWrapper',     // Exact class name
    '[class*="DrawerContentWrapper"]',  // Partial match
    '[class*="chatbot_Drawer"]',         // Another variant
    '[class*="questionnaire"]',           // Generic name
    // ... more selectors
  ];
  
  for (const sel of tries) {
    try {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) return el;  // Found and visible!
    } catch (e) { /* skip */ }  // Skip invalid selectors
  }
  
  return null;  // Not found
}
```

**What it does:** Tries to find the questionnaire/chat container
**Why multiple selectors?** Naukri might change HTML structure. Testing many selectors increases chances of finding it.
**Returns:** The container element, or null if not found.

---

### **Section 9: syncSession() (Lines 98-109)**
```javascript
function syncSession() {
  const container = findContainer();
  const open = !!container;  // Convert to boolean
  
  if (open && !chatWasOpen) {  // Chat just OPENED
    console.log('[NAF] Chat opened — new session');
    sessionQuestions.clear();     // Forget old questions
    cancelledQuestions.clear();   // Forget cancelled questions
    isProcessing = false;
  }
  
  chatWasOpen = open;  // Remember current state
  return container;
}
```

**What it does:** Detects when questionnaire opens/closes
**Logic:**
- If chat IS open AND wasn't open before → **New session!** Clear history
- Remember the current state for next time

**Example:**
```
Time 1: User opens Job 1 → syncSession() detects open → clears sessionQuestions
User applies, closes
Time 2: User opens Job 2 → syncSession() detects reopened → clears sessionQuestions again
```

This ensures questions aren't asked twice per session.

---

### **Section 10: findQuestions() (Lines 112-152)**
```javascript
function findQuestions(container) {
  if (!container) return [];
  const out = new Set();  // Set prevents duplicates

  const msgSelectors = [
    'li.botItem',
    '[class*="botItem"]',
    '[class*="botMessage"]',
    // ... try multiple selectors
  ];

  // Is this text actually a question?
  function isQuestion(t) {
    return t.length > 5 &&           // Not too short
           t.length < 600 &&         // Not too long
           (t.includes('?') ||        // Has question mark OR
            /\b(open|years|ctc|salary)\b/i.test(t));  // Contains job keywords
  }

  // Try all known selectors
  let found = false;
  for (const sel of msgSelectors) {
    try {
      container.querySelectorAll(sel).forEach(el => {
        const t = el.textContent.trim();
        if (isQuestion(t)) {
          out.add(t);  // Add to set (no duplicates)
          found = true;
        }
      });
    } catch (e) { /* skip */ }
  }

  // If no structured selectors worked, try broad fallback
  if (!found) {
    container.querySelectorAll('p, span, div, li').forEach(el => {
      if (el.children.length > 0) return;  // Skip if has child elements
      if (el.closest('input, textarea')) return;  // Skip form controls
      const t = el.textContent.trim();
      if (isQuestion(t)) out.add(t);
    });
  }

  return [...out];  // Convert Set to Array
}
```

**What it does:** Finds all question text on the page
**How:**
1. Try specific CSS selectors for question containers
2. Extract text from each container
3. Filter to actual questions (has "?" or job keywords)
4. Fallback: scan ALL text elements if above didn't work

**Returns:** Array of question strings like `["What is your expected CTC?", "Are you willing to relocate?"]`

---

### **Section 11: detectType() (Lines 155-165)**
```javascript
function detectType(container) {
  if (!container) return TYPE.UNKNOWN;
  
  // Check for checkboxes first (might have both checkbox & radio)
  if (container.querySelector('input[type="checkbox"]'))
    return TYPE.CHECKBOX;
  
  if (container.querySelector('input[type="radio"]'))
    return TYPE.RADIO;
  
  // Check for text input (textarea, contenteditable, etc)
  const hasText = container.querySelector(
    '[contenteditable="true"], input[type="text"], input:not([type]), textarea'
  );
  if (hasText) return TYPE.TEXT;
  
  return TYPE.UNKNOWN;  // Couldn't determine
}
```

**What it does:** Figures out what type of question this is
**Logic:** Check in order — checkbox, radio, text, then unknown.

**Example:**
```html
<!-- If container has this: -->
<input type="checkbox" name="skills">
<!-- detectType returns: "checkbox" -->

<!-- If container has this: -->
<textarea placeholder="Tell us..."></textarea>
<!-- detectType returns: "text" -->
```

---

### **Section 12: typeIntoField() (Lines 244-266)**
```javascript
function typeIntoField(el, text) {
  if (!el) return;
  
  el.focus();  // Click into the field
  
  if (el.isContentEditable) {
    // For contenteditable divs (like Naukri's chat)
    document.execCommand('selectAll', false, null);  // Select all text
    document.execCommand('insertText', false, text);  // Replace with new text
    
    // Fallback if execCommand didn't work
    if (el.textContent.trim() !== text.trim()) {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
    }
  } else {
    // For <input> and <textarea>
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    
    if (setter) setter.set.call(el, text);  // Set value directly
    else el.value = text;  // Fallback
    
    el.dispatchEvent(new Event('input',  { bubbles: true }));  // Trigger React
    el.dispatchEvent(new Event('change', { bubbles: true }));  // Trigger React
  }
}
```

**Why so complicated?** 
- Naukri uses React
- React doesn't see direct value changes
- Must dispatch events to notify React
- Different for contenteditable vs input/textarea

---

### **Section 13: processQuestion() (Lines 289-362)**
**This is the MAIN logic that ties everything together!**

```javascript
async function processQuestion(question) {
  if (isProcessing) return;  // Already processing? Skip.
  
  const key = normalize(question);  // "what is your expected ctc"
  
  // Check 5s cooldown from cancellation
  const cancelTime = cancelledQuestions.get(key);
  if (cancelTime && Date.now() - cancelTime < 5000) return;
  
  // Already asked in this session? Skip.
  if (sessionQuestions.has(key)) return;
  
  sessionQuestions.add(key);  // Mark as processed
  isProcessing = true;  // Lock to prevent duplicates
  
  console.log('[NAF] Question detected:', question);
  
  try {
    await wait(500);  // Let Naukri UI settle
    
    const container = findContainer();  // Find the question area
    const qType = detectType(container);  // What type: TEXT, RADIO, etc?
    const saved = qnaStore[key];  // Look up in saved Q&As
    
    console.log('[NAF] Type:', qType, '| Saved:', saved ? 'yes' : 'no');
    
    if (saved) {  // User answered this before!
      let filled = false;
      
      if (qType === TYPE.TEXT || qType === TYPE.UNKNOWN) {
        // ─ TEXT ANSWER ─
        const inp = findTextInput(container);
        if (inp) {
          typeIntoField(inp, saved.answer);  // Type the saved answer
          filled = true;
        }
      } else if (qType === TYPE.RADIO) {
        // ─ SINGLE CHOICE ─
        const options = getOptions(container, TYPE.RADIO);  // Get radio buttons
        filled = clickMatchingOption(options, saved.answer);  // Click the matching one
        if (!filled) {
          showOverlay(question, key, qType, getOptions(container, qType));  // If not found, show modal
        }
      } else if (qType === TYPE.CHECKBOX) {
        // ─ MULTIPLE CHOICE ─
        const options = getOptions(container, TYPE.CHECKBOX);
        let answers;
        try { answers = JSON.parse(saved.answer); } catch (e) { answers = [saved.answer]; }
        filled = clickMatchingOption(options, answers);
        if (!filled) {
          showOverlay(question, key, qType, getOptions(container, qType));
        }
      }
      
      // After filling, click Save button
      if (filled) {
        showToast('Answer filled — saving…');
        setTimeout(() => {
          clickSaveButton();
          sessionQuestions.delete(key);  // Allow re-processing for next job
          cancelledQuestions.set(key, Date.now());  // 3s cooldown
        }, 400);
      }
    } else {
      // ─ UNKNOWN QUESTION ─ (not answered before)
      const options = (qType === TYPE.RADIO || qType === TYPE.CHECKBOX)
        ? getOptions(container, qType)
        : [];
      showOverlay(question, key, qType, options);  // Ask user to answer
    }
  } catch (e) {
    console.warn('[NAF] Error:', e);
  } finally {
    isProcessing = false;  // Unlock
  }
}
```

**Flow Diagram:**
```
Question detected
    ↓
Normalize & lookup in qnaStore
    ├─ FOUND → Try to auto-fill
    │   ├─ Success → Click Save, show toast
    │   └─ Failed to find control → Show overlay to user
    └─ NOT FOUND → Show overlay asking user to answer
```

---

### **Section 14: showOverlay() (Lines 392-501)**
**Shows a modal asking user to answer an unknown question**

```javascript
function showOverlay(question, key, qType, options) {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();  // Remove old overlay
  injectStyles();  // Inject CSS
  
  const isChoice = options.length > 0;
  const isMulti = qType === TYPE.CHECKBOX;
  
  const title = isChoice
    ? (isMulti ? 'Select All That Apply' : 'Select Answer')
    : 'Answer Required';
  
  // Build HTML based on question type
  let inputHtml = '';
  if (isChoice) {
    // ─ RADIO/CHECKBOX ─
    const inputType = isMulti ? 'checkbox' : 'radio';
    const name = isMulti ? 'naf-cb' : 'naf-radio';
    inputHtml = `
      <div class="naf-options">
        ${options.map((o, i) => `
          <label>
            <input type="${inputType}" name="${name}" value="${i}">
            <span>${escapeHtml(o.text)}</span>
          </label>
        `).join('')}
      </div>
    `;
  } else {
    // ─ TEXT ANSWER ─
    inputHtml = `
      <textarea class="naf-textarea" placeholder="Type your answer..."></textarea>
      <p class="naf-hint">Ctrl+Enter to fill</p>
    `;
  }
  
  // Create modal HTML
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="naf-backdrop">
      <div class="naf-modal">
        <div class="naf-header">
          <span class="naf-title">${title}</span>
          <button class="naf-close">&times;</button>
        </div>
        <div class="naf-body">
          <div class="naf-question">${escapeHtml(question)}</div>
          ${inputHtml}
        </div>
        <div class="naf-footer">
          <button class="naf-btn-cancel">Cancel</button>
          <button class="naf-btn-fill">Fill Answer</button>
        </div>
      </div>
    </div>
  `;
  
  // Append to DOM
  const chatContainer = findContainer();
  (chatContainer || document.body).appendChild(overlay);
  
  // ─ EVENT HANDLERS ─
  const backdrop = overlay.querySelector('.naf-backdrop');
  const modal = overlay.querySelector('.naf-modal');
  const closeBtn = overlay.querySelector('.naf-close');
  const cancelBtn = overlay.querySelector('.naf-btn-cancel');
  const fillBtn = overlay.querySelector('.naf-btn-fill');
  const textarea = overlay.querySelector('.naf-textarea');
  
  function doClose(e) {
    overlay.remove();
    sessionQuestions.delete(key);  // Ask again after 5s
    cancelledQuestions.set(key, Date.now());  // 5s cooldown
  }
  
  function doFill(e) {
    let answer;
    if (isChoice) {
      const checked = [...overlay.querySelectorAll('.naf-ctrl:checked')];
      if (checked.length === 0) return;  // Must select something
      const selected = checked.map(el => options[parseInt(el.value)].text);
      answer = isMulti ? JSON.stringify(selected) : selected[0];
    } else {
      answer = textarea.value.trim();
      if (!answer) return;  // Must type something
    }
    
    overlay.remove();
    applyAndSave(key, qType, answer, options);  // Save & fill
  }
  
  // Attach listeners
  closeBtn.addEventListener('click', doClose);
  cancelBtn.addEventListener('click', doClose);
  fillBtn.addEventListener('click', doFill);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) doClose(e);  // Click outside = close
  });
  
  if (textarea) {
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doFill(e);  // Ctrl+Enter = submit
    });
    textarea.focus();  // Focus textarea so user can type immediately
  }
}
```

**Visual:**
```
┌─────────────────────────────────────┐
│ ✕ Answer Required                   │  ← Header
├─────────────────────────────────────┤
│ What is your expected CTC?          │  ← Question
│                                     │
│ [        Write answer here...       │  ← Textarea or options
│  ...                           ]    │
│                                     │
│ Ctrl+Enter to fill                  │  ← Hint
├─────────────────────────────────────┤
│              [Cancel] [Fill Answer] │  ← Footer
└─────────────────────────────────────┘
```

---

### **Section 15: check() (Lines 365-383)**
```javascript
function check() {
  const container = syncSession();  // Check if chat is open
  if (!container) return;  // Chat closed, nothing to do
  
  const questions = findQuestions(container);  // Get all questions
  if (questions.length === 0) return;  // No questions
  
  // IMPORTANT: Only look at LAST question (most recent)
  const last = questions[questions.length - 1];
  const key = normalize(last);
  
  // Check if on cooldown from cancellation
  const cancelTime = cancelledQuestions.get(key);
  const onCooldown = cancelTime && Date.now() - cancelTime < 3000;
  
  // Process if NOT already done in this session and NOT on cooldown
  if (!sessionQuestions.has(key) && !onCooldown) {
    processQuestion(last);
  }
}
```

**Logic:** Only process the NEWEST/LAST question, not all of them.
**Why?** Earlier questions are already answered (have user replies after them).

---

### **Section 16: startWatching() (Lines 385-389)**
```javascript
function startWatching() {
  // MutationObserver: watches for DOM changes
  const obs = new MutationObserver(check);
  obs.observe(document.body, { childList: true, subtree: true });
  
  // Fallback: check every 2 seconds (for lazy-loaded content)
  setInterval(check, 2000);
}
```

**What it does:** 
- Watch for DOM changes (new questions appear)
- Also check every 2 seconds as fallback

**Why both?** 
- MutationObserver catches instant changes
- setInterval catches lazy-loaded questions

---

## 📝 CODE BREAKDOWN - popup.js

### **Section 1: Load on Open (Lines 18-25)**
```javascript
document.addEventListener('DOMContentLoaded', () => {
  loadAll(() => {  // Load Q&As and settings from storage
    applySettings();  // Update toggle switches
    renderQnaList();  // Display Q&A list
    updateCount();  // Update badge "42 saved"
  });
  bindEvents();  // Attach click handlers to all buttons
});
```

**When it runs:** The moment popup HTML is fully loaded.

---

### **Section 2: loadAll() (Lines 28-34)**
```javascript
function loadAll(callback) {
  chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], (result) => {
    qnaStore = result[STORAGE_KEY] || {};
    settings = Object.assign(
      { autoSubmit: true, notifications: true },
      result[SETTINGS_KEY] || {}
    );
    if (callback) callback();
  });
}
```

**What it does:** Load Q&As and settings from Chrome storage into memory

---

### **Section 3: renderQnaList() (Lines 78-122)**
```javascript
function renderQnaList() {
  const container = document.getElementById('qna-list');
  const entries = Object.entries(qnaStore);  // [["key", {type, answer}], ...]
  
  // FILTER by type
  let filtered = entries.filter(([key, val]) => {
    if (currentFilter !== 'all' && val.type !== currentFilter) return false;
    // FILTER by search
    if (currentSearchQuery) {
      const q = (val.originalText || key).toLowerCase();
      const a = formatAnswerText(val.answer).toLowerCase();
      if (!q.includes(currentSearchQuery) && !a.includes(currentSearchQuery))
        return false;
    }
    return true;
  });
  
  // SORT by date (newest first)
  filtered.sort((a, b) => {
    const dateA = new Date(a[1].savedAt || 0);
    const dateB = new Date(b[1].savedAt || 0);
    return dateB - dateA;  // Subtract = descending order
  });
  
  // BUILD HTML cards for each Q&A
  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  
  filtered.forEach(([key, val]) => {
    const card = buildQnaCard(key, val);
    container.appendChild(card);
  });
}
```

**Flow:**
1. Get all Q&As
2. Filter by type (if chip is active)
3. Filter by search query (if user typed)
4. Sort by date
5. Build HTML card for each
6. Append to DOM

---

### **Section 4: buildQnaCard() (Lines 124-165)**
```javascript
function buildQnaCard(key, val) {
  const typeLabels = {
    single: 'Single Choice',
    multi: 'Multi Choice',
    short: 'Short Answer',
    long: 'Description',
  };
  
  const card = document.createElement('div');
  card.className = 'qna-card';
  card.dataset.key = key;
  
  const answerDisplay = formatAnswerText(val.answer);
  const dateDisplay = val.savedAt
    ? new Date(val.savedAt).toLocaleDateString('en-IN', ...)
    : 'Unknown date';
  
  card.innerHTML = `
    <div class="qna-card-header">
      <div class="qna-question">${escapeHtml(val.originalText || key)}</div>
      <span class="qna-type-badge">${typeLabels[val.type]}</span>
    </div>
    <div class="qna-answer">${escapeHtml(answerDisplay)}</div>
    <div class="qna-card-footer">
      <span class="qna-date">📅 ${dateDisplay}</span>
      <div class="qna-card-actions">
        <button data-action="edit" data-key="${key}">✏️</button>
        <button data-action="delete" data-key="${key}">🗑️</button>
      </div>
    </div>
  `;
  
  return card;  // HTML element, not added to DOM yet
}
```

**Returns:** A div with question, answer, date, and edit/delete buttons.

---

### **Section 5: saveCustomQna() (Lines 430-472)**
```javascript
function saveCustomQna() {
  const questionText = document.getElementById('custom-question').value.trim();
  const type = document.getElementById('custom-type').value;
  
  // Validation
  if (!questionText) {
    showFeedback(feedback, 'Please enter a question.', 'error');
    return;
  }
  
  const answer = getCustomAnswer(type);
  if (!answer) {
    showFeedback(feedback, 'Please provide an answer.', 'error');
    return;
  }
  
  const normalizedKey = normalizeQuestion(questionText);
  
  // Check for duplicate
  if (qnaStore[normalizedKey]) {
    showFeedback(feedback, '⚠️ This question already exists.', 'error');
    return;
  }
  
  // SAVE
  qnaStore[normalizedKey] = {
    type,
    answer,
    originalText: questionText,
    savedAt: new Date().toISOString(),
    custom: true,
  };
  
  saveQnA(() => {
    showFeedback(feedback, '✅ Q&A saved successfully!', 'success');
    // Reset form
    document.getElementById('custom-question').value = '';
    document.getElementById('custom-type').value = 'short';
    updateCustomAnswerInput();
  });
}
```

**Flow:**
1. Get question text and type from form
2. Validate (can't be empty)
3. Get answer (text, textarea, or selected options)
4. Check for duplicate
5. Save to qnaStore
6. Call saveQnA() to persist to Chrome storage
7. Reset form

---

### **Section 6: getCustomAnswer() (Lines 474-488)**
```javascript
function getCustomAnswer(type, prefix = 'custom') {
  if (type === 'short') {
    return document.getElementById('custom-answer-short').value.trim() || null;
  } else if (type === 'long') {
    return document.getElementById('custom-answer-long').value.trim() || null;
  } else if (type === 'single') {
    const selected = document.querySelector(`#options-list input[type="radio"]:checked`);
    return selected ? selected.closest('.option-row').querySelector('.option-text').value.trim() : null;
  } else if (type === 'multi') {
    const checked = document.querySelectorAll(`#options-list input[type="checkbox"]:checked`);
    const answers = Array.from(checked)
      .map(cb => cb.closest('.option-row').querySelector('.option-text').value.trim())
      .filter(Boolean);
    return answers.length > 0 ? answers : null;
  }
}
```

**What it does:** Extract answer from form based on type.
**Returns:** Text for short/long, selected option for single, array of options for multi.

---

### **Section 7: openEditModal() (Lines 491-502)**
```javascript
function openEditModal(key) {
  editingKey = key;  // Remember which Q&A we're editing
  const val = qnaStore[key];
  if (!val) return;
  
  // Populate modal with current values
  document.getElementById('modal-question-display').textContent = val.originalText || key;
  document.getElementById('modal-type').value = val.type || 'short';
  
  updateModalAnswerInput(val);  // Show answer input based on type
  
  document.getElementById('edit-modal').classList.remove('hidden');  // Show modal
}
```

**What it does:** Opens edit dialog with current Q&A values.

---

### **Section 8: importJson() (Lines 626-662)**
```javascript
function importJson(replace) {
  const raw = document.getElementById('import-json').value.trim();
  
  if (!raw) {
    showFeedback(feedback, 'Please paste JSON data first.', 'error');
    return;
  }
  
  let parsed;
  try {
    parsed = JSON.parse(raw);  // Parse JSON string to object
  } catch (e) {
    showFeedback(feedback, '❌ Invalid JSON.', 'error');
    return;
  }
  
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    showFeedback(feedback, '❌ Invalid format. Expected object.', 'error');
    return;
  }
  
  const count = Object.keys(parsed).length;
  
  if (replace) {
    qnaStore = parsed;  // Overwrite all
  } else {
    qnaStore = Object.assign({}, qnaStore, parsed);  // Merge
  }
  
  saveQnA(() => {
    renderQnaList();
    document.getElementById('import-json').value = '';
    showFeedback(feedback, `✅ Imported ${count} entries!`, 'success');
  });
}
```

**Flow:**
1. Get JSON text from textarea
2. Parse it
3. Validate it's an object
4. Merge or replace existing data
5. Save and re-render

---

## 🔄 Complete User Journey

### Scenario: User Applies to a Job

```
1. User visits naukri.com/jobs/12345
   ↓
2. Chrome content.js injects into page
   ↓
3. loadStorage() loads Q&As from storage
   ↓
4. startWatching() starts watching for new questions
   ↓
5. Question appears: "What is your expected CTC?"
   ↓
6. MutationObserver detects DOM change → calls check()
   ↓
7. findQuestions() extracts: ["What is your expected CTC?"]
   ↓
8. processQuestion("What is your expected CTC?")
   ├─ normalize: "what is your expected ctc"
   ├─ lookup in qnaStore: FOUND! {answer: "8 LPA", type: "short"}
   ├─ detectType(): TYPE.TEXT
   ├─ findTextInput(): finds <textarea>
   ├─ typeIntoField(): types "8 LPA" into textarea
   ├─ triggerReact: dispatch 'input' and 'change' events
   ├─ showToast(): shows "✓ Answer filled"
   ├─ clickSaveButton(): clicks Naukri's Save button
   ├─ add key to sessionQuestions (don't ask again)
   └─ add to cancelledQuestions with cooldown
   ↓
9. User sees: "8 LPA" in the field + green checkmark
   ↓
10. Next question appears automatically
    (Repeat from step 5)
```

---

## 🎯 Key Takeaways

| Concept | What It Does |
|---------|---|
| **normalize()** | Converts questions to a standard format for matching |
| **findContainer()** | Finds the questionnaire area on the page |
| **findQuestions()** | Extracts all question text from the DOM |
| **detectType()** | Determines if question is text/radio/checkbox |
| **processQuestion()** | Main logic: auto-fill if saved, else show overlay |
| **showOverlay()** | Modal asking user to answer unknown question |
| **typeIntoField()** | Sets value in input/textarea with React compatibility |
| **sessionQuestions** | Tracks questions already asked in THIS session |
| **cancelledQuestions** | Tracks questions user cancelled (5s cooldown) |

---

**You now understand the complete flow!** 🎉
