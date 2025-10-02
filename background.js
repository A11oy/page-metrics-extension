// Store metrics by tab ID
const metricsStore = {};

// Store CLS debugger state by tab ID
const clsDebuggerState = {};

// Store error logs by tab ID
const errorStore = {};

// Store recommendations by tab ID for in-memory tracking
const recommendationsStore = {};

// Configuration for automatic cleanup
const RECOMMENDATIONS_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

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
    } else if (message.type === "recommendationsGenerated") {
      // Handle performance recommendations data
      if (!message.data || typeof message.data !== "object") {
        console.error("Invalid recommendations data received from tab", tabId);
        sendResponse({ success: false, error: "Invalid recommendations data" });
        return;
      }

      // Validate tab isolation - ensure data is for the correct tab
      if (
        message.data.metadata &&
        message.data.metadata.tabId &&
        message.data.metadata.tabId !== tabId
      ) {
        console.error(`Tab ID mismatch: expected ${tabId}, got ${message.data.metadata.tabId}`);
        sendResponse({ success: false, error: "Tab ID validation failed" });
        return;
      }

      const timestamp = Date.now();
      const recommendationsData = {
        ...message.data,
        metadata: {
          ...message.data.metadata,
          tabId: tabId, // Ensure tab ID is always set
          timestamp: timestamp,
          url: sender.tab.url, // Ensure URL is always set for validation
        },
      };

      // Store in memory for quick access
      recommendationsStore[tabId] = {
        data: recommendationsData,
        timestamp: timestamp,
      };

      // Store recommendations for this specific tab
      chrome.storage.local.set(
        {
          [`recommendations_${tabId}`]: recommendationsData,
          [`recommendationsTimestamp_${tabId}`]: timestamp,
          [`recommendationsLoading_${tabId}`]: false,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error("Error storing recommendations:", chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            console.log(`Recommendations stored for tab ${tabId}`);
            sendResponse({ success: true });
          }
        }
      );
    } else if (message.type === "recommendationsError") {
      // Handle recommendations generation errors
      const errorData = {
        error: message.error,
        timestamp: message.timestamp || Date.now(),
        url: sender.tab.url,
        tabId: tabId,
      };

      chrome.storage.local.set(
        {
          [`recommendationsError_${tabId}`]: errorData,
          [`recommendationsLoading_${tabId}`]: false,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error("Error storing recommendations error:", chrome.runtime.lastError);
          } else {
            console.warn(`Recommendations error stored for tab ${tabId}:`, errorData);
          }
        }
      );

      sendResponse({ success: true });
    } else if (message.type === "recommendationsLoading") {
      // Set loading state for recommendations generation
      chrome.storage.local.set({ [`recommendationsLoading_${tabId}`]: true }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error setting recommendations loading state:", chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true });
        }
      });
    } else if (message.type === "getRecommendations") {
      // Retrieve recommendations for this specific tab with enhanced validation
      const requestingUrl = message.url;

      // First validate access rights
      validateRecommendationsAccess(tabId, requestingUrl)
        .then((validation) => {
          if (!validation.valid) {
            console.warn(`Access validation failed for tab ${tabId}: ${validation.reason}`);
            sendResponse({ success: false, error: `Access denied: ${validation.reason}` });
            return;
          }

          chrome.storage.local.get(
            [`recommendations_${tabId}`, `recommendationsTimestamp_${tabId}`],
            (result) => {
              if (chrome.runtime.lastError) {
                console.error("Error retrieving recommendations:", chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
                return;
              }

              const recommendations = result[`recommendations_${tabId}`];
              const timestamp = result[`recommendationsTimestamp_${tabId}`];

              if (!recommendations) {
                sendResponse({ success: true, data: null });
                return;
              }

              // Validate tab isolation with current URL
              if (!validateTabIsolation(tabId, recommendations, validation.currentUrl)) {
                console.warn(
                  `Tab isolation validation failed for tab ${tabId}, removing invalid data`
                );
                chrome.storage.local.remove([
                  `recommendations_${tabId}`,
                  `recommendationsTimestamp_${tabId}`,
                  `recommendationsError_${tabId}`,
                ]);
                delete recommendationsStore[tabId];
                sendResponse({ success: true, data: null });
                return;
              }

              sendResponse({
                success: true,
                data: recommendations,
                timestamp: timestamp,
              });
            }
          );
        })
        .catch((error) => {
          console.error("Error validating recommendations access:", error);
          sendResponse({ success: false, error: "Validation error" });
        });
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

  // If URL changed, reset CLS debugger state and recommendations for this tab
  if (changeInfo.url) {
    delete clsDebuggerState[tabId];
    delete recommendationsStore[tabId];

    // Clear recommendations data when URL changes to prevent stale data
    chrome.storage.local.remove([
      `clsDebugger_${tabId}`,
      `recommendations_${tabId}`,
      `recommendationsTimestamp_${tabId}`,
      `recommendationsLoading_${tabId}`,
      `recommendationsError_${tabId}`,
    ]);

    console.log(`URL changed for tab ${tabId}, cleared recommendations data`);
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  // Clean up stored data for this tab
  delete metricsStore[tabId];
  delete clsDebuggerState[tabId];
  delete errorStore[tabId];
  delete recommendationsStore[tabId];

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
    `recommendations_${tabId}`,
    `recommendationsTimestamp_${tabId}`,
    `recommendationsLoading_${tabId}`,
    `recommendationsError_${tabId}`,
  ]);
});

