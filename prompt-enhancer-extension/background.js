// Service Worker for Prompt Enhancer Extension

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
    // Initialize storage with empty history
    chrome.storage.local.get(['promptHistory'], (result) => {
        if (!result.promptHistory) {
            chrome.storage.local.set({ promptHistory: [] });
        }
    });
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getHistory') {
        chrome.storage.local.get(['promptHistory'], (result) => {
            sendResponse({ history: result.promptHistory || [] });
        });
        return true;
    }

    if (request.action === 'savePrompt') {
        const { original, enhanced } = request;
        chrome.storage.local.get(['promptHistory'], (result) => {
            const history = result.promptHistory || [];
            const entry = {
                id: Date.now(),
                original: original.substring(0, 50) + (original.length > 50 ? '...' : ''),
                enhanced: enhanced,
                timestamp: new Date().toLocaleString()
            };

            history.unshift(entry);
            if (history.length > 10) {
                history.pop();
            }

            chrome.storage.local.set({ promptHistory: history }, () => {
                sendResponse({ success: true });
            });
        });
        return true;
    }
});
