# Design Document

## Overview

The Performance Recommendations feature extends the existing Chrome extension to provide comprehensive performance analysis and actionable optimization suggestions. The feature analyzes the initial full page load to examine caching strategies, LCP optimization, script management, link tag optimization, and CSS analysis. Results are presented in a structured JSON format that can be copied to the clipboard.

## Architecture

### High-Level Architecture

The feature integrates into the existing extension architecture with minimal changes:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Content Script │    │  Background      │    │   Popup UI      │
│                 │    │  Service Worker  │    │                 │
│  - HTML Analysis│◄──►│  - Message       │◄──►│ - Recommendations│
│  - Header Check │    │    Routing       │    │   Button        │
│  - LCP Detection│    │  - Storage       │    │ - Loading State │
│  - Script Scan  │    │    Management    │    │ - JSON Display  │
│  - Link Analysis│    │                  │    │ - Copy Function │
│  - CSS Analysis │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Integration Points

1. **Content Script Enhancement**: Extend existing `content.js` with new analysis capabilities
2. **Background Script Extension**: Add new message handlers for recommendations data
3. **Popup UI Addition**: Add recommendations button and display components
4. **Storage Extension**: Store recommendations data alongside existing metrics

## Components and Interfaces

### 1. Performance Analyzer (Content Script)

**Purpose**: Analyze page performance characteristics and generate recommendations

**Key Classes**:

```javascript
class PerformanceRecommendationAnalyzer {
  constructor() {
    this.analysisResults = {};
    this.isAnalyzing = false;
    this.htmlContent = null;
    this.responseHeaders = null;
  }

  async analyzePerformance() {
    // Main analysis orchestrator
  }

  analyzeCacheHeaders() {
    // Browser and CDN cache analysis
  }

  analyzeLCPElement() {
    // LCP server-side rendering check
  }

  analyzeScripts() {
    // Script optimization opportunities
  }

  analyzeLinks() {
    // Link tag validation and optimization
  }

  analyzeCSS() {
    // CSS loading patterns analysis
  }
}
```

**Interface**:

```javascript
// Message to start analysis
{
  type: "generateRecommendations",
  tabId: number
}

// Response with recommendations
{
  type: "recommendationsGenerated",
  data: {
    cache: {...},
    lcp: {...},
    scripts: {...},
    links: {...},
    css: {...},
    metadata: {...}
  },
  success: boolean
}
```

### 2. HTML Document Analyzer

**Purpose**: Parse and analyze the initial HTML document response

**Key Methods**:

- `fetchDocumentHTML()`: Retrieve original HTML response
- `parseHTMLStructure()`: Parse DOM structure for analysis
- `extractResponseHeaders()`: Get response headers for cache analysis
- `identifyLCPCandidates()`: Find potential LCP elements in HTML

### 3. Cache Analysis Engine

**Purpose**: Analyze browser and CDN caching configurations

**Analysis Areas**:

- **Browser Cache**: Cache-Control, Expires headers
- **CDN Cache**: Age, X-Cache, cf-cache-status headers
- **TTL Extraction**: Parse max-age and CDN-specific TTL values

**Output Format**:

```javascript
{
  browserCache: {
    status: "cached" | "not-cached",
    ttl: number | null,
    headers: {...}
  },
  cdnCache: {
    status: "hit" | "miss" | "unknown",
    provider: "cloudflare" | "akamai" | "fastly" | "aws" | "unknown",
    ttl: number | null,
    headers: {...}
  }
}
```

### 4. Script Optimization Analyzer

**Purpose**: Identify script loading optimization opportunities

**Analysis Areas**:

- Duplicate script detection
- Defer/async script cataloging
- Preload redundancy detection

**Output Format**:

```javascript
{
  duplicates: string[],
  deferScripts: string[],
  asyncScripts: string[],
  recommendations: string[]
}
```

### 5. Link Tag Validator

**Purpose**: Validate and optimize link tag usage

**Analysis Areas**:

- Misplaced preload/prefetch links
- Duplicate preload detection
- Invalid preload relationships
- LCP preload validation

**Output Format**:

```javascript
{
  bodyLinks: string[],
  duplicatePreloads: string[],
  invalidPreloads: string[],
  redundantPreloads: string[],
  lcpPreloadMissing: {
    missing: boolean,
    resourceUrl: string | null
  }
}
```

### 6. Recommendations UI Component

**Purpose**: Display recommendations in popup with loading states

**Key Features**:

- Loading state management
- JSON formatting and display
- Clipboard copy functionality
- Error handling and user feedback

## Data Models

### Recommendations Data Structure

