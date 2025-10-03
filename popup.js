// Core Web Vitals thresholds based on Google's recommendations
const CWV_THRESHOLDS = {
  FCP: { good: 1.8, needsImprovement: 3.0 },
  LCP: { good: 2.5, needsImprovement: 4.0 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  TTFB: { good: 0.8, needsImprovement: 1.8 },
};

// Update extension status indicator
function updateExtensionStatus(state) {
  const statusElement = document.getElementById("extension-status");
  if (!statusElement) return;

  // Clear previous classes
  statusElement.className = "extension-status";

  // Set new state
  statusElement.classList.add(state);

  // Set text based on state
  const statusTexts = {
    loading: "Loading...",
    ready: "Ready",
    error: "Error",
    analyzing: "Analyzing...",
  };

  statusElement.textContent = statusTexts[state] || "Unknown";
  statusElement.setAttribute("aria-label", `Extension status: ${statusTexts[state] || "Unknown"}`);
}

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

  // Start recommendations loading
  startRecommendationsLoading() {
    console.log("LoadingStateManager: Starting recommendations loading");

    // Show feedback to user
    showToast("Analyzing page performance...", "info");
    announceToScreenReader("Analyzing page performance");

    // Set recommendations loading state
    setRecommendationsLoadingState(true);

    return this;
  }

  // Complete recommendations loading
  completeRecommendationsLoading(success = true, error = null) {
    console.log(`LoadingStateManager: Recommendations loading completed (success: ${success})`);

    // Clear recommendations loading state
    setRecommendationsLoadingState(false);

    if (success) {
      showToast("Recommendations generated successfully!", "success");
      announceToScreenReader("Performance recommendations generated successfully");
    } else {
      const errorMessage = error || "Failed to generate recommendations";
      showToast(errorMessage, "error");
      announceToScreenReader(`Failed to generate recommendations: ${errorMessage}`);
    }
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

// Toast notification system for user feedback
class ToastManager {
  constructor() {
    this.toastContainer = null;
    this.activeToasts = new Map();
    this.maxToasts = 3;
    this.defaultDuration = 4000;

    this.initializeToastContainer();
  }

  // Initialize toast container
  initializeToastContainer() {
    this.toastContainer = document.createElement("div");
    this.toastContainer.id = "toast-container";
    this.toastContainer.className = "toast-container";
    this.toastContainer.setAttribute("aria-live", "polite");
    this.toastContainer.setAttribute("aria-atomic", "false");

    // Add styles
    Object.assign(this.toastContainer.style, {
      position: "fixed",
      top: "10px",
      right: "10px",
      zIndex: "10000",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      maxWidth: "300px",
      pointerEvents: "none",
    });

    document.body.appendChild(this.toastContainer);
  }

  // Show toast notification
  show(message, type = "info", duration = null) {
    const toastId = Date.now() + Math.random();
    const toastDuration = duration || this.defaultDuration;

    // Remove oldest toast if at max capacity
    if (this.activeToasts.size >= this.maxToasts) {
      const oldestId = Array.from(this.activeToasts.keys())[0];
      this.remove(oldestId);
    }

    const toast = this.createToastElement(message, type, toastId);
    this.toastContainer.appendChild(toast);
    this.activeToasts.set(toastId, toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = "translateX(0)";
      toast.style.opacity = "1";
    });

    // Auto remove after duration
    const timeoutId = setTimeout(() => {
      this.remove(toastId);
    }, toastDuration);

    // Store timeout for manual removal
    toast.timeoutId = timeoutId;

    // Announce to screen readers
    announceToScreenReader(`${type}: ${message}`);

    return toastId;
  }

  // Create toast element
  createToastElement(message, type, id) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", "alert");
    toast.setAttribute("data-toast-id", id);

    // Base styles
    Object.assign(toast.style, {
      padding: "12px 16px",
      borderRadius: "6px",
      fontSize: "14px",
      fontWeight: "500",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
      transform: "translateX(100%)",
      opacity: "0",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      pointerEvents: "auto",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
    });

    // Type-specific styles
    const typeStyles = {
      success: {
        backgroundColor: "#10b981",
        color: "white",
        border: "1px solid #059669",
      },
      error: {
        backgroundColor: "#ef4444",
        color: "white",
        border: "1px solid #dc2626",
      },
      warning: {
        backgroundColor: "#f59e0b",
        color: "white",
        border: "1px solid #d97706",
      },
      info: {
        backgroundColor: "#3b82f6",
        color: "white",
        border: "1px solid #2563eb",
      },
    };

    Object.assign(toast.style, typeStyles[type] || typeStyles.info);

    // Add icon and message
    const icon = this.getTypeIcon(type);
    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">${icon}</span>
        <span style="flex: 1;">${this.escapeHtml(message)}</span>
        <button style="background: none; border: none; color: inherit; cursor: pointer; padding: 0; margin-left: 8px; font-size: 18px; opacity: 0.7;" 
                onclick="toastManager.remove(${id})" 
                aria-label="Close notification">×</button>
      </div>
    `;

    // Click to dismiss
    toast.addEventListener("click", (e) => {
      if (e.target.tagName !== "BUTTON") {
        this.remove(id);
      }
    });

    return toast;
  }

  // Get icon for toast type
  getTypeIcon(type) {
    const icons = {
      success: "✓",
      error: "✗",
      warning: "⚠",
      info: "ℹ",
    };
    return icons[type] || icons.info;
  }

  // Escape HTML to prevent XSS
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Remove toast
  remove(toastId) {
    const toast = this.activeToasts.get(toastId);
    if (!toast) return;

    // Clear timeout
    if (toast.timeoutId) {
      clearTimeout(toast.timeoutId);
    }

    // Animate out
    toast.style.transform = "translateX(100%)";
    toast.style.opacity = "0";

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.activeToasts.delete(toastId);
    }, 300);
  }

  // Clear all toasts
  clearAll() {
    for (const toastId of this.activeToasts.keys()) {
      this.remove(toastId);
    }
  }
}

// Initialize toast manager
const toastManager = new ToastManager();

// Global toast function for easy access
function showToast(message, type = "info", duration = null) {
  return toastManager.show(message, type, duration);
}

// Error message templates for different scenarios
const ERROR_MESSAGES = {
  // Network and fetch errors
  NETWORK_ERROR:
    "Unable to connect to the page. Please check your internet connection and try again.",
  TIMEOUT_ERROR:
    "The analysis is taking longer than expected. Please try again or refresh the page.",
  FETCH_FAILED: "Could not retrieve page data for analysis. The page may have access restrictions.",

  // Parsing errors
  PARSE_ERROR: "Unable to analyze page structure. The page content may be malformed.",
  HTML_PARSE_FAILED: "Could not parse the page HTML. Some recommendations may be unavailable.",

  // Permission errors
  PERMISSION_ERROR: "Extension permissions are insufficient for this page type.",
  CORS_ERROR: "Cross-origin restrictions prevent analysis of this page.",

  // Page support errors
  UNSUPPORTED_PAGE: "Performance recommendations are not available for this page type.",
  CHROME_INTERNAL: "Chrome internal pages cannot be analyzed for performance.",
  LOCAL_FILE: "Local files have limited performance measurement capabilities.",

  // Analysis errors
  ANALYSIS_FAILED: "Performance analysis failed. Please refresh the page and try again.",
  ANALYSIS_TIMEOUT: "Analysis timed out. The page may be too complex or slow to respond.",
  PARTIAL_ANALYSIS: "Analysis completed with some limitations. Results may be incomplete.",

  // Generic errors
  UNKNOWN_ERROR: "An unexpected error occurred. Please try refreshing the page.",
  EXTENSION_ERROR: "Extension communication error. Please reload the extension.",
};

// User-friendly error handler
class ErrorHandler {
  constructor() {
    this.errorHistory = [];
    this.maxHistorySize = 10;
  }

  // Handle and display user-friendly error
  handleError(error, context = "general") {
    console.error("Error in context:", context, error);

    // Store error in history
    this.addToHistory(error, context);

    // Determine user-friendly message
    const userMessage = this.getUserFriendlyMessage(error, context);

    // Show appropriate feedback
    this.showErrorFeedback(userMessage, error, context);

    // Announce to screen readers
    announceToScreenReader(`Error: ${userMessage}`);

    return userMessage;
  }

  // Get user-friendly error message
  getUserFriendlyMessage(error, context) {
    const errorMessage = error.message || error.toString();
    const errorCode = error.code || this.categorizeError(errorMessage);

    // Check for specific error patterns
    if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
      return ERROR_MESSAGES.TIMEOUT_ERROR;
    }

    if (errorMessage.includes("network") || errorMessage.includes("Failed to fetch")) {
      return ERROR_MESSAGES.NETWORK_ERROR;
    }

    if (errorMessage.includes("parse") || errorMessage.includes("parsing")) {
      return ERROR_MESSAGES.PARSE_ERROR;
    }

    if (errorMessage.includes("permission") || errorMessage.includes("access")) {
      return ERROR_MESSAGES.PERMISSION_ERROR;
    }

    if (errorMessage.includes("CORS") || errorMessage.includes("cross-origin")) {
      return ERROR_MESSAGES.CORS_ERROR;
    }

    // Use error code if available
    if (errorCode && ERROR_MESSAGES[errorCode]) {
      return ERROR_MESSAGES[errorCode];
    }

    // Context-specific messages
    if (context === "recommendations") {
      return ERROR_MESSAGES.ANALYSIS_FAILED;
    }

    return ERROR_MESSAGES.UNKNOWN_ERROR;
  }

  // Categorize error based on message content
  categorizeError(errorMessage) {
    const message = errorMessage.toLowerCase();

    if (message.includes("timeout")) return "TIMEOUT_ERROR";
    if (message.includes("network") || message.includes("fetch")) return "NETWORK_ERROR";
    if (message.includes("parse")) return "PARSE_ERROR";
    if (message.includes("permission")) return "PERMISSION_ERROR";
    if (message.includes("cors")) return "CORS_ERROR";
    if (message.includes("chrome:") || message.includes("extension:")) return "CHROME_INTERNAL";

    return "UNKNOWN_ERROR";
  }

  // Show error feedback to user
  showErrorFeedback(message, error, context) {
    // Show toast notification
    showToast(message, "error", 6000);

    // Update UI state if needed
    if (context === "recommendations") {
      this.updateRecommendationsErrorState(message);
    }

    // Show detailed error in console for developers
    console.group("🚨 User Error Details");
    console.log("Context:", context);
    console.log("User Message:", message);
    console.log("Original Error:", error);
    console.log("Error History:", this.errorHistory.slice(-3));
    console.groupEnd();
  }

  // Update recommendations UI for error state
  updateRecommendationsErrorState(message) {
    const recommendationsButton = document.getElementById("generate-recommendations");
    const recommendationsDisplay = document.getElementById("recommendations-display");

    if (recommendationsButton) {
      recommendationsButton.disabled = false;
      recommendationsButton.textContent = "Generate Recommendations";
    }

    if (recommendationsDisplay) {
      recommendationsDisplay.innerHTML = `
        <div class="error-state" style="padding: 16px; text-align: center; color: #dc3545;">
          <div style="font-size: 24px; margin-bottom: 8px;">⚠️</div>
          <div style="font-weight: 500; margin-bottom: 4px;">Analysis Failed</div>
          <div style="font-size: 14px; opacity: 0.8;">${message}</div>
          <button onclick="retryRecommendations()" style="margin-top: 12px; padding: 6px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Try Again
          </button>
        </div>
      `;
    }
  }

  // Add error to history
  addToHistory(error, context) {
    this.errorHistory.push({
      error: error.message || error.toString(),
      context: context,
      timestamp: Date.now(),
      url: window.location?.href || "unknown",
    });

    // Keep history size manageable
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
    }
  }

  // Get error statistics for debugging
  getErrorStats() {
    const stats = {
      totalErrors: this.errorHistory.length,
      recentErrors: this.errorHistory.filter((e) => Date.now() - e.timestamp < 300000).length, // Last 5 minutes
      errorsByContext: {},
      commonErrors: {},
    };

    this.errorHistory.forEach((entry) => {
      // Count by context
      stats.errorsByContext[entry.context] = (stats.errorsByContext[entry.context] || 0) + 1;

      // Count common error patterns
      const errorKey = this.categorizeError(entry.error);
      stats.commonErrors[errorKey] = (stats.commonErrors[errorKey] || 0) + 1;
    });

    return stats;
  }
}

// Initialize error handler
const errorHandler = new ErrorHandler();

// Global error handling function
function handleError(error, context = "general") {
  return errorHandler.handleError(error, context);
}

// Retry function for recommendations
function retryRecommendations() {
  const button = document.getElementById("generate-recommendations");
  if (button) {
    button.click();
  }
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

// Display recommendations in the UI
function displayRecommendations(recommendations) {
  const displaySection = document.getElementById("recommendations-display-section");
  const contentContainer = document.getElementById("recommendations-content");

  if (!displaySection || !contentContainer) {
    console.error("Recommendations display elements not found");
    return;
  }

  // Show the display section
  displaySection.style.display = "block";

  // Clear existing content
  contentContainer.innerHTML = "";

  try {
    // Create summary section
    const summaryElement = createRecommendationsSummary(recommendations.summary);
    contentContainer.appendChild(summaryElement);

    // Create category sections
    const categories = [
      { key: "cache", title: "Cache Analysis", icon: "🗄️" },
      { key: "lcp", title: "LCP Optimization", icon: "🎯" },
      { key: "scripts", title: "Script Analysis", icon: "📜" },
      { key: "links", title: "Link Tag Analysis", icon: "🔗" },
      { key: "css", title: "CSS Analysis", icon: "🎨" },
    ];

    categories.forEach((category) => {
      if (recommendations[category.key]) {
        const categoryElement = createRecommendationCategory(
          category.key,
          category.title,
          category.icon,
          recommendations[category.key]
        );
        contentContainer.appendChild(categoryElement);
      }
    });

    // Enable copy button
    const copyButton = document.getElementById("copy-recommendations-btn");
    if (copyButton) {
      copyButton.disabled = false;
      copyButton.setAttribute("data-recommendations", JSON.stringify(recommendations, null, 2));
    }

    // Announce to screen readers
    announceToScreenReader("Performance recommendations loaded and displayed");
  } catch (error) {
    console.error("Error displaying recommendations:", error);
    showRecommendationsError("Failed to display recommendations");
  }
}

// Hide recommendations display
function hideRecommendationsDisplay() {
  const displaySection = document.getElementById("recommendations-display-section");
  if (displaySection) {
    displaySection.style.display = "none";
  }

  // Disable copy button
  const copyButton = document.getElementById("copy-recommendations-btn");
  if (copyButton) {
    copyButton.disabled = true;
    copyButton.removeAttribute("data-recommendations");
  }
}

// Show recommendations error
function showRecommendationsError(message) {
  const displaySection = document.getElementById("recommendations-display-section");
  const contentContainer = document.getElementById("recommendations-content");

  if (!displaySection || !contentContainer) return;

  // Show the display section
  displaySection.style.display = "block";

  contentContainer.innerHTML = `
    <div class="recommendations-error">
      <span class="error-icon">⚠️</span>
      <span class="error-message">${message}</span>
      <button class="retry-button" onclick="generateRecommendations()">
        <span class="button-icon">🔄</span>
        <span class="button-text">Try Again</span>
      </button>
    </div>
  `;

  // Disable copy button when showing error
  const copyButton = document.getElementById("copy-recommendations-btn");
  if (copyButton) {
    copyButton.disabled = true;
    copyButton.removeAttribute("data-recommendations");
  }

  // Announce error to screen readers
  announceToScreenReader(`Recommendations error: ${message}`);
}

// Create human-readable recommendations summary section
function createRecommendationsSummary(summary) {
  const summaryContainer = document.createElement("div");
  summaryContainer.className = "recommendations-summary";

  // Create a human-readable summary message
  const summaryMessage = document.createElement("div");
  summaryMessage.className = "summary-message";

  const totalIssues = summary.totalIssues || 0;
  const criticalIssues = summary.criticalIssues || 0;
  const score = summary.overallScore || "unknown";

  let message = "";
  let icon = "";
  let messageClass = "";

  if (totalIssues === 0) {
    icon = "🎉";
    message = "Excellent! Your page has no performance issues detected.";
    messageClass = "summary-excellent";
  } else if (criticalIssues === 0 && totalIssues <= 2) {
    icon = "✅";
    message = `Good job! Only ${totalIssues} minor ${
      totalIssues === 1 ? "issue" : "issues"
    } found that can be easily fixed.`;
    messageClass = "summary-good";
  } else if (criticalIssues <= 2) {
    icon = "⚠️";
    message = `Your page has ${totalIssues} performance ${
      totalIssues === 1 ? "issue" : "issues"
    }, including ${criticalIssues} that ${
      criticalIssues === 1 ? "needs" : "need"
    } immediate attention.`;
    messageClass = "summary-warning";
  } else {
    icon = "🚨";
    message = `Your page has significant performance issues (${totalIssues} total, ${criticalIssues} critical) that are likely slowing down your site.`;
    messageClass = "summary-critical";
  }

  summaryMessage.innerHTML = `
    <div class="summary-icon">${icon}</div>
    <div class="summary-text ${messageClass}">${message}</div>
  `;

  // Create detailed breakdown
  const breakdown = document.createElement("div");
  breakdown.className = "summary-breakdown";

  const grid = document.createElement("div");
  grid.className = "summary-grid";

  // Total issues with human description
  const totalIssuesItem = document.createElement("div");
  totalIssuesItem.className = "summary-item";
  totalIssuesItem.innerHTML = `
    <div class="summary-value">${totalIssues}</div>
    <div class="summary-label">Total Issues Found</div>
    <div class="summary-description">${
      totalIssues === 0
        ? "Perfect!"
        : totalIssues === 1
        ? "One item to fix"
        : "Items need attention"
    }</div>
  `;

  // Critical issues with human description
  const criticalIssuesItem = document.createElement("div");
  criticalIssuesItem.className = "summary-item critical";
  criticalIssuesItem.innerHTML = `
    <div class="summary-value">${criticalIssues}</div>
    <div class="summary-label">Critical Issues</div>
    <div class="summary-description">${
      criticalIssues === 0
        ? "None found"
        : criticalIssues === 1
        ? "Fix immediately"
        : "Fix these first"
    }</div>
  `;

  // Optimization opportunities
  const opportunities = summary.optimizationOpportunities || 0;
  const opportunitiesItem = document.createElement("div");
  opportunitiesItem.className = "summary-item";
  opportunitiesItem.innerHTML = `
    <div class="summary-value">${opportunities}</div>
    <div class="summary-label">Quick Wins</div>
    <div class="summary-description">${
      opportunities === 0
        ? "All optimized"
        : opportunities === 1
        ? "Easy improvement"
        : "Easy improvements"
    }</div>
  `;

  grid.appendChild(totalIssuesItem);
  grid.appendChild(criticalIssuesItem);
  grid.appendChild(opportunitiesItem);

  breakdown.appendChild(grid);

  // Overall score with explanation
  const overallScore = document.createElement("div");
  overallScore.className = `overall-score ${score}`;

  let scoreExplanation = "";
  switch (score) {
    case "good":
      scoreExplanation = "Your page performs well and follows best practices.";
      break;
    case "needs-improvement":
      scoreExplanation = "Your page has room for improvement but isn't critically slow.";
      break;
    case "poor":
      scoreExplanation = "Your page has performance issues that may frustrate users.";
      break;
    default:
      scoreExplanation = "Unable to determine overall performance score.";
  }

  overallScore.innerHTML = `
    <div class="score-title">Overall Performance: ${getScoreDisplayText(score)}</div>
    <div class="score-explanation">${scoreExplanation}</div>
  `;

  summaryContainer.appendChild(summaryMessage);
  summaryContainer.appendChild(breakdown);
  summaryContainer.appendChild(overallScore);

  return summaryContainer;
}

// Convert technical recommendations to human-readable text
function humanizeRecommendation(recommendation, category) {
  const humanReadable = {
    title: "",
    description: "",
    action: "",
    priority: recommendation.priority || "medium",
    impact: "",
  };

  // Script recommendations
  if (category === "scripts") {
    switch (recommendation.type) {
      case "duplicate_scripts":
        humanReadable.title = "🔄 Remove Duplicate Scripts";
        humanReadable.description = `You have ${
          recommendation.duplicateScripts?.length || 0
        } scripts loading multiple times on your page.`;
        humanReadable.action =
          "Remove duplicate script tags to reduce page load time and bandwidth usage.";
        humanReadable.impact = "Faster page loading and reduced data usage";
        break;
      case "defer_optimization":
        humanReadable.title = "⚡ Optimize Script Loading";
        humanReadable.description = `${
          recommendation.deferScripts?.length || 0
        } scripts are using defer attribute.`;
        humanReadable.action =
          "Consider moving non-critical scripts to the end of the page or using async for better performance.";
        humanReadable.impact = "Improved initial page rendering speed";
        break;
      case "async_validation":
        humanReadable.title = "🔍 Review Async Scripts";
        humanReadable.description = `${
          recommendation.asyncScripts?.length || 0
        } scripts are loading asynchronously.`;
        humanReadable.action =
          "Ensure async scripts don't depend on DOM ready state or other scripts to prevent race conditions.";
        humanReadable.impact = "More reliable script execution";
        break;
    }
  }

  // CSS recommendations
  else if (category === "css") {
    switch (recommendation.type) {
      case "optimization":
        humanReadable.title = "📦 Combine CSS Files";
        humanReadable.description = `Your page loads ${
          recommendation.affectedStylesheets?.length || 0
        } separate CSS files.`;
        humanReadable.action =
          "Combine and minify CSS files to reduce the number of HTTP requests.";
        humanReadable.impact = "Faster page loading with fewer network requests";
        break;
      case "placement":
        humanReadable.title = "📍 Fix CSS Placement";
        humanReadable.description = `${
          recommendation.affectedStylesheets?.length || 0
        } stylesheets are in the wrong location.`;
        humanReadable.action = "Move all CSS links to the <head> section for optimal loading.";
        humanReadable.impact = "Prevents layout shifts and improves rendering";
        break;
      case "duplicates":
        humanReadable.title = "🔄 Remove Duplicate CSS";
        humanReadable.description = `${
          recommendation.affectedStylesheets?.length || 0
        } CSS files are loaded multiple times.`;
        humanReadable.action = "Remove duplicate stylesheet references.";
        humanReadable.impact = "Reduced bandwidth and faster parsing";
        break;
    }
  }

  // Link recommendations
  else if (category === "links") {
    recommendation.recommendations?.forEach((rec) => {
      switch (rec.category) {
        case "security":
          humanReadable.title = "🔒 Fix Security Issues";
          humanReadable.description = `${rec.message}`;
          humanReadable.action =
            "Add crossorigin attributes to external preconnect links for better security.";
          humanReadable.impact = "Improved security and CORS compliance";
          break;
        case "standards":
          humanReadable.title = "📋 Fix HTML Standards";
          humanReadable.description = `${rec.message}`;
          humanReadable.action = "Use valid HTML5 rel attribute values according to web standards.";
          humanReadable.impact = "Better browser compatibility and SEO";
          break;
        case "performance":
          humanReadable.title = "🚀 Optimize Preloads";
          humanReadable.description = `${rec.message}`;
          humanReadable.action =
            "Review your preload strategy and use more efficient resource formats.";
          humanReadable.impact = "Faster loading of critical resources";
          break;
        case "accessibility":
          humanReadable.title = "♿ Improve Accessibility";
          humanReadable.description = `${rec.message}`;
          humanReadable.action =
            "Add missing type attributes and improve semantic markup for screen readers.";
          humanReadable.impact = "Better accessibility for users with disabilities";
          break;
      }
    });
  }

  // Fallback for generic recommendations
  if (!humanReadable.title) {
    humanReadable.title = "💡 Performance Improvement";
    humanReadable.description =
      recommendation.message ||
      recommendation.issue ||
      "Performance optimization opportunity detected.";
    humanReadable.action =
      recommendation.recommendation ||
      recommendation.action ||
      "Review and optimize this aspect of your page.";
    humanReadable.impact = recommendation.impact || "Improved page performance";
  }

  return humanReadable;
}

// Create recommendation category section with human-readable text
function createRecommendationCategory(key, title, icon, data) {
  const categoryContainer = document.createElement("div");
  categoryContainer.className = "recommendation-category";

  const header = document.createElement("div");
  header.className = "category-header";

  // Count total recommendations
  let totalRecommendations = 0;
  if (data.analysis?.recommendations) {
    totalRecommendations = data.analysis.recommendations.length;
  } else if (data.recommendations) {
    totalRecommendations = data.recommendations.length;
  }

  header.innerHTML = `
    <span class="category-icon">${icon}</span>
    <span class="category-title">${title}</span>
    <span class="category-count">${totalRecommendations} ${
    totalRecommendations === 1 ? "item" : "items"
  }</span>
  `;

  const content = document.createElement("div");
  content.className = "category-content";

  // Handle different data structures
  let recommendations = [];
  if (data.analysis?.recommendations) {
    recommendations = data.analysis.recommendations;
  } else if (data.recommendations) {
    recommendations = data.recommendations;
  }

  if (recommendations.length === 0) {
    const noIssues = document.createElement("div");
    noIssues.className = "no-issues";
    noIssues.innerHTML = `
      <div class="no-issues-icon">✅</div>
      <div class="no-issues-text">No issues found in this category</div>
    `;
    content.appendChild(noIssues);
  } else {
    recommendations.forEach((recommendation) => {
      const humanized = humanizeRecommendation(recommendation, key);

      const item = document.createElement("div");
      item.className = `recommendation-item priority-${humanized.priority}`;

      item.innerHTML = `
        <div class="recommendation-header">
          <div class="recommendation-title">${humanized.title}</div>
          <div class="recommendation-priority priority-${
            humanized.priority
          }">${humanized.priority.toUpperCase()}</div>
        </div>
        <div class="recommendation-description">${humanized.description}</div>
        <div class="recommendation-action">
          <strong>What to do:</strong> ${humanized.action}
        </div>
        <div class="recommendation-impact">
          <strong>Impact:</strong> ${humanized.impact}
        </div>
      `;
      content.appendChild(item);
    });
  }

  categoryContainer.appendChild(header);
  categoryContainer.appendChild(content);

  return categoryContainer;
}

// Get score display text
function getScoreDisplayText(score) {
  switch (score) {
    case "good":
      return "Good";
    case "needs-improvement":
      return "Needs Improvement";
    case "poor":
      return "Poor";
    default:
      return "Unknown";
  }
}

// Initialize recommendations display functionality
function initializeRecommendationsDisplay() {
  const copyButton = document.getElementById("copy-recommendations-btn");

  if (copyButton) {
    copyButton.addEventListener("click", handleCopyRecommendations);
  }

  // Listen for recommendations data and loading state updates
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          const tabId = tabs[0].id;
          const recommendationsKey = `recommendations_${tabId}`;
          const loadingKey = `recommendationsLoading_${tabId}`;
          const errorKey = `recommendationsError_${tabId}`;

          // Handle recommendations data changes
          if (changes[recommendationsKey]) {
            if (changes[recommendationsKey].newValue) {
              displayRecommendations(changes[recommendationsKey].newValue);
              loadingStateManager.completeRecommendationsLoading(true);
            } else {
              hideRecommendationsDisplay();
            }
          }

          // Handle loading state changes
          if (changes[loadingKey]) {
            const isLoading = changes[loadingKey].newValue === true;
            if (isLoading) {
              loadingStateManager.startRecommendationsLoading();
            } else if (!changes[recommendationsKey] && !changes[errorKey]) {
              // Only complete loading if no data or error update is also happening
              loadingStateManager.completeRecommendationsLoading(true);
            }
          }

          // Handle error state changes
          if (changes[errorKey]) {
            if (changes[errorKey].newValue) {
              const errorData = changes[errorKey].newValue;
              const userMessage = getUserFriendlyRecommendationsError(
                errorData.error?.code || "UNKNOWN_ERROR",
                errorData.error?.message || "Analysis failed"
              );
              loadingStateManager.completeRecommendationsLoading(false, userMessage);
              showRecommendationsError(userMessage);
            }
          }
        }
      });
    }
  });

  // Check for existing recommendations on load
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const tabId = tabs[0].id;
      chrome.storage.local.get([`recommendations_${tabId}`], (result) => {
        const recommendations = result[`recommendations_${tabId}`];
        if (recommendations) {
          displayRecommendations(recommendations);
        }
      });
    }
  });
}

// Generate LLM-optimized recommendations prompt
function generateLLMOptimizedPrompt(recommendations) {
  try {
    const parsedData = JSON.parse(recommendations);

    const llmPrompt = `# Web Performance Analysis Report

## Context & Instructions
This is a technical performance analysis of a website. Please convert this data into clear, actionable recommendations for web developers.

**Target Audience:** Web developers and site owners
**Goal:** Improve website performance and user experience

## Analysis Overview
- **Website:** ${parsedData.metadata?.url || "Unknown"}
- **Analysis Date:** ${parsedData.metadata?.analysisDate || new Date().toISOString()}
- **Page Type:** ${parsedData._analysisContext?.pageType || "Unknown"}
- **Technology Stack:** ${parsedData._analysisContext?.technologyStack?.join(", ") || "Unknown"}
- **Performance Complexity:** ${
      parsedData._analysisContext?.performanceProfile?.complexityLevel || "Unknown"
    }

## Summary Statistics
- **Total Issues:** ${parsedData.summary?.totalIssues || 0}
- **Critical Issues:** ${parsedData.summary?.criticalIssues || 0}
- **Overall Score:** ${parsedData.summary?.overallScore || "Unknown"}

## Business Impact
${
  parsedData._analysisContext?.businessImpact?.businessContext ||
  "Performance impact assessment not available"
}

**User Experience Impact:** ${
      parsedData._analysisContext?.businessImpact?.userExperienceImpact || "Unknown"
    }
**SEO Impact:** ${parsedData._analysisContext?.businessImpact?.seoImpact || "Unknown"}

## Technical Analysis Data
\`\`\`json
${JSON.stringify(parsedData, null, 2)}
\`\`\`

## Please provide a comprehensive report with:

### 1. Executive Summary (2-3 sentences)
Summarize the overall performance state and most critical findings.

### 2. Critical Issues (Fix Immediately)
List issues that significantly impact user experience, with:
- Clear problem description
- Step-by-step solution
- Expected performance impact
- Estimated implementation time

### 3. Important Optimizations (Fix Soon)
Medium-priority improvements that will provide noticeable benefits.

### 4. Nice-to-Have Improvements (Fix Later)
Low-priority optimizations for incremental gains.

### 5. Implementation Roadmap
Prioritized order of fixes with timeline recommendations.

### 6. Monitoring & Validation
How to measure success after implementing fixes.

**Format:** Use clear headings, bullet points, and actionable language. Avoid overly technical jargon.`;

    return llmPrompt;
  } catch (error) {
    console.error("Error generating LLM prompt:", error);
    return recommendations; // Fallback to raw data
  }
}

