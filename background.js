chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "performanceMetrics") {
    chrome.storage.local.set({ metrics: message.data });
  }
});
