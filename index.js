const express = require('express');
const path = require('path');

// Import the entire compiled backend module
const backendPlugin = require('./dist/plugin');

/**
 * Initialize plugin: Sets up static file serving and API routes.
 * @param {import('express').Router} router Express router provided by SillyTavern
 */
async function init(router) {
    console.log('[Cloud Sync] Initializing plugin via index.js...');

    // Serve static files (index.html, main.js, etc.) from the public directory
    // The '/' path here is relative to the plugin's base URL (/api/plugins/cloud-sync)
    router.use('/', express.static(path.join(__dirname, 'public')));

    // Setup the backend API routes (e.g., /providers, /directory-tree)
    // Access setupRoutes from the imported module
    if (backendPlugin.setupRoutes && typeof backendPlugin.setupRoutes === 'function') {
        backendPlugin.setupRoutes(router);
    } else {
        console.error('[Cloud Sync] Error: setupRoutes function not found in ./dist/plugin.js. Build might be corrupted or incorrect.');
        // Optionally, prevent plugin from fully loading or throw an error
        throw new Error('Failed to initialize Cloud Sync API routes.');
    }

    console.log('[Cloud Sync] Static files and API routes configured.');
}

// Export the interface SillyTavern expects
module.exports = {
    init, // The function SillyTavern calls
    // Access info from the imported module
    info: backendPlugin.info || {
        // Fallback info if the import fails somehow
        id: 'cloud-sync',
        name: 'Cloud Sync (Load Failed)',
        description: 'Failed to load plugin info.',
    },
}; 