// Handle copy recommendations to clipboard with LLM optimization
function handleCopyRecommendations() {
  const copyButton = document.getElementById("copy-recommendations-btn");
  const recommendationsData = copyButton?.getAttribute("data-recommendations");

  if (!recommendationsData) {
    showToast("No recommendations data to copy", "error");
    announceToScreenReader("No recommendations data available to copy");
    return;
  }

  try {
    // Generate LLM-optimized prompt
    const llmOptimizedPrompt = generateLLMOptimizedPrompt(recommendationsData);

    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(llmOptimizedPrompt)
        .then(() => {
          showToast("LLM-ready analysis copied to clipboard!", "success");
          announceToScreenReader(
            "Performance analysis with LLM instructions copied to clipboard successfully"
          );

          // Animate button feedback
          animateButtonClick(copyButton);
        })
        .catch((error) => {
          console.error("Clipboard API failed:", error);
          // Fallback to raw data
          fallbackCopyToClipboard(recommendationsData);
        });
    } else {
      // Fallback for older browsers
      fallbackCopyToClipboard(llmOptimizedPrompt);
    }
  } catch (error) {
    console.error("Error copying recommendations:", error);
    // Fallback to raw data
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(recommendationsData);
        showToast("Raw recommendations copied to clipboard", "success");
      } else {
        fallbackCopyToClipboard(recommendationsData);
      }
    } catch (fallbackError) {
      showToast("Failed to copy recommendations", "error");
      announceToScreenReader("Failed to copy recommendations to clipboard");
    }
  }
}

