# 🏗️ Architecture Diagrams

Visual representations of how the extension works.

---

## 📊 Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │              │  │              │  │              │     │
│  │  manifest.   │  │ background.  │  │   popup.     │     │
│  │  json        │  │  js          │  │  html/js/css │     │
│  │              │  │              │  │              │     │
│  │ • Metadata   │  │ • Lifecycle  │  │ • Q&A List   │     │
│  │ • Perms      │  │ • Install    │  │ • Add Custom │     │
│  │ • Icons      │  │ • Update     │  │ • Settings   │     │
│  │              │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                                     │             │
│         └─────────────────┬───────────────────┘             │
│                           │                                 │
│                  Chrome Storage API                         │
│                    (Local Storage)                          │
│                           │                                 │
│         ┌─────────────────┴───────────────────┐             │
│         │                                     │             │
│         ↓                                     ↓             │
│  ┌──────────────┐                  ┌──────────────┐     │
│  │ naukriQnA    │                  │naukriSettings│     │
│  │ (Q&A Store)  │                  │  (Settings)  │     │
│  │              │                  │              │     │
│  │ {            │                  │ {            │     │
│  │  "norm_key": │                  │  "autoSubmit"│     │
│  │  {           │                  │  "notif..."  │     │
│  │    answer: ..|                  │ }            │     │
│  │    type: ... │                  │              │     │
│  │  }           │                  │              │     │
│  │ }            │                  │              │     │
│  └──────────────┘                  └──────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         ↓
    Chrome Runtime
         ↓
    naukri.com pages
         ↓
   ┌──────────────┐
   │ content.js   │ ← Injected on every page
   │              │
   │ • Watch DOM  │
   │ • Detect Q's │
   │ • Auto-fill  │
   │ • Show Modal │
   └──────────────┘
```

---

## 🔄 Data Flow - When User Applies for Job

```
┌─────────────────────────────────────────────────────────────┐
│ USER STARTS JOB APPLICATION                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
           ┌───────────────────────┐
           │  Browser Page Loads   │
           │  naukri.com/jobs/xyz  │
           └───────────┬───────────┘
                       │
                       ↓
           ┌───────────────────────┐
           │  Content.js injects   │
           │  loadStorage() called  │
           │  startWatching()      │
           └───────────┬───────────┘
                       │
                       ↓
         ┌─────────────────────────┐
         │  Load Q&As from Storage │
         │  qnaStore = {...}       │
         └────────────┬────────────┘
                      │
                      ↓
        ┌──────────────────────────┐
        │  Wait for Question (2s)  │
        │  MutationObserver listen │
        └────────────┬─────────────┘
                     │
         ╔═══════════╩═══════════╗
         ║  Question Detected!   ║
         ║ "What is your CTC?"   ║
         ╚═══════════╤═══════════╝
                     │
                     ↓
    ┌────────────────────────────────┐
    │ processQuestion("What..CTC?")  │
    ├────────────────────────────────┤
    │ 1. Normalize question:          │
    │    → "what is your ctc"        │
    │                                │
    │ 2. Lookup in qnaStore:         │
    │    ├─ FOUND:   {answer:"8LPA"} │
    │    └─ NOT FOUND: null          │
    │                                │
    │ 3. Determine Type:             │
    │    TEXT/RADIO/CHECKBOX/UNKNOWN │
    └────────────┬───────────────────┘
                 │
    ╔════════════╩════════════╗
    ║                         ║
    ↓                         ↓
┌─────────────┐       ┌───────────────┐
│ FOUND       │       │ NOT FOUND     │
│ (Saved)     │       │ (New Question)│
│             │       │               │
│ Auto-fill:  │       │ Show Overlay: │
│ • Set value │       │ • Modal popup │
│ • Trigger   │       │ • Ask user    │
│   React     │       │ • On submit:  │
│ • Click Save│       │   • Save Q&A  │
│ • Toast     │       │   • Fill form │
│ • Success!  │       │   • Click Save│
└──────┬──────┘       └───────┬───────┘
       │                      │
       └──────────┬───────────┘
                  │
                  ↓
         ┌─────────────────┐
         │ Write to Storage│
         │ saveQnA()       │
         │ chrome.storage  │
         │   .local.set()  │
         └────────┬────────┘
                  │
                  ↓
         ┌──────────────────┐
         │ Notify popup:    │
         │ Q&A count update │
         └────────┬─────────┘
                  │
                  ↓
         ┌──────────────────┐
         │ Popup refreshes  │
         │ New Q&A in list  │
         │ User can see it  │
         └──────────────────┘
```

---

## 🎯 Question Processing Flow

```
┌──────────────────────────────────────┐
│  Question Detected                   │
│  "What is your expected CTC?"        │
└──────────────┬───────────────────────┘
               │
               ↓ normalize()
        ┌────────────────────┐
        │ "what is your ctc" │ ← Key for lookup
        └────────┬───────────┘
                 │
                 ↓ Check Storage
         ┌───────────────────┐
         │ Look in qnaStore  │
         │ for this key      │
         └────────┬──────────┘
                  │
    ╔═════════════╩═════════════╗
    │                           │
    ↓ FOUND                     ↓ NOT FOUND
