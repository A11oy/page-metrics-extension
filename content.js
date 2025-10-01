let LCPTime = 0;
let CLSScore = 0;
let currentUrl = window.location.href;
let metricsCollected = false;
let lcpObserver = null;
let clsObserver = null;
let navigationStart = performance.now();
let transitionType = "navigation"; // "navigation" or "spa"
let mutationObserver = null;

// Smart metric update system variables
let lastMetricsSnapshot = null;
let metricsUpdateCount = 0;
let lastMetricsUpdateTime = 0;

// Visual completion detection variables
let visuallyComplete = false;
let visualCompletionTime = 0;
let frameHistory = [];
let stableFrameCount = 0;
let rafMonitoring = false;
let lastMutationTime = 0;

// Configuration constants
const SPA_INITIAL_WAIT = 3000; // Increased from 500ms to 3000ms
const VISUAL_STABILITY_THRESHOLD = 5; // Number of stable frames required
const VISUAL_COMPLETION_MAX_WAIT = 8000; // Maximum time to wait for visual completion (ms)
const CONTENT_CHANGE_THRESHOLD = 50; // How much content can change between frames
const ELEMENT_COUNT_THRESHOLD = 3; // How many elements can change between frames

// Core Web Vitals thresholds based on Google's official guidelines
const CWV_THRESHOLDS = {
  TTFB: { good: 0.8, needsImprovement: 1.8 }, // seconds
  FCP: { good: 1.8, needsImprovement: 3.0 }, // seconds
  LCP: { good: 2.5, needsImprovement: 4.0 }, // seconds
  CLS: { good: 0.1, needsImprovement: 0.25 }, // score
  // Additional thresholds for other metrics (not official CWV but useful)
  DOMLoadTime: { good: 1.5, needsImprovement: 3.0 }, // seconds
  NavigationTime: { good: 2.0, needsImprovement: 4.0 }, // seconds
};

// ThresholdEvaluator class for comprehensive metric evaluation
class ThresholdEvaluator {
  /**
   * Evaluates a metric value against Core Web Vitals thresholds
   * @param {string} metricName - Name of the metric (TTFB, FCP, LCP, CLS, etc.)
   * @param {number} value - The metric value to evaluate
   * @returns {Object} Evaluation result with status, color, and accessible indicator
   */
  static evaluateMetric(metricName, value) {
    const thresholds = CWV_THRESHOLDS[metricName];

    if (!thresholds) {
      // Return neutral status for unknown metrics
      return {
        status: "unknown",
        color: "gray",
        accessibleIndicator: "Unknown",
        accessibleText: "Status unknown",
      };
    }

    if (value <= thresholds.good) {
      return {
        status: "good",
        color: "green",
        accessibleIndicator: "✓",
        accessibleText: "Good",
      };
    } else if (value <= thresholds.needsImprovement) {
      return {
        status: "needs-improvement",
        color: "orange",
        accessibleIndicator: "⚠",
        accessibleText: "Needs Improvement",
      };
    } else {
      return {
        status: "poor",
        color: "red",
        accessibleIndicator: "✗",
        accessibleText: "Poor",
      };
    }
  }

  /**
   * Evaluates multiple metrics at once
   * @param {Object} metrics - Object containing metric values
   * @returns {Object} Object with evaluation results for each metric
   */
  static evaluateAllMetrics(metrics) {
    const evaluations = {};

    for (const [metricName, metricData] of Object.entries(metrics)) {
      // Skip non-metric properties
      if (typeof metricData !== "object" || !metricData.hasOwnProperty("value")) {
        continue;
      }

      evaluations[metricName] = this.evaluateMetric(metricName, metricData.value);
    }

    return evaluations;
  }

  /**
   * Gets the threshold values for a specific metric
   * @param {string} metricName - Name of the metric
   * @returns {Object|null} Threshold object or null if not found
   */
  static getThresholds(metricName) {
    return CWV_THRESHOLDS[metricName] || null;
  }

  /**
   * Checks if a metric is a Core Web Vital
   * @param {string} metricName - Name of the metric
   * @returns {boolean} True if it's a Core Web Vital
   */
  static isCoreWebVital(metricName) {
    return ["FCP", "LCP", "CLS"].includes(metricName);
  }
}

// CLSObserver class for comprehensive CLS measurement
class CLSObserver {
  constructor() {
    this.clsValue = 0;
    this.observer = null;
    this.sessionValue = 0;
    this.sessionEntries = [];
    this.debugger = null; // Will be set later
    this.isSupported = this.checkSupport();
    this.errorState = null;
  }

  // Check if CLS observation is supported
  checkSupport() {
    try {
      if (!("PerformanceObserver" in window)) {
        this.errorState = "PerformanceObserver API not available";
        return false;
      }

      if (!PerformanceObserver.supportedEntryTypes) {
        this.errorState = "PerformanceObserver.supportedEntryTypes not available";
        return false;
      }

      if (!PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
        this.errorState = "Layout shift measurement not supported by browser";
        return false;
      }

      return true;
    } catch (error) {
      this.errorState = `Error checking CLS support: ${error.message}`;
      return false;
    }
  }

  // Set the debugger instance
  setDebugger(debuggerInstance) {
    this.debugger = debuggerInstance;
  }

  // Start observing layout shifts with comprehensive error handling
  observe() {
    if (!this.isSupported) {
      console.warn(`CLS observation not supported: ${this.errorState}`);
      this.sendErrorToBackground("cls_not_supported", this.errorState);
      return false;
    }

    try {
      this.observer = new PerformanceObserver((list) => {
        try {
          this.handleLayoutShiftEntries(list);
        } catch (error) {
          console.error("Error processing layout shift entries:", error);
          this.handleObserverError(error);
        }
      });

      this.observer.observe({ type: "layout-shift", buffered: true });
      console.log("CLS observer started successfully");
      return true;
    } catch (error) {
      console.error("Failed to start CLS observer:", error);
      this.handleObserverError(error);
      return false;
    }
  }

  // Handle layout shift entries with error handling
  handleLayoutShiftEntries(list) {
    try {
      const entries = list.getEntries();
      const shiftingSources = [];

      for (const entry of entries) {
        try {
          // Only count layout shifts that weren't caused by user input
          if (!entry.hadRecentInput) {
            this.sessionValue += entry.value;
            this.sessionEntries.push(entry);

            // Collect shifting sources for visual debugging
            if (entry.sources && entry.sources.length > 0) {
              entry.sources.forEach((source) => {
                try {
                  shiftingSources.push({
                    node: source.node,
                    value: entry.value,
                    hadRecentInput: entry.hadRecentInput,
                    lastInputTime: entry.lastInputTime,
                    startTime: entry.startTime,
                  });
                } catch (sourceError) {
                  console.warn("Error processing layout shift source:", sourceError);
                }
              });
            }
          }
        } catch (entryError) {
          console.warn("Error processing layout shift entry:", entryError);
        }
      }

      // Update the current CLS value
      this.clsValue = this.sessionValue;
      CLSScore = this.clsValue;

      // Sync CLS debugger with updated score
      try {
        syncCLSDebugger();
      } catch (syncError) {
        console.warn("Error syncing CLS debugger:", syncError);
      }

      // Update visual debugger if enabled
      if (this.debugger) {
        try {
          this.debugger.updateCLSScore(this.clsValue);

          // Highlight shifting sources if debugging is enabled
          if (shiftingSources.length > 0) {
            this.debugger.highlightShiftingSources(shiftingSources);
          }
        } catch (debuggerError) {
          console.warn("Error updating CLS debugger:", debuggerError);
        }
      }
    } catch (error) {
      console.error("Critical error in handleLayoutShiftEntries:", error);
      this.handleObserverError(error);
    }
  }

