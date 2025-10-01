// Store metrics by tab ID
const metricsStore = {};

// Store CLS debugger state by tab ID
const clsDebuggerState = {};

// Store error logs by tab ID
const errorStore = {};

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab) {
    return; // Skip if not from a tab
  }

  const tabId = sender.tab.id;

  try {
    if (message.type === "performanceMetrics") {
      // Validate metrics data before storing
      if (!message.data || typeof message.data !== "object") {
        console.error("Invalid metrics data received from tab", tabId);
        sendResponse({ success: false, error: "Invalid metrics data" });
        return;
      }

      // Store metrics for this specific tab
      metricsStore[tabId] = message.data;

      // Store in local storage with tab ID as part of the key
      chrome.storage.local.set(
        {
          [`metrics_${tabId}`]: message.data,
          lastUpdatedTabId: tabId,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error("Error storing metrics:", chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            // After metrics are saved, immediately clear the loading flag for this tab
            chrome.storage.local.set({ [`metricsLoading_${tabId}`]: false });
            sendResponse({ success: true });
          }
        }
      );
    } else if (message.type === "metricsLoading") {
      // Set loading state for this specific tab
      chrome.storage.local.set({ [`metricsLoading_${tabId}`]: true }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error setting loading state:", chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true });
        }
      });
    } else if (message.type === "metricsError") {
      // Handle error reports from content scripts
      const errorData = {
        errorType: message.errorType,
        errorMessage: message.errorMessage,
        timestamp: message.timestamp || Date.now(),
        url: message.url || sender.tab.url,
        userAgent: message.userAgent,
        tabId: tabId,
      };

      // Store error for this tab
      if (!errorStore[tabId]) {
        errorStore[tabId] = [];
      }
      errorStore[tabId].push(errorData);

      // Keep only last 10 errors per tab
      if (errorStore[tabId].length > 10) {
        errorStore[tabId] = errorStore[tabId].slice(-10);
      }

      // Store in local storage for popup access
      chrome.storage.local.set({
        [`errors_${tabId}`]: errorStore[tabId],
        [`hasErrors_${tabId}`]: true,
      });

      console.warn(`Metrics error in tab ${tabId}:`, errorData);
      sendResponse({ success: true });
    } else if (message.type === "clsDebuggerState") {
      // Store CLS debugger state for this tab
      clsDebuggerState[tabId] = message.enabled;
      chrome.storage.local.set({ [`clsDebugger_${tabId}`]: message.enabled }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error storing CLS debugger state:", chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true });
        }
      });
    } else if (message.type === "getCurrentTabId") {
      // Return the current tab ID
      sendResponse({ tabId: tabId });
    } else if (message.type === "pageNotSupported") {
      // Handle unsupported page notifications
      const pageError = {
        type: "unsupported_page",
        pageType: message.pageType,
        reason: message.reason,
        url: message.url,
        timestamp: message.timestamp,
        tabId: tabId,
      };

      // Store page support info
      chrome.storage.local.set({
        [`pageSupport_${tabId}`]: pageError,
        [`metricsLoading_${tabId}`]: false, // Clear loading state
      });

      console.log(`Page not supported in tab ${tabId}:`, pageError);
      sendResponse({ success: true });
    } else if (message.type === "permissionError") {
      // Handle permission errors
      const permissionError = {
        type: "permission_error",
        limitations: message.limitations,
        url: message.url,
        timestamp: message.timestamp,
        tabId: tabId,
      };

      chrome.storage.local.set({
        [`permissionError_${tabId}`]: permissionError,
        [`metricsLoading_${tabId}`]: false,
      });

      console.warn(`Permission error in tab ${tabId}:`, permissionError);
      sendResponse({ success: true });
    } else if (message.type === "apiNotSupported") {
      // Handle API not supported errors
      const apiError = {
        type: "api_not_supported",
        missingAPIs: message.missingAPIs,
        userAgent: message.userAgent,
        url: message.url,
        timestamp: message.timestamp,
        tabId: tabId,
      };

      chrome.storage.local.set({
        [`apiSupport_${tabId}`]: apiError,
        [`metricsLoading_${tabId}`]: false,
      });

      console.warn(`API not supported in tab ${tabId}:`, apiError);
      sendResponse({ success: true });
    } else if (message.type === "performanceLimitations") {
      // Handle performance limitations notifications
      const limitations = {
        type: "performance_limitations",
        limitations: message.limitations,
        url: message.url,
        timestamp: message.timestamp,
        tabId: tabId,
      };

      chrome.storage.local.set({ [`limitations_${tabId}`]: limitations });

      console.info(`Performance limitations in tab ${tabId}:`, limitations);
      sendResponse({ success: true });
    } else {
      // Unknown message type
      console.warn("Unknown message type received:", message.type);
      sendResponse({ success: false, error: "Unknown message type" });
    }
  } catch (error) {
    console.error("Error processing message from content script:", error);
    sendResponse({ success: false, error: error.message });
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
  if (changeInfo.status === "complete") {
    // When a tab completes loading, check if it's the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id === tabId) {
        chrome.storage.local.set({ activeTabId: tabId });
      }
    });
  }

  // If URL changed, reset CLS debugger state for this tab
  if (changeInfo.url) {
    delete clsDebuggerState[tabId];
    chrome.storage.local.remove([`clsDebugger_${tabId}`]);
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  // Clean up stored data for this tab
  delete metricsStore[tabId];
  delete clsDebuggerState[tabId];
  delete errorStore[tabId];

  // Clean up storage
  chrome.storage.local.remove([
    `metrics_${tabId}`,
    `metricsLoading_${tabId}`,
    `clsDebugger_${tabId}`,
    `errors_${tabId}`,
    `hasErrors_${tabId}`,
    `pageSupport_${tabId}`,
    `permissionError_${tabId}`,
    `apiSupport_${tabId}`,
    `limitations_${tabId}`,
  ]);
});
