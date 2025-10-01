# Technology Stack

## Core Technologies

- **Chrome Extension Manifest V3** - Modern extension architecture with service workers
- **Vanilla JavaScript** - No external frameworks or libraries
- **Performance API** - Browser native performance measurement
- **Chrome Storage API** - Local data persistence
- **Chrome Tabs API** - Tab management and interaction

## Key APIs Used

- `PerformanceObserver` - LCP and paint timing collection
- `MutationObserver` - DOM change detection for SPA transitions
- `Navigation API` - Modern SPA navigation detection (with fallbacks)
- `requestAnimationFrame` - Visual completion tracking
- `chrome.runtime.onMessage` - Extension messaging
- `chrome.storage.local` - Tab-specific metric storage

## Architecture Patterns

- **Service Worker Background Script** - Handles cross-tab communication and storage
- **Content Script Injection** - Runs on all pages to collect metrics
- **Message Passing** - Communication between content scripts and background
- **Tab-Specific Storage** - Metrics keyed by tab ID to prevent cross-contamination

## Development Commands

Since this is a Chrome extension with no build process:

- **Load Extension**: Chrome → Extensions → Developer mode → Load unpacked
- **Reload Extension**: Click reload button in chrome://extensions
- **Debug Content Script**: Use browser DevTools on target page
- **Debug Popup**: Right-click extension icon → Inspect popup
- **Debug Background**: chrome://extensions → Background page (service worker)

## Performance Considerations

- Minimal DOM observation to reduce overhead
- Efficient visual completion detection using frame sampling
- Tab-specific metric isolation
- Graceful fallbacks for older browsers without Navigation API
