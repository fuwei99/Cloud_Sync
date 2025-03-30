// SillyTavern Cloud Sync Frontend Logic

console.log("Cloud Sync main.ts loaded.");

// Declare window extension for csrfToken with the correct type
declare global {
    interface Window { csrfToken?: string | null | undefined; }
}

// Global state
let currentProviders: any[] = []; // Consider defining a Provider type
let selectedDirectories = new Set<string>();
let activeGithubProviderId: string | undefined; // 存储当前激活的GitHub提供者ID

// --- API Interaction ---
const API_BASE_URL = '/api/plugins/cloud-sync';

// Function to make API calls (handles CSRF using window.csrfToken)
async function callApi(endpoint: string, method = 'GET', body: any = null): Promise<any> {
    const headers = new Headers({
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'X-Requested-With': 'XMLHttpRequest'
    });

    // Read the LATEST CSRF token right before making the request
    const currentCsrfToken = window.csrfToken; 

    if (currentCsrfToken) {
        headers.set('X-CSRF-Token', currentCsrfToken);
    } else if (['POST', 'PUT', 'DELETE'].includes(method.toUpperCase())) {
         // If token is strictly needed for these methods and is missing, throw error
        console.error(`CSRF token (window.csrfToken) is missing for ${method} request to ${endpoint}. Cannot perform action.`);
        throw new Error("CSRF token is missing. Cannot perform action.");
    }
    
    const options: RequestInit = {
        method,
        headers,
        credentials: 'include',
        mode: 'same-origin',
        cache: 'no-cache'
    };

    if (body && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(body);
    }

    try {
        // Ensure endpoint starts with a slash and remove any duplicate slashes
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${API_BASE_URL}${cleanEndpoint}`.replace(/\/+/g, '/');
        
        const response = await fetch(url, options);
        
        // 处理常见错误状态码
        if (!response.ok) {
            let errorMessage = `请求失败：HTTP状态码 ${response.status}`;
            
            // 尝试获取错误详情，如果有的话
            let errorData;
            try {
                errorData = await response.json();
                if (errorData.message) {
                    errorMessage = errorData.message;
                } else if (errorData.error) {
                    errorMessage = errorData.error;
                }
            } catch (e) {
                // 如果无法解析JSON，使用默认错误信息
                if (response.status === 404) {
                    errorMessage = "资源未找到或API端点不存在";
                } else if (response.status === 401) {
                    errorMessage = "未授权访问，请检查凭据";
                } else if (response.status === 403) {
                    errorMessage = "访问被拒绝，权限不足";
                } else if (response.status === 500) {
                    errorMessage = "服务器内部错误";
                }
            }
            
            console.error(`API错误 (${response.status}) 于 ${method} ${endpoint}:`, errorData || errorMessage);
            
            // 创建包含状态码和消息的错误对象
            const error = new Error(errorMessage);
            (error as any).status = response.status;
            (error as any).apiError = true;
            
            throw error;
        }
        
        if (response.status === 204) {
            return null;
        }
        return await response.json();
    } catch (error) {
        // 传播错误，确保错误能够在调用链中被正确处理
        console.error(`网络或API调用错误，于 ${method} ${endpoint}:`, error);
        throw error;
    }
}

// --- Initialization ---
function initializeUI() {
    console.log("Initializing Cloud Sync UI...");
    setupEventListeners();
    loadProviderConfigurations(); // Load configurations first
    loadConnectionStatus(); // Depends on loaded providers
    loadSyncHistory();
    loadDirectoryTree();
    // loadProviderList(); // This is implicitly called by loadProviderConfigurations now
}

// Standard SillyTavern initialization pattern
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUI);
} else {
    initializeUI();
}

// Add this new function to prevent browser autofill from interfering with PAT display
function preventBrowserInterference() {
    console.log("Adding interference prevention for PAT field...");
    // Wait a short time to let any browser autofill happen first
    setTimeout(() => {
        const githubProvider = currentProviders.find(p => p.type === 'github');
        if (githubProvider && githubProvider.config && githubProvider.config.token) {
            const patInput = document.getElementById('github-pat') as HTMLInputElement;
            if (patInput) {
                console.log("Explicitly setting PAT field value to prevent browser interference");
                // Force reset the field value to what's in our provider config
                patInput.value = githubProvider.config.token;
            }
        }
    }, 500); // 500ms delay
}

function setupEventListeners() {
    console.log("Setting up event listeners...");
    document.getElementById('webdav-connect-btn')?.addEventListener('click', saveWebdavConfig);
    document.getElementById('github-connect-btn')?.addEventListener('click', saveGithubConfig);
    document.getElementById('s3-connect-btn')?.addEventListener('click', saveS3Config);
    document.getElementById('sftp-connect-btn')?.addEventListener('click', saveSftpConfig);
    
    // 添加GitHub配置管理相关的事件监听器
    document.getElementById('github-config-select')?.addEventListener('change', handleGithubConfigChange);
    document.getElementById('github-add-btn')?.addEventListener('click', addNewGithubConfig);
    document.getElementById('github-delete-btn')?.addEventListener('click', deleteSelectedGithubConfig);
    
    // Add Git command button event listeners
    document.getElementById('github-init-git-btn')?.addEventListener('click', initGitRepo);
    document.getElementById('github-create-gitignore-btn')?.addEventListener('click', createGitIgnore);
    document.getElementById('github-commit-btn')?.addEventListener('click', gitCommit);
    document.getElementById('github-push-btn')?.addEventListener('click', gitPush);
    document.getElementById('github-pull-btn')?.addEventListener('click', gitPull);
    document.getElementById('github-status-btn')?.addEventListener('click', gitStatus);
    
    document.querySelectorAll('input[name="sftpAuth"]').forEach(radio => {
        radio.addEventListener('change', handleSftpAuthChange);
    });
    document.getElementById('expand-all-btn')?.addEventListener('click', expandAllDirs);
    document.getElementById('collapse-all-btn')?.addEventListener('click', collapseAllDirs);
    document.getElementById('select-all-btn')?.addEventListener('click', selectAllDirs);
    document.getElementById('deselect-all-btn')?.addEventListener('click', deselectAllDirs);
    document.getElementById('start-sync-btn')?.addEventListener('click', startSync);
    handleSftpAuthChange(); 
}

// --- Provider Configuration Handling --- 
async function saveWebdavConfig() {
    console.log("Attempting to save WebDAV config...");
    const urlInput = document.getElementById('webdav-url') as HTMLInputElement;
    const usernameInput = document.getElementById('webdav-username') as HTMLInputElement;
    const passwordInput = document.getElementById('webdav-password') as HTMLInputElement;
    const pathInput = document.getElementById('webdav-path') as HTMLInputElement;
    const statusElement = document.getElementById('webdav-auth-status');
    const connectButton = document.getElementById('webdav-connect-btn') as HTMLButtonElement;

    if (!urlInput || !usernameInput || !passwordInput || !pathInput || !statusElement || !connectButton) {
        console.error("WebDAV form elements not found!");
        return;
    }

    const url = urlInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    let path = pathInput.value.trim();

    // Basic validation
    if (!url || !username) {
        setStatus(statusElement, 'Please provide URL and username.', 'danger');
        return;
    }
    
    // Ensure path ends with a slash if provided
    if (path && !path.endsWith('/')) {
        path += '/';
        pathInput.value = path;
    }

    const providerData = {
        type: 'webdav',
        name: `WebDAV: ${url.split('//')[1].split('/')[0]}`, // Generate a name from the server
        enabled: true,
        config: {
            url: url,
            username: username,
            password: password,
            path: path
        },
    };

    setButtonLoading(connectButton, true);
    setStatus(statusElement, 'Saving and testing connection...', 'info');

    try {
        const providers = await callApi('/providers');
        const existingProvider = providers.find((p: any) => p.type === 'webdav');

        let savedProvider;
        if (existingProvider) {
            // Update existing provider
            console.log(`Updating existing WebDAV provider (ID: ${existingProvider.id})`);
            const updateData = {
                name: providerData.name,
                enabled: providerData.enabled,
                config: providerData.config,
            };
            savedProvider = await callApi(`/providers/${existingProvider.id}`, 'PUT', updateData);
        } else {
            // Add new provider
            console.log("Adding new WebDAV provider");
            savedProvider = await callApi('/providers', 'POST', providerData);
        }

        // Test the connection after saving
        console.log(`Testing connection for provider ID: ${savedProvider.id}`);
        const testResult = await callApi(`/providers/${savedProvider.id}/test`, 'POST');

        if (testResult.success) {
            setStatus(statusElement, `WebDAV connection successful! Configuration saved.`, 'success');
            loadProviderConfigurations(); // Refresh the provider list
        } else {
            setStatus(statusElement, `Configuration saved, but connection test failed: ${testResult.message}`, 'warning');
        }
    } catch (error: any) {
        console.error("Error saving/testing WebDAV config:", error);
        setStatus(statusElement, `Error: ${error.message}`, 'danger');
    } finally {
        setButtonLoading(connectButton, false);
    }
}

async function saveGithubConfig() {
    console.log("Attempting to save GitHub config...");
    const tokenInput = document.getElementById('github-pat') as HTMLInputElement;
    const repoInput = document.getElementById('github-repo') as HTMLInputElement;
    const branchInput = document.getElementById('github-branch') as HTMLInputElement;
    const pathInput = document.getElementById('github-path') as HTMLInputElement;
    const selectElement = document.getElementById('github-config-select') as HTMLSelectElement;
    const statusElement = document.getElementById('github-auth-status');
    const connectButton = document.getElementById('github-connect-btn') as HTMLButtonElement;

    if (!tokenInput || !repoInput || !branchInput || !pathInput || !statusElement || !connectButton) {
        console.error("GitHub form elements not found!");
        return;
    }

    const token = tokenInput.value.trim();
    const repo = repoInput.value.trim();
    const branch = branchInput.value.trim() || 'main'; // Default to 'main'
    let pathPrefix = pathInput.value.trim();

    // Basic validation
    if (!token || !repo) {
        setStatus(statusElement, '请同时提供个人访问令牌和仓库名称。', 'danger');
        return;
    }
    // Ensure path prefix ends with a slash if provided
    if (pathPrefix && !pathPrefix.endsWith('/')) {
        pathPrefix += '/';
        pathInput.value = pathPrefix; // Update the input field
    }

    const providerData = {
        type: 'github',
        name: `GitHub: ${repo}`, // Auto-generate a name
        enabled: true,
        config: {
            token: token,
            repo: repo,
            branch: branch,
            path: pathPrefix,
        },
    };

    setButtonLoading(connectButton, true);
    setStatus(statusElement, '保存并测试连接...', 'info');

    try {
        // 获取当前选择的配置ID
        const selectedId = selectElement?.value;
        
        // 查找是否存在匹配的配置
        let existingProviders;
        try {
            const response = await callApi('/providers');
            existingProviders = response.providers?.filter((p: any) => 
                p.type === 'github' && 
                p.config.repo === repo && 
                p.config.branch === branch && 
                p.config.path === pathPrefix
            ) || [];
        } catch (error: any) {
            console.error("获取提供者列表失败:", error);
            setStatus(statusElement, `错误: 无法获取现有配置列表 - ${error.message}`, 'danger');
            setButtonLoading(connectButton, false);
            return; // 终止操作
        }
        
        // 保存提供者
        let savedProvider;
        
        try {
            // 如果找到匹配的配置且与当前选择的不同
            if (existingProviders.length > 0 && (!selectedId || existingProviders[0].id !== selectedId)) {
                // 使用已存在的配置ID
                const existingProvider = existingProviders[0];
                console.log(`检测到相同GitHub仓库配置 (ID: ${existingProvider.id})，更新现有配置`);
                
                const updateData = {
                    name: providerData.name,
                    enabled: providerData.enabled,
                    config: providerData.config,
                };
                
                savedProvider = await callApi(`/providers/${existingProvider.id}`, 'PUT', updateData);
                
                // 自动选择该配置
                if (selectElement) {
                    selectElement.value = existingProvider.id;
                }
            } else if (selectedId && existingProviders.some(p => p.id === selectedId)) {
                // 如果选择了有效的配置ID，则更新该配置
                console.log(`更新现有GitHub配置 (ID: ${selectedId})`);
                const updateData = {
                    name: providerData.name,
                    enabled: providerData.enabled,
                    config: providerData.config,
                };
                savedProvider = await callApi(`/providers/${selectedId}`, 'PUT', updateData);
            } else {
                // 添加全新的配置
                console.log("添加新的GitHub配置");
                savedProvider = await callApi('/providers', 'POST', providerData);
            }
        } catch (error: any) {
            console.error("保存配置失败:", error);
            const errorMsg = error.status === 404 
                ? `错误: API 端点不存在，请确保插件正确安装和配置` 
                : `保存配置失败: ${error.message}`;
            setStatus(statusElement, errorMsg, 'danger');
            setButtonLoading(connectButton, false);
            return; // 终止操作
        }
        
        // 检查保存是否成功
        if (!savedProvider || !savedProvider.id) {
            console.error("保存后返回的提供者数据无效:", savedProvider);
            setStatus(statusElement, `错误: 保存配置失败，服务器返回了无效数据`, 'danger');
            setButtonLoading(connectButton, false);
            return; // 终止操作
        }

        // 测试连接
        try {
            console.log(`Testing connection for provider ID: ${savedProvider.id}`);
            const testResult = await callApi(`/providers/${savedProvider.id}/test`, 'POST');

            if (testResult.success) {
                setStatus(statusElement, `GitHub连接成功！配置已保存。`, 'success');
                
                // 设置为活动提供者
                try {
                    await setActiveGithubProvider(savedProvider.id);
                } catch (error) {
                    console.warn("无法设置活动配置，但保存和测试成功:", error);
                    // 不中断流程
                }
                
                // 重新加载配置列表
                try {
                    await loadProviderConfigurations();
                } catch (error) {
                    console.warn("无法重新加载配置列表，但保存和测试成功:", error);
                    // 不中断流程
                }
                
                // 应用干扰预防
                setTimeout(preventBrowserInterference, 1500);
            } else {
                setStatus(statusElement, `配置已保存，但连接测试失败: ${testResult.message}`, 'warning');
            }
        } catch (error: any) {
            console.error("测试连接失败:", error);
            const warningMsg = error.status === 404 
                ? `配置已保存，但测试API不可用。请手动验证连接。` 
                : `配置已保存，但连接测试失败: ${error.message}`;
            setStatus(statusElement, warningMsg, 'warning');
            // 配置已保存，所以不中断操作
        }

    } catch (error: any) {
        console.error("保存/测试GitHub配置时发生错误:", error);
        setStatus(statusElement, `错误: ${error.message}`, 'danger');
    } finally {
        setButtonLoading(connectButton, false);
    }
}

async function saveS3Config() {
    console.log("Attempting to save S3 config...");
    const accessKeyInput = document.getElementById('s3-access-key-id') as HTMLInputElement;
    const secretKeyInput = document.getElementById('s3-secret-access-key') as HTMLInputElement;
    const bucketInput = document.getElementById('s3-bucket') as HTMLInputElement;
    const regionInput = document.getElementById('s3-region') as HTMLInputElement;
    const endpointInput = document.getElementById('s3-endpoint') as HTMLInputElement;
    const prefixInput = document.getElementById('s3-path-prefix') as HTMLInputElement;
    const statusElement = document.getElementById('s3-auth-status');
    const connectButton = document.getElementById('s3-connect-btn') as HTMLButtonElement;

    if (!accessKeyInput || !secretKeyInput || !bucketInput || !regionInput || !endpointInput || !prefixInput || !statusElement || !connectButton) {
        console.error("S3 form elements not found!");
        return;
    }

    const accessKey = accessKeyInput.value.trim();
    const secretKey = secretKeyInput.value.trim();
    const bucket = bucketInput.value.trim();
    const region = regionInput.value.trim() || 'us-east-1'; // Default region
    const endpoint = endpointInput.value.trim();
    let prefix = prefixInput.value.trim();

    // Basic validation
    if (!accessKey || !secretKey || !bucket) {
        setStatus(statusElement, 'Please provide Access Key, Secret Access Key, and Bucket Name.', 'danger');
        return;
    }
    
    // Ensure prefix ends with a slash if provided
    if (prefix && !prefix.endsWith('/')) {
        prefix += '/';
        prefixInput.value = prefix;
    }

    const providerData = {
        type: 's3',
        name: `S3: ${bucket}`, // Auto-generate a name
        enabled: true,
        config: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
            bucket: bucket,
            region: region,
            endpoint: endpoint || undefined, // Only include if provided
            prefix: prefix || undefined
        },
    };

    setButtonLoading(connectButton, true);
    setStatus(statusElement, 'Saving and testing connection...', 'info');

    try {
        const providers = await callApi('/providers');
        const existingProvider = providers.find((p: any) => p.type === 's3');

        let savedProvider;
        if (existingProvider) {
            // Update existing provider
            console.log(`Updating existing S3 provider (ID: ${existingProvider.id})`);
            const updateData = {
                name: providerData.name,
                enabled: providerData.enabled,
                config: providerData.config,
            };
            savedProvider = await callApi(`/providers/${existingProvider.id}`, 'PUT', updateData);
        } else {
            // Add new provider
            console.log("Adding new S3 provider");
            savedProvider = await callApi('/providers', 'POST', providerData);
        }

        // Test the connection after saving
        console.log(`Testing connection for provider ID: ${savedProvider.id}`);
        const testResult = await callApi(`/providers/${savedProvider.id}/test`, 'POST');

        if (testResult.success) {
            setStatus(statusElement, `S3 connection successful! Configuration saved.`, 'success');
            loadProviderConfigurations(); // Refresh the provider list
        } else {
            setStatus(statusElement, `Configuration saved, but connection test failed: ${testResult.message}`, 'warning');
        }
    } catch (error: any) {
        console.error("Error saving/testing S3 config:", error);
        setStatus(statusElement, `Error: ${error.message}`, 'danger');
    } finally {
        setButtonLoading(connectButton, false);
    }
}

async function saveSftpConfig() {
    console.log("Attempting to save SFTP config...");
    const hostInput = document.getElementById('sftp-host') as HTMLInputElement;
    const portInput = document.getElementById('sftp-port') as HTMLInputElement;
    const usernameInput = document.getElementById('sftp-username') as HTMLInputElement;
    const passwordInput = document.getElementById('sftp-password') as HTMLInputElement;
    const privateKeyInput = document.getElementById('sftp-privateKey') as HTMLTextAreaElement;
    const passphraseInput = document.getElementById('sftp-passphrase') as HTMLInputElement;
    const pathInput = document.getElementById('sftp-path') as HTMLInputElement;
    const authTypeKeyInput = document.getElementById('sftpAuthKey') as HTMLInputElement;
    const statusElement = document.getElementById('sftp-auth-status');
    const connectButton = document.getElementById('sftp-connect-btn') as HTMLButtonElement;

    if (!hostInput || !portInput || !usernameInput || !passwordInput || !privateKeyInput || 
        !passphraseInput || !pathInput || !authTypeKeyInput || !statusElement || !connectButton) {
        console.error("SFTP form elements not found!");
        return;
    }

    const host = hostInput.value.trim();
    const portStr = portInput.value.trim();
    const port = portStr ? parseInt(portStr, 10) : 22; // Default to port 22
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const privateKey = privateKeyInput.value.trim();
    const passphrase = passphraseInput.value.trim();
    const useKeyAuth = authTypeKeyInput.checked;
    let path = pathInput.value.trim();

    // Basic validation
    if (!host || !username) {
        setStatus(statusElement, 'Please provide Host and Username.', 'danger');
        return;
    }
    
    if (useKeyAuth && !privateKey) {
        setStatus(statusElement, 'Private Key is required when using key authentication.', 'danger');
        return;
    }
    
    if (!useKeyAuth && !password) {
        setStatus(statusElement, 'Password is required when using password authentication.', 'danger');
        return;
    }
    
    // Ensure path ends with a slash if provided
    if (path && !path.endsWith('/')) {
        path += '/';
        pathInput.value = path;
    }

    const providerData = {
        type: 'sftp',
        name: `SFTP: ${username}@${host}:${port}`, // Auto-generate a name
        enabled: true,
        config: {
            host: host,
            port: port,
            username: username,
            // Only include the appropriate authentication method
            ...(useKeyAuth 
                ? { 
                    privateKey: privateKey,
                    ...(passphrase ? { passphrase: passphrase } : {})
                } 
                : { password: password }),
            path: path
        },
    };

    setButtonLoading(connectButton, true);
    setStatus(statusElement, 'Saving and testing connection...', 'info');

    try {
        const providers = await callApi('/providers');
        const existingProvider = providers.find((p: any) => p.type === 'sftp');

        let savedProvider;
        if (existingProvider) {
            // Update existing provider
            console.log(`Updating existing SFTP provider (ID: ${existingProvider.id})`);
            const updateData = {
                name: providerData.name,
                enabled: providerData.enabled,
                config: providerData.config,
            };
            savedProvider = await callApi(`/providers/${existingProvider.id}`, 'PUT', updateData);
        } else {
            // Add new provider
            console.log("Adding new SFTP provider");
            savedProvider = await callApi('/providers', 'POST', providerData);
        }

        // Test the connection after saving
        console.log(`Testing connection for provider ID: ${savedProvider.id}`);
        const testResult = await callApi(`/providers/${savedProvider.id}/test`, 'POST');

        if (testResult.success) {
            setStatus(statusElement, `SFTP connection successful! Configuration saved.`, 'success');
            loadProviderConfigurations(); // Refresh the provider list
        } else {
            setStatus(statusElement, `Configuration saved, but connection test failed: ${testResult.message}`, 'warning');
        }
    } catch (error: any) {
        console.error("Error saving/testing SFTP config:", error);
        setStatus(statusElement, `Error: ${error.message}`, 'danger');
    } finally {
        setButtonLoading(connectButton, false);
    }
}

// Add this function back
function handleSftpAuthChange() {
    const sftpAuthKeyElement = document.getElementById('sftpAuthKey') as HTMLInputElement | null;
    const sftpPassFieldsElement = document.getElementById('sftpPassFields');
    const sftpKeyFieldsElement = document.getElementById('sftpKeyFields');
    const useKeyAuth = sftpAuthKeyElement?.checked ?? false;
    if(sftpPassFieldsElement) sftpPassFieldsElement.style.display = useKeyAuth ? 'none' : 'block';
    if(sftpKeyFieldsElement) sftpKeyFieldsElement.style.display = useKeyAuth ? 'block' : 'none';
}

// --- Utility functions for UI feedback ---
function setStatus(element: HTMLElement, message: string, type: 'info' | 'success' | 'warning' | 'danger') {
    if (!element) return;
    element.className = `alert alert-${type}`;
    element.textContent = message;
}

function setButtonLoading(button: HTMLButtonElement, isLoading: boolean) {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...`;
    } else {
        button.disabled = false;
        // Restore original text based on button ID
        if (button.id === 'github-connect-btn') button.textContent = 'Save GitHub Config';
        else if (button.id === 'webdav-connect-btn') button.textContent = 'Save WebDAV Config';
        else if (button.id === 's3-connect-btn') button.textContent = 'Save S3 Config';
        else if (button.id === 'sftp-connect-btn') button.textContent = 'Save SFTP Config';
        else button.textContent = 'Save'; // Default fallback
    }
}

