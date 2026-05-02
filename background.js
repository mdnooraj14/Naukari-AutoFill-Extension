/**
 * Naukri AutoFill Assistant - Background Service Worker
 * Handles extension lifecycle events.
 */

// On first install, set default settings
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      naukriSettings: {
        autoSubmit: true,
        notifications: true,
      },
      naukriQnA: {},
    });
    console.log('[Naukri AutoFill] Extension installed. Default settings applied.');
  }

  if (details.reason === 'update') {
    console.log('[Naukri AutoFill] Extension updated to version', chrome.runtime.getManifest().version);
  }
});
