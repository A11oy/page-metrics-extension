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

// Validate navigation entry data with more lenient validation
function validateNavigationEntry(entry) {
  try {
    if (!entry) {
      console.warn("Navigation entry is null or undefined");
      return false;
    }

    // Check for basic timing properties (more lenient approach)
    const basicProps = ["startTime", "responseStart"];
    for (const prop of basicProps) {
      if (typeof entry[prop] !== "number") {
        console.warn(`Navigation entry missing basic property: ${prop}`);
        return false;
      }
    }

    // Only validate timing order if both values are valid numbers
    if (typeof entry.responseStart === "number" && typeof entry.startTime === "number") {
      if (entry.responseStart < entry.startTime && entry.responseStart > 0) {
        console.warn("Invalid timing order: responseStart < startTime");
        return false;
      }
    }

    // More lenient validation - don't fail if some properties are missing
    console.log("Navigation entry validation passed");
    return true;
  } catch (error) {
    console.error("Error validating navigation entry:", error);
    // Don't fail completely on validation errors
    return true; // Allow processing to continue
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

// Detect page reloads and clear extension state
let pageLoadStartTime = Date.now();
let isPageReload = false;

// Check if this is a page reload (not SPA navigation)
function detectPageReload() {
  // Check if the page was loaded recently (within last 2 seconds)
  const timeSinceLoad = Date.now() - pageLoadStartTime;

  // Check performance navigation type
  const navigationEntries = performance.getEntriesByType("navigation");
  if (navigationEntries.length > 0) {
    const navEntry = navigationEntries[0];
    isPageReload = navEntry.type === "reload" || navEntry.type === "navigate";

    if (isPageReload) {
      console.log("Page reload detected, resetting all extension state");
      resetAndCollectMetrics(false, "page_reload");
    }
  }

  return isPageReload;
}

// Send loading state immediately when script starts
chrome.runtime.sendMessage({ type: "metricsLoading" });

// Listen for page load events
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOMContentLoaded event - checking for page reload");
  detectPageReload();
});

// Also check on window load
window.addEventListener("load", () => {
  console.log("Window load event - checking for page reload");
  detectPageReload();
});

