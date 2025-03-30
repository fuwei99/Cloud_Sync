import SftpClient, { FileInfo as SftpFileInfo } from 'ssh2-sftp-client';
import { SFTPConfig, FileInfo as LocalFileInfo } from '../types';
import * as path from 'path';
import * as fse from 'fs-extra';
import { Readable } from 'stream';

// Helper to normalize SFTP paths (always use forward slashes)
function normalizeSftpPath(filePath: string): string {
    return filePath.replace(/\\\\/g, '/');
}

export class SFTPProvider {
    private client: SftpClient;
    private config: SFTPConfig;
    private remoteBaseDir: string;

    constructor(config: SFTPConfig) {
        this.config = config;
        this.client = new SftpClient();
        // Ensure remote base dir uses forward slashes and ends with a slash
        this.remoteBaseDir = normalizeSftpPath(config.path.trim());
         if (!this.remoteBaseDir.endsWith('/')) {
            this.remoteBaseDir += '/';
        }
    }

    private async connect(): Promise<void> {
        console.log(`[SFTP] Connecting to ${this.config.host}:${this.config.port || 22}...`);
        const connectionOptions: SftpClient.ConnectOptions = {
            host: this.config.host,
            port: this.config.port || 22,
            username: this.config.username,
        };
        if (this.config.password) {
            connectionOptions.password = this.config.password;
        } else if (this.config.privateKey) {
            connectionOptions.privateKey = this.config.privateKey;
            connectionOptions.passphrase = this.config.passphrase;
        } else {
            throw new Error('SFTP connection requires either a password or a private key.');
        }
        try {
             await this.client.connect(connectionOptions);
             console.log("[SFTP] Connected.");
        } catch (error: any) {
             console.error("[SFTP] Connection failed:", error);
             // Improve error messages based on common SFTP errors
             if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                throw new Error(`Could not connect to SFTP host: ${this.config.host}. Check host and port.`);
             } else if (error.message.includes('authentication') || error.message.includes('permission denied')) {
                throw new Error('SFTP authentication failed. Check username, password/key, and permissions.');
             } 
             throw new Error(`SFTP connection failed: ${error.message}`);
        }
    }

    // Disconnect is important for SFTP
    private async disconnect(): Promise<void> {
        console.log("[SFTP] Attempting to disconnect...");
        try {
             await this.client.end();
             console.log("[SFTP] Disconnected successfully or was already disconnected.");
         } catch (error: any) {
             // Log error but don't necessarily throw, as disconnect failure might not be critical
             console.error("[SFTP] Error during disconnect:", error.message);
         }
    }

    // Helper to execute commands with connection management
    private async execute<T>(action: (client: SftpClient) => Promise<T>): Promise<T> {
        await this.connect();
        try {
            return await action(this.client);
        } finally {
            // Decide on disconnect strategy: disconnect after each operation or keep alive?
            // For simplicity now, disconnect after each high-level operation (e.g., test, uploadFile, etc.)
            // await this.disconnect(); // Commented out for potentially better performance if operations are frequent
        }
    }

    async testConnection(): Promise<void> {
        console.log(`[SFTP] Testing connection to ${this.config.host}, path: ${this.remoteBaseDir}`);
        await this.execute(async (client) => {
            try {
                // Try listing the base directory
                await client.list(this.remoteBaseDir);
                console.log(`[SFTP] Connection test successful.`);
            } catch (error: any) {
                 console.error(`[SFTP] Test failed during list operation:`, error);
                 if (error.code === 2) { // Often indicates "No such file or directory"
                    // Try creating the base directory
                    try {
                        await client.mkdir(this.remoteBaseDir, true); // Recursive create
                        console.log(`[SFTP] Base directory created during test.`);
                        // Test list again
                        await client.list(this.remoteBaseDir); 
                        console.log(`[SFTP] Connection test successful after creating base directory.`);
                    } catch(mkdirError: any) {
                         console.error(`[SFTP] Failed to create base directory during test:`, mkdirError);
                         throw new Error(`Failed to access or create SFTP directory ${this.remoteBaseDir}: ${mkdirError.message}`);
                    }
                 } else {
                    throw new Error(`Failed to list SFTP directory ${this.remoteBaseDir}: ${error.message}`);
                 }
            }
        });
         await this.disconnect(); // Disconnect after test
    }

    async ensureRemoteDir(relativePath: string): Promise<void> {
        const remoteDir = normalizeSftpPath(path.join(this.remoteBaseDir, relativePath));
        console.log(`[SFTP] Ensuring remote directory: ${remoteDir}`);
        await this.execute(async (client) => {
            try {
                await client.mkdir(remoteDir, true); // recursive: true
            } catch (error: any) {
                 console.error(`[SFTP] Failed to ensure directory ${remoteDir}:`, error);
                 // Ignore error if directory already exists (some servers might throw)
                 if (!error.message.includes('exists')) { 
                     throw new Error(`Failed to create SFTP directory ${relativePath}: ${error.message}`);
                 }
            }
        });
    }

    async uploadFile(localPath: string, relativeRemotePath: string): Promise<void> {
        const remotePath = normalizeSftpPath(path.join(this.remoteBaseDir, relativeRemotePath));
        const remoteDir = normalizeSftpPath(path.dirname(remotePath));
        console.log(`[SFTP] Uploading ${localPath} to ${remotePath}`);
        await this.execute(async (client) => {
            try {
                await this.ensureRemoteDir(path.dirname(relativeRemotePath)); // Ensure parent dir exists
                await client.fastPut(localPath, remotePath);
                 // console.log(`[SFTP] Successfully uploaded ${remotePath}`);
            } catch (error: any) {
                 console.error(`[SFTP] Failed to upload ${localPath} to ${remotePath}:`, error);
                 throw new Error(`Failed to upload file ${relativeRemotePath} via SFTP: ${error.message}`);
            }
        });
    }

    async downloadFile(relativeRemotePath: string, localPath: string): Promise<void> {
        const remotePath = normalizeSftpPath(path.join(this.remoteBaseDir, relativeRemotePath));
        console.log(`[SFTP] Downloading ${remotePath} to ${localPath}`);
         await this.execute(async (client) => {
            try {
                 await fse.ensureDir(path.dirname(localPath));
                 await client.fastGet(remotePath, localPath);
                 // console.log(`[SFTP] Successfully downloaded to ${localPath}`);
            } catch (error: any) {
                console.error(`[SFTP] Failed to download ${remotePath} to ${localPath}:`, error);
                 if (error.code === 2 || error.message.includes('No such file')) {
                     throw new Error(`Remote file not found via SFTP: ${relativeRemotePath}`);
                 }
                 throw new Error(`Failed to download file ${relativeRemotePath} via SFTP: ${error.message}`);
            }
        });
    }

    async listFiles(relativePath: string): Promise<LocalFileInfo[]> {
        const remoteDir = normalizeSftpPath(path.join(this.remoteBaseDir, relativePath));
        console.log(`[SFTP] Listing contents of ${remoteDir}`);
        return this.execute(async (client) => {
            try {
                const listing: SftpFileInfo[] = await client.list(remoteDir);
                const files: LocalFileInfo[] = listing.map((item: SftpFileInfo) => {
                    const fullItemPath = normalizeSftpPath(path.join(remoteDir, item.name));
                    const relativeItemPath = fullItemPath.startsWith(this.remoteBaseDir) 
                                             ? fullItemPath.substring(this.remoteBaseDir.length)
                                             : item.name;
                    return {
                        name: item.name,
                        path: relativeItemPath, 
                        isDirectory: item.type === 'd',
                        size: item.size,
                        lastModified: new Date(item.modifyTime * 1000),
                    };
                });
                return files;
            } catch (error: any) {
                console.error(`[SFTP] Failed to list directory ${remoteDir}:`, error);
                 if (error.code === 2 || error.message.includes('No such file')) {
                     console.log(`[SFTP] Directory not found: ${remoteDir}`);
                     return [];
                 }
                 throw new Error(`Failed to list SFTP directory ${relativePath}: ${error.message}`);
            }
        });
    }
} 