// Fallback copy method for older browsers
function fallbackCopyToClipboard(text) {
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);

    if (successful) {
      showToast("Recommendations copied to clipboard!", "success");
      announceToScreenReader("Recommendations copied to clipboard using fallback method");
    } else {
      showToast("Failed to copy recommendations", "error");
      announceToScreenReader("Failed to copy recommendations to clipboard");
    }
  } catch (error) {
    console.error("Fallback copy failed:", error);
    showToast("Copy not supported in this browser", "error");
    announceToScreenReader("Copy to clipboard is not supported in this browser");
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

  // Initialize recommendations functionality
  initializeRecommendationsButton();

  // Initialize recommendations display functionality
  initializeRecommendationsDisplay();

  // Initialize accessibility features
  initializeAccessibilityFeatures();

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

  // Initialize accessibility features
  function initializeAccessibilityFeatures() {
    // Create screen reader announcement area if it doesn't exist
    let srElement = document.getElementById("sr-announcements");
    if (!srElement) {
      srElement = document.createElement("div");
      srElement.id = "sr-announcements";
      srElement.setAttribute("aria-live", "polite");
      srElement.setAttribute("aria-atomic", "true");
      srElement.style.position = "absolute";
      srElement.style.left = "-10000px";
      srElement.style.width = "1px";
      srElement.style.height = "1px";
      srElement.style.overflow = "hidden";
      document.body.appendChild(srElement);
    }

    // Add keyboard navigation support
    addKeyboardNavigation();

    // Add focus management
    addFocusManagement();

    // Add high contrast support detection
    detectHighContrastMode();
  }

  // Add keyboard navigation support
  function addKeyboardNavigation() {
    document.addEventListener("keydown", (event) => {
      // Escape key to close any open modals or clear focus
      if (event.key === "Escape") {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.blur) {
          activeElement.blur();
        }

        // Clear any error states
        const errorStates = document.querySelectorAll(".error-state");
        errorStates.forEach((error) => {
          if (error.style.display !== "none") {
            announceToScreenReader("Error message dismissed");
          }
        });
      }

      // Enter key on buttons
      if (event.key === "Enter" && event.target.tagName === "BUTTON") {
        event.target.click();
      }
    });
  }

  // Add focus management for better accessibility
  function addFocusManagement() {
    // Ensure buttons have proper focus indicators
    const buttons = document.querySelectorAll("button");
    buttons.forEach((button) => {
      button.addEventListener("focus", () => {
        button.style.outline = "2px solid #007cba";
        button.style.outlineOffset = "2px";
      });

      button.addEventListener("blur", () => {
        button.style.outline = "";
        button.style.outlineOffset = "";
      });
    });

    // Manage focus for dynamic content
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // If error content is added, announce it
              if (node.classList && node.classList.contains("error-state")) {
                const errorText = node.textContent || "Error occurred";
                announceToScreenReader(`Error: ${errorText}`);
              }

              // If recommendations are added, announce completion
              if (node.classList && node.classList.contains("recommendations-content")) {
                announceToScreenReader("Performance recommendations generated successfully");
              }
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Detect high contrast mode for better accessibility
  function detectHighContrastMode() {
    // Check for Windows high contrast mode
    if (window.matchMedia && window.matchMedia("(prefers-contrast: high)").matches) {
      document.body.classList.add("high-contrast");
      console.log("High contrast mode detected");
    }

    // Check for forced colors (Windows high contrast)
    if (window.matchMedia && window.matchMedia("(forced-colors: active)").matches) {
      document.body.classList.add("forced-colors");
      console.log("Forced colors mode detected");
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
      console.warn("Critical integration issues detected");
    }
  }

  // Handle metrics validation response
  function handleMetricsValidation(validation) {
    console.log("Metrics Validation:", validation);
  }

  // Initialize recommendations display functionality
  function initializeRecommendationsDisplay() {
    const copyButton = document.getElementById("copy-recommendations-btn");

    if (copyButton) {
      copyButton.addEventListener("click", handleCopyRecommendations);
    }

    // Listen for recommendations data and loading state updates
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "local") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            const tabId = tabs[0].id;
            const recommendationsKey = `recommendations_${tabId}`;
            const loadingKey = `recommendationsLoading_${tabId}`;
            const errorKey = `recommendationsError_${tabId}`;

            // Handle recommendations data changes
            if (changes[recommendationsKey]) {
              if (changes[recommendationsKey].newValue) {
                displayRecommendations(changes[recommendationsKey].newValue);
                loadingStateManager.completeRecommendationsLoading(true);
              } else {
                hideRecommendationsDisplay();
              }
            }

            // Handle loading state changes
            if (changes[loadingKey]) {
              const isLoading = changes[loadingKey].newValue === true;
              if (isLoading) {
                loadingStateManager.startRecommendationsLoading();
              } else if (!changes[recommendationsKey] && !changes[errorKey]) {
                // Only complete loading if no data or error update is also happening
                loadingStateManager.completeRecommendationsLoading(true);
              }
            }

            // Handle error state changes
            if (changes[errorKey]) {
              if (changes[errorKey].newValue) {
                const errorData = changes[errorKey].newValue;
                const userMessage = getUserFriendlyRecommendationsError(
                  errorData.error?.code || "UNKNOWN_ERROR",
                  errorData.error?.message || "Analysis failed"
                );
                loadingStateManager.completeRecommendationsLoading(false, userMessage);
                showRecommendationsError(userMessage);
              }
            }
          }
        });
      }
    });

    // Check for existing recommendations on load
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const tabId = tabs[0].id;
        chrome.storage.local.get([`recommendations_${tabId}`], (result) => {
          const recommendations = result[`recommendations_${tabId}`];
          if (recommendations) {
            displayRecommendations(recommendations);
          }
        });
      }
    });
  }

  // Display recommendations in the UI
  function displayRecommendations(recommendations) {
    const displaySection = document.getElementById("recommendations-display-section");
    const contentContainer = document.getElementById("recommendations-content");

    if (!displaySection || !contentContainer) {
      console.error("Recommendations display elements not found");
      return;
    }

    // Show the display section
    displaySection.style.display = "block";

    // Clear existing content
    contentContainer.innerHTML = "";

    try {
      // Create summary section
      const summaryElement = createRecommendationsSummary(recommendations.summary);
      contentContainer.appendChild(summaryElement);

      // Create category sections
      const categories = [
        { key: "cache", title: "Cache Analysis", icon: "🗄️" },
        { key: "lcp", title: "LCP Optimization", icon: "🎯" },
        { key: "scripts", title: "Script Analysis", icon: "📜" },
        { key: "links", title: "Link Tag Analysis", icon: "🔗" },
        { key: "css", title: "CSS Analysis", icon: "🎨" },
      ];

      categories.forEach((category) => {
        if (recommendations[category.key]) {
          const categoryElement = createRecommendationCategory(
            category.key,
            category.title,
            category.icon,
            recommendations[category.key]
          );
          contentContainer.appendChild(categoryElement);
        }
      });

      // Enable copy button
      const copyButton = document.getElementById("copy-recommendations-btn");
      if (copyButton) {
        copyButton.disabled = false;
        copyButton.setAttribute("data-recommendations", JSON.stringify(recommendations, null, 2));
      }

      // Announce to screen readers
      announceToScreenReader("Performance recommendations loaded and displayed");
    } catch (error) {
      console.error("Error displaying recommendations:", error);
      showRecommendationsError("Failed to display recommendations");
    }
  }

  // Create recommendations summary section
  function createRecommendationsSummary(summary) {
    const summaryContainer = document.createElement("div");
    summaryContainer.className = "recommendations-summary";

    const title = document.createElement("div");
    title.className = "summary-title";
    title.innerHTML = `<span>📊</span> Analysis Summary`;

    const grid = document.createElement("div");
    grid.className = "summary-grid";

    // Total issues
    const totalIssues = document.createElement("div");
    totalIssues.className = "summary-item";
    totalIssues.innerHTML = `
      <span class="summary-value">${summary.totalIssues || 0}</span>
      <span class="summary-label">Total Issues</span>
    `;

    // Critical issues
    const criticalIssues = document.createElement("div");
    criticalIssues.className = "summary-item";
    criticalIssues.innerHTML = `
      <span class="summary-value">${summary.criticalIssues || 0}</span>
      <span class="summary-label">Critical Issues</span>
    `;

    // Optimization opportunities
    const opportunities = document.createElement("div");
    opportunities.className = "summary-item";
    opportunities.innerHTML = `
      <span class="summary-value">${summary.optimizationOpportunities || 0}</span>
      <span class="summary-label">Opportunities</span>
    `;

    // Overall score
    const overallScore = document.createElement("div");
    overallScore.className = `overall-score ${summary.overallScore || "unknown"}`;
    const scoreText = getScoreDisplayText(summary.overallScore);
    overallScore.innerHTML = `Overall Score: ${scoreText}`;

    grid.appendChild(totalIssues);
    grid.appendChild(criticalIssues);
    grid.appendChild(opportunities);
    grid.appendChild(overallScore);

    summaryContainer.appendChild(title);
    summaryContainer.appendChild(grid);

    return summaryContainer;
  }

  // Create recommendation category section
  function createRecommendationCategory(key, title, icon, data) {
    const categoryContainer = document.createElement("div");
    categoryContainer.className = "recommendation-category";
    categoryContainer.setAttribute("data-category", key);

    // Determine category status
    const status = getCategoryStatus(key, data);

    // Create header
    const header = document.createElement("button");
    header.className = "category-header";
    header.setAttribute("aria-expanded", "false");
    header.setAttribute("aria-controls", `category-content-${key}`);

    const titleElement = document.createElement("div");
    titleElement.className = "category-title";
    titleElement.innerHTML = `<span>${icon}</span> ${title}`;

    const statusElement = document.createElement("div");
    statusElement.className = `category-status ${status.type}`;
    statusElement.innerHTML = `${status.icon} ${status.text}`;

    const expandIcon = document.createElement("span");
    expandIcon.className = "category-expand-icon";
    expandIcon.innerHTML = "▶";

    header.appendChild(titleElement);
    header.appendChild(statusElement);
    header.appendChild(expandIcon);

    // Create content
    const content = document.createElement("div");
    content.className = "category-content";
    content.id = `category-content-${key}`;
    content.setAttribute("aria-labelledby", `category-header-${key}`);

    // Populate content based on category
    populateCategoryContent(content, key, data);

    // Add click handler for expand/collapse
    header.addEventListener("click", () => {
      const isExpanded = categoryContainer.classList.contains("expanded");

      if (isExpanded) {
        categoryContainer.classList.remove("expanded");
        header.setAttribute("aria-expanded", "false");
      } else {
        categoryContainer.classList.add("expanded");
        header.setAttribute("aria-expanded", "true");
      }
    });

    categoryContainer.appendChild(header);
    categoryContainer.appendChild(content);

    return categoryContainer;
  }

  // Populate category content based on type
  function populateCategoryContent(container, key, data) {
    switch (key) {
      case "cache":
        populateCacheContent(container, data);
        break;
      case "lcp":
        populateLCPContent(container, data);
        break;
      case "scripts":
        populateScriptsContent(container, data);
        break;
      case "links":
        populateLinksContent(container, data);
        break;
      case "css":
        populateCSSContent(container, data);
        break;
      default:
        container.innerHTML = createJSONDisplay(data);
    }
  }

  // Populate cache analysis content
  function populateCacheContent(container, data) {
    const items = [];

    if (data.browserCache) {
      items.push({
        label: "Browser Cache Status",
        value: data.browserCache.status,
        type: data.browserCache.status === "cached" ? "good" : "improvement",
      });

      if (data.browserCache.ttl) {
        items.push({
          label: "Browser Cache TTL",
          value: `${data.browserCache.ttl} seconds`,
          type: "good",
        });
      }
    }

    if (data.cdnCache) {
      items.push({
        label: "CDN Cache Status",
        value: data.cdnCache.status,
        type: data.cdnCache.status === "hit" ? "good" : "improvement",
      });

      if (data.cdnCache.provider && data.cdnCache.provider !== "unknown") {
        items.push({
          label: "CDN Provider",
          value: data.cdnCache.provider,
          type: "good",
        });
      }
    }

    items.forEach((item) => {
      container.appendChild(createRecommendationItem(item));
    });
  }

  // Populate LCP analysis content
  function populateLCPContent(container, data) {
    const items = [];

    items.push({
      label: "LCP Element Found",
      value: data.elementFound ? "Yes" : "No",
      type: data.elementFound ? "good" : "problems",
    });

    if (data.elementFound) {
      items.push({
        label: "Server-Side Rendered",
        value: data.serverSideRendered ? "Yes" : "No",
        type: data.serverSideRendered ? "good" : "improvement",
      });

      if (data.elementType) {
        items.push({
          label: "Element Type",
          value: data.elementType,
          type: "good",
        });
      }

      items.push({
        label: "Preload Exists",
        value: data.preloadExists ? "Yes" : "No",
        type: data.preloadExists ? "good" : "improvement",
      });
    }

    items.forEach((item) => {
      container.appendChild(createRecommendationItem(item));
    });
  }

  // Populate scripts analysis content
  function populateScriptsContent(container, data) {
    const items = [];

    if (data.duplicates && data.duplicates.length > 0) {
      items.push({
        label: "Duplicate Scripts",
        value: data.duplicates,
        type: "problems",
        isArray: true,
      });
    } else {
      items.push({
        label: "Duplicate Scripts",
        value: "None found",
        type: "good",
      });
    }

    if (data.deferScripts && data.deferScripts.length > 0) {
      items.push({
        label: "Defer Scripts",
        value: data.deferScripts,
        type: "good",
        isArray: true,
      });
    }

    if (data.asyncScripts && data.asyncScripts.length > 0) {
      items.push({
        label: "Async Scripts",
        value: data.asyncScripts,
        type: "good",
        isArray: true,
      });
    }

    items.push({
      label: "Total External Scripts",
      value: data.totalExternalScripts || 0,
      type: "good",
    });

    items.forEach((item) => {
      container.appendChild(createRecommendationItem(item));
    });
  }

  // Populate links analysis content
  function populateLinksContent(container, data) {
    const items = [];

    if (data.bodyLinks && data.bodyLinks.length > 0) {
      items.push({
        label: "Misplaced Links (in BODY)",
        value: data.bodyLinks,
        type: "problems",
        isArray: true,
      });
    } else {
      items.push({
        label: "Misplaced Links",
        value: "None found",
        type: "good",
      });
    }

    if (data.duplicatePreloads && data.duplicatePreloads.length > 0) {
      items.push({
        label: "Duplicate Preloads",
        value: data.duplicatePreloads,
        type: "problems",
        isArray: true,
      });
    } else {
      items.push({
        label: "Duplicate Preloads",
        value: "None found",
        type: "good",
      });
    }

    if (data.invalidPreloads && data.invalidPreloads.length > 0) {
      items.push({
        label: "Invalid Preloads",
        value: data.invalidPreloads,
        type: "problems",
        isArray: true,
      });
    }

    if (data.redundantPreloads && data.redundantPreloads.length > 0) {
      items.push({
        label: "Redundant Preloads",
        value: data.redundantPreloads,
        type: "improvement",
        isArray: true,
      });
    }

    items.push({
      label: "Total Preloads",
      value: data.totalPreloads || 0,
      type: "good",
    });

    items.forEach((item) => {
      container.appendChild(createRecommendationItem(item));
    });
  }

  // Populate CSS analysis content
  function populateCSSContent(container, data) {
    const items = [];

    if (data.stylesheets && data.stylesheets.length > 0) {
      const misplacedCount = data.stylesheets.filter((s) => s.position !== "head").length;
      const duplicateCount = data.stylesheets.filter((s) => s.isDuplicate).length;

      items.push({
        label: "Total Stylesheets",
        value: data.stylesheets.length,
        type: "good",
      });

      if (misplacedCount > 0) {
        items.push({
          label: "Misplaced Stylesheets",
          value: misplacedCount,
          type: "problems",
        });
      } else {
        items.push({
          label: "Misplaced Stylesheets",
          value: "None found",
          type: "good",
        });
      }

      if (duplicateCount > 0) {
        items.push({
          label: "Duplicate Stylesheets",
          value: duplicateCount,
          type: "problems",
        });
      } else {
        items.push({
          label: "Duplicate Stylesheets",
          value: "None found",
          type: "good",
        });
      }
    } else {
      items.push({
        label: "Stylesheets",
        value: "None found",
        type: "good",
      });
    }

    items.forEach((item) => {
      container.appendChild(createRecommendationItem(item));
    });
  }

  // Create individual recommendation item
  function createRecommendationItem(item) {
    const itemElement = document.createElement("div");
    itemElement.className = `recommendation-item ${item.type}`;

    const label = document.createElement("div");
    label.className = "recommendation-label";
    label.textContent = item.label;

    const value = document.createElement("div");
    value.className = "recommendation-value";

    if (item.isArray && Array.isArray(item.value)) {
      if (item.value.length === 0) {
        value.innerHTML = '<span class="empty-array">No items</span>';
      } else {
        const arrayContainer = document.createElement("div");
        arrayContainer.className = "recommendation-array";

        item.value.forEach((arrayItem) => {
          const arrayItemElement = document.createElement("div");
          arrayItemElement.className = "array-item";
          arrayItemElement.textContent = arrayItem;
          arrayContainer.appendChild(arrayItemElement);
        });

        value.appendChild(arrayContainer);
      }
    } else {
      value.textContent = item.value;
    }

    itemElement.appendChild(label);
    itemElement.appendChild(value);

    return itemElement;
  }

  // Create JSON display
  function createJSONDisplay(data) {
    const jsonString = JSON.stringify(data, null, 2);
    return `<div class="json-display">${syntaxHighlightJSON(jsonString)}</div>`;
  }

  // Syntax highlight JSON
  function syntaxHighlightJSON(json) {
    return json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        function (match) {
          let cls = "json-number";
          if (/^"/.test(match)) {
            if (/:$/.test(match)) {
              cls = "json-key";
            } else {
              cls = "json-string";
            }
          } else if (/true|false/.test(match)) {
            cls = "json-boolean";
          } else if (/null/.test(match)) {
            cls = "json-null";
          }
          return '<span class="' + cls + '">' + match + "</span>";
        }
      )
      .replace(/([{}[\]])/g, '<span class="json-bracket">$1</span>');
  }

  // Get category status
  function getCategoryStatus(key, data) {
    // Default status
    let status = { type: "good", icon: "✅", text: "Good" };

    switch (key) {
      case "cache":
        if (!data.browserCache || data.browserCache.status !== "cached") {
          status = { type: "improvement", icon: "⚠️", text: "Improvement" };
        }
        break;

      case "lcp":
        if (!data.elementFound || !data.serverSideRendered || !data.preloadExists) {
          status = { type: "improvement", icon: "⚠️", text: "Improvement" };
        }
        if (!data.elementFound) {
          status = { type: "problems", icon: "❌", text: "Problems" };
        }
        break;

      case "scripts":
        if (data.duplicates && data.duplicates.length > 0) {
          status = { type: "problems", icon: "❌", text: "Problems" };
        }
        break;

      case "links":
        const hasProblems =
          (data.bodyLinks && data.bodyLinks.length > 0) ||
          (data.duplicatePreloads && data.duplicatePreloads.length > 0) ||
          (data.invalidPreloads && data.invalidPreloads.length > 0);

        if (hasProblems) {
          status = { type: "problems", icon: "❌", text: "Problems" };
        } else if (data.redundantPreloads && data.redundantPreloads.length > 0) {
          status = { type: "improvement", icon: "⚠️", text: "Improvement" };
        }
        break;

      case "css":
        if (data.misplacedCount > 0) {
          status = { type: "problems", icon: "❌", text: "Problems" };
        }
        break;
    }

    return status;
  }

  // Get score display text
  function getScoreDisplayText(score) {
    switch (score) {
      case "good":
        return "Good ✅";
      case "needs-improvement":
        return "Needs Improvement ⚠️";
      case "poor":
        return "Poor ❌";
      default:
        return "Unknown";
    }
  }

  // Handle copy recommendations to clipboard
  function handleCopyRecommendations() {
    const copyButton = document.getElementById("copy-recommendations-btn");
    const recommendationsData = copyButton?.getAttribute("data-recommendations");

    if (!recommendationsData) {
      showToast("No recommendations data to copy", "error");
      announceToScreenReader("Error: No recommendations data available to copy");
      return;
    }

    // Check if button is disabled
    if (copyButton.disabled) {
      showToast("Copy function is currently disabled", "error");
      return;
    }

    // Animate button click
    animateButtonClick(copyButton);

    try {
      // Copy to clipboard
      navigator.clipboard
        .writeText(recommendationsData)
        .then(() => {
          // Show success feedback
          showToast("Recommendations copied to clipboard!", "success");
          announceToScreenReader("Recommendations copied to clipboard");

          // Temporarily change button appearance
          const originalText = copyButton.querySelector(".button-text").textContent;
          const originalIcon = copyButton.querySelector(".button-icon").textContent;

          copyButton.classList.add("success");
          copyButton.querySelector(".button-text").textContent = "Copied!";
          copyButton.querySelector(".button-icon").textContent = "✓";
          copyButton.disabled = true; // Prevent multiple clicks during feedback

          setTimeout(() => {
            copyButton.classList.remove("success");
            copyButton.querySelector(".button-text").textContent = originalText;
            copyButton.querySelector(".button-icon").textContent = originalIcon;
            copyButton.disabled = false; // Re-enable button
          }, 2000);
        })
        .catch((error) => {
          console.error("Failed to copy recommendations:", error);
          showToast("Failed to copy recommendations", "error");
          announceToScreenReader("Failed to copy recommendations to clipboard");

          // Fallback: try using the older API
          fallbackCopyToClipboard(recommendationsData);
        });
    } catch (error) {
      console.error("Clipboard API not available:", error);
      fallbackCopyToClipboard(recommendationsData);
    }
  }

  // Fallback copy method for older browsers
  function fallbackCopyToClipboard(text) {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);

      if (successful) {
        showToast("Recommendations copied to clipboard!", "success");
        announceToScreenReader("Recommendations copied to clipboard using fallback method");
      } else {
        showToast("Failed to copy recommendations", "error");
        announceToScreenReader("Failed to copy recommendations to clipboard");
      }
    } catch (error) {
      console.error("Fallback copy failed:", error);
      showToast("Copy not supported in this browser", "error");
      announceToScreenReader("Copy to clipboard is not supported in this browser");
    }
  }

  // Hide recommendations display
  function hideRecommendationsDisplay() {
    const displaySection = document.getElementById("recommendations-display-section");
    if (displaySection) {
      displaySection.style.display = "none";
    }

    // Disable copy button
    const copyButton = document.getElementById("copy-recommendations-btn");
    if (copyButton) {
      copyButton.disabled = true;
      copyButton.removeAttribute("data-recommendations");
    }
  }

  // Show recommendations error
  function showRecommendationsError(message) {
    const displaySection = document.getElementById("recommendations-display-section");
    const contentContainer = document.getElementById("recommendations-content");

    if (!displaySection || !contentContainer) return;

    // Show the display section
    displaySection.style.display = "block";

    contentContainer.innerHTML = `
      <div class="recommendations-error">
        <span class="error-icon">⚠️</span>
        <span class="error-message">${message}</span>
        <button class="retry-button" onclick="generateRecommendations()">
          <span class="button-icon">🔄</span>
          <span class="button-text">Try Again</span>
        </button>
      </div>
    `;

    // Disable copy button when showing error
    const copyButton = document.getElementById("copy-recommendations-btn");
    if (copyButton) {
      copyButton.disabled = true;
      copyButton.removeAttribute("data-recommendations");
    }

    // Announce error to screen readers
    announceToScreenReader(`Recommendations error: ${message}`);
  }
});

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

          // Update recommendations button state now that metrics are available
          updateRecommendationsButtonState();
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
          updateExtensionStatus("loading");
        } else {
          // No metrics and not loading - show generic error with helpful message
          showGenericError(tabUrl, errors);
        }

        // Update recommendations button state based on current loading state
        updateRecommendationsButtonState();
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

    // Update recommendations button state while loading
    updateRecommendationsButtonState();
  });
}

