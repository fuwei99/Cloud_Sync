import { createClient, WebDAVClient, AuthType, FileStat } from "webdav";
import { WebDAVConfig, FileInfo as LocalFileInfo } from "../types";
import * as path from 'path';
import * as fse from 'fs-extra';

// Helper to normalize paths for WebDAV (always use forward slashes)
function normalizeWebDAVPath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

export class WebDAVProvider {
    private client: WebDAVClient;
    private config: WebDAVConfig;
    private remoteBaseDir: string;

    constructor(config: WebDAVConfig) {
        this.config = config;
        // Normalize the base path
        this.remoteBaseDir = normalizeWebDAVPath(this.config.path.trim());
        // Ensure base directory ends with a slash
        if (!this.remoteBaseDir.endsWith('/')) {
            this.remoteBaseDir += '/';
        }

        const clientOptions: any = {
            url: this.config.url,
        };
        if (this.config.username) {
             clientOptions.authType = AuthType.Password;
             clientOptions.username = this.config.username;
             clientOptions.password = this.config.password || '';
        }

        this.client = createClient(clientOptions);

        // Optional: Configure request timeout or other client settings if needed
        // this.client.setHeaders({ 'Timeout': '30000' }); // Example: 30 second timeout
    }

    /**
     * Tests the connection by attempting to list the base directory.
     */
    async testConnection(): Promise<void> {
        console.log(`[WebDAV] Testing connection to ${this.config.url}, path: ${this.remoteBaseDir}`);
        try {
            // Ensure the base directory exists, try creating it if not (some servers need this)
            await this.ensureRemoteDir(''); // Test ensuring the base dir
            // Attempt to list contents of the base directory
            await this.client.getDirectoryContents(this.remoteBaseDir, { deep: false });
            console.log(`[WebDAV] Connection test successful.`);
        } catch (error: any) {
            console.error(`[WebDAV] Connection test failed:`, error);
            // Provide more specific error messages if possible
            if (error.response?.status === 401) {
                throw new Error('Authentication failed. Check username/password.');
            } else if (error.message.includes('ECONNREFUSED')) {
                throw new Error(`Connection refused. Check server URL: ${this.config.url}`);
            }
            throw new Error(`Failed to connect or access directory ${this.remoteBaseDir}: ${error.message}`);
        }
    }

    /**
     * Ensures a remote directory exists, creating it if necessary.
     * @param relativePath Path relative to the remoteBaseDir.
     */
    async ensureRemoteDir(relativePath: string): Promise<void> {
        const fullRemotePath = normalizeWebDAVPath(path.join(this.remoteBaseDir, relativePath));
        // Ensure trailing slash for directories
        const dirPath = fullRemotePath.endsWith('/') ? fullRemotePath : `${fullRemotePath}/`;
        
        try {
            // Check if directory exists
            const stat = await this.client.stat(dirPath) as FileStat;
            if (stat.type === 'directory') {
                 // console.log(`[WebDAV] Remote directory ${dirPath} already exists.`);
                 return; // Already exists
            }
             throw new Error(`Path ${dirPath} exists but is not a directory.`);
        } catch (error: any) {
            if (error.response?.status === 404) {
                // Not found, try to create it
                console.log(`[WebDAV] Creating remote directory: ${dirPath}`);
                try {
                    await this.client.createDirectory(dirPath, { recursive: true });
                } catch (createError: any) {
                    console.error(`[WebDAV] Failed to create directory ${dirPath}:`, createError);
                    throw new Error(`Failed to create remote directory ${dirPath}: ${createError.message}`);
                }
            } else {
                // Other error during stat
                console.error(`[WebDAV] Error checking remote directory ${dirPath}:`, error);
                throw new Error(`Error accessing remote directory ${dirPath}: ${error.message}`);
            }
        }
    }