// --- Provider List ---
async function loadProviderConfigurations() {
    console.log("Loading provider configurations...");
    try {
        const response = await callApi('/providers');
        currentProviders = response.providers; // 更新全局提供者列表
        activeGithubProviderId = response.activeGithubProviderId; // 存储活动GitHub提供者ID

        // Update UI based on loaded providers
        populateProviderForms(); // 现已更新以处理多个GitHub配置
        
        // Update the Start Sync button state based on enabled providers
        const startSyncBtn = document.getElementById('start-sync-btn') as HTMLButtonElement | null;
        if (startSyncBtn) {
            startSyncBtn.disabled = currentProviders.filter((p: any) => p.enabled).length === 0;
        }
        
        // Also update connection status display now that we have the data
        loadConnectionStatus();

        // Apply interference prevention as a final step (after a delay)
        setTimeout(preventBrowserInterference, 1000);

        return currentProviders;
    } catch (error: any) {
        console.error("Error loading provider configurations:", error);
        // Handle error in UI, maybe show a message
        const connectionStatusElement = document.getElementById('connection-status');
        if (connectionStatusElement) {
            connectionStatusElement.innerHTML = `<div class="alert alert-danger">Error loading provider configurations: ${error.message}</div>`;
        }
        // Disable sync button on error
        const startSyncBtn = document.getElementById('start-sync-btn') as HTMLButtonElement | null;
        if (startSyncBtn) startSyncBtn.disabled = true;
        return [];
    }
}