  // Handle observer errors
  handleObserverError(error) {
    this.errorState = `CLS observer error: ${error.message}`;
    this.sendErrorToBackground("cls_observer_error", this.errorState);

    // Try to recover by disconnecting and reconnecting
    try {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }

      // Attempt to restart after a delay
      setTimeout(() => {
        console.log("Attempting to restart CLS observer...");
        this.observe();
      }, 2000);
    } catch (recoveryError) {
      console.error("Failed to recover CLS observer:", recoveryError);
    }
  }

  // Send error information to background script
  sendErrorToBackground(errorType, errorMessage) {
    try {
      chrome.runtime.sendMessage({
        type: "metricsError",
        errorType: errorType,
        errorMessage: errorMessage,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn("Failed to send error to background:", error);
    }
  }

  // Reset CLS tracking (for SPA navigation)
  reset() {
    this.clsValue = 0;
    this.sessionValue = 0;
    this.sessionEntries = [];
    CLSScore = 0;

    // Sync CLS debugger with reset score
    syncCLSDebugger();
  }

  // Get current CLS value
  getValue() {
    return this.clsValue;
  }

  // Evaluate CLS threshold status using ThresholdEvaluator
  getThresholdStatus() {
    return ThresholdEvaluator.evaluateMetric("CLS", this.clsValue);
  }

  // Disconnect the observer
  disconnect() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

// Error handling utilities
function sendErrorToBackground(errorType, errorMessage) {
  try {
    chrome.runtime.sendMessage({
      type: "metricsError",
      errorType: errorType,
      errorMessage: errorMessage,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  } catch (error) {
    console.warn("Failed to send error to background:", error);
  }
}

// Check if Performance API is available
function checkPerformanceAPISupport() {
  const support = {
    performanceObserver: "PerformanceObserver" in window,
    supportedEntryTypes: PerformanceObserver?.supportedEntryTypes || [],
    navigationTiming: "performance" in window && "timing" in performance,
    performanceNow: "performance" in window && "now" in performance,
  };

  if (!support.performanceObserver) {
    sendErrorToBackground("api_not_supported", "PerformanceObserver API not available");
  }

  if (!support.navigationTiming) {
    sendErrorToBackground("api_not_supported", "Navigation Timing API not available");
  }

  return support;
}

// Page support detection
function detectPageSupport() {
  const url = window.location.href;
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;

  const support = {
    isSupported: true,
    reason: null,
    pageType: "web",
    limitations: [],
  };

  // Check for unsupported page types
  if (protocol === "chrome:" || protocol === "chrome-extension:") {
    support.isSupported = false;
    support.reason = "Chrome internal pages and extensions are not supported";
    support.pageType = "chrome-internal";
  } else if (protocol === "moz-extension:" || protocol === "safari-extension:") {
    support.isSupported = false;
    support.reason = "Browser extension pages are not supported";
    support.pageType = "browser-extension";
  } else if (protocol === "file:") {
    support.isSupported = false;
    support.reason = "Local file pages have limited performance measurement capabilities";
    support.pageType = "local-file";
  } else if (protocol === "about:" || protocol === "edge:") {
    support.isSupported = false;
    support.reason = "Browser internal pages are not supported";
    support.pageType = "browser-internal";
  } else if (url.includes("chrome-search://") || url.includes("chrome-devtools://")) {
    support.isSupported = false;
    support.reason = "Chrome special pages are not supported";
    support.pageType = "chrome-special";
  } else if (protocol !== "http:" && protocol !== "https:") {
    support.isSupported = false;
    support.reason = `Protocol ${protocol} is not supported for performance measurement`;
    support.pageType = "unsupported-protocol";
  }

  // Check for limited support scenarios
  if (support.isSupported) {
    if (protocol === "http:") {
      support.limitations.push("HTTP pages may have limited performance API access");
    }

    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")) {
      support.limitations.push(
        "Local development servers may have different performance characteristics"
      );
    }

    // Check for iframe context
    if (window !== window.top) {
      support.limitations.push("Performance measurement in iframes may be limited");
    }
  }

  return support;
}

// Check extension permissions
function checkExtensionPermissions() {
  const permissions = {
    hasActiveTab: true, // Assume we have it if script is running
    hasStorage: true, // Assume we have it if script is running
    canAccessPage: true,
    limitations: [],
  };

  try {
    // Test storage access
    if (typeof chrome === "undefined" || !chrome.runtime) {
      permissions.hasActiveTab = false;
      permissions.canAccessPage = false;
      permissions.limitations.push("Chrome extension APIs not available");
    }

    // Test if we can send messages
    if (chrome.runtime && !chrome.runtime.sendMessage) {
      permissions.hasActiveTab = false;
      permissions.limitations.push("Cannot communicate with extension background");
    }

    // Check for content script injection context
    if (document.documentElement.getAttribute("data-extension-injected")) {
      permissions.limitations.push("Multiple extension injections detected");
    } else {
      document.documentElement.setAttribute("data-extension-injected", "true");
    }
  } catch (error) {
    permissions.hasActiveTab = false;
    permissions.canAccessPage = false;
    permissions.limitations.push(`Permission check error: ${error.message}`);
  }

  return permissions;
}

// Initialize page and permission checks
const pageSupport = detectPageSupport();
const extensionPermissions = checkExtensionPermissions();

// Initialize performance API support check
const performanceSupport = checkPerformanceAPISupport();

// Validate navigation entry data
function validateNavigationEntry(entry) {
  try {
    if (!entry) return false;

    // Check for required timing properties
    const requiredProps = [
      "startTime",
      "responseStart",
      "domInteractive",
      "domContentLoadedEventEnd",
    ];
    for (const prop of requiredProps) {
      if (typeof entry[prop] !== "number" || entry[prop] < 0) {
        console.warn(`Invalid navigation entry property: ${prop} = ${entry[prop]}`);
        return false;
      }
    }

    // Check logical timing order
    if (entry.responseStart < entry.startTime) {
      console.warn("Invalid timing order: responseStart < startTime");
      return false;
    }

    if (entry.domInteractive < entry.responseStart) {
      console.warn("Invalid timing order: domInteractive < responseStart");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error validating navigation entry:", error);
    return false;
  }
}

// Collect fallback metrics when Performance API is limited
function collectFallbackMetrics() {
  try {
    console.log("Collecting fallback metrics due to API limitations");

    const currentTime = Date.now();
    const estimatedLoadTime = (performance.now() - navigationStart) / 1000;

    const fallbackMetrics = {
      TTFB: {
        value: 0.1, // Conservative estimate
        unit: "s",
        estimated: true,
      },
      FCP: {
        value: Math.min(estimatedLoadTime * 0.3, 2.0),
        unit: "s",
        estimated: true,
      },
      LCP: {
        value: LCPTime || Math.min(estimatedLoadTime * 0.7, 4.0),
        unit: "s",
        estimated: !LCPTime,
      },
      CLS: {
        value: clsObserverInstance.getValue(),
        unit: "score",
        estimated: false,
      },
      DOMLoadTime: {
        value: Math.min(estimatedLoadTime * 0.8, 3.0),
        unit: "s",
        estimated: true,
      },
      NavigationTime: {
        value: estimatedLoadTime,
        unit: "s",
        estimated: true,
      },
      timestamp: currentTime,
      lastUpdated: currentTime,
      url: window.location.href,
      title: document.title,
      transitionType: transitionType,
      fallbackMode: true,
    };

    sendMetrics(fallbackMetrics);
    sendErrorToBackground(
      "fallback_metrics_used",
      "Using estimated metrics due to API limitations"
    );
  } catch (error) {
    console.error("Error collecting fallback metrics:", error);
    sendErrorToBackground("fallback_metrics_error", error.message);
  }
}

// Validate page support before initializing observers
function validatePageAndInitialize() {
  // Check page support first
  if (!pageSupport.isSupported) {
    console.log(`Page not supported: ${pageSupport.reason}`);
    sendUnsupportedPageMessage(pageSupport);
    return false;
  }

  // Check extension permissions
  if (!extensionPermissions.canAccessPage) {
    console.log("Extension permissions insufficient");
    sendPermissionErrorMessage(extensionPermissions);
    return false;
  }

  // Check performance API support
  if (!performanceSupport.performanceObserver && !performanceSupport.navigationTiming) {
    console.log("Performance APIs not supported");
    sendAPINotSupportedMessage(performanceSupport);
    return false;
  }

  // Log any limitations
  const allLimitations = [...pageSupport.limitations, ...extensionPermissions.limitations];

  if (allLimitations.length > 0) {
    console.warn("Performance measurement limitations detected:", allLimitations);
    sendLimitationsMessage(allLimitations);
  }

  return true;
}

// Send unsupported page message
function sendUnsupportedPageMessage(support) {
  try {
    chrome.runtime.sendMessage({
      type: "pageNotSupported",
      pageType: support.pageType,
      reason: support.reason,
      url: window.location.href,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.warn("Could not send unsupported page message:", error);
  }
}

// Send permission error message
function sendPermissionErrorMessage(permissions) {
  try {
    chrome.runtime.sendMessage({
      type: "permissionError",
      limitations: permissions.limitations,
      url: window.location.href,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.warn("Could not send permission error message:", error);
  }
}

// Send API not supported message
function sendAPINotSupportedMessage(support) {
  try {
    chrome.runtime.sendMessage({
      type: "apiNotSupported",
      missingAPIs: {
        performanceObserver: !support.performanceObserver,
        navigationTiming: !support.navigationTiming,
        performanceNow: !support.performanceNow,
      },
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.warn("Could not send API not supported message:", error);
  }
}

// Send limitations message
function sendLimitationsMessage(limitations) {
  try {
    chrome.runtime.sendMessage({
      type: "performanceLimitations",
      limitations: limitations,
      url: window.location.href,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.warn("Could not send limitations message:", error);
  }
}

// Initialize based on page support validation
let clsObserverInstance = null;
let isInitialized = false;

if (validatePageAndInitialize()) {
  console.log("Initializing performance measurement...");

  // Initialize CLS observer
  clsObserverInstance = new CLSObserver();

  // Initialize LCP observer
  lcpObserver = observeLCP();

  // Start CLS observation
  if (clsObserverInstance) {
    clsObserverInstance.observe();
  }

  isInitialized = true;
} else {
  console.log("Skipping performance measurement initialization due to page/permission issues");
}

// CLS Visual Debugging System
class CLSDebugger {
  constructor() {
    this.isEnabled = false;
    this.overlayElement = null;
    this.highlightedElements = [];
    this.currentCLS = 0;
    this.shiftingSources = [];

    // Styling constants
    this.OVERLAY_STYLES = {
      position: "fixed",
      top: "10px",
      right: "10px",
      zIndex: "999999",
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      color: "white",
      padding: "8px 12px",
      borderRadius: "4px",
      fontFamily: "monospace",
      fontSize: "12px",
      fontWeight: "bold",
      pointerEvents: "none",
      transition: "background-color 0.3s ease",
    };

    this.HIGHLIGHT_STYLES = {
      outline: "2px solid red",
      outlineOffset: "2px",
      backgroundColor: "rgba(255, 0, 0, 0.1)",
      transition: "all 0.3s ease",
    };
  }

  // Enable visual debugging
  enableVisualDebugging() {
    if (this.isEnabled) return;

    this.isEnabled = true;
    this.createCLSOverlay();
    this.updateCLSScore(this.currentCLS);

    console.log("CLS Visual Debugging enabled");
  }

  // Disable visual debugging
  disableVisualDebugging() {
    if (!this.isEnabled) return;

    this.isEnabled = false;
    this.removeCLSOverlay();
    this.clearHighlights();

    console.log("CLS Visual Debugging disabled");
  }

  // Create the floating CLS overlay
  createCLSOverlay() {
    if (this.overlayElement) {
      this.removeCLSOverlay();
    }

    this.overlayElement = document.createElement("div");
    this.overlayElement.id = "cls-debug-overlay";

    // Apply styles
    Object.assign(this.overlayElement.style, this.OVERLAY_STYLES);

    // Add to document
    document.body.appendChild(this.overlayElement);

    // Update initial content
    this.updateOverlayContent();
  }

  // Remove the CLS overlay
  removeCLSOverlay() {
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
      this.overlayElement = null;
    }
  }

  // Update CLS score and overlay
  updateCLSScore(score) {
    const previousScore = this.currentCLS;
    this.currentCLS = score;

    if (this.isEnabled && this.overlayElement) {
      this.updateOverlayContent();
      this.updateOverlayColor();

      // Log score changes if debugging is enabled
      if (previousScore !== score) {
        console.log(`📊 CLS Score Updated: ${previousScore.toFixed(4)} → ${score.toFixed(4)}`);
      }
    }
  }

  // Update overlay content
  updateOverlayContent() {
    if (!this.overlayElement) return;

    const thresholdStatus = ThresholdEvaluator.evaluateMetric("CLS", this.currentCLS);
    const statusText = thresholdStatus.accessibleText;

    this.overlayElement.textContent = `CLS: ${this.currentCLS.toFixed(3)} (${statusText})`;
  }

  // Update overlay color based on CLS thresholds
  updateOverlayColor() {
    if (!this.overlayElement) return;

    const thresholds = CWV_THRESHOLDS.CLS;
    let backgroundColor;

    if (this.currentCLS <= thresholds.good) {
      backgroundColor = "rgba(0, 128, 0, 0.8)"; // Green
    } else if (this.currentCLS <= thresholds.needsImprovement) {
      backgroundColor = "rgba(255, 165, 0, 0.8)"; // Orange
    } else {
      backgroundColor = "rgba(255, 0, 0, 0.8)"; // Red
    }

    this.overlayElement.style.backgroundColor = backgroundColor;
  }

  // Highlight elements causing layout shifts
  highlightShiftingSources(sources) {
    if (!this.isEnabled) return;

    // Clear previous highlights
    this.clearHighlights();

    // Store new sources
    this.shiftingSources = sources || [];

    // Highlight each source element
    this.shiftingSources.forEach((source) => {
      if (source.node && source.node.nodeType === Node.ELEMENT_NODE) {
        this.highlightElement(source.node, source);
      }
    });

    // Enhanced console logging with detailed shift information
    if (this.shiftingSources.length > 0) {
      console.group("🔴 CLS Layout Shift Detected");
      console.log(`Total CLS Score: ${this.currentCLS.toFixed(4)}`);
      console.log(`Shift Sources: ${this.shiftingSources.length}`);

      this.shiftingSources.forEach((source, index) => {
        console.group(`Source ${index + 1} (Value: ${source.value.toFixed(4)})`);
        console.log("Element:", source.node);
        console.log("Shift Value:", source.value);
        console.log("Had Recent Input:", source.hadRecentInput);
        console.log("Start Time:", `${source.startTime.toFixed(2)}ms`);

        // Log element details
        if (source.node) {
          console.log("Tag Name:", source.node.tagName);
          console.log("Class List:", source.node.className);
          console.log("ID:", source.node.id || "none");

          // Log element dimensions if available
          try {
            const rect = source.node.getBoundingClientRect();
            console.log("Dimensions:", {
              width: rect.width,
              height: rect.height,
              top: rect.top,
              left: rect.left,
            });
          } catch (e) {
            console.log("Dimensions: Unable to calculate");
          }
        }

        console.groupEnd();
      });

      // Log threshold status
      const thresholdStatus = ThresholdEvaluator.evaluateMetric("CLS", this.currentCLS);
      console.log(`Threshold Status: ${thresholdStatus.accessibleText} (${thresholdStatus.color})`);

      console.groupEnd();
    }
  }

  // Highlight a specific element
  highlightElement(element, source) {
    if (!element || !element.style) return;

    // Store original styles
    const originalStyles = {
      outline: element.style.outline,
      outlineOffset: element.style.outlineOffset,
      backgroundColor: element.style.backgroundColor,
      transition: element.style.transition,
    };

    // Apply highlight styles
    Object.assign(element.style, this.HIGHLIGHT_STYLES);

    // Store element and original styles for cleanup
    this.highlightedElements.push({
      element: element,
      originalStyles: originalStyles,
      source: source,
    });

    // Add data attribute for identification
    element.setAttribute("data-cls-highlighted", "true");
  }

  // Clear all highlights
  clearHighlights() {
    this.highlightedElements.forEach(({ element, originalStyles }) => {
      if (element && element.style) {
        // Restore original styles
        Object.assign(element.style, originalStyles);

        // Remove data attribute
        element.removeAttribute("data-cls-highlighted");
      }
    });

    this.highlightedElements = [];
    this.shiftingSources = [];
  }

  // Get current debugging state
  getState() {
    return {
      isEnabled: this.isEnabled,
      currentCLS: this.currentCLS,
      highlightedElementsCount: this.highlightedElements.length,
      shiftingSourcesCount: this.shiftingSources.length,
    };
  }

  // Toggle debugging state
  toggle() {
    if (this.isEnabled) {
      this.disableVisualDebugging();
    } else {
      this.enableVisualDebugging();
    }
    return this.isEnabled;
  }

  // Cleanup method
  destroy() {
    this.disableVisualDebugging();
  }
}

// Initialize CLS debugger
const clsDebugger = new CLSDebugger();

// Connect CLS observer with debugger
clsObserverInstance.setDebugger(clsDebugger);

// Function to sync CLS debugger with global CLS score
function syncCLSDebugger() {
  if (clsDebugger && CLSScore !== clsDebugger.currentCLS) {
    clsDebugger.updateCLSScore(CLSScore);
  }
}

// Enhanced function to reset and collect metrics for SPA transitions
function resetAndCollectMetrics(isSpaNavigation = true) {
  console.log("Resetting metrics for", isSpaNavigation ? "SPA navigation" : "forced refresh");

  // Store previous metrics for comparison (optional debugging)
  const previousMetrics = {
    LCP: LCPTime,
    CLS: CLSScore,
    url: currentUrl,
  };

  // Reset core metrics
  LCPTime = 0;
  CLSScore = 0;
  metricsCollected = false;

  // Reset LCP element information
  lcpElement = null;
  lcpElementSelector = null;
  lcpElementInfo = null;

  // Sync CLS debugger with reset score
  syncCLSDebugger();

  // Only set to SPA if this is actually an SPA navigation
  if (isSpaNavigation) {
    transitionType = "spa";
  }

  // Reset visual completion tracking with enhanced state management
  visuallyComplete = false;
  visualCompletionTime = 0;
  frameHistory = [];
  stableFrameCount = 0;
  rafMonitoring = false;
  lastMutationTime = performance.now();

  // Record precise navigation start time for SPA transitions
  navigationStart = performance.now();

  // Update current URL immediately to prevent race conditions
  currentUrl = window.location.href;

  // Notify popup about loading state with SPA-specific context
  chrome.runtime.sendMessage({
    type: "metricsLoading",
    context: "spa-navigation",
    previousUrl: previousMetrics.url,
    newUrl: currentUrl,
  });

  // Enhanced performance observer reset with proper cleanup
  resetPerformanceObservers();

  // Enhanced CLS reset with proper session management
  resetCLSForSPA();

  // Reset smart update system for new navigation
  smartUpdateSystem.reset();
  dynamicContentHandler.reset();

  // Start enhanced visual completion monitoring
  startEnhancedVisualCompletionTracking();

  // Adaptive timeout based on page complexity and previous metrics
  const adaptiveTimeout = calculateAdaptiveTimeout(previousMetrics);
  setTimeout(collectMetrics, adaptiveTimeout);

  console.log(`SPA metrics reset complete, collecting in ${adaptiveTimeout}ms`);
}

// Enhanced performance observer reset
function resetPerformanceObservers() {
  // Disconnect existing LCP observer
  if (lcpObserver) {
    lcpObserver.disconnect();
    lcpObserver = null;
  }

  // Restart LCP observation with SPA-specific configuration
  lcpObserver = observeLCP();

  // Reset paint observer for SPA-specific FCP tracking
  if (window.spaPaintMetrics) {
    window.spaPaintMetrics = {};
  }
}

// Enhanced CLS reset for SPA navigation with proper session management
function resetCLSForSPA() {
  // Reset CLS observer with session boundary handling
  clsObserverInstance.reset();

  // For SPA navigation, we need to establish a new session boundary
  // This ensures CLS measurements are accurate for the new view
  clsObserverInstance.observe();

  // Reset global CLS score
  CLSScore = 0;

  // Sync CLS debugger with reset score
  syncCLSDebugger();

  console.log("CLS reset for SPA navigation - new session boundary established");
}

// Enhanced visual completion tracking with better heuristics
function startEnhancedVisualCompletionTracking() {
  if (rafMonitoring) {
    console.log("Visual completion tracking already active, stopping previous session");
    rafMonitoring = false;
  }

  rafMonitoring = true;
  frameHistory = [];
  stableFrameCount = 0;

  // Enhanced frame monitoring with better stability detection
  function checkFrameStability(timestamp) {
    if (!rafMonitoring) return;

    const timeElapsed = timestamp - navigationStart;

    // Enhanced state snapshot with more comprehensive metrics
    const currentState = {
      time: timeElapsed,
      contentSize: document.body ? document.body.innerHTML.length : 0,
      elementCount: document.querySelectorAll("*").length,
      imageCount: document.querySelectorAll("img").length,
      scriptCount: document.querySelectorAll("script").length,
      timestamp: timestamp,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    };

    frameHistory.push(currentState);

    // Keep more frame history for better stability analysis
    if (frameHistory.length > 15) {
      frameHistory.shift();
    }

    // Enhanced stability detection with multiple criteria
    if (frameHistory.length >= 8) {
      const recentFrames = frameHistory.slice(-8);
      const stabilityMetrics = analyzeFrameStability(recentFrames);

      // Check multiple stability criteria
      const isContentStable = stabilityMetrics.contentStable;
      const isLayoutStable = stabilityMetrics.layoutStable;
      const isResourceStable = stabilityMetrics.resourceStable;
      const timeSinceLastMutation = timestamp - lastMutationTime;

      // Enhanced stability conditions
      if (
        (isContentStable && isLayoutStable && timeElapsed > 500) ||
        (isResourceStable && timeSinceLastMutation > 800 && timeElapsed > 1000) ||
        (stabilityMetrics.overallStability > 0.8 && timeElapsed > 300)
      ) {
        if (!visuallyComplete) {
          visuallyComplete = true;
          visualCompletionTime = timeElapsed / 1000;

          console.log(
            `Enhanced visual completion detected at ${visualCompletionTime.toFixed(2)}s`,
            {
              contentStable: isContentStable,
              layoutStable: isLayoutStable,
              resourceStable: isResourceStable,
              overallStability: stabilityMetrics.overallStability,
            }
          );

          // Update metrics with enhanced visual completion data
          updateMetricsWithEnhancedVisualCompletion(stabilityMetrics);

          // Continue monitoring briefly to ensure stability
          setTimeout(() => {
            rafMonitoring = false;
          }, 1000);

          requestAnimationFrame(checkFrameStability);
          return;
        }
      }
    }

    // Continue monitoring
    requestAnimationFrame(checkFrameStability);
  }

  // Start enhanced frame monitoring
  requestAnimationFrame(checkFrameStability);

  // Adaptive maximum monitoring time based on page complexity
  const maxMonitoringTime = Math.min(VISUAL_COMPLETION_MAX_WAIT, 12000);
  setTimeout(() => {
    if (rafMonitoring && !visuallyComplete) {
      console.log(`Enhanced visual completion timeout at ${maxMonitoringTime / 1000}s`);
      visuallyComplete = true;
      visualCompletionTime = (performance.now() - navigationStart) / 1000;
      updateMetricsWithEnhancedVisualCompletion({ timeout: true });
      rafMonitoring = false;
    }
  }, maxMonitoringTime);
}

// Analyze frame stability with multiple criteria
function analyzeFrameStability(frames) {
  if (frames.length < 3) {
    return {
      contentStable: false,
      layoutStable: false,
      resourceStable: false,
      overallStability: 0,
    };
  }

  let contentChanges = 0;
  let layoutChanges = 0;
  let resourceChanges = 0;
  let totalComparisons = frames.length - 1;

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const curr = frames[i];

    // Content stability
    const contentDiff = Math.abs(curr.contentSize - prev.contentSize);
    if (contentDiff > CONTENT_CHANGE_THRESHOLD) {
      contentChanges++;
    }

    // Layout stability
    const layoutDiff = Math.abs(curr.scrollHeight - prev.scrollHeight);
    if (layoutDiff > 50) {
      // 50px threshold for layout changes
      layoutChanges++;
    }

    // Resource stability (images, scripts)
    const resourceDiff = Math.abs(
      curr.imageCount + curr.scriptCount - (prev.imageCount + prev.scriptCount)
    );
    if (resourceDiff > 2) {
      resourceChanges++;
    }
  }

  const contentStable = contentChanges / totalComparisons < 0.2; // Less than 20% of frames changed
  const layoutStable = layoutChanges / totalComparisons < 0.3;
  const resourceStable = resourceChanges / totalComparisons < 0.1;

  const overallStability =
    1 - (contentChanges + layoutChanges + resourceChanges) / (totalComparisons * 3);

  return {
    contentStable,
    layoutStable,
    resourceStable,
    overallStability: Math.max(0, overallStability),
  };
}

// Calculate adaptive timeout based on previous metrics and page complexity
function calculateAdaptiveTimeout(previousMetrics) {
  let baseTimeout = SPA_INITIAL_WAIT;

  // Adjust based on previous LCP time
  if (previousMetrics.LCP > 0) {
    // If previous LCP was slow, give more time
    if (previousMetrics.LCP > 3) {
      baseTimeout = Math.min(baseTimeout * 1.5, 5000);
    } else if (previousMetrics.LCP < 1) {
      // If previous LCP was fast, we can be more aggressive
      baseTimeout = Math.max(baseTimeout * 0.8, 1500);
    }
  }

  // Adjust based on page complexity
  const elementCount = document.querySelectorAll("*").length;
  if (elementCount > 1000) {
    baseTimeout = Math.min(baseTimeout * 1.2, 4500);
  }

  return Math.round(baseTimeout);
}

// Enhanced metrics update with visual completion data
function updateMetricsWithEnhancedVisualCompletion(stabilityMetrics) {
  if (!visuallyComplete || metricsCollected) return;

  if (transitionType === "spa") {
    const currentTime = Date.now();

    // Enhanced SPA metrics with better timing calculations
    const metrics = {
      TTFB: {
        value: 0.01, // SPA transitions are client-side
        unit: "s",
      },
      FCP: {
        value: Math.min(visualCompletionTime * 0.3, 0.4), // More conservative FCP estimate
        unit: "s",
      },
      LCP: {
        value: LCPTime > 0 ? LCPTime : visualCompletionTime, // Use actual LCP if available
        unit: "s",
      },
      CLS: {
        value: clsObserverInstance.getValue(),
        unit: "score",
      },
      DOMLoadTime: {
        value: visualCompletionTime * 0.6, // Better DOM load estimate
        unit: "s",
      },
      NavigationTime: {
        value: visualCompletionTime,
        unit: "s",
      },
      VisualCompletionTime: {
        value: visualCompletionTime,
        unit: "s",
      },
      timestamp: currentTime,
      lastUpdated: currentTime,
      url: window.location.href,
      title: document.title,
      transitionType: "spa",
      stabilityMetrics: stabilityMetrics, // Include stability analysis
    };

    sendMetrics(metrics);
  }
}

// Function to track visual completion using requestAnimationFrame
function startVisualCompletionTracking() {
  if (rafMonitoring) return;

  rafMonitoring = true;
  frameHistory = [];
  stableFrameCount = 0;

  // Function to monitor frames
  function checkFrame(timestamp) {
    if (!rafMonitoring) return;

    // Calculate time since navigation started
    const timeElapsed = timestamp - navigationStart;

    // Take a "snapshot" of the current state
    // We use document.body.innerHTML.length as a simple proxy for visual state
    // A more advanced implementation could use MutationObserver + layout calculations
    const currentState = {
      time: timeElapsed,
      contentSize: document.body ? document.body.innerHTML.length : 0,
      elementCount: document.querySelectorAll("*").length,
      timestamp: timestamp,
    };

    frameHistory.push(currentState);

    // Keep only the last 10 frames for comparison
    if (frameHistory.length > 10) {
      frameHistory.shift();
    }

    // Check if the page has visually stabilized
    // We consider it stable if the content size hasn't changed significantly for several frames
    if (frameHistory.length >= 5) {
      const lastFewFrames = frameHistory.slice(-5);
      const sizeDifferences = [];

      for (let i = 1; i < lastFewFrames.length; i++) {
        const sizeDiff = Math.abs(lastFewFrames[i].contentSize - lastFewFrames[i - 1].contentSize);
        const countDiff = Math.abs(
          lastFewFrames[i].elementCount - lastFewFrames[i - 1].elementCount
        );

        // If either metric changed significantly, consider the frame different
        sizeDifferences.push(
          sizeDiff > CONTENT_CHANGE_THRESHOLD || countDiff > ELEMENT_COUNT_THRESHOLD
        );
      }

      // If no significant changes in the last few frames, increment stable frame count
      if (!sizeDifferences.some((diff) => diff)) {
        stableFrameCount++;
      } else {
        stableFrameCount = 0;
      }

      // If we've had several stable frames and we're more than 300ms into the transition
      // or it's been more than 300ms since the last DOM mutation, consider it visually complete
      const timeSinceLastMutation = timestamp - lastMutationTime;
      if (
        (stableFrameCount >= VISUAL_STABILITY_THRESHOLD && timeElapsed > 300) ||
        (timeSinceLastMutation > 500 && timeElapsed > 1000)
      ) {
        if (!visuallyComplete) {
          visuallyComplete = true;
          visualCompletionTime = timeElapsed / 1000; // Convert to seconds

          // Update metrics with enhanced visual completion data
          updateMetricsWithEnhancedVisualCompletion({ legacyDetection: true });

          // Continue monitoring for a bit longer to ensure stability
          // but mark as complete so metrics can be reported
          setTimeout(() => {
            rafMonitoring = false;
            console.log(
              `Visual completion monitoring stopped at ${
                (performance.now() - navigationStart) / 1000
              }s`
            );
          }, 1000);

          console.log(`Visual completion detected at ${visualCompletionTime.toFixed(2)}s`);

          // Continue monitoring frames, but we've marked as complete
          requestAnimationFrame(checkFrame);
          return;
        }
      }
    }

    // Continue monitoring frames
    requestAnimationFrame(checkFrame);
  }

  // Start monitoring frames
  requestAnimationFrame(checkFrame);

  // Set a maximum monitoring time
  setTimeout(() => {
    if (rafMonitoring) {
      console.log(`Reaching maximum monitoring time of ${VISUAL_COMPLETION_MAX_WAIT / 1000}s`);

      // If we haven't detected visual completion yet, use the current time
      if (!visuallyComplete) {
        visuallyComplete = true;
        visualCompletionTime = (performance.now() - navigationStart) / 1000;
        updateMetricsWithEnhancedVisualCompletion({ timeout: true });
        console.log(`Visual completion timeout at ${visualCompletionTime.toFixed(2)}s`);
      }

      // Stop monitoring after max time
      rafMonitoring = false;
    }
  }, VISUAL_COMPLETION_MAX_WAIT);
}

// Enhanced Dynamic Content Handler for comprehensive content change detection
class DynamicContentHandler {
  constructor() {
    this.observer = null;
    this.lastMutationTime = 0;
    this.contentChangeScore = 0;
    this.significantChanges = [];
    this.updateDebounceTimeout = null;
    this.metricsUpdateCallback = null;

    // Configuration for content change detection
    this.DEBOUNCE_DELAY = 300; // ms to wait before triggering metric updates
    this.SIGNIFICANCE_THRESHOLD = 50; // Score threshold for significant changes
    this.MAX_TRACKED_CHANGES = 20; // Maximum number of changes to track

    // Scoring weights for different types of changes
    this.SCORING_WEIGHTS = {
      imageAdd: 15,
      imageRemove: 10,
      adElement: 20,
      largeContentBlock: 25,
      scriptAdd: 10,
      styleChange: 5,
      textChange: 3,
      attributeChange: 2,
      infiniteScrollContent: 30,
    };
  }

  // Initialize the enhanced mutation observer
  init(metricsUpdateCallback) {
    this.metricsUpdateCallback = metricsUpdateCallback;

    if (document.body) {
      this.startObserving();
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        this.startObserving();
      });
    }
  }

  // Start observing DOM mutations with enhanced detection
  startObserving() {
    this.observer = new MutationObserver((mutations) => {
      this.processMutations(mutations);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true,
    });

    console.log("Enhanced DynamicContentHandler initialized");
  }

  // Process mutations and calculate significance scores
  processMutations(mutations) {
    this.lastMutationTime = performance.now();
    let currentChangeScore = 0;
    const changeDetails = [];

    mutations.forEach((mutation) => {
      const mutationScore = this.scoreMutation(mutation);
      currentChangeScore += mutationScore.score;

      if (mutationScore.score > 0) {
        changeDetails.push({
          type: mutationScore.type,
          score: mutationScore.score,
          element: mutation.target,
          timestamp: this.lastMutationTime,
        });
      }
    });

    // Update content change score
    this.contentChangeScore += currentChangeScore;

    // Track significant changes
    if (currentChangeScore > 10) {
      this.significantChanges.push({
        score: currentChangeScore,
        details: changeDetails,
        timestamp: this.lastMutationTime,
      });

      // Keep only recent significant changes
      if (this.significantChanges.length > this.MAX_TRACKED_CHANGES) {
        this.significantChanges.shift();
      }
    }

    // Trigger debounced metric updates for significant changes
    if (currentChangeScore > this.SIGNIFICANCE_THRESHOLD) {
      this.debouncedMetricsUpdate();
    }

    // Update global lastMutationTime for compatibility
    lastMutationTime = this.lastMutationTime;
  }

  // Score individual mutations based on their significance
  scoreMutation(mutation) {
    let score = 0;
    let type = "unknown";

    switch (mutation.type) {
      case "childList":
        const result = this.scoreChildListMutation(mutation);
        score = result.score;
        type = result.type;
        break;

      case "attributes":
        const attrResult = this.scoreAttributeMutation(mutation);
        score = attrResult.score;
        type = attrResult.type;
        break;

      case "characterData":
        score = this.SCORING_WEIGHTS.textChange;
        type = "textChange";
        break;
    }

    return { score, type };
  }

  // Score childList mutations (element additions/removals)
  scoreChildListMutation(mutation) {
    let score = 0;
    let type = "contentChange";

    // Score added nodes
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const nodeScore = this.scoreAddedElement(node);
        score += nodeScore.score;
        if (nodeScore.type !== "unknown") {
          type = nodeScore.type;
        }
      }
    });

    // Score removed nodes
    mutation.removedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const nodeScore = this.scoreRemovedElement(node);
        score += nodeScore.score;
        if (nodeScore.type !== "unknown") {
          type = nodeScore.type;
        }
      }
    });

    return { score, type };
  }

  // Score added elements based on their characteristics
  scoreAddedElement(element) {
    let score = 0;
    let type = "unknown";

    // Images - high impact on LCP
    if (element.tagName === "IMG" || element.querySelector("img")) {
      score += this.SCORING_WEIGHTS.imageAdd;
      type = "imageAdd";
    }

    // Ad-related elements - high impact on CLS
    if (this.isAdElement(element)) {
      score += this.SCORING_WEIGHTS.adElement;
      type = "adElement";
    }

    // Large content blocks - potential LCP candidates
    if (this.isLargeContentBlock(element)) {
      score += this.SCORING_WEIGHTS.largeContentBlock;
      type = "largeContentBlock";
    }

    // Scripts - can affect performance
    if (element.tagName === "SCRIPT" || element.querySelector("script")) {
      score += this.SCORING_WEIGHTS.scriptAdd;
      type = "scriptAdd";
    }

    // Infinite scroll content detection
    if (this.isInfiniteScrollContent(element)) {
      score += this.SCORING_WEIGHTS.infiniteScrollContent;
      type = "infiniteScrollContent";
    }

    return { score, type };
  }

  // Score removed elements
  scoreRemovedElement(element) {
    let score = 0;
    let type = "unknown";

    if (element.tagName === "IMG" || element.querySelector("img")) {
      score += this.SCORING_WEIGHTS.imageRemove;
      type = "imageRemove";
    }

    return { score, type };
  }

  // Score attribute mutations
  scoreAttributeMutation(mutation) {
    let score = 0;
    let type = "attributeChange";

    // Style changes can affect layout
    if (mutation.attributeName === "style" || mutation.attributeName === "class") {
      score = this.SCORING_WEIGHTS.styleChange;
      type = "styleChange";
    } else {
      score = this.SCORING_WEIGHTS.attributeChange;
    }

    return { score, type };
  }

  // Detect ad-related elements
  isAdElement(element) {
    const adSelectors = [
      '[class*="ad-"]',
      '[class*="ads-"]',
      '[class*="advertisement"]',
      '[id*="ad-"]',
      '[id*="ads-"]',
      '[id*="advertisement"]',
      ".google-ads",
      ".adsense",
      "[data-ad-slot]",
    ];

    return adSelectors.some((selector) => {
      try {
        return element.matches && element.matches(selector);
      } catch (e) {
        return false;
      }
    });
  }

  // Detect large content blocks that could be LCP candidates
  isLargeContentBlock(element) {
    if (!element.getBoundingClientRect) return false;

    try {
      const rect = element.getBoundingClientRect();
      const area = rect.width * rect.height;

      // Consider elements larger than 50,000 square pixels as large
      return area > 50000;
    } catch (e) {
      return false;
    }
  }

  // Detect infinite scroll content
  isInfiniteScrollContent(element) {
    const infiniteScrollIndicators = [
      '[class*="infinite"]',
      '[class*="lazy-load"]',
      '[class*="load-more"]',
      "[data-infinite]",
      "[data-lazy]",
      ".pagination-item",
    ];

    return infiniteScrollIndicators.some((selector) => {
      try {
        return element.matches && element.matches(selector);
      } catch (e) {
        return false;
      }
    });
  }

  // Debounced metrics update to prevent excessive recalculation
  debouncedMetricsUpdate() {
    if (this.updateDebounceTimeout) {
      clearTimeout(this.updateDebounceTimeout);
    }

    this.updateDebounceTimeout = setTimeout(() => {
      if (this.metricsUpdateCallback) {
        console.log(
          `Triggering metrics update due to significant content changes (score: ${this.contentChangeScore})`
        );
        this.metricsUpdateCallback();
      }
    }, this.DEBOUNCE_DELAY);
  }

  // Get content stability metrics
  getContentStability() {
    const now = performance.now();
    const recentChanges = this.significantChanges.filter(
      (change) => now - change.timestamp < 5000 // Last 5 seconds
    );

    return {
      totalScore: this.contentChangeScore,
      recentChanges: recentChanges.length,
      timeSinceLastChange: now - this.lastMutationTime,
      isStable: recentChanges.length === 0 && now - this.lastMutationTime > 2000,
    };
  }

  // Reset content change tracking (for SPA navigation)
  reset() {
    this.contentChangeScore = 0;
    this.significantChanges = [];
    this.lastMutationTime = performance.now();

    if (this.updateDebounceTimeout) {
      clearTimeout(this.updateDebounceTimeout);
      this.updateDebounceTimeout = null;
    }
  }

  // Cleanup
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.updateDebounceTimeout) {
      clearTimeout(this.updateDebounceTimeout);
    }
  }
}

