let LCPTime = 0;
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    LCPTime = entry.startTime / 1000;
  }
});
observer.observe({ type: "largest-contentful-paint", buffered: true });

window.addEventListener("load", () => {
  setTimeout(() => {
    const navEntries = performance.getEntriesByType("navigation")[0];
    if (navEntries) {
      const metrics = {
        TTFB: (navEntries.responseStart - navEntries.startTime) / 1000,
        FCP: (navEntries.domInteractive - navEntries.startTime) / 1000,
        LCP: LCPTime,
        DOMLoadTime:
          (navEntries.domContentLoadedEventEnd - navEntries.startTime) / 1000,
        TotalNavigationDuration:
          (navEntries.responseStart - navEntries.startTime) / 1000 + LCPTime,
      };
      chrome.runtime.sendMessage({ type: "performanceMetrics", data: metrics });
    }
  }, 1000);
});
