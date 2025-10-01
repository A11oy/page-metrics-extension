# Implementation Plan

- [x] 1. Enhance Core Metrics Collection System

  - Extend the existing content.js to add comprehensive CLS measurement using PerformanceObserver
  - Implement continuous CLS tracking that accumulates layout shift values over time
  - Add proper handling for hadRecentInput filtering to exclude user-initiated shifts
  - _Requirements: 1.1, 1.4_

- [x] 1.1 Implement CLS Performance Observer

  - Create CLSObserver class that extends the existing performance monitoring
  - Add layout-shift entry processing with proper value accumulation
  - Implement threshold-based status evaluation (good: ≤0.1, needs-improvement: 0.1-0.25, poor: >0.25)
  - _Requirements: 1.1, 1.4_

- [x] 1.2 Enhance existing metrics collection with proper units and formatting

  - Update the existing collectMetrics function to include CLS data
  - Ensure all metrics include proper units (ms for timing, score for CLS)
  - Add timestamp tracking for last metric updates
  - _Requirements: 1.1, 1.3_

- [ ]\* 1.3 Write unit tests for CLS measurement accuracy

  - Create test cases for CLS accumulation logic
  - Test hadRecentInput filtering behavior
  - Validate threshold evaluation correctness
  - _Requirements: 1.1, 1.4_

- [x] 2. Implement Threshold Evaluation and Color Coding System

  - Create ThresholdEvaluator class that determines metric status based on Google CWV thresholds
  - Implement color mapping (green/orange/red) for each metric
  - Add accessible indicators for screen readers alongside color coding
  - _Requirements: 1.4, 6.1, 6.3_

- [x] 2.1 Create threshold configuration and evaluation logic

  - Define CWV_THRESHOLDS constant with official Google thresholds
  - Implement evaluateMetric function that returns status and color
  - Add accessible text indicators (e.g., "Good", "Needs Improvement", "Poor")
  - _Requirements: 1.4, 6.3_

- [x] 2.2 Integrate threshold evaluation with metrics collection

  - Update metrics data structure to include threshold results
  - Modify sendMetrics function to include evaluation results
  - Ensure threshold evaluation happens for both initial and updated metrics
  - _Requirements: 1.4, 4.4_

- [x] 3. Enhance SPA Navigation Detection

  - Improve the existing SPA detection in content.js with framework-specific hooks
  - Add History API monitoring (pushState/replaceState events)
  - Implement framework detection for React Router, Vue Router, and Angular Router
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3.1 Implement comprehensive URL change detection

  - Enhance existing URL monitoring with History API event listeners
  - Add location.href polling as fallback for edge cases
  - Implement debounced navigation detection to handle rapid changes
  - _Requirements: 3.1, 3.2_

- [x] 3.2 Add framework-specific navigation hooks

  - Detect React Router navigation events through DOM mutations and route changes
  - Add Vue Router detection using router instance monitoring
  - Implement Angular Router detection through zone.js integration
  - _Requirements: 3.2, 3.3_

- [x] 3.3 Enhance SPA metrics reset and recalculation

  - Improve the existing resetAndCollectMetrics function for better SPA handling
  - Ensure CLS resets properly for SPA navigation while maintaining accuracy
  - Add proper timing calculations for SPA-specific metrics
  - _Requirements: 3.2, 3.3_

- [x] 4. Implement Dynamic Content Handling and Auto-refresh

  - Enhance the existing MutationObserver to detect significant content changes
  - Implement smart update frequency based on content stability
  - Add visual indicators for metric updates in the UI
  - _Requirements: 4.1, 4.2, 4.4, 4.5_

- [x] 4.1 Enhance MutationObserver for dynamic content detection

  - Extend existing DOM mutation tracking to identify layout-affecting changes
  - Implement content change significance scoring (ads, images, infinite scroll)
  - Add debounced metric updates to prevent excessive recalculation
  - _Requirements: 4.1, 4.2_

- [x] 4.2 Implement smart metric update system

  - Create update frequency algorithm based on content stability
  - Add metric change detection to trigger UI highlights
  - Implement "Last updated" timestamp tracking and display
  - _Requirements: 4.4, 4.5_

- [x] 5. Create CLS Visual Debugging System

  - Implement the CLS visual debugger based on the provided script
  - Create toggle functionality in the popup interface
  - Add real-time CLS overlay with color-coded thresholds
  - _Requirements: 1.1, 1.4_

- [x] 5.1 Implement CLS overlay and highlighting system

  - Create CLSDebugger class that manages visual debugging state
  - Implement createCLSOverlay function for the floating CLS indicator
  - Add highlightShiftingSources function to outline problematic elements
  - _Requirements: 1.1, 1.4_

- [x] 5.2 Add toggle control and state management

  - Create toggle button in popup interface for CLS debugging
  - Implement message passing between popup and content script for toggle state
  - Add proper cleanup of highlights and overlay when disabled
  - _Requirements: 1.1, 6.1_