    /**
     * Uploads a single file.
     * @param localPath Absolute path to the local file.
     * @param relativeRemotePath Path relative to the remoteBaseDir.
     */
    async uploadFile(localPath: string, relativeRemotePath: string): Promise<void> {
        const remotePath = normalizeWebDAVPath(path.join(this.remoteBaseDir, relativeRemotePath));
        const remoteDir = normalizeWebDAVPath(path.dirname(remotePath));
        
        try {
            // Ensure parent directory exists remotely
            await this.ensureRemoteDir(path.dirname(relativeRemotePath)); 

            console.log(`[WebDAV] Uploading ${localPath} to ${remotePath}`);
            const fileContent = await fse.readFile(localPath);
            const success = await this.client.putFileContents(remotePath, fileContent, {
                overwrite: true, // Overwrite existing files
                // Add progress tracking later if needed
                // onUploadProgress: progress => { ... }
            });

            if (!success) {
                throw new Error('putFileContents returned false, indicating potential failure.');
            }
             // console.log(`[WebDAV] Successfully uploaded ${remotePath}`);
        } catch (error: any) {
            console.error(`[WebDAV] Failed to upload ${localPath} to ${remotePath}:`, error);
            throw new Error(`Failed to upload file ${relativeRemotePath}: ${error.message}`);
        }
    }

    /**
     * Downloads a single file.
     * @param relativeRemotePath Path relative to the remoteBaseDir.
     * @param localPath Absolute path to save the local file.
     */
    async downloadFile(relativeRemotePath: string, localPath: string): Promise<void> {
        const remotePath = normalizeWebDAVPath(path.join(this.remoteBaseDir, relativeRemotePath));
        const localDir = path.dirname(localPath);

        try {
             // Ensure parent directory exists locally
            await fse.ensureDir(localDir);

            console.log(`[WebDAV] Downloading ${remotePath} to ${localPath}`);
            const fileContent = await this.client.getFileContents(remotePath);
            
            if (!(fileContent instanceof Buffer)) {
                throw new Error('Downloaded content is not a Buffer.');
            }

            await fse.writeFile(localPath, fileContent);
            // console.log(`[WebDAV] Successfully downloaded to ${localPath}`);
        } catch (error: any) {
             console.error(`[WebDAV] Failed to download ${remotePath} to ${localPath}:`, error);
             // Handle 404 specifically?
             if (error.response?.status === 404) {
                  throw new Error(`Remote file not found: ${relativeRemotePath}`);
             }
             throw new Error(`Failed to download file ${relativeRemotePath}: ${error.message}`);
        }
    }

    /**
     * Lists files and directories in a remote path (non-recursively).
     * Returns data conforming to our LocalFileInfo interface.
     */
    async listFiles(relativePath: string): Promise<LocalFileInfo[]> {
        const remotePath = normalizeWebDAVPath(path.join(this.remoteBaseDir, relativePath));
        const remotePathWithSlash = remotePath.endsWith('/') ? remotePath : `${remotePath}/`;
        console.log(`[WebDAV] Listing contents of ${remotePathWithSlash}`);
        try {
            const contents = await this.client.getDirectoryContents(remotePathWithSlash, { deep: false }) as FileStat[];
            
            // Map FileStat to LocalFileInfo
            return contents
                // Filter out the directory itself if the server includes it
                .filter(item => item.filename !== remotePathWithSlash && item.basename !== '.') 
                .map(item => {
                    const itemFullPath = normalizeWebDAVPath(item.filename);
                    // Calculate path relative to the base directory
                    const itemRelativePath = itemFullPath.startsWith(this.remoteBaseDir) 
                                            ? itemFullPath.substring(this.remoteBaseDir.length)
                                            : item.basename; // Fallback if prefix doesn't match (shouldn't happen)
                    return {
                        name: item.basename,
                        path: itemRelativePath, 
                        isDirectory: item.type === 'directory',
                        size: item.size,
                        // WebDAV standard doesn't guarantee easy access to modify time in listing
                        // Use lastmod from FileStat if available, otherwise undefined
                        lastModified: item.lastmod ? new Date(item.lastmod) : undefined, 
                    };
                });
        } catch (error: any) {
             console.error(`[WebDAV] Failed to list directory ${remotePathWithSlash}:`, error);
             if (error.response?.status === 404) {
                  console.log(`[WebDAV] Directory not found: ${remotePathWithSlash}`);
                  return []; // Return empty list if directory doesn't exist
             }
             throw new Error(`Failed to list remote directory ${relativePath}: ${error.message}`);
        }
    }

    // Add methods for deleteFile, deleteDirectory if needed for more complex sync strategies.
} 