function showErrorState(message) {
  // Update status to error
  updateExtensionStatus("error");

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

  // Update status to ready when metrics are displayed
  updateExtensionStatus("ready");

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
      event.preventDefault();

      // Animate button click
      animateButtonClick(refreshButton);

      // Show confirmation and perform hard refresh
      performHardRefresh();
    });
  } else {
    console.error("Refresh button not found!");
  }
}

// Perform hard refresh of the current page
function performHardRefresh() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const tabId = tabs[0].id;

      // Clear all stored data for this tab before refresh
      clearTabData(tabId);

      // Show feedback to user
      showToast("Performing hard refresh...", "info");
      announceToScreenReader("Performing hard refresh to clear cache and reload metrics");

      // Perform hard refresh (bypass cache)
      chrome.tabs.reload(tabId, { bypassCache: true }, () => {
        if (chrome.runtime.lastError) {
          console.error("Failed to reload tab:", chrome.runtime.lastError);
          showToast("Failed to refresh page", "error");
        } else {
          console.log("Hard refresh initiated for tab", tabId);
          // Close popup after successful refresh
          window.close();
        }
      });
    } else {
      showToast("No active tab found", "error");
    }
  });
}

// Clear all stored data for a specific tab
function clearTabData(tabId) {
  console.log("Clearing all data for tab", tabId);

  // Clear from chrome storage
  const keysToRemove = [
    `metrics_${tabId}`,
    `metricsLoading_${tabId}`,
    `recommendations_${tabId}`,
    `recommendationsTimestamp_${tabId}`,
    `recommendationsLoading_${tabId}`,
    `recommendationsError_${tabId}`,
    `clsDebugger_${tabId}`,
    `errors_${tabId}`,
    `hasErrors_${tabId}`,
    `pageSupport_${tabId}`,
    `permissionError_${tabId}`,
    `apiSupport_${tabId}`,
    `limitations_${tabId}`,
  ];

  chrome.storage.local.remove(keysToRemove, () => {
    if (chrome.runtime.lastError) {
      console.error("Error clearing tab data:", chrome.runtime.lastError);
    } else {
      console.log("Tab data cleared successfully");
    }
  });

  // Clear from state manager
  if (stateManager) {
    stateManager.clearTabData(tabId);
  }
}