┌─────────────────┐      ┌────────────────┐
│ Saved: {        │      │ Never answered │
│  type: "short"  │      │ Show Overlay   │
│  answer:"8 LPA" │      │ Ask user       │
│ }               │      │ Listen for     │
└────────┬────────┘      │ submit or      │
         │               │ cancel         │
         ↓               └────────┬───────┘
    detectType()                  │
    ↓                             ↓ User submits
    ┌──────────────┐         ┌─────────────┐
    │ TYPE.TEXT    │         │ Get answer  │
    │ (text input) │         │ from modal  │
    └────────┬─────┘         └──────┬──────┘
             │                      │
             ↓ findTextInput()       │
         ┌─────────────┐            │
         │ <textarea>  │            │
         │ found       │            │
         └──────┬──────┘            │
                │                   │
                ↓ typeIntoField()    │
            ┌──────────┐            │
            │ Type "8  │            │
            │ LPA"     │            │
            └────┬─────┘            │
                 │                  │
                 ↓ dispatch events   │
            ┌───────────┐           │
            │ 'input'   │           │
            │ 'change'  │           │
            │ (React)   │           │
            └────┬──────┘           │
                 │                  │
                 └──────┬───────────┘
                        │
                        ↓ applyAndSave()
                ┌────────────────────┐
                │ Save to storage    │
                │ qnaStore[key] = {  │
                │   answer, type, .. │
                │ }                  │
                └────────┬───────────┘
                         │
                         ↓ clickSaveButton()
                    ┌──────────────┐
                    │ Find Save    │
                    │ button & click│
                    │ .sendMsg div │
                    └────────┬─────┘
                             │
                             ↓
                    ┌─────────────────┐
                    │ showToast()     │
                    │ "✓ Filled!"     │
                    │ Green checkmark │
                    └────────┬────────┘
                             │
                             ↓
                    ┌─────────────────┐
                    │ Add to          │
                    │ sessionQuestions│
                    │ (don't ask again│
                    │  in this session)
                    └─────────────────┘
```

---

## 💾 Storage Structure

```
Chrome Local Storage
│
├─ naukriQnA (Object)
│  │
│  ├─ "what is your expected ctc"
│  │  └─ {
│  │      originalText: "What is your expected CTC?",
│  │      type: "short",
│  │      answer: "8 LPA",
│  │      savedAt: "2024-03-30T16:18:00Z",
│  │      custom: false
│  │    }
│  │
│  ├─ "are you willing to relocate"
│  │  └─ {
│  │      originalText: "Are you willing to relocate?",
│  │      type: "single",
│  │      answer: "Yes",
│  │      savedAt: "2024-03-30T16:20:00Z"
│  │    }
│  │
│  └─ "which of these apply to you"
│     └─ {
│         originalText: "Which of these apply to you?",
│         type: "multi",
│         answer: ["JavaScript", "React"],
│         savedAt: "2024-03-30T16:22:00Z"
│       }
│
└─ naukriSettings (Object)
   └─ {
      autoSubmit: true,
      notifications: true
    }
```

---

## 🔀 Popup UI State Management

```
┌─────────────────────────────────────┐
│  Popup Opens                        │
│  DOMContentLoaded event             │
└─────────────────┬───────────────────┘
                  │
                  ↓ loadAll()
         ┌────────────────────┐
         │ Load from storage: │
         │ • qnaStore = {...} │
         │ • settings = {...} │
         └────────┬───────────┘
                  │
     ┌────────────┴────────────┐
     │                         │
     ↓                         ↓
 applySettings()         renderQnaList()
 │                       │
 │ Update UI toggles:    │ Render Q&A cards:
 │ □ Auto Submit         │ 1. Filter by type
 │ □ Notifications       │ 2. Filter by search
 │                       │ 3. Sort by date
 │                       │ 4. Build HTML
 │                       │ 5. Append to DOM
 │                       │
 └───────────┬───────────┘
             │
             ↓ bindEvents()
      Attach listeners:
      │
      ├─ Search input
      │  └─ renderQnaList()
      │
      ├─ Filter chips
      │  └─ renderQnaList()
      │
      ├─ Edit button
      │  └─ openEditModal()
      │
      ├─ Delete button
      │  └─ confirmDeleteQna()
      │
      ├─ Settings toggles
      │  └─ saveSettings()
      │
      ├─ Export JSON
      │  └─ Show panel
      │
      ├─ Import JSON
      │  └─ importJson()
      │
      └─ Clear all
         └─ Show confirm
