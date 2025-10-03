# Performance Metrics Chrome Extension

A comprehensive Chrome extension that displays key web performance metrics and provides actionable performance recommendations for any webpage you visit.

## Features

### Core Performance Metrics

This extension collects and displays the following performance metrics:

- **TTFB** (Time to First Byte) - Server response time
- **FCP** (First Contentful Paint) - First visual content render time
- **LCP** (Largest Contentful Paint) - Largest content element render time
- **CLS** (Cumulative Layout Shift) - Visual stability score
- **DOM Load Time** - Time to complete DOM construction
- **Total Navigation Duration** - Complete page load time

### Performance Recommendations

The extension provides intelligent performance analysis and recommendations:

#### Cache Analysis

- **Browser Cache Analysis**: Detects Cache-Control and Expires headers
- **CDN Cache Analysis**: Identifies CDN providers (Cloudflare, AWS CloudFront, Akamai, Fastly) and cache hit/miss status
- **Cache Optimization Recommendations**: Suggests improvements for caching strategies

#### LCP (Largest Contentful Paint) Analysis

- **LCP Element Detection**: Automatically identifies the LCP element on the page
- **Server-Side Rendering Check**: Determines if LCP elements are server-side rendered
- **Preload Analysis**: Checks if LCP resources have appropriate preload hints
- **LCP Optimization Recommendations**: Suggests specific improvements for LCP performance

#### Resource Loading Analysis

- **Script Loading Patterns**: Analyzes defer/async script usage
- **CSS Loading Optimization**: Identifies render-blocking stylesheets
- **Image Optimization**: Detects missing alt attributes and optimization opportunities
- **Preload Link Analysis**: Validates resource preloading strategies

### Core Web Vitals Assessment

- **Threshold-based Evaluation**: Compares metrics against Google's Core Web Vitals thresholds
- **Visual Status Indicators**: Color-coded status (Good/Needs Improvement/Poor)
- **Accessibility Support**: Screen reader compatible with ARIA labels

### Advanced Features

- **SPA (Single Page Application) Support**: Detects and measures SPA navigation transitions
- **Visual Completion Tracking**: Monitors when pages become visually stable
- **Real-time Updates**: Continuously monitors performance during page interactions
- **Error Handling**: Graceful degradation for unsupported pages or limited API access

## Installation

1. Clone this repository or download the source code
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the directory containing the extension files

## Usage

### Basic Metrics View

1. Click the extension icon in your Chrome toolbar
2. The popup displays current page performance metrics
3. Metrics update automatically as you navigate between pages
4. Use "Hard Refresh" button to clear cache and reload page with fresh data

### Performance Recommendations

1. Click the "Generate Recommendations" button in the popup
2. The extension analyzes the current page structure and performance
3. View detailed recommendations organized by category:
   - **Critical Issues**: High-impact performance problems
   - **Optimization Opportunities**: Potential improvements
   - **Best Practices**: General performance guidelines

### Data Freshness & State Management

- **Automatic Clearing**: Extension automatically clears all stored data when you reload or navigate to a new page
- **Hard Refresh**: Use the "Hard Refresh" button to bypass browser cache and get completely fresh metrics
- **Tab Isolation**: Each browser tab maintains separate data to prevent cross-contamination
- **Stale Data Prevention**: Extension detects page reloads and navigation to ensure metrics are always current

### Debug Features

- **CLS Visual Debugging**: Enable visual highlighting of layout shift sources
- **Hard Refresh**: Perform hard page refresh (bypass cache) and clear all extension data
- **Error Reporting**: Detailed error information for troubleshooting
- **Automatic Data Clearing**: Extension automatically clears stale data on page reloads and navigation

## Supported Page Types

### Fully Supported

- HTTP/HTTPS web pages
- Single Page Applications (SPAs)
- Static websites
- Dynamic web applications

### Limited Support

- Local development servers (localhost)
- HTTP pages (some API limitations)
- Pages in iframes

### Not Supported

- Chrome internal pages (`chrome://`)
- Browser extension pages
- Local file pages (`file://`)
- Browser internal pages (`about:`, `edge:`)

## Technical Architecture

### Core Technologies

- **Chrome Extension Manifest V3**: Modern extension architecture with service workers
- **Performance Observer API**: Real-time performance metric collection
- **Navigation API**: SPA transition detection (with fallbacks)
- **MutationObserver**: DOM change detection
- **Chrome Storage API**: Tab-specific data persistence
- **Chrome Tabs API**: Cross-tab communication

### Key Components

#### Content Script (`content.js`)

- Performance metric collection for both traditional and SPA navigation
- LCP element detection and analysis
- CLS measurement with visual debugging
- Performance recommendations engine
- Cache header analysis
- Resource loading pattern analysis

#### Background Script (`background.js`)

- Service worker for cross-tab communication
- Tab-specific metric storage management
- Message routing between content scripts and popup
- Storage cleanup and data integrity

#### Popup Interface (`popup.html/js`)

- Real-time metric display with threshold evaluation
- Performance recommendations UI
- Debug controls and error handling
- Accessibility-compliant interface

#### Styling (`styles.css`)

- Responsive popup design
- Color-coded metric status indicators
- Loading states and animations
- Dark/light theme support

## Performance Considerations

- **Minimal Overhead**: Efficient DOM observation to reduce performance impact
- **Tab Isolation**: Metrics are stored per-tab to prevent cross-contamination
- **Graceful Degradation**: Fallback mechanisms for limited API environments
- **Memory Management**: Automatic cleanup of old metric data

## Browser Compatibility

- **Chrome**: Full support (Manifest V3)
- **Edge**: Full support (Chromium-based)
- **Other Browsers**: Not supported (Chrome extension specific)

## Development

### Project Structure

```
├── manifest.json          # Extension configuration
├── content.js            # Performance analysis and metric collection
├── background.js         # Service worker and storage management
├── popup.html           # Extension popup interface
├── popup.js             # Popup logic and UI management
├── styles.css           # Interface styling
├── metrics_icon.png     # Extension icon
└── README.md           # Documentation
```

### Key Classes and APIs

#### PerformanceRecommendationAnalyzer

- Main analysis engine for performance recommendations
- Handles HTML parsing, resource analysis, and recommendation generation
- Supports both live DOM analysis and static HTML parsing

#### ThresholdEvaluator

- Evaluates metrics against Core Web Vitals thresholds
- Provides consistent status indicators across the interface
- Supports accessibility features

#### CLSObserver

- Comprehensive CLS measurement with visual debugging
- Layout shift source detection and highlighting
- Error handling for browser compatibility

## License

This project is open source and available under the MIT License.