// Track DOM mutations to help with visual completion detection
function initDomMutationTracking() {
  const mutationCallback = () => {
    lastMutationTime = performance.now();
  };

  const observer = new MutationObserver(mutationCallback);

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    });
  }
}

// Smart Metric Update System for intelligent update frequency and change detection
class SmartMetricUpdateSystem {
  constructor() {
    this.lastMetricsSnapshot = null;
    this.updateHistory = [];
    this.changedMetrics = new Set();
    this.updateFrequency = 1000; // Base update frequency in ms
    this.isUpdating = false;
    this.updateTimer = null;
    this.lastUpdateTime = 0;

    // Configuration
    this.MIN_UPDATE_FREQUENCY = 500; // Minimum time between updates (ms)
    this.MAX_UPDATE_FREQUENCY = 5000; // Maximum time between updates (ms)
    this.STABILITY_THRESHOLD = 3; // Number of stable updates before reducing frequency
    this.CHANGE_THRESHOLD = 0.1; // Minimum change to consider significant (10%)
    this.MAX_UPDATE_HISTORY = 10; // Maximum number of updates to track

    // Metric change thresholds (absolute values)
    this.METRIC_THRESHOLDS = {
      TTFB: 0.05, // 50ms
      FCP: 0.1, // 100ms
      LCP: 0.2, // 200ms
      CLS: 0.01, // 0.01 score
      DOMLoadTime: 0.1, // 100ms
      NavigationTime: 0.1, // 100ms
    };
  }

