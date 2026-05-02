# 🚀 Prompt Enhancer - Browser Extension

A lightweight Chrome extension that transforms raw, unstructured prompts into clear, well-organized, high-quality prompts for AI tools like Claude, ChatGPT, and more.

## ✨ Features

- **Instant Enhancement**: Transform raw prompts into structured format instantly
- **Two Modes**: Toggle between Simple and Detailed prompt formats
- **Smart Parsing**: Automatically extracts context, task, requirements, and output format
- **Easy Copy**: One-click copy button to clipboard
- **History Tracking**: Save up to 10 recent prompts (local storage)
- **Clean UI**: Minimal, modern, and user-friendly interface
- **No Dependencies**: Pure HTML, CSS, JavaScript (no frameworks)

## 📋 What It Does

### Input
```
write a function that converts celsius to fahrenheit with error handling
```

### Output (Detailed Mode)
```
## Context
Understand the background and purpose of this task.

## Task
Write a function that converts celsius to fahrenheit with error handling

## Requirements
- Error handling
- Clear and well-structured output

## Output Format
Provide clear and well-organized output.
```

## 🛠️ Installation Guide

### Step 1: Download/Locate the Extension Files
Make sure you have these files in your extension folder:
- `manifest.json`
- `popup.html`
- `popup.css`
- `popup.js`
- `background.js`

**Folder structure should look like:**
```
prompt-enhancer-extension/
├── manifest.json
├── popup.html
├── popup.css
├── popup.js
├── background.js
└── README.md
```

### Step 2: Open Chrome Extensions Page
1. Open Google Chrome
2. Click the **menu icon** (three dots) in the top-right corner
3. Go to **More Tools** → **Extensions**
   - Or, type this in the address bar: `chrome://extensions/`

### Step 3: Enable Developer Mode
- In the top-right corner of the Extensions page, toggle **Developer mode** ON

### Step 4: Load the Extension
1. Click **Load unpacked** button (appears in top-left after enabling Developer mode)
2. Navigate to and select the **prompt-enhancer-extension** folder
3. Click **Select Folder**

