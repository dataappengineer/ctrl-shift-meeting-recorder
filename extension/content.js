// Content script injected into Google Meet pages
// Can extract meeting title and other metadata

function extractMeetingTitle() {
  // Try to get meeting name from Google Meet UI
  const titleElement = document.querySelector('[data-meeting-title]') || 
                       document.querySelector('h1');
  return titleElement ? titleElement.textContent.trim() : null;
}

// Send meeting info to popup if requested
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getMeetingInfo') {
    sendResponse({
      title: extractMeetingTitle(),
      url: window.location.href
    });
  }
});
