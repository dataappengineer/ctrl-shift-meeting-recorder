// Background service worker for the extension
// Handles persistent state and notifications

chrome.runtime.onInstalled.addListener(() => {
  console.log('Ctrl+Shift Meeting Recorder installed');
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getMeetingTitle') {
    // Could extract meeting title from Google Meet page
    sendResponse({title: 'Meeting'});
  }
});