  // Initialize the update system
  init() {
    console.log("SmartMetricUpdateSystem initialized");
  }

  // Calculate adaptive update frequency based on content stability
  calculateUpdateFrequency(contentStability) {
    let frequency = this.updateFrequency;

    // Adjust based on content stability
    if (contentStability.isStable) {
      // Content is stable, reduce update frequency
      frequency = Math.min(frequency * 1.5, this.MAX_UPDATE_FREQUENCY);
    } else {
      // Content is changing, increase update frequency
      frequency = Math.max(frequency * 0.7, this.MIN_UPDATE_FREQUENCY);
    }

    // Adjust based on recent update history
    const recentUpdates = this.updateHistory.slice(-this.STABILITY_THRESHOLD);
    const hasSignificantChanges = recentUpdates.some((update) => update.hasChanges);

    if (!hasSignificantChanges && recentUpdates.length >= this.STABILITY_THRESHOLD) {
      // No significant changes recently, reduce frequency
      frequency = Math.min(frequency * 1.3, this.MAX_UPDATE_FREQUENCY);
    }

    // Adjust based on time since last mutation
    const timeSinceLastMutation = contentStability.timeSinceLastChange;
    if (timeSinceLastMutation > 3000) {
      // No mutations for 3+ seconds, reduce frequency
      frequency = Math.min(frequency * 1.2, this.MAX_UPDATE_FREQUENCY);
    } else if (timeSinceLastMutation < 500) {
      // Recent mutations, increase frequency
      frequency = Math.max(frequency * 0.8, this.MIN_UPDATE_FREQUENCY);
    }

    this.updateFrequency = Math.round(frequency);
    return this.updateFrequency;
  }