// Automatic cleanup of old recommendations data
function cleanupOldRecommendations() {
  const now = Date.now();

  chrome.storage.local.get(null, (items) => {
    if (chrome.runtime.lastError) {
      console.error("Error retrieving storage for cleanup:", chrome.runtime.lastError);
      return;
    }

    const keysToRemove = [];

    // Check all stored recommendations
    for (const key in items) {
      if (key.startsWith("recommendationsTimestamp_")) {
        const timestamp = items[key];
        const age = now - timestamp;

        if (age > RECOMMENDATIONS_MAX_AGE_MS) {
          const tabId = key.replace("recommendationsTimestamp_", "");

          // Mark related keys for removal
          keysToRemove.push(
            `recommendations_${tabId}`,
            `recommendationsTimestamp_${tabId}`,
            `recommendationsError_${tabId}`
          );

          // Clean up in-memory store
          delete recommendationsStore[tabId];

          console.log(
            `Cleaning up old recommendations for tab ${tabId} (age: ${Math.round(
              age / 1000 / 60
            )} minutes)`
          );
        }
      }
    }

    // Remove old data
    if (keysToRemove.length > 0) {
      chrome.storage.local.remove(keysToRemove, () => {
        if (chrome.runtime.lastError) {
          console.error("Error removing old recommendations:", chrome.runtime.lastError);
        } else {
          console.log(`Cleaned up ${keysToRemove.length / 3} old recommendation entries`);
        }
      });
    }
  });
}

// Validate tab isolation for recommendations data
function validateTabIsolation(tabId, data, currentUrl = null) {
  // Check if data contains tab ID and if it matches
  if (data && data.metadata && data.metadata.tabId) {
    if (data.metadata.tabId !== tabId) {
      console.error(
        `Tab isolation violation: data for tab ${data.metadata.tabId} accessed from tab ${tabId}`
      );
      return false;
    }
  }

  // Check URL to prevent cross-page data contamination
  if (currentUrl && data && data.metadata && data.metadata.url) {
    if (data.metadata.url !== currentUrl) {
      console.warn(
        `URL mismatch for tab ${tabId}: stored URL ${data.metadata.url} vs current URL ${currentUrl}`
      );
      return false;
    }
  }

  // Check timestamp to prevent stale data issues
  if (data && data.metadata && data.metadata.timestamp) {
    const age = Date.now() - data.metadata.timestamp;
    if (age > RECOMMENDATIONS_MAX_AGE_MS) {
      console.warn(
        `Stale recommendations data detected for tab ${tabId} (age: ${Math.round(
          age / 1000 / 60
        )} minutes)`
      );
      return false;
    }
  }

  return true;
}

// Enhanced validation for cross-tab data contamination prevention
function validateRecommendationsAccess(tabId, requestingUrl = null) {
  return new Promise((resolve) => {
    // Get current tab info to validate access
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.error(`Error getting tab ${tabId}:`, chrome.runtime.lastError);
        resolve({ valid: false, reason: "tab_not_found" });
        return;
      }

      // Validate URL if provided
      if (requestingUrl && tab.url !== requestingUrl) {
        console.warn(
          `URL validation failed for tab ${tabId}: expected ${tab.url}, got ${requestingUrl}`
        );
        resolve({ valid: false, reason: "url_mismatch" });
        return;
      }

      // Check if tab is still active/valid
      if (
        !tab.url ||
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://")
      ) {
        resolve({ valid: false, reason: "invalid_page_type" });
        return;
      }

      resolve({ valid: true, currentUrl: tab.url });
    });
  });
}

// Periodic validation to ensure cross-tab isolation integrity
function validateAllTabData() {
  chrome.storage.local.get(null, (items) => {
    if (chrome.runtime.lastError) {
      console.error("Error retrieving storage for validation:", chrome.runtime.lastError);
      return;
    }

    const keysToRemove = [];

    // Check all stored recommendations for integrity
    for (const key in items) {
      if (key.startsWith("recommendations_")) {
        const tabId = parseInt(key.replace("recommendations_", ""));
        const data = items[key];

        // Validate tab still exists
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            // Tab no longer exists, mark for cleanup
            keysToRemove.push(
              `recommendations_${tabId}`,
              `recommendationsTimestamp_${tabId}`,
              `recommendationsError_${tabId}`,
              `recommendationsLoading_${tabId}`
            );
            delete recommendationsStore[tabId];
            console.log(`Cleaning up recommendations for non-existent tab ${tabId}`);
          } else if (data && data.metadata && data.metadata.url && tab.url !== data.metadata.url) {
            // URL mismatch, mark for cleanup
            keysToRemove.push(
              `recommendations_${tabId}`,
              `recommendationsTimestamp_${tabId}`,
              `recommendationsError_${tabId}`
            );
            delete recommendationsStore[tabId];
            console.log(`Cleaning up recommendations for tab ${tabId} due to URL mismatch`);
          }
        });
      }
    }

    // Clean up invalid data
    if (keysToRemove.length > 0) {
      chrome.storage.local.remove(keysToRemove, () => {
        if (chrome.runtime.lastError) {
          console.error("Error removing invalid recommendations:", chrome.runtime.lastError);
        } else {
          console.log(`Cleaned up ${keysToRemove.length} invalid recommendation entries`);
        }
      });
    }
  });
}

// Start periodic cleanup and validation
setInterval(cleanupOldRecommendations, CLEANUP_INTERVAL_MS);
setInterval(validateAllTabData, CLEANUP_INTERVAL_MS * 2); // Run validation less frequently

// Run initial cleanup and validation on startup
cleanupOldRecommendations();
validateAllTabData();