// Recommendations functionality
function initializeRecommendationsButton() {
  const recommendationsButton = document.getElementById("generate-recommendations-btn");
  if (recommendationsButton) {
    recommendationsButton.addEventListener("click", (event) => {
      // Animate button click
      animateButtonClick(recommendationsButton);

      // Generate recommendations
      generateRecommendations();

      // Update status to analyzing
      updateExtensionStatus("analyzing");
    });

    // Initialize button state
    updateRecommendationsButtonState();
  } else {
    console.error("Recommendations button not found!");
  }
}

// Generate performance recommendations with comprehensive error handling
function generateRecommendations() {
  try {
    // Check if page is still loading
    if (loadingStateManager.isLoading()) {
      showToast("Please wait for metrics to finish loading", "info");
      announceToScreenReader("Please wait for metrics to finish loading");
      return;
    }

    // Validate current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        handleError(new Error("No active tab found"), "recommendations");
        return;
      }

      const tab = tabs[0];
      const tabId = tab.id;

      // Check if tab URL is supported
      if (!isTabSupported(tab)) {
        const errorMessage = getUnsupportedTabMessage(tab);
        handleError(new Error(errorMessage), "recommendations");
        return;
      }

      // Start recommendations loading state
      loadingStateManager.startRecommendationsLoading();
      announceToScreenReader("Starting performance analysis");

      // Set timeout for the entire operation
      const operationTimeout = setTimeout(() => {
        loadingStateManager.completeRecommendationsLoading(
          false,
          "Analysis timed out. Please try again."
        );
        handleError(new Error("Recommendations generation timed out"), "recommendations");
      }, 45000); // 45 second timeout

      // Send message to content script
      chrome.tabs.sendMessage(tabId, { type: "generateRecommendations" }, (response) => {
        clearTimeout(operationTimeout);

        // Handle Chrome runtime errors
        if (chrome.runtime.lastError) {
          const runtimeError = chrome.runtime.lastError.message;
          console.error("Chrome runtime error:", runtimeError);

          let userMessage;
          if (runtimeError.includes("Could not establish connection")) {
            userMessage = "Could not connect to the page. Please refresh and try again.";
          } else if (runtimeError.includes("The message port closed")) {
            userMessage = "Connection to page was lost. Please refresh and try again.";
          } else if (runtimeError.includes("No tab with id")) {
            userMessage = "Tab is no longer available. Please try again.";
          } else {
            userMessage = "Extension communication error. Please refresh the page.";
          }

          loadingStateManager.completeRecommendationsLoading(false, userMessage);
          handleError(new Error(runtimeError), "recommendations");
          return;
        }

        // Handle response
        if (response && response.success) {
          // Success case
          loadingStateManager.completeRecommendationsLoading(true);
          announceToScreenReader("Performance recommendations generated successfully");

          // Store recommendations data for display
          if (response.data) {
            chrome.storage.local.set(
              {
                [`recommendations_${tabId}`]: response.data,
                [`recommendationsTimestamp_${tabId}`]: Date.now(),
              },
              () => {
                if (chrome.runtime.lastError) {
                  console.warn("Could not store recommendations:", chrome.runtime.lastError);
                  showToast("Recommendations generated but could not be saved", "warning");
                } else {
                  // Trigger display update
                  displayRecommendations(response.data);
                }
              }
            );
          } else {
            showToast("Recommendations generated but no data received", "warning");
          }
        } else {
          // Error case
          const errorData = response?.error || {};
          const errorMessage = errorData.message || "Analysis failed for unknown reason";
          const errorCode = errorData.code || "UNKNOWN_ERROR";

          console.error("Recommendations generation failed:", errorData);

          // Get user-friendly error message
          const userMessage = getUserFriendlyRecommendationsError(errorCode, errorMessage);

          loadingStateManager.completeRecommendationsLoading(false, userMessage);
          handleError(new Error(errorMessage), "recommendations");

          // Store error for debugging
          chrome.storage.local.set({
            [`recommendationsError_${tabId}`]: {
              error: errorData,
              timestamp: Date.now(),
              userMessage: userMessage,
            },
          });
        }
      });
    });
  } catch (error) {
    console.error("Error in generateRecommendations:", error);
    handleError(error, "recommendations");
    loadingStateManager.completeRecommendationsLoading(false, "Unexpected error occurred");
  }
}

