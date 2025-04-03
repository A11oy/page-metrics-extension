// Store metrics by tab ID
const metricsStore = {};

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab) {
    return; // Skip if not from a tab
  }
  
  const tabId = sender.tab.id;
  
  if (message.type === "performanceMetrics") {
    // Store metrics for this specific tab
    metricsStore[tabId] = message.data;
    
    // Store in local storage with tab ID as part of the key
    chrome.storage.local.set({ 
      [`metrics_${tabId}`]: message.data,
      lastUpdatedTabId: tabId
    }, () => {
      // After metrics are saved, immediately clear the loading flag for this tab
      chrome.storage.local.set({ [`metricsLoading_${tabId}`]: false });
    });
    
    // Send a response to acknowledge receipt
    sendResponse({ success: true });
  } else if (message.type === "metricsLoading") {
    // Set loading state for this specific tab
    chrome.storage.local.set({ [`metricsLoading_${tabId}`]: true });
    sendResponse({ success: true });
  }
  
  // Return true to indicate async response
  return true;
});

// Listen for tab activation to update popup with the right metrics
chrome.tabs.onActivated.addListener((activeInfo) => {
  // When a tab becomes active, mark it as the active tab
  chrome.storage.local.set({ activeTabId: activeInfo.tabId });
});

// Keep track of tab updates (e.g., URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // When a tab completes loading, check if it's the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id === tabId) {
        chrome.storage.local.set({ activeTabId: tabId });
      }
    });
  }
});
