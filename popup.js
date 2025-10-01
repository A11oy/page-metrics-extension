// Core Web Vitals thresholds based on Google's recommendations
const CWV_THRESHOLDS = {
  FCP: { good: 1.8, needsImprovement: 3.0 },
  LCP: { good: 2.5, needsImprovement: 4.0 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  TTFB: { good: 0.8, needsImprovement: 1.8 },
};

// Evaluate metric against thresholds
function evaluateMetric(metricName, value) {
  const thresholds = CWV_THRESHOLDS[metricName];
  if (!thresholds || value === null || value === undefined) {
    return { status: "unknown", color: "gray", icon: "?", accessible_indicator: "Unknown" };
  }

  if (value <= thresholds.good) {
    return { status: "good", color: "green", icon: "✓", accessible_indicator: "Good" };
  } else if (value <= thresholds.needsImprovement) {
    return {
      status: "needs-improvement",
      color: "orange",
      icon: "⚠",
      accessible_indicator: "Needs Improvement",
    };
  } else {
    return { status: "poor", color: "red", icon: "✗", accessible_indicator: "Poor" };
  }
}

// Format metric value with appropriate units
function formatMetricValue(metricName, value) {
  // Handle null, undefined, or non-numeric values
  if (value === null || value === undefined || typeof value !== "number" || isNaN(value)) {
    // Only log once per metric to avoid spam
    if (!window.loggedFormatErrors) window.loggedFormatErrors = new Set();
    if (!window.loggedFormatErrors.has(metricName)) {
      console.warn(`formatMetricValue: Invalid value for ${metricName}:`, {
        value,
        type: typeof value,
      });
      window.loggedFormatErrors.add(metricName);
    }
    return "N/A";
  }

  try {
    if (metricName === "CLS") {
      return value.toFixed(3);
    } else {
      return `${(value * 1000).toFixed(0)}ms`;
    }
  } catch (error) {
    console.error(`formatMetricValue: Error formatting ${metricName}:`, { value, error });
    return "Error";
  }
}

// LoadingStateManager class for enhanced loading indicators
class LoadingStateManager {
  constructor() {
    this.currentState = "idle"; // idle, loading, loaded, error
    this.loadingPhase = null; // collection, processing, complete
    this.progressValue = 0;
    this.loadingStartTime = null;
    this.phaseTimeouts = [];

    // Loading phases configuration
    this.LOADING_PHASES = {
      collection: { duration: 2000, label: "Collecting performance data..." },
      processing: { duration: 1000, label: "Processing metrics..." },
      complete: { duration: 500, label: "Finalizing results..." },
    };

    // UI elements
    this.loadingContainer = null;
    this.loadingSpinner = null;
    this.loadingText = null;
    this.progressBar = null;

    this.initializeElements();
  }

  // Initialize UI elements
  initializeElements() {
    this.loadingContainer = document.getElementById("loading-state");
    this.loadingSpinner = this.loadingContainer?.querySelector(".loading-spinner");
    this.loadingText = this.loadingContainer?.querySelector(".loading-text");

    // Create progress bar if it doesn't exist
    if (this.loadingContainer && !this.loadingContainer.querySelector(".loading-progress")) {
      this.createProgressBar();
    }
  }

  // Create enhanced progress bar
  createProgressBar() {
    const progressContainer = document.createElement("div");
    progressContainer.className = "loading-progress-container";
    progressContainer.setAttribute("aria-hidden", "true");

    this.progressBar = document.createElement("div");
    this.progressBar.className = "loading-progress";
    this.progressBar.style.width = "0%";

    const progressTrack = document.createElement("div");
    progressTrack.className = "loading-progress-track";
    progressTrack.appendChild(this.progressBar);

    progressContainer.appendChild(progressTrack);

    // Insert after spinner but before text
    if (this.loadingSpinner && this.loadingText) {
      this.loadingContainer.insertBefore(progressContainer, this.loadingText);
    }
  }

  // Start loading with enhanced progress tracking
  startLoading(context = "default") {
    this.currentState = "loading";
    this.loadingStartTime = Date.now();
    this.progressValue = 0;
    this.clearPhaseTimeouts();

    console.log(`LoadingStateManager: Starting loading (context: ${context})`);

    // Show loading UI
    this.showLoadingState();

    // Start progress simulation
    this.simulateProgress();

    // Announce to screen readers
    announceToScreenReader("Loading performance metrics");

    return this;
  }

  // Simulate realistic progress through phases
  simulateProgress() {
    let currentPhaseIndex = 0;
    const phases = Object.keys(this.LOADING_PHASES);

    const progressPhase = (phaseIndex) => {
      if (phaseIndex >= phases.length || this.currentState !== "loading") {
        return;
      }

      const phaseName = phases[phaseIndex];
      const phase = this.LOADING_PHASES[phaseName];
      this.loadingPhase = phaseName;

      // Update loading text
      if (this.loadingText) {
        this.loadingText.textContent = phase.label;
      }

      // Animate progress for this phase
      const phaseStartProgress = (phaseIndex / phases.length) * 100;
      const phaseEndProgress = ((phaseIndex + 1) / phases.length) * 100;

      this.animateProgressToValue(phaseStartProgress, phaseEndProgress, phase.duration, () => {
        // Move to next phase
        const timeout = setTimeout(() => {
          progressPhase(phaseIndex + 1);
        }, 100);
        this.phaseTimeouts.push(timeout);
      });
    };

    // Start with first phase
    progressPhase(0);
  }

  // Animate progress bar to specific value
  animateProgressToValue(startValue, endValue, duration, callback) {
    const startTime = Date.now();
    const valueRange = endValue - startValue;

    const animate = () => {
      if (this.currentState !== "loading") {
        return;
      }

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Use easing function for smooth animation
      const easedProgress = this.easeOutCubic(progress);
      const currentValue = startValue + valueRange * easedProgress;

      this.updateProgressBar(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else if (callback) {
        callback();
      }
    };

    requestAnimationFrame(animate);
  }

  // Easing function for smooth animations
  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // Update progress bar visual state
  updateProgressBar(value) {
    this.progressValue = Math.max(0, Math.min(100, value));

    if (this.progressBar) {
      this.progressBar.style.width = `${this.progressValue}%`;
      this.progressBar.setAttribute("aria-valuenow", Math.round(this.progressValue));
    }
  }

  // Complete loading successfully
  completeLoading(metrics = null) {
    if (this.currentState !== "loading") {
      return;
    }

    this.currentState = "loaded";
    this.clearPhaseTimeouts();

    console.log("LoadingStateManager: Loading completed successfully");

    // Complete progress animation
    this.animateProgressToValue(this.progressValue, 100, 300, () => {
      // Brief delay to show completion
      setTimeout(() => {
        this.hideLoadingState();
        announceToScreenReader("Performance metrics loaded successfully");
      }, 200);
    });

    // Update loading text to show completion
    if (this.loadingText) {
      this.loadingText.textContent = "Metrics loaded!";
    }
  }

  // Handle loading error
  errorLoading(errorMessage) {
    if (this.currentState === "error") {
      return; // Already in error state
    }

    this.currentState = "error";
    this.clearPhaseTimeouts();

    console.log(`LoadingStateManager: Loading error - ${errorMessage}`);

    this.hideLoadingState();
    announceToScreenReader(`Loading failed: ${errorMessage}`);
  }

  // Reset to idle state
  reset() {
    this.currentState = "idle";
    this.loadingPhase = null;
    this.progressValue = 0;
    this.loadingStartTime = null;
    this.clearPhaseTimeouts();

    this.hideLoadingState();
  }

  // Clear all phase timeouts
  clearPhaseTimeouts() {
    this.phaseTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.phaseTimeouts = [];
  }

  // Show loading state UI
  showLoadingState() {
    const loadingState = document.getElementById("loading-state");
    const metricsTable = document.getElementById("metrics-table");
    const errorState = document.getElementById("error-state");

    if (loadingState) {
      loadingState.style.display = "flex";
      loadingState.setAttribute("aria-busy", "true");
    }
    if (metricsTable) metricsTable.style.display = "none";
    if (errorState) errorState.style.display = "none";

    // Reset progress bar
    this.updateProgressBar(0);
  }

  // Hide loading state UI
  hideLoadingState() {
    const loadingState = document.getElementById("loading-state");

    if (loadingState) {
      loadingState.style.display = "none";
      loadingState.setAttribute("aria-busy", "false");
    }
  }

  // Get current loading state
  getState() {
    return {
      state: this.currentState,
      phase: this.loadingPhase,
      progress: this.progressValue,
      duration: this.loadingStartTime ? Date.now() - this.loadingStartTime : 0,
    };
  }

  // Check if currently loading
  isLoading() {
    return this.currentState === "loading";
  }
}

// Initialize loading state manager
const loadingStateManager = new LoadingStateManager();

// Enhanced State Management System for stale data prevention
class StateManager {
  constructor() {
    this.currentTabId = null;
    this.tabStates = new Map();
    this.staleDataTimeout = 30000; // 30 seconds
    this.navigationTimeout = 5000; // 5 seconds for navigation detection
    this.cleanupInterval = null;

    this.initializeStateManagement();
  }

  // Initialize state management system
  initializeStateManagement() {
    // Start periodic cleanup
    this.startPeriodicCleanup();

    // Listen for tab changes
    this.setupTabChangeListeners();
  }

  // Setup listeners for tab changes and navigation
  setupTabChangeListeners() {
    // Listen for storage changes to detect cross-tab updates
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "local") {
        this.handleStorageChanges(changes);
      }
    });
  }

  // Handle storage changes from other tabs or content scripts
  handleStorageChanges(changes) {
    for (const [key, change] of Object.entries(changes)) {
      if (key.startsWith("metrics_")) {
        const tabId = parseInt(key.replace("metrics_", ""));

        if (change.newValue) {
          this.updateTabState(tabId, {
            metrics: change.newValue,
            lastUpdated: Date.now(),
            isStale: false,
          });
        } else {
          // Metrics were removed
          this.removeTabState(tabId);
        }
      } else if (key.startsWith("metricsLoading_")) {
        const tabId = parseInt(key.replace("metricsLoading_", ""));

        this.updateTabState(tabId, {
          isLoading: change.newValue === true,
          loadingStartTime: change.newValue === true ? Date.now() : null,
        });
      }
    }
  }

  // Update state for a specific tab
  updateTabState(tabId, stateUpdate) {
    const currentState = this.tabStates.get(tabId) || {};
    const newState = { ...currentState, ...stateUpdate, lastActivity: Date.now() };

    this.tabStates.set(tabId, newState);

    // If this is the current tab, validate state consistency
    if (tabId === this.currentTabId) {
      this.validateCurrentTabState();
    }
  }

  // Remove state for a tab
  removeTabState(tabId) {
    this.tabStates.delete(tabId);
  }

  // Set current active tab
  setCurrentTab(tabId) {
    const previousTabId = this.currentTabId;
    this.currentTabId = tabId;

    // Mark previous tab as inactive
    if (previousTabId && previousTabId !== tabId) {
      this.updateTabState(previousTabId, { isActive: false });
    }

    // Mark current tab as active
    this.updateTabState(tabId, { isActive: true });

    // Validate current tab state
    this.validateCurrentTabState();
  }

  // Validate current tab state for consistency
  validateCurrentTabState() {
    if (!this.currentTabId) return;

    const tabState = this.tabStates.get(this.currentTabId);
    if (!tabState) return;

    const now = Date.now();

    // Check for stale data
    if (tabState.metrics && tabState.lastUpdated) {
      const dataAge = now - tabState.lastUpdated;

      if (dataAge > this.staleDataTimeout) {
        this.markDataAsStale(this.currentTabId);
      }
    }

    // Check for stuck loading states
    if (tabState.isLoading && tabState.loadingStartTime) {
      const loadingDuration = now - tabState.loadingStartTime;

      if (loadingDuration > this.navigationTimeout) {
        console.warn(`Loading state stuck for tab ${this.currentTabId}, clearing...`);
        this.clearStuckLoadingState(this.currentTabId);
      }
    }
  }

  // Mark data as stale for a tab
  markDataAsStale(tabId) {
    this.updateTabState(tabId, { isStale: true });

    // If this is the current tab, show stale data warning
    if (tabId === this.currentTabId) {
      this.showStaleDataWarning();
    }
  }

  // Clear stuck loading state
  clearStuckLoadingState(tabId) {
    // Clear loading state in storage
    chrome.storage.local.set({ [`metricsLoading_${tabId}`]: false });

    // Update local state
    this.updateTabState(tabId, {
      isLoading: false,
      loadingStartTime: null,
    });

    // If this is the current tab and loading manager is still loading, reset it
    if (tabId === this.currentTabId && loadingStateManager.isLoading()) {
      loadingStateManager.errorLoading("Loading timeout - please refresh the page");
    }
  }

  // Show stale data warning
  showStaleDataWarning() {
    const lastUpdatedElement = document.getElementById("last-updated");
    if (lastUpdatedElement) {
      lastUpdatedElement.style.color = "#dc3545";
      lastUpdatedElement.textContent = "Data may be outdated - refresh page";
      lastUpdatedElement.setAttribute("aria-label", "Warning: Performance data may be outdated");
    }

    announceToScreenReader("Warning: Performance data may be outdated");
  }

  // Clear stale data warning
  clearStaleDataWarning() {
    const lastUpdatedElement = document.getElementById("last-updated");
    if (lastUpdatedElement) {
      lastUpdatedElement.style.color = "";
    }
  }

  // Clean up old tab states and storage
  cleanupOldStates() {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes

    // Clean up in-memory states
    for (const [tabId, state] of this.tabStates.entries()) {
      if (state.lastActivity && now - state.lastActivity > maxAge) {
        this.tabStates.delete(tabId);
      }
    }

    // Clean up storage
    chrome.storage.local.get(null, (allData) => {
      const keysToRemove = [];

      for (const key of Object.keys(allData)) {
        if (key.startsWith("metrics_") || key.startsWith("metricsLoading_")) {
          const tabId = parseInt(key.split("_")[1]);
          const tabState = this.tabStates.get(tabId);

          // Remove if no corresponding tab state or tab state is old
          if (!tabState || (tabState.lastActivity && now - tabState.lastActivity > maxAge)) {
            keysToRemove.push(key);
          }
        }
      }

      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove);
        console.log(`Cleaned up ${keysToRemove.length} old storage keys`);
      }
    });
  }

  // Start periodic cleanup
  startPeriodicCleanup() {
    // Clean up every 2 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldStates();
    }, 120000);
  }

  // Stop periodic cleanup
  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Prevent cross-tab data contamination
  validateTabDataIntegrity(tabId, metrics) {
    const tabState = this.tabStates.get(tabId);

    if (!tabState) {
      return true; // No previous state to validate against
    }

    // Check if URL matches (prevent cross-tab contamination)
    if (tabState.metrics && tabState.metrics.url && metrics.url) {
      if (tabState.metrics.url !== metrics.url) {
        console.warn(`URL mismatch detected for tab ${tabId}, clearing old data`);
        this.clearTabData(tabId);
        return true; // Allow new data after clearing
      }
    }

    // Check timestamp consistency
    if (tabState.metrics && tabState.metrics.timestamp && metrics.timestamp) {
      if (metrics.timestamp < tabState.metrics.timestamp) {
        console.warn(`Older timestamp detected for tab ${tabId}, rejecting stale data`);
        return false; // Reject older data
      }
    }

    return true;
  }

  // Clear all data for a tab
  clearTabData(tabId) {
    // Clear storage
    chrome.storage.local.remove([
      `metrics_${tabId}`,
      `metricsLoading_${tabId}`,
      `clsDebugger_${tabId}`,
    ]);

    // Clear local state
    this.removeTabState(tabId);
  }

  // Get current tab state
  getCurrentTabState() {
    return this.currentTabId ? this.tabStates.get(this.currentTabId) : null;
  }

  // Check if current tab has stale data
  hasStaleData() {
    const tabState = this.getCurrentTabState();
    return tabState ? tabState.isStale === true : false;
  }

  // Force refresh current tab data with enhanced validation
  forceRefreshCurrentTab() {
    if (!this.currentTabId) return;

    // Clear current tab data
    this.clearTabData(this.currentTabId);

    // Reset loading state manager
    loadingStateManager.reset();

    // Clear stale data warning
    this.clearStaleDataWarning();

    // Trigger metrics collection by sending message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id === this.currentTabId) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "forceRefresh" }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn("Could not send refresh message to content script");
            loadingStateManager.errorLoading("Could not communicate with page");
            return;
          }

          if (response && !response.success) {
            console.warn("Refresh failed:", response.error);
            loadingStateManager.errorLoading(response.error || "Refresh failed");

            if (response.reason) {
              showToast(`Refresh failed: ${response.reason}`, "error");
            }
          } else if (response && response.success) {
            console.log("Refresh initiated successfully");
            showToast("Metrics refresh initiated", "success");

            // Start loading state
            loadingStateManager.startLoading("force-refresh");
          }
        });
      }
    });
  }
}