// Check if tab is supported for recommendations
function isTabSupported(tab) {
  if (!tab || !tab.url) return false;

  const url = tab.url.toLowerCase();

  // Unsupported protocols
  if (
    url.startsWith("chrome:") ||
    url.startsWith("chrome-extension:") ||
    url.startsWith("moz-extension:") ||
    url.startsWith("about:") ||
    url.startsWith("edge:") ||
    url.startsWith("file:")
  ) {
    return false;
  }

  // Must be HTTP or HTTPS
  return url.startsWith("http:") || url.startsWith("https:");
}

// Get user-friendly message for unsupported tabs
function getUnsupportedTabMessage(tab) {
  if (!tab || !tab.url) {
    return "Cannot analyze this page";
  }

  const url = tab.url.toLowerCase();

  if (url.startsWith("chrome:") || url.startsWith("chrome-extension:")) {
    return "Chrome internal pages cannot be analyzed";
  }

  if (url.startsWith("about:") || url.startsWith("edge:")) {
    return "Browser internal pages cannot be analyzed";
  }

  if (url.startsWith("file:")) {
    return "Local files cannot be analyzed for performance";
  }

  if (url.startsWith("moz-extension:")) {
    return "Extension pages cannot be analyzed";
  }

  return "This page type is not supported for performance analysis";
}

