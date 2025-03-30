import * as fse from 'fs-extra';
import * as path from 'path';
import { PluginConfig, SyncProviderInstance, ProviderSyncStatus } from './types';
// @ts-ignore - Bypass type checking for uuid import if types cannot be resolved
import { v4 as uuidv4 } from 'uuid'; // Import UUID generator
// import type {} from '@types/uuid'; // Removed explicit type import

// In-memory cache for the configuration
let currentConfig: PluginConfig | null = null;

// Determine the path for the config file
const configFilePath = path.resolve(__dirname, '..', 'config.json');

/**
 * Gets the default configuration values.
 * @returns {PluginConfig} The default configuration.
 */
function getDefaultConfig(): PluginConfig {
    return {
        providers: [], // Start with no providers configured
        syncStatus: {}, // Start with empty status object
    };
}

/**
 * Loads the plugin configuration from config.json.
 * Ensures default structure if file is missing or invalid.
 * @returns {Promise<PluginConfig>} A promise that resolves with the loaded configuration.
 */
export async function loadConfig(): Promise<PluginConfig> {
    console.log(`[Cloud Sync Config] Loading configuration from ${configFilePath}`);
    try {
        const exists = await fse.pathExists(configFilePath);
        if (!exists) {
            console.log('[Cloud Sync Config] config.json not found. Using default configuration.');
            currentConfig = getDefaultConfig();
            await saveConfig(currentConfig);
            return currentConfig;
        }

        const configJson = await fse.readJson(configFilePath);

        // Validate basic structure
        if (typeof configJson !== 'object' || configJson === null || !Array.isArray(configJson.providers)) {
            console.warn('[Cloud Sync Config] Invalid config.json structure (missing providers array). Using default configuration.');
            currentConfig = getDefaultConfig();
        } else {
            // Ensure syncStatus object exists
            if (typeof configJson.syncStatus !== 'object' || configJson.syncStatus === null) {
                configJson.syncStatus = {};
            }
            // Merge with defaults to ensure all base keys exist, but keep loaded provider data
            currentConfig = { ...getDefaultConfig(), ...configJson };
            console.log('[Cloud Sync Config] Configuration loaded successfully.');
        }
    } catch (error) {
        console.error('[Cloud Sync Config] Error loading configuration:', error);
        console.warn('[Cloud Sync Config] Falling back to default configuration.');
        currentConfig = getDefaultConfig();
    }

    if (!currentConfig) {
        console.warn('[Cloud Sync Config] currentConfig was null after load attempt, returning default.');
        return getDefaultConfig();
    }
    return currentConfig;
}

/**
 * Saves the provided configuration object to config.json.
 * @param {PluginConfig} config The configuration to save.
 * @returns {Promise<void>} A promise that resolves when saving is complete.
 */
export async function saveConfig(config: PluginConfig): Promise<void> {
    if (!config) {
        console.error('[Cloud Sync Config] Attempted to save null or undefined config.');
        return;
    }
    // Basic validation before saving
    if (!Array.isArray(config.providers) || typeof config.syncStatus !== 'object') {
         console.error('[Cloud Sync Config] Attempted to save invalid config structure.');
         return;
    }

    currentConfig = config; // Update in-memory cache
    try {
        await fse.writeJson(configFilePath, config, { spaces: 2 });
        console.log(`[Cloud Sync Config] Configuration saved to ${configFilePath}`);
    } catch (error) {
        console.error('[Cloud Sync Config] Error saving configuration:', error);
        throw error;
    }
}

/**
 * Gets the currently loaded configuration.
 * @returns {PluginConfig} The current configuration.
 */
