import type { Router, Request as ExpressRequest, Response } from 'express';
import {
    getConfig,
    addProvider,
    updateProvider,
    removeProvider,
    updateSyncStatus, // Import this
} from './config';
import { PluginConfig, SyncProviderInstance, WebDAVConfig, GitHubConfig, S3Config, SFTPConfig } from './types'; // Import specific types as needed
// Import sync service later
import { triggerSyncOperation } from './syncService'; 
import { WebDAVProvider } from './sync/webdav'; // Import for testing connection
import { GitHubProvider } from './sync/github'; // Import other providers
import { S3Provider } from './sync/s3';
import { SFTPProvider } from './sync/sftp';
// import * as crypto from 'crypto'; // Remove crypto import if only used for CSRF
import * as fse from 'fs-extra'; // For directory tree
import * as path from 'path'; // For directory tree
import { getDataPath } from './utils'; // For directory tree
import { promisify } from 'util';
import { exec } from 'child_process';
// import * as logger from '../../utils/logger';
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[Cloud Sync] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[Cloud Sync] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[Cloud Sync] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[Cloud Sync] ${message}`, ...args)
};
import { 
    getAllProviders, 
    getProviderById, 
    upsertProvider, 
    getActiveGithubProvider, 
    getActiveGithubConfig, // Use this for Git commands
    setActiveGithubProvider, 
    deleteProvider 
} from './sync/providerManager'; // Assuming providerManager is here

// Promisify exec for async/await usage
const execAsync = promisify(exec);

// Define custom Request type that includes session
interface Request extends ExpressRequest {
    session?: {
        csrfToken?: string;
        [key: string]: any;
    };
}

// Middleware to handle async route errors
const asyncHandler = (fn: (req: Request, res: Response) => Promise<void | Response>) => 
    (req: Request, res: Response) => {
        Promise.resolve(fn(req, res)).catch((error) => {
            console.error(`[Cloud Sync API] Error in route ${req.method} ${req.path}:`, error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'Internal Server Error', message });
        });
    };

export function setupRoutes(router: Router): void {
    console.log('[Cloud Sync API] Setting up API routes for multi-provider...');

    // --- Provider Management --- 

    // Get all provider configurations and the active GitHub ID
    router.get('/providers', asyncHandler(async (req: Request, res: Response) => {
        const providers = getAllProviders();
        // Need to access the raw config object for active ID
        // This requires either exporting currentConfig from providerManager or adding a getter
        // Let's assume we add a getter `getActiveGithubProviderId` to providerManager
        // const activeId = getActiveGithubProviderId(); // Placeholder - Assuming this function is added
        // Temporary workaround: Get active provider and extract ID
        const activeProvider = getActiveGithubProvider();
        const activeId = activeProvider ? activeProvider.id : undefined;

        res.json({ providers, activeGithubProviderId: activeId });
    }));

    // Get details of a specific provider by ID (Optional, but good practice)
    router.get('/providers/:id', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const provider = getProviderById(id);
        if (provider) {
            res.json(provider);
        } else {
            res.status(404).json({ success: false, message: 'Provider not found.' });
        }
    }));

    // Add or Update a provider configuration
    // We use PUT for update, POST for add, or a single POST/PUT for upsert
    // Let's use a single POST route for simplicity, matching upsertProvider logic
    router.post('/providers', asyncHandler(async (req: Request, res: Response) => {
        // The body should contain Omit<SyncProviderInstance, 'id'> & { id?: string }
        const providerData = req.body as Omit<SyncProviderInstance, 'id'> & { id?: string };

        // Basic validation (add more as needed)
        if (!providerData.type || !providerData.name || !providerData.config) {
            return res.status(400).json({ success: false, message: 'Invalid provider data.' });
        }

        try {
            const savedProvider = await upsertProvider(providerData);
            res.status(201).json({ success: true, message: 'Provider saved successfully.', provider: savedProvider });
        } catch (error: any) {
            logger.error(`[Cloud Sync API] Error saving provider: ${error.message}`);
            res.status(500).json({ success: false, message: `Failed to save provider: ${error.message}` });
        }
    }));

    // Set the active GitHub provider
    router.post('/providers/github/active', asyncHandler(async (req: Request, res: Response) => {
        const { providerId } = req.body;
        if (!providerId) {
            return res.status(400).json({ success: false, message: 'providerId is required.' });
        }
        
        const success = await setActiveGithubProvider(providerId);
        if (success) {
            res.json({ success: true, message: `Active GitHub provider set to ${providerId}.` });
        } else {
            res.status(404).json({ success: false, message: `GitHub provider with ID ${providerId} not found.` });
        }
    }));

    // Delete a provider configuration
    router.delete('/providers/:id', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const success = await deleteProvider(id);
        if (success) {
            res.json({ success: true, message: `Provider ${id} deleted.` });
        } else {
            res.status(404).json({ success: false, message: `Provider with ID ${id} not found.` });
        }
    }));

    // Test connection for a specific provider (Updated for all types)
    router.post('/providers/:id/test', asyncHandler(async (req, res) => {
        const { id } = req.params;
        const config = getConfig();
        const providerInstance = config.providers.find(p => p.id === id);

        if (!providerInstance) {
            res.status(404).json({ error: `Provider with ID ${id} not found.` });
            return;
        }

        let success = false;
        let message = '';
        let tester: any = null; // Use any for simplicity here

        try {
            switch (providerInstance.type) {
                case 'webdav':
                    tester = new WebDAVProvider(providerInstance.config as WebDAVConfig);
                    break;
                case 'github':
                    tester = new GitHubProvider(providerInstance.config as GitHubConfig);
                    break;
                case 's3':
                    tester = new S3Provider(providerInstance.config as S3Config);
                    break;
                case 'sftp':
                    tester = new SFTPProvider(providerInstance.config as SFTPConfig);
                    break;
                default:
                    message = `Connection testing not implemented for type '${providerInstance.type}'.`;
                    res.status(501);
                    res.json({ success, message }); // Send response here for unimplemented
                    return;
            }

            await tester.testConnection();
            success = true;
            message = `${providerInstance.type.toUpperCase()} connection successful!`;
            
        } catch (error: any) {
            success = false;
            message = `Connection failed: ${error.message}`;
            console.error(`[Cloud Sync API] Test connection failed for ${id} (${providerInstance.type}):`, error);
        }

        res.json({ success, message });
    }));

    // --- Directory Tree Endpoint --- 
    router.get('/directory-tree', asyncHandler(async (req, res) => {
        try {
            const dataDir = getDataPath();
            const tree = await buildDirectoryTree(dataDir);
            res.json(tree);
        } catch (error: any) {
            console.error("[Cloud Sync API] Error building directory tree:", error);
            res.status(500).json({ error: 'Failed to build directory tree', message: error.message });
        }
    }));

    // --- Sync Operations --- 

    // Trigger an upload to all enabled providers
    router.post('/sync/upload', asyncHandler(async (req, res) => {
        console.log('[Cloud Sync API] Received request to /sync/upload');
        try {
            await triggerSyncOperation('upload');
            res.json({ message: 'Upload initiated for all enabled providers.' });
        } catch (error: any) {
             res.status(500).json({ error: 'Failed to initiate upload', message: error.message });
        }
    }));

    // Trigger a download (requires selecting a source provider)
    router.post('/sync/download/:providerId', asyncHandler(async (req, res) => {
        const { providerId } = req.params;
        console.log(`[Cloud Sync API] Received request to /sync/download from provider ${providerId}`);
        try {
            await triggerSyncOperation('download', providerId);
            res.json({ message: `Download from provider ${providerId} initiated.` });
        } catch (error: any) {
            res.status(500).json({ error: 'Failed to initiate download', message: error.message });
        }
    }));

    // Get synchronization status for all providers
    router.get('/sync/status', asyncHandler(async (req, res) => {
        const config = getConfig();
        res.json(config.syncStatus || {});
    }));

    // --- Git Command Routes ---
    
    // Helper function to get active Git config or return error
    function ensureActiveGitConfig(res: Response): GitHubConfig | null {
        const activeConfig = getActiveGithubConfig();
        if (!activeConfig) {
            res.status(400).json({ success: false, message: '没有活动的 GitHub 配置。请先在提供者设置中添加并激活一个 GitHub 配置。' });
            return null;
        }
        if (!activeConfig.repo || !activeConfig.token) {
             res.status(400).json({ success: false, message: '活动的 GitHub 配置不完整（缺少仓库名或 Token）。请检查配置。' });
            return null;
        }
        return activeConfig;
    }

    // Initialize a Git repository in the data directory
    router.post('/git/init', asyncHandler(async (req: Request, res: Response) => {
        // No longer takes repo/branch/token from body, uses active config
        const activeConfig = ensureActiveGitConfig(res);
        if (!activeConfig) return;

        const { repo, branch = 'main', token } = activeConfig;
        
        try {
            const dataDir = getDataPath(); // Use core function
            const gitDir = path.join(dataDir, '.git');
            logger.info(`[Cloud Sync API] Initializing Git repository in ${dataDir} using active config: ${repo}`);
            
            // Check if .git directory already exists
            if (await fse.pathExists(gitDir)) {
                logger.info(`[Cloud Sync API] .git directory exists. Updating remote for ${repo}.`);
                await execAsync(`cd "${dataDir}" && git remote remove origin || true`);
                await execAsync(`cd "${dataDir}" && git remote add origin https://${token}@github.com/${repo}.git`);
                await execAsync(`cd "${dataDir}" && git fetch`);
                
                try {
                    await execAsync(`cd "${dataDir}" && git pull origin ${branch} --allow-unrelated-histories`);
                } catch (pullError: any) {
                    logger.warn(`[Cloud Sync API] Error pulling changes during init update: ${pullError}`);
                     if (pullError.message && (pullError.message.includes('ECONNRESET') || pullError.message.includes('connect to github.com port 443'))) {
                         return res.json({ 
                            success: true, 
                            message: 'Git 仓库远程源已更新，但无法连接到 GitHub 拉取数据。请检查网络。' 
                        });
                    } // Continue anyway for other pull errors
                }
                return res.json({ success: true, message: 'Git 仓库已更新远程源。' });
            }
            
            logger.info(`[Cloud Sync API] Initializing new Git repository for ${repo}.`);
            await execAsync(`cd "${dataDir}" && git init`);
            await execAsync(`cd "${dataDir}" && git config user.email "sillytavern@example.com"`);
            await execAsync(`cd "${dataDir}" && git config user.name "SillyTavern Cloud Sync"`);
            await execAsync(`cd "${dataDir}" && git remote add origin https://${token}@github.com/${repo}.git`);
            
            try {
                await execAsync(`cd "${dataDir}" && git fetch`);
                await execAsync(`cd "${dataDir}" && git checkout -b ${branch} || git checkout ${branch}`); // Create or switch to branch
                await execAsync(`cd "${dataDir}" && git pull origin ${branch} --allow-unrelated-histories`);
            } catch (pullError: any) {
                logger.warn(`[Cloud Sync API] Error pulling changes during initial init: ${pullError}`);
                if (pullError.message && (pullError.message.includes('ECONNRESET') || pullError.message.includes('connect to github.com port 443'))) {
                     return res.json({ 
                        success: true, 
                        message: 'Git 仓库已初始化，但无法连接到 GitHub 拉取初始数据。请检查网络。' 
                    });
                } // Continue anyway
            }
            
            return res.json({ success: true, message: 'Git 仓库已初始化并连接到远程源。' });

        } catch (error: any) {
            logger.error(`[Cloud Sync API] Error initializing git repository: ${error}`);
            let message = `初始化 Git 仓库失败: ${error.message || error}`;
            if (error.message && (error.message.includes('ECONNRESET') || error.message.includes('connect to github.com port 443'))) {
                message = '初始化 Git 仓库失败：无法连接到 GitHub。请检查网络。'
            }
            return res.status(500).json({ success: false, message: message });
        }
    }));
    
    // Create a .gitignore file with common patterns
    router.post('/git/gitignore', asyncHandler(async (req, res) => {
        const activeConfig = ensureActiveGitConfig(res);
        if (!activeConfig) return;
        const dataDir = getDataPath();
        const gitignorePath = path.join(dataDir, '.gitignore');
        
        try {
            // Check if .gitignore already exists
            const exists = await fse.pathExists(gitignorePath);
            
            if (exists) {
                return res.json({
                    success: true,
                    message: '.gitignore file already exists.'
                });
            }
            
            // Common patterns to ignore
            const gitignoreContent = `
# SillyTavern Cloud Sync .gitignore

# Temporary files
*.tmp
*.temp
*.bak
.DS_Store
Thumbs.db

# Large media files (consider managing these separately)
*.mp3
*.mp4
*.wav
*.webm

# System and cache files
node_modules/
.cache/
.config/
__pycache__/
*.pyc

# Security-sensitive files
*.key
*.pem
*.env
auth.json

# Editor-specific files
.vscode/
.idea/
*.swp
*.swo
`;
            
            await fse.writeFile(gitignorePath, gitignoreContent.trim());
            
            res.json({
                success: true,
                message: '.gitignore file created successfully with common patterns.'
            });
        } catch (error: any) {
            console.error(`[Cloud Sync API] Error creating .gitignore:`, error);
            res.status(500).json({
                success: false,
                message: `Failed to create .gitignore: ${error.message}`
            });
        }
    }));
    
    // Commit changes
    router.post('/git/commit', asyncHandler(async (req, res) => {
        const activeConfig = ensureActiveGitConfig(res);
        if (!activeConfig) return;
        const dataDir = getDataPath();
        const commitMessageBody = req.body.message || `SillyTavern data sync: ${new Date().toISOString()}`; // Allow custom message

        if (!await fse.pathExists(path.join(dataDir, '.git'))) {
            return res.status(400).json({ success: false, message: '未找到 Git 仓库。请先初始化。' });
        }

        try {
            logger.info(`[Cloud Sync API] Committing changes for active repo`);
            // Add all changes first
            await execAsync(`cd "${dataDir}" && git add .`);
            // Commit with timestamp or custom message
            const { stdout, stderr } = await execAsync(
                `cd "${dataDir}" && git commit -m "${commitMessageBody.replace(/"/g, '\"')}"`, 
            );
            if (stdout.includes('nothing to commit')) {
                 return res.json({ success: true, message: '没有检测到需要提交的更改。' , output: stdout });
            }
            return res.json({ success: true, message: '更改提交成功。' , output: stdout || '提交成功。' });
        } catch (error: any) {
            const output = error.stdout || error.stderr || '';
            if (output.includes('nothing to commit')) {
                return res.json({ success: true, message: '没有检测到需要提交的更改。' , output: output });
            }
            logger.error(`[Cloud Sync API] Error committing changes:`, error);
            return res.status(500).json({ success: false, message: `提交失败: ${error.message}` , output: output });
        }
    }));
    
    // Push to remote
    router.post('/git/push', asyncHandler(async (req, res: Response) => {
        const activeConfig = ensureActiveGitConfig(res);
        if (!activeConfig) return;
        const { branch = 'main' } = activeConfig;
        const dataDir = getDataPath();

         if (!await fse.pathExists(path.join(dataDir, '.git'))) {
            return res.status(400).json({ success: false, message: '未找到 Git 仓库。请先初始化。' });
        }

        try {
            logger.info(`[Cloud Sync API] Pushing changes for active repo`);
            const { stdout } = await execAsync(`cd "${dataDir}" && git push origin ${branch}`);
            const outputMessage = stdout && stdout.trim() ? stdout.trim() : 'Everything up-to-date.';
            return res.json({ success: true, message: '推送操作完成。' , output: outputMessage });
        } catch (error: any) {
            logger.error(`[Cloud Sync API] Error pushing changes:`, error);
            let message = `推送失败: ${error.message}`;
            const output = error.stdout || error.stderr || '';
            if (error.message && (error.message.includes('ECONNRESET') || error.message.includes('connect to github.com port 443'))) {
                message = '推送失败：无法连接到 GitHub。请检查网络。'
            } else if (output.includes('rejected') && output.includes('behind')) {
                 message = '推送被拒绝：本地分支落后于远程分支。请先拉取更改。'
            }
            return res.status(500).json({ success: false, message: message, output: output });
        }
    }));
    
    // Pull from remote
    router.post('/git/pull', asyncHandler(async (req: Request, res: Response) => {
        const activeConfig = ensureActiveGitConfig(res);
        if (!activeConfig) return;
        const { branch = 'main' } = activeConfig;
        const dataDir = getDataPath();

        if (!await fse.pathExists(path.join(dataDir, '.git'))) {
            return res.status(400).json({ success: false, message: '未找到 Git 仓库。请先初始化。' });
        }

        try {
            logger.info(`[Cloud Sync API] Pulling changes for active repo`);
            const { stdout } = await execAsync(`cd "${dataDir}" && git pull origin ${branch} --allow-unrelated-histories`);
            return res.json({ success: true, output: stdout || '拉取成功。' , message: '已从远程拉取更改。' });
        } catch (error: any) {
            logger.error(`[Cloud Sync API] Error pulling changes: ${error}`);
            let message = `拉取更改失败: ${error.message || error}`;
            const output = error.stdout || error.stderr || '';
            if (error.message && (error.message.includes('ECONNRESET') || error.message.includes('connect to github.com port 443'))) {
                message = '拉取更改失败：无法连接到 GitHub。请检查网络。'
            }
            return res.status(500).json({ success: false, output: output, message: message });
        }
    }));
    
    // Get status
    router.post('/git/status', asyncHandler(async (req: Request, res: Response) => {
        const activeConfig = ensureActiveGitConfig(res);
        if (!activeConfig) return;
        const dataDir = getDataPath();

        if (!await fse.pathExists(path.join(dataDir, '.git'))) {
            return res.status(400).json({ success: false, message: '未找到 Git 仓库。请先初始化。' });
        }

        try {
            logger.info(`[Cloud Sync API] Getting status for active repo`);
            const { stdout } = await execAsync(`cd "${dataDir}" && git status`);
            return res.json({ success: true, output: stdout, message: '获取状态成功。' });
        } catch (error: any) {
            logger.error(`[Cloud Sync API] Error getting git status: ${error}`);
            return res.status(500).json({ success: false, message: `获取状态失败: ${error.message}` , output: error.stderr || error.message });
        }
    }));

    console.log('[Cloud Sync API] Multi-provider API routes configured.');
}

// --- Helper function to build directory tree --- 
interface DirectoryNode {
    name: string;
    path: string; // Relative path from data directory
    type: 'directory' | 'file';
    size?: number;
    children?: DirectoryNode[];
}

async function buildDirectoryTree(dirPath: string, relativePath: string = ''): Promise<DirectoryNode[]> {
    const entries = await fse.readdir(dirPath, { withFileTypes: true });
    const nodes: DirectoryNode[] = [];

    for (const entry of entries) {
        // Skip hidden files/dirs, node_modules, etc.
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
        }

        const currentPath = path.join(dirPath, entry.name);
        const currentRelativePath = path.join(relativePath, entry.name).replace(/\\/g, '/'); // Normalize path separator
        const stats = await fse.stat(currentPath);

        if (entry.isDirectory()) {
            const children = await buildDirectoryTree(currentPath, currentRelativePath);
            nodes.push({
                name: entry.name,
                path: currentRelativePath,
                type: 'directory',
                children: children,
            });
        } else if (entry.isFile()) {
            nodes.push({
                name: entry.name,
                path: currentRelativePath,
                type: 'file',
                size: stats.size,
            });
        }
    }
    // Sort nodes: directories first, then alphabetically
    nodes.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
    });
    return nodes;
} 