  // Detect changes between metric snapshots
  detectMetricChanges(currentMetrics, previousMetrics) {
    const changes = new Map();
    this.changedMetrics.clear();

    if (!previousMetrics) {
      // First snapshot, all metrics are "new"
      Object.keys(currentMetrics).forEach((key) => {
        if (this.isMetricValue(currentMetrics[key])) {
          this.changedMetrics.add(key);
          changes.set(key, {
            previous: null,
            current: currentMetrics[key].value,
            change: "new",
            significant: true,
          });
        }
      });
      return changes;
    }

    // Compare each metric
    Object.keys(currentMetrics).forEach((key) => {
      const current = currentMetrics[key];
      const previous = previousMetrics[key];

      if (this.isMetricValue(current) && this.isMetricValue(previous)) {
        const currentValue = current.value;
        const previousValue = previous.value;
        const absoluteChange = Math.abs(currentValue - previousValue);
        const relativeChange = previousValue > 0 ? absoluteChange / previousValue : 0;
        const threshold = this.METRIC_THRESHOLDS[key] || 0.1;

        // Check if change is significant
        const isSignificant = absoluteChange > threshold || relativeChange > this.CHANGE_THRESHOLD;

        if (isSignificant) {
          this.changedMetrics.add(key);
          changes.set(key, {
            previous: previousValue,
            current: currentValue,
            change: currentValue > previousValue ? "increase" : "decrease",
            absoluteChange: absoluteChange,
            relativeChange: relativeChange,
            significant: true,
          });
        }
      }
    });

    return changes;
  }

  // Check if a value is a metric value object
  isMetricValue(value) {
    return (
      value &&
      typeof value === "object" &&
      value.hasOwnProperty("value") &&
      typeof value.value === "number"
    );
  }

  // Update metrics with change detection and frequency adjustment
  updateMetrics(forceUpdate = false) {
    if (this.isUpdating && !forceUpdate) {
      return;
    }

    const now = performance.now();

    // Check if enough time has passed since last update
    if (!forceUpdate && now - this.lastUpdateTime < this.MIN_UPDATE_FREQUENCY) {
      return;
    }

    this.isUpdating = true;
    this.lastUpdateTime = now;

    // Collect current metrics
    const currentMetrics = this.collectCurrentMetrics();

    // Detect changes
    const changes = this.detectMetricChanges(currentMetrics, this.lastMetricsSnapshot);
    const hasChanges = changes.size > 0;

    // Update history
    this.updateHistory.push({
      timestamp: now,
      hasChanges: hasChanges,
      changeCount: changes.size,
      changedMetrics: Array.from(this.changedMetrics),
    });

    // Keep history size manageable
    if (this.updateHistory.length > this.MAX_UPDATE_HISTORY) {
      this.updateHistory.shift();
    }

    // Get content stability for frequency calculation
    const contentStability = dynamicContentHandler.getContentStability();

    // Calculate next update frequency
    const nextFrequency = this.calculateUpdateFrequency(contentStability);

    // Send updated metrics if there are changes or it's a forced update
    if (hasChanges || forceUpdate) {
      // Add update metadata to metrics
      const metricsWithMetadata = {
        ...currentMetrics,
        lastUpdated: Date.now(),
        updateCount: ++metricsUpdateCount,
        changedMetrics: Array.from(this.changedMetrics),
        updateFrequency: nextFrequency,
        contentStability: contentStability,
      };

      // Send metrics with change highlighting
      this.sendMetricsWithHighlighting(metricsWithMetadata, changes);

      console.log(`Metrics updated (${changes.size} changes), next update in ${nextFrequency}ms`);
    }

    // Store snapshot for next comparison
    this.lastMetricsSnapshot = JSON.parse(JSON.stringify(currentMetrics));

    // Schedule next update
    this.scheduleNextUpdate(nextFrequency);

    this.isUpdating = false;
  }

  // Collect current metrics snapshot
  collectCurrentMetrics() {
    const currentTime = Date.now();

    if (transitionType === "navigation") {
      const navEntries = performance.getEntriesByType("navigation")[0];
      if (navEntries) {
        return {
          TTFB: {
            value: (navEntries.responseStart - navEntries.startTime) / 1000,
            unit: "s",
          },
          FCP: {
            value: (navEntries.domInteractive - navEntries.startTime) / 1000,
            unit: "s",
          },
          LCP: {
            value: LCPTime,
            unit: "s",
            element: lcpElementInfo,
            selector: lcpElementSelector,
          },
          CLS: {
            value: clsObserverInstance.getValue(),
            unit: "score",
          },
          DOMLoadTime: {
            value: (navEntries.domContentLoadedEventEnd - navEntries.startTime) / 1000,
            unit: "s",
          },
          NavigationTime: {
            value: (navEntries.responseStart - navEntries.startTime) / 1000 + LCPTime,
            unit: "s",
          },
          timestamp: currentTime,
          url: window.location.href,
          title: document.title,
          transitionType: "navigation",
        };
      }
    } else {
      // SPA metrics
      return {
        TTFB: {
          value: 0.01,
          unit: "s",
        },
        FCP: {
          value: Math.min(visualCompletionTime * 0.4, 0.5),
          unit: "s",
        },
        LCP: {
          value: LCPTime > 0 ? LCPTime : visualCompletionTime,
          unit: "s",
          element: lcpElementInfo,
          selector: lcpElementSelector,
        },
        CLS: {
          value: clsObserverInstance.getValue(),
          unit: "score",
        },
        DOMLoadTime: {
          value: visualCompletionTime * 0.7,
          unit: "s",
        },
        NavigationTime: {
          value: visualCompletionTime,
          unit: "s",
        },
        VisualCompletionTime: {
          value: visualCompletionTime,
          unit: "s",
        },
        timestamp: currentTime,
        url: window.location.href,
        title: document.title,
        transitionType: "spa",
      };
    }

    return {};
  }

  // Send metrics with change highlighting information
  sendMetricsWithHighlighting(metrics, changes) {
    // Add threshold evaluation results to each metric
    const metricsWithThresholds = { ...metrics };

    // Evaluate thresholds for each metric that has a value and unit
    for (const [metricName, metricData] of Object.entries(metrics)) {
      if (typeof metricData === "object" && metricData.hasOwnProperty("value")) {
        const evaluation = ThresholdEvaluator.evaluateMetric(metricName, metricData.value);
        metricsWithThresholds[metricName] = {
          ...metricData,
          threshold: evaluation,
          changed: this.changedMetrics.has(metricName),
          changeInfo: changes.get(metricName) || null,
        };
      }
    }

    // Send metrics with highlighting information
    chrome.runtime.sendMessage(
      {
        type: "performanceMetrics",
        data: metricsWithThresholds,
        highlighting: {
          changedMetrics: Array.from(this.changedMetrics),
          updateCount: metricsUpdateCount,
          lastUpdateTime: this.lastUpdateTime,
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending metrics:", chrome.runtime.lastError);
          // Retry after a delay
          setTimeout(() => {
            chrome.runtime.sendMessage({
              type: "performanceMetrics",
              data: metricsWithThresholds,
              highlighting: {
                changedMetrics: Array.from(this.changedMetrics),
                updateCount: metricsUpdateCount,
                lastUpdateTime: this.lastUpdateTime,
              },
            });
          }, 500);
        }
      }
    );
  }

  // Schedule the next metric update
  scheduleNextUpdate(frequency) {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    this.updateTimer = setTimeout(() => {
      this.updateMetrics();
    }, frequency);
  }

  // Force an immediate metrics update
  forceUpdate() {
    this.updateMetrics(true);
  }

  // Reset the update system (for SPA navigation)
  reset() {
    this.lastMetricsSnapshot = null;
    this.updateHistory = [];
    this.changedMetrics.clear();
    this.updateFrequency = 1000; // Reset to base frequency
    this.lastUpdateTime = 0;
    metricsUpdateCount = 0;

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
  }

  // Get update statistics
  getUpdateStats() {
    return {
      updateCount: metricsUpdateCount,
      currentFrequency: this.updateFrequency,
      lastUpdateTime: this.lastUpdateTime,
      recentChanges: this.updateHistory.slice(-5),
      changedMetrics: Array.from(this.changedMetrics),
    };
  }

  // Cleanup
  destroy() {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
  }
}

// Initialize enhanced dynamic content handler
const dynamicContentHandler = new DynamicContentHandler();

// Initialize smart metric update system
const smartUpdateSystem = new SmartMetricUpdateSystem();

// Start DOM mutation tracking
initDomMutationTracking();

// Function to observe LCP
// Enhanced LCP observation with element tracking (aligned with UX Report standards)
let lcpElement = null;
let lcpElementSelector = null;
let lcpElementInfo = null;

function observeLCP() {
  try {
    if (!("PerformanceObserver" in window)) {
      console.warn("PerformanceObserver not supported for LCP measurement");
      sendErrorToBackground("lcp_not_supported", "PerformanceObserver API not available");
      return null;
    }

    if (
      !PerformanceObserver.supportedEntryTypes ||
      !PerformanceObserver.supportedEntryTypes.includes("largest-contentful-paint")
    ) {
      console.warn("LCP measurement not supported by browser");
      sendErrorToBackground(
        "lcp_not_supported",
        "Largest Contentful Paint measurement not supported"
      );
      return null;
    }

    const observer = new PerformanceObserver((list) => {
      try {
        const entries = list.getEntries();
        if (!entries || entries.length === 0) {
          return;
        }

        console.log(`📊 LCP Observer: Processing ${entries.length} entries`);

        // Process all entries to get the final LCP (Chrome's approach)
        for (const entry of entries) {
          try {
            // Validate entry data
            if (!entry || typeof entry.startTime !== "number") {
              console.warn("Invalid LCP entry received:", entry);
              continue;
            }

            // For SPA transitions, we need to check if this entry happened after our navigation start
            if (transitionType === "spa" && entry.startTime < navigationStart) {
              continue; // Skip LCP entries from before the SPA transition
            }

            // Calculate LCP time (aligned with Chrome's measurement and UX Report)
            // Use the same calculation method as Chrome's field data
            const lcpTime = entry.startTime / 1000;

            // Only update if this is a newer LCP (Chrome keeps updating until final)
            if (lcpTime >= LCPTime) {
              LCPTime = lcpTime;

              // Capture LCP element information
              if (entry.element) {
                lcpElement = entry.element;
                lcpElementSelector = generateElementSelector(entry.element);
                lcpElementInfo = {
                  tagName: entry.element.tagName,
                  id: entry.element.id || null,
                  className: entry.element.className || null,
                  src: entry.element.src || null,
                  alt: entry.element.alt || null,
                  textContent: entry.element.textContent
                    ? entry.element.textContent.substring(0, 100)
                    : null,
                  size: entry.size || 0,
                  loadTime: entry.loadTime || 0,
                  renderTime: entry.renderTime || 0,
                  url: entry.url || null,
                };

                console.log("✅ LCP element captured:", {
                  time: LCPTime,
                  selector: lcpElementSelector,
                  element: lcpElementInfo,
                });
              } else {
                console.warn("⚠️ LCP entry has no element reference:", entry);

                // Try to find LCP element using fallback method
                tryFindLCPElementFallback(entry);
              }
            }
          } catch (entryError) {
            console.warn("Error processing LCP entry:", entryError);
          }
        }
      } catch (error) {
        console.error("Error processing LCP entries:", error);
        handleLCPObserverError(error, observer);
      }
    });

    observer.observe({ type: "largest-contentful-paint", buffered: true });
    console.log("Enhanced LCP observer started successfully");
    return observer;
  } catch (error) {
    console.error("Failed to create LCP observer:", error);
    sendErrorToBackground("lcp_observer_error", `Failed to start LCP observer: ${error.message}`);
    return null;
  }
}

// Generate a unique CSS selector for an element (similar to Chrome DevTools)
function generateElementSelector(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  try {
    // If element has an ID, use it
    if (element.id) {
      return `#${element.id}`;
    }

    // Build selector path
    const path = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      // Add class if available and unique enough
      if (current.className && typeof current.className === "string") {
        const classes = current.className
          .trim()
          .split(/\s+/)
          .filter((cls) => cls.length > 0);
        if (classes.length > 0) {
          selector += "." + classes.join(".");
        }
      }

      // Add nth-child if needed for uniqueness
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children).filter(
          (sibling) => sibling.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(" > ");
  } catch (error) {
    console.warn("Error generating element selector:", error);
    return element.tagName ? element.tagName.toLowerCase() : "unknown";
  }
}

// Handle LCP observer errors
function handleLCPObserverError(error, observer) {
  console.error("LCP observer error:", error);
  sendErrorToBackground("lcp_observer_error", `LCP observer error: ${error.message}`);

  // Try to recover
  try {
    if (observer) {
      observer.disconnect();
    }

    // Attempt to restart after a delay
    setTimeout(() => {
      console.log("Attempting to restart LCP observer...");
      lcpObserver = observeLCP();
    }, 2000);
  } catch (recoveryError) {
    console.error("Failed to recover LCP observer:", recoveryError);
  }
}