// Get user-friendly error message for recommendations errors
function getUserFriendlyRecommendationsError(errorCode, originalMessage) {
  const errorMappings = {
    NETWORK_ERROR: "Network connection failed during analysis",
    TIMEOUT_ERROR: "Analysis timed out - the page may be too complex",
    PARSE_ERROR: "Could not analyze page structure",
    PERMISSION_ERROR: "Insufficient permissions to analyze this page",
    ANALYSIS_FAILED: "Performance analysis encountered an error",
    HTML_FETCH_FAILED: "Could not retrieve page data for analysis",
    CORS_ERROR: "Cross-origin restrictions prevent analysis",
  };

  return errorMappings[errorCode] || originalMessage || "Analysis failed for unknown reason";
}

// Set recommendations loading state
function setRecommendationsLoadingState(isLoading) {
  const recommendationsButton = document.getElementById("generate-recommendations-btn");
  const buttonText = recommendationsButton?.querySelector(".button-text");
  const buttonIcon = recommendationsButton?.querySelector(".button-icon");

  if (!recommendationsButton) return;

  if (isLoading) {
    recommendationsButton.disabled = true;
    recommendationsButton.classList.add("loading");
    if (buttonText) buttonText.textContent = "Analyzing...";
    if (buttonIcon) buttonIcon.textContent = "⏳";
    recommendationsButton.setAttribute("aria-busy", "true");
  } else {
    recommendationsButton.disabled = false;
    recommendationsButton.classList.remove("loading");
    if (buttonText) buttonText.textContent = "Generate Recommendations";
    if (buttonIcon) buttonIcon.textContent = "🎯";
    recommendationsButton.setAttribute("aria-busy", "false");
  }
}