// Initialize state manager
const stateManager = new StateManager();

// Enhanced button click animations
function animateButtonClick(button) {
  if (!button) return;

  button.style.transform = "scale(0.95)";
  button.style.transition = "transform 0.1s ease";

  setTimeout(() => {
    button.style.transform = "";
    button.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
  }, 100);
}

// Enhanced metric update animations
function animateMetricUpdates() {
  const updatedRows = document.querySelectorAll(".metric-row.updated");
  updatedRows.forEach((row, index) => {
    // Stagger animations for visual appeal
    setTimeout(() => {
      UITransitions.highlight(row, "updated", 1200);

      // Pulse the status indicator if it changed
      const statusIndicator = row.querySelector(".status-indicator");
      if (statusIndicator) {
        UITransitions.pulse(statusIndicator, 800);
      }
    }, index * 100);
  });
}

// Enhanced UI transition utilities
const UITransitions = {
  // Smooth fade out element
  fadeOut(element, duration = 300) {
    return new Promise((resolve) => {
      if (!element) {
        resolve();
        return;
      }

      element.style.transition = `opacity ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      element.style.opacity = "0";

      setTimeout(() => {
        element.style.display = "none";
        resolve();
      }, duration);
    });
  },

  // Smooth fade in element
  fadeIn(element, duration = 300) {
    return new Promise((resolve) => {
      if (!element) {
        resolve();
        return;
      }

      element.style.display = element.tagName === "TABLE" ? "table" : "flex";
      element.style.opacity = "0";
      element.style.transform = "translateY(10px)";

      setTimeout(() => {
        element.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        element.style.opacity = "1";
        element.style.transform = "translateY(0)";

        setTimeout(resolve, duration);
      }, 50);
    });
  },

  // Smooth slide transition between states
  slideTransition(fromElement, toElement, duration = 400) {
    return new Promise((resolve) => {
      if (fromElement) {
        this.fadeOut(fromElement, duration / 2);
      }

      setTimeout(() => {
        if (toElement) {
          this.fadeIn(toElement, duration / 2).then(resolve);
        } else {
          resolve();
        }
      }, duration / 2);
    });
  },

  // Highlight element with animation
  highlight(element, className = "updated", duration = 1200) {
    if (!element) return;

    element.classList.add(className);
    setTimeout(() => {
      element.classList.remove(className);
    }, duration);
  },

  // Pulse animation for status indicators
  pulse(element, duration = 1000) {
    if (!element) return;

    element.classList.add("updating");
    setTimeout(() => {
      element.classList.remove("updating");
    }, duration);
  },
};

// Show LCP element in the page
function showLCPElement() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "highlightLCPElement" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error highlighting LCP element:", chrome.runtime.lastError);
          showToast("Could not highlight LCP element. Try refreshing the page.", "error");
          return;
        }

        if (response && response.success) {
          showToast("LCP element highlighted in page", "success");

          // Show detailed info in console
          if (response.result && response.result.elementInfo) {
            console.group("🎯 LCP Element Information");
            console.log("Selector:", response.result.selector);
            console.log("LCP Time:", response.result.lcpTime + "s");
            console.log("Element Details:", response.result.elementInfo);
            console.log("Fallback Method:", response.result.elementInfo.fallback ? "Yes" : "No");
            console.groupEnd();
          }
        } else {
          const error = response?.result?.error || response?.error || "Unknown error";
          showToast(`Could not highlight LCP element: ${error}`, "error");

          // Show available info even if highlighting failed
          if (response?.result?.selector) {
            console.group("🔍 LCP Element Info (Highlighting Failed)");
            console.log("Selector:", response.result.selector);
            console.log("Element Info:", response.result.elementInfo);
            console.groupEnd();
          }
        }
      });
    }
  });
}

// Announce updates to screen readers
function announceToScreenReader(message) {
  const srElement = document.getElementById("sr-announcements");
  if (srElement) {
    srElement.textContent = message;
    // Clear after a delay to allow for re-announcements
    setTimeout(() => {
      srElement.textContent = "";
    }, 1000);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Initialize accessibility features first
  initializeAccessibility();

  // Initialize export functionality
  initializeExportButton();

  // Initialize refresh functionality
  initializeRefreshButton();

  // Initialize CLS debugger
  initializeCLSDebugger();

  // Initialize integration validation
  initializeIntegrationValidation();

  // Initial render
  renderMetrics();

  // Check for updates every 300ms - faster updates for SPA transitions
  setInterval(renderMetrics, 300);

  // CLS Debugger functionality
  function initializeCLSDebugger() {
    const clsToggleButton = document.getElementById("toggle-cls-debugger");
    const clsStatusSpan = document.getElementById("cls-debugger-status");

    if (clsToggleButton && clsStatusSpan) {
      // Initialize CLS debugger state
      updateCLSDebuggerUI();

      clsToggleButton.addEventListener("click", (event) => {
        // Animate button click
        animateButtonClick(clsToggleButton);

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            // Send message to content script to toggle CLS debugger
            chrome.tabs.sendMessage(tabs[0].id, { type: "toggleCLSDebugger" }, (response) => {
              if (chrome.runtime.lastError) {
                console.error("Error toggling CLS debugger:", chrome.runtime.lastError);
                clsStatusSpan.textContent = "Error - Refresh page";
                clsToggleButton.disabled = true;
                showToast("CLS debugger error. Try refreshing the page.", "error");
                return;
              }

              if (response && response.success) {
                updateCLSDebuggerUI(response.enabled);
                const status = response.enabled ? "enabled" : "disabled";
                showToast(`CLS debugging ${status}`, "success");
                announceToScreenReader(`CLS debugging ${status}`);
              }
            });
          }
        });
      });
    }

    // Function to update CLS debugger UI state
    function updateCLSDebuggerUI(enabled = null) {
      if (enabled === null) {
        // Query current state
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type: "getCLSDebuggerState" }, (response) => {
              if (chrome.runtime.lastError) {
                // Content script not ready or page doesn't support it
                clsStatusSpan.textContent = "Highlight CLS Issues";
                clsToggleButton.disabled = false;
                clsToggleButton.setAttribute("aria-pressed", "false");
                return;
              }

              if (response && response.success) {
                updateCLSDebuggerUI(response.state.isEnabled);
              }
            });
          }
        });
        return;
      }

      // Update UI based on state
      if (enabled) {
        clsStatusSpan.textContent = "Stop Highlighting";
        clsToggleButton.classList.add("active");
        clsToggleButton.setAttribute("aria-pressed", "true");
      } else {
        clsStatusSpan.textContent = "Highlight CLS Issues";
        clsToggleButton.classList.remove("active");
        clsToggleButton.setAttribute("aria-pressed", "false");
      }

      clsToggleButton.disabled = false;
    }
  }

  // Initialize integration validation system
  function initializeIntegrationValidation() {
    // Validate integration on popup open
    validateIntegration();

    // Set up periodic validation (every 5 seconds)
    setInterval(validateIntegration, 5000);
  }

  // Validate integration between all components
  function validateIntegration() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        // Get integration status from content script
        chrome.tabs.sendMessage(tabs[0].id, { type: "getIntegrationStatus" }, (response) => {
          if (chrome.runtime.lastError) {
            // Content script not available - this is expected for unsupported pages
            return;
          }

          if (response && response.success) {
            handleIntegrationStatus(response.status);
          }
        });

        // Validate metrics accuracy
        chrome.tabs.sendMessage(tabs[0].id, { type: "validateMetrics" }, (response) => {
          if (chrome.runtime.lastError) {
            return;
          }

          if (response && response.success) {
            handleMetricsValidation(response.validation);
          }
        });
      }
    });
  }

  // Handle integration status response
  function handleIntegrationStatus(status) {
    console.log("Integration Status:", status);

    // Check for critical issues
    if (status.overall === "critical") {
      console.warn("Critical integration issues detected:", status.criticalIssues);

      // Show warning in UI if needed
      if (status.criticalIssues.includes("CLS measurement not supported")) {
        showIntegrationWarning("CLS measurement not supported in this browser");
      }
    } else if (status.overall === "degraded") {
      console.info("Integration running in degraded mode:", status.degradationReason);
    }

    // Validate CLS debugger integration
    if (status.components.clsDebugger && status.components.clsObserver) {
      const debuggerConnected = status.components.clsObserver.connectedToDebugger;
      if (!debuggerConnected) {
        console.warn("CLS debugger not properly connected to observer");
      }
    }
  }

  // Handle metrics validation response
  function handleMetricsValidation(validation) {
    if (!validation.isValid) {
      console.warn("Metrics validation failed:", validation.errors);

      // Show validation errors in console for debugging
      validation.errors.forEach((error) => {
        console.error("Metrics validation error:", error);
      });
    }

    // Log warnings
    validation.warnings.forEach((warning) => {
      console.warn("Metrics validation warning:", warning);
    });
  }

  // Show integration warning in UI
  function showIntegrationWarning(message) {
    const warningElement = document.getElementById("limitations-warning");
    if (warningElement) {
      warningElement.textContent = `⚠️ ${message}`;
      warningElement.style.display = "block";
      warningElement.setAttribute("role", "alert");
    }
  }
});

function renderMetrics() {
  // Get the active tab ID first
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      showErrorState("No active tab found");
      return;
    }

    const tabId = tabs[0].id;
    const tabUrl = tabs[0].url;

    // Update state manager with current tab
    stateManager.setCurrentTab(tabId);

    // Get all relevant data for this tab
    chrome.storage.local.get(
      [
        `metrics_${tabId}`,
        `metricsLoading_${tabId}`,
        `pageSupport_${tabId}`,
        `permissionError_${tabId}`,
        `apiSupport_${tabId}`,
        `limitations_${tabId}`,
        `errors_${tabId}`,
      ],
      (data) => {
        const metrics = data[`metrics_${tabId}`] || {};
        const metricsLoading = data[`metricsLoading_${tabId}`] === true;
        const pageSupport = data[`pageSupport_${tabId}`];
        const permissionError = data[`permissionError_${tabId}`];
        const apiSupport = data[`apiSupport_${tabId}`];
        const limitations = data[`limitations_${tabId}`];
        const errors = data[`errors_${tabId}`] || [];

        // Check for page support issues first
        if (pageSupport) {
          showUnsupportedPageError(pageSupport);
          return;
        }

        // Check for permission errors
        if (permissionError) {
          showPermissionError(permissionError);
          return;
        }

        // Check for API support issues
        if (apiSupport) {
          showAPINotSupportedError(apiSupport);
          return;
        }

        // Validate data integrity to prevent cross-tab contamination
        if (metrics && Object.keys(metrics).length > 0) {
          if (!stateManager.validateTabDataIntegrity(tabId, metrics)) {
            console.warn("Data integrity validation failed, clearing metrics");
            stateManager.clearTabData(tabId);
            showLoadingState("validation-failed");
            return;
          }
        }

        // Update page info
        updatePageInfo(tabs[0].title || "Unknown Tab", metrics.timestamp);

        // Show limitations warning if present
        if (limitations && limitations.limitations.length > 0) {
          showLimitationsWarning(limitations);
        }

        // Check if metrics are available for this tab
        if (Object.keys(metrics).length > 0) {
          showMetricsTable(metrics, tabUrl);

          // Force clear loading state if still set
          if (metricsLoading) {
            chrome.storage.local.set({ [`metricsLoading_${tabId}`]: false });
          }
        } else if (metricsLoading) {
          // Determine loading context based on URL
          let context = "default";
          if (
            tabUrl.includes("spa") ||
            tabUrl.includes("react") ||
            tabUrl.includes("vue") ||
            tabUrl.includes("angular")
          ) {
            context = "spa";
          } else if (tabUrl.startsWith("https://")) {
            context = "navigation";
          }
          showLoadingState(context);
        } else {
          // No metrics and not loading - show generic error with helpful message
          showGenericError(tabUrl, errors);
        }
      }
    );
  });
}

function updatePageInfo(title, timestamp) {
  const pageTitleElement = document.getElementById("page-title");
  const lastUpdatedElement = document.getElementById("last-updated");

  if (pageTitleElement) {
    pageTitleElement.textContent = title;
  }

  if (lastUpdatedElement && timestamp) {
    const timeString = new Date(timestamp).toLocaleTimeString();
    lastUpdatedElement.textContent = `Updated: ${timeString}`;
    lastUpdatedElement.setAttribute("aria-label", `Last updated at ${timeString}`);
  }
}

function showLoadingState(context = "default") {
  // Use the enhanced loading state manager with smooth transitions
  const metricsTable = document.getElementById("metrics-table");
  const errorState = document.getElementById("error-state");
  const loadingState = document.getElementById("loading-state");

  // Smooth transition from current state to loading
  Promise.all([
    UITransitions.fadeOut(metricsTable, 200),
    UITransitions.fadeOut(errorState, 200),
  ]).then(() => {
    loadingStateManager.startLoading(context);
    UITransitions.fadeIn(loadingState, 300);
  });
}

function showErrorState(message) {
  // Use loading state manager for error handling
  loadingStateManager.errorLoading(message);

  const loadingState = document.getElementById("loading-state");
  const metricsTable = document.getElementById("metrics-table");
  const errorState = document.getElementById("error-state");
  const errorMessage = document.getElementById("error-message");

  // Set error message first
  if (errorMessage) errorMessage.textContent = message;

  // Smooth transition to error state
  Promise.all([
    UITransitions.fadeOut(loadingState, 200),
    UITransitions.fadeOut(metricsTable, 200),
  ]).then(() => {
    UITransitions.fadeIn(errorState, 400);
  });

  announceToScreenReader(`Error: ${message}`);
}

// Show unsupported page error with specific guidance
function showUnsupportedPageError(pageSupport) {
  let message = pageSupport.reason;
  let guidance = "";

  switch (pageSupport.pageType) {
    case "chrome-internal":
      guidance = "Try opening a regular website (http:// or https://) to measure performance.";
      break;
    case "browser-extension":
      guidance = "Extension pages cannot be measured. Navigate to a web page instead.";
      break;
    case "local-file":
      guidance =
        "Local files have limited performance APIs. Try serving the file through a web server.";
      break;
    case "browser-internal":
      guidance = "Browser internal pages are not supported. Open a website to measure performance.";
      break;
    case "chrome-special":
      guidance = "Chrome special pages cannot be measured. Navigate to a regular website.";
      break;
    case "unsupported-protocol":
      guidance = "Only HTTP and HTTPS pages are supported for performance measurement.";
      break;
    default:
      guidance = "Navigate to a regular website to measure performance.";
  }

  const fullMessage = `${message}\n\n${guidance}`;
  showErrorState(fullMessage);
}

// Show permission error with guidance
function showPermissionError(permissionError) {
  const message = "Extension permissions are insufficient for performance measurement.";
  const limitations = permissionError.limitations.join(", ");
  const guidance = "Try refreshing the page or reinstalling the extension.";

  const fullMessage = `${message}\n\nIssues: ${limitations}\n\n${guidance}`;
  showErrorState(fullMessage);
}

// Show API not supported error with browser guidance
function showAPINotSupportedError(apiSupport) {
  const missingAPIs = [];
  if (apiSupport.missingAPIs.performanceObserver) {
    missingAPIs.push("PerformanceObserver");
  }
  if (apiSupport.missingAPIs.navigationTiming) {
    missingAPIs.push("Navigation Timing");
  }
  if (apiSupport.missingAPIs.performanceNow) {
    missingAPIs.push("Performance.now()");
  }

  const message = `Performance measurement APIs are not supported in this browser.`;
  const details = `Missing APIs: ${missingAPIs.join(", ")}`;
  const guidance =
    "Try updating your browser or using a modern browser like Chrome, Firefox, or Edge.";

  const fullMessage = `${message}\n\n${details}\n\n${guidance}`;
  showErrorState(fullMessage);
}

// Show generic error with helpful troubleshooting
function showGenericError(tabUrl, errors) {
  let message = "No performance metrics available for this page.";
  let guidance = "";

  // Provide specific guidance based on URL
  if (tabUrl.startsWith("chrome://") || tabUrl.startsWith("chrome-extension://")) {
    message = "Cannot collect metrics for Chrome internal pages.";
    guidance = "Navigate to a regular website (http:// or https://) to measure performance.";
  } else if (tabUrl.startsWith("file://")) {
    message = "Local files have limited performance measurement capabilities.";
    guidance = "Try serving the file through a web server or open a website instead.";
  } else if (tabUrl.startsWith("about:") || tabUrl.startsWith("edge:")) {
    message = "Browser internal pages are not supported.";
    guidance = "Open a website to measure performance metrics.";
  } else if (!tabUrl.startsWith("http")) {
    message = "This page type is not supported for performance measurement.";
    guidance = "Navigate to a website (http:// or https://) to measure performance.";
  } else {
    // Regular web page - provide troubleshooting steps
    guidance =
      "Try:\n• Refreshing the page\n• Waiting for the page to fully load\n• Checking if the page has JavaScript enabled";

    // Include recent errors if available
    if (errors.length > 0) {
      const recentError = errors[errors.length - 1];
      message += `\n\nLast error: ${recentError.errorMessage}`;
    }
  }

  const fullMessage = guidance ? `${message}\n\n${guidance}` : message;
  showErrorState(fullMessage);
}

// Show limitations warning (non-blocking)
function showLimitationsWarning(limitations) {
  const warningElement = document.getElementById("limitations-warning");
  if (warningElement) {
    const limitationsList = limitations.limitations.join(", ");
    warningElement.textContent = `Note: ${limitationsList}`;
    warningElement.style.display = "block";
    warningElement.setAttribute("role", "alert");
  }
}

function showMetricsTable(metrics, tabUrl) {
  // Complete loading successfully
  loadingStateManager.completeLoading(metrics);

  const loadingState = document.getElementById("loading-state");
  const metricsTable = document.getElementById("metrics-table");
  const errorState = document.getElementById("error-state");
  const metricsBody = document.getElementById("metrics-body");

  if (loadingState) loadingState.style.display = "none";
  if (errorState) errorState.style.display = "none";
  if (metricsTable) metricsTable.style.display = "table";

  if (!metricsBody) return;

  // Define the metrics to display with their display names
  const metricsToShow = [
    { key: "TTFB", name: "Time to First Byte", hasThreshold: true },
    { key: "FCP", name: "First Contentful Paint", hasThreshold: true },
    { key: "LCP", name: "Largest Contentful Paint", hasThreshold: true },
    { key: "CLS", name: "Cumulative Layout Shift", hasThreshold: true },
    { key: "DOMLoadTime", name: "DOM Load Time", hasThreshold: false },
    { key: "NavigationTime", name: "Navigation Duration", hasThreshold: false },
  ];

  let tableHTML = "";
  let hasUpdates = false;

  metricsToShow.forEach(({ key, name, hasThreshold }) => {
    const metricData = metrics[key];
    // Extract the actual value from the metric object structure
    let value;
    if (metricData && typeof metricData === "object" && metricData.hasOwnProperty("value")) {
      value = metricData.value;
    } else {
      value = metricData;
    }

    // Additional check for numeric values
    if (typeof value === "string" && !isNaN(parseFloat(value))) {
      value = parseFloat(value);
    }

    // Debug logging to help identify issues (only log once per metric to avoid spam)
    if (value !== null && value !== undefined && (typeof value !== "number" || isNaN(value))) {
      if (!window.loggedInvalidMetrics) window.loggedInvalidMetrics = new Set();
      if (!window.loggedInvalidMetrics.has(key)) {
        console.warn(`Invalid metric value for ${key}:`, { metricData, value, type: typeof value });
        window.loggedInvalidMetrics.add(key);
      }
    }

    const formattedValue = formatMetricValue(key, value);

    let statusHTML = "";
    let rowClass = "";

    if (hasThreshold && value !== null && value !== undefined && typeof value === "number") {
      const evaluation = evaluateMetric(key, value);
      statusHTML = `
        <span class="status-indicator status-${evaluation.status}" 
              aria-label="${evaluation.accessible_indicator}">
          <span class="status-icon" aria-hidden="true">${evaluation.icon}</span>
          <span class="status-text">${evaluation.accessible_indicator}</span>
        </span>
      `;
      rowClass = `metric-row-${evaluation.status}`;
    } else if (
      !hasThreshold &&
      value !== null &&
      value !== undefined &&
      typeof value === "number"
    ) {
      // For metrics without thresholds but with valid values, show INFO status
      statusHTML = `
        <span class="status-indicator status-info" aria-label="Information">
          <span class="status-icon" aria-hidden="true">ℹ</span>
          <span class="status-text">INFO</span>
        </span>
      `;
      rowClass = "info-row";
    } else {
      statusHTML = `
        <span class="status-indicator status-unknown" aria-label="No data">
          <span class="status-icon" aria-hidden="true">-</span>
          <span class="status-text">N/A</span>
        </span>
      `;
    }

    // Add data attribute for LCP row to enable click handling
    const lcpAttributes =
      key === "LCP"
        ? 'data-lcp-row="true" style="cursor: pointer;" title="Click to highlight LCP element in page"'
        : "";

    tableHTML += `
      <tr class="metric-row ${rowClass}" ${lcpAttributes}>
        <td class="metric-name">${name}${
      key === "LCP" ? ' <span style="font-size: 10px; color: #666;">📍</span>' : ""
    }</td>
        <td class="metric-value">${formattedValue}</td>
        <td class="metric-status">${statusHTML}</td>
      </tr>
    `;
  });

  // Add navigation type row
  const transitionType = metrics.transitionType === "spa" ? "SPA Navigation" : "Full Page Load";
  const transitionClass = metrics.transitionType === "spa" ? "spa" : "navigation";

  tableHTML += `
    <tr class="metric-row info-row">
      <td class="metric-name">Navigation Type</td>
      <td class="metric-value">
        <span class="transition-type ${transitionClass}">${transitionType}</span>
      </td>
      <td class="metric-status">
        <span class="status-indicator status-info">
          <span class="status-icon" aria-hidden="true">ℹ</span>
          <span class="status-text">Info</span>
        </span>
      </td>
    </tr>
  `;

  metricsBody.innerHTML = tableHTML;

  // Add event listener for LCP row clicks
  const lcpRow = metricsBody.querySelector('[data-lcp-row="true"]');
  if (lcpRow) {
    lcpRow.addEventListener("click", showLCPElement);
  }

  // Announce metrics update to screen readers
  const coreMetrics = metricsToShow.filter((m) => m.hasThreshold);
  const goodCount = coreMetrics.filter((m) => {
    const value = metrics[m.key];
    if (value === null || value === undefined) return false;
    const evaluation = evaluateMetric(m.key, value);
    return evaluation.status === "good";
  }).length;

  announceToScreenReader(
    `Metrics updated. ${goodCount} of ${coreMetrics.length} Core Web Vitals are in good range.`
  );
}
// Export functionality
function initializeExportButton() {
  const exportButton = document.getElementById("export-json-btn");
  if (exportButton) {
    exportButton.addEventListener("click", (event) => {
      animateButtonClick(exportButton);
      exportAsJSON();
    });
  } else {
    console.error("Export button not found!");
  }
}

// Refresh functionality
function initializeRefreshButton() {
  const refreshButton = document.getElementById("refresh-metrics-btn");
  if (refreshButton) {
    refreshButton.addEventListener("click", (event) => {
      // Animate button click
      animateButtonClick(refreshButton);

      // Force refresh current tab data
      stateManager.forceRefreshCurrentTab();

      // Show loading state
      loadingStateManager.startLoading("manual-refresh");

      // Show feedback to user
      showToast("Refreshing performance metrics...", "info");
      announceToScreenReader("Refreshing performance metrics");

      // Disable button temporarily with smooth transition
      refreshButton.disabled = true;
      refreshButton.style.transform = "scale(0.95)";
      refreshButton.querySelector(".button-text").textContent = "Refreshing...";

      // Re-enable after a delay with smooth transition
      setTimeout(() => {
        refreshButton.disabled = false;
        refreshButton.style.transform = "";
        refreshButton.querySelector(".button-text").textContent = "Refresh Data";
      }, 2000);
    });
  } else {
    console.error("Refresh button not found!");
  }
}

async function exportAsJSON() {
  const exportButton = document.getElementById("export-json-btn");

  try {
    // Disable button during export
    if (exportButton) {
      exportButton.disabled = true;
      exportButton.querySelector(".button-text").textContent = "Copying...";
    }

    // Get current tab and metrics
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });

    if (tabs.length === 0) {
      throw new Error("No active tab found");
    }

    const tabId = tabs[0].id;
    const tabUrl = tabs[0].url;

    // Get metrics from storage
    const data = await new Promise((resolve) => {
      chrome.storage.local.get([`metrics_${tabId}`], resolve);
    });

    const metrics = data[`metrics_${tabId}`];

    if (!metrics || Object.keys(metrics).length === 0) {
      throw new Error("No metrics available to export");
    }

    // Create export object with enhanced data
    const exportData = {
      timestamp: new Date().toISOString(),
      url: metrics.url || tabUrl,
      pageTitle: tabs[0].title || "Unknown Page",
      navigationType: metrics.transitionType || "unknown",
      metrics: {
        TTFB: {
          value:
            metrics.TTFB && typeof metrics.TTFB === "object" ? metrics.TTFB.value : metrics.TTFB,
          unit: "seconds",
          evaluation: metrics.TTFB
            ? evaluateMetric(
                "TTFB",
                metrics.TTFB && typeof metrics.TTFB === "object" ? metrics.TTFB.value : metrics.TTFB
              )
            : null,
        },
        FCP: {
          value: metrics.FCP && typeof metrics.FCP === "object" ? metrics.FCP.value : metrics.FCP,
          unit: "seconds",
          evaluation: metrics.FCP
            ? evaluateMetric(
                "FCP",
                metrics.FCP && typeof metrics.FCP === "object" ? metrics.FCP.value : metrics.FCP
              )
            : null,
        },
        LCP: {
          value: metrics.LCP && typeof metrics.LCP === "object" ? metrics.LCP.value : metrics.LCP,
          unit: "seconds",
          evaluation: metrics.LCP
            ? evaluateMetric(
                "LCP",
                metrics.LCP && typeof metrics.LCP === "object" ? metrics.LCP.value : metrics.LCP
              )
            : null,
        },
        CLS: {
          value: metrics.CLS && typeof metrics.CLS === "object" ? metrics.CLS.value : metrics.CLS,
          unit: "score",
          evaluation:
            metrics.CLS !== undefined
              ? evaluateMetric(
                  "CLS",
                  metrics.CLS && typeof metrics.CLS === "object" ? metrics.CLS.value : metrics.CLS
                )
              : null,
        },
        DOMLoadTime: {
          value:
            metrics.DOMLoadTime && typeof metrics.DOMLoadTime === "object"
              ? metrics.DOMLoadTime.value
              : metrics.DOMLoadTime,
          unit: "seconds",
          evaluation: null,
        },
        NavigationTime: {
          value:
            metrics.NavigationTime && typeof metrics.NavigationTime === "object"
              ? metrics.NavigationTime.value
              : metrics.NavigationTime,
          unit: "seconds",
          evaluation: null,
        },
      },
      collectedAt: metrics.timestamp ? new Date(metrics.timestamp).toISOString() : null,
      extensionVersion: chrome.runtime.getManifest().version,
    };

    // Copy to clipboard
    const jsonString = JSON.stringify(exportData, null, 2);
    await navigator.clipboard.writeText(jsonString);

    // Show success toast
    showToast("Metrics copied to clipboard!", "success");
    announceToScreenReader("Metrics successfully copied to clipboard as JSON");
  } catch (error) {
    console.error("Export failed:", error);
    showToast(`Export failed: ${error.message}`, "error");
    announceToScreenReader(`Export failed: ${error.message}`);
  } finally {
    // Re-enable button
    if (exportButton) {
      exportButton.disabled = false;
      exportButton.querySelector(".button-text").textContent = "Copy as JSON";
    }
  }
}

// Toast notification system
function showToast(message, type = "info") {
  const toastContainer = document.getElementById("toast-container");
  if (!toastContainer) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  const icon = type === "success" ? "✓" : type === "error" ? "✗" : "ℹ";
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${icon}</span>
    <span class="toast-message">${message}</span>
  `;

  toastContainer.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add("toast-fade-out");
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }
  }, 3000);
}
// Keyboard navigation and accessibility
function initializeKeyboardNavigation() {
  // Add keyboard shortcuts
  document.addEventListener("keydown", (event) => {
    // Ctrl/Cmd + C for export
    if ((event.ctrlKey || event.metaKey) && event.key === "c" && !event.shiftKey) {
      const exportButton = document.getElementById("export-json-btn");
      if (exportButton && !exportButton.disabled) {
        event.preventDefault();
        exportAsJSON();
      }
    }

    // Ctrl/Cmd + D for CLS debugger toggle
    if ((event.ctrlKey || event.metaKey) && event.key === "d") {
      const clsButton = document.getElementById("toggle-cls-debugger");
      if (clsButton && !clsButton.disabled) {
        event.preventDefault();
        clsButton.click();
      }
    }

    // Ctrl/Cmd + R for refresh (or F5)
    if (((event.ctrlKey || event.metaKey) && event.key === "r") || event.key === "F5") {
      const refreshButton = document.getElementById("refresh-metrics-btn");
      if (refreshButton && !refreshButton.disabled) {
        event.preventDefault();
        refreshButton.click();
      }
    }

    // Escape to close any open toasts
    if (event.key === "Escape") {
      const toasts = document.querySelectorAll(".toast");
      toasts.forEach((toast) => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      });
    }
  });

  // Enhance focus management
  const focusableElements = document.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  // Ensure proper tab order
  focusableElements.forEach((element, index) => {
    if (!element.hasAttribute("tabindex")) {
      element.setAttribute("tabindex", "0");
    }
  });

  // Add focus indicators for better visibility
  focusableElements.forEach((element) => {
    element.addEventListener("focus", () => {
      element.classList.add("focused");
    });

    element.addEventListener("blur", () => {
      element.classList.remove("focused");
    });
  });
}