export function getConfig(): PluginConfig {
    if (!currentConfig) {
        console.error('[Cloud Sync Config] Attempted to get config before loading. Loading default now.');
        // Attempt to load synchronously for simplicity here, though async load is preferred initially
        try {
            const configJson = fse.readJsonSync(configFilePath);
             if (typeof configJson === 'object' && configJson !== null && Array.isArray(configJson.providers)) {
                 currentConfig = { ...getDefaultConfig(), ...configJson };
                 // Check if currentConfig is not null before accessing its property
                 if (currentConfig && typeof currentConfig.syncStatus !== 'object') {
                    currentConfig.syncStatus = {};
                 }
             } else {
                 currentConfig = getDefaultConfig();
             }
        } catch (e) {
             currentConfig = getDefaultConfig();
        }
    }
    // Add a final check to satisfy the type checker, although logically unreachable if defaults work
     if (!currentConfig) {
         console.error('[Cloud Sync Config] CRITICAL: currentConfig is still null after load attempts! Returning emergency default.');
         return getDefaultConfig(); 
     }
    return currentConfig;
}

// --- Functions for managing providers --- 

/**
 * Adds a new provider configuration.
 * @param providerData The data for the new provider (type, name, config).
 * @returns {Promise<SyncProviderInstance>} The newly added provider instance with a generated ID.
 */
export async function addProvider(providerData: Omit<SyncProviderInstance, 'id'>): Promise<SyncProviderInstance> {
    const config = getConfig();
    const newProvider: SyncProviderInstance = {
        ...providerData,
        id: uuidv4(), // Generate a unique ID
    };
    config.providers.push(newProvider);
    // Initialize status for the new provider
    config.syncStatus[newProvider.id] = { status: 'pending' }; 
    await saveConfig(config);
    return newProvider;
}

/**
 * Updates an existing provider configuration.
 * @param providerId The ID of the provider to update.
 * @param updatedData The partial data to update the provider with.
 * @returns {Promise<SyncProviderInstance | null>} The updated provider instance or null if not found.
 */
export async function updateProvider(providerId: string, updatedData: Partial<Omit<SyncProviderInstance, 'id' | 'type'>>): Promise<SyncProviderInstance | null> {
    const config = getConfig();
    const providerIndex = config.providers.findIndex(p => p.id === providerId);
    if (providerIndex === -1) {
        console.warn(`[Cloud Sync Config] Provider with ID ${providerId} not found for update.`);
        return null;
    }
    // Merge updates, ensuring config object is merged correctly
    const existingProvider = config.providers[providerIndex];
    config.providers[providerIndex] = {
        ...existingProvider,
        ...updatedData,
        // Deep merge config object if present in updatedData
        config: updatedData.config 
            ? { ...existingProvider.config, ...updatedData.config } 
            : existingProvider.config,
    };
     // Reset status if config changed?
    config.syncStatus[providerId] = { status: 'pending' };
    await saveConfig(config);
    return config.providers[providerIndex];
}

/**
 * Removes a provider configuration.
 * @param providerId The ID of the provider to remove.
 * @returns {Promise<boolean>} True if the provider was removed, false otherwise.
 */
export async function removeProvider(providerId: string): Promise<boolean> {
    const config = getConfig();
    const initialLength = config.providers.length;
    config.providers = config.providers.filter(p => p.id !== providerId);
    // Remove associated status
    delete config.syncStatus[providerId];
    if (config.providers.length < initialLength) {
        await saveConfig(config);
        return true;
    }
    return false;
}

/**
 * Updates the sync status for a specific provider.
 * @param providerId The ID of the provider.
 * @param statusUpdate The status update (status, error message, time).
 * @returns {Promise<void>}
 */
export async function updateSyncStatus(providerId: string, statusUpdate: Partial<ProviderSyncStatus>): Promise<void> {
     const config = getConfig();
     if (!config.syncStatus[providerId]) {
         config.syncStatus[providerId] = { status: 'pending' }; // Initialize if missing
     }
     // Merge the update with existing status
     const currentStatus = config.syncStatus[providerId];
     config.syncStatus[providerId] = {
         ...currentStatus,
         ...statusUpdate,
         lastSyncTime: statusUpdate.status ? new Date().toISOString() : currentStatus.lastSyncTime, // Update time on status change
         lastSyncError: statusUpdate.status === 'error' ? statusUpdate.lastSyncError : undefined, // Clear error if status is not error
     };
     // Only save if status actually changed to avoid excessive writes?
     // For simplicity now, save on every update.
     await saveConfig(config); 
}

// Note: Removed the old single-provider updateConfig function.
// Consumers should now use addProvider, updateProvider, removeProvider. 