// Add a simple test function to trigger performance analysis
window.testPerformanceAnalysis = function () {
  console.log("=== Testing Performance Analysis ===");

  try {
    // Test direct DOM analysis
    const headScripts = document.head ? document.head.querySelectorAll("script") : [];
    const headLinks = document.head ? document.head.querySelectorAll("link") : [];

    console.log("DOM Elements Found:", {
      headScripts: headScripts.length,
      headLinks: headLinks.length,
      deferScripts: Array.from(headScripts).filter((s) => s.hasAttribute("defer")).length,
      asyncScripts: Array.from(headScripts).filter((s) => s.hasAttribute("async")).length,
      stylesheets: Array.from(headLinks).filter((l) => l.rel && l.rel.includes("stylesheet"))
        .length,
      preloads: Array.from(headLinks).filter((l) => l.rel === "preload").length,
    });

    // Test performance recommendations if available
    if (typeof PerformanceRecommendationAnalyzer !== "undefined") {
      const analyzer = new PerformanceRecommendationAnalyzer();
      console.log("Starting performance analysis...");

      analyzer
        .analyzePerformance()
        .then((results) => {
          console.log("✅ Performance Analysis Results:", results);
        })
        .catch((error) => {
          console.error("❌ Performance Analysis Failed:", error);
        });
    } else {
      console.log("PerformanceRecommendationAnalyzer not available");
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
};

// Add a test function specifically for cache analysis
window.testCacheAnalysis = function () {
  console.log("=== Testing Cache Analysis ===");

  try {
    if (typeof PerformanceRecommendationAnalyzer !== "undefined") {
      const analyzer = new PerformanceRecommendationAnalyzer();

      console.log("Testing header fetching...");
      analyzer
        .tryFetchActualHeaders()
        .then((headers) => {
          console.log("Headers fetched:", headers);

          if (headers) {
            return analyzer.analyzeCacheHeaders(headers);
          } else {
            console.log("No headers available, testing fallback...");
            return analyzer.analyzeCacheHeaders(null);
          }
        })
        .then((cacheResults) => {
          console.log("✅ Cache Analysis Results:", cacheResults);
        })
        .catch((error) => {
          console.error("❌ Cache Analysis Failed:", error);
        });

      // Also test the integrated cache analysis method
      console.log("Testing integrated cache analysis...");
      analyzer
        .analyzeCache()
        .then((integratedResults) => {
          console.log("✅ Integrated Cache Analysis Results:", integratedResults);
        })
        .catch((error) => {
          console.error("❌ Integrated Cache Analysis Failed:", error);
        });
    } else {
      console.log("PerformanceRecommendationAnalyzer not available");
    }
  } catch (error) {
    console.error("Cache test failed:", error);
  }
};

// Test function for debugging DOM analysis
window.testDOMAnalysis = function () {
  console.log("=== DOM Analysis Test ===");

  // Test direct DOM queries
  const headScripts = document.head ? document.head.querySelectorAll("script") : [];
  const headLinks = document.head ? document.head.querySelectorAll("link") : [];
  const bodyScripts = document.body ? document.body.querySelectorAll("script") : [];

  console.log("Direct DOM queries:", {
    headScripts: headScripts.length,
    headLinks: headLinks.length,
    bodyScripts: bodyScripts.length,
  });

  // Test script attributes
  console.log("Head scripts details:");
  Array.from(headScripts).forEach((script, i) => {
    console.log(`Script ${i}:`, {
      src: script.src || "(inline)",
      defer: script.defer,
      async: script.async,
      type: script.type,
      hasDefer: script.hasAttribute("defer"),
      hasAsync: script.hasAttribute("async"),
    });
  });

  // Test link attributes
  console.log("Head links details:");
  Array.from(headLinks)
    .slice(0, 5)
    .forEach((link, i) => {
      console.log(`Link ${i}:`, {
        href: link.href,
        rel: link.rel,
        as: link.getAttribute("as"),
        type: link.type,
      });
    });
};

if (validatePageAndInitialize()) {
  console.log("Initializing performance measurement...");

  // Send loading state to background
  chrome.runtime.sendMessage({ type: "metricsLoading" });

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
  // Send error state for unsupported pages
  chrome.runtime.sendMessage({
    type: "metricsError",
    errorType: "page_not_supported",
    errorMessage: "Page type not supported for performance measurement",
  });
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

// Performance Recommendation Analyzer
class PerformanceRecommendationAnalyzer {
  constructor() {
    this.analysisResults = {};
    this.isAnalyzing = false;
    this.htmlContent = null;
    this.responseHeaders = null;
    this.analysisTimeout = 30000; // 30 second timeout for entire analysis
    this.analysisStartTime = null;
    this.currentPhase = null;
    this.abortController = null;

    // Analysis caching and optimization
    this.analysisCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache timeout
    this.lastAnalysisUrl = null;
    this.lastAnalysisTimestamp = null;
    this.pageChangeDetector = {
      lastDOMHash: null,
      lastContentLength: null,
      lastTitle: null,
      lastMetaDescription: null,
    };

    // Performance optimizations
    this.maxCacheSize = 10; // Maximum number of cached analyses
    this.analysisState = {
      isRunning: false,
      currentProgress: 0,
      totalPhases: 8,
      completedPhases: [],
      errors: [],
      warnings: [],
    };
  }

  // Main analysis orchestrator with comprehensive error handling and timeout management
  async analyzePerformance() {
    if (this.isAnalyzing) {
      throw new Error("Analysis already in progress");
    }

    // Check for cached results first
    const cachedResults = this.getCachedAnalysis();
    if (cachedResults) {
      console.log("Returning cached analysis results");
      this.analysisResults = cachedResults;

      // Send cached results to background
      chrome.runtime.sendMessage({
        type: "recommendationsGenerated",
        data: cachedResults,
        cached: true,
        success: true,
      });

      return cachedResults;
    }

    this.isAnalyzing = true;
    this.analysisStartTime = Date.now();
    this.abortController = new AbortController();
    this.resetAnalysisState();
    this.analysisState.isRunning = true;

    // Set up analysis timeout
    const timeoutId = setTimeout(() => {
      this.abortController.abort();
    }, this.analysisTimeout);

    try {
      console.log("Starting comprehensive performance analysis...");

      // Send loading state to background
      chrome.runtime.sendMessage({
        type: "recommendationsLoading",
        phase: "starting",
      });

      const results = {
        metadata: {
          url: window.location.href,
          timestamp: Date.now(),
          analysisVersion: "2.0",
          pageLoadType: "navigation",
          userAgent: navigator.userAgent,
        },
        cache: null,
        lcp: null,
        scripts: null,
        links: null,
        css: null,
        summary: null,
        analysisErrors: [],
        analysisWarnings: [],
      };

      // Phase 1: Fetch and parse HTML document
      this.currentPhase = "html_fetch";
      console.log("Phase 1: Fetching HTML document...");
      this.updateAnalysisProgress("html_fetch", 12.5);

      let htmlData;
      try {
        htmlData = await this.fetchDocumentHTML();
        if (htmlData.fallbackUsed) {
          results.analysisWarnings.push({
            phase: "html_fetch",
            message: `Used fallback HTML: ${htmlData.fallbackReason}`,
            impact: "Cache analysis may be limited",
          });
        }
      } catch (error) {
        throw new Error(`HTML fetch failed: ${error.message}`);
      }

      // Phase 2: Parse HTML structure
      this.currentPhase = "html_parse";
      console.log("Phase 2: Parsing HTML structure...");
      this.updateAnalysisProgress("html_parse", 25);

      let parseData;
      try {
        parseData = this.parseHTMLStructure(); // No parameter needed - analyzes live DOM
        if (parseData.parseError) {
          results.analysisWarnings.push({
            phase: "html_parse",
            message: `HTML parsing issues: ${parseData.parseError}`,
            impact: "Some elements may not be detected",
          });
        }
      } catch (error) {
        throw new Error(`HTML parsing failed: ${error.message}`);
      }

      // Phase 3: Cache analysis
      this.currentPhase = "cache_analysis";
      console.log("Phase 3: Analyzing cache headers...");
      this.updateAnalysisProgress("cache_analysis", 37.5);

      try {
        results.cache = await this.analyzeCacheHeaders(htmlData.headers);
      } catch (error) {
        console.warn("Cache analysis failed:", error);
        results.analysisErrors.push({
          phase: "cache_analysis",
          error: error.message,
          impact: "Cache recommendations unavailable",
        });
        results.cache = this.getEmptyCacheAnalysis();
      }

      // Phase 4: LCP analysis
      this.currentPhase = "lcp_analysis";
      console.log("Phase 4: Analyzing LCP elements...");
      this.updateAnalysisProgress("lcp_analysis", 50);

      try {
        results.lcp = await this.analyzeLCPElement(parseData.structure);
      } catch (error) {
        console.warn("LCP analysis failed:", error);
        results.analysisErrors.push({
          phase: "lcp_analysis",
          error: error.message,
          impact: "LCP recommendations unavailable",
        });
        results.lcp = this.getEmptyLCPAnalysis();
      }

      // Phase 5: Script analysis
      this.currentPhase = "script_analysis";
      console.log("Phase 5: Analyzing scripts...");
      this.updateAnalysisProgress("script_analysis", 62.5);

      try {
        console.log("Debug: Structure passed to analyzeScripts:", {
          hasStructure: !!parseData.structure,
          hasHead: !!(parseData.structure && parseData.structure.head),
          hasBody: !!(parseData.structure && parseData.structure.body),
          headScripts:
            parseData.structure && parseData.structure.head && parseData.structure.head.scripts
              ? parseData.structure.head.scripts.length
              : 0,
          bodyScripts:
            parseData.structure && parseData.structure.body && parseData.structure.body.scripts
              ? parseData.structure.body.scripts.length
              : 0,
        });
        results.scripts = await this.analyzeScripts(parseData.structure);
      } catch (error) {
        console.warn("Script analysis failed:", error);
        results.analysisErrors.push({
          phase: "script_analysis",
          error: error.message,
          impact: "Script recommendations unavailable",
        });
        results.scripts = this.getEmptyScriptAnalysis();
      }

      // Phase 6: Link analysis
      this.currentPhase = "link_analysis";
      console.log("Phase 6: Analyzing link tags...");
      this.updateAnalysisProgress("link_analysis", 75);

      try {
        console.log("Debug: Structure passed to analyzeLinks:", {
          hasStructure: !!parseData.structure,
          hasHead: !!(parseData.structure && parseData.structure.head),
          hasBody: !!(parseData.structure && parseData.structure.body),
          headLinks:
            parseData.structure && parseData.structure.head && parseData.structure.head.links
              ? parseData.structure.head.links.length
              : 0,
          bodyLinks:
            parseData.structure && parseData.structure.body && parseData.structure.body.links
              ? parseData.structure.body.links.length
              : 0,
        });
        results.links = await this.analyzeLinks(parseData.structure);
      } catch (error) {
        console.warn("Link analysis failed:", error);
        results.analysisErrors.push({
          phase: "link_analysis",
          error: error.message,
          impact: "Link recommendations unavailable",
        });
        results.links = this.getEmptyLinkAnalysis();
      }

      // Phase 7: CSS analysis
      this.currentPhase = "css_analysis";
      console.log("Phase 7: Analyzing CSS...");
      this.updateAnalysisProgress("css_analysis", 87.5);

      try {
        console.log("Debug: Structure passed to analyzeCSS:", {
          hasStructure: !!parseData.structure,
          hasHead: !!(parseData.structure && parseData.structure.head),
          hasBody: !!(parseData.structure && parseData.structure.body),
          headLinks:
            parseData.structure && parseData.structure.head && parseData.structure.head.links
              ? parseData.structure.head.links.length
              : 0,
          bodyLinks:
            parseData.structure && parseData.structure.body && parseData.structure.body.links
              ? parseData.structure.body.links.length
              : 0,
        });
        results.css = await this.analyzeCSS(parseData.structure);
      } catch (error) {
        console.warn("CSS analysis failed:", error);
        results.analysisErrors.push({
          phase: "css_analysis",
          error: error.message,
          impact: "CSS recommendations unavailable",
        });
        results.css = this.getEmptyCSSAnalysis();
      }

      // Phase 8: Generate summary
      this.currentPhase = "summary_generation";
      console.log("Phase 8: Generating summary...");
      this.updateAnalysisProgress("summary_generation", 100);

      try {
        results.summary = this.generateSummary(results);
      } catch (error) {
        console.warn("Summary generation failed:", error);
        results.analysisErrors.push({
          phase: "summary_generation",
          error: error.message,
          impact: "Summary may be incomplete",
        });
        results.summary = this.getEmptySummary();
      }

      // Clear timeout
      clearTimeout(timeoutId);

      const totalDuration = Date.now() - this.analysisStartTime;
      console.log(`Performance analysis completed successfully in ${totalDuration}ms`);

      // Add analysis metadata
      results.metadata.analysisDuration = totalDuration;
      results.metadata.completedPhases = this.currentPhase;
      results.metadata.hasErrors = results.analysisErrors.length > 0;
      results.metadata.hasWarnings = results.analysisWarnings.length > 0;

      // Cache the successful analysis results
      this.setCachedAnalysis(results);

      this.analysisResults = results;
      return results;
    } catch (error) {
      clearTimeout(timeoutId);

      const totalDuration = Date.now() - this.analysisStartTime;
      const isTimeout = error.name === "AbortError" || error.message.includes("timeout");

      console.error(
        `Performance analysis failed after ${totalDuration}ms in phase ${this.currentPhase}:`,
        error
      );

      // Create error result
      const errorResult = {
        metadata: {
          url: window.location.href,
          timestamp: Date.now(),
          analysisVersion: "2.0",
          pageLoadType: "navigation",
          userAgent: navigator.userAgent,
          analysisDuration: totalDuration,
          failedPhase: this.currentPhase,
          analysisAborted: isTimeout,
        },
        error: {
          code: isTimeout ? "ANALYSIS_TIMEOUT" : "ANALYSIS_FAILED",
          message: isTimeout
            ? `Analysis timed out after ${this.analysisTimeout / 1000} seconds in ${
                this.currentPhase
              } phase`
            : error.message,
          phase: this.currentPhase,
          duration: totalDuration,
        },
      };

      // Send error to background
      this.sendAnalysisError("analysis_failed", errorResult.error);

      throw error;
    } finally {
      this.isAnalyzing = false;
      this.currentPhase = null;
      this.abortController = null;
      this.analysisState.isRunning = false;
    }
  }

  // Analysis caching and optimization methods

  // Check if cached analysis is available and valid
  getCachedAnalysis(url = window.location.href) {
    try {
      const cacheKey = this.generateCacheKey(url);
      const cached = this.analysisCache.get(cacheKey);

      if (!cached) {
        console.log("No cached analysis found for URL:", url);
        return null;
      }

      const now = Date.now();
      const isExpired = now - cached.timestamp > this.cacheTimeout;

      if (isExpired) {
        console.log("Cached analysis expired, removing from cache");
        this.analysisCache.delete(cacheKey);
        return null;
      }

      // Check if page has changed since analysis
      if (this.hasPageChanged(cached.pageSignature)) {
        console.log("Page content changed, invalidating cache");
        this.analysisCache.delete(cacheKey);
        return null;
      }

      console.log("Using cached analysis from", new Date(cached.timestamp).toISOString());
      return cached.results;
    } catch (error) {
      console.warn("Error retrieving cached analysis:", error);
      return null;
    }
  }

  // Store analysis results in cache
  setCachedAnalysis(results, url = window.location.href) {
    try {
      const cacheKey = this.generateCacheKey(url);
      const pageSignature = this.generatePageSignature();

      const cacheEntry = {
        results: results,
        timestamp: Date.now(),
        url: url,
        pageSignature: pageSignature,
        analysisVersion: results.metadata?.analysisVersion || "2.0",
      };

      // Implement cache size limit
      if (this.analysisCache.size >= this.maxCacheSize) {
        this.evictOldestCacheEntry();
      }

      this.analysisCache.set(cacheKey, cacheEntry);
      console.log("Analysis results cached for URL:", url);

      // Update tracking variables
      this.lastAnalysisUrl = url;
      this.lastAnalysisTimestamp = Date.now();
    } catch (error) {
      console.warn("Error caching analysis results:", error);
    }
  }

  // Generate cache key for URL
  generateCacheKey(url) {
    try {
      // Use URL without hash and query params for caching
      const urlObj = new URL(url);
      const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;

      // Create a simple hash of the base URL
      let hash = 0;
      for (let i = 0; i < baseUrl.length; i++) {
        const char = baseUrl.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
      }

      return `analysis_${Math.abs(hash)}`;
    } catch (error) {
      console.warn("Error generating cache key:", error);
      return `analysis_${Date.now()}`;
    }
  }

  // Generate page signature for change detection
  generatePageSignature() {
    try {
      const signature = {
        domHash: this.calculateDOMHash(),
        contentLength: document.documentElement.outerHTML.length,
        title: document.title || "",
        metaDescription: this.getMetaDescription(),
        timestamp: Date.now(),
      };

      // Update page change detector
      this.pageChangeDetector = {
        lastDOMHash: signature.domHash,
        lastContentLength: signature.contentLength,
        lastTitle: signature.title,
        lastMetaDescription: signature.metaDescription,
      };

      return signature;
    } catch (error) {
      console.warn("Error generating page signature:", error);
      return {
        domHash: Date.now(),
        contentLength: 0,
        title: "",
        metaDescription: "",
        timestamp: Date.now(),
      };
    }
  }

  // Check if page has changed since last analysis
  hasPageChanged(cachedSignature) {
    try {
      if (!cachedSignature) return true;

      const currentSignature = this.generatePageSignature();

      // Compare key indicators of page change
      const hasChanged =
        currentSignature.domHash !== cachedSignature.domHash ||
        Math.abs(currentSignature.contentLength - cachedSignature.contentLength) > 1000 ||
        currentSignature.title !== cachedSignature.title ||
        currentSignature.metaDescription !== cachedSignature.metaDescription;

      if (hasChanged) {
        console.log("Page change detected:", {
          domHashChanged: currentSignature.domHash !== cachedSignature.domHash,
          contentLengthDiff: Math.abs(
            currentSignature.contentLength - cachedSignature.contentLength
          ),
          titleChanged: currentSignature.title !== cachedSignature.title,
          metaChanged: currentSignature.metaDescription !== cachedSignature.metaDescription,
        });
      }

      return hasChanged;
    } catch (error) {
      console.warn("Error checking page changes:", error);
      return true; // Assume changed if we can't determine
    }
  }

  // Calculate a simple hash of DOM structure
  calculateDOMHash() {
    try {
      // Get key structural elements for hashing
      const elements = document.querySelectorAll(
        'script[src], link[rel="stylesheet"], img[src], meta[name="description"]'
      );
      let hashString = "";

      elements.forEach((el) => {
        if (el.tagName === "SCRIPT" && el.src) {
          hashString += `script:${el.src}`;
        } else if (el.tagName === "LINK" && el.href) {
          hashString += `link:${el.href}`;
        } else if (el.tagName === "IMG" && el.src) {
          hashString += `img:${el.src}`;
        } else if (el.tagName === "META" && el.content) {
          hashString += `meta:${el.content}`;
        }
      });

      // Add document title and basic structure
      hashString += `title:${document.title}`;
      hashString += `scripts:${document.scripts.length}`;
      hashString += `links:${document.links.length}`;

      // Generate simple hash
      let hash = 0;
      for (let i = 0; i < hashString.length; i++) {
        const char = hashString.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }

      return Math.abs(hash);
    } catch (error) {
      console.warn("Error calculating DOM hash:", error);
      return Date.now(); // Fallback to timestamp
    }
  }

  // Get meta description for change detection
  getMetaDescription() {
    try {
      const metaDesc = document.querySelector('meta[name="description"]');
      return metaDesc ? metaDesc.getAttribute("content") || "" : "";
    } catch (error) {
      return "";
    }
  }

  // Evict oldest cache entry when cache is full
  evictOldestCacheEntry() {
    try {
      let oldestKey = null;
      let oldestTimestamp = Date.now();

      for (const [key, entry] of this.analysisCache.entries()) {
        if (entry.timestamp < oldestTimestamp) {
          oldestTimestamp = entry.timestamp;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.analysisCache.delete(oldestKey);
        console.log("Evicted oldest cache entry:", oldestKey);
      }
    } catch (error) {
      console.warn("Error evicting cache entry:", error);
    }
  }

  // Clear analysis cache
  clearCache() {
    try {
      this.analysisCache.clear();
      console.log("Analysis cache cleared");
    } catch (error) {
      console.warn("Error clearing cache:", error);
    }
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.analysisCache.size,
      maxSize: this.maxCacheSize,
      cacheTimeout: this.cacheTimeout,
      lastAnalysisUrl: this.lastAnalysisUrl,
      lastAnalysisTimestamp: this.lastAnalysisTimestamp,
    };
  }

  // Update analysis state and progress tracking
  updateAnalysisProgress(phase, progress = null) {
    try {
      this.analysisState.currentProgress =
        progress ||
        (this.analysisState.completedPhases.length / this.analysisState.totalPhases) * 100;

      if (phase && !this.analysisState.completedPhases.includes(phase)) {
        this.analysisState.completedPhases.push(phase);
      }

      // Send progress update to background
      chrome.runtime.sendMessage({
        type: "recommendationsProgress",
        phase: phase,
        progress: this.analysisState.currentProgress,
        completedPhases: this.analysisState.completedPhases.length,
        totalPhases: this.analysisState.totalPhases,
      });
    } catch (error) {
      console.warn("Error updating analysis progress:", error);
    }
  }

  // Reset analysis state
  resetAnalysisState() {
    this.analysisState = {
      isRunning: false,
      currentProgress: 0,
      totalPhases: 8,
      completedPhases: [],
      errors: [],
      warnings: [],
    };
  }

  // Send analysis error to background script
  sendAnalysisError(errorType, errorDetails) {
    try {
      chrome.runtime.sendMessage({
        type: "recommendationsError",
        error: {
          code: errorType.toUpperCase(),
          message: errorDetails.originalError || errorDetails.error || "Unknown error",
          details: errorDetails,
          timestamp: Date.now(),
          url: window.location.href,
          phase: this.currentPhase,
        },
      });
    } catch (error) {
      console.warn("Failed to send analysis error to background:", error);
    }
  }

  // Empty analysis result generators for error recovery
  getEmptyCacheAnalysis() {
    return {
      browserCache: {
        status: "unknown",
        ttl: null,
        cacheControl: null,
        expires: null,
      },
      cdnCache: {
        status: "unknown",
        provider: "unknown",
        ttl: null,
        age: null,
        cacheHeaders: {},
      },
    };
  }

  getEmptyLCPAnalysis() {
    return {
      elementFound: false,
      serverSideRendered: false,
      elementType: null,
      elementSelector: null,
      preloadExists: false,
    };
  }

  getEmptyScriptAnalysis() {
    return {
      duplicates: [],
      deferScripts: [],
      asyncScripts: [],
      totalExternalScripts: 0,
      recommendations: [],
    };
  }

  getEmptyLinkAnalysis() {
    return {
      bodyLinks: [],
      duplicatePreloads: [],
      invalidPreloads: [],
      redundantPreloads: [],
      totalPreloads: 0,
    };
  }

  getEmptyCSSAnalysis() {
    return {
      stylesheets: [],
      totalStylesheets: 0,
      misplacedCount: 0,
    };
  }

  getEmptySummary() {
    return {
      totalIssues: 0,
      criticalIssues: 0,
      optimizationOpportunities: 0,
      overallScore: "unknown",
    };
  }

  // Enhanced cache analysis with error handling
  async analyzeCacheHeaders(headers = null) {
    try {
      const responseHeaders = headers || this.responseHeaders || {};

      console.log("Analyzing cache headers...", responseHeaders);

      const result = {
        browserCache: {
          status: "not-analyzed",
          ttl: null,
          cacheControl: null,
          expires: null,
        },
        cdnCache: {
          status: "not-analyzed",
          provider: "unknown",
          ttl: null,
          age: null,
          cacheHeaders: {},
        },
      };

      // Check if we have any headers to analyze
      if (!responseHeaders || Object.keys(responseHeaders).length === 0) {
        console.warn("No response headers available for cache analysis");
        result.browserCache.status = "not-analyzed";
        result.cdnCache.status = "not-analyzed";
        return result;
      }

      // Check if this is fallback data
      if (responseHeaders.fallback) {
        console.log("Using fallback header data for cache analysis");

        // Try to infer cache status from available data
        if (responseHeaders.cache && responseHeaders.cache.general) {
          const generalCache = responseHeaders.cache.general;

          // Check for inferred cache status
          if (generalCache["x-inferred-cache"] === "likely-cached") {
            result.browserCache.status = "cached";
            result.browserCache.cacheControl = "inferred from timing";
          }
        }

        // If we still don't have cache info, mark as not-cached rather than not-analyzed
        if (result.browserCache.status === "not-analyzed") {
          result.browserCache.status = "not-cached";
        }
        if (result.cdnCache.status === "not-analyzed") {
          result.cdnCache.status = "unknown";
        }

        return result;
      }

      // Handle different header formats
      let headerSource = responseHeaders;
      if (responseHeaders.raw) {
        headerSource = responseHeaders.raw;
      } else if (responseHeaders.cache) {
        // Use categorized headers if available
        const browserHeaders = responseHeaders.cache.browserCache || {};
        const cdnHeaders = responseHeaders.cache.cdnCache || {};

        // Analyze browser cache from categorized headers
        if (Object.keys(browserHeaders).length > 0) {
          result.browserCache = this.analyzeBrowserCacheFromHeaders(browserHeaders);
        }

        // Analyze CDN cache from categorized headers
        if (Object.keys(cdnHeaders).length > 0) {
          result.cdnCache = this.analyzeCDNCacheFromHeaders(cdnHeaders);
        }

        return result;
      }

      // Safely extract headers from raw headers
      const cacheControl = this.safeGetHeader(headerSource, "cache-control");
      const expires = this.safeGetHeader(headerSource, "expires");
      const age = this.safeGetHeader(headerSource, "age");

      console.log("Extracted cache headers:", { cacheControl, expires, age });

      // Browser cache analysis
      if (cacheControl || expires) {
        result.browserCache.status = "cached";
        result.browserCache.cacheControl = cacheControl;
        result.browserCache.expires = expires;

        // Extract TTL from cache-control
        if (cacheControl) {
          const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
          if (maxAgeMatch) {
            result.browserCache.ttl = parseInt(maxAgeMatch[1]);
          }
        }
      } else {
        result.browserCache.status = "not-cached";
      }

      // CDN cache analysis with error handling
      try {
        const cdnAnalysis = this.analyzeCDNHeaders(headerSource);
        result.cdnCache = { ...result.cdnCache, ...cdnAnalysis };
      } catch (cdnError) {
        console.warn("CDN analysis failed:", cdnError);
      }

      console.log("Cache analysis result:", result);
      return result;
    } catch (error) {
      console.error("Cache header analysis failed:", error);
      throw new Error(`Cache analysis error: ${error.message}`);
    }
  }

  // Analyze browser cache from categorized headers
  analyzeBrowserCacheFromHeaders(browserHeaders) {
    const result = {
      status: "not-cached",
      ttl: null,
      cacheControl: null,
      expires: null,
    };

    const cacheControl = browserHeaders["cache-control"];
    const expires = browserHeaders["expires"];

    if (cacheControl || expires) {
      result.status = "cached";
      result.cacheControl = cacheControl;
      result.expires = expires;

      // Extract TTL from cache-control
      if (cacheControl) {
        const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
        if (maxAgeMatch) {
          result.ttl = parseInt(maxAgeMatch[1]);
        }
      }
    }

    return result;
  }

  // Analyze CDN cache from categorized headers
  analyzeCDNCacheFromHeaders(cdnHeaders) {
    const result = {
      status: "unknown",
      provider: "unknown",
      ttl: null,
      age: null,
      cacheHeaders: cdnHeaders,
    };

    // Detect CDN provider and status
    if (cdnHeaders["cf-cache-status"]) {
      result.provider = "cloudflare";
      result.status = cdnHeaders["cf-cache-status"].toLowerCase().includes("hit") ? "hit" : "miss";
    } else if (cdnHeaders["x-amz-cf-id"]) {
      result.provider = "aws";
      result.status = cdnHeaders["age"] && parseInt(cdnHeaders["age"]) > 0 ? "hit" : "miss";
    } else if (cdnHeaders["x-cache"]) {
      if (cdnHeaders["x-cache"].toLowerCase().includes("akamai")) {
        result.provider = "akamai";
      } else if (cdnHeaders["x-served-by"] && cdnHeaders["x-served-by"].includes("fastly")) {
        result.provider = "fastly";
      }
      result.status = cdnHeaders["x-cache"].toLowerCase().includes("hit") ? "hit" : "miss";
    }

    // Extract age/TTL
    if (cdnHeaders["age"]) {
      const ageValue = parseInt(cdnHeaders["age"]);
      if (!isNaN(ageValue)) {
        result.age = ageValue;
      }
    }

    return result;
  }

  // Safe header extraction
  safeGetHeader(headers, name) {
    try {
      if (!headers || typeof headers !== "object") {
        return null;
      }

      // Handle both Headers object and plain object
      if (headers.get && typeof headers.get === "function") {
        return headers.get(name);
      } else {
        return headers[name] || headers[name.toLowerCase()] || null;
      }
    } catch (error) {
      console.warn(`Error getting header "${name}":`, error);
      return null;
    }
  }

  // CDN header analysis with comprehensive provider detection
  analyzeCDNHeaders(headers) {
    const result = {
      status: "unknown",
      provider: "unknown",
      ttl: null,
      age: null,
      cacheHeaders: {},
    };

    try {
      // Collect CDN-related headers
      const cdnHeaders = {
        age: this.safeGetHeader(headers, "age"),
        xCache: this.safeGetHeader(headers, "x-cache"),
        xCacheHits: this.safeGetHeader(headers, "x-cache-hits"),
        cfCacheStatus: this.safeGetHeader(headers, "cf-cache-status"),
        xServedBy: this.safeGetHeader(headers, "x-served-by"),
        xAmzCfId: this.safeGetHeader(headers, "x-amz-cf-id"),
        server: this.safeGetHeader(headers, "server"),
      };

      result.cacheHeaders = cdnHeaders;

      // Detect CDN provider
      if (cdnHeaders.cfCacheStatus) {
        result.provider = "cloudflare";
        result.status = cdnHeaders.cfCacheStatus.toLowerCase().includes("hit") ? "hit" : "miss";
      } else if (cdnHeaders.xAmzCfId) {
        result.provider = "aws";
        result.status = cdnHeaders.age && parseInt(cdnHeaders.age) > 0 ? "hit" : "miss";
      } else if (cdnHeaders.xCache && cdnHeaders.xCache.toLowerCase().includes("akamai")) {
        result.provider = "akamai";
        result.status = cdnHeaders.xCache.toLowerCase().includes("hit") ? "hit" : "miss";
      } else if (cdnHeaders.xServedBy && cdnHeaders.xServedBy.includes("fastly")) {
        result.provider = "fastly";
        result.status = cdnHeaders.age && parseInt(cdnHeaders.age) > 0 ? "hit" : "miss";
      }

      // Extract age/TTL
      if (cdnHeaders.age) {
        const ageValue = parseInt(cdnHeaders.age);
        if (!isNaN(ageValue)) {
          result.age = ageValue;
          if (ageValue > 0) {
            result.status = "hit";
          }
        }
      }

      return result;
    } catch (error) {
      console.warn("CDN header analysis error:", error);
      return result;
    }
  }

  // Get current DOM HTML content for analysis (optimized for SPAs)
  async fetchDocumentHTML() {
    const startTime = Date.now();

    try {
      console.log("Getting current DOM HTML content for analysis...");

      // For SPAs and modern websites, use the current DOM state
      // This ensures we analyze the fully rendered content, not just the initial server response
      this.htmlContent = document.documentElement.outerHTML;

      // Validate HTML content
      if (!this.htmlContent || this.htmlContent.length === 0) {
        throw new Error("Current DOM HTML content is empty");
      }

      if (this.htmlContent.length > 10 * 1024 * 1024) {
        // 10MB limit
        console.warn("HTML content is very large, analysis may be slow");
      }

      // Try to get actual response headers first, then fallback
      console.log("Attempting to fetch actual response headers...");
      try {
        const actualHeaders = await this.tryFetchActualHeaders();
        if (actualHeaders && Object.keys(actualHeaders).length > 0) {
          console.log("Successfully fetched actual response headers");
          this.responseHeaders = actualHeaders;
        } else {
          console.log("No actual headers available, using fallback");
          this.responseHeaders = this.extractFallbackHeaders();
        }
      } catch (headerError) {
        console.warn("Error fetching actual headers, using fallback:", headerError);
        this.responseHeaders = this.extractFallbackHeaders();
      }

      const fetchDuration = Date.now() - startTime;
      console.log(
        `DOM HTML content retrieved successfully in ${fetchDuration}ms (${this.htmlContent.length} characters)`
      );

      return {
        html: this.htmlContent,
        headers: this.responseHeaders,
        fetchDuration: fetchDuration,
        source: "current-dom", // Indicate this came from current DOM, not fetch
      };
    } catch (error) {
      const fetchDuration = Date.now() - startTime;
      console.error(`Error getting DOM HTML content after ${fetchDuration}ms:`, error);

      // Send detailed error to background
      this.sendAnalysisError("dom_html_failed", {
        originalError: error.message,
        fetchDuration: fetchDuration,
        url: window.location.href,
      });

      // Try to get at least the document body as fallback
      try {
        const bodyHTML = document.body ? document.body.outerHTML : "";
        const headHTML = document.head ? document.head.outerHTML : "";
        this.htmlContent = `<!DOCTYPE html><html>${headHTML}${bodyHTML}</html>`;

        // Try to get headers for fallback too
        try {
          const actualHeaders = await this.tryFetchActualHeaders();
          if (actualHeaders && Object.keys(actualHeaders).length > 0) {
            this.responseHeaders = actualHeaders;
          } else {
            this.responseHeaders = this.extractFallbackHeaders();
          }
        } catch (headerError) {
          this.responseHeaders = this.extractFallbackHeaders();
        }

        console.log("Using minimal DOM fallback for analysis");

        return {
          html: this.htmlContent,
          headers: this.responseHeaders,
          fetchDuration: fetchDuration,
          source: "minimal-dom-fallback",
          fallbackUsed: true,
          fallbackReason: "Could not get full DOM HTML",
        };
      } catch (fallbackError) {
        throw new Error(
          `Both DOM HTML extraction and fallback failed. Primary: ${error.message}, Fallback: ${fallbackError.message}`
        );
      }
    }
  }

  // Analyze live DOM structure directly (no HTML parsing needed)
  parseHTMLStructure(htmlContent = null) {
    const startTime = Date.now();

    try {
      console.log("Analyzing live DOM structure directly...");

      // Use the live document instead of parsing HTML string
      const doc = document;

      if (!doc) {
        throw new Error("Document not available");
      }

      if (!doc.documentElement) {
        throw new Error("Document has no document element");
      }

      // Safely extract key structural elements with error handling
      const structure = {
        head: null,
        body: null,
        scripts: [],
        links: [],
        images: [],
        videos: [],
      };

      try {
        structure.head = {
          element: doc.head,
          scripts: doc.head ? this.safeQuerySelectorAll(doc.head, "script") : [],
          links: doc.head ? this.safeQuerySelectorAll(doc.head, "link") : [],
          meta: doc.head ? this.safeQuerySelectorAll(doc.head, "meta") : [],
          preloads: doc.head ? this.safeQuerySelectorAll(doc.head, "link[rel='preload']") : [],
        };
      } catch (headError) {
        console.warn("Error analyzing head section:", headError);
        structure.head = { element: null, scripts: [], links: [], meta: [], preloads: [] };
      }

      try {
        structure.body = {
          element: doc.body,
          scripts: doc.body ? this.safeQuerySelectorAll(doc.body, "script") : [],
          links: doc.body ? this.safeQuerySelectorAll(doc.body, "link") : [],
          images: doc.body ? this.safeQuerySelectorAll(doc.body, "img[src]") : [],
          videos: doc.body ? this.safeQuerySelectorAll(doc.body, "video") : [],
        };
      } catch (bodyError) {
        console.warn("Error analyzing body section:", bodyError);
        structure.body = { element: null, scripts: [], links: [], images: [], videos: [] };
      }

      // Extract all elements for comprehensive analysis
      try {
        structure.allScripts = this.safeQuerySelectorAll(doc, "script");
        structure.allLinks = this.safeQuerySelectorAll(doc, "link");
        structure.allImages = this.safeQuerySelectorAll(doc, "img[src]");
        structure.allVideos = this.safeQuerySelectorAll(doc, "video");
      } catch (allElementsError) {
        console.warn("Error extracting all elements:", allElementsError);
        structure.allScripts = [];
        structure.allLinks = [];
        structure.allImages = [];
        structure.allVideos = [];
      }

      const parseDuration = Date.now() - startTime;
      console.log(`Live DOM structure analyzed successfully in ${parseDuration}ms`);

      // Debug logging
      console.log("DOM Analysis Results:", {
        headScripts: structure.head.scripts.length,
        headLinks: structure.head.links.length,
        headPreloads: structure.head.preloads.length,
        bodyScripts: structure.body.scripts.length,
        bodyLinks: structure.body.links.length,
        totalScripts: structure.allScripts.length,
        totalLinks: structure.allLinks.length,
      });

      return {
        structure: structure,
        document: doc,
        parseDuration: parseDuration,
        htmlLength: this.htmlContent ? this.htmlContent.length : 0,
        source: "live-dom",
      };
    } catch (error) {
      const parseDuration = Date.now() - startTime;
      console.error(`Error analyzing live DOM structure after ${parseDuration}ms:`, error);

      // Send detailed error information
      this.sendAnalysisError("dom_analysis_failed", {
        originalError: error.message,
        parseDuration: parseDuration,
        url: window.location.href,
      });

      // Return minimal structure to allow analysis to continue
      return {
        structure: {
          head: { element: null, scripts: [], links: [], meta: [], preloads: [] },
          body: { element: null, scripts: [], links: [], images: [], videos: [] },
          allScripts: [],
          allLinks: [],
          allImages: [],
          allVideos: [],
        },
        document: null,
        parseDuration: parseDuration,
        htmlLength: 0,
        parseError: error.message,
        source: "fallback",
      };
    }
  }

  // Safe querySelector wrapper with error handling
  safeQuerySelectorAll(element, selector) {
    try {
      if (!element || !element.querySelectorAll) {
        return [];
      }
      return Array.from(element.querySelectorAll(selector));
    } catch (error) {
      console.warn(`Error querying selector "${selector}":`, error);
      return [];
    }
  }

  // Extract response headers for cache analysis
  extractResponseHeaders(response) {
    try {
      console.log("Extracting response headers...");

      if (!response || !response.headers) {
        throw new Error("Invalid response object or missing headers");
      }

      const headers = {};
      let headerCount = 0;
      const maxHeaders = 100; // Prevent excessive header processing

      // Iterate through all response headers with validation
      for (const [name, value] of response.headers.entries()) {
        // Security check: limit number of headers processed
        if (headerCount >= maxHeaders) {
          console.warn(`Header limit reached (${maxHeaders}), skipping remaining headers`);
          break;
        }

        // Validate header name and value
        const validatedHeader = this.validateHeader(name, value);
        if (validatedHeader) {
          headers[validatedHeader.name] = validatedHeader.value;
          headerCount++;
        }
      }

      // Validate and categorize important headers
      const categorizedHeaders = this.categorizeHeaders(headers);

      // Add extraction metadata
      categorizedHeaders.extractionMetadata = {
        totalHeadersProcessed: headerCount,
        extractionTimestamp: Date.now(),
        responseUrl: response.url || window.location.href,
        responseStatus: response.status,
        responseStatusText: response.statusText,
      };

      console.log(`Response headers extracted successfully (${headerCount} headers)`);
      return categorizedHeaders;
    } catch (error) {
      console.error("Error extracting response headers:", error);
      return this.extractFallbackHeaders();
    }
  }

  // Categorize headers for cache analysis with enhanced validation
  categorizeHeaders(rawHeaders) {
    const categorized = {
      raw: rawHeaders,
      cache: {
        browserCache: {},
        cdnCache: {},
        general: {},
      },
      security: {},
      performance: {},
      other: {},
      validation: {
        totalHeaders: 0,
        validHeaders: 0,
        invalidHeaders: 0,
        malformedHeaders: [],
      },
    };

    // Browser cache headers
    const browserCacheHeaders = [
      "cache-control",
      "expires",
      "etag",
      "last-modified",
      "pragma",
      "vary",
      "if-modified-since",
      "if-none-match",
    ];

    // CDN cache headers (various providers)
    const cdnCacheHeaders = [
      "age",
      "x-cache",
      "x-cache-hits",
      "x-cache-status",
      "cf-cache-status",
      "cf-ray",
      "cf-edge-cache",
      "cf-request-id",
      "x-served-by",
      "x-cache-lookup",
      "x-varnish",
      "x-varnish-cache",
      "server-timing",
      "x-fastly-request-id",
      "x-fastly-cache",
      "x-amz-cf-pop",
      "x-amz-cf-id",
      "x-akamai-request-id",
    ];

    // Performance-related headers
    const performanceHeaders = [
      "content-encoding",
      "content-length",
      "transfer-encoding",
      "server-timing",
      "timing-allow-origin",
      "accept-ranges",
      "content-type",
      "x-response-time",
    ];

    // Security headers
    const securityHeaders = [
      "strict-transport-security",
      "content-security-policy",
      "x-frame-options",
      "x-content-type-options",
      "x-xss-protection",
      "referrer-policy",
      "permissions-policy",
    ];

    // Process and categorize each header
    Object.entries(rawHeaders).forEach(([name, value]) => {
      categorized.validation.totalHeaders++;

      try {
        const normalizedName = name.toLowerCase();

        // Validate header value format for specific headers
        const isValidHeader = this.validateSpecificHeader(normalizedName, value);

        if (isValidHeader) {
          categorized.validation.validHeaders++;

          // Categorize the header
          if (browserCacheHeaders.includes(normalizedName)) {
            categorized.cache.browserCache[normalizedName] = value;
          } else if (cdnCacheHeaders.includes(normalizedName)) {
            categorized.cache.cdnCache[normalizedName] = value;
          } else if (performanceHeaders.includes(normalizedName)) {
            categorized.performance[normalizedName] = value;
          } else if (securityHeaders.includes(normalizedName)) {
            categorized.security[normalizedName] = value;
          } else {
            categorized.other[normalizedName] = value;
          }
        } else {
          categorized.validation.invalidHeaders++;
          categorized.validation.malformedHeaders.push({
            name: normalizedName,
            value: value,
            reason: "Failed specific header validation",
          });
        }
      } catch (error) {
        categorized.validation.invalidHeaders++;
        categorized.validation.malformedHeaders.push({
          name: name,
          value: value,
          reason: error.message,
        });
        console.warn("Error processing header:", name, error);
      }
    });

    // Add validation summary
    console.log(
      `Header validation complete: ${categorized.validation.validHeaders}/${categorized.validation.totalHeaders} valid`
    );

    if (categorized.validation.malformedHeaders.length > 0) {
      console.warn("Malformed headers detected:", categorized.validation.malformedHeaders);
    }

    return categorized;
  }

  // Validate individual header name and value
  validateHeader(name, value) {
    try {
      // Validate header name
      if (!name || typeof name !== "string") {
        console.warn("Invalid header name:", name);
        return null;
      }

      // Normalize header name
      const normalizedName = name.toLowerCase().trim();

      // Check for valid header name format (basic validation)
      if (!/^[a-z0-9\-_]+$/.test(normalizedName)) {
        console.warn("Header name contains invalid characters:", normalizedName);
        return null;
      }

      // Validate header value
      if (value === null || value === undefined) {
        console.warn("Header has null/undefined value:", normalizedName);
        return null;
      }

      // Convert value to string and sanitize
      let sanitizedValue = String(value).trim();

      // Security check: limit header value length
      const maxValueLength = 8192; // 8KB limit per header value
      if (sanitizedValue.length > maxValueLength) {
        console.warn(
          `Header value too long (${sanitizedValue.length} chars), truncating:`,
          normalizedName
        );
        sanitizedValue = sanitizedValue.substring(0, maxValueLength) + "...[truncated]";
      }

      // Remove potentially dangerous characters (basic sanitization)
      sanitizedValue = sanitizedValue.replace(/[\x00-\x1f\x7f-\x9f]/g, "");

      return {
        name: normalizedName,
        value: sanitizedValue,
      };
    } catch (error) {
      console.warn("Error validating header:", error);
      return null;
    }
  }

  // Validate specific header formats
  validateSpecificHeader(headerName, headerValue) {
    try {
      switch (headerName) {
        case "cache-control":
          return this.validateCacheControlHeader(headerValue);

        case "expires":
          return this.validateExpiresHeader(headerValue);

        case "age":
          return this.validateAgeHeader(headerValue);

        case "content-length":
          return this.validateContentLengthHeader(headerValue);

        case "etag":
          return this.validateETagHeader(headerValue);

        default:
          // For unknown headers, just check basic format
          return typeof headerValue === "string" && headerValue.length > 0;
      }
    } catch (error) {
      console.warn(`Error validating ${headerName} header:`, error);
      return false;
    }
  }

  // Validate Cache-Control header format
  validateCacheControlHeader(value) {
    if (!value || typeof value !== "string") return false;

    // Basic Cache-Control directive validation
    const validDirectives = [
      "public",
      "private",
      "no-cache",
      "no-store",
      "must-revalidate",
      "proxy-revalidate",
      "immutable",
      "stale-while-revalidate",
      "stale-if-error",
    ];

    const directives = value
      .toLowerCase()
      .split(",")
      .map((d) => d.trim());

    for (const directive of directives) {
      // Check for max-age, s-maxage patterns
      if (/^(max-age|s-maxage)=\d+$/.test(directive)) continue;

      // Check for stale-while-revalidate, stale-if-error patterns
      if (/^(stale-while-revalidate|stale-if-error)=\d+$/.test(directive)) continue;

      // Check for valid standalone directives
      if (!validDirectives.includes(directive)) {
        console.warn("Unknown Cache-Control directive:", directive);
      }
    }

    return true;
  }

  // Validate Expires header format
  validateExpiresHeader(value) {
    if (!value || typeof value !== "string") return false;

    try {
      const date = new Date(value);
      return !isNaN(date.getTime());
    } catch (error) {
      return false;
    }
  }

  // Validate Age header format
  validateAgeHeader(value) {
    if (!value) return false;

    const ageValue = parseInt(value, 10);
    return !isNaN(ageValue) && ageValue >= 0;
  }

  // Validate Content-Length header format
  validateContentLengthHeader(value) {
    if (!value) return false;

    const lengthValue = parseInt(value, 10);
    return !isNaN(lengthValue) && lengthValue >= 0;
  }

  // Validate ETag header format
  validateETagHeader(value) {
    if (!value || typeof value !== "string") return false;

    // Basic ETag format validation (quoted string or W/ prefix)
    return /^(W\/)?"[^"]*"$/.test(value.trim());
  }

  // Extract fallback headers when fetch fails
  extractFallbackHeaders() {
    console.log("Extracting fallback headers from current page...");

    const fallbackHeaders = {
      raw: {},
      cache: {
        browserCache: {},
        cdnCache: {},
        general: {},
      },
      security: {},
      performance: {},
      other: {},
      fallback: true,
      fallbackReason: "Could not fetch original response headers",
    };

    try {
      // Try to get some headers from performance entries
      const navigationEntries = performance.getEntriesByType("navigation");
      if (navigationEntries.length > 0) {
        const entry = navigationEntries[0];

        // Add timing information as pseudo-headers
        fallbackHeaders.performance["x-timing-ttfb"] = `${(
          entry.responseStart - entry.requestStart
        ).toFixed(2)}ms`;
        fallbackHeaders.performance["x-timing-dom-load"] = `${(
          entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart
        ).toFixed(2)}ms`;
      }

      // Check for any meta tags that might indicate caching
      const metaTags = document.querySelectorAll("meta[http-equiv]");
      metaTags.forEach((meta) => {
        const httpEquiv = meta.getAttribute("http-equiv").toLowerCase();
        const content = meta.getAttribute("content");
        if (httpEquiv && content) {
          fallbackHeaders.cache.general[httpEquiv] = content;
        }
      });
    } catch (error) {
      console.warn("Error extracting fallback headers:", error);
    }

    return fallbackHeaders;
  }

  // Try to fetch actual response headers using a HEAD request
  async tryFetchActualHeaders() {
    try {
      console.log("Attempting to fetch actual response headers...");

      // Try HEAD request first
      try {
        const headResponse = await fetch(window.location.href, {
          method: "HEAD",
          cache: "no-cache", // Ensure we get fresh headers
        });

        if (headResponse.ok) {
          console.log("HEAD request successful, extracting headers");
          const extractedHeaders = this.extractResponseHeaders(headResponse);
          if (extractedHeaders && Object.keys(extractedHeaders.raw || {}).length > 0) {
            return extractedHeaders;
          }
        } else {
          console.warn("HEAD request failed with status:", headResponse.status);
        }
      } catch (headError) {
        console.warn("HEAD request failed:", headError.message);
      }

      // Fallback: Try GET request with range header to minimize data transfer
      try {
        console.log("Trying GET request with range header as fallback...");
        const getResponse = await fetch(window.location.href, {
          method: "GET",
          headers: {
            Range: "bytes=0-0", // Request only first byte
          },
          cache: "no-cache",
        });

        if (getResponse.ok || getResponse.status === 206) {
          // 206 = Partial Content
          console.log("GET request successful, extracting headers");
          const extractedHeaders = this.extractResponseHeaders(getResponse);
          if (extractedHeaders && Object.keys(extractedHeaders.raw || {}).length > 0) {
            return extractedHeaders;
          }
        } else {
          console.warn("GET request failed with status:", getResponse.status);
        }
      } catch (getError) {
        console.warn("GET request failed:", getError.message);
      }

      // Final fallback: Try to extract headers from performance entries
      console.log("Trying to extract headers from performance entries...");
      return this.extractHeadersFromPerformanceEntries();
    } catch (error) {
      console.warn("All header extraction methods failed:", error);
      return null;
    }
  }

  // Extract headers from performance entries as a last resort
  extractHeadersFromPerformanceEntries() {
    try {
      const navigationEntries = performance.getEntriesByType("navigation");
      if (navigationEntries.length === 0) {
        return null;
      }

      const entry = navigationEntries[0];
      const headers = {
        raw: {},
        cache: {
          browserCache: {},
          cdnCache: {},
          general: {},
        },
        security: {},
        performance: {},
        other: {},
        fallback: true,
        fallbackReason: "Extracted from performance entries",
      };

      // Add timing-based pseudo-headers
      if (entry.responseStart && entry.requestStart) {
        headers.performance["x-timing-ttfb"] = `${(
          entry.responseStart - entry.requestStart
        ).toFixed(2)}ms`;
      }

      if (entry.domContentLoadedEventEnd && entry.domContentLoadedEventStart) {
        headers.performance["x-timing-dom-load"] = `${(
          entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart
        ).toFixed(2)}ms`;
      }

      // Try to infer some cache information from timing
      if (entry.responseStart && entry.fetchStart) {
        const responseTime = entry.responseStart - entry.fetchStart;
        if (responseTime < 50) {
          // Very fast response might indicate cache hit
          headers.cache.general["x-inferred-cache"] = "likely-cached";
        }
      }

      console.log("Extracted headers from performance entries");
      return headers;
    } catch (error) {
      console.warn("Failed to extract headers from performance entries:", error);
      return null;
    }
  }

  // Find elements with background images
  findBackgroundImageElements(container) {
    const elementsWithBgImages = [];

    try {
      // Get all elements in the container
      const allElements = container.querySelectorAll("*");

      allElements.forEach((element) => {
        try {
          const computedStyle = window.getComputedStyle(element);
          const backgroundImage = computedStyle.backgroundImage;

          // Check if element has a background image (not 'none')
          if (backgroundImage && backgroundImage !== "none" && backgroundImage.includes("url(")) {
            // Extract URL from background-image CSS property
            const urlMatch = backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
            if (urlMatch && urlMatch[1]) {
              elementsWithBgImages.push({
                element: element,
                backgroundImageUrl: urlMatch[1],
                selector: this.generateElementSelector(element),
              });
            }
          }
        } catch (error) {
          // Skip elements that can't be processed
          console.warn("Could not process element for background image:", error);
        }
      });
    } catch (error) {
      console.error("Error finding background image elements:", error);
    }

    return elementsWithBgImages;
  }

  // Generate a CSS selector for an element
  generateElementSelector(element) {
    try {
      // Try to create a unique selector
      if (element.id) {
        return `#${element.id}`;
      }

      if (element.className && typeof element.className === "string") {
        const classes = element.className.trim().split(/\s+/).slice(0, 3); // Limit to first 3 classes
        if (classes.length > 0) {
          return `${element.tagName.toLowerCase()}.${classes.join(".")}`;
        }
      }

      // Fallback to tag name with position
      const siblings = Array.from(element.parentNode?.children || []);
      const sameTagSiblings = siblings.filter((sibling) => sibling.tagName === element.tagName);

      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(element) + 1;
        return `${element.tagName.toLowerCase()}:nth-of-type(${index})`;
      }

      return element.tagName.toLowerCase();
    } catch (error) {
      console.warn("Error generating element selector:", error);
      return "unknown";
    }
  }

  // Main analysis orchestrator
  async analyzePerformance() {
    if (this.isAnalyzing) {
      console.warn("Analysis already in progress");
      return null;
    }

    this.isAnalyzing = true;

    try {
      console.log("Starting performance recommendations analysis...");

      // Initialize analysis results structure
      this.analysisResults = {
        metadata: {
          url: window.location.href,
          timestamp: Date.now(),
          analysisVersion: "2.0",
          pageLoadType: "navigation",
          userAgent: navigator.userAgent,
        },
        cache: {},
        lcp: {},
        scripts: {},
        links: {},
        css: {},
        summary: {},
      };

      // Step 1: Fetch and parse HTML document
      console.log("Debug: Starting HTML fetch...");
      const fetchResult = await this.fetchDocumentHTML();
      console.log(
        `Debug: HTML fetch completed. Length: ${
          this.htmlContent ? this.htmlContent.length : 0
        }, Fallback used: ${fetchResult.fallbackUsed || false}`
      );

      const htmlStructure = this.parseHTMLStructure();
      console.log("Debug: HTML structure parsed:", {
        hasHead: !!htmlStructure.head,
        hasBody: !!htmlStructure.body,
        headLinksCount:
          htmlStructure.head && htmlStructure.head.links ? htmlStructure.head.links.length : 0,
        bodyLinksCount:
          htmlStructure.body && htmlStructure.body.links ? htmlStructure.body.links.length : 0,
      });

      // Store HTML structure for use by other analysis methods
      this.htmlStructure = htmlStructure;

      // Step 2: Analyze scripts for optimization opportunities
      console.log("Step 2: Analyzing scripts...");
      this.analysisResults.scripts = this.analyzeScripts(htmlStructure);

      // Step 3: Analyze links and preload opportunities
      console.log("Step 3: Analyzing links...");
      this.analysisResults.links = this.analyzeLinks(htmlStructure);

      // Step 4: Analyze cache optimization opportunities
      console.log("Step 4: Analyzing cache...");
      this.analysisResults.cache = await this.analyzeCache();

      // Step 5: Analyze LCP optimization opportunities
      console.log("Step 5: Analyzing LCP...");
      this.analysisResults.lcp = this.analyzeLCP(htmlStructure);

      // Step 6: Analyze CSS loading patterns and optimization opportunities
      console.log("Step 6: Analyzing CSS...");
      this.analysisResults.css = this.analyzeCSS(htmlStructure);

      // Step 7: Generate summary
      console.log("Step 7: Generating summary...");
      this.analysisResults.summary = this.calculateSummary();

      // Prepare CSS analysis infrastructure for future enhancements
      this.prepareCSSAnalysisInfrastructure();

      console.log("Performance recommendations analysis completed");
      return this.analysisResults;
    } catch (error) {
      console.error("Error during performance analysis:", error);
      throw error;
    } finally {
      this.isAnalyzing = false;
    }
  }

  // Get current analysis state
  getAnalysisState() {
    return {
      isAnalyzing: this.isAnalyzing,
      hasResults: Object.keys(this.analysisResults).length > 0,
    };
  }

  // Analyze browser cache headers and determine cache status
  analyzeBrowserCache() {
    try {
      console.log("Analyzing browser cache headers...");

      if (!this.responseHeaders || !this.responseHeaders.cache) {
        console.warn("No response headers available for browser cache analysis");
        return {
          status: "not-cached",
          ttl: null,
          cacheControl: null,
          expires: null,
          reason: "No cache headers available",
        };
      }

      const browserCacheHeaders = this.responseHeaders.cache.browserCache;
      const result = {
        status: "not-cached",
        ttl: null,
        cacheControl: null,
        expires: null,
        reason: null,
        headers: browserCacheHeaders,
      };

      // Check Cache-Control header first (takes precedence over Expires)
      if (browserCacheHeaders["cache-control"]) {
        result.cacheControl = browserCacheHeaders["cache-control"];
        const cacheControlAnalysis = this.parseCacheControlHeader(result.cacheControl);

        if (cacheControlAnalysis.isCacheable) {
          result.status = "cached";
          result.ttl = cacheControlAnalysis.maxAge;
          result.reason = "Cache-Control header indicates caching";
        } else {
          result.status = "not-cached";
          result.reason = cacheControlAnalysis.reason || "Cache-Control prevents caching";
        }
      }
      // Fallback to Expires header if no Cache-Control
      else if (browserCacheHeaders["expires"]) {
        result.expires = browserCacheHeaders["expires"];
        const expiresAnalysis = this.parseExpiresHeader(result.expires);

        if (expiresAnalysis.isValid && expiresAnalysis.ttl > 0) {
          result.status = "cached";
          result.ttl = expiresAnalysis.ttl;
          result.reason = "Expires header indicates caching";
        } else {
          result.status = "not-cached";
          result.reason = expiresAnalysis.reason || "Expires header prevents caching";
        }
      }
      // No caching headers found
      else {
        result.reason = "No browser-side caching detected";
      }

      // Check for explicit no-cache directives
      if (browserCacheHeaders["pragma"] === "no-cache") {
        result.status = "not-cached";
        result.reason = "Pragma: no-cache directive";
      }

      console.log("Browser cache analysis complete:", result);
      return result;
    } catch (error) {
      console.error("Error analyzing browser cache:", error);
      return {
        status: "error",
        ttl: null,
        cacheControl: null,
        expires: null,
        reason: `Analysis error: ${error.message}`,
        error: error.message,
      };
    }
  }

  // Parse Cache-Control header and extract TTL
  parseCacheControlHeader(cacheControlValue) {
    try {
      if (!cacheControlValue || typeof cacheControlValue !== "string") {
        return {
          isCacheable: false,
          maxAge: null,
          reason: "Invalid Cache-Control header",
        };
      }

      const directives = cacheControlValue
        .toLowerCase()
        .split(",")
        .map((directive) => directive.trim());

      const result = {
        isCacheable: true,
        maxAge: null,
        reason: null,
        directives: directives,
      };

      // Check for no-cache directives
      if (
        directives.includes("no-cache") ||
        directives.includes("no-store") ||
        directives.includes("private")
      ) {
        result.isCacheable = false;
        result.reason = "Cache-Control contains no-cache directive";
        return result;
      }

      // Extract max-age value
      const maxAgeDirective = directives.find((directive) => directive.startsWith("max-age="));
      if (maxAgeDirective) {
        const maxAgeValue = maxAgeDirective.split("=")[1];
        const maxAgeSeconds = parseInt(maxAgeValue, 10);

        if (!isNaN(maxAgeSeconds) && maxAgeSeconds >= 0) {
          result.maxAge = maxAgeSeconds;
          result.reason = `Cacheable for ${maxAgeSeconds} seconds`;
        } else {
          result.isCacheable = false;
          result.reason = "Invalid max-age value";
        }
      } else {
        // If no max-age but cacheable directives present
        result.reason = "Cacheable but no explicit TTL";
      }

      return result;
    } catch (error) {
      console.error("Error parsing Cache-Control header:", error);
      return {
        isCacheable: false,
        maxAge: null,
        reason: `Parse error: ${error.message}`,
      };
    }
  }

  // Parse Expires header and calculate TTL
  parseExpiresHeader(expiresValue) {
    try {
      if (!expiresValue || typeof expiresValue !== "string") {
        return {
          isValid: false,
          ttl: null,
          reason: "Invalid Expires header",
        };
      }

      // Parse the expires date
      const expiresDate = new Date(expiresValue);
      const currentDate = new Date();

      if (isNaN(expiresDate.getTime())) {
        return {
          isValid: false,
          ttl: null,
          reason: "Invalid date format in Expires header",
        };
      }

      // Calculate TTL in seconds
      const ttlMs = expiresDate.getTime() - currentDate.getTime();
      const ttlSeconds = Math.floor(ttlMs / 1000);

      if (ttlSeconds <= 0) {
        return {
          isValid: true,
          ttl: 0,
          reason: "Resource has already expired",
        };
      }

      return {
        isValid: true,
        ttl: ttlSeconds,
        reason: `Expires in ${ttlSeconds} seconds`,
        expiresDate: expiresDate,
      };
    } catch (error) {
      console.error("Error parsing Expires header:", error);
      return {
        isValid: false,
        ttl: null,
        reason: `Parse error: ${error.message}`,
      };
    }
  }

  // Analyze CDN cache headers and detect cache hits
  analyzeCDNCache() {
    try {
      console.log("Analyzing CDN cache headers...");

      if (!this.responseHeaders || !this.responseHeaders.cache) {
        console.warn("No response headers available for CDN cache analysis");
        return {
          status: "unknown",
          provider: "unknown",
          ttl: null,
          age: null,
          cacheHeaders: {},
          reason: "No cache headers available",
        };
      }

      const cdnCacheHeaders = this.responseHeaders.cache.cdnCache;
      const result = {
        status: "unknown",
        provider: "unknown",
        ttl: null,
        age: null,
        cacheHeaders: cdnCacheHeaders,
        reason: null,
      };

      // Detect CDN provider and analyze cache status
      const providerDetection = this.detectCDNProvider(cdnCacheHeaders);
      result.provider = providerDetection.provider;

      // Parse Age header if present
      if (cdnCacheHeaders["age"]) {
        const ageValue = parseInt(cdnCacheHeaders["age"], 10);
        if (!isNaN(ageValue) && ageValue >= 0) {
          result.age = ageValue;
        }
      }

      // Analyze cache status based on provider-specific headers
      const cacheStatusAnalysis = this.analyzeCDNCacheStatus(cdnCacheHeaders, providerDetection);
      result.status = cacheStatusAnalysis.status;
      result.ttl = cacheStatusAnalysis.ttl;
      result.reason = cacheStatusAnalysis.reason;

      // If Age > 0, it's likely a cache hit
      if (result.age && result.age > 0 && result.status === "unknown") {
        result.status = "hit";
        result.reason = `Cache hit detected (Age: ${result.age}s)`;
      }

      console.log("CDN cache analysis complete:", result);
      return result;
    } catch (error) {
      console.error("Error analyzing CDN cache:", error);
      return {
        status: "error",
        provider: "unknown",
        ttl: null,
        age: null,
        cacheHeaders: {},
        reason: `Analysis error: ${error.message}`,
        error: error.message,
      };
    }
  }

  // Detect CDN provider based on response headers
  detectCDNProvider(cdnHeaders) {
    try {
      const result = {
        provider: "unknown",
        confidence: 0,
        indicators: [],
      };

      // Cloudflare detection
      if (cdnHeaders["cf-cache-status"] || cdnHeaders["cf-ray"] || cdnHeaders["cf-request-id"]) {
        result.provider = "cloudflare";
        result.confidence = 0.9;
        result.indicators.push("cf-cache-status", "cf-ray", "cf-request-id");
      }
      // Fastly detection
      else if (
        cdnHeaders["x-fastly-request-id"] ||
        cdnHeaders["x-fastly-cache"] ||
        cdnHeaders["x-served-by"]?.includes("fastly")
      ) {
        result.provider = "fastly";
        result.confidence = 0.9;
        result.indicators.push("x-fastly-request-id", "x-fastly-cache");
      }
      // AWS CloudFront detection
      else if (cdnHeaders["x-amz-cf-pop"] || cdnHeaders["x-amz-cf-id"]) {
        result.provider = "aws";
        result.confidence = 0.9;
        result.indicators.push("x-amz-cf-pop", "x-amz-cf-id");
      }
      // Akamai detection
      else if (cdnHeaders["x-akamai-request-id"] || cdnHeaders["x-cache"]?.includes("akamai")) {
        result.provider = "akamai";
        result.confidence = 0.8;
        result.indicators.push("x-akamai-request-id", "x-cache");
      }
      // Generic CDN detection based on common headers
      else if (cdnHeaders["x-cache"] || cdnHeaders["x-cache-hits"] || cdnHeaders["x-varnish"]) {
        result.provider = "generic";
        result.confidence = 0.6;
        result.indicators.push("x-cache", "x-cache-hits", "x-varnish");
      }

      return result;
    } catch (error) {
      console.error("Error detecting CDN provider:", error);
      return {
        provider: "unknown",
        confidence: 0,
        indicators: [],
        error: error.message,
      };
    }
  }

  // Analyze CDN cache status based on provider-specific headers
  analyzeCDNCacheStatus(cdnHeaders, providerInfo) {
    try {
      const result = {
        status: "unknown",
        ttl: null,
        reason: "No cache status indicators found",
      };

      switch (providerInfo.provider) {
        case "cloudflare":
          return this.analyzeCloudflareCache(cdnHeaders);

        case "fastly":
          return this.analyzeFastlyCache(cdnHeaders);

        case "aws":
          return this.analyzeAWSCloudFrontCache(cdnHeaders);

        case "akamai":
          return this.analyzeAkamaiCache(cdnHeaders);

        case "generic":
          return this.analyzeGenericCDNCache(cdnHeaders);

        default:
          // Try to extract basic cache information from common headers
          if (cdnHeaders["x-cache"]) {
            const xCacheValue = cdnHeaders["x-cache"].toLowerCase();
            if (xCacheValue.includes("hit")) {
              result.status = "hit";
              result.reason = "X-Cache header indicates cache hit";
            } else if (xCacheValue.includes("miss")) {
              result.status = "miss";
              result.reason = "X-Cache header indicates cache miss";
            }
          }
          break;
      }

      return result;
    } catch (error) {
      console.error("Error analyzing CDN cache status:", error);
      return {
        status: "error",
        ttl: null,
        reason: `Cache status analysis error: ${error.message}`,
      };
    }
  }

  // Analyze Cloudflare cache headers
  analyzeCloudflareCache(headers) {
    const result = {
      status: "unknown",
      ttl: null,
      reason: null,
    };

    if (headers["cf-cache-status"]) {
      const cacheStatus = headers["cf-cache-status"].toLowerCase();

      switch (cacheStatus) {
        case "hit":
          result.status = "hit";
          result.reason = "Cloudflare cache hit";
          break;
        case "miss":
          result.status = "miss";
          result.reason = "Cloudflare cache miss";
          break;
        case "expired":
          result.status = "miss";
          result.reason = "Cloudflare cache expired";
          break;
        case "bypass":
          result.status = "miss";
          result.reason = "Cloudflare cache bypassed";
          break;
        case "dynamic":
          result.status = "miss";
          result.reason = "Cloudflare dynamic content (not cached)";
          break;
        default:
          result.status = "unknown";
          result.reason = `Cloudflare cache status: ${cacheStatus}`;
      }
    }

    // Extract TTL from Cloudflare edge cache headers if available
    if (headers["cf-edge-cache"]) {
      const edgeCacheValue = headers["cf-edge-cache"];
      const maxAgeMatch = edgeCacheValue.match(/max-age=(\d+)/);
      if (maxAgeMatch) {
        result.ttl = parseInt(maxAgeMatch[1], 10);
      }
    }

    return result;
  }

  // Analyze Fastly cache headers
  analyzeFastlyCache(headers) {
    const result = {
      status: "unknown",
      ttl: null,
      reason: null,
    };

    if (headers["x-cache"]) {
      const xCacheValue = headers["x-cache"].toLowerCase();
      if (xCacheValue.includes("hit")) {
        result.status = "hit";
        result.reason = "Fastly cache hit";
      } else if (xCacheValue.includes("miss")) {
        result.status = "miss";
        result.reason = "Fastly cache miss";
      }
    }

    // Check for Fastly-specific cache headers
    if (headers["x-fastly-cache"]) {
      const fastlyCacheValue = headers["x-fastly-cache"].toLowerCase();
      if (fastlyCacheValue.includes("hit")) {
        result.status = "hit";
        result.reason = "Fastly cache hit (x-fastly-cache)";
      }
    }

    return result;
  }

  // Analyze AWS CloudFront cache headers
  analyzeAWSCloudFrontCache(headers) {
    const result = {
      status: "unknown",
      ttl: null,
      reason: null,
    };

    if (headers["x-cache"]) {
      const xCacheValue = headers["x-cache"].toLowerCase();
      if (xCacheValue.includes("hit")) {
        result.status = "hit";
        result.reason = "CloudFront cache hit";
      } else if (xCacheValue.includes("miss")) {
        result.status = "miss";
        result.reason = "CloudFront cache miss";
      }
    }

    // CloudFront age header indicates cache hit if present
    if (headers["age"] && parseInt(headers["age"], 10) > 0) {
      result.status = "hit";
      result.reason = "CloudFront cache hit (Age header present)";
    }

    return result;
  }

  // Analyze Akamai cache headers
  analyzeAkamaiCache(headers) {
    const result = {
      status: "unknown",
      ttl: null,
      reason: null,
    };

    if (headers["x-cache"]) {
      const xCacheValue = headers["x-cache"].toLowerCase();
      if (xCacheValue.includes("hit")) {
        result.status = "hit";
        result.reason = "Akamai cache hit";
      } else if (xCacheValue.includes("miss")) {
        result.status = "miss";
        result.reason = "Akamai cache miss";
      }
    }

    return result;
  }

  // Analyze generic CDN cache headers
  analyzeGenericCDNCache(headers) {
    const result = {
      status: "unknown",
      ttl: null,
      reason: null,
    };

    // Check common cache headers
    if (headers["x-cache"]) {
      const xCacheValue = headers["x-cache"].toLowerCase();
      if (xCacheValue.includes("hit")) {
        result.status = "hit";
        result.reason = "CDN cache hit (x-cache)";
      } else if (xCacheValue.includes("miss")) {
        result.status = "miss";
        result.reason = "CDN cache miss (x-cache)";
      }
    }

    // Check for cache hits counter
    if (headers["x-cache-hits"]) {
      const cacheHits = parseInt(headers["x-cache-hits"], 10);
      if (!isNaN(cacheHits) && cacheHits > 0) {
        result.status = "hit";
        result.reason = `CDN cache hit (${cacheHits} hits)`;
      }
    }

    // Check Varnish cache headers
    if (headers["x-varnish"]) {
      const varnishValue = headers["x-varnish"];
      // Varnish includes multiple IDs for cache hits
      if (varnishValue.includes(" ")) {
        result.status = "hit";
        result.reason = "Varnish cache hit";
      } else {
        result.status = "miss";
        result.reason = "Varnish cache miss";
      }
    }

    return result;
  }

  // Identify LCP candidate elements in HTML
  identifyLCPCandidates(htmlContent = null) {
    try {
      const html = htmlContent || this.htmlContent;

      if (!html) {
        throw new Error("No HTML content available for LCP analysis");
      }

      console.log("Identifying LCP candidate elements...");

      // Parse HTML structure if not already done
      const structure = this.parseHTMLStructure(html);

      const lcpCandidates = {
        images: [],
        videos: [],
        backgroundImages: [],
        textBlocks: [],
        metadata: {
          totalCandidates: 0,
          analysisTimestamp: Date.now(),
          url: window.location.href,
        },
      };

      // Find image elements (high priority LCP candidates)
      structure.all.images.forEach((img) => {
        if (img.src) {
          const candidate = {
            element: img,
            type: "img",
            src: img.src,
            selector: this.generateElementSelector(img),
            attributes: {
              alt: img.alt || null,
              loading: img.loading || null,
              fetchpriority: img.getAttribute("fetchpriority") || null,
              sizes: img.sizes || null,
              srcset: img.srcset || null,
            },
            dimensions: this.getElementDimensions(img),
            isAboveFold: this.isElementAboveFold(img),
            serverSideRendered: true, // Present in initial HTML
          };

          lcpCandidates.images.push(candidate);
        }
      });

      // Find video elements (potential LCP candidates)
      structure.all.videos.forEach((video) => {
        const candidate = {
          element: video,
          type: "video",
          src: video.src || video.querySelector("source")?.src || null,
          selector: this.generateElementSelector(video),
          attributes: {
            poster: video.poster || null,
            autoplay: video.autoplay || false,
            muted: video.muted || false,
            controls: video.controls || false,
          },
          dimensions: this.getElementDimensions(video),
          isAboveFold: this.isElementAboveFold(video),
          serverSideRendered: true, // Present in initial HTML
        };

        lcpCandidates.videos.push(candidate);
      });

      // Find elements with background images
      structure.body.backgroundImages.forEach((bgImg) => {
        const candidate = {
          element: bgImg.element,
          type: "background-image",
          src: bgImg.backgroundImageUrl,
          selector: bgImg.selector,
          attributes: {
            tagName: bgImg.element.tagName,
            id: bgImg.element.id || null,
            className: bgImg.element.className || null,
          },
          dimensions: this.getElementDimensions(bgImg.element),
          isAboveFold: this.isElementAboveFold(bgImg.element),
          serverSideRendered: true, // Present in initial HTML
        };

        lcpCandidates.backgroundImages.push(candidate);
      });

      // Find large text blocks (potential LCP candidates)
      const textBlocks = this.findLargeTextBlocks(structure);
      lcpCandidates.textBlocks = textBlocks;

      // Calculate total candidates
      lcpCandidates.metadata.totalCandidates =
        lcpCandidates.images.length +
        lcpCandidates.videos.length +
        lcpCandidates.backgroundImages.length +
        lcpCandidates.textBlocks.length;

      // Detect server-side rendering status
      const ssrStatus = this.detectServerSideRendering(lcpCandidates);
      lcpCandidates.serverSideRenderingStatus = ssrStatus;

      console.log(`LCP candidates identified: ${lcpCandidates.metadata.totalCandidates} total`);
      console.log(`- Images: ${lcpCandidates.images.length}`);
      console.log(`- Videos: ${lcpCandidates.videos.length}`);
      console.log(`- Background Images: ${lcpCandidates.backgroundImages.length}`);
      console.log(`- Text Blocks: ${lcpCandidates.textBlocks.length}`);

      return lcpCandidates;
    } catch (error) {
      console.error("Error identifying LCP candidates:", error);
      throw new Error(`LCP candidate identification failed: ${error.message}`);
    }
  }

  // Detect server-side rendering status for LCP elements
  detectServerSideRendering(lcpCandidates) {
    try {
      console.log("Detecting server-side rendering status...");

      const ssrStatus = {
        hasServerSideRenderedContent: false,
        clientSideOnlyElements: [],
        serverSideElements: [],
        analysis: {
          totalElementsAnalyzed: 0,
          serverSideCount: 0,
          clientSideCount: 0,
          confidence: "high", // high, medium, low
        },
      };

      // All elements found in initial HTML are server-side rendered
      const allCandidates = [
        ...lcpCandidates.images,
        ...lcpCandidates.videos,
        ...lcpCandidates.backgroundImages,
        ...lcpCandidates.textBlocks,
      ];

      allCandidates.forEach((candidate) => {
        ssrStatus.analysis.totalElementsAnalyzed++;

        if (candidate.serverSideRendered) {
          ssrStatus.analysis.serverSideCount++;
          ssrStatus.serverSideElements.push({
            type: candidate.type,
            selector: candidate.selector,
            src: candidate.src || null,
          });
        } else {
          ssrStatus.analysis.clientSideCount++;
          ssrStatus.clientSideOnlyElements.push({
            type: candidate.type,
            selector: candidate.selector,
            src: candidate.src || null,
          });
        }
      });

      // Determine if there's server-side rendered content
      ssrStatus.hasServerSideRenderedContent = ssrStatus.analysis.serverSideCount > 0;

      // Check for client-side only elements by comparing with current DOM
      const currentDOMElements = this.getCurrentDOMLCPCandidates();
      const clientSideOnly = this.findClientSideOnlyElements(allCandidates, currentDOMElements);

      ssrStatus.clientSideOnlyElements.push(...clientSideOnly);
      ssrStatus.analysis.clientSideCount += clientSideOnly.length;

      // Adjust confidence based on analysis
      if (ssrStatus.analysis.totalElementsAnalyzed === 0) {
        ssrStatus.analysis.confidence = "low";
      } else if (ssrStatus.analysis.clientSideCount > ssrStatus.analysis.serverSideCount) {
        ssrStatus.analysis.confidence = "medium";
      }

      console.log(
        `SSR Analysis: ${ssrStatus.analysis.serverSideCount} server-side, ${ssrStatus.analysis.clientSideCount} client-side`
      );

      return ssrStatus;
    } catch (error) {
      console.error("Error detecting server-side rendering:", error);
      return {
        hasServerSideRenderedContent: false,
        clientSideOnlyElements: [],
        serverSideElements: [],
        analysis: {
          totalElementsAnalyzed: 0,
          serverSideCount: 0,
          clientSideCount: 0,
          confidence: "low",
          error: error.message,
        },
      };
    }
  }

  // Get current DOM LCP candidates for comparison
  getCurrentDOMLCPCandidates() {
    try {
      const currentCandidates = [];

      // Get current images
      document.querySelectorAll("img[src]").forEach((img) => {
        currentCandidates.push({
          type: "img",
          element: img,
          src: img.src,
          selector: this.generateElementSelector(img),
        });
      });

      // Get current videos
      document.querySelectorAll("video").forEach((video) => {
        currentCandidates.push({
          type: "video",
          element: video,
          src: video.src || video.querySelector("source")?.src || null,
          selector: this.generateElementSelector(video),
        });
      });

      // Get current background images
      const bgImages = this.findBackgroundImageElements(document.body);
      bgImages.forEach((bgImg) => {
        currentCandidates.push({
          type: "background-image",
          element: bgImg.element,
          src: bgImg.backgroundImageUrl,
          selector: bgImg.selector,
        });
      });

      return currentCandidates;
    } catch (error) {
      console.error("Error getting current DOM LCP candidates:", error);
      return [];
    }
  }

  // Find elements that exist in current DOM but not in initial HTML
  findClientSideOnlyElements(initialElements, currentElements) {
    try {
      const clientSideOnly = [];

      currentElements.forEach((currentEl) => {
        // Check if this element exists in initial HTML
        const existsInInitial = initialElements.some(
          (initialEl) =>
            initialEl.selector === currentEl.selector && initialEl.src === currentEl.src
        );

        if (!existsInInitial) {
          clientSideOnly.push({
            type: currentEl.type,
            selector: currentEl.selector,
            src: currentEl.src,
            serverSideRendered: false,
          });
        }
      });

      return clientSideOnly;
    } catch (error) {
      console.error("Error finding client-side only elements:", error);
      return [];
    }
  }

  // Find large text blocks that could be LCP candidates
  findLargeTextBlocks(structure) {
    try {
      const textBlocks = [];
      const minTextLength = 100; // Minimum characters for consideration

      // Common text container selectors
      const textSelectors = ["h1", "h2", "h3", "p", "div", "article", "section", "main"];

      textSelectors.forEach((selector) => {
        const elements = structure.body.element.querySelectorAll(selector);

        elements.forEach((element) => {
          const textContent = element.textContent?.trim() || "";

          if (textContent.length >= minTextLength) {
            const candidate = {
              element: element,
              type: "text-block",
              textLength: textContent.length,
              selector: this.generateElementSelector(element),
              attributes: {
                tagName: element.tagName,
                id: element.id || null,
                className: element.className || null,
              },
              dimensions: this.getElementDimensions(element),
              isAboveFold: this.isElementAboveFold(element),
              serverSideRendered: true, // Present in initial HTML
            };

            textBlocks.push(candidate);
          }
        });
      });

      return textBlocks;
    } catch (error) {
      console.error("Error finding large text blocks:", error);
      return [];
    }
  }

  // Get element dimensions safely
  getElementDimensions(element) {
    try {
      if (!element || !element.getBoundingClientRect) {
        return { width: 0, height: 0, area: 0 };
      }

      const rect = element.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        area: Math.round(rect.width * rect.height),
      };
    } catch (error) {
      return { width: 0, height: 0, area: 0 };
    }
  }

  // Check if element is above the fold
  isElementAboveFold(element) {
    try {
      if (!element || !element.getBoundingClientRect) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      // Element is above fold if its top is within the viewport
      return rect.top < viewportHeight && rect.bottom > 0;
    } catch (error) {
      return false;
    }
  }

  // Validate LCP preload links
  validateLCPPreloads(lcpCandidates, htmlStructure = null) {
    try {
      console.log("Validating LCP preload links...");

      const structure = htmlStructure || this.parseHTMLStructure();

      const preloadValidation = {
        preloadLinks: [],
        lcpElementsWithPreload: [],
        lcpElementsWithoutPreload: [],
        redundantPreloads: [],
        invalidPreloads: [],
        recommendations: [],
        analysis: {
          totalLCPCandidates: 0,
          preloadedCandidates: 0,
          missingPreloads: 0,
          validPreloads: 0,
          invalidPreloads: 0,
        },
      };

      // Extract all preload links from HEAD
      const preloadLinks = this.extractPreloadLinks(structure);
      preloadValidation.preloadLinks = preloadLinks;

      // Get high-priority LCP candidates (images and videos above fold)
      const highPriorityLCPCandidates = this.getHighPriorityLCPCandidates(lcpCandidates);
      preloadValidation.analysis.totalLCPCandidates = highPriorityLCPCandidates.length;

      // Cross-reference LCP candidates with preload links
      const crossReference = this.crossReferenceLCPWithPreloads(
        highPriorityLCPCandidates,
        preloadLinks
      );

      preloadValidation.lcpElementsWithPreload = crossReference.withPreload;
      preloadValidation.lcpElementsWithoutPreload = crossReference.withoutPreload;
      preloadValidation.analysis.preloadedCandidates = crossReference.withPreload.length;
      preloadValidation.analysis.missingPreloads = crossReference.withoutPreload.length;

      // Detect redundant and invalid preloads
      const redundantPreloads = this.detectRedundantPreloads(
        preloadLinks,
        highPriorityLCPCandidates
      );
      preloadValidation.redundantPreloads = redundantPreloads;

      const invalidPreloads = this.detectInvalidPreloads(preloadLinks);
      preloadValidation.invalidPreloads = invalidPreloads;
      preloadValidation.analysis.invalidPreloads = invalidPreloads.length;
      preloadValidation.analysis.validPreloads = preloadLinks.length - invalidPreloads.length;

      // Generate recommendations
      const recommendations = this.generateLCPPreloadRecommendations(preloadValidation);
      preloadValidation.recommendations = recommendations;

      console.log(`LCP Preload Validation Complete:`);
      console.log(`- Total LCP Candidates: ${preloadValidation.analysis.totalLCPCandidates}`);
      console.log(`- With Preload: ${preloadValidation.analysis.preloadedCandidates}`);
      console.log(`- Missing Preload: ${preloadValidation.analysis.missingPreloads}`);
      console.log(`- Invalid Preloads: ${preloadValidation.analysis.invalidPreloads}`);

      return preloadValidation;
    } catch (error) {
      console.error("Error validating LCP preloads:", error);
      throw new Error(`LCP preload validation failed: ${error.message}`);
    }
  }

  // Extract preload links from HTML structure
  extractPreloadLinks(structure) {
    try {
      const preloadLinks = [];

      const preloads = structure.head && structure.head.preloads ? structure.head.preloads : [];
      preloads.forEach((link) => {
        const preloadInfo = {
          element: link,
          href: link.href,
          as: link.getAttribute("as"),
          type: link.getAttribute("type"),
          media: link.getAttribute("media"),
          crossorigin: link.getAttribute("crossorigin"),
          fetchpriority: link.getAttribute("fetchpriority"),
          selector: this.generateElementSelector(link),
          isValid: true,
          validationErrors: [],
        };

        // Basic validation
        if (!preloadInfo.href) {
          preloadInfo.isValid = false;
          preloadInfo.validationErrors.push("Missing href attribute");
        }

        if (!preloadInfo.as) {
          preloadInfo.isValid = false;
          preloadInfo.validationErrors.push("Missing as attribute");
        }

        preloadLinks.push(preloadInfo);
      });

      return preloadLinks;
    } catch (error) {
      console.error("Error extracting preload links:", error);
      return [];
    }
  }

  // Get high-priority LCP candidates (above fold images and videos)
  getHighPriorityLCPCandidates(lcpCandidates) {
    try {
      const highPriority = [];

      // Images above fold are high priority
      lcpCandidates.images.forEach((img) => {
        if (img.isAboveFold && img.dimensions.area > 1000) {
          // Minimum size threshold
          highPriority.push({
            ...img,
            priority: "high",
            reason: "Above-fold image with significant size",
          });
        }
      });

      // Videos above fold are high priority
      lcpCandidates.videos.forEach((video) => {
        if (video.isAboveFold) {
          highPriority.push({
            ...video,
            priority: "high",
            reason: "Above-fold video element",
          });
        }
      });

      // Large background images above fold
      lcpCandidates.backgroundImages.forEach((bgImg) => {
        if (bgImg.isAboveFold && bgImg.dimensions.area > 5000) {
          // Higher threshold for bg images
          highPriority.push({
            ...bgImg,
            priority: "high",
            reason: "Above-fold background image with large area",
          });
        }
      });

      return highPriority;
    } catch (error) {
      console.error("Error getting high-priority LCP candidates:", error);
      return [];
    }
  }

  // Cross-reference LCP candidates with preload links
  crossReferenceLCPWithPreloads(lcpCandidates, preloadLinks) {
    try {
      const withPreload = [];
      const withoutPreload = [];

      lcpCandidates.forEach((candidate) => {
        // Find matching preload link
        const matchingPreload = this.findMatchingPreload(candidate, preloadLinks);

        if (matchingPreload) {
          withPreload.push({
            lcpCandidate: candidate,
            preloadLink: matchingPreload,
            matchType: matchingPreload.matchType,
          });
        } else {
          withoutPreload.push({
            lcpCandidate: candidate,
            recommendedPreload: this.generateRecommendedPreload(candidate),
          });
        }
      });

      return { withPreload, withoutPreload };
    } catch (error) {
      console.error("Error cross-referencing LCP with preloads:", error);
      return { withPreload: [], withoutPreload: [] };
    }
  }

  // Find matching preload link for LCP candidate
  findMatchingPreload(lcpCandidate, preloadLinks) {
    try {
      for (const preload of preloadLinks) {
        // Direct URL match
        if (this.urlsMatch(lcpCandidate.src, preload.href)) {
          return {
            ...preload,
            matchType: "exact-url",
          };
        }

        // Type-based match for appropriate 'as' attribute
        if (this.isAppropriatePreloadType(lcpCandidate, preload)) {
          // Check for partial URL match (same filename)
          if (this.partialUrlMatch(lcpCandidate.src, preload.href)) {
            return {
              ...preload,
              matchType: "partial-url",
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error("Error finding matching preload:", error);
      return null;
    }
  }

  // Check if URLs match (handling relative vs absolute URLs)
  urlsMatch(url1, url2) {
    try {
      if (!url1 || !url2) return false;

      // Normalize URLs
      const normalizedUrl1 = this.normalizeUrl(url1);
      const normalizedUrl2 = this.normalizeUrl(url2);

      return normalizedUrl1 === normalizedUrl2;
    } catch (error) {
      return false;
    }
  }

  // Normalize URL for comparison
  normalizeUrl(url) {
    try {
      // Handle relative URLs
      if (url.startsWith("/")) {
        return new URL(url, window.location.origin).href;
      }

      if (url.startsWith("./") || !url.includes("://")) {
        return new URL(url, window.location.href).href;
      }

      return url;
    } catch (error) {
      return url;
    }
  }

  // Check for partial URL match (same filename)
  partialUrlMatch(url1, url2) {
    try {
      const filename1 = url1.split("/").pop()?.split("?")[0];
      const filename2 = url2.split("/").pop()?.split("?")[0];

      return filename1 && filename2 && filename1 === filename2;
    } catch (error) {
      return false;
    }
  }

  // Check if preload type is appropriate for LCP candidate
  isAppropriatePreloadType(lcpCandidate, preload) {
    try {
      switch (lcpCandidate.type) {
        case "img":
          return preload.as === "image";
        case "video":
          return preload.as === "video";
        case "background-image":
          return preload.as === "image";
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  // Generate recommended preload for LCP candidate
  generateRecommendedPreload(lcpCandidate) {
    try {
      const recommendation = {
        href: lcpCandidate.src,
        as: this.getRecommendedAsAttribute(lcpCandidate),
        fetchpriority: "high",
        reason: `Missing preload for ${lcpCandidate.type} LCP candidate`,
      };

      // Add type attribute for images if needed
      if (lcpCandidate.type === "img" && lcpCandidate.src) {
        const extension = lcpCandidate.src.split(".").pop()?.toLowerCase();
        if (extension && ["webp", "avif"].includes(extension)) {
          recommendation.type = `image/${extension}`;
        }
      }

      // Add crossorigin if needed
      if (this.needsCrossOrigin(lcpCandidate.src)) {
        recommendation.crossorigin = "anonymous";
      }

      return recommendation;
    } catch (error) {
      console.error("Error generating recommended preload:", error);
      return null;
    }
  }

  // Get recommended 'as' attribute for LCP candidate
  getRecommendedAsAttribute(lcpCandidate) {
    switch (lcpCandidate.type) {
      case "img":
      case "background-image":
        return "image";
      case "video":
        return "video";
      default:
        return "fetch";
    }
  }

  // Check if resource needs crossorigin attribute
  needsCrossOrigin(url) {
    try {
      const resourceOrigin = new URL(url, window.location.href).origin;
      return resourceOrigin !== window.location.origin;
    } catch (error) {
      return false;
    }
  }

  // Detect redundant preloads
  detectRedundantPreloads(preloadLinks, lcpCandidates) {
    try {
      const redundant = [];

      preloadLinks.forEach((preload) => {
        // Check if this preload doesn't match any LCP candidate
        const hasMatchingLCP = lcpCandidates.some(
          (candidate) =>
            this.urlsMatch(candidate.src, preload.href) ||
            this.partialUrlMatch(candidate.src, preload.href)
        );

        if (!hasMatchingLCP && (preload.as === "image" || preload.as === "video")) {
          redundant.push({
            preload: preload,
            reason: "Preload for non-LCP resource",
            recommendation: "Consider removing or lowering priority",
          });
        }
      });

      return redundant;
    } catch (error) {
      console.error("Error detecting redundant preloads:", error);
      return [];
    }
  }

  // Detect invalid preloads
  detectInvalidPreloads(preloadLinks) {
    try {
      const invalid = [];

      preloadLinks.forEach((preload) => {
        if (!preload.isValid) {
          invalid.push({
            preload: preload,
            errors: preload.validationErrors,
            recommendation: "Fix preload link attributes",
          });
        }

        // Additional validation checks
        if (preload.as === "image" && !preload.href) {
          invalid.push({
            preload: preload,
            errors: ["Image preload missing href"],
            recommendation: "Add valid href attribute",
          });
        }

        if (preload.as === "video" && !preload.href) {
          invalid.push({
            preload: preload,
            errors: ["Video preload missing href"],
            recommendation: "Add valid href attribute",
          });
        }
      });

      return invalid;
    } catch (error) {
      console.error("Error detecting invalid preloads:", error);
      return [];
    }
  }

  // Generate LCP preload recommendations
  generateLCPPreloadRecommendations(preloadValidation) {
    try {
      const recommendations = [];

      // Recommend preloads for missing LCP elements
      preloadValidation.lcpElementsWithoutPreload.forEach((item) => {
        if (item.recommendedPreload) {
          recommendations.push({
            type: "add-preload",
            priority: "high",
            element: item.lcpCandidate,
            recommendation: item.recommendedPreload,
            impact: "Improves LCP by preloading critical resource",
            htmlExample: this.generatePreloadHTML(item.recommendedPreload),
          });
        }
      });

      // Recommend removing redundant preloads
      preloadValidation.redundantPreloads.forEach((item) => {
        recommendations.push({
          type: "remove-redundant-preload",
          priority: "medium",
          preload: item.preload,
          reason: item.reason,
          impact: "Reduces unnecessary resource loading",
        });
      });

      // Recommend fixing invalid preloads
      preloadValidation.invalidPreloads.forEach((item) => {
        recommendations.push({
          type: "fix-invalid-preload",
          priority: "high",
          preload: item.preload,
          errors: item.errors,
          recommendation: item.recommendation,
          impact: "Ensures preload links work correctly",
        });
      });

      return recommendations;
    } catch (error) {
      console.error("Error generating LCP preload recommendations:", error);
      return [];
    }
  }

  // Generate HTML example for preload
  generatePreloadHTML(preloadRecommendation) {
    try {
      let html = `<link rel="preload" href="${preloadRecommendation.href}" as="${preloadRecommendation.as}"`;

      if (preloadRecommendation.type) {
        html += ` type="${preloadRecommendation.type}"`;
      }

      if (preloadRecommendation.fetchpriority) {
        html += ` fetchpriority="${preloadRecommendation.fetchpriority}"`;
      }

      if (preloadRecommendation.crossorigin) {
        html += ` crossorigin="${preloadRecommendation.crossorigin}"`;
      }

      html += ">";

      return html;
    } catch (error) {
      return "";
    }
  }

  // Analyze scripts for optimization opportunities
  analyzeScripts(htmlStructure = null) {
    try {
      console.log("Analyzing scripts for optimization opportunities...");

      // Use provided structure or fallback to live DOM analysis
      let structure = htmlStructure || this.htmlStructure;

      // If no structure available, analyze live DOM directly
      if (!structure || !structure.head) {
        console.log("No HTML structure available, analyzing live DOM directly...");
        structure = this.analyzeLiveDOM();
      }

      if (!structure) {
        console.warn("Unable to analyze scripts - no DOM structure available");
        return this.getEmptyScriptAnalysis();
      }

      const result = {
        duplicates: [],
        deferScripts: [],
        asyncScripts: [],
        totalExternalScripts: 0,
        recommendations: [],
      };

      // Get all external scripts from head and body with safe access
      const headScripts = structure.head && structure.head.scripts ? structure.head.scripts : [];
      const bodyScripts = structure.body && structure.body.scripts ? structure.body.scripts : [];
      const allScripts = [...headScripts, ...bodyScripts];

      // Filter to only external scripts (those with src attribute)
      const externalScripts = allScripts.filter((script) => {
        const src = script.getAttribute("src");
        return src && src.trim().length > 0;
      });

      result.totalExternalScripts = externalScripts.length;

      // Detect duplicate scripts
      result.duplicates = this.detectDuplicateScripts(externalScripts);

      // Catalog defer and async scripts (including all scripts, not just external ones)
      result.deferScripts = this.catalogDeferScripts(headScripts);
      result.asyncScripts = this.catalogAsyncScripts(headScripts);

      // Debug logging for script detection
      console.log("Script Analysis Debug:", {
        totalScripts: allScripts.length,
        headScripts: headScripts.length,
        bodyScripts: bodyScripts.length,
        externalScripts: externalScripts.length,
        deferScripts: result.deferScripts.length,
        asyncScripts: result.asyncScripts.length,
      });

      // Generate script optimization recommendations
      result.recommendations = this.generateScriptRecommendations(result, externalScripts);

      console.log("Script analysis complete:", result);
      return result;
    } catch (error) {
      console.error("Error analyzing scripts:", error);
      return {
        duplicates: [],
        deferScripts: [],
        asyncScripts: [],
        totalExternalScripts: 0,
        recommendations: [],
        error: error.message,
      };
    }
  }

  // Detect duplicate script src includes
  detectDuplicateScripts(scripts) {
    try {
      const srcCounts = {};
      const duplicates = [];

      // Count occurrences of each script src
      scripts.forEach((script) => {
        const src = script.getAttribute("src");
        if (src) {
          const normalizedSrc = this.normalizeSrc(src);
          srcCounts[normalizedSrc] = (srcCounts[normalizedSrc] || 0) + 1;
        }
      });

      // Find duplicates (src that appears more than once)
      Object.entries(srcCounts).forEach(([src, count]) => {
        if (count > 1) {
          duplicates.push(src);
        }
      });

      return duplicates;
    } catch (error) {
      console.error("Error detecting duplicate scripts:", error);
      return [];
    }
  }

  // Catalog defer scripts in HEAD
  catalogDeferScripts(headScripts) {
    try {
      const deferScripts = [];

      headScripts.forEach((script, index) => {
        const src = script.getAttribute("src");
        const hasDefer = script.hasAttribute("defer");

        console.log(`Script ${index}:`, {
          src: src || "(inline)",
          hasDefer: hasDefer,
          hasAsync: script.hasAttribute("async"),
          type: script.getAttribute("type"),
        });

        if (hasDefer) {
          if (src) {
            deferScripts.push({
              src: this.normalizeSrc(src),
              type: "external",
              element: script,
            });
          } else {
            deferScripts.push({
              src: "(inline script)",
              type: "inline",
              element: script,
            });
          }
        }
      });

      console.log(`Found ${deferScripts.length} defer scripts:`, deferScripts);
      return deferScripts;
    } catch (error) {
      console.error("Error cataloging defer scripts:", error);
      return [];
    }
  }

  // Catalog async scripts in HEAD
  catalogAsyncScripts(headScripts) {
    try {
      const asyncScripts = [];

      headScripts.forEach((script, index) => {
        const src = script.getAttribute("src");
        const hasAsync = script.hasAttribute("async");

        if (hasAsync) {
          if (src) {
            asyncScripts.push({
              src: this.normalizeSrc(src),
              type: "external",
              element: script,
            });
          } else {
            asyncScripts.push({
              src: "(inline script)",
              type: "inline",
              element: script,
            });
          }
        }
      });

      console.log(`Found ${asyncScripts.length} async scripts:`, asyncScripts);
      return asyncScripts;
    } catch (error) {
      console.error("Error cataloging async scripts:", error);
      return [];
    }
  }

  // Generate script optimization recommendations
  generateScriptRecommendations(analysisResult, allScripts) {
    try {
      const recommendations = [];

      // Recommendation for duplicate scripts
      if (analysisResult.duplicates.length > 0) {
        recommendations.push({
          type: "duplicate_scripts",
          severity: "high",
          message: `Found ${analysisResult.duplicates.length} duplicate script(s). Remove duplicates to reduce bundle size and improve load performance.`,
          duplicateScripts: analysisResult.duplicates,
          impact: "Reduces network requests and improves page load time",
        });
      }

      // Recommendation for defer script optimization
      if (analysisResult.deferScripts.length > 0) {
        recommendations.push({
          type: "defer_optimization",
          severity: "medium",
          message: `Found ${analysisResult.deferScripts.length} defer script(s). Consider further delaying non-critical scripts or moving them to the end of the body.`,
          deferScripts: analysisResult.deferScripts,
          impact: "Improves initial page rendering by delaying script execution",
        });
      }

      // Recommendation for async script validation
      if (analysisResult.asyncScripts.length > 0) {
        recommendations.push({
          type: "async_validation",
          severity: "low",
          message: `Found ${analysisResult.asyncScripts.length} async script(s). Ensure these scripts don't depend on DOM ready state or other scripts.`,
          asyncScripts: analysisResult.asyncScripts,
          impact: "Prevents potential race conditions and ensures proper script execution",
        });
      }

      // Check for redundant preload links for scripts
      const redundantPreloads = this.detectRedundantScriptPreloads(allScripts);
      if (redundantPreloads.length > 0) {
        recommendations.push({
          type: "redundant_preloads",
          severity: "medium",
          message: `Found ${redundantPreloads.length} redundant preload(s) for scripts already marked with defer/async. Remove redundant preloads to avoid unnecessary network requests.`,
          redundantPreloads: redundantPreloads,
          impact: "Reduces unnecessary network requests and improves resource loading efficiency",
        });
      }

      // General script loading best practices
      const blockingScripts = this.detectBlockingScripts(allScripts);
      if (blockingScripts.length > 0) {
        recommendations.push({
          type: "blocking_scripts",
          severity: "high",
          message: `Found ${blockingScripts.length} render-blocking script(s) in HEAD without defer/async. Add defer or async attributes to improve page rendering performance.`,
          blockingScripts: blockingScripts,
          impact:
            "Significantly improves First Contentful Paint and Largest Contentful Paint metrics",
        });
      }

      return recommendations;
    } catch (error) {
      console.error("Error generating script recommendations:", error);
      return [];
    }
  }

  // Detect redundant preload links for scripts with defer/async
  detectRedundantScriptPreloads(scripts) {
    try {
      const redundantPreloads = [];

      if (!this.htmlStructure || !this.htmlStructure.head || !this.htmlStructure.head.links) {
        return redundantPreloads;
      }

      // Get all preload links for scripts from the links array
      const scriptPreloads = this.htmlStructure.head.links.filter((link) => {
        const rel = link.getAttribute("rel");
        const as = link.getAttribute("as");
        return rel === "preload" && as === "script";
      });

      // Get all defer/async scripts
      const deferAsyncScripts = scripts.filter((script) => {
        return script.hasAttribute("defer") || script.hasAttribute("async");
      });

      // Check for redundant preloads
      scriptPreloads.forEach((preload) => {
        const preloadHref = this.normalizeSrc(preload.getAttribute("href") || "");

        deferAsyncScripts.forEach((script) => {
          const scriptSrc = this.normalizeSrc(script.getAttribute("src") || "");

          if (preloadHref === scriptSrc) {
            redundantPreloads.push({
              preloadHref: preload.getAttribute("href"),
              scriptSrc: script.getAttribute("src"),
              scriptAttributes: {
                defer: script.hasAttribute("defer"),
                async: script.hasAttribute("async"),
              },
            });
          }
        });
      });

      return redundantPreloads;
    } catch (error) {
      console.error("Error detecting redundant script preloads:", error);
      return [];
    }
  }

  // Detect render-blocking scripts
  detectBlockingScripts(scripts) {
    try {
      const blockingScripts = [];

      // Get scripts in HEAD that don't have defer or async
      const headScripts =
        this.htmlStructure.head && this.htmlStructure.head.scripts
          ? this.htmlStructure.head.scripts
          : [];

      headScripts.forEach((script) => {
        const src = script.getAttribute("src");
        const hasDefer = script.hasAttribute("defer");
        const hasAsync = script.hasAttribute("async");

        // External scripts in HEAD without defer/async are render-blocking
        if (src && src.trim().length > 0 && !hasDefer && !hasAsync) {
          blockingScripts.push({
            src: src,
            position: "head",
            recommendation:
              "Add defer attribute for non-critical scripts or async for independent scripts",
          });
        }
      });

      return blockingScripts;
    } catch (error) {
      console.error("Error detecting blocking scripts:", error);
      return [];
    }
  }

  // Normalize script src for comparison (handle relative URLs, query params, etc.)
  normalizeSrc(src) {
    try {
      // Remove leading/trailing whitespace
      let normalized = src.trim();

      // Convert relative URLs to absolute for comparison
      if (normalized.startsWith("//")) {
        normalized = window.location.protocol + normalized;
      } else if (normalized.startsWith("/")) {
        normalized = window.location.origin + normalized;
      } else if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
        // Handle relative paths
        const base = window.location.href.substring(0, window.location.href.lastIndexOf("/") + 1);
        normalized = base + normalized;
      }

      // Remove fragment identifiers for comparison
      const hashIndex = normalized.indexOf("#");
      if (hashIndex !== -1) {
        normalized = normalized.substring(0, hashIndex);
      }

      return normalized;
    } catch (error) {
      console.error("Error normalizing script src:", error);
      return src;
    }
  }

  // Analyze link tags for validation and optimization opportunities
  analyzeLinks(htmlStructure = null) {
    try {
      console.log("Analyzing link tags for optimization opportunities...");

      // Use provided structure or fallback to live DOM analysis
      let structure = htmlStructure || this.htmlStructure;

      // If no structure available, analyze live DOM directly
      if (!structure || !structure.head) {
        console.log("No HTML structure available, analyzing live DOM directly...");
        structure = this.analyzeLiveDOM();
      }

      if (!structure) {
        console.warn("Unable to analyze links - no DOM structure available");
        return this.getEmptyLinkAnalysis();
      }

      const result = {
        bodyLinks: [],
        duplicatePreloads: [],
        invalidPreloads: [],
        redundantPreloads: [],
        totalPreloads: 0,
        lcpPreloadMissing: {
          missing: false,
          resourceUrl: null,
        },
        analysis: {
          headLinks: 0,
          bodyLinks: 0,
          preloadLinks: 0,
          prefetchLinks: 0,
          preconnectLinks: 0,
          dnsPrefetchLinks: 0,
        },
        validation: {
          invalidRelValues: [],
          missingCrossorigin: [],
          inefficientPreloads: [],
          securityIssues: [],
          performanceIssues: [],
          accessibilityIssues: [],
          totalIssues: 0,
          recommendations: [],
        },
      };

      // Get all link elements from HTML structure with safe access
      const headLinks = structure.head && structure.head.links ? structure.head.links : [];
      const bodyLinks = structure.body && structure.body.links ? structure.body.links : [];
      const allLinks = [...headLinks, ...bodyLinks];

      // Update analysis counts
      result.analysis.headLinks = headLinks.length;
      result.analysis.bodyLinks = bodyLinks.length;

      // 1. Detect misplaced links (preload/prefetch in BODY)
      result.bodyLinks = this.detectMisplacedLinks(bodyLinks);

      // 2. Detect duplicate preload links
      const preloadLinks = allLinks.filter(
        (link) => link.getAttribute && link.getAttribute("rel") === "preload"
      );
      result.analysis.preloadLinks = preloadLinks.length;
      result.totalPreloads = preloadLinks.length;
      result.duplicatePreloads = this.detectDuplicatePreloads(preloadLinks);

      // 3. Detect invalid preload rel values
      result.invalidPreloads = this.detectInvalidPreloads(allLinks);

      // 4. Detect redundant preloads for defer/async scripts
      result.redundantPreloads = this.detectRedundantPreloads(preloadLinks);

      // 5. Check if LCP element has corresponding preload
      result.lcpPreloadMissing = this.checkLCPPreload(preloadLinks);

      // 6. Comprehensive link tag validation (NEW)
      result.validation = this.validateLinkTagBestPractices(allLinks);

      // Count other link types for analysis
      result.analysis.prefetchLinks = allLinks.filter(
        (link) => link.getAttribute && link.getAttribute("rel") === "prefetch"
      ).length;

      result.analysis.preconnectLinks = allLinks.filter(
        (link) => link.getAttribute && link.getAttribute("rel") === "preconnect"
      ).length;

      result.analysis.dnsPrefetchLinks = allLinks.filter(
        (link) => link.getAttribute && link.getAttribute("rel") === "dns-prefetch"
      ).length;

      console.log("Link analysis complete:", result);
      return result;
    } catch (error) {
      console.error("Error analyzing links:", error);
      return {
        bodyLinks: [],
        duplicatePreloads: [],
        invalidPreloads: [],
        redundantPreloads: [],
        totalPreloads: 0,
        lcpPreloadMissing: {
          missing: false,
          resourceUrl: null,
        },
        analysis: {
          headLinks: 0,
          bodyLinks: 0,
          preloadLinks: 0,
          prefetchLinks: 0,
          preconnectLinks: 0,
          dnsPrefetchLinks: 0,
        },
        validation: {
          invalidRelValues: [],
          missingCrossorigin: [],
          inefficientPreloads: [],
          securityIssues: [],
          performanceIssues: [],
          accessibilityIssues: [],
          totalIssues: 0,
          recommendations: [],
        },
        error: error.message,
      };
    }
  }

  // Detect misplaced preload/prefetch links in BODY
  detectMisplacedLinks(bodyLinks) {
    const misplacedLinks = [];

    try {
      bodyLinks.forEach((link) => {
        if (!link.getAttribute) return;

        const rel = link.getAttribute("rel");
        const href = link.getAttribute("href");

        // Check for preload, prefetch, preconnect, dns-prefetch in body
        if (["preload", "prefetch", "preconnect", "dns-prefetch"].includes(rel)) {
          misplacedLinks.push({
            href: href || "unknown",
            rel: rel,
            reason: `${rel} link should be in HEAD for optimal performance`,
          });
        }
      });

      console.log(`Found ${misplacedLinks.length} misplaced links in BODY`);
      return misplacedLinks.map((link) => link.href);
    } catch (error) {
      console.error("Error detecting misplaced links:", error);
      return [];
    }
  }

  // Detect duplicate preload links
  detectDuplicatePreloads(preloadLinks) {
    const duplicates = [];
    const seenHrefs = new Map();

    try {
      preloadLinks.forEach((link) => {
        if (!link.getAttribute) return;

        const href = link.getAttribute("href");
        if (!href) return;

        // Normalize href for comparison
        const normalizedHref = this.normalizeUrl(href);

        if (seenHrefs.has(normalizedHref)) {
          // This is a duplicate
          duplicates.push(href);
          seenHrefs.get(normalizedHref).count++;
        } else {
          seenHrefs.set(normalizedHref, {
            originalHref: href,
            count: 1,
          });
        }
      });

      console.log(`Found ${duplicates.length} duplicate preload links`);
      return duplicates;
    } catch (error) {
      console.error("Error detecting duplicate preloads:", error);
      return [];
    }
  }

  // Detect invalid preload rel values
  detectInvalidPreloads(allLinks) {
    const invalidPreloads = [];

    try {
      allLinks.forEach((link) => {
        if (!link.getAttribute) return;

        const rel = link.getAttribute("rel");
        const href = link.getAttribute("href");
        const as = link.getAttribute("as");

        // Check if it's a preload link
        if (rel === "preload") {
          // Validate 'as' attribute for preload links
          const validAsValues = [
            "audio",
            "document",
            "embed",
            "fetch",
            "font",
            "image",
            "object",
            "script",
            "style",
            "track",
            "video",
            "worker",
          ];

          if (!as) {
            invalidPreloads.push({
              href: href || "unknown",
              reason: 'Preload link missing required "as" attribute',
            });
          } else if (!validAsValues.includes(as)) {
            invalidPreloads.push({
              href: href || "unknown",
              reason: `Invalid "as" value: "${as}". Valid values: ${validAsValues.join(", ")}`,
            });
          }

          // Check for font preloads without crossorigin
          if (as === "font" && !link.getAttribute("crossorigin")) {
            invalidPreloads.push({
              href: href || "unknown",
              reason: 'Font preload should include crossorigin="anonymous" attribute',
            });
          }
        }
      });

      console.log(`Found ${invalidPreloads.length} invalid preload links`);
      return invalidPreloads.map((invalid) => invalid.href);
    } catch (error) {
      console.error("Error detecting invalid preloads:", error);
      return [];
    }
  }

  // Detect redundant preloads for scripts already marked with defer/async
  detectRedundantPreloads(preloadLinks) {
    const redundantPreloads = [];

    try {
      if (!this.htmlStructure || !this.htmlStructure.all) {
        return redundantPreloads;
      }

      // Get all script elements
      const allScripts = this.htmlStructure.all.scripts || [];

      // Create a map of script sources with their loading attributes
      const scriptMap = new Map();
      allScripts.forEach((script) => {
        if (!script.getAttribute) return;

        const src = script.getAttribute("src");
        if (src) {
          const normalizedSrc = this.normalizeUrl(src);
          const hasDefer = script.hasAttribute("defer");
          const hasAsync = script.hasAttribute("async");

          scriptMap.set(normalizedSrc, {
            src: src,
            defer: hasDefer,
            async: hasAsync,
            optimized: hasDefer || hasAsync,
          });
        }
      });

      // Check preload links against script map
      preloadLinks.forEach((link) => {
        if (!link.getAttribute) return;

        const href = link.getAttribute("href");
        const as = link.getAttribute("as");

        if (href && as === "script") {
          const normalizedHref = this.normalizeUrl(href);
          const scriptInfo = scriptMap.get(normalizedHref);

          if (scriptInfo && scriptInfo.optimized) {
            redundantPreloads.push({
              href: href,
              reason: `Script already optimized with ${
                scriptInfo.defer ? "defer" : "async"
              } attribute`,
            });
          }
        }
      });

      console.log(`Found ${redundantPreloads.length} redundant preload links`);
      return redundantPreloads.map((redundant) => redundant.href);
    } catch (error) {
      console.error("Error detecting redundant preloads:", error);
      return [];
    }
  }

  // Check if LCP element has corresponding preload in HEAD
  checkLCPPreload(preloadLinks) {
    try {
      // This method will be enhanced when LCP analysis is implemented
      // For now, return a placeholder structure

      const result = {
        missing: false,
        resourceUrl: null,
        analysis: {
          lcpElementFound: false,
          lcpElementType: null,
          preloadExists: false,
          recommendation: null,
        },
      };

      // TODO: This will be implemented when LCP analysis (task 4) is integrated
      // For now, we'll check if there are any image preloads as a basic check
      const imagePreloads = preloadLinks.filter((link) => {
        if (!link.getAttribute) return false;
        return link.getAttribute("as") === "image";
      });

      result.analysis.preloadExists = imagePreloads.length > 0;

      if (imagePreloads.length === 0) {
        result.missing = true;
        result.analysis.recommendation = "Consider adding preload for LCP image if identified";
      }

      console.log("LCP preload check complete:", result);
      return result;
    } catch (error) {
      console.error("Error checking LCP preload:", error);
      return {
        missing: false,
        resourceUrl: null,
        analysis: {
          lcpElementFound: false,
          lcpElementType: null,
          preloadExists: false,
          recommendation: null,
        },
        error: error.message,
      };
    }
  }

  // Comprehensive link tag validation with best practices checking
  validateLinkTagBestPractices(allLinks) {
    try {
      console.log("Performing comprehensive link tag validation...");

      const validationResults = {
        invalidRelValues: [],
        missingCrossorigin: [],
        inefficientPreloads: [],
        securityIssues: [],
        performanceIssues: [],
        accessibilityIssues: [],
        totalIssues: 0,
        recommendations: [],
      };

      allLinks.forEach((link) => {
        if (!link.getAttribute) return;

        const rel = link.getAttribute("rel");
        const href = link.getAttribute("href");
        const as = link.getAttribute("as");
        const crossorigin = link.getAttribute("crossorigin");
        const type = link.getAttribute("type");
        const media = link.getAttribute("media");

        // 1. Validate rel attribute values
        const relValidation = this.validateRelAttribute(rel, as, href);
        if (!relValidation.isValid) {
          validationResults.invalidRelValues.push({
            href: href || "unknown",
            rel: rel,
            issue: relValidation.issue,
            recommendation: relValidation.recommendation,
          });
        }

        // 2. Check for missing crossorigin on font preloads
        if (rel === "preload" && as === "font" && !crossorigin) {
          validationResults.missingCrossorigin.push({
            href: href || "unknown",
            issue: "Font preload missing crossorigin attribute",
            recommendation: 'Add crossorigin="anonymous" for proper CORS handling',
          });
        }

        // 3. Check for inefficient preload usage
        const preloadEfficiency = this.validatePreloadEfficiency(rel, as, type, href);
        if (!preloadEfficiency.isEfficient) {
          validationResults.inefficientPreloads.push({
            href: href || "unknown",
            issue: preloadEfficiency.issue,
            recommendation: preloadEfficiency.recommendation,
          });
        }

        // 4. Security validation
        const securityValidation = this.validateLinkSecurity(rel, href, crossorigin);
        if (securityValidation.hasIssues) {
          validationResults.securityIssues.push({
            href: href || "unknown",
            issue: securityValidation.issue,
            severity: securityValidation.severity,
            recommendation: securityValidation.recommendation,
          });
        }

        // 5. Performance validation
        const performanceValidation = this.validateLinkPerformance(rel, as, media, href);
        if (performanceValidation.hasIssues) {
          validationResults.performanceIssues.push({
            href: href || "unknown",
            issue: performanceValidation.issue,
            impact: performanceValidation.impact,
            recommendation: performanceValidation.recommendation,
          });
        }

        // 6. Accessibility validation
        const accessibilityValidation = this.validateLinkAccessibility(rel, type, href);
        if (accessibilityValidation.hasIssues) {
          validationResults.accessibilityIssues.push({
            href: href || "unknown",
            issue: accessibilityValidation.issue,
            recommendation: accessibilityValidation.recommendation,
          });
        }
      });

      // Calculate total issues and generate overall recommendations
      validationResults.totalIssues =
        validationResults.invalidRelValues.length +
        validationResults.missingCrossorigin.length +
        validationResults.inefficientPreloads.length +
        validationResults.securityIssues.length +
        validationResults.performanceIssues.length +
        validationResults.accessibilityIssues.length;

      validationResults.recommendations =
        this.generateLinkOptimizationRecommendations(validationResults);

      console.log(`Link validation complete: ${validationResults.totalIssues} issues found`);
      return validationResults;
    } catch (error) {
      console.error("Error in comprehensive link validation:", error);
      return {
        invalidRelValues: [],
        missingCrossorigin: [],
        inefficientPreloads: [],
        securityIssues: [],
        performanceIssues: [],
        accessibilityIssues: [],
        totalIssues: 0,
        recommendations: [],
        error: error.message,
      };
    }
  }

  // Validate rel attribute values
  validateRelAttribute(rel, as, href) {
    const validRelValues = [
      "alternate",
      "author",
      "bookmark",
      "canonical",
      "dns-prefetch",
      "external",
      "help",
      "icon",
      "license",
      "manifest",
      "modulepreload",
      "next",
      "nofollow",
      "noopener",
      "noreferrer",
      "opener",
      "pingback",
      "preconnect",
      "prefetch",
      "preload",
      "prev",
      "search",
      "shortlink",
      "stylesheet",
      "tag",
    ];

    if (!rel) {
      return {
        isValid: false,
        issue: "Missing rel attribute",
        recommendation: "Add appropriate rel attribute to define link relationship",
      };
    }

    // Split multiple rel values
    const relValues = rel.toLowerCase().split(/\s+/);

    for (const relValue of relValues) {
      if (!validRelValues.includes(relValue)) {
        return {
          isValid: false,
          issue: `Invalid rel value: "${relValue}"`,
          recommendation: `Use valid rel values: ${validRelValues.join(", ")}`,
        };
      }
    }

    // Special validation for preload
    if (relValues.includes("preload")) {
      if (!as) {
        return {
          isValid: false,
          issue: 'Preload link missing required "as" attribute',
          recommendation: 'Add "as" attribute to specify resource type for preload',
        };
      }

      const validAsValues = [
        "audio",
        "document",
        "embed",
        "fetch",
        "font",
        "image",
        "object",
        "script",
        "style",
        "track",
        "video",
        "worker",
      ];

      if (!validAsValues.includes(as)) {
        return {
          isValid: false,
          issue: `Invalid "as" value for preload: "${as}"`,
          recommendation: `Use valid "as" values: ${validAsValues.join(", ")}`,
        };
      }
    }

    return { isValid: true };
  }

  // Validate preload efficiency
  validatePreloadEfficiency(rel, as, type, href) {
    if (rel !== "preload") {
      return { isEfficient: true };
    }

    // Check for unnecessary preloads
    if (as === "script") {
      // Check if this script is already optimized with defer/async
      // This check is already done in detectRedundantPreloads, but we include it here for completeness
      return {
        isEfficient: true, // Will be caught by redundant preload detection
      };
    }

    // Check for overly aggressive preloading
    if (as === "image" && href) {
      try {
        const url = new URL(href, window.location.href);
        const fileExtension = url.pathname.split(".").pop().toLowerCase();

        // Warn about preloading large image formats without optimization
        if (["bmp", "tiff", "tif"].includes(fileExtension)) {
          return {
            isEfficient: false,
            issue: "Preloading unoptimized image format",
            recommendation: "Consider using WebP, AVIF, or optimized JPEG/PNG formats",
          };
        }
      } catch (error) {
        // URL parsing failed, skip this check
      }
    }

    // Check for preloading resources that might not be critical
    if (as === "font" && !href.includes("woff")) {
      return {
        isEfficient: false,
        issue: "Preloading non-WOFF font format",
        recommendation: "Consider using WOFF2 format for better compression and performance",
      };
    }

    return { isEfficient: true };
  }

  // Validate link security
  validateLinkSecurity(rel, href, crossorigin) {
    const result = {
      hasIssues: false,
      issue: null,
      severity: "low",
      recommendation: null,
    };

    if (!href) return result;

    try {
      const url = new URL(href, window.location.href);

      // Check for external resources without proper security attributes
      if (url.origin !== window.location.origin) {
        // External preconnect without proper attributes
        if (rel === "preconnect" && !crossorigin) {
          result.hasIssues = true;
          result.issue = "External preconnect without crossorigin attribute";
          result.severity = "medium";
          result.recommendation = "Add crossorigin attribute for external preconnect links";
        }

        // External font preload without crossorigin
        if (rel === "preload" && href.includes("font") && !crossorigin) {
          result.hasIssues = true;
          result.issue = "External font preload without crossorigin attribute";
          result.severity = "high";
          result.recommendation = 'Add crossorigin="anonymous" for external font preloads';
        }

        // HTTP resources on HTTPS pages
        if (window.location.protocol === "https:" && url.protocol === "http:") {
          result.hasIssues = true;
          result.issue = "Mixed content: HTTP resource on HTTPS page";
          result.severity = "high";
          result.recommendation = "Use HTTPS URLs to avoid mixed content issues";
        }
      }

      return result;
    } catch (error) {
      // URL parsing failed
      result.hasIssues = true;
      result.issue = "Invalid URL format";
      result.severity = "medium";
      result.recommendation = "Ensure URL is properly formatted";
      return result;
    }
  }

  // Validate link performance impact
  validateLinkPerformance(rel, as, media, href) {
    const result = {
      hasIssues: false,
      issue: null,
      impact: "low",
      recommendation: null,
    };

    // Check for unused media queries
    if (rel === "stylesheet" && media && media !== "all" && media !== "screen") {
      // This is a basic check - in a real implementation, you'd want to evaluate the media query
      if (media.includes("print") && !media.includes("screen")) {
        result.hasIssues = true;
        result.issue = "Print-only stylesheet loaded on screen";
        result.impact = "medium";
        result.recommendation = "Consider loading print stylesheets only when needed";
      }
    }

    // Check for excessive preloading
    if (rel === "preload") {
      // Count total preloads (this would need to be tracked globally)
      // For now, we'll just flag potential issues
      if (as === "image" && href) {
        try {
          const url = new URL(href, window.location.href);
          // Check for very large query parameters (might indicate dynamic/personalized content)
          if (url.search.length > 100) {
            result.hasIssues = true;
            result.issue = "Preloading resource with complex query parameters";
            result.impact = "medium";
            result.recommendation =
              "Verify that preloaded resource is truly critical and cacheable";
          }
        } catch (error) {
          // URL parsing failed, skip this check
        }
      }
    }

    return result;
  }

  // Validate link accessibility
  validateLinkAccessibility(rel, type, href) {
    const result = {
      hasIssues: false,
      issue: null,
      recommendation: null,
    };

    // Check for missing type attribute on stylesheets
    if (rel === "stylesheet" && !type) {
      result.hasIssues = true;
      result.issue = "Stylesheet missing type attribute";
      result.recommendation =
        'Add type="text/css" for better accessibility and standards compliance';
    }

    // Check for icon links without proper sizing information
    if (rel === "icon" && href && !href.includes("svg")) {
      // For raster icons, sizes attribute is recommended
      // This would need access to the actual link element to check for sizes attribute
      // For now, we'll provide a general recommendation
    }

    return result;
  }

  // Generate optimization recommendations based on validation results
  generateLinkOptimizationRecommendations(validationResults) {
    const recommendations = [];

    // High-priority recommendations
    if (validationResults.securityIssues.length > 0) {
      recommendations.push({
        priority: "high",
        category: "security",
        message: `Fix ${validationResults.securityIssues.length} security issues with external links`,
        action: "Add proper crossorigin and security attributes",
      });
    }

    if (validationResults.missingCrossorigin.length > 0) {
      recommendations.push({
        priority: "high",
        category: "performance",
        message: `Add crossorigin attributes to ${validationResults.missingCrossorigin.length} font preloads`,
        action: 'Add crossorigin="anonymous" to font preload links',
      });
    }

    // Medium-priority recommendations
    if (validationResults.invalidRelValues.length > 0) {
      recommendations.push({
        priority: "medium",
        category: "standards",
        message: `Fix ${validationResults.invalidRelValues.length} invalid rel attribute values`,
        action: "Use valid HTML5 rel attribute values",
      });
    }

    if (validationResults.inefficientPreloads.length > 0) {
      recommendations.push({
        priority: "medium",
        category: "performance",
        message: `Optimize ${validationResults.inefficientPreloads.length} inefficient preloads`,
        action: "Review preload strategy and resource formats",
      });
    }

    // Low-priority recommendations
    if (validationResults.performanceIssues.length > 0) {
      recommendations.push({
        priority: "low",
        category: "optimization",
        message: `Address ${validationResults.performanceIssues.length} performance optimization opportunities`,
        action: "Review media queries and resource loading patterns",
      });
    }

    if (validationResults.accessibilityIssues.length > 0) {
      recommendations.push({
        priority: "low",
        category: "accessibility",
        message: `Improve ${validationResults.accessibilityIssues.length} accessibility issues`,
        action: "Add missing type attributes and improve semantic markup",
      });
    }

    return recommendations;
  }

  // Normalize URL for comparison (helper method)
  normalizeUrl(url) {
    try {
      if (!url) return "";

      // Handle relative URLs
      if (url.startsWith("//")) {
        url = window.location.protocol + url;
      } else if (url.startsWith("/")) {
        url = window.location.origin + url;
      } else if (!url.startsWith("http")) {
        // Relative path
        const base = window.location.href.substring(0, window.location.href.lastIndexOf("/") + 1);
        url = base + url;
      }

      // Create URL object for normalization
      const urlObj = new URL(url);

      // Remove fragment and normalize
      urlObj.hash = "";

      return urlObj.href.toLowerCase();
    } catch (error) {
      console.error("Error normalizing URL:", error);
      return url.toLowerCase();
    }
  }

  // Analyze cache optimization opportunities
  async analyzeCache() {
    try {
      console.log("Analyzing cache optimization opportunities...");

      // Use the cache analysis results from the main analysis flow if available
      if (
        this.analysisResults &&
        this.analysisResults.cache &&
        Object.keys(this.analysisResults.cache).length > 0
      ) {
        console.log("Using existing cache analysis results");
        return this.analysisResults.cache;
      }

      // If no existing results, perform cache analysis
      console.log("Performing new cache analysis...");

      // Use the response headers that were fetched during HTML fetch
      const cacheResults = await this.analyzeCacheHeaders(this.responseHeaders);

      console.log("Cache analysis completed:", cacheResults);
      return cacheResults;
    } catch (error) {
      console.error("Error analyzing cache:", error);
      return this.getEmptyCacheData();
    }
  }

  // Analyze LCP optimization opportunities
  analyzeLCP(htmlStructure = null) {
    try {
      console.log("Analyzing LCP optimization opportunities...");

      const result = {
        elementFound: false,
        serverSideRendered: false,
        elementType: null,
        elementSelector: null,
        preloadExists: false,
        analysis: {
          candidateElements: [],
          recommendations: [],
        },
      };

      // Try to use the globally captured LCP element first
      if (lcpElement && lcpElementSelector) {
        console.log("Using globally captured LCP element:", lcpElementSelector);

        result.elementFound = true;
        result.elementSelector = lcpElementSelector;
        result.elementType = this.determineLCPElementType(lcpElement);
        result.serverSideRendered = this.isElementServerSideRendered(lcpElement);
        result.preloadExists = this.checkLCPPreloadExists(lcpElement);

        result.analysis.candidateElements.push({
          element: lcpElement,
          selector: lcpElementSelector,
          type: result.elementType,
          serverSideRendered: result.serverSideRendered,
          preloadExists: result.preloadExists,
        });

        // Add recommendations based on analysis
        if (!result.serverSideRendered) {
          result.analysis.recommendations.push({
            type: "server-side-rendering",
            priority: "high",
            description:
              "Consider server-side rendering the LCP element to improve loading performance",
          });
        }

        if (
          !result.preloadExists &&
          (result.elementType === "img" || result.elementType === "background-image")
        ) {
          result.analysis.recommendations.push({
            type: "preload-lcp-resource",
            priority: "high",
            description: "Add a preload link for the LCP resource to improve loading performance",
          });
        }

        return result;
      }

      // Fallback: Try to find LCP candidates from DOM
      console.log("No globally captured LCP element, analyzing DOM for candidates...");

      const candidates = this.findLCPCandidates();
      if (candidates.length > 0) {
        const topCandidate = candidates[0]; // Use the first/most likely candidate

        result.elementFound = true;
        result.elementSelector = this.generateElementSelector(topCandidate);
        result.elementType = this.determineLCPElementType(topCandidate);
        result.serverSideRendered = this.isElementServerSideRendered(topCandidate);
        result.preloadExists = this.checkLCPPreloadExists(topCandidate);

        result.analysis.candidateElements = candidates.map((el) => ({
          element: el,
          selector: this.generateElementSelector(el),
          type: this.determineLCPElementType(el),
          serverSideRendered: this.isElementServerSideRendered(el),
          preloadExists: this.checkLCPPreloadExists(el),
        }));

        console.log(
          `Found ${candidates.length} LCP candidates, using top candidate:`,
          result.elementSelector
        );
      }

      return result;
    } catch (error) {
      console.error("Error analyzing LCP:", error);
      return this.getEmptyLCPData();
    }
  }

  // Find potential LCP candidate elements
  findLCPCandidates() {
    const candidates = [];

    try {
      // Look for large images above the fold
      const images = document.querySelectorAll("img");
      images.forEach((img) => {
        const rect = img.getBoundingClientRect();
        const isAboveFold = rect.top < window.innerHeight;
        const isLarge = rect.width * rect.height > 10000; // Arbitrary threshold for "large"

        if (isAboveFold && isLarge && img.src) {
          candidates.push(img);
        }
      });

      // Look for elements with large background images above the fold
      const elementsWithBg = this.findBackgroundImageElements(document.body);
      elementsWithBg.forEach(({ element }) => {
        const rect = element.getBoundingClientRect();
        const isAboveFold = rect.top < window.innerHeight;
        const isLarge = rect.width * rect.height > 10000;

        if (isAboveFold && isLarge) {
          candidates.push(element);
        }
      });

      // Look for large text blocks (potential LCP text)
      const textElements = document.querySelectorAll("h1, h2, p, div");
      textElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const isAboveFold = rect.top < window.innerHeight;
        const hasSignificantText = el.textContent && el.textContent.trim().length > 50;
        const isLarge = rect.width * rect.height > 5000;

        if (isAboveFold && hasSignificantText && isLarge) {
          candidates.push(el);
        }
      });

      // Sort candidates by size (largest first)
      candidates.sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        const aSize = aRect.width * aRect.height;
        const bSize = bRect.width * bRect.height;
        return bSize - aSize;
      });
    } catch (error) {
      console.error("Error finding LCP candidates:", error);
    }

    return candidates;
  }

  // Determine the type of LCP element
  determineLCPElementType(element) {
    if (!element) return null;

    const tagName = element.tagName.toLowerCase();

    if (tagName === "img") {
      return "img";
    } else if (tagName === "video") {
      return "video";
    } else {
      // Check for background image
      const computedStyle = window.getComputedStyle(element);
      const backgroundImage = computedStyle.backgroundImage;
      if (backgroundImage && backgroundImage !== "none" && backgroundImage.includes("url(")) {
        return "background-image";
      }
    }

    return "text-block";
  }

  // Check if element is server-side rendered
  isElementServerSideRendered(element) {
    if (!element) return false;

    try {
      // Check if element has content immediately available (not loaded via JS)
      // This is a heuristic - elements present in initial HTML are likely SSR
      const hasInitialContent =
        element.textContent || element.src || (element.style && element.style.backgroundImage);

      // Check if element is not dynamically created
      const isNotDynamic =
        !element.hasAttribute("data-dynamic") &&
        !element.classList.contains("dynamic") &&
        !element.classList.contains("lazy");

      return hasInitialContent && isNotDynamic;
    } catch (error) {
      console.error("Error checking server-side rendering:", error);
      return false;
    }
  }

  // Check if LCP resource has a preload link
  checkLCPPreloadExists(element) {
    if (!element) return false;

    try {
      let resourceUrl = null;

      // Get resource URL based on element type
      if (element.tagName.toLowerCase() === "img") {
        resourceUrl = element.src;
      } else {
        // Check for background image
        const computedStyle = window.getComputedStyle(element);
        const backgroundImage = computedStyle.backgroundImage;
        if (backgroundImage && backgroundImage.includes("url(")) {
          const urlMatch = backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
          if (urlMatch && urlMatch[1]) {
            resourceUrl = urlMatch[1];
          }
        }
      }

      if (!resourceUrl) return false;

      // Check if there's a preload link for this resource
      const preloadLinks = document.querySelectorAll('link[rel="preload"]');
      for (const link of preloadLinks) {
        if (link.href === resourceUrl || link.href.includes(resourceUrl)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Error checking LCP preload:", error);
      return false;
    }
  }

  // Analyze CSS loading patterns and optimization opportunities
  analyzeCSS(htmlStructure = null) {
    try {
      console.log("Analyzing CSS loading patterns and optimization opportunities...");

      // Use provided structure or fallback to live DOM analysis
      let structure = htmlStructure || this.htmlStructure;

      // If no structure available, analyze live DOM directly
      if (!structure || !structure.head) {
        console.log("No HTML structure available, analyzing live DOM directly...");
        structure = this.analyzeLiveDOM();
      }

      if (!structure || !structure.head) {
        console.warn("Unable to analyze CSS - no DOM structure available");
        return this.getEmptyCSSAnalysis();
      }

      const results = {
        stylesheets: [],
        totalStylesheets: 0,
        misplacedCount: 0,
        duplicateCount: 0,
        analysis: {
          headStylesheets: [],
          bodyStylesheets: [],
          duplicates: [],
          recommendations: [],
        },
        metadata: {
          analysisTimestamp: Date.now(),
          url: window.location.href,
        },
      };

      // Get all stylesheet links from the parsed HTML structure
      const allLinks = [...(structure.head.links || []), ...(structure.body.links || [])];

      console.log(`CSS Analysis Debug: Found ${allLinks.length} total links`);
      console.log(
        `Head links: ${structure.head && structure.head.links ? structure.head.links.length : 0}`
      );
      console.log(
        `Body links: ${structure.body && structure.body.links ? structure.body.links.length : 0}`
      );

      // Debug: Log first few links to see their structure
      if (allLinks.length > 0) {
        console.log(
          "Sample links:",
          allLinks.slice(0, 3).map((link) => ({
            tagName: link.tagName,
            rel: link.getAttribute ? link.getAttribute("rel") : "no getAttribute method",
            href: link.getAttribute ? link.getAttribute("href") : "no getAttribute method",
          }))
        );
      }

      // Filter for stylesheet links
      const stylesheetLinks = allLinks.filter((link) => {
        if (!link.getAttribute) {
          console.log("Link without getAttribute method:", link);
          return false;
        }
        const rel = link.getAttribute("rel");
        const isStylesheet = rel && rel.toLowerCase().includes("stylesheet");
        if (rel) {
          console.log(`Link rel="${rel}", isStylesheet=${isStylesheet}`);
        }
        return isStylesheet;
      });

      console.log(`CSS Analysis Debug: Found ${stylesheetLinks.length} stylesheet links`);
      results.totalStylesheets = stylesheetLinks.length;

      // Analyze each stylesheet
      const seenHrefs = new Map();

      stylesheetLinks.forEach((link, index) => {
        const href = link.getAttribute("href");
        const media = link.getAttribute("media") || "all";
        const type = link.getAttribute("type") || "text/css";
        const disabled = link.hasAttribute("disabled");

        // Determine placement (HEAD vs BODY) with safe access
        const headLinks = structure.head && structure.head.links ? structure.head.links : [];
        const isInHead = headLinks.includes(link);
        const placement = isInHead ? "head" : "body";

        if (!isInHead) {
          results.misplacedCount++;
        }

        // Check for duplicates
        let isDuplicate = false;
        if (href) {
          const normalizedHref = this.normalizeUrl(href);
          if (seenHrefs.has(normalizedHref)) {
            isDuplicate = true;
            results.duplicateCount++;
            results.analysis.duplicates.push({
              href: href,
              normalizedHref: normalizedHref,
              firstOccurrence: seenHrefs.get(normalizedHref).index,
              currentIndex: index,
            });
          } else {
            seenHrefs.set(normalizedHref, {
              href: href,
              index: index,
            });
          }
        }

        // Create stylesheet entry
        const stylesheetEntry = {
          href: href || `inline-${index}`,
          media: media,
          type: type,
          placement: placement,
          isDuplicate: isDuplicate,
          disabled: disabled,
          index: index,
        };

        results.stylesheets.push(stylesheetEntry);

        // Categorize by placement
        if (isInHead) {
          results.analysis.headStylesheets.push(stylesheetEntry);
        } else {
          results.analysis.bodyStylesheets.push(stylesheetEntry);
        }
      });

      // Generate recommendations based on analysis
      results.analysis.recommendations = this.generateCSSRecommendations(results);

      console.log(`CSS analysis complete: ${results.totalStylesheets} stylesheets analyzed`);
      console.log(
        `Found ${results.misplacedCount} misplaced and ${results.duplicateCount} duplicate stylesheets`
      );

      return results;
    } catch (error) {
      console.error("Error analyzing CSS:", error);
      return {
        stylesheets: [],
        totalStylesheets: 0,
        misplacedCount: 0,
        duplicateCount: 0,
        analysis: {
          headStylesheets: [],
          bodyStylesheets: [],
          duplicates: [],
          recommendations: [],
        },
        metadata: {
          analysisTimestamp: Date.now(),
          url: window.location.href,
        },
        error: error.message,
      };
    }
  }

  // Generate CSS optimization recommendations
  generateCSSRecommendations(cssResults) {
    const recommendations = [];

    // Recommendation for misplaced stylesheets
    if (cssResults.misplacedCount > 0) {
      recommendations.push({
        type: "placement",
        priority: "high",
        issue: `${cssResults.misplacedCount} stylesheet(s) found in BODY instead of HEAD`,
        impact: "Render-blocking resources in BODY can cause layout shifts and delayed rendering",
        recommendation: "Move all stylesheet links to the HEAD section for optimal loading",
        affectedStylesheets: cssResults.analysis.bodyStylesheets.map((s) => s.href),
      });
    }

    // Recommendation for duplicate stylesheets
    if (cssResults.duplicateCount > 0) {
      recommendations.push({
        type: "duplicates",
        priority: "medium",
        issue: `${cssResults.duplicateCount} duplicate stylesheet(s) detected`,
        impact: "Duplicate stylesheets increase bandwidth usage and parsing time",
        recommendation: "Remove duplicate stylesheet references to improve loading performance",
        affectedStylesheets: cssResults.analysis.duplicates.map((d) => d.href),
      });
    }

    // Recommendation for CSS optimization opportunities
    const totalStylesheets = cssResults.totalStylesheets;
    if (totalStylesheets > 10) {
      recommendations.push({
        type: "optimization",
        priority: "medium",
        issue: `High number of stylesheets (${totalStylesheets}) may impact performance`,
        impact: "Multiple CSS files increase HTTP requests and can delay rendering",
        recommendation: "Consider concatenating and minifying CSS files to reduce HTTP requests",
        affectedStylesheets: cssResults.stylesheets.map((s) => s.href),
      });
    }

    // Recommendation for media query optimization
    const mediaSpecificSheets = cssResults.stylesheets.filter(
      (s) => s.media && s.media !== "all" && s.media !== "screen"
    );
    if (mediaSpecificSheets.length > 0) {
      recommendations.push({
        type: "media-queries",
        priority: "low",
        issue: `${mediaSpecificSheets.length} stylesheet(s) with specific media queries`,
        impact: "Media-specific stylesheets are still downloaded even when not applicable",
        recommendation:
          "Consider using CSS @media rules within stylesheets instead of separate files",
        affectedStylesheets: mediaSpecificSheets.map((s) => s.href),
      });
    }

    // General best practices recommendation
    if (recommendations.length === 0) {
      recommendations.push({
        type: "best-practices",
        priority: "info",
        issue: "No critical CSS issues detected",
        impact: "CSS loading appears to be well-optimized",
        recommendation: "Consider implementing critical CSS inlining for above-the-fold content",
        affectedStylesheets: [],
      });
    }

    return recommendations;
  }

  // Prepare CSS analysis infrastructure for future enhancements
  prepareCSSAnalysisInfrastructure() {
    try {
      console.log("Preparing CSS analysis infrastructure for future enhancements...");

      // Create extensible CSS analysis framework
      const cssAnalysisFramework = {
        // Static analysis capabilities (current implementation)
        staticAnalysis: {
          enabled: true,
          capabilities: [
            "stylesheet-enumeration",
            "placement-validation",
            "duplicate-detection",
            "media-query-analysis",
          ],
        },

        // Dynamic analysis capabilities (future implementation)
        dynamicAnalysis: {
          enabled: false, // Will be enabled when Chrome DevTools Coverage API is integrated
          capabilities: [
            "unused-css-detection",
            "critical-css-identification",
            "coverage-analysis",
            "runtime-performance-impact",
          ],
          requirements: {
            chromeDevToolsProtocol: false,
            coverageAPI: false,
            runtimeAccess: false,
          },
        },

        // Chrome DevTools Coverage API integration (placeholder)
        coverageAPI: {
          supported: this.checkCoverageAPISupport(),
          integration: {
            enabled: false,
            protocol: null,
            session: null,
          },
          methods: {
            startCSSCoverage: null, // Placeholder for future implementation
            stopCSSCoverage: null, // Placeholder for future implementation
            analyzeCoverage: null, // Placeholder for future implementation
          },
        },

        // Extensible analysis modules
        analysisModules: {
          // Current modules
          placement: { enabled: true, priority: "high" },
          duplicates: { enabled: true, priority: "medium" },
          mediaQueries: { enabled: true, priority: "low" },

          // Future modules (placeholders)
          criticalCSS: { enabled: false, priority: "high" },
          unusedCSS: { enabled: false, priority: "medium" },
          cssComplexity: { enabled: false, priority: "low" },
          performanceImpact: { enabled: false, priority: "high" },
        },

        // Configuration and settings
        configuration: {
          maxStylesheetCount: 20,
          duplicateThreshold: 1,
          analysisTimeout: 5000,
          enableDetailedLogging: false,
        },

        // Metadata and versioning
        metadata: {
          version: "1.0.0",
          lastUpdated: Date.now(),
          supportedFeatures: ["static-analysis", "placement-validation", "duplicate-detection"],
          plannedFeatures: [
            "coverage-api-integration",
            "unused-css-detection",
            "critical-css-analysis",
            "performance-impact-measurement",
          ],
        },
      };

      // Store framework for future use
      this.cssAnalysisFramework = cssAnalysisFramework;

      console.log("CSS analysis infrastructure prepared successfully");
      console.log("Supported features:", cssAnalysisFramework.metadata.supportedFeatures);
      console.log("Planned features:", cssAnalysisFramework.metadata.plannedFeatures);

      return cssAnalysisFramework;
    } catch (error) {
      console.error("Error preparing CSS analysis infrastructure:", error);
      return {
        error: error.message,
        fallbackMode: true,
        staticAnalysis: { enabled: true },
        dynamicAnalysis: { enabled: false },
      };
    }
  }

  // Analyze live DOM directly when HTML structure is not available
  analyzeLiveDOM() {
    try {
      console.log("Analyzing live DOM structure...");

      const structure = {
        head: {
          element: document.head,
          scripts: document.head ? Array.from(document.head.querySelectorAll("script")) : [],
          links: document.head ? Array.from(document.head.querySelectorAll("link")) : [],
          meta: document.head ? Array.from(document.head.querySelectorAll("meta")) : [],
          preloads: document.head
            ? Array.from(document.head.querySelectorAll("link[rel='preload']"))
            : [],
        },
        body: {
          element: document.body,
          scripts: document.body ? Array.from(document.body.querySelectorAll("script")) : [],
          links: document.body ? Array.from(document.body.querySelectorAll("link")) : [],
          images: document.body ? Array.from(document.body.querySelectorAll("img[src]")) : [],
          videos: document.body ? Array.from(document.body.querySelectorAll("video")) : [],
        },
      };

      console.log("Live DOM analysis complete:", {
        headScripts: structure.head.scripts.length,
        headLinks: structure.head.links.length,
        bodyScripts: structure.body.scripts.length,
        bodyLinks: structure.body.links.length,
      });

      return structure;
    } catch (error) {
      console.error("Error analyzing live DOM:", error);
      return null;
    }
  }

  // Get empty CSS analysis structure
  getEmptyCSSAnalysis() {
    return {
      stylesheets: [],
      totalStylesheets: 0,
      misplacedCount: 0,
      duplicateCount: 0,
      analysis: {
        headStylesheets: [],
        bodyStylesheets: [],
        duplicates: [],
        recommendations: [],
      },
      metadata: {
        analysisTimestamp: Date.now(),
        url: window.location.href,
      },
      error: "CSS analysis not available",
    };
  }

  // Get empty script analysis structure
  getEmptyScriptAnalysis() {
    return {
      duplicates: [],
      deferScripts: [],
      asyncScripts: [],
      totalExternalScripts: 0,
      recommendations: [],
      error: "Script analysis not available",
    };
  }

  // Get empty link analysis structure
  getEmptyLinkAnalysis() {
    return {
      bodyLinks: [],
      duplicatePreloads: [],
      invalidPreloads: [],
      redundantPreloads: [],
      totalPreloads: 0,
      lcpPreloadMissing: {
        missing: false,
        resourceUrl: null,
      },
      analysis: {
        headLinks: 0,
        bodyLinks: 0,
        preloadLinks: 0,
        prefetchLinks: 0,
        preconnectLinks: 0,
        dnsPrefetchLinks: 0,
      },
      validation: {
        invalidRelValues: [],
        missingCrossorigin: [],
        inefficientPreloads: [],
        securityIssues: [],
        performanceIssues: [],
        accessibilityIssues: [],
        totalIssues: 0,
        recommendations: [],
      },
      error: "Link analysis not available",
    };
  }

  // Check Chrome DevTools Coverage API support
  checkCoverageAPISupport() {
    try {
      // Check if we're in a context that could potentially access DevTools Protocol
      const hasChrome = typeof chrome !== "undefined";
      const hasDevTools = typeof chrome?.devtools !== "undefined";
      const hasDebugger = typeof chrome?.debugger !== "undefined";

      // Note: Actual Coverage API access requires additional permissions and setup
      // This is a basic capability check for future implementation
      return {
        chromeAvailable: hasChrome,
        devToolsAvailable: hasDevTools,
        debuggerAvailable: hasDebugger,
        coverageAPIAccessible: false, // Will be true when properly implemented
        requiresPermissions: [
          "debugger", // Required for Chrome DevTools Protocol access
          "activeTab", // Required for tab access
        ],
        implementationNotes: [
          "Coverage API requires chrome.debugger permission",
          "Must establish DevTools Protocol connection",
          "Requires Runtime.enable and CSS.enable protocol commands",
          "Coverage data collection impacts performance",
        ],
      };
    } catch (error) {
      console.error("Error checking Coverage API support:", error);
      return {
        chromeAvailable: false,
        devToolsAvailable: false,
        debuggerAvailable: false,
        coverageAPIAccessible: false,
        error: error.message,
      };
    }
  }

  // Placeholder for future Chrome DevTools Coverage API integration
  async initializeCoverageAPI() {
    // This method will be implemented when Coverage API integration is added
    console.log("Coverage API integration not yet implemented");
    console.log("This is a placeholder for future dynamic CSS analysis capabilities");

    return {
      initialized: false,
      reason: "Coverage API integration pending implementation",
      requiredSteps: [
        "Add chrome.debugger permission to manifest",
        "Implement DevTools Protocol connection",
        "Add CSS.startRuleUsageTracking protocol command",
        "Implement coverage data collection and analysis",
      ],
    };
  }

  // Reset analysis state
  reset() {
    this.analysisResults = {};
    this.isAnalyzing = false;
    this.htmlContent = null;
    this.responseHeaders = null;

    // Clear cache and reset analysis state
    this.clearCache();
    this.resetAnalysisState();

    // Reset page change detector
    this.pageChangeDetector = {
      lastDOMHash: null,
      lastContentLength: null,
      lastTitle: null,
      lastMetaDescription: null,
    };

    this.lastAnalysisUrl = null;
    this.lastAnalysisTimestamp = null;
  }

  // Generate comprehensive recommendations data structure with LLM context
  generateRecommendationsData() {
    try {
      console.log("Generating recommendations data structure...");

      // Generate metadata
      const metadata = this.generateMetadata();

      // Build recommendations structure from analysis results with LLM guidance
      const recommendations = {
        // LLM Context and Instructions
        _llmContext: {
          purpose: "Web Performance Analysis Report",
          instructions:
            "Convert this technical performance analysis into human-readable recommendations for web developers. Focus on actionable advice with clear explanations of impact and implementation steps.",
          targetAudience:
            "Web developers and site owners who want to improve their website performance",
          priorityGuidance: {
            high: "Critical issues that significantly impact user experience and should be fixed immediately",
            medium: "Important optimizations that will provide noticeable performance improvements",
            low: "Nice-to-have improvements that provide incremental benefits",
          },
          categoryExplanations: {
            scripts:
              "JavaScript files and their loading behavior - affects page interactivity and loading speed",
            css: "Stylesheet files and their organization - affects visual rendering and layout shifts",
            links:
              "HTML link tags including preloads, preconnects, and resource hints - affects resource loading efficiency",
            cache: "Browser and CDN caching configuration - affects repeat visit performance",
            lcp: "Largest Contentful Paint optimization - affects perceived loading speed",
          },
          commonIssueTypes: {
            duplicate_scripts: "Multiple copies of the same JavaScript file being loaded",
            defer_optimization: "Scripts that could be optimized with better loading attributes",
            async_validation: "Asynchronous scripts that may have dependency issues",
            css_optimization: "Too many CSS files causing excessive HTTP requests",
            security_issues: "Missing security attributes on external resources",
            accessibility_issues:
              "Missing attributes that help screen readers and assistive technology",
          },
          recommendationFormat:
            "For each issue, provide: 1) Clear problem description, 2) Specific action steps, 3) Expected performance impact, 4) Implementation difficulty level",
        },

        // Analysis metadata
        metadata: metadata,

        // Performance analysis results
        cache: this.analysisResults.cache || this.getEmptyCacheData(),
        lcp: this.analysisResults.lcp || this.getEmptyLCPData(),
        scripts: this.analysisResults.scripts || this.getEmptyScriptsData(),
        links: this.analysisResults.links || this.getEmptyLinksData(),
        css: this.analysisResults.css || this.getEmptyCSSData(),
        summary: this.calculateSummary(),

        // Additional context for LLM processing
        _analysisContext: {
          pageType: this.detectPageType(),
          technologyStack: this.detectTechnologyStack(),
          performanceProfile: this.generatePerformanceProfile(),
          businessImpact: this.generateBusinessImpactContext(),
        },
      };

      console.log("Recommendations data structure with LLM context generated successfully");
      return recommendations;
    } catch (error) {
      console.error("Error generating recommendations data:", error);
      throw new Error(`Failed to generate recommendations data: ${error.message}`);
    }
  }

  // Detect page type for better context
  detectPageType() {
    try {
      const url = window.location.href;
      const title = document.title.toLowerCase();
      const bodyClasses = document.body ? document.body.className.toLowerCase() : "";

      if (
        url.includes("/product/") ||
        title.includes("product") ||
        bodyClasses.includes("product")
      ) {
        return "product_page";
      } else if (
        url.includes("/checkout") ||
        title.includes("checkout") ||
        bodyClasses.includes("checkout")
      ) {
        return "checkout_page";
      } else if (url === window.location.origin + "/" || url.endsWith("/")) {
        return "homepage";
      } else if (
        url.includes("/category/") ||
        url.includes("/collection/") ||
        title.includes("category")
      ) {
        return "category_page";
      } else if (url.includes("/blog/") || url.includes("/news/") || title.includes("blog")) {
        return "content_page";
      } else {
        return "general_page";
      }
    } catch (error) {
      return "unknown";
    }
  }

  // Detect technology stack for context
  detectTechnologyStack() {
    try {
      const technologies = [];

      // Check for common frameworks and platforms
      if (window.Shopify || document.querySelector("[data-shopify]")) {
        technologies.push("Shopify");
      }
      if (window.React || document.querySelector("[data-reactroot]")) {
        technologies.push("React");
      }
      if (window.Vue || document.querySelector("[data-v-]")) {
        technologies.push("Vue.js");
      }
      if (window.angular || document.querySelector("[ng-app]")) {
        technologies.push("Angular");
      }
      if (window.jQuery || window.$) {
        technologies.push("jQuery");
      }
      if (
        document.querySelector('script[src*="wordpress"]') ||
        document.querySelector('meta[name="generator"][content*="WordPress"]')
      ) {
        technologies.push("WordPress");
      }
      if (window.gtag || window.ga || document.querySelector('script[src*="googletagmanager"]')) {
        technologies.push("Google Analytics");
      }

      return technologies.length > 0 ? technologies : ["Unknown"];
    } catch (error) {
      return ["Unknown"];
    }
  }

  // Generate performance profile for context
  generatePerformanceProfile() {
    try {
      const scripts = this.analysisResults.scripts || {};
      const css = this.analysisResults.css || {};
      const links = this.analysisResults.links || {};

      return {
        scriptCount: scripts.totalExternalScripts || 0,
        stylesheetCount: css.totalStylesheets || 0,
        preloadCount: links.totalPreloads || 0,
        hasAsyncScripts: scripts.asyncScripts && scripts.asyncScripts.length > 0,
        hasDeferScripts: scripts.deferScripts && scripts.deferScripts.length > 0,
        hasDuplicates:
          (scripts.duplicates && scripts.duplicates.length > 0) || css.duplicateCount > 0,
        complexityLevel: this.calculateComplexityLevel(scripts, css, links),
      };
    } catch (error) {
      return { complexityLevel: "unknown" };
    }
  }

  // Calculate complexity level
  calculateComplexityLevel(scripts, css, links) {
    const scriptCount = scripts.totalExternalScripts || 0;
    const stylesheetCount = css.totalStylesheets || 0;
    const totalResources = scriptCount + stylesheetCount;

    if (totalResources > 50) {
      return "high"; // Complex site with many resources
    } else if (totalResources > 20) {
      return "medium"; // Moderate complexity
    } else {
      return "low"; // Simple site
    }
  }

  // Generate business impact context
  generateBusinessImpactContext() {
    try {
      const summary = this.calculateSummary();
      const criticalIssues = summary.criticalIssues || 0;
      const totalIssues = summary.totalIssues || 0;

      let impactLevel = "low";
      let businessContext = "";

      if (criticalIssues > 3) {
        impactLevel = "high";
        businessContext =
          "Significant performance issues that likely impact user experience, conversion rates, and SEO rankings. Immediate attention recommended.";
      } else if (criticalIssues > 0 || totalIssues > 5) {
        impactLevel = "medium";
        businessContext =
          "Moderate performance issues that may affect user satisfaction and search engine rankings. Should be addressed in next development cycle.";
      } else {
        impactLevel = "low";
        businessContext =
          "Minor optimization opportunities that can provide incremental improvements to user experience.";
      }

      return {
        impactLevel: impactLevel,
        businessContext: businessContext,
        userExperienceImpact: this.generateUXImpactDescription(criticalIssues, totalIssues),
        seoImpact: this.generateSEOImpactDescription(criticalIssues, totalIssues),
      };
    } catch (error) {
      return {
        impactLevel: "unknown",
        businessContext: "Unable to assess business impact",
        userExperienceImpact: "Unknown",
        seoImpact: "Unknown",
      };
    }
  }

  // Generate UX impact description
  generateUXImpactDescription(criticalIssues, totalIssues) {
    if (criticalIssues > 3) {
      return "Users likely experience slow loading, layout shifts, and delayed interactivity";
    } else if (criticalIssues > 0) {
      return "Users may notice slower than optimal loading times";
    } else if (totalIssues > 0) {
      return "Minor delays that most users won't notice but can be improved";
    } else {
      return "Good user experience with fast loading times";
    }
  }

  // Generate SEO impact description
  generateSEOImpactDescription(criticalIssues, totalIssues) {
    if (criticalIssues > 3) {
      return "Poor Core Web Vitals likely negatively impacting search rankings";
    } else if (criticalIssues > 0) {
      return "Some Core Web Vitals issues that may affect search performance";
    } else if (totalIssues > 0) {
      return "Minor optimizations that could improve search rankings";
    } else {
      return "Good performance metrics that support strong SEO";
    }
  }

  // Generate metadata for recommendations
  generateMetadata() {
    try {
      const metadata = {
        url: window.location.href,
        timestamp: Date.now(),
        analysisVersion: "2.0",
        pageLoadType: "navigation", // Always navigation for initial full page load
        userAgent: navigator.userAgent,
        analysisDate: new Date().toISOString(),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        connection: this.getConnectionInfo(),
        performance: this.getPerformanceInfo(),
      };

      return metadata;
    } catch (error) {
      console.error("Error generating metadata:", error);
      return {
        url: window.location.href,
        timestamp: Date.now(),
        analysisVersion: "2.0",
        pageLoadType: "navigation",
        userAgent: navigator.userAgent || "unknown",
        error: "Metadata generation failed",
      };
    }
  }

  // Get connection information if available
  getConnectionInfo() {
    try {
      if (navigator.connection) {
        return {
          effectiveType: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink,
          rtt: navigator.connection.rtt,
          saveData: navigator.connection.saveData,
        };
      }
      return null;
    } catch (error) {
      console.warn("Error getting connection info:", error);
      return null;
    }
  }

  // Get performance information
  getPerformanceInfo() {
    try {
      const perfInfo = {
        memoryUsage: null,
        timing: null,
      };

      // Memory usage if available
      if (performance.memory) {
        perfInfo.memoryUsage = {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        };
      }

      // Navigation timing if available
      if (performance.timing) {
        perfInfo.timing = {
          navigationStart: performance.timing.navigationStart,
          loadEventEnd: performance.timing.loadEventEnd,
          domContentLoadedEventEnd: performance.timing.domContentLoadedEventEnd,
        };
      }

      return perfInfo;
    } catch (error) {
      console.warn("Error getting performance info:", error);
      return null;
    }
  }

  // Calculate summary statistics
  calculateSummary() {
    try {
      let totalIssues = 0;
      let criticalIssues = 0;
      let optimizationOpportunities = 0;

      // Count cache issues
      const cache = this.analysisResults.cache || {};
      if (cache.browserCache && cache.browserCache.status === "not-cached") {
        totalIssues++;
        criticalIssues++;
      }
      if (cache.cdnCache && cache.cdnCache.status === "miss") {
        totalIssues++;
        optimizationOpportunities++;
      }

      // Count LCP issues
      const lcp = this.analysisResults.lcp || {};
      if (lcp.elementFound && !lcp.serverSideRendered) {
        totalIssues++;
        criticalIssues++;
      }
      if (lcp.elementFound && !lcp.preloadExists) {
        totalIssues++;
        optimizationOpportunities++;
      }

      // Count script issues
      const scripts = this.analysisResults.scripts || {};
      if (scripts.duplicates && scripts.duplicates.length > 0) {
        totalIssues += scripts.duplicates.length;
        criticalIssues += scripts.duplicates.length;
      }

      // Count link issues
      const links = this.analysisResults.links || {};
      if (links.bodyLinks && links.bodyLinks.length > 0) {
        totalIssues += links.bodyLinks.length;
        optimizationOpportunities += links.bodyLinks.length;
      }
      if (links.duplicatePreloads && links.duplicatePreloads.length > 0) {
        totalIssues += links.duplicatePreloads.length;
        criticalIssues += links.duplicatePreloads.length;
      }
      if (links.invalidPreloads && links.invalidPreloads.length > 0) {
        totalIssues += links.invalidPreloads.length;
        criticalIssues += links.invalidPreloads.length;
      }
      if (links.redundantPreloads && links.redundantPreloads.length > 0) {
        totalIssues += links.redundantPreloads.length;
        optimizationOpportunities += links.redundantPreloads.length;
      }

      // Count CSS issues
      const css = this.analysisResults.css || {};
      if (css.misplacedCount && css.misplacedCount > 0) {
        totalIssues += css.misplacedCount;
        optimizationOpportunities += css.misplacedCount;
      }

      // Calculate overall score
      let overallScore = "good";
      if (criticalIssues > 0) {
        overallScore = "poor";
      } else if (totalIssues > 2) {
        overallScore = "needs-improvement";
      }

      return {
        totalIssues,
        criticalIssues,
        optimizationOpportunities,
        overallScore,
      };
    } catch (error) {
      console.error("Error calculating summary:", error);
      return {
        totalIssues: 0,
        criticalIssues: 0,
        optimizationOpportunities: 0,
        overallScore: "unknown",
        error: "Summary calculation failed",
      };
    }
  }

  // Get empty cache data structure
  getEmptyCacheData() {
    return {
      browserCache: {
        status: "not-analyzed",
        ttl: null,
        cacheControl: null,
        expires: null,
      },
      cdnCache: {
        status: "not-analyzed",
        provider: "unknown",
        ttl: null,
        age: null,
        cacheHeaders: {},
      },
    };
  }

  // Get empty LCP data structure
  getEmptyLCPData() {
    return {
      elementFound: false,
      serverSideRendered: false,
      elementType: null,
      elementSelector: null,
      preloadExists: false,
    };
  }

  // Get empty scripts data structure
  getEmptyScriptsData() {
    return {
      duplicates: [],
      deferScripts: [],
      asyncScripts: [],
      totalExternalScripts: 0,
      recommendations: [],
    };
  }

  // Get empty links data structure
  getEmptyLinksData() {
    return {
      bodyLinks: [],
      duplicatePreloads: [],
      invalidPreloads: [],
      redundantPreloads: [],
      totalPreloads: 0,
    };
  }

  // Get empty CSS data structure
  getEmptyCSSData() {
    return {
      stylesheets: [],
      totalStylesheets: 0,
      misplacedCount: 0,
    };
  }

  // Format recommendations as structured JSON
  formatRecommendationsJSON(recommendationsData = null) {
    try {
      console.log("Formatting recommendations as JSON...");

      // Use provided data or generate fresh data
      const data = recommendationsData || this.generateRecommendationsData();

      // Validate data before formatting
      const validationResult = this.validateRecommendationsData(data);
      if (!validationResult.isValid) {
        throw new Error(`Data validation failed: ${validationResult.errors.join(", ")}`);
      }

      // Format JSON with proper indentation and structure
      const formattedJSON = JSON.stringify(data, this.jsonReplacer, 2);

      console.log("Recommendations JSON formatted successfully");
      return {
        json: formattedJSON,
        data: data,
        validation: validationResult,
        size: formattedJSON.length,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("Error formatting recommendations JSON:", error);

      // Return error structure in JSON format
      const errorData = {
        error: {
          message: error.message,
          timestamp: Date.now(),
          type: "json_formatting_error",
        },
        metadata: {
          url: window.location.href,
          timestamp: Date.now(),
          analysisVersion: "2.0",
          pageLoadType: "navigation",
        },
      };

      return {
        json: JSON.stringify(errorData, null, 2),
        data: errorData,
        validation: { isValid: false, errors: [error.message] },
        size: 0,
        timestamp: Date.now(),
        hasError: true,
      };
    }
  }

  // Custom JSON replacer function for consistent formatting
  jsonReplacer(key, value) {
    // Handle null values consistently
    if (value === null) {
      return null;
    }

    // Handle undefined values
    if (value === undefined) {
      return null;
    }

    // Handle arrays - ensure they're properly formatted
    if (Array.isArray(value)) {
      return value;
    }

    // Handle numbers - ensure precision for timestamps and measurements
    if (typeof value === "number") {
      // Round floating point numbers to reasonable precision
      if (value % 1 !== 0 && Math.abs(value) < 1000) {
        return Math.round(value * 1000) / 1000; // 3 decimal places for small numbers
      }
      return value;
    }

    // Handle strings - trim whitespace
    if (typeof value === "string") {
      return value.trim();
    }

    return value;
  }

  // Validate recommendations data structure
  validateRecommendationsData(data) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      // Check if data exists
      if (!data || typeof data !== "object") {
        validation.isValid = false;
        validation.errors.push("Recommendations data is missing or invalid");
        return validation;
      }

      // Validate required top-level properties
      const requiredProperties = ["metadata", "cache", "lcp", "scripts", "links", "css", "summary"];
      for (const prop of requiredProperties) {
        if (!data.hasOwnProperty(prop)) {
          validation.isValid = false;
          validation.errors.push(`Missing required property: ${prop}`);
        }
      }

      // Validate metadata
      if (data.metadata) {
        const metadataValidation = this.validateMetadata(data.metadata);
        if (!metadataValidation.isValid) {
          validation.errors.push(...metadataValidation.errors);
          validation.isValid = false;
        }
        validation.warnings.push(...metadataValidation.warnings);
      }

      // Validate cache data
      if (data.cache) {
        const cacheValidation = this.validateCacheData(data.cache);
        if (!cacheValidation.isValid) {
          validation.errors.push(...cacheValidation.errors);
          validation.isValid = false;
        }
        validation.warnings.push(...cacheValidation.warnings);
      }

      // Validate LCP data
      if (data.lcp) {
        const lcpValidation = this.validateLCPData(data.lcp);
        if (!lcpValidation.isValid) {
          validation.errors.push(...lcpValidation.errors);
          validation.isValid = false;
        }
        validation.warnings.push(...lcpValidation.warnings);
      }

      // Validate scripts data
      if (data.scripts) {
        const scriptsValidation = this.validateScriptsData(data.scripts);
        if (!scriptsValidation.isValid) {
          validation.errors.push(...scriptsValidation.errors);
          validation.isValid = false;
        }
        validation.warnings.push(...scriptsValidation.warnings);
      }

      // Validate links data
      if (data.links) {
        const linksValidation = this.validateLinksData(data.links);
        if (!linksValidation.isValid) {
          validation.errors.push(...linksValidation.errors);
          validation.isValid = false;
        }
        validation.warnings.push(...linksValidation.warnings);
      }

      // Validate CSS data
      if (data.css) {
        const cssValidation = this.validateCSSData(data.css);
        if (!cssValidation.isValid) {
          validation.errors.push(...cssValidation.errors);
          validation.isValid = false;
        }
        validation.warnings.push(...cssValidation.warnings);
      }

      // Validate summary data
      if (data.summary) {
        const summaryValidation = this.validateSummaryData(data.summary);
        if (!summaryValidation.isValid) {
          validation.errors.push(...summaryValidation.errors);
          validation.isValid = false;
        }
        validation.warnings.push(...summaryValidation.warnings);
      }

      console.log(`Data validation complete: ${validation.isValid ? "PASSED" : "FAILED"}`);
      if (validation.errors.length > 0) {
        console.warn("Validation errors:", validation.errors);
      }
      if (validation.warnings.length > 0) {
        console.warn("Validation warnings:", validation.warnings);
      }
    } catch (error) {
      validation.isValid = false;
      validation.errors.push(`Validation error: ${error.message}`);
      console.error("Error during data validation:", error);
    }

    return validation;
  }

  // Validate metadata structure
  validateMetadata(metadata) {
    const validation = { isValid: true, errors: [], warnings: [] };

    const requiredFields = ["url", "timestamp", "analysisVersion", "pageLoadType", "userAgent"];
    for (const field of requiredFields) {
      if (
        !metadata.hasOwnProperty(field) ||
        metadata[field] === null ||
        metadata[field] === undefined
      ) {
        validation.errors.push(`Metadata missing required field: ${field}`);
        validation.isValid = false;
      }
    }

    // Validate URL format
    if (metadata.url && typeof metadata.url === "string") {
      try {
        new URL(metadata.url);
      } catch (e) {
        validation.warnings.push("Metadata URL format may be invalid");
      }
    }

    // Validate timestamp
    if (metadata.timestamp && (typeof metadata.timestamp !== "number" || metadata.timestamp <= 0)) {
      validation.errors.push("Metadata timestamp must be a positive number");
      validation.isValid = false;
    }

    return validation;
  }

  // Validate cache data structure
  validateCacheData(cache) {
    const validation = { isValid: true, errors: [], warnings: [] };

    if (!cache.browserCache || !cache.cdnCache) {
      validation.errors.push("Cache data missing browserCache or cdnCache");
      validation.isValid = false;
    }

    // Validate browser cache status
    if (cache.browserCache && cache.browserCache.status) {
      const validStatuses = ["cached", "not-cached", "not-analyzed"];
      if (!validStatuses.includes(cache.browserCache.status)) {
        validation.errors.push(`Invalid browser cache status: ${cache.browserCache.status}`);
        validation.isValid = false;
      }
    }

    // Validate CDN cache status
    if (cache.cdnCache && cache.cdnCache.status) {
      const validStatuses = ["hit", "miss", "unknown", "not-analyzed"];
      if (!validStatuses.includes(cache.cdnCache.status)) {
        validation.errors.push(`Invalid CDN cache status: ${cache.cdnCache.status}`);
        validation.isValid = false;
      }
    }

    return validation;
  }

  // Validate LCP data structure
  validateLCPData(lcp) {
    const validation = { isValid: true, errors: [], warnings: [] };

    const requiredFields = ["elementFound", "serverSideRendered", "preloadExists"];
    for (const field of requiredFields) {
      if (!lcp.hasOwnProperty(field) || typeof lcp[field] !== "boolean") {
        validation.errors.push(`LCP data missing or invalid boolean field: ${field}`);
        validation.isValid = false;
      }
    }

    // Validate element type if element is found
    if (lcp.elementFound && lcp.elementType) {
      const validTypes = ["img", "video", "background-image"];
      if (!validTypes.includes(lcp.elementType)) {
        validation.warnings.push(`Unexpected LCP element type: ${lcp.elementType}`);
      }
    }

    return validation;
  }

  // Validate scripts data structure
  validateScriptsData(scripts) {
    const validation = { isValid: true, errors: [], warnings: [] };

    const requiredArrayFields = ["duplicates", "deferScripts", "asyncScripts", "recommendations"];
    for (const field of requiredArrayFields) {
      if (!scripts.hasOwnProperty(field) || !Array.isArray(scripts[field])) {
        validation.errors.push(`Scripts data missing or invalid array field: ${field}`);
        validation.isValid = false;
      }
    }

    // Validate totalExternalScripts
    if (
      !scripts.hasOwnProperty("totalExternalScripts") ||
      typeof scripts.totalExternalScripts !== "number"
    ) {
      validation.errors.push("Scripts data missing or invalid totalExternalScripts number");
      validation.isValid = false;
    }

    return validation;
  }

  // Validate links data structure
  validateLinksData(links) {
    const validation = { isValid: true, errors: [], warnings: [] };

    const requiredArrayFields = [
      "bodyLinks",
      "duplicatePreloads",
      "invalidPreloads",
      "redundantPreloads",
    ];
    for (const field of requiredArrayFields) {
      if (!links.hasOwnProperty(field) || !Array.isArray(links[field])) {
        validation.errors.push(`Links data missing or invalid array field: ${field}`);
        validation.isValid = false;
      }
    }

    // Validate totalPreloads
    if (!links.hasOwnProperty("totalPreloads") || typeof links.totalPreloads !== "number") {
      validation.errors.push("Links data missing or invalid totalPreloads number");
      validation.isValid = false;
    }

    return validation;
  }

  // Validate CSS data structure
  validateCSSData(css) {
    const validation = { isValid: true, errors: [], warnings: [] };

    // Validate stylesheets array
    if (!css.hasOwnProperty("stylesheets") || !Array.isArray(css.stylesheets)) {
      validation.errors.push("CSS data missing or invalid stylesheets array");
      validation.isValid = false;
    }

    // Validate numeric fields
    const requiredNumberFields = ["totalStylesheets", "misplacedCount"];
    for (const field of requiredNumberFields) {
      if (!css.hasOwnProperty(field) || typeof css[field] !== "number") {
        validation.errors.push(`CSS data missing or invalid number field: ${field}`);
        validation.isValid = false;
      }
    }

    return validation;
  }

  // Validate summary data structure
  validateSummaryData(summary) {
    const validation = { isValid: true, errors: [], warnings: [] };

    const requiredNumberFields = ["totalIssues", "criticalIssues", "optimizationOpportunities"];
    for (const field of requiredNumberFields) {
      if (
        !summary.hasOwnProperty(field) ||
        typeof summary[field] !== "number" ||
        summary[field] < 0
      ) {
        validation.errors.push(`Summary data missing or invalid number field: ${field}`);
        validation.isValid = false;
      }
    }

    // Validate overall score
    if (!summary.hasOwnProperty("overallScore")) {
      validation.errors.push("Summary data missing overallScore");
      validation.isValid = false;
    } else {
      const validScores = ["good", "needs-improvement", "poor", "unknown"];
      if (!validScores.includes(summary.overallScore)) {
        validation.errors.push(`Invalid overall score: ${summary.overallScore}`);
        validation.isValid = false;
      }
    }

    return validation;
  }

  // Handle malformed recommendation data with error recovery
  handleMalformedData(error, originalData = null) {
    console.error("Handling malformed recommendation data:", error);

    try {
      // Create a safe fallback structure
      const fallbackData = {
        metadata: {
          url: window.location.href,
          timestamp: Date.now(),
          analysisVersion: "2.0",
          pageLoadType: "navigation",
          userAgent: navigator.userAgent || "unknown",
          error: "Data recovery mode - original analysis failed",
        },
        cache: this.getEmptyCacheData(),
        lcp: this.getEmptyLCPData(),
        scripts: this.getEmptyScriptsData(),
        links: this.getEmptyLinksData(),
        css: this.getEmptyCSSData(),
        summary: {
          totalIssues: 0,
          criticalIssues: 0,
          optimizationOpportunities: 0,
          overallScore: "unknown",
          error: "Analysis failed - using fallback data",
        },
        originalError: {
          message: error.message,
          timestamp: Date.now(),
          recoveryMode: true,
        },
      };

      // Try to salvage any valid data from original
      if (originalData && typeof originalData === "object") {
        // Safely merge any valid properties
        Object.keys(originalData).forEach((key) => {
          if (
            originalData[key] &&
            typeof originalData[key] === "object" &&
            !Array.isArray(originalData[key])
          ) {
            try {
              // Validate and merge if safe
              const validation = this.validateRecommendationsData({ [key]: originalData[key] });
              if (validation.isValid) {
                fallbackData[key] = { ...fallbackData[key], ...originalData[key] };
              }
            } catch (e) {
              console.warn(`Could not salvage data for ${key}:`, e);
            }
          }
        });
      }

      return fallbackData;
    } catch (recoveryError) {
      console.error("Error during data recovery:", recoveryError);

      // Ultimate fallback - minimal structure
      return {
        metadata: {
          url: window.location.href,
          timestamp: Date.now(),
          analysisVersion: "2.0",
          pageLoadType: "navigation",
          userAgent: "unknown",
        },
        error: {
          message: "Critical error in recommendation analysis",
          originalError: error.message,
          recoveryError: recoveryError.message,
          timestamp: Date.now(),
        },
      };
    }
  }
}

// Initialize performance recommendation analyzer
const performanceRecommendationAnalyzer = new PerformanceRecommendationAnalyzer();

// Function to sync CLS debugger with global CLS score
function syncCLSDebugger() {
  if (clsDebugger && CLSScore !== clsDebugger.currentCLS) {
    clsDebugger.updateCLSScore(CLSScore);
  }
}

// Enhanced function to reset and collect metrics for SPA transitions
function resetAndCollectMetrics(isSpaNavigation = true, reason = "spa_navigation") {
  console.log(
    "Resetting metrics for",
    reason,
    isSpaNavigation ? "(SPA navigation)" : "(page reload)"
  );

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

  // Reset performance recommendation analyzer if it exists
  if (typeof performanceRecommendationAnalyzer !== "undefined") {
    performanceRecommendationAnalyzer.reset();
  }

  // Sync CLS debugger with reset score
  syncCLSDebugger();

  // Set transition type based on navigation type
  if (isSpaNavigation) {
    transitionType = "spa";
  } else {
    transitionType = "navigation";
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

    if (message.type === "generateRecommendations") {
      // Handle performance recommendations generation request
      console.log("Performance recommendations generation requested");

      // Validate page support
      if (!pageSupport.isSupported) {
        const errorData = {
          code: "UNSUPPORTED_PAGE",
          message: pageSupport.reason,
          pageType: pageSupport.pageType,
        };

        // Send error to background for storage
        chrome.runtime.sendMessage({
          type: "recommendationsError",
          error: errorData,
          timestamp: Date.now(),
        });

        sendResponse({
          success: false,
          error: errorData,
        });
        return true;
      }

      // Check extension permissions
      if (!extensionPermissions.canAccessPage) {
        const errorData = {
          code: "PERMISSION_ERROR",
          message: "Extension permissions insufficient for this page",
          limitations: extensionPermissions.limitations,
        };

        chrome.runtime.sendMessage({
          type: "recommendationsError",
          error: errorData,
          timestamp: Date.now(),
        });

        sendResponse({
          success: false,
          error: errorData,
        });
        return true;
      }

      // Check if analysis is already in progress
      if (performanceRecommendationAnalyzer.isAnalyzing) {
        const errorData = {
          code: "ANALYSIS_IN_PROGRESS",
          message: "Analysis is already in progress",
          state: performanceRecommendationAnalyzer.getAnalysisState(),
        };

        sendResponse({
          success: false,
          error: errorData,
        });
        return true;
      }

      // Send loading state to background
      chrome.runtime.sendMessage({
        type: "recommendationsLoading",
        phase: "starting",
      });

      // Start analysis asynchronously with comprehensive error handling
      performanceRecommendationAnalyzer
        .analyzePerformance()
        .then((results) => {
          console.log("Recommendations analysis completed successfully");

          // Validate results before sending
          if (!results || typeof results !== "object") {
            throw new Error("Invalid analysis results generated");
          }

          // Ensure metadata includes current tab context
          const enrichedResults = {
            ...results,
            metadata: {
              ...results.metadata,
              url: window.location.href,
              timestamp: Date.now(),
              userAgent: navigator.userAgent,
              pageTitle: document.title,
            },
          };

          // Send results to background script for storage
          chrome.runtime.sendMessage(
            {
              type: "recommendationsGenerated",
              data: enrichedResults,
              success: true,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error(
                  "Error sending recommendations to background:",
                  chrome.runtime.lastError
                );
              } else if (response && !response.success) {
                console.warn(
                  "Background script reported error storing recommendations:",
                  response.error
                );
              }
            }
          );

          sendResponse({
            success: true,
            data: enrichedResults,
            timestamp: Date.now(),
          });
        })
        .catch((error) => {
          console.error("Error generating recommendations:", error);

          const errorData = {
            code: error.code || "ANALYSIS_FAILED",
            message: error.message || "Analysis failed",
            phase: performanceRecommendationAnalyzer.currentPhase,
            duration: performanceRecommendationAnalyzer.analysisStartTime
              ? Date.now() - performanceRecommendationAnalyzer.analysisStartTime
              : 0,
            url: window.location.href,
            timestamp: Date.now(),
          };

          // Send error to background script with enhanced context
          chrome.runtime.sendMessage(
            {
              type: "recommendationsError",
              error: errorData,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error("Error sending error to background:", chrome.runtime.lastError);
              }
            }
          );

          sendResponse({
            success: false,
            error: errorData,
          });
        });

      return true; // Async response
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
