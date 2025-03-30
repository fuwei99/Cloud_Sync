import { getConfig, updateSyncStatus } from './config';
import { getDataPath } from './utils';
import { SyncProviderInstance, ProviderSyncStatus, WebDAVConfig, GitHubConfig, S3Config, SFTPConfig, FileInfo } from './types';
import { WebDAVProvider } from './sync/webdav';
import { GitHubProvider } from './sync/github';
import { S3Provider } from './sync/s3';
import { SFTPProvider } from './sync/sftp';
import * as fse from 'fs-extra';
import * as path from 'path';
import { getFilesRecursive } from './utils';

// Interface for a generic sync provider (can be refined)
interface ISyncProvider {
    testConnection(): Promise<void>;
    uploadFile(localPath: string, remotePath: string): Promise<void>;
    downloadFile(remotePath: string, localPath: string): Promise<void>;
    listFiles(remotePath: string): Promise<FileInfo[]>; // Return type now uses our FileInfo
    ensureRemoteDir(remotePath: string): Promise<void>;
    // Add deleteFile, deleteDirectory if needed for mirror mode
}

/**
 * Creates an instance of a sync provider based on configuration.
 * @param providerConfig The configuration instance for the provider.
 * @returns {ISyncProvider | null} An instance implementing ISyncProvider, or null if type is unknown.
 */
function createProvider(providerConfig: SyncProviderInstance): ISyncProvider | null {
    switch (providerConfig.type) {
        case 'webdav':
            return new WebDAVProvider(providerConfig.config as WebDAVConfig);
        case 'github':
             return new GitHubProvider(providerConfig.config as GitHubConfig);
        case 's3':
             return new S3Provider(providerConfig.config as S3Config);
        case 'sftp':
             return new SFTPProvider(providerConfig.config as SFTPConfig);
        default:
            console.error(`[Sync Service] Unknown provider type: ${providerConfig.type}`);
            return null;
    }
}

/**
 * Triggers a sync operation (upload or download) for the specified providers.
 * @param operation 'upload' or 'download'.
 * @param targetProviderId For download, the ID of the provider to download from.
 */
export async function triggerSyncOperation(operation: 'upload' | 'download', targetProviderId?: string): Promise<void> {
    const config = getConfig();
    const dataPath = getDataPath();
    let providersToSync: SyncProviderInstance[] = [];

    if (operation === 'upload') {
        providersToSync = config.providers.filter(p => p.enabled);
        console.log(`[Sync Service] Starting upload for ${providersToSync.length} enabled providers.`);
    } else if (operation === 'download' && targetProviderId) {
        const provider = config.providers.find(p => p.id === targetProviderId);
        if (provider && provider.enabled) {
            providersToSync = [provider];
            console.log(`[Sync Service] Starting download from provider: ${provider.name} (${provider.id})`);
        } else if (provider) {
             console.warn(`[Sync Service] Download target provider ${targetProviderId} is disabled.`);
             await updateSyncStatus(targetProviderId, { status: 'disabled' });
             return;
        } else {
            console.error(`[Sync Service] Download target provider ${targetProviderId} not found.`);
            // Maybe update status globally or handle differently?
            throw new Error(`Download target provider ${targetProviderId} not found.`);
        }
    } else if (operation === 'download') {
         console.error(`[Sync Service] Download operation requires a targetProviderId.`);
         throw new Error('Download operation requires a target provider ID.');
    }

    if (providersToSync.length === 0) {
        console.log('[Sync Service] No enabled providers found for the operation.');
        return;
    }

    for (const providerInstance of providersToSync) {
        await updateSyncStatus(providerInstance.id, { status: 'in_progress' });
        const providerImpl = createProvider(providerInstance);

        if (!providerImpl) {
            const errorMsg = `Provider type '${providerInstance.type}' not implemented.`;
            await updateSyncStatus(providerInstance.id, { status: 'error', lastSyncError: errorMsg });
            continue;
        }

        try {
            console.log(`[Sync Service] Starting ${operation} for provider: ${providerInstance.name}`);
            
            // --- Replace Placeholder with Actual Logic ---
            if (operation === 'upload') {
                await syncLocalToRemote(dataPath, providerImpl, providerInstance);
            } else { // download
                await syncRemoteToLocal(dataPath, providerImpl, providerInstance);
            }
            // --- End Actual Logic ---

            console.log(`[Sync Service] ${operation} completed for provider: ${providerInstance.name}`);
            await updateSyncStatus(providerInstance.id, { status: 'success' });

        } catch (error: any) {
             const errorMsg = error.message || 'Unknown sync error';
             console.error(`[Sync Service] Error during ${operation} for provider ${providerInstance.name}:`, error);
             await updateSyncStatus(providerInstance.id, { status: 'error', lastSyncError: errorMsg });
        }
    }

    console.log(`[Sync Service] ${operation} process finished for all targeted providers.`);
}

// --- Detailed Sync Logic Implementations --- 

/**
 * Uploads local directory contents to the remote provider.
 * Improved version: Uses batch processing and parallel uploads.
 * Does not handle deletions.
 */