### Step 5: Verify Installation
- You should see the "Prompt Enhancer" extension listed on the extensions page
- Look for the extension icon in your Chrome toolbar (click the puzzle piece icon if you don't see it)
- Pin the extension to the toolbar for easy access

## 📖 How to Use

### Basic Usage
1. **Click** the Prompt Enhancer icon in your Chrome toolbar
2. **Paste** your raw prompt in the input box
3. Click **✨ Enhance Prompt** button
4. View the improved prompt in the output box
5. Click **📋 Copy** to copy the enhanced prompt to clipboard
6. Paste it into Claude, ChatGPT, or any AI tool

### Toggle Options
- **Detailed Prompt**: Includes Context, Task, Requirements, and Output Format sections
- **Simple Prompt**: Includes just Task and Requirements (more concise)

### Using History
- Recent prompts are automatically saved (last 10)
- Click any recent prompt in the history section to view it again
- Click **Clear History** to remove all saved prompts

### Clear Input
- Click **Clear** button to reset the input box

## 💡 Tips for Best Results

1. **More Detail = Better Output**: The more details you provide, the better the enhancement
2. **Use Keywords**: Include keywords like "context", "requirement", "output format"
3. **Multiple Lines**: Put different aspects on separate lines for better parsing

**Example:**
```
Write a Python function
Context: The function should calculate compound interest
Requirements: include error handling, add type hints, use clear variable names
Output format: return a dictionary with yearly breakdown
```

## 🎯 Features Explained

### Context Extraction
The extension looks for context clues in your prompt and structures them properly.

### Task Identification
Automatically identifies the main task from your input.

### Requirements Parsing
Extracts technical requirements and constraints from your prompt.

### Output Format
Helps specify how the output should be structured or formatted.

## 🔒 Privacy & Security

- **All processing is local**: No data is sent to external servers
- **Storage is local**: History is stored only in your browser
- **No permissions abuse**: Only uses Chrome storage API
- **No tracking**: Completely anonymous

## 🐛 Troubleshooting

### Extension doesn't appear in toolbar
- Click the **puzzle piece icon** in Chrome (top-right)
- Find "Prompt Enhancer" in the list
- Click the **pin icon** next to it

### Developer Mode button doesn't show
- Make sure you're on `chrome://extensions/` page
- Refresh the page (Ctrl+R)

### Can't find the extension folder
- Make sure you're in the correct directory with all 5 files
- Check that `manifest.json` is in the root of the folder

### History not showing
- Try refreshing the popup window
- Check if you have storage enabled in Chrome settings

### Copy button not working
- Try copying manually (Ctrl+A to select all, Ctrl+C to copy)
- Check your Chrome permissions

## 📝 File Descriptions

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration and metadata |
| `popup.html` | User interface structure |
| `popup.css` | Styling and layout |
| `popup.js` | Main logic and enhancement algorithm |
| `background.js` | Service worker for storage management |

## 🎨 UI Overview

```
┌─────────────────────────────────────┐
│  Prompt Enhancer                    │
│  Transform your raw prompts...      │
├─────────────────────────────────────┤
│ Your Raw Prompt:                    │
│ [Text input area                 ]  │
├─────────────────────────────────────┤
│ ☑ Detailed Prompt  [Clear]          │
├─────────────────────────────────────┤
│ [✨ Enhance Prompt                 ]│
├─────────────────────────────────────┤
│ Enhanced Prompt:          [📋 Copy]  │
│ [Output area with result         ]  │
├─────────────────────────────────────┤
│ Recent Prompts:                     │
│ • Prompt 1...        [12:34 PM]     │
│ • Prompt 2...        [12:30 PM]     │
│ [Clear History]                     │
├─────────────────────────────────────┤
│ Made with ❤️ for better prompts     │
└─────────────────────────────────────┘
```

## 🚀 Advanced Usage

### Custom Enhancement Tips

1. **For Code Prompts**: 
   - Include programming language
   - Mention libraries/frameworks
   - Specify error handling needs

2. **For Content Creation**:
   - Define target audience
   - Specify tone/style
   - Mention length preferences

3. **For Analysis Tasks**:
   - Provide context
   - List what you want analyzed
   - Specify output format

## 📦 What's Included

✅ Fully functional enhancement algorithm
✅ Beautiful, responsive UI design
✅ Local storage for history (10 prompts)
✅ Simple and Detailed mode toggle
✅ Copy-to-clipboard functionality
✅ No external dependencies
✅ Pure vanilla JavaScript
✅ Comprehensive error handling
✅ Mobile-friendly design

## 🔄 Future Enhancements (Optional)

Possible additions for future versions:
- Export history to file
- Custom prompt templates
- Cloud sync (with user permission)
- Keyboard shortcuts
- Dark mode toggle
- Multi-language support

## ❓ FAQ

**Q: Does this send my prompts anywhere?**
A: No! Everything runs locally on your computer.

**Q: Can I edit the enhancement logic?**
A: Yes! The enhancement code is in `popup.js` - feel free to customize it.

**Q: How many prompts can I save?**
A: The last 10 prompts are automatically saved in your browser's local storage.

**Q: Does it work in other browsers?**
A: This version is for Chrome. Firefox would need some adjustments to the code.

**Q: Can I use this offline?**
A: Yes! The extension works completely offline.

## 📞 Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Verify all files are in the correct folder
3. Try disabling and re-enabling the extension
4. Check the Chrome DevTools console for errors (right-click popup → Inspect)

## 📄 License

This extension is open-source and free to use, modify, and distribute.

## ✨ Version History

**v1.0.0** (Initial Release)
- Core enhancement functionality
- Simple and Detailed modes
- History tracking
- Copy to clipboard
- Clean UI design

---

**Enjoy better prompts! 🎉**

Made with ❤️ for AI tool users everywhere.