// New function to populate forms with loaded provider data
function populateProviderForms(providerId?: string) {
    // 填充GitHub表单
    const githubProviders = currentProviders.filter(p => p.type === 'github');
    const selectElement = document.getElementById('github-config-select') as HTMLSelectElement;
    
    if (selectElement) {
        // 保存当前选择值
        const currentSelection = selectElement.value;
        
        // 清空下拉列表
        selectElement.innerHTML = '<option value="">-- Select a configuration --</option>';
        
        // 添加所有GitHub配置到下拉列表
        githubProviders.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider.id;
            option.textContent = provider.name;
            option.selected = provider.id === (providerId || activeGithubProviderId);
            selectElement.appendChild(option);
        });
        
        // 如果没有选中项但有之前的选择，则恢复之前的选择
        if (!selectElement.value && currentSelection) {
            selectElement.value = currentSelection;
        }
    }
    
    // 获取要显示的GitHub配置
    let githubProvider;
    if (providerId) {
        // 使用指定的提供者ID
        githubProvider = currentProviders.find(p => p.id === providerId);
    } else if (activeGithubProviderId) {
        // 使用活动的GitHub提供者ID
        githubProvider = currentProviders.find(p => p.id === activeGithubProviderId);
    } else if (githubProviders.length > 0) {
        // 如果没有活动ID但有GitHub配置，使用第一个
        githubProvider = githubProviders[0];
    }
    
    // 填充GitHub表单字段
    if (githubProvider && githubProvider.config) {
        const repoInput = document.getElementById('github-repo') as HTMLInputElement;
        const branchInput = document.getElementById('github-branch') as HTMLInputElement;
        const pathInput = document.getElementById('github-path') as HTMLInputElement;
        const patInput = document.getElementById('github-pat') as HTMLInputElement;
        const statusElement = document.getElementById('github-auth-status');

        if (repoInput) repoInput.value = githubProvider.config.repo || '';
        if (branchInput) branchInput.value = githubProvider.config.branch || 'main';
        if (pathInput) pathInput.value = githubProvider.config.path || '';
        if (patInput) patInput.value = githubProvider.config.token || '';
        
        if (statusElement) {
             const message = githubProvider.config.token 
                 ? `GitHub配置已加载 - 仓库: ${githubProvider.config.repo}. PAT已加载.`
                 : `GitHub配置已加载 - 仓库: ${githubProvider.config.repo}. 请输入PAT进行测试/保存.`;
             setStatus(statusElement, message, 'info');
        }
        
        // 更新按钮状态
        const deleteBtn = document.getElementById('github-delete-btn') as HTMLButtonElement;
        if (deleteBtn) {
            deleteBtn.disabled = !githubProvider.id;
        }
    } else {
        // 清空表单
        const repoInput = document.getElementById('github-repo') as HTMLInputElement;
        const branchInput = document.getElementById('github-branch') as HTMLInputElement;
        const pathInput = document.getElementById('github-path') as HTMLInputElement;
        const patInput = document.getElementById('github-pat') as HTMLInputElement;
        const statusElement = document.getElementById('github-auth-status');
        
        if (repoInput) repoInput.value = '';
        if (branchInput) branchInput.value = 'main';
        if (pathInput) pathInput.value = '';
        if (patInput) patInput.value = '';
        
        if (statusElement) {
            setStatus(statusElement, '请输入GitHub个人访问令牌和仓库详情。', 'info');
        }
        
        // 禁用删除按钮
        const deleteBtn = document.getElementById('github-delete-btn') as HTMLButtonElement;
        if (deleteBtn) {
            deleteBtn.disabled = true;
        }
    }

    // 填充其他提供者表单 (WebDAV, S3, SFTP) - 保持原有代码
    // ... existing code for other providers ...

    // 应用干扰预防
    preventBrowserInterference();
}

