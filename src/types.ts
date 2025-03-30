// Define types for different sync providers' configurations
// Add more specific fields as needed (e.g., region for S3)

export interface GitHubConfig {
    token: string; // Personal Access Token
    repo: string; // e.g., "username/repo-name"
    branch: string; // e.g., "main"
    path: string; // e.g., "sillytavern_data/"
}

export interface WebDAVConfig {
    url: string;
    username: string;
    password?: string; // Consider storing securely
    path: string; // e.g., "/remote.php/dav/files/username/sillytavern_data/"
}

export interface S3Config {
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region: string;
    endpoint?: string; // Optional: For S3-compatible services
    pathPrefix?: string; // e.g., "sillytavern_data/"
}

export interface SFTPConfig {
    host: string;
    port?: number; // Default is 22
    username: string;
    password?: string; // Or use privateKey
    privateKey?: string; // Path to the private key file or the key itself
    passphrase?: string; // If the private key is passphrase protected
    path: string; // e.g., "/home/user/sillytavern_data/"
}

// Union type for the active provider configuration
export type ProviderConfig =
    | ({ provider: 'github' } & GitHubConfig)
    | ({ provider: 'webdav' } & WebDAVConfig)
    | ({ provider: 's3' } & S3Config)
    | ({ provider: 'sftp' } & SFTPConfig)
    | ({ provider: 'none' });

// Interface for a configured sync provider instance
export interface SyncProviderInstance {
    id: string; // Unique identifier for this configured instance (e.g., user-defined name or UUID)
    type: 'github' | 'webdav' | 's3' | 'sftp';
    name: string; // User-friendly name for this configuration
    enabled: boolean; // Whether this provider is active for sync operations
    config: GitHubConfig | WebDAVConfig | S3Config | SFTPConfig;
}

// Status for a single provider
export interface ProviderSyncStatus {
    status: 'success' | 'error' | 'in_progress' | 'pending' | 'disabled';
    lastSyncTime?: string; // ISO 8601 format
    lastSyncError?: string;
}

// The overall plugin configuration structure supporting multiple providers
export interface PluginConfig {
    providers: SyncProviderInstance[];
    syncStatus: { [providerId: string]: ProviderSyncStatus };
    // Removed single top-level provider fields
    // Removed single top-level status fields
}

// Example of a FileInfo type for listing remote files
export interface FileInfo {
    name: string; // File or directory name
    path: string; // Full path relative to the sync root
    isDirectory: boolean;
    size?: number; // Size in bytes, if available
    lastModified?: Date; // Last modification time, if available
} 