import axios, { AxiosInstance } from 'axios';
import { GitHubConfig, FileInfo } from '../types';
import * as path from 'path';
import * as fse from 'fs-extra';
import { Buffer } from 'buffer'; // Import Buffer for base64 handling

// Helper to normalize paths for GitHub API (no leading/trailing slashes needed for content API)
function normalizeGitHubPath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/^\/|\/$/g, ''); // Remove leading/trailing slashes
}

interface GitHubContent {
    type: 'file' | 'dir';
    size: number;
    name: string;
    path: string;
    sha: string;
    url: string;
    git_url: string;
    html_url: string;
    download_url: string | null;
    content?: string; // base64 encoded content for files
    _links: {
        self: string;
        git: string;
        html: string;
    };
}

export class GitHubProvider {
    private client: AxiosInstance;
    private config: GitHubConfig;
    private owner: string;
    private repo: string;
    private branch: string;
    private basePath: string; // Path prefix within the repo

    constructor(config: GitHubConfig) {
        this.config = config;
        const repoParts = config.repo.split('/');
        if (repoParts.length !== 2) {
            throw new Error('Invalid GitHub repository format. Use "owner/repo-name".');
        }
        this.owner = repoParts[0];
        this.repo = repoParts[1];
        this.branch = config.branch || 'main'; // Default to main if not provided
        this.basePath = config.path ? normalizeGitHubPath(config.path) : '';

        this.client = axios.create({
            baseURL: `https://api.github.com/repos/${this.owner}/${this.repo}`,
            headers: {
                'Authorization': `Bearer ${this.config.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
    }

    private getApiPath(relativePath: string): string {
        const normalizedRelative = normalizeGitHubPath(relativePath);
        const fullPath = this.basePath ? `${this.basePath}/${normalizedRelative}` : normalizedRelative;
        return `/contents/${normalizeGitHubPath(fullPath)}`; // Ensure no leading/trailing slash for contents API
    }

    async testConnection(): Promise<void> {
        console.log(`[GitHub] Testing connection to repo: ${this.owner}/${this.repo}`);
        try {
            // Get repository info as a simple connection test
            await this.client.get('');
            console.log(`[GitHub] Connection test successful.`);
        } catch (error: any) {
            console.error(`[GitHub] Connection test failed:`, error.response?.data || error.message);
            if (error.response?.status === 401) {
                throw new Error('GitHub authentication failed. Check your Personal Access Token (PAT).');
            } else if (error.response?.status === 404) {
                throw new Error(`GitHub repository not found: ${this.owner}/${this.repo}. Check owner/repo name.`);
            }
            throw new Error(`GitHub connection test failed: ${error.response?.data?.message || error.message}`);
        }
    }

    // GitHub doesn't have explicit directories, they exist implicitly via file paths.
    // We might need to create a dummy file if an empty dir needs representation.
    async ensureRemoteDir(relativePath: string): Promise<void> {
        // Typically not needed for GitHub unless you need to represent an empty directory.
        // For simplicity, we assume directories are created when files are uploaded into them.
        console.log(`[GitHub] ensureRemoteDir for ${relativePath} - typically a no-op.`);
        return Promise.resolve();
        // If needed later: Upload a .keep file to the directory path.
    }

    private async getFileSha(apiPath: string): Promise<string | null> {
        try {
            const response = await this.client.get<GitHubContent>(`${apiPath}?ref=${this.branch}`);
            if (response.data.type === 'file') {
                return response.data.sha;
            }
            return null; // Path exists but is a directory
        } catch (error: any) {
            if (error.response?.status === 404) {
                return null; // File doesn't exist
            }
            throw error; // Other errors
        }
    }

    async uploadFile(localPath: string, relativeRemotePath: string): Promise<void> {
        const apiPath = this.getApiPath(relativeRemotePath);
        console.log(`[GitHub] Uploading ${localPath} to ${apiPath}`);
        try {
            const contentBuffer = await fse.readFile(localPath);
            const contentBase64 = contentBuffer.toString('base64');

            // Check if file exists to get its SHA for update
            const existingSha = await this.getFileSha(apiPath);

            const payload: any = {
                message: `Sync: Upload ${relativeRemotePath}`, // Commit message
                content: contentBase64,
                branch: this.branch,
            };
            if (existingSha) {
                payload.sha = existingSha;
                console.log(`[GitHub] Updating existing file at ${apiPath} with SHA ${existingSha}`);
            } else {
                console.log(`[GitHub] Creating new file at ${apiPath}`);
            }

            await this.client.put(apiPath, payload);
            console.log(`[GitHub] Successfully uploaded ${apiPath}`);

        } catch (error: any) {
            console.error(`[GitHub] Failed to upload ${localPath} to ${apiPath}:`, error.response?.data || error.message);
            // Handle potential conflicts (e.g., SHA mismatch)?
            throw new Error(`Failed to upload file ${relativeRemotePath} to GitHub: ${error.response?.data?.message || error.message}`);
        }
    }

    async downloadFile(relativeRemotePath: string, localPath: string): Promise<void> {
        const apiPath = this.getApiPath(relativeRemotePath);
        console.log(`[GitHub] Downloading ${apiPath} to ${localPath}`);
        try {
            const response = await this.client.get<GitHubContent>(`${apiPath}?ref=${this.branch}`);

            if (response.data.type !== 'file' || response.data.content === undefined) {
                throw new Error(`Path ${apiPath} is not a file or content is missing.`);
            }

            const contentBase64 = response.data.content.replace(/\\n/g, ''); // Remove newlines if any
            const contentBuffer = Buffer.from(contentBase64, 'base64');

            await fse.ensureDir(path.dirname(localPath));
            await fse.writeFile(localPath, contentBuffer);
            console.log(`[GitHub] Successfully downloaded to ${localPath}`);

        } catch (error: any) {
            console.error(`[GitHub] Failed to download ${apiPath} to ${localPath}:`, error.response?.data || error.message);
            if (error.response?.status === 404) {
                throw new Error(`Remote file not found on GitHub: ${relativeRemotePath}`);
            }
            throw new Error(`Failed to download file ${relativeRemotePath} from GitHub: ${error.response?.data?.message || error.message}`);
        }
    }

    // Recursive function to list files
    private async listFilesRecursive(apiDirPath: string): Promise<FileInfo[]> {
        let files: FileInfo[] = [];
        try {
            const response = await this.client.get<GitHubContent[]>(`${apiDirPath}?ref=${this.branch}`);
            const contents = response.data;

            for (const item of contents) {
                // Calculate path relative to the initial basePath
                const relativeToBasePath = normalizeGitHubPath(item.path).substring(this.basePath ? this.basePath.length + 1 : 0);

                if (item.type === 'file') {
                    files.push({
                        name: item.name,
                        path: relativeToBasePath, // Path relative to sync root
                        isDirectory: false,
                        size: item.size,
                        // lastModified: undefined, // GitHub API v3 content doesn't easily provide this, need commits API
                    });
                } else if (item.type === 'dir') {
                    files.push({
                        name: item.name,
                        path: relativeToBasePath,
                        isDirectory: true,
                    });
                    // Recursively list subdirectory
                    const subFiles = await this.listFilesRecursive(this.getApiPath(relativeToBasePath));
                    files = files.concat(subFiles);
                }
            }
        } catch (error: any) {
            if (error.response?.status === 404) {
                console.log(`[GitHub] Directory not found during listing: ${apiDirPath}`);
                return []; // Return empty if dir doesn't exist
            }
            console.error(`[GitHub] Failed to list directory contents for ${apiDirPath}:`, error.response?.data || error.message);
            throw new Error(`Failed to list GitHub directory ${apiDirPath}: ${error.response?.data?.message || error.message}`);
        }
        return files;
    }

    async listFiles(relativePath: string): Promise<FileInfo[]> {
        const apiPath = this.getApiPath(relativePath);
        console.log(`[GitHub] Listing files recursively starting from: ${apiPath}`);
        // Note: For very large repos, the recursive approach might hit rate limits or be slow.
        // The Git Tree API (`/git/trees/{tree_sha}?recursive=1`) is more efficient but complex to map paths.
        return this.listFilesRecursive(apiPath);
    }
} 