// Note: LCP observer and CLS observer are now initialized conditionally above
// based on page support validation

// Create a paint observer for FCP during SPA transitions (only if initialized)
let paintObserver = null;
if (isInitialized && performanceSupport.performanceObserver) {
  try {
    paintObserver = new PerformanceObserver((list) => {
      try {
        for (const entry of list.getEntries()) {
          if (
            entry.name === "first-contentful-paint" &&
            transitionType === "spa" &&
            entry.startTime > navigationStart
          ) {
            // Store the FCP time for SPA navigation
            window.spaPaintMetrics = window.spaPaintMetrics || {};
            window.spaPaintMetrics.FCP = (entry.startTime - navigationStart) / 1000;
          }
        }
      } catch (error) {
        console.error("Error processing paint entries:", error);
      }
    });

    paintObserver.observe({ type: "paint", buffered: true });
    console.log("Paint observer initialized successfully");
  } catch (error) {
    console.error("Failed to initialize paint observer:", error);
    sendErrorToBackground("paint_observer_error", error.message);
  }
}

// Function to collect and send metrics
function collectMetrics() {
  try {
    // Only collect metrics if properly initialized
    if (!isInitialized) {
      console.log("Metrics collection skipped - not initialized due to page/permission issues");
      return;
    }

    const currentTime = Date.now();

    // Check if basic performance API is available
    if (!performanceSupport.performanceNow) {
      console.error("Performance.now() not available");
      sendErrorToBackground("api_not_supported", "Performance.now() API not available");
      return;
    }

    // For initial page load
    if (transitionType === "navigation") {
      try {
        if (!performanceSupport.navigationTiming) {
          console.warn("Navigation Timing API not available, using fallback metrics");
          collectFallbackMetrics();
          return;
        }

        const navEntries = performance.getEntriesByType("navigation")[0];
        if (navEntries) {
          // Validate navigation entry data
          if (!validateNavigationEntry(navEntries)) {
            console.warn("Invalid navigation entry data, using fallback");
            collectFallbackMetrics();
            return;
          }

          const metrics = {
            TTFB: {
              value: Math.max(0, (navEntries.responseStart - navEntries.startTime) / 1000),
              unit: "s",
            },
            FCP: {
              value: Math.max(0, (navEntries.domInteractive - navEntries.startTime) / 1000),
              unit: "s",
            },
            LCP: {
              value: Math.max(0, LCPTime || 0),
              unit: "s",
              element: lcpElementInfo,
              selector: lcpElementSelector,
            },
            CLS: {
              value: Math.max(0, clsObserverInstance.getValue()),
              unit: "score",
            },
            DOMLoadTime: {
              value: Math.max(
                0,
                (navEntries.domContentLoadedEventEnd - navEntries.startTime) / 1000
              ),
              unit: "s",
            },
            NavigationTime: {
              value: Math.max(
                0,
                (navEntries.responseStart - navEntries.startTime) / 1000 + (LCPTime || 0)
              ),
              unit: "s",
            },
            timestamp: currentTime,
            lastUpdated: currentTime,
            url: window.location.href,
            title: document.title,
            transitionType: "navigation",
          };

          sendMetrics(metrics);
        } else {
          // If navigation entries aren't available yet, try again after a delay
          setTimeout(() => {
            try {
              collectMetrics();
            } catch (retryError) {
              console.error("Error in collectMetrics retry:", retryError);
              sendErrorToBackground("metrics_collection_retry_error", retryError.message);
            }
          }, 500);
        }
      } catch (navigationError) {
        console.error("Error collecting navigation metrics:", navigationError);
        sendErrorToBackground("navigation_metrics_error", navigationError.message);
        collectFallbackMetrics();
      }
    }
    // For SPA transitions
    else {
      try {
        // Don't collect metrics yet if visual completion hasn't been detected
        // The updateMetricsWithEnhancedVisualCompletion function will handle it
        if (visuallyComplete) {
          // Use visual completion time instead of estimates
          const metrics = {
            TTFB: {
              value: 0.01, // SPA transitions don't have TTFB (client-side only)
              unit: "s",
            },
            FCP: {
              value: Math.min(visualCompletionTime * 0.4, 0.5), // Estimate FCP as earlier than completion
              unit: "s",
            },
            LCP: {
              value: visualCompletionTime,
              unit: "s",
            },
            CLS: {
              value: clsObserverInstance.getValue(),
              unit: "score",
            },
            DOMLoadTime: {
              value: visualCompletionTime * 0.7, // Estimate
              unit: "s",
            },
            NavigationTime: {
              value: visualCompletionTime,
              unit: "s",
            },
            VisualCompletionTime: {
              value: visualCompletionTime,
              unit: "s",
            },
            timestamp: currentTime,
            lastUpdated: currentTime,
            url: window.location.href,
            title: document.title,
            transitionType: "spa",
          };

          sendMetrics(metrics);
        } else {
          // Start visual completion tracking if not already started
          if (!rafMonitoring) {
            startVisualCompletionTracking();
          }

          // Check again after a delay if visual completion hasn't been detected yet
          // Use a shorter interval but keep checking for longer
          setTimeout(collectMetrics, 300);
        }
      } catch (spaError) {
        console.error("Error collecting SPA metrics:", spaError);
        sendErrorToBackground("spa_metrics_error", spaError.message);
      }
    }
  } catch (error) {
    console.error("Critical error in collectMetrics:", error);
    sendErrorToBackground("collect_metrics_critical_error", error.message);
  }
}

function sendMetrics(metrics) {
  try {
    // Validate metrics data before processing
    if (!metrics || typeof metrics !== "object") {
      console.error("Invalid metrics data provided to sendMetrics");
      sendErrorToBackground("invalid_metrics_data", "Metrics data is null or not an object");
      return;
    }

    // Add threshold evaluation results to each metric
    const metricsWithThresholds = { ...metrics };

    // Evaluate thresholds for each metric that has a value and unit
    for (const [metricName, metricData] of Object.entries(metrics)) {
      try {
        if (typeof metricData === "object" && metricData.hasOwnProperty("value")) {
          // Validate metric value
          if (typeof metricData.value !== "number" || isNaN(metricData.value)) {
            console.warn(`Invalid metric value for ${metricName}:`, metricData.value);
            continue;
          }

          const evaluation = ThresholdEvaluator.evaluateMetric(metricName, metricData.value);
          metricsWithThresholds[metricName] = {
            ...metricData,
            threshold: evaluation,
          };
        }
      } catch (evaluationError) {
        console.warn(`Error evaluating threshold for ${metricName}:`, evaluationError);
        // Continue with other metrics even if one fails
      }
    }

    // Validate that we have at least some valid metrics
    const validMetrics = Object.values(metricsWithThresholds).filter(
      (metric) =>
        typeof metric === "object" && typeof metric.value === "number" && !isNaN(metric.value)
    );

    if (validMetrics.length === 0) {
      console.error("No valid metrics to send");
      sendErrorToBackground("no_valid_metrics", "All metrics failed validation");
      return;
    }

    // Send collected metrics with threshold evaluations and retry logic
    const sendWithRetry = (retryCount = 0) => {
      const maxRetries = 3;

      try {
        chrome.runtime.sendMessage(
          {
            type: "performanceMetrics",
            data: metricsWithThresholds,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error sending metrics:", chrome.runtime.lastError);

              if (retryCount < maxRetries) {
                console.log(`Retrying metrics send (attempt ${retryCount + 1}/${maxRetries})`);
                setTimeout(() => sendWithRetry(retryCount + 1), 1000 * (retryCount + 1));
              } else {
                console.error("Failed to send metrics after all retries");
                sendErrorToBackground(
                  "metrics_send_failed",
                  `Failed to send metrics after ${maxRetries} retries: ${chrome.runtime.lastError.message}`
                );
              }
            } else {
              console.log("Metrics sent successfully");
              // Update global variables for smart update system compatibility
              metricsCollected = true;
              currentUrl = window.location.href;
              lastMetricsSnapshot = metricsWithThresholds;
              lastMetricsUpdateTime = Date.now();
            }
          }
        );
      } catch (sendError) {
        console.error("Error in chrome.runtime.sendMessage:", sendError);
        if (retryCount < maxRetries) {
          setTimeout(() => sendWithRetry(retryCount + 1), 1000 * (retryCount + 1));
        } else {
          sendErrorToBackground("metrics_send_exception", sendError.message);
        }
      }
    };

    sendWithRetry();
  } catch (error) {
    console.error("Critical error in sendMetrics:", error);
    sendErrorToBackground("send_metrics_critical_error", error.message);
  }
}

// Enhanced URL change detection with debouncing
class URLChangeDetector {
  constructor() {
    this.currentUrl = window.location.href;
    this.lastUrlChange = 0;
    this.debounceTimeout = null;
    this.pollingInterval = null;
    this.isNavigating = false;
    this.initialPageLoad = true; // Flag to track if this is the initial page load

    // Configuration
    this.DEBOUNCE_DELAY = 100; // ms to wait before processing URL change
    this.POLLING_INTERVAL = 200; // ms between URL checks
    this.MIN_NAVIGATION_INTERVAL = 500; // ms minimum between navigations
  }

  // Initialize all URL change detection methods
  init() {
    this.setupHistoryAPIMonitoring();
    this.setupPopstateListener();
    this.setupNavigationAPIListener();
    this.startPolling();
    console.log("Enhanced URL change detection initialized");
  }

  // Enhanced History API monitoring with better event handling
  setupHistoryAPIMonitoring() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      console.log("history.pushState detected");
      this.handleUrlChange("pushState");
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      console.log("history.replaceState detected");
      this.handleUrlChange("replaceState");
    };
  }

  // Setup popstate event listener for back/forward navigation
  setupPopstateListener() {
    window.addEventListener("popstate", (event) => {
      console.log("popstate event detected", event.state);
      this.handleUrlChange("popstate");
    });
  }

  // Setup Navigation API listener for modern browsers
  setupNavigationAPIListener() {
    if ("navigation" in window) {
      window.navigation.addEventListener("navigate", (event) => {
        console.log("Navigation API event:", event.navigationType, event.destination?.url);

        // Check for navigation types that indicate SPA transitions
        if (
          event.navigationType === "push" ||
          event.navigationType === "replace" ||
          event.navigationType === "traverse"
        ) {
          this.handleUrlChange("navigationAPI");
        }
      });
    }
  }

  // Fallback polling for edge cases and older browsers
  startPolling() {
    this.pollingInterval = setInterval(() => {
      this.checkUrlChange();
    }, this.POLLING_INTERVAL);
  }

  // Check for URL changes (used by polling)
  checkUrlChange() {
    if (this.currentUrl !== window.location.href) {
      console.log(`URL polling detected change: ${this.currentUrl} -> ${window.location.href}`);
      this.handleUrlChange("polling");
    }
  }

  // Debounced URL change handler to prevent rapid-fire navigation events
  handleUrlChange(source) {
    const now = performance.now();

    // Prevent handling multiple events for the same navigation
    if (this.isNavigating && now - this.lastUrlChange < this.MIN_NAVIGATION_INTERVAL) {
      console.log(`Ignoring rapid navigation event from ${source}`);
      return;
    }

    // Clear existing debounce timeout
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    // Debounce the URL change processing
    this.debounceTimeout = setTimeout(() => {
      this.processUrlChange(source);
    }, this.DEBOUNCE_DELAY);
  }

  // Process the actual URL change after debouncing
  processUrlChange(source) {
    const newUrl = window.location.href;

    if (this.currentUrl !== newUrl) {
      // Skip the first URL change detection (initial page load)
      if (this.initialPageLoad) {
        console.log(`Ignoring initial page load URL change: ${this.currentUrl} -> ${newUrl}`);
        this.initialPageLoad = false;
        this.currentUrl = newUrl;
        return;
      }

      console.log(`SPA navigation confirmed via ${source}: ${this.currentUrl} -> ${newUrl}`);

      this.isNavigating = true;
      this.lastUrlChange = performance.now();
      this.currentUrl = newUrl;

      // Trigger metrics reset and collection (this is a real SPA navigation)
      resetAndCollectMetrics(true);

      // Reset navigation flag after a delay
      setTimeout(() => {
        this.isNavigating = false;
      }, this.MIN_NAVIGATION_INTERVAL);
    }
  }

  // Cleanup method
  destroy() {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }
}

// Framework-specific navigation detection
class FrameworkNavigationDetector {
  constructor() {
    this.detectedFrameworks = new Set();
    this.observers = [];
    this.routerInstances = new Map();
  }

