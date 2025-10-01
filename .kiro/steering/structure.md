# Project Structure

## Root Files

- `manifest.json` - Extension configuration and permissions
- `background.js` - Service worker for cross-tab communication and storage
- `content.js` - Injected script for performance metric collection
- `popup.html` - Extension popup interface structure
- `popup.js` - Popup logic and metric display
- `styles.css` - Popup styling and visual design
- `metrics_icon.png` - Extension icon (16x16, 48x48, 128x128)
- `README.md` - Project documentation

## Code Organization

### Background Script (`background.js`)

- Tab-specific metric storage using `metricsStore` object
- Message handling for performance data and loading states
- Tab lifecycle management (activation, updates)
- Storage key pattern: `metrics_${tabId}`, `metricsLoading_${tabId}`

### Content Script (`content.js`)

- Performance metric collection for both navigation types
- SPA transition detection using multiple strategies
- Visual completion tracking with frame analysis
- Observer pattern for LCP, paint events, and DOM mutations

### Popup Interface (`popup.js` + `popup.html`)

- Tab-aware metric display
- Real-time updates every 300ms
- Debug controls and information
- Graceful error handling for unsupported pages

## Naming Conventions

- **Variables**: camelCase (`metricsStore`, `visualCompletionTime`)
- **Constants**: UPPER_SNAKE_CASE (`SPA_INITIAL_WAIT`, `VISUAL_STABILITY_THRESHOLD`)
- **Functions**: camelCase with descriptive names (`resetAndCollectMetrics`, `startVisualCompletionTracking`)
- **CSS Classes**: kebab-case (`metric-title`, `transition-type`)
- **Storage Keys**: descriptive with tab ID (`metrics_${tabId}`, `metricsLoading_${tabId}`)

## File Dependencies

- `manifest.json` → defines all other files and permissions
- `content.js` → communicates with `background.js`
- `popup.js` → reads from storage managed by `background.js`
- `popup.html` → includes `popup.js` and `styles.css`
- All files are standalone with no external dependencies