```javascript
{
  metadata: {
    url: string,
    timestamp: number,
    analysisVersion: "2.0",
    pageLoadType: "navigation",
    userAgent: string
  },
  cache: {
    browserCache: {
      status: "cached" | "not-cached",
      ttl: number | null,
      cacheControl: string | null,
      expires: string | null
    },
    cdnCache: {
      status: "hit" | "miss" | "unknown",
      provider: string,
      ttl: number | null,
      age: number | null,
      cacheHeaders: object
    }
  },
  lcp: {
    elementFound: boolean,
    serverSideRendered: boolean,
    elementType: "img" | "video" | "background-image" | null,
    elementSelector: string | null,
    preloadExists: boolean
  },
  scripts: {
    duplicates: string[],
    deferScripts: string[],
    asyncScripts: string[],
    totalExternalScripts: number,
    recommendations: string[]
  },
  links: {
    bodyLinks: string[],
    duplicatePreloads: string[],
    invalidPreloads: string[],
    redundantPreloads: string[],
    totalPreloads: number
  },
  css: {
    stylesheets: Array<{
      href: string,
      position: "head" | "body",
      isDuplicate: boolean
    }>,
    totalStylesheets: number,
    misplacedCount: number
  },
  summary: {
    totalIssues: number,
    criticalIssues: number,
    optimizationOpportunities: number,
    overallScore: "good" | "needs-improvement" | "poor"
  }
}
```

### Storage Schema Extension

Extend existing storage with recommendations data:

```javascript
// Existing: metrics_${tabId}
// New: recommendations_${tabId}
{
  [`recommendations_${tabId}`]: RecommendationsData,
  [`recommendationsLoading_${tabId}`]: boolean,
  [`recommendationsTimestamp_${tabId}`]: number
}
```

## Error Handling

### Analysis Errors

1. **Network Errors**: Handle failed HTML fetch attempts
2. **Parsing Errors**: Graceful handling of malformed HTML
3. **Permission Errors**: Handle restricted access scenarios
4. **Timeout Errors**: Handle long-running analysis operations

### Error Response Format

```javascript
{
  type: "recommendationsError",
  error: {
    code: "NETWORK_ERROR" | "PARSE_ERROR" | "PERMISSION_ERROR" | "TIMEOUT_ERROR",
    message: string,
    details: object
  },
  timestamp: number
}
```

### User-Facing Error Messages

- **Page Not Loaded**: "Please wait for the page to fully load before generating recommendations"
- **Analysis Failed**: "Unable to analyze page performance. Please refresh and try again"
- **Unsupported Page**: "Performance recommendations are not available for this page type"
- **Network Error**: "Could not retrieve page data for analysis"

## Testing Strategy

### Unit Testing Areas

1. **HTML Parser**: Test parsing of various HTML structures
2. **Cache Analyzer**: Test header parsing for different CDN providers
3. **Script Analyzer**: Test duplicate detection and categorization
4. **Link Validator**: Test preload validation logic
5. **JSON Formatter**: Test output format consistency

### Integration Testing

1. **Content-Background Communication**: Test message passing reliability
2. **Storage Integration**: Test data persistence and retrieval
3. **UI State Management**: Test loading states and error handling
4. **Cross-Tab Isolation**: Ensure recommendations don't leak between tabs

### Manual Testing Scenarios

1. **Various Page Types**: Test on different website architectures
2. **CDN Providers**: Test cache detection across major CDN providers
3. **Loading States**: Test button states during analysis
4. **Error Conditions**: Test behavior with network failures
5. **Clipboard Functionality**: Test JSON copy across different browsers

## Performance Considerations

### Analysis Optimization

1. **Lazy Loading**: Only analyze when user requests recommendations
2. **Caching**: Cache analysis results to avoid repeated computation
3. **Timeout Management**: Set reasonable timeouts for network operations
4. **Memory Management**: Clean up analysis data after use

### UI Performance

1. **Non-Blocking Analysis**: Run analysis in background without blocking UI
2. **Progressive Loading**: Show loading states during analysis phases
3. **Efficient Rendering**: Minimize DOM updates during result display
4. **Responsive Design**: Ensure UI remains responsive during analysis

## Security Considerations

### Data Privacy

1. **No External Requests**: All analysis performed locally
2. **Minimal Data Storage**: Store only essential recommendation data
3. **Tab Isolation**: Prevent cross-tab data contamination
4. **Automatic Cleanup**: Remove old recommendation data

### Content Security

1. **Safe HTML Parsing**: Use secure DOM parsing methods
2. **Header Validation**: Validate response headers before processing
3. **Input Sanitization**: Sanitize all user-facing output
4. **Error Information**: Avoid exposing sensitive error details

## Implementation Phases

### Phase 1: Core Analysis Engine

- HTML document fetching and parsing
- Basic cache header analysis
- LCP element detection
- Storage integration

### Phase 2: Advanced Analysis

- Script optimization detection
- Link tag validation
- CSS analysis implementation
- Error handling enhancement

### Phase 3: UI Integration

- Recommendations button implementation
- Loading state management
- JSON display and copy functionality
- User feedback and error messaging

### Phase 4: Polish and Optimization

- Performance optimization
- Enhanced error handling
- Comprehensive testing
- Documentation updates