async function syncLocalToRemote(localBaseDir: string, provider: ISyncProvider, providerConfig: SyncProviderInstance) {
    console.log(`[Sync Service] Uploading files from ${localBaseDir} to ${providerConfig.name}`);
    const localFiles = await getFilesRecursive(localBaseDir);
    console.log(`[Sync Service] Found ${localFiles.length} local files to upload.`);

    // GitHub API has rate limits, so we use batch processing
    // Process files in batches of 10 for better performance while avoiding rate limits
    const BATCH_SIZE = 10;
    const totalBatches = Math.ceil(localFiles.length / BATCH_SIZE);
    let completedFiles = 0;
    let failedFiles = 0;
    
    // Process files in sequential batches, with parallel uploads within each batch
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIdx = batchIndex * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, localFiles.length);
        const currentBatch = localFiles.slice(startIdx, endIdx);
        
        console.log(`[Sync Service] Processing batch ${batchIndex + 1}/${totalBatches} (${currentBatch.length} files)`);
        
        // Create an array of upload promises for this batch
        const uploadPromises = currentBatch.map(relativePath => {
            const localFilePath = path.join(localBaseDir, relativePath);
            return (async () => {
                try {
                    // Normalize path for remote provider if needed
                    await provider.uploadFile(localFilePath, relativePath);
                    completedFiles++;
                    return { success: true, path: relativePath };
                } catch (error: any) {
                    failedFiles++;
                    console.error(`[Sync Service] Failed to upload ${relativePath} to ${providerConfig.name}:`, error.message);
                    return { success: false, path: relativePath, error: error.message };
                }
            })();
        });
        
        // Wait for all uploads in this batch to complete
        const results = await Promise.all(uploadPromises);
        
        // Check for failures
        const failures = results.filter(r => !r.success);
        if (failures.length > 0) {
            console.warn(`[Sync Service] ${failures.length} files failed to upload in batch ${batchIndex + 1}`);
            // If more than 50% of the batch failed, abort the sync
            if (failures.length > currentBatch.length / 2) {
                throw new Error(`Too many upload failures in batch ${batchIndex + 1}. Aborting sync.`);
            }
        }
        
        // Add a small delay between batches to avoid overwhelming the API
        if (batchIndex < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    if (failedFiles > 0) {
        console.warn(`[Sync Service] Completed with ${failedFiles} failed uploads out of ${localFiles.length} files.`);
    }
    
    console.log(`[Sync Service] Finished uploading ${completedFiles} files to ${providerConfig.name}.`);
    
    // If more than 20% of all files failed, consider the entire sync failed
    if (failedFiles > localFiles.length * 0.2) {
        throw new Error(`Too many files failed to upload (${failedFiles}/${localFiles.length}). Sync considered failed.`);
    }
}

/**
 * Downloads remote directory contents to the local directory.
 * Improved version: Uses batch processing and parallel downloads.
 */
async function syncRemoteToLocal(localBaseDir: string, provider: ISyncProvider, providerConfig: SyncProviderInstance) {
    console.log(`[Sync Service] Downloading files from ${providerConfig.name} to ${localBaseDir}`);
    
    // First, get the full list of remote files (flattened)
    const remoteFiles: FileInfo[] = [];
    
    // Recursive function to build flat list of files
    async function listRecursive(path: string) {
        const items = await provider.listFiles(path);
        
        for (const item of items) {
            if (item.isDirectory) {
                await listRecursive(item.path);
            } else {
                remoteFiles.push(item);
            }
        }
    }
    
    await fse.ensureDir(localBaseDir); // Ensure base local directory exists
    await listRecursive(''); // Build list starting from root
    
    console.log(`[Sync Service] Found ${remoteFiles.length} remote files to download.`);
    
    // GitHub API has rate limits, so we use batch processing
    // Process files in batches of 5 for better performance while avoiding rate limits
    const BATCH_SIZE = 5;
    const totalBatches = Math.ceil(remoteFiles.length / BATCH_SIZE);
    let completedFiles = 0;
    let failedFiles = 0;
    
    // Process files in sequential batches, with parallel downloads within each batch
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIdx = batchIndex * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, remoteFiles.length);
        const currentBatch = remoteFiles.slice(startIdx, endIdx);
        
        console.log(`[Sync Service] Processing download batch ${batchIndex + 1}/${totalBatches} (${currentBatch.length} files)`);
        
        // Create an array of download promises for this batch
        const downloadPromises = currentBatch.map(file => {
            const localFilePath = path.join(localBaseDir, file.path);
            return (async () => {
                try {
                    // Ensure the directory exists
                    await fse.ensureDir(path.dirname(localFilePath));
                    
                    // Download the file
                    await provider.downloadFile(file.path, localFilePath);
                    completedFiles++;
                    return { success: true, path: file.path };
                } catch (error: any) {
                    failedFiles++;
                    console.error(`[Sync Service] Failed to download ${file.path} from ${providerConfig.name}:`, error.message);
                    return { success: false, path: file.path, error: error.message };
                }
            })();
        });
        
        // Wait for all downloads in this batch to complete
        const results = await Promise.all(downloadPromises);
        
        // Check for failures
        const failures = results.filter(r => !r.success);
        if (failures.length > 0) {
            console.warn(`[Sync Service] ${failures.length} files failed to download in batch ${batchIndex + 1}`);
            // If more than 50% of the batch failed, abort the sync
            if (failures.length > currentBatch.length / 2) {
                throw new Error(`Too many download failures in batch ${batchIndex + 1}. Aborting sync.`);
            }
        }
        
        // Add a small delay between batches to avoid overwhelming the API
        if (batchIndex < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    if (failedFiles > 0) {
        console.warn(`[Sync Service] Completed with ${failedFiles} failed downloads out of ${remoteFiles.length} files.`);
    }
    
    console.log(`[Sync Service] Finished downloading ${completedFiles} files from ${providerConfig.name}.`);
    
    // If more than 20% of all files failed, consider the entire sync failed
    if (failedFiles > remoteFiles.length * 0.2) {
        throw new Error(`Too many files failed to download (${failedFiles}/${remoteFiles.length}). Sync considered failed.`);
    }
} 