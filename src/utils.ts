import * as path from 'path';
import * as fse from 'fs-extra';

let dataPath: string | null = null;

/**
 * Gets the absolute path to the SillyTavern data directory.
 * Uses __dirname to navigate from the built plugin file location.
 * Caches the result for subsequent calls.
 * @returns {string} The absolute path to the data directory.
 * @throws {Error} If the data directory cannot be found.
 */
export function getDataPath(): string {
    if (dataPath) {
        return dataPath;
    }

    // __dirname in a CommonJS module refers to the directory of the current file.
    // Assuming build output is plugins/Cloud_Sync/dist/plugin.js
    // We need to go up three levels to reach the SillyTavern root.
    const sillyTavernRoot = path.resolve(__dirname, '..', '..', '..');
    const potentialDataPath = path.join(sillyTavernRoot, 'data');

    // Basic check to see if the directory likely exists
    try {
        const stats = fse.statSync(potentialDataPath);
        if (!stats.isDirectory()) {
            throw new Error('Expected data path is not a directory.');
        }
        dataPath = potentialDataPath;
        console.log(`[Cloud Sync Utils] Data path resolved to: ${dataPath}`);
        return dataPath;
    } catch (error: any) {
        // Log detailed error for debugging
        console.error(`[Cloud Sync Utils] Error finding data directory at ${potentialDataPath}:`, error.message);
        // Rethrow a more user-friendly error
        throw new Error(
            `Could not find or access the SillyTavern data directory. ` +
            `Expected at: ${potentialDataPath}. ` +
            `Make sure the plugin is installed correctly in the plugins directory.`
        );
    }
}

/**
 * Recursively gets a list of all files within a directory, excluding hidden files/folders.
 * @param dirPath The absolute path to the directory.
 * @param initialBaseDir The initial base directory to calculate relative paths from.
 * @param currentRelativePath The current relative path being traversed.
 * @returns {Promise<string[]>} A promise that resolves with an array of relative file paths.
 */
export async function getFilesRecursive(dirPath: string, initialBaseDir: string = dirPath, currentRelativePath: string = ''): Promise<string[]> {
    const allFiles: string[] = [];
    try {
        const entries = await fse.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            // Skip hidden files and directories (like .git, .DS_Store, etc.) and node_modules
            if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                continue;
            }

            const fullPath = path.join(dirPath, entry.name);
            const relativePath = path.join(currentRelativePath, entry.name).replace(/\\/g, '/'); // Normalize path

            if (entry.isDirectory()) {
                // Recursively get files from subdirectory
                const subFiles = await getFilesRecursive(fullPath, initialBaseDir, relativePath);
                allFiles.push(...subFiles);
            } else if (entry.isFile()) {
                allFiles.push(relativePath);
            }
        }
    } catch (error) {
        console.error(`[Cloud Sync Utils] Error reading directory ${dirPath}:`, error);
        // Depending on requirements, either return empty/partial list or rethrow
        throw error;
    }
    return allFiles;
} 