  // Initialize framework detection
  init() {
    this.detectFrameworks();
    this.setupFrameworkHooks();
    console.log(
      "Framework navigation detection initialized for:",
      Array.from(this.detectedFrameworks)
    );
  }

  // Detect which frameworks are present
  detectFrameworks() {
    // React detection
    if (this.detectReact()) {
      this.detectedFrameworks.add("react");
    }

    // Vue detection
    if (this.detectVue()) {
      this.detectedFrameworks.add("vue");
    }

    // Angular detection
    if (this.detectAngular()) {
      this.detectedFrameworks.add("angular");
    }
  }

  // Detect React and React Router
  detectReact() {
    // Check for React in window object
    if (window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      return true;
    }

    // Check for React Router specific elements
    const reactRouterElements = document.querySelectorAll("[data-reactroot], [data-react-helmet]");
    if (reactRouterElements.length > 0) {
      return true;
    }

    // Check for React fiber nodes (React 16+)
    const potentialReactElements = document.querySelectorAll("div, span, section");
    for (const element of potentialReactElements) {
      if (
        element._reactInternalFiber ||
        element._reactInternalInstance ||
        element.__reactInternalInstance
      ) {
        return true;
      }
    }

    return false;
  }

  // Detect Vue and Vue Router
  detectVue() {
    // Check for Vue in window object
    if (window.Vue || window.__VUE__) {
      return true;
    }

    // Check for Vue app instances
    const vueElements = document.querySelectorAll("[data-v-], [v-cloak]");
    if (vueElements.length > 0) {
      return true;
    }

    // Check for Vue Router specific attributes
    const routerElements = document.querySelectorAll("router-view, router-link");
    if (routerElements.length > 0) {
      return true;
    }

    return false;
  }

  // Detect Angular
  detectAngular() {
    // Check for Angular in window object
    if (window.ng || window.angular || window.getAllAngularRootElements) {
      return true;
    }

    // Check for Angular specific attributes
    const angularElements = document.querySelectorAll(
      "[ng-app], [ng-controller], [ng-view], [ui-view]"
    );
    if (angularElements.length > 0) {
      return true;
    }

    // Check for Angular Router outlet
    const routerOutlets = document.querySelectorAll("router-outlet");
    if (routerOutlets.length > 0) {
      return true;
    }

    return false;
  }

  // Setup framework-specific navigation hooks
  setupFrameworkHooks() {
    if (this.detectedFrameworks.has("react")) {
      this.setupReactHooks();
    }

    if (this.detectedFrameworks.has("vue")) {
      this.setupVueHooks();
    }

    if (this.detectedFrameworks.has("angular")) {
      this.setupAngularHooks();
    }
  }

  // Setup React Router navigation detection
  setupReactHooks() {
    // Monitor for React Router route changes through DOM mutations
    const reactObserver = new MutationObserver((mutations) => {
      let routeChanged = false;

      mutations.forEach((mutation) => {
        // Check for significant DOM changes that might indicate route changes
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          // Look for React Router specific changes
          const hasRouterElements = Array.from(mutation.addedNodes).some((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              return (
                node.querySelector &&
                (node.querySelector("[data-reactroot]") ||
                  node.classList?.contains("route-") ||
                  node.getAttribute?.("data-react-router"))
              );
            }
            return false;
          });

          if (hasRouterElements) {
            routeChanged = true;
          }
        }
      });

      if (routeChanged) {
        console.log("React Router navigation detected via DOM mutation");
        urlChangeDetector.handleUrlChange("react-router");
      }
    });

    reactObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.observers.push(reactObserver);

    // Try to hook into React Router history if available
    setTimeout(() => {
      this.hookReactRouterHistory();
    }, 1000);
  }

  // Hook into React Router history object
  hookReactRouterHistory() {
    // Look for React Router history in common locations
    const possibleHistoryObjects = [
      window.history,
      window.__REACT_ROUTER_HISTORY__,
      window.__history__,
    ];

    possibleHistoryObjects.forEach((historyObj) => {
      if (historyObj && typeof historyObj.listen === "function") {
        try {
          const unlisten = historyObj.listen((location, action) => {
            console.log("React Router history change:", action, location.pathname);
            urlChangeDetector.handleUrlChange("react-router-history");
          });

          // Store unlisten function for cleanup
          this.routerInstances.set("react-history", unlisten);
        } catch (e) {
          console.log("Could not hook into React Router history:", e);
        }
      }
    });
  }

  // Setup Vue Router navigation detection
  setupVueHooks() {
    // Monitor for Vue Router changes through DOM mutations
    const vueObserver = new MutationObserver((mutations) => {
      let routeChanged = false;

      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          const hasVueRouterElements = Array.from(mutation.addedNodes).some((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              return (
                node.tagName === "ROUTER-VIEW" ||
                node.querySelector?.("router-view") ||
                node.classList?.contains("router-") ||
                node.getAttribute?.("data-v-")
              );
            }
            return false;
          });

          if (hasVueRouterElements) {
            routeChanged = true;
          }
        }
      });

      if (routeChanged) {
        console.log("Vue Router navigation detected via DOM mutation");
        urlChangeDetector.handleUrlChange("vue-router");
      }
    });

    vueObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.observers.push(vueObserver);

    // Try to hook into Vue Router instance
    setTimeout(() => {
      this.hookVueRouter();
    }, 1000);
  }

  // Hook into Vue Router instance
  hookVueRouter() {
    // Look for Vue Router instance
    if (window.Vue && window.Vue.prototype.$router) {
      try {
        const router = window.Vue.prototype.$router;

        // Hook into router's beforeEach guard
        router.beforeEach((to, from, next) => {
          console.log("Vue Router navigation:", from.path, "->", to.path);
          urlChangeDetector.handleUrlChange("vue-router-guard");
          next();
        });
      } catch (e) {
        console.log("Could not hook into Vue Router:", e);
      }
    }

    // Also check for Vue 3 router
    if (window.__VUE_ROUTER__) {
      try {
        const router = window.__VUE_ROUTER__;
        router.beforeEach((to, from, next) => {
          console.log("Vue 3 Router navigation:", from.path, "->", to.path);
          urlChangeDetector.handleUrlChange("vue3-router-guard");
          next();
        });
      } catch (e) {
        console.log("Could not hook into Vue 3 Router:", e);
      }
    }
  }

  // Setup Angular Router navigation detection
  setupAngularHooks() {
    // Monitor for Angular Router changes through DOM mutations
    const angularObserver = new MutationObserver((mutations) => {
      let routeChanged = false;

      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          const hasAngularRouterElements = Array.from(mutation.addedNodes).some((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              return (
                node.tagName === "ROUTER-OUTLET" ||
                node.querySelector?.("router-outlet") ||
                node.getAttribute?.("ng-view") ||
                node.getAttribute?.("ui-view")
              );
            }
            return false;
          });

          if (hasAngularRouterElements) {
            routeChanged = true;
          }
        }
      });

      if (routeChanged) {
        console.log("Angular Router navigation detected via DOM mutation");
        urlChangeDetector.handleUrlChange("angular-router");
      }
    });

    angularObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.observers.push(angularObserver);

    // Try to hook into Angular Router through Zone.js
    setTimeout(() => {
      this.hookAngularRouter();
    }, 1000);
  }

  // Hook into Angular Router through Zone.js integration
  hookAngularRouter() {
    // Check for Zone.js
    if (window.Zone) {
      try {
        // Patch Zone.js to detect Angular navigation
        const originalRunTask = Zone.prototype.runTask;
        Zone.prototype.runTask = function (task, applyThis, applyArgs) {
          // Check if this is a router-related task
          if (
            task.source &&
            (task.source.includes("Router") ||
              task.source.includes("navigation") ||
              task.source.includes("route"))
          ) {
            console.log("Angular Router task detected:", task.source);
            urlChangeDetector.handleUrlChange("angular-zone");
          }

          return originalRunTask.call(this, task, applyThis, applyArgs);
        };
      } catch (e) {
        console.log("Could not hook into Angular Zone.js:", e);
      }
    }

    // Also try to hook into Angular Router directly
    if (window.ng && window.ng.probe) {
      try {
        // This is a more advanced technique for Angular debugging
        const debugElements = window.ng.probe(document.body);
        if (debugElements && debugElements.injector) {
          const router = debugElements.injector.get("Router");
          if (router && router.events) {
            router.events.subscribe((event) => {
              if (event.constructor.name === "NavigationEnd") {
                console.log("Angular Router NavigationEnd:", event.url);
                urlChangeDetector.handleUrlChange("angular-router-events");
              }
            });
          }
        }
      } catch (e) {
        console.log("Could not hook into Angular Router events:", e);
      }
    }
  }

  // Cleanup method
  destroy() {
    // Disconnect all observers
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];

    // Cleanup router hooks
    this.routerInstances.forEach((unlisten, key) => {
      if (typeof unlisten === "function") {
        unlisten();
      }
    });
    this.routerInstances.clear();
  }
}

// Initialize the enhanced URL change detector
const urlChangeDetector = new URLChangeDetector();

// Initialize framework-specific navigation detector
const frameworkDetector = new FrameworkNavigationDetector();

// Initialize MutationObserver when the DOM is ready
function initMutationObserver() {
  // Make sure body exists before observing
  if (!document.body) {
    console.log("Body not available yet, waiting for DOMContentLoaded");
    document.addEventListener("DOMContentLoaded", initMutationObserver);
    return;
  }

  // Use MutationObserver to detect DOM changes that might indicate SPA navigation
  mutationObserver = new MutationObserver((mutations) => {
    // Only check if the URL has changed when we detect significant DOM mutations
    const significantChanges = mutations.some(
      (mutation) => mutation.type === "childList" && mutation.addedNodes.length > 3 // Threshold for significant change
    );

    if (significantChanges) {
      urlObserver();
    }
  });

  // Start observing DOM changes if body exists
  try {
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    console.log("MutationObserver initialized successfully");
  } catch (e) {
    console.error("Error initializing MutationObserver:", e);
  }
}

// Start the mutation observer
initMutationObserver();

// Listen for Navigation API events (for SPAs)
if ("navigation" in window) {
  window.navigation.addEventListener("navigate", (event) => {
    console.log("Navigation test", event.navigationType);
    // Check for all navigation types that might indicate SPA navigation
    if (
      event.navigationType === "push" ||
      event.navigationType === "replace" ||
      event.navigationType === "traverse"
    ) {
      console.log("Navigation API detected navigation:", event.navigationType);
      resetAndCollectMetrics();
    }
  });
}

// Initialize enhanced URL change detection
urlChangeDetector.init();

// Initialize framework-specific navigation detection
frameworkDetector.init();

// Initialize smart update system
smartUpdateSystem.init();

// Initialize dynamic content handler with smart update callback
dynamicContentHandler.init(() => {
  // Callback for significant content changes
  smartUpdateSystem.forceUpdate();
});

// Initial metrics collection on page load
window.addEventListener("load", () => {
  // Send loading state immediately
  chrome.runtime.sendMessage({ type: "metricsLoading" });

  // Start visual completion tracking
  startVisualCompletionTracking();

  // Collect initial metrics after a short delay
  setTimeout(() => {
    collectMetrics();
    // Start smart update system after initial collection
    setTimeout(() => {
      smartUpdateSystem.forceUpdate();
    }, 500);
  }, 1000);
});

// Enhanced message handling for comprehensive popup-content script communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.type === "toggleCLSDebugger") {
      const newState = clsDebugger.toggle();

      // Persist state to background script
      chrome.runtime.sendMessage({
        type: "clsDebuggerState",
        enabled: newState,
      });

      // Enhanced response with validation
      sendResponse({
        success: true,
        enabled: newState,
        state: clsDebugger.getState(),
        currentCLS: CLSScore,
        timestamp: Date.now(),
      });
      return true;
    }

    if (message.type === "getCLSDebuggerState") {
      sendResponse({
        success: true,
        state: clsDebugger.getState(),
        currentCLS: CLSScore,
        isInitialized: isInitialized,
        pageSupported: pageSupport.isSupported,
      });
      return true;
    }

    if (message.type === "forceRefresh") {
      console.log("Force refresh requested from popup");

      // Validate page support before refresh
      if (!pageSupport.isSupported) {
        sendResponse({
          success: false,
          error: "Page not supported for metrics collection",
          reason: pageSupport.reason,
        });
        return true;
      }

      // Reset and recollect metrics with enhanced validation (not SPA navigation)
      resetAndCollectMetrics(false);

      sendResponse({
        success: true,
        timestamp: Date.now(),
        url: window.location.href,
      });
      return true;
    }

    if (message.type === "validateMetrics") {
      // Validate current metrics accuracy
      const validation = validateCurrentMetrics();
      sendResponse({
        success: true,
        validation: validation,
        timestamp: Date.now(),
      });
      return true;
    }

    if (message.type === "getIntegrationStatus") {
      // Provide comprehensive integration status
      const status = getIntegrationStatus();
      sendResponse({
        success: true,
        status: status,
        timestamp: Date.now(),
      });
      return true;
    }

    if (message.type === "highlightLCPElement") {
      // Highlight the LCP element in the DOM
      const result = highlightLCPElement();
      sendResponse({
        success: true,
        result: result,
        timestamp: Date.now(),
      });
      return true;
    }

    // Unknown message type
    sendResponse({
      success: false,
      error: "Unknown message type",
      type: message.type,
    });
    return true;
  } catch (error) {
    console.error("Error handling message:", error);
    sendResponse({
      success: false,
      error: error.message,
      type: message.type,
    });
    return true;
  }
});