// Enhanced screen reader support
function enhanceScreenReaderSupport() {
  // Add live region for dynamic content updates
  const metricsTable = document.getElementById("metrics-table");
  if (metricsTable) {
    metricsTable.setAttribute("aria-live", "polite");
    metricsTable.setAttribute("aria-atomic", "false");
  }

  // Add descriptions for interactive elements
  const exportButton = document.getElementById("export-json-btn");
  if (exportButton) {
    exportButton.setAttribute("aria-keyshortcuts", "Control+c");
  }

  const clsButton = document.getElementById("toggle-cls-debugger");
  if (clsButton) {
    clsButton.setAttribute("aria-keyshortcuts", "Control+d");
  }

  const refreshButton = document.getElementById("refresh-metrics-btn");
  if (refreshButton) {
    refreshButton.setAttribute("aria-keyshortcuts", "Control+r F5");
  }

  // Add status announcements for state changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList" || mutation.type === "attributes") {
        // Announce significant UI changes
        if (mutation.target.id === "metrics-table" && mutation.target.style.display !== "none") {
          setTimeout(() => {
            announceToScreenReader("Metrics table updated with new performance data");
          }, 100);
        }
      }
    });
  });

  // Observe changes to key elements
  const elementsToObserve = ["metrics-table", "loading-state", "error-state"];
  elementsToObserve.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      observer.observe(element, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["style", "class", "aria-hidden"],
      });
    }
  });
}

// Initialize all accessibility features
function initializeAccessibility() {
  initializeKeyboardNavigation();
  enhanceScreenReaderSupport();

  // Add skip link for keyboard users
  const skipLink = document.createElement("a");
  skipLink.href = "#metrics-section";
  skipLink.textContent = "Skip to metrics";
  skipLink.className = "skip-link";
  skipLink.setAttribute("tabindex", "1");
  document.body.insertBefore(skipLink, document.body.firstChild);

  // Announce extension ready state
  setTimeout(() => {
    announceToScreenReader(
      "Core Web Vitals extension loaded. Use Ctrl+C to export metrics, Ctrl+R to refresh, Ctrl+D to toggle CLS debugging."
    );
  }, 500);
}
