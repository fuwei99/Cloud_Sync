import type { Router } from 'express'; // Import type only if not needed at runtime
import { loadConfig } from './config';
import { setupRoutes } from './api';
import { getDataPath } from './utils'; // Import to log path on init

// Export setupRoutes for direct use
export { setupRoutes };

// Define Plugin Information
export const info = {
    id: 'cloud-sync',
    name: 'Cloud Sync',
    description: 'Sync SillyTavern data with cloud storage (GitHub, WebDAV, S3, SFTP).',
};

/**
 * Initialize the plugin.
 * Loads configuration and sets up API routes.
 * @param {Router} router Express router provided by SillyTavern.
 * @returns {Promise<void>} Promise that resolves when initialization is complete.
 */
export async function init(router: Router): Promise<void> {
    console.log(`[${info.name}] Initializing plugin...`);
    try {
        // Log the data path for verification
        getDataPath();

        // Load configuration on startup
        await loadConfig();

        // Setup API endpoints under /api/plugins/cloud-sync/
        setupRoutes(router);

        console.log(`[${info.name}] Plugin initialized successfully.`);
    } catch (error) {
        console.error(`[${info.name}] Failed to initialize plugin:`, error);
        // Optional: Decide if the plugin should be considered non-functional
        // or if it can operate in a limited state.
    }
}

/**
 * Optional: Perform cleanup tasks when the server shuts down.
 * @returns {Promise<void>} Promise that resolves when cleanup is complete.
 */
export async function exit(): Promise<void> {
    console.log(`[${info.name}] Plugin shutting down...`);
    // Add any necessary cleanup here (e.g., close connections)
    return Promise.resolve();
} 