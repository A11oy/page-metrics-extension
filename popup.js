document.addEventListener("DOMContentLoaded", () => {
  // Set initial loading state
  const metricsContainer = document.getElementById("metrics");
  metricsContainer.innerHTML = `<div class="loading">Collecting metrics...</div>`;
  
  // Initial render
  renderMetrics();
  
  // Check for updates every 300ms - faster updates for SPA transitions
  setInterval(renderMetrics, 300);
  
  // Add reset button
  const controls = document.createElement("div");
  controls.id = "debug-controls";
  controls.innerHTML = `<button id="clear-metrics">Reset Metrics</button>`;
  document.body.appendChild(controls);
  
  document.getElementById("clear-metrics").addEventListener("click", () => {
    // Find the active tab ID first
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        const tabId = tabs[0].id;
        // Clear metrics for this tab only
        chrome.storage.local.remove([`metrics_${tabId}`, `metricsLoading_${tabId}`], () => {
          metricsContainer.innerHTML = `<div class="loading">Metrics reset, refreshing...</div>`;
          // Reload the active tab
          chrome.tabs.reload(tabId);
        });
      }
    });
  });
});

function renderMetrics() {
  // Get the active tab ID first
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs.length === 0) {
      // No active tab, show message
      document.getElementById("metrics").innerHTML = `
        <div class="error">No active tab found</div>
      `;
      return;
    }
    
    const tabId = tabs[0].id;
    const tabUrl = tabs[0].url;
    
    // Get metrics for this specific tab
    chrome.storage.local.get([`metrics_${tabId}`, `metricsLoading_${tabId}`], (data) => {
      const metrics = data[`metrics_${tabId}`] || {};
      const metricsLoading = data[`metricsLoading_${tabId}`] === true;
      const metricsContainer = document.getElementById("metrics");
      
      // Show current state for debugging
      const debugInfo = document.getElementById("debug-info") || document.createElement("div");
      debugInfo.id = "debug-info";
      debugInfo.innerHTML = `<div class="debug">Tab ID: ${tabId}, Loading: ${metricsLoading}, Metrics available: ${Object.keys(metrics).length > 0}</div>`;
      if (!document.getElementById("debug-info")) {
        document.body.appendChild(debugInfo);
      }
      
      // Show tab info
      const tabInfo = document.getElementById("tab-info") || document.createElement("div");
      tabInfo.id = "tab-info";
      tabInfo.innerHTML = `<div class="tab-title">${tabs[0].title || 'Unknown Tab'}</div>`;
      if (!document.getElementById("tab-info")) {
        document.body.insertBefore(tabInfo, metricsContainer);
      }
      
      // Check if metrics are available for this tab
      if (Object.keys(metrics).length > 0) {
        // Format the transition type display
        const transitionTypeDisplay = metrics.transitionType === "spa" 
          ? '<span class="transition-type spa">SPA Navigation</span>' 
          : '<span class="transition-type navigation">Full Page Load</span>';
        
        // Visual completion display (only for SPA)
        let visualCompletionHtml = '';
        if (metrics.transitionType === "spa" && metrics.VisualCompletionTime) {
          visualCompletionHtml = `
            <div class="metric highlight"><span class="metric-title">Visual Completion:</span> <span class="metric-value">${
              metrics.VisualCompletionTime.toFixed(2)
            }s</span></div>
          `;
        }
        
        // If we have metrics, display them - prioritize this over loading state
        metricsContainer.innerHTML = `
          <div class="metric"><span class="metric-title">URL:</span> <span class="metric-value url">${
            metrics.url || tabUrl
          }</span></div>
          <div class="metric"><span class="metric-title">Navigation Type:</span> <span class="metric-value">${
            transitionTypeDisplay
          }</span></div>
          <div class="metric"><span class="metric-title">TTFB:</span> <span class="metric-value">${
            metrics.TTFB?.toFixed(2) || "N/A"
          }s</span></div>
          <div class="metric"><span class="metric-title">FCP:</span> <span class="metric-value">${
            metrics.FCP?.toFixed(2) || "N/A"
          }s</span></div>
          <div class="metric"><span class="metric-title">LCP:</span> <span class="metric-value">${
            metrics.LCP?.toFixed(2) || "N/A"
          }s</span></div>
          <div class="metric"><span class="metric-title">DOM Load Time:</span> <span class="metric-value">${
            metrics.DOMLoadTime?.toFixed(2) || "N/A"
          }s</span></div>
          <div class="metric"><span class="metric-title">Total Navigation Duration:</span> <span class="metric-value">${
            metrics.TotalNavigationDuration?.toFixed(2) || "N/A"
          }s</span></div>
          ${visualCompletionHtml}
          <div class="metric"><span class="metric-title">Collected:</span> <span class="metric-value">${
            new Date(metrics.timestamp).toLocaleTimeString()
          }</span></div>
        `;
        
        // Force clear loading state if still set
        if (metricsLoading) {
          chrome.storage.local.set({ [`metricsLoading_${tabId}`]: false });
        }
      } else if (metricsLoading) {
        // Only show loading if we have no metrics
        metricsContainer.innerHTML = `<div class="loading">Collecting metrics...</div>`;
      } else {
        // No metrics and not loading - check if this is a supported page
        if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('chrome-extension://')) {
          metricsContainer.innerHTML = `<div class="error">Cannot collect metrics for Chrome internal pages</div>`;
        } else {
          metricsContainer.innerHTML = `<div class="error">No metrics collected for this tab. Try refreshing the page.</div>`;
        }
      }
    });
  });
}