- [x] 5.3 Integrate CLS debugger with main metrics collection

  - Connect CLS observer with visual debugging system
  - Ensure real-time updates of overlay score and element highlighting
  - Add console logging for detailed shift source information
  - _Requirements: 1.1, 1.4_

- [x] 6. Enhance Popup Interface with Accessibility and New Features

  - Redesign the existing popup.html and popup.js to match the UI mockup
  - Implement proper ARIA labels and keyboard navigation support
  - Add the "Copy as JSON" button and CLS debugging toggle
  - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3, 6.4_

- [x] 6.1 Redesign popup HTML structure for accessibility

  - Update popup.html with semantic HTML structure and proper ARIA labels
  - Implement the clean table/grid layout from the UI mockup
  - Add proper heading hierarchy and landmark regions
  - _Requirements: 6.1, 6.3, 6.4_

- [x] 6.2 Implement metrics display with color coding and icons

  - Update renderMetrics function to display color-coded metrics with threshold indicators
  - Add visual icons (✓, ⚠, ✗) alongside colors for accessibility
  - Implement the "Last updated" timestamp display
  - _Requirements: 1.4, 4.5, 6.1, 6.3_

- [x] 6.3 Add JSON export functionality

  - Create exportAsJSON function that formats current metrics as JSON
  - Implement clipboard API integration for copying metrics data
  - Add confirmation toast/message after successful copy operation
  - _Requirements: 5.1, 5.2_

- [x] 6.4 Implement keyboard navigation and screen reader support

  - Add proper tab order and focus management for all interactive elements
  - Implement keyboard shortcuts for common actions (export, toggle debugging)
  - Add screen reader announcements for metric updates and state changes
  - _Requirements: 6.3, 6.4_

- [x] 7. Enhance Loading State Management

  - Improve the existing loading state system to show progress and prevent stale data
  - Add sophisticated loading indicators with progress feedback
  - Implement proper state transitions between loading, loaded, and error states
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 7.1 Implement enhanced loading indicators

  - Create LoadingStateManager class to handle different loading states
  - Add progress indicators for metric collection phases
  - Implement spinner animations and "Measuring performance..." text
  - _Requirements: 2.1, 2.2_

- [x] 7.2 Add stale data prevention and state management

  - Enhance existing tab-specific storage to prevent cross-tab data contamination
  - Implement proper cleanup of previous metrics on navigation
  - Add loading state validation to ensure UI consistency
  - _Requirements: 2.3, 2.1_

- [x] 8. Implement Error Handling and Edge Cases

  - Add comprehensive error handling for unsupported pages and API failures
  - Implement graceful degradation when Performance Observer is unavailable
  - Add user-friendly error messages and fallback behaviors
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 8.1 Add metrics collection error handling

  - Implement try-catch blocks around Performance Observer usage
  - Add fallback mechanisms when specific APIs are unavailable
  - Create user-friendly error messages for different failure scenarios
  - _Requirements: 7.1, 7.2_

- [x] 8.2 Handle unsupported pages and permissions

  - Add detection for chrome:// and extension pages where metrics can't be collected
  - Implement clear messaging for unsupported page types
  - Add permission validation and user guidance for missing permissions
  - _Requirements: 7.3, 7.4_

- [x] 9. Update Extension Manifest and Styling

  - Update manifest.json with any new permissions needed for enhanced functionality
  - Enhance styles.css to implement the UI mockup design with proper accessibility
  - Add responsive design considerations for different popup sizes
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 9.1 Update manifest.json for new features

  - Review and add any additional permissions needed for clipboard access
  - Update extension description to reflect new Core Web Vitals capabilities
  - Ensure all content script matches and permissions are properly configured
  - _Requirements: 5.1, 6.1_

- [x] 9.2 Implement comprehensive CSS styling

  - Create styles matching the UI mockup with proper color coding
  - Implement accessible design with proper contrast ratios and focus indicators
  - Add responsive layout that works well at ~300px width
  - _Requirements: 6.1, 6.2, 6.3_

- [ ]\* 9.3 Write integration tests for complete user workflows

  - Create end-to-end tests for metric collection and display
  - Test SPA navigation scenarios with different frameworks
  - Validate accessibility compliance with automated testing tools
  - _Requirements: All requirements_

- [x] 10. Final Integration and Polish

  - Integrate all components and ensure seamless operation
  - Add final polish to UI animations and transitions
  - Implement comprehensive testing across different website types
  - _Requirements: All requirements_

- [x] 10.1 Integrate all enhanced components

  - Connect CLS debugging system with main metrics collection
  - Ensure proper communication between all popup controls and content script
  - Add final validation of metric accuracy and threshold evaluation
  - _Requirements: All requirements_

- [x] 10.2 Add UI polish and smooth transitions
  - Implement smooth animations for metric updates and loading states
  - Add hover effects and visual feedback for interactive elements
  - Ensure consistent styling and behavior across all components
  - _Requirements: 6.1, 6.2_
