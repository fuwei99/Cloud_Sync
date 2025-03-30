import * as path from 'path';
import * as fse from 'fs-extra';
// import { logger } from '../utils/logger';
// import { getDataPath } from '../utils/config';
// 使用内联logger对象
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[Cloud Sync] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[Cloud Sync] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[Cloud Sync] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[Cloud Sync] ${message}`, ...args)
};

// 导入实际存在的配置文件
import { getConfig, saveConfig, addProvider, updateProvider, removeProvider } from '../config';
import { getDataPath } from '../utils';
import { SyncProviderInstance, PluginConfig, GitHubConfig, WebDAVConfig, S3Config, SFTPConfig } from '../types';

// Define the structure that includes PluginConfig and the active GitHub ID
interface ExtendedConfig {
    pluginState: PluginConfig;
    activeGithubProviderId?: string;
}

const CONFIG_FILE = path.join(getDataPath(), 'cloud-sync-config.json');
// Initialize with the extended type, providing default values
let currentConfig: ExtendedConfig = { 
    pluginState: { providers: [], syncStatus: {} },
    activeGithubProviderId: undefined 
};

// Ensure data directory exists
fse.ensureDirSync(getDataPath());

// --- Load and Save Functions (Using Extended Config) ---
async function loadExtendedConfig(): Promise<void> {
    try {
        if (await fse.pathExists(CONFIG_FILE)) {
            const rawData = await fse.readFile(CONFIG_FILE, 'utf-8');
            const parsedData = JSON.parse(rawData);
            // Validate parsed data structure
            if (parsedData && parsedData.pluginState && Array.isArray(parsedData.pluginState.providers)) {
                // Assign directly if structure is valid
                currentConfig = parsedData;
                // Ensure defaults for potentially missing optional fields
                if (!currentConfig.pluginState.syncStatus) {
                     currentConfig.pluginState.syncStatus = {};
                }
                 if (currentConfig.activeGithubProviderId === undefined) {
                     currentConfig.activeGithubProviderId = undefined;
                }
            } else {
                 logger.warn('[Cloud Sync] Config file format is outdated or invalid. Attempting migration or starting fresh.');
                 // Attempt migration or reset (basic reset shown here)
                 const providers = (parsedData && Array.isArray(parsedData.providers)) ? parsedData.providers : [];
                 const syncStatus = (parsedData && typeof parsedData.syncStatus === 'object') ? parsedData.syncStatus : {};
                 currentConfig = { 
                     pluginState: { providers: providers, syncStatus: syncStatus },
                     activeGithubProviderId: undefined // Reset active ID
                 };
            }
            
            // Ensure activeGithubProviderId logic is sound
            const githubProviders = currentConfig.pluginState.providers.filter((p: SyncProviderInstance) => p.type === 'github');
            const activeIdExists = currentConfig.activeGithubProviderId && currentConfig.pluginState.providers.some(p => p.id === currentConfig.activeGithubProviderId);
            
            if (githubProviders.length > 0 && !activeIdExists) {
                // If no active ID set, or active ID doesn't exist, default to first GitHub provider
                currentConfig.activeGithubProviderId = githubProviders[0].id; 
            } else if (githubProviders.length === 0) {
                currentConfig.activeGithubProviderId = undefined;
            }
            logger.info('[Cloud Sync] Provider configurations loaded.');

        } else {
            logger.info('[Cloud Sync] No provider configuration file found, starting fresh.');
            currentConfig = { pluginState: { providers: [], syncStatus: {} }, activeGithubProviderId: undefined };
        }
    } catch (error: any) {
        logger.error(`[Cloud Sync] Error loading provider configurations: ${error.message}`);
        currentConfig = { pluginState: { providers: [], syncStatus: {} }, activeGithubProviderId: undefined }; // Reset on error
    }
}

async function saveExtendedConfig(): Promise<void> {
    try {
        await fse.writeJson(CONFIG_FILE, currentConfig, { spaces: 4 });
        logger.info('[Cloud Sync] Provider configurations saved.');
    } catch (error: any) {
        logger.error(`[Cloud Sync] Error saving provider configurations: ${error.message}`);
    }
}

// --- Provider Management Functions ---

function getAllProviders(): SyncProviderInstance[] {
    return currentConfig.pluginState.providers;
}

function getProviderById(id: string): SyncProviderInstance | undefined {
    return currentConfig.pluginState.providers.find((p: SyncProviderInstance) => p.id === id);
}

// Function to get the currently active GitHub *SyncProviderInstance*
function getActiveGithubProvider(): SyncProviderInstance | undefined {
    if (!currentConfig.activeGithubProviderId) {
        return undefined;
    }
    return currentConfig.pluginState.providers.find((p: SyncProviderInstance) => p.id === currentConfig.activeGithubProviderId && p.type === 'github');
}

// Function to get the config data of the active GitHub provider
function getActiveGithubConfig(): GitHubConfig | undefined {
    const activeProvider = getActiveGithubProvider();
    // Ensure the config is actually a GitHubConfig before returning
    if (activeProvider && activeProvider.type === 'github') {
        return activeProvider.config as GitHubConfig;
    }
    return undefined;
}

// Function to add or update a provider instance
async function upsertProvider(providerData: Omit<SyncProviderInstance, 'id'> & { id?: string }): Promise<SyncProviderInstance> {
    const id = providerData.id || `${providerData.type}_${Date.now()}`;
    
    // 检查是否已存在具有相同配置的提供者
    // 对于GitHub提供者，检查repo、branch和path
    if (providerData.type === 'github' && !providerData.id) {
        const config = providerData.config as GitHubConfig;
        const existingProvider = currentConfig.pluginState.providers.find((p: SyncProviderInstance) => {
            if (p.type !== 'github') return false;
            const pConfig = p.config as GitHubConfig;
            return pConfig.repo === config.repo && 
                   pConfig.branch === config.branch &&
                   pConfig.path === config.path;
        });
        
        // 如果找到匹配的提供者，使用它的ID
        if (existingProvider) {
            logger.info(`[Cloud Sync] Found existing GitHub provider with same configuration (${existingProvider.id}). Updating instead of creating new.`);
            const existingIndex = currentConfig.pluginState.providers.findIndex((p: SyncProviderInstance) => p.id === existingProvider.id);
            
            // 使用现有ID更新
            const providerInstance: SyncProviderInstance = {
                id: existingProvider.id,
                type: providerData.type,
                name: providerData.name || existingProvider.name,
                enabled: providerData.enabled,
                config: providerData.config, // 使用新的配置（包括令牌等）
            };
            
            currentConfig.pluginState.providers[existingIndex] = { ...currentConfig.pluginState.providers[existingIndex], ...providerInstance };
            logger.info(`[Cloud Sync] Updated existing provider: ${existingProvider.id} (${providerData.name || existingProvider.name})`);
            
            await saveExtendedConfig();
            const updatedInstance = currentConfig.pluginState.providers.find((p: SyncProviderInstance) => p.id === existingProvider.id);
            if (!updatedInstance) throw new Error('Failed to find provider immediately after update.');
            return updatedInstance;
        }
    }
    
    // 如果是更新现有提供者
    const existingIndex = currentConfig.pluginState.providers.findIndex((p: SyncProviderInstance) => p.id === id);
    
    // Ensure config is structured correctly based on type - Use correct case
    let configData: GitHubConfig | WebDAVConfig | S3Config | SFTPConfig;
    switch(providerData.type) {
        case 'github': configData = providerData.config as GitHubConfig; break;
        case 'webdav': configData = providerData.config as WebDAVConfig; break;
        case 's3': configData = providerData.config as S3Config; break;
        case 'sftp': configData = providerData.config as SFTPConfig; break;
        default: throw new Error(`Invalid provider type: ${(providerData as any).type}`);
    }

    const providerInstance: SyncProviderInstance = {
        id: id,
        type: providerData.type,
        name: providerData.name,
        enabled: providerData.enabled,
        config: configData, // Use the correctly typed config
    };

    if (existingIndex !== -1) {
        // Update existing provider
        currentConfig.pluginState.providers[existingIndex] = { ...currentConfig.pluginState.providers[existingIndex], ...providerInstance };
        logger.info(`[Cloud Sync] Updated provider: ${id} (${providerData.name})`);
    } else {
        // Add new provider
        currentConfig.pluginState.providers.push(providerInstance);
        logger.info(`[Cloud Sync] Added new provider: ${id} (${providerData.name})`);
        // If it's the first GitHub provider, make it active
        if (providerInstance.type === 'github' && !currentConfig.activeGithubProviderId) {
            currentConfig.activeGithubProviderId = id;
             logger.info(`[Cloud Sync] Set new provider ${id} as active GitHub provider.`);
        }
    }
    
    await saveExtendedConfig();
    const savedInstance = currentConfig.pluginState.providers.find((p: SyncProviderInstance) => p.id === id);
    if (!savedInstance) throw new Error('Failed to find provider immediately after upsert.');
    return savedInstance; 
}

// Function to set the active GitHub provider ID
async function setActiveGithubProvider(providerId: string): Promise<boolean> {
     const provider = currentConfig.pluginState.providers.find((p: SyncProviderInstance) => p.id === providerId && p.type === 'github');
     if (provider) {
         currentConfig.activeGithubProviderId = providerId;
         await saveExtendedConfig();
         logger.info(`[Cloud Sync] Set active GitHub provider to: ${providerId}`);
         return true;
     }
     logger.warn(`[Cloud Sync] Failed to set active GitHub provider: ID ${providerId} not found or not a GitHub provider.`);
     return false;
}

// Function to delete a specific provider instance by ID
async function deleteProvider(providerId: string): Promise<boolean> {
    const initialLength = currentConfig.pluginState.providers.length;
    currentConfig.pluginState.providers = currentConfig.pluginState.providers.filter((p: SyncProviderInstance) => p.id !== providerId);
    
    if (currentConfig.pluginState.providers.length < initialLength) {
        // If the deleted provider was the active GitHub one, unset or reset active
        if (currentConfig.activeGithubProviderId === providerId) {
            const remainingGithub = currentConfig.pluginState.providers.find((p: SyncProviderInstance) => p.type === 'github');
            currentConfig.activeGithubProviderId = remainingGithub ? remainingGithub.id : undefined;
            logger.info(`[Cloud Sync] Active GitHub provider ${providerId} deleted. New active: ${currentConfig.activeGithubProviderId || 'None'}`);
        }
        // Remove sync status for the deleted provider
        delete currentConfig.pluginState.syncStatus[providerId];
        await saveExtendedConfig();
        logger.info(`[Cloud Sync] Deleted provider: ${providerId}`);
        return true;
    }
    logger.warn(`[Cloud Sync] Failed to delete provider: ID ${providerId} not found.`);
    return false;
}

// Initial load using the extended config loader
loadExtendedConfig();

// Export functions using the new structure
export { 
    getAllProviders, 
    getProviderById, 
    upsertProvider, 
    getActiveGithubProvider, // Export this one for context
    getActiveGithubConfig,   // Keep this for direct config access (e.g., Git commands)
    setActiveGithubProvider, 
    deleteProvider 
}; 