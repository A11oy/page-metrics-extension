let LCPTime = 0;
let currentUrl = window.location.href;
let metricsCollected = false;
let lcpObserver = null;
let navigationStart = performance.now();
let transitionType = "navigation"; // "navigation" or "spa"
let mutationObserver = null;

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

// Function to reset and collect metrics for SPA transitions
function resetAndCollectMetrics() {
  // Reset metrics
  LCPTime = 0;
  metricsCollected = false;
  transitionType = "spa";
  
  // Reset visual completion tracking
  visuallyComplete = false;
  visualCompletionTime = 0;
  frameHistory = [];
  stableFrameCount = 0;
  rafMonitoring = false;
  lastMutationTime = performance.now();
  
  // Record navigation start time for SPA transitions
  navigationStart = performance.now();
  
  // Tell popup we're collecting new metrics (show loading state)
  chrome.runtime.sendMessage({ type: "metricsLoading" });
  
  // Reset performance observers
  if (lcpObserver) {
    lcpObserver.disconnect();
  }
  
  // Start observing LCP again
  lcpObserver = observeLCP();
  
  // Start visual completion monitoring
  startVisualCompletionTracking();
  
  // Set a timeout to collect metrics after navigation completes
  // Extended wait time for SPA transitions to ensure we capture everything
  setTimeout(collectMetrics, SPA_INITIAL_WAIT);
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
      elementCount: document.querySelectorAll('*').length,
      timestamp: timestamp
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
        const sizeDiff = Math.abs(lastFewFrames[i].contentSize - lastFewFrames[i-1].contentSize);
        const countDiff = Math.abs(lastFewFrames[i].elementCount - lastFewFrames[i-1].elementCount);
        
        // If either metric changed significantly, consider the frame different
        sizeDifferences.push(sizeDiff > CONTENT_CHANGE_THRESHOLD || countDiff > ELEMENT_COUNT_THRESHOLD);
      }
      
      // If no significant changes in the last few frames, increment stable frame count
      if (!sizeDifferences.some(diff => diff)) {
        stableFrameCount++;
      } else {
        stableFrameCount = 0;
      }
      
      // If we've had several stable frames and we're more than 300ms into the transition
      // or it's been more than 300ms since the last DOM mutation, consider it visually complete
      const timeSinceLastMutation = timestamp - lastMutationTime;
      if ((stableFrameCount >= VISUAL_STABILITY_THRESHOLD && timeElapsed > 300) || 
          (timeSinceLastMutation > 500 && timeElapsed > 1000)) {
        
        if (!visuallyComplete) {
          visuallyComplete = true;
          visualCompletionTime = timeElapsed / 1000; // Convert to seconds
          
          // Update metrics with visual completion time
          updateMetricsWithVisualCompletion();
          
          // Continue monitoring for a bit longer to ensure stability
          // but mark as complete so metrics can be reported
          setTimeout(() => {
            rafMonitoring = false;
            console.log(`Visual completion monitoring stopped at ${(performance.now() - navigationStart)/1000}s`);
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
      console.log(`Reaching maximum monitoring time of ${VISUAL_COMPLETION_MAX_WAIT/1000}s`);
      
      // If we haven't detected visual completion yet, use the current time
      if (!visuallyComplete) {
        visuallyComplete = true;
        visualCompletionTime = (performance.now() - navigationStart) / 1000;
        updateMetricsWithVisualCompletion();
        console.log(`Visual completion timeout at ${visualCompletionTime.toFixed(2)}s`);
      }
      
      // Stop monitoring after max time
      rafMonitoring = false;
    }
  }, VISUAL_COMPLETION_MAX_WAIT);
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
      characterData: true
    });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });
    });
  }
}

// Start DOM mutation tracking
initDomMutationTracking();

// Update metrics with visual completion time
function updateMetricsWithVisualCompletion() {
  if (!visuallyComplete || metricsCollected) return;
  
  // For SPA transitions, update metrics to include visual completion
  if (transitionType === "spa") {
    const metrics = {
      TTFB: 0.01, // SPA transitions don't have TTFB (client-side only)
      FCP: Math.min(visualCompletionTime * 0.4, 0.5), // Estimate FCP as earlier than completion
      LCP: visualCompletionTime,
      DOMLoadTime: visualCompletionTime * 0.7, // Estimate
      TotalNavigationDuration: visualCompletionTime,
      VisualCompletionTime: visualCompletionTime,
      timestamp: Date.now(),
      url: window.location.href,
      title: document.title,
      transitionType: "spa"
    };
    
    sendMetrics(metrics);
  }
}

// Function to observe LCP
function observeLCP() {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // For SPA transitions, we need to check if this entry happened after our navigation start
      if (transitionType === "spa" && entry.startTime < navigationStart) {
        continue; // Skip LCP entries from before the SPA transition
      }
      LCPTime = (entry.startTime - navigationStart) / 1000;
    }
  });
  
  try {
    observer.observe({ type: "largest-contentful-paint", buffered: true });
  } catch (e) {
    console.error("Failed to observe LCP:", e);
  }
  
  return observer;
}

// Initialize LCP observer
lcpObserver = observeLCP();