// Update recommendations button state based on page load status
function updateRecommendationsButtonState() {
  const recommendationsButton = document.getElementById("generate-recommendations-btn");
  if (!recommendationsButton) return;

  // Check if page is still loading metrics
  if (loadingStateManager.isLoading()) {
    recommendationsButton.disabled = true;
    recommendationsButton.querySelector(".button-text").textContent = "Wait for Metrics";
    recommendationsButton.querySelector(".button-icon").textContent = "⏳";
  } else {
    recommendationsButton.disabled = false;
    recommendationsButton.querySelector(".button-text").textContent = "Generate Recommendations";
    recommendationsButton.querySelector(".button-icon").textContent = "🎯";
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

  // Announce extension ready
  announceToScreenReader("Core Web Vitals extension loaded and ready");
}

// Example function to show human-readable recommendations (for testing)
window.showExampleRecommendations = function () {
  const exampleData = {
    summary: {
      totalIssues: 5,
      criticalIssues: 2,
      optimizationOpportunities: 3,
      overallScore: "needs-improvement",
    },
    scripts: {
      recommendations: [
        {
          type: "duplicate_scripts",
          priority: "high",
          duplicateScripts: ["script1.js", "script2.js", "script3.js"],
        },
        {
          type: "defer_optimization",
          priority: "medium",
          deferScripts: new Array(15),
        },
      ],
    },
    css: {
      recommendations: [
        {
          type: "optimization",
          priority: "medium",
          affectedStylesheets: new Array(16),
        },
      ],
    },
    links: {
      recommendations: [
        {
          category: "security",
          message: "Fix 6 security issues with external links",
          priority: "high",
        },
        {
          category: "accessibility",
          message: "Improve 11 accessibility issues",
          priority: "low",
        },
      ],
    },
  };

  displayRecommendations(exampleData);
  console.log("Example recommendations displayed!");
};
// Test function to show LLM-optimized output (for development)
window.testLLMOutput = function () {
  const sampleData = {
    metadata: {
      url: "https://example.com",
      analysisDate: new Date().toISOString(),
    },
    _analysisContext: {
      pageType: "homepage",
      technologyStack: ["React", "Shopify"],
      performanceProfile: { complexityLevel: "medium" },
      businessImpact: {
        businessContext: "Moderate performance issues that may affect user satisfaction.",
        userExperienceImpact: "Users may notice slower than optimal loading times",
        seoImpact: "Some Core Web Vitals issues that may affect search performance",
      },
    },
    summary: {
      totalIssues: 5,
      criticalIssues: 2,
      overallScore: "needs-improvement",
    },
  };

  const llmPrompt = generateLLMOptimizedPrompt(JSON.stringify(sampleData));
  console.log("=== LLM-Optimized Output ===");
  console.log(llmPrompt);

  return llmPrompt;
};