// Enhanced metrics validation system
function validateCurrentMetrics() {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    metrics: {},
    timestamp: Date.now(),
  };

  try {
    // Validate CLS measurement
    if (clsObserverInstance) {
      const clsValue = clsObserverInstance.getValue();
      validation.metrics.CLS = {
        value: clsValue,
        isValid: clsValue >= 0 && clsValue <= 10, // Reasonable CLS range
        source: clsObserverInstance.isSupported ? "PerformanceObserver" : "fallback",
      };

      if (!validation.metrics.CLS.isValid) {
        validation.errors.push(`Invalid CLS value: ${clsValue}`);
        validation.isValid = false;
      }
    } else {
      validation.warnings.push("CLS observer not initialized");
    }

    // Validate LCP measurement
    validation.metrics.LCP = {
      value: LCPTime,
      isValid: LCPTime > 0 && LCPTime < 60, // Reasonable LCP range (0-60 seconds)
      source: lcpObserver ? "PerformanceObserver" : "fallback",
    };

    if (!validation.metrics.LCP.isValid && LCPTime !== 0) {
      validation.errors.push(`Invalid LCP value: ${LCPTime}`);
      validation.isValid = false;
    }

    // Validate threshold evaluations
    for (const [metricName, metricData] of Object.entries(validation.metrics)) {
      if (metricData.isValid && metricData.value !== undefined) {
        const thresholdResult = ThresholdEvaluator.evaluateMetric(metricName, metricData.value);
        metricData.thresholdStatus = thresholdResult.status;
        metricData.thresholdColor = thresholdResult.color;
      }
    }

    // Validate page support
    if (!pageSupport.isSupported) {
      validation.warnings.push(`Page not supported: ${pageSupport.reason}`);
    }

    // Validate extension permissions
    if (!extensionPermissions.canAccessPage) {
      validation.errors.push("Insufficient extension permissions");
      validation.isValid = false;
    }

    // Validate performance API support
    if (!performanceSupport.performanceObserver) {
      validation.warnings.push("PerformanceObserver API not available");
    }
  } catch (error) {
    validation.errors.push(`Validation error: ${error.message}`);
    validation.isValid = false;
  }

  return validation;
}

// Get comprehensive integration status
function getIntegrationStatus() {
  const status = {
    timestamp: Date.now(),
    url: window.location.href,
    components: {},
    overall: "healthy",
  };

  try {
    // CLS Debugger integration status
    status.components.clsDebugger = {
      initialized: !!clsDebugger,
      enabled: clsDebugger ? clsDebugger.isEnabled : false,
      currentScore: CLSScore,
      overlayPresent: clsDebugger ? !!clsDebugger.overlayElement : false,
      highlightCount: clsDebugger ? clsDebugger.highlightedElements.length : 0,
    };

    // CLS Observer integration status
    status.components.clsObserver = {
      initialized: !!clsObserverInstance,
      supported: clsObserverInstance ? clsObserverInstance.isSupported : false,
      observing: clsObserverInstance ? !!clsObserverInstance.observer : false,
      errorState: clsObserverInstance ? clsObserverInstance.errorState : null,
      connectedToDebugger: clsObserverInstance ? !!clsObserverInstance.debugger : false,
    };

    // LCP Observer integration status
    status.components.lcpObserver = {
      initialized: !!lcpObserver,
      currentValue: LCPTime,
      hasValidValue: LCPTime > 0,
    };

    // Threshold Evaluator integration status
    status.components.thresholdEvaluator = {
      available: typeof ThresholdEvaluator !== "undefined",
      thresholds: CWV_THRESHOLDS,
      lastEvaluation: ThresholdEvaluator
        ? ThresholdEvaluator.evaluateMetric("CLS", CLSScore)
        : null,
    };

    // Smart Update System integration status
    status.components.smartUpdateSystem = {
      initialized: typeof smartUpdateSystem !== "undefined",
      updateCount: metricsUpdateCount,
      lastUpdate: lastMetricsUpdateTime,
    };

    // Dynamic Content Handler integration status
    status.components.dynamicContentHandler = {
      initialized: typeof dynamicContentHandler !== "undefined",
      mutationObserver: !!mutationObserver,
      visualCompletion: {
        complete: visuallyComplete,
        time: visualCompletionTime,
        monitoring: rafMonitoring,
      },
    };

    // Page Support integration status
    status.components.pageSupport = {
      supported: pageSupport.isSupported,
      pageType: pageSupport.pageType,
      limitations: pageSupport.limitations,
    };

    // Extension Permissions integration status
    status.components.permissions = {
      canAccessPage: extensionPermissions.canAccessPage,
      hasActiveTab: extensionPermissions.hasActiveTab,
      hasStorage: extensionPermissions.hasStorage,
      limitations: extensionPermissions.limitations,
    };

    // Performance API Support integration status
    status.components.performanceAPI = {
      performanceObserver: performanceSupport.performanceObserver,
      supportedEntryTypes: performanceSupport.supportedEntryTypes,
      navigationTiming: performanceSupport.navigationTiming,
      performanceNow: performanceSupport.performanceNow,
    };

    // Determine overall health
    const criticalIssues = [];

    if (!status.components.clsObserver.supported) {
      criticalIssues.push("CLS measurement not supported");
    }

    if (!status.components.pageSupport.supported) {
      criticalIssues.push("Page not supported");
    }

    if (!status.components.permissions.canAccessPage) {
      criticalIssues.push("Insufficient permissions");
    }

    if (criticalIssues.length > 0) {
      status.overall = "critical";
      status.criticalIssues = criticalIssues;
    } else if (!status.components.performanceAPI.performanceObserver) {
      status.overall = "degraded";
      status.degradationReason = "Limited performance API support";
    }
  } catch (error) {
    status.overall = "error";
    status.error = error.message;
  }

  return status;
}

// Fallback method to find LCP element when entry.element is not available
function tryFindLCPElementFallback(entry) {
  try {
    console.log("🔍 Attempting to find LCP element using fallback method");

    // Try to find the largest element that could be the LCP
    const candidates = [];

    // Look for images
    const images = document.querySelectorAll("img");
    images.forEach((img) => {
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        const rect = img.getBoundingClientRect();
        const size = rect.width * rect.height;
        if (size > 0) {
          candidates.push({ element: img, size, type: "image" });
        }
      }
    });

    // Look for text blocks
    const textElements = document.querySelectorAll("h1, h2, h3, p, div, span");
    textElements.forEach((el) => {
      if (el.textContent && el.textContent.trim().length > 20) {
        const rect = el.getBoundingClientRect();
        const size = rect.width * rect.height;
        if (size > 0) {
          candidates.push({ element: el, size, type: "text" });
        }
      }
    });

    // Sort by size and take the largest
    candidates.sort((a, b) => b.size - a.size);

    if (candidates.length > 0) {
      const largest = candidates[0];
      lcpElement = largest.element;
      lcpElementSelector = generateElementSelector(largest.element);
      lcpElementInfo = {
        tagName: largest.element.tagName,
        id: largest.element.id || null,
        className: largest.element.className || null,
        src: largest.element.src || null,
        alt: largest.element.alt || null,
        textContent: largest.element.textContent
          ? largest.element.textContent.substring(0, 100)
          : null,
        size: largest.size,
        loadTime: 0,
        renderTime: 0,
        url: largest.element.src || null,
        fallback: true,
      };

      console.log("🎯 Fallback LCP element found:", {
        selector: lcpElementSelector,
        element: lcpElementInfo,
        type: largest.type,
      });
    } else {
      console.warn("❌ No suitable LCP element candidates found");
    }
  } catch (error) {
    console.error("Error in LCP fallback detection:", error);
  }
}

// Highlight the LCP element in the DOM
function highlightLCPElement() {
  try {
    // Clear any existing highlights
    clearLCPHighlight();

    if (!lcpElement || !document.contains(lcpElement)) {
      return {
        success: false,
        error: "LCP element not found or no longer in DOM",
        selector: lcpElementSelector,
        elementInfo: lcpElementInfo,
      };
    }

    // Create highlight overlay
    const highlight = document.createElement("div");
    highlight.id = "lcp-element-highlight";
    highlight.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: 999999;
      border: 3px solid #ff6b6b;
      background: rgba(255, 107, 107, 0.1);
      box-shadow: 0 0 0 2px rgba(255, 107, 107, 0.3);
      transition: all 0.3s ease;
    `;

    // Position the highlight over the LCP element
    const rect = lcpElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    highlight.style.top = rect.top + scrollTop + "px";
    highlight.style.left = rect.left + scrollLeft + "px";
    highlight.style.width = rect.width + "px";
    highlight.style.height = rect.height + "px";

    // Add label
    const label = document.createElement("div");
    label.style.cssText = `
      position: absolute;
      top: -30px;
      left: 0;
      background: #ff6b6b;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      white-space: nowrap;
      font-family: monospace;
    `;
    label.textContent = `LCP Element (${LCPTime.toFixed(2)}s)`;
    highlight.appendChild(label);

    document.body.appendChild(highlight);

    // Scroll element into view
    lcpElement.scrollIntoView({ behavior: "smooth", block: "center" });

    // Remove highlight after 5 seconds
    setTimeout(() => {
      clearLCPHighlight();
    }, 5000);

    // Log to console for developers
    console.group("🎯 LCP Element Details");
    console.log("Element:", lcpElement);
    console.log("Selector:", lcpElementSelector);
    console.log("LCP Time:", LCPTime + "s");
    console.log("Element Info:", lcpElementInfo);
    console.groupEnd();

    return {
      success: true,
      selector: lcpElementSelector,
      elementInfo: lcpElementInfo,
      lcpTime: LCPTime,
    };
  } catch (error) {
    console.error("Error highlighting LCP element:", error);
    return {
      success: false,
      error: error.message,
      selector: lcpElementSelector,
      elementInfo: lcpElementInfo,
    };
  }
}

// Clear LCP element highlight
function clearLCPHighlight() {
  const existing = document.getElementById("lcp-element-highlight");
  if (existing) {
    existing.remove();
  }
}

// Enhanced CLS debugger synchronization
function syncCLSDebugger() {
  try {
    if (clsDebugger && CLSScore !== clsDebugger.currentCLS) {
      clsDebugger.updateCLSScore(CLSScore);

      // Validate synchronization
      if (Math.abs(clsDebugger.currentCLS - CLSScore) > 0.001) {
        console.warn("CLS debugger synchronization failed", {
          expected: CLSScore,
          actual: clsDebugger.currentCLS,
        });
      }
    }
  } catch (error) {
    console.error("Error synchronizing CLS debugger:", error);
  }
}

// Restore CLS debugger state on page load
function restoreCLSDebuggerState() {
  // Get current tab ID and restore state
  chrome.runtime.sendMessage({ type: "getCurrentTabId" }, (response) => {
    if (response && response.tabId) {
      chrome.storage.local.get([`clsDebugger_${response.tabId}`], (data) => {
        const wasEnabled = data[`clsDebugger_${response.tabId}`];
        if (wasEnabled) {
          clsDebugger.enableVisualDebugging();
        }
      });
    }
  });
}

// Initialize CLS debugger state restoration
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", restoreCLSDebuggerState);
} else {
  restoreCLSDebuggerState();
}
// Start initial metrics collection if properly initialized
if (isInitialized) {
  console.log("Starting initial metrics collection...");

  // Send loading state
  chrome.runtime.sendMessage({ type: "metricsLoading" });

  // Start metrics collection after a brief delay to allow page to settle
  setTimeout(() => {
    try {
      collectMetrics();
    } catch (error) {
      console.error("Error in initial metrics collection:", error);
      sendErrorToBackground("initial_collection_error", error.message);
    }
  }, 1000);
} else {
  console.log(
    "Initial metrics collection skipped - page not supported or permissions insufficient"
  );
}