// Create a paint observer for FCP during SPA transitions
const paintObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.name === 'first-contentful-paint' && 
        transitionType === "spa" && 
        entry.startTime > navigationStart) {
      // Store the FCP time for SPA navigation
      window.spaPaintMetrics = window.spaPaintMetrics || {};
      window.spaPaintMetrics.FCP = (entry.startTime - navigationStart) / 1000;
    }
  }
});
try {
  paintObserver.observe({ type: "paint", buffered: true });
} catch (e) {
  console.error("Failed to observe paint:", e);
}

// Function to collect and send metrics
function collectMetrics() {
  // For initial page load
  if (transitionType === "navigation") {
    const navEntries = performance.getEntriesByType("navigation")[0];
    if (navEntries) {
      const metrics = {
        TTFB: (navEntries.responseStart - navEntries.startTime) / 1000,
        FCP: (navEntries.domInteractive - navEntries.startTime) / 1000,
        LCP: LCPTime,
        DOMLoadTime: (navEntries.domContentLoadedEventEnd - navEntries.startTime) / 1000,
        TotalNavigationDuration: (navEntries.responseStart - navEntries.startTime) / 1000 + LCPTime,
        timestamp: Date.now(),
        url: window.location.href,
        title: document.title,
        transitionType: "navigation"
      };
      
      sendMetrics(metrics);
    } else {
      // If navigation entries aren't available yet, try again after a delay
      setTimeout(collectMetrics, 500);
    }
  } 
  // For SPA transitions
  else {
    // Don't collect metrics yet if visual completion hasn't been detected
    // The updateMetricsWithVisualCompletion function will handle it
    if (visuallyComplete) {
      // Use visual completion time instead of estimates
      const metrics = {
        TTFB: 0.01, // SPA transitions don't have TTFB (client-side only)
        FCP: Math.min(visualCompletionTime * 0.4, 0.5), // Estimate FCP as earlier than completion
        LCP: visualCompletionTime,
        DOMLoadTime: visualCompletionTime * 0.7, // Estimate
        TotalNavigationDuration: visualCompletionTime,
        VisualCompletionTime: visualCompletionTime,
        timestamp: Date.now(),
        url: window.location.href,
        title: document.title,
        transitionType: "spa"
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
  }
}

function sendMetrics(metrics) {
  // Send collected metrics with tab info
  chrome.runtime.sendMessage({ 
    type: "performanceMetrics", 
    data: metrics
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error sending metrics:", chrome.runtime.lastError);
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: "performanceMetrics", data: metrics });
      }, 500);
    }
  });
  
  metricsCollected = true;
  currentUrl = window.location.href;
}

// Monitor URL changes more aggressively for SPA detection
const urlObserver = () => {
  if (currentUrl !== window.location.href) {
    console.log(`SPA transition detected: ${currentUrl} -> ${window.location.href}`);
    resetAndCollectMetrics();
  }
};

// Initialize MutationObserver when the DOM is ready
function initMutationObserver() {
  // Make sure body exists before observing
  if (!document.body) {
    console.log("Body not available yet, waiting for DOMContentLoaded");
    document.addEventListener('DOMContentLoaded', initMutationObserver);
    return;
  }

  // Use MutationObserver to detect DOM changes that might indicate SPA navigation
  mutationObserver = new MutationObserver((mutations) => {
    // Only check if the URL has changed when we detect significant DOM mutations
    const significantChanges = mutations.some(mutation => 
      mutation.type === 'childList' && 
      mutation.addedNodes.length > 3 // Threshold for significant change
    );
    
    if (significantChanges) {
      urlObserver();
    }
  });

  // Start observing DOM changes if body exists
  try {
    mutationObserver.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
    console.log("MutationObserver initialized successfully");
  } catch (e) {
    console.error("Error initializing MutationObserver:", e);
  }
}

// Start the mutation observer
initMutationObserver();

// Listen for Navigation API events (for SPAs)
if ('navigation' in window) {
  window.navigation.addEventListener('navigate', (event) => {
    console.log('Navigation test', event.navigationType);
    // Check for all navigation types that might indicate SPA navigation
    if (event.navigationType === 'push' || 
        event.navigationType === 'replace' || 
        event.navigationType === 'traverse') {
      console.log('Navigation API detected navigation:', event.navigationType);
      resetAndCollectMetrics();
    }
  });
} 

// Fallback with interval for browsers without Navigation API
setInterval(urlObserver, 300);

// Handle history API for older SPAs
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function() {
  originalPushState.apply(this, arguments);
  console.log('history.pushState detected');
  resetAndCollectMetrics();
};

history.replaceState = function() {
  originalReplaceState.apply(this, arguments);
  console.log('history.replaceState detected');
  resetAndCollectMetrics();
};

// Listen for popstate events (back/forward navigation)
window.addEventListener('popstate', () => {
  console.log('popstate event detected');
  resetAndCollectMetrics();
});

// Initial metrics collection on page load
window.addEventListener("load", () => {
  // Send loading state immediately
  chrome.runtime.sendMessage({ type: "metricsLoading" });
  
  // Start visual completion tracking
  startVisualCompletionTracking();
  
  // Collect initial metrics after a short delay
  setTimeout(collectMetrics, 1000);
});
