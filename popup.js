document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get("metrics", (data) => {
    const metrics = data.metrics || {};
    const metricsContainer = document.getElementById("metrics");
    metricsContainer.innerHTML = `
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
        `;
  });
});