// 添加GitHub配置处理事件
async function handleGithubConfigChange() {
    const selectElement = document.getElementById('github-config-select') as HTMLSelectElement;
    const selectedId = selectElement.value;
    
    if (selectedId) {
        // 设置为活动配置
        await setActiveGithubProvider(selectedId);
        // 更新表单显示
        populateProviderForms(selectedId);
    } else {
        // 清空表单
        const repoInput = document.getElementById('github-repo') as HTMLInputElement;
        const branchInput = document.getElementById('github-branch') as HTMLInputElement;
        const pathInput = document.getElementById('github-path') as HTMLInputElement;
        const patInput = document.getElementById('github-pat') as HTMLInputElement;
        
        if (repoInput) repoInput.value = '';
        if (branchInput) branchInput.value = 'main';
        if (pathInput) pathInput.value = '';
        if (patInput) patInput.value = '';
        
        // 禁用删除按钮
        const deleteBtn = document.getElementById('github-delete-btn') as HTMLButtonElement;
        if (deleteBtn) {
            deleteBtn.disabled = true;
        }
    }
}

// 添加新的GitHub配置
function addNewGithubConfig() {
    // 清空选择和表单
    const selectElement = document.getElementById('github-config-select') as HTMLSelectElement;
    if (selectElement) {
        selectElement.value = '';
    }
    
    const repoInput = document.getElementById('github-repo') as HTMLInputElement;
    const branchInput = document.getElementById('github-branch') as HTMLInputElement;
    const pathInput = document.getElementById('github-path') as HTMLInputElement;
    const patInput = document.getElementById('github-pat') as HTMLInputElement;
    const statusElement = document.getElementById('github-auth-status');
    
    if (repoInput) repoInput.value = '';
    if (branchInput) branchInput.value = 'main';
    if (pathInput) pathInput.value = '';
    if (patInput) patInput.value = '';
    
    if (statusElement) {
        setStatus(statusElement, '请输入新GitHub配置的详情。', 'info');
    }
    
    // 禁用删除按钮
    const deleteBtn = document.getElementById('github-delete-btn') as HTMLButtonElement;
    if (deleteBtn) {
        deleteBtn.disabled = true;
    }
}

// 删除选中的GitHub配置
async function deleteSelectedGithubConfig() {
    const selectElement = document.getElementById('github-config-select') as HTMLSelectElement;
    const selectedId = selectElement.value;
    
    if (!selectedId) {
        return;
    }
    
    if (!confirm('确定要删除此GitHub配置吗？')) {
        return;
    }
    
    try {
        await callApi(`/providers/${selectedId}`, 'DELETE');
        loadProviderConfigurations();
    } catch (error: any) {
        console.error("Error deleting GitHub configuration:", error);
        setStatus(document.getElementById('github-auth-status') as HTMLElement, `Error: ${error.message}`, 'danger');
    }
}

// ... rest of the existing code ...