```

---

## 🎭 Modal Workflows

### Edit Modal

```
User clicks ✏️ Edit
│
└─ openEditModal(key)
   │
   ├─ editingKey = key
   ├─ Get val = qnaStore[key]
   │
   ├─ Set modal-question-display = val.originalText
   ├─ Set modal-type = val.type
   │
   └─ updateModalAnswerInput(val)
      │
      ├─ Show short input    (if type="short")
      ├─ Show long textarea  (if type="long")
      └─ Show option rows    (if type="single"/"multi")
         └─ Populate with existing options

User modifies answer
│
└─ saveEditModal()
   │
   ├─ Get new answer from form
   ├─ Update: qnaStore[editingKey].answer = newAnswer
   │
   └─ saveQnA()
      ├─ Write to storage
      ├─ Notify content.js
      └─ renderQnaList() (refresh display)
```

### Confirm Modal

```
User clicks 🗑️ Delete
│
└─ confirmDeleteQna(key)
   │
   ├─ Show modal: "Delete this Q&A?"
   ├─ Question preview
   │
   └─ User clicks Delete
      │
      └─ delete qnaStore[key]
         │
         └─ saveQnA()
            └─ Refresh list
```

---

## 📊 Content.js Timing & Events

```
Timeline: Page loads → User applies → Question appears

TIME  EVENT                          ACTION
────  ─────────────────────────────  ──────────────────
 0ms  Page load                      
      └─ content.js injected
      └─ loadStorage() called
      └─ startWatching() called
         ├─ MutationObserver armed
         └─ setInterval(check, 2000)

500ms ────────────────────────────── (waiting...)

2000ms [First interval check]        
       └─ check()
         └─ findQuestions()
         └─ No questions yet

4000ms [Second interval check]
       └─ check()
         └─ Question detected!

4050ms ──────────────────────────────
       processQuestion()
       └─ Normalize
       └─ Lookup
       └─ Detect type
       └─ Find input
       └─ Type answer
       └─ Dispatch events (React)
       └─ Click Save
       └─ Show toast

4300ms ──────────────────────────────
       Toast visible for 4 seconds
       └─ Disappear at ~4.3s

4500ms ────────────────────────────── (waiting for next Q...)

6000ms [Third interval check]
       └─ Next question?
```

---

## 🔌 Chrome APIs Used

```
┌─────────────────────────────────────────────────┐
│        Chrome Extension APIs                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. Storage API                                 │
│     ├─ chrome.storage.local.get()               │
│     ├─ chrome.storage.local.set()               │
│     └─ chrome.storage.local.clear()             │
│                                                 │
│  2. Runtime API                                 │
│     ├─ chrome.runtime.onInstalled              │
│     ├─ chrome.runtime.onMessage                │
│     └─ chrome.runtime.getManifest()            │
│                                                 │
│  3. Tabs API                                    │
│     └─ chrome.tabs.sendMessage()                │
│     └─ chrome.tabs.query()                      │
│                                                 │
│  4. DOM APIs (content.js)                       │
│     ├─ document.querySelector()                 │
│     ├─ MutationObserver                         │
│     ├─ element.dispatchEvent()                  │
│     └─ document.execCommand()                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 📱 User Interactions

```
POPUP UI                          CONTENT SCRIPT (Page)

User clicks "Add Custom"
│
├─ Form: [Question] [Type] [Answer]
│
└─ Clicks "Save"
   │
   └─ saveCustomQna()
      │
      ├─ Validate
      ├─ Check for duplicates
      ├─ qnaStore[key] = {...}
      │
      └─ saveQnA()
         │
         ├─ chrome.storage.local.set()
         │
         └─ notifyContentScript()
            │
            └─ chrome.tabs.sendMessage()
               │
               └─ content.js receives: 'RELOAD_STORAGE'
                  │
                  └─ loadStorage()
                     │
                     └─ qnaStore reloaded!
                        (ready to use new Q&A)
```

---

## 🎬 Complete User Journey

```
┌──────────────────────────────────────────────────────────────┐
│ Scenario: User applies to 3 jobs                             │
└──────────────────────────────────────────────────────────────┘

JOB 1: "Senior Developer"
└─ Question: "What is your expected CTC?"
   ├─ NOT saved yet
   ├─ Overlay shows: "Please answer..."
   ├─ User types: "8 LPA"
   ├─ Saves to storage
   ├─ Content.js clicks Submit
   └─ Done!

JOB 2: "Data Analyst"
└─ Question: "What is your expected CTC?"
   ├─ FOUND in storage!
   ├─ Auto-fills: "8 LPA"
   ├─ Toast: "✓ Filled"
   ├─ Auto-submits (if enabled)
   └─ Done! (Fast!)

JOB 3: "Full Stack Developer"
└─ Question: "What is your CTC?"  (slightly different wording)
   ├─ Normalize: same as before
   ├─ FOUND in storage!
   ├─ Auto-fills: "8 LPA"
   ├─ Toast: "✓ Filled"
   └─ Done! (Fast!)

Result: User saved time on repetitive questions!
```

---

**These diagrams show the complete architecture and flow!** 🎯
