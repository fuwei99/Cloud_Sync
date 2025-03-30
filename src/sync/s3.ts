import { 
    S3Client, 
    ListObjectsV2Command, 
    ListObjectsV2CommandOutput,
    PutObjectCommand, 
    GetObjectCommand, 
    HeadObjectCommand, 
    _Object, 
    CommonPrefix 
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { S3Config, FileInfo } from "../types";
import * as path from 'path';
import * as fse from 'fs-extra';

// Helper to normalize S3 keys (use forward slashes, handle prefix)
function normalizeS3Key(basePrefix: string, relativePath: string): string {
    const normalizedRelative = relativePath.replace(/\\\\/g, '/').replace(/^\//, '');
    const fullPath = basePrefix ? `${basePrefix.replace(/\/$/, '')}/${normalizedRelative}` : normalizedRelative;
    return fullPath.replace(/\/$/, ''); // Ensure no trailing slash for objects
}

export class S3Provider {
    private client: S3Client;
    private config: S3Config;
    private bucket: string;
    private pathPrefix: string;

    constructor(config: S3Config) {
        this.config = config;
        this.bucket = config.bucket;
        this.pathPrefix = config.pathPrefix ? config.pathPrefix.replace(/\/$/, '') + '/' : ''; // Ensure trailing slash

        this.client = new S3Client({
            region: config.region,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
            endpoint: config.endpoint, // Optional endpoint for S3-compatible services
        });
    }

    async testConnection(): Promise<void> {
        console.log(`[S3] Testing connection to bucket: ${this.bucket}, region: ${this.config.region}`);
        try {
            // Try listing objects with a limit of 1 as a basic connection/permission test
            const command = new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: this.pathPrefix,
                MaxKeys: 1,
            });
            await this.client.send(command);
            console.log(`[S3] Connection test successful.`);
        } catch (error: any) {
            console.error(`[S3] Connection test failed:`, error);
            if (error.name === 'CredentialsProviderError' || error.message.includes('InvalidAccessKeyId') || error.message.includes('SignatureDoesNotMatch')) {
                 throw new Error('S3 authentication failed. Check Access Key ID and Secret Access Key.');
            } else if (error.name === 'NoSuchBucket') {
                 throw new Error(`S3 bucket not found: ${this.bucket}. Check bucket name and region.`);
            } else if (error.message.includes('getaddrinfo ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
                 throw new Error(`Could not resolve S3 endpoint: ${this.config.endpoint || 'AWS default'}. Check endpoint URL.`);
            }
            throw new Error(`S3 connection test failed: ${error.message}`);
        }
    }

    // S3 doesn't have explicit directories. They are simulated by using / in keys.
    // Creating a directory often means creating an empty object with a trailing slash.
    async ensureRemoteDir(relativePath: string): Promise<void> {
        if (!relativePath) return; // Cannot create the root
        const dirKey = normalizeS3Key(this.pathPrefix, relativePath) + '/';
        console.log(`[S3] Ensuring remote directory (object): ${dirKey}`);
        try {
            // Check if the directory object already exists
            try {
                 const headCommand = new HeadObjectCommand({ Bucket: this.bucket, Key: dirKey });
                 await this.client.send(headCommand);
                 // console.log(`[S3] Directory object ${dirKey} already exists.`);
                 return; // Already exists
            } catch (headError: any) {
                if (headError.name !== 'NotFound') {
                     throw headError; // Re-throw unexpected errors
                }
                // Not found, proceed to create
            }
           
            // Create an empty object to represent the directory
            const command = new PutObjectCommand({
                Bucket: this.bucket,
                Key: dirKey,
                Body: '' // Empty body
            });
            await this.client.send(command);
            console.log(`[S3] Created directory object ${dirKey}`);
        } catch (error: any) {
            console.error(`[S3] Failed to ensure/create directory ${dirKey}:`, error);
            throw new Error(`Failed to create S3 directory ${relativePath}: ${error.message}`);
        }
    }

    async uploadFile(localPath: string, relativeRemotePath: string): Promise<void> {
        const s3Key = normalizeS3Key(this.pathPrefix, relativeRemotePath);
        console.log(`[S3] Uploading ${localPath} to s3://${this.bucket}/${s3Key}`);
        try {
            const fileStream = fse.createReadStream(localPath);
            const command = new PutObjectCommand({
                Bucket: this.bucket,
                Key: s3Key,
                Body: fileStream,
                // Consider adding ContentType, ContentLength for optimization/metadata
                // ContentType: mime.getType(localPath) || 'application/octet-stream',
                // ContentLength: (await fse.stat(localPath)).size
            });
            await this.client.send(command);
            // console.log(`[S3] Successfully uploaded ${s3Key}`);
        } catch (error: any) {
            console.error(`[S3] Failed to upload ${localPath} to ${s3Key}:`, error);
            throw new Error(`Failed to upload file ${relativeRemotePath} to S3: ${error.message}`);
        }
    }

    async downloadFile(relativeRemotePath: string, localPath: string): Promise<void> {
         const s3Key = normalizeS3Key(this.pathPrefix, relativeRemotePath);
         console.log(`[S3] Downloading s3://${this.bucket}/${s3Key} to ${localPath}`);
         const writeStream = fse.createWriteStream(localPath);
         let sourceStream: Readable | null = null; // Hold the Node.js stream

        try {
            await fse.ensureDir(path.dirname(localPath));
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: s3Key,
            });
            const response = await this.client.send(command);
            
            if (!response.Body) {
                throw new Error('S3 response body is empty.');
            }

            // Handle different stream types from S3 response.Body
            if (response.Body instanceof Readable) {
                // It's already a Node.js Readable stream
                sourceStream = response.Body;
            } else if (typeof (response.Body as any).pipe === 'function') {
                 // Duck-typing check for a Node.js compatible stream
                 // Cast to unknown first, then to Readable as suggested by TS
                 sourceStream = response.Body as unknown as Readable;
            } else {
                 // Handle Blob or Uint8Array (requires conversion, could be complex)
                 // For now, log a warning and throw an error if not directly usable
                 console.warn(`[S3] Unsupported stream type received for ${s3Key}. Type: ${response.Body.constructor.name}`);
                 throw new Error(`Unsupported S3 stream type for ${relativeRemotePath}.`);
                 // Note: A more robust solution might involve converting Blobs/Uint8Arrays to Readable streams
                 // using libraries or Node.js built-ins if needed.
            }

            // Pipe the source stream to the file write stream
            await new Promise((resolve, reject) => {
                if (!sourceStream) {
                    return reject(new Error("Failed to obtain a readable stream from S3 response."));
                }
                
                const cleanup = () => {
                     sourceStream?.unpipe(writeStream);
                     sourceStream?.destroy();
                     writeStream.close();
                };

                sourceStream.pipe(writeStream)
                    .on('error', (err) => {
                        console.error(`[S3] Error piping stream for ${s3Key}:`, err);
                        cleanup();
                        // Attempt to delete potentially incomplete file
                        fse.unlink(localPath).catch(unlinkErr => console.error(`[S3] Failed to delete incomplete file ${localPath}:`, unlinkErr));
                        reject(err); 
                    }) 
                    .on('finish', () => {
                         console.log(`[S3] Successfully downloaded ${s3Key} to ${localPath}`);
                         resolve(undefined); 
                    }); 
                
                 // Handle errors on the source stream itself
                 sourceStream.on('error', (err) => {
                     console.error(`[S3] Error on source stream for ${s3Key}:`, err);
                     cleanup();
                     fse.unlink(localPath).catch(unlinkErr => console.error(`[S3] Failed to delete incomplete file ${localPath}:`, unlinkErr));
                     reject(err);
                 });
            });
            
        } catch (error: any) {
            console.error(`[S3] Failed to download ${s3Key} to ${localPath}:`, error);
            // Ensure the write stream is closed on error and incomplete file is removed
            if (writeStream && !writeStream.closed) {
                 writeStream.close(() => {
                     fse.unlink(localPath).catch(unlinkErr => console.error(`[S3] Failed to delete incomplete file ${localPath} after error:`, unlinkErr));
                 });
            }
             if (error.name === 'NoSuchKey') {
                 throw new Error(`Remote file not found on S3: ${relativeRemotePath}`);
             }
             throw new Error(`Failed to download file ${relativeRemotePath} from S3: ${error.message}`);
        }
    }

    async listFiles(relativePath: string): Promise<FileInfo[]> {
        const currentPrefix = normalizeS3Key(this.pathPrefix, relativePath);
        const listPrefix = currentPrefix ? currentPrefix + '/' : this.pathPrefix;
        console.log(`[S3] Listing objects with prefix: s3://${this.bucket}/${listPrefix}`);
        const results: FileInfo[] = [];
        let continuationToken: string | undefined = undefined;

        try {
            do {
                 // Explicitly type the command and response
                 const command: ListObjectsV2Command = new ListObjectsV2Command({
                    Bucket: this.bucket,
                    Prefix: listPrefix,
                    Delimiter: '/',
                    ContinuationToken: continuationToken,
                });
                const response: ListObjectsV2CommandOutput = await this.client.send(command);

                // Add directories (CommonPrefixes)
                 response.CommonPrefixes?.forEach((prefix: CommonPrefix) => { // Add type for prefix
                    if (prefix.Prefix) {
                         const dirName = path.basename(prefix.Prefix.replace(/\/$/, ''));
                         const dirRelativePath = prefix.Prefix.substring(this.pathPrefix.length).replace(/\/$/, '');
                         // Avoid adding the current directory itself if listing root
                         if (dirRelativePath) { 
                            results.push({
                                name: dirName,
                                path: dirRelativePath,
                                isDirectory: true,
                            });
                         }
                    }
                });

                // Add files (Contents)
                response.Contents?.forEach((obj: _Object) => {
                    if (obj.Key && obj.Key !== listPrefix && !obj.Key.endsWith('/')) {
                        const fileName = path.basename(obj.Key);
                        const fileRelativePath = obj.Key.substring(this.pathPrefix.length);
                        results.push({
                            name: fileName,
                            path: fileRelativePath,
                            isDirectory: false,
                            size: obj.Size,
                            lastModified: obj.LastModified,
                        });
                    }
                });

                continuationToken = response.NextContinuationToken;
            } while (continuationToken);

            return results;
        } catch (error: any) {
            console.error(`[S3] Failed to list objects with prefix ${listPrefix}:`, error);
             throw new Error(`Failed to list S3 directory ${relativePath}: ${error.message}`);
        }
    }
} 