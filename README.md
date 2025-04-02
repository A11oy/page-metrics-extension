# Performance Metrics Chrome Extension

A Chrome extension that displays key web performance metrics for any webpage you visit.

## Features

This extension collects and displays the following performance metrics:
- TTFB (Time to First Byte)
- FCP (First Contentful Paint)
- LCP (Largest Contentful Paint)
- DOM Load Time
- Total Navigation Duration

## Installation

1. Clone this repository or download the source code
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the directory containing the extension files

## Usage

1. Click the extension icon in your Chrome toolbar
2. The popup will display the performance metrics for the current webpage
3. Metrics are automatically collected as you browse different pages

## Technical Details

The extension uses the following technologies:
- Chrome Extension Manifest V3
- Performance API for metric collection
- Chrome Storage API for data persistence
- Service Workers for background processing

## Files

- `manifest.json`: Extension configuration
- `content.js`: Collects performance metrics from web pages
- `background.js`: Handles background processes
- `popup.html/js`: Displays the metrics in a popup interface
- `styles.css`: Styling for the popup interface

## License

This project is open source and available under the MIT License. 
