(()=>{"use strict";({662:function(e,t){var n=this&&this.__awaiter||function(e,t,n,i){return new(n||(n=Promise))((function(o,s){function c(e){try{d(i.next(e))}catch(e){s(e)}}function r(e){try{d(i.throw(e))}catch(e){s(e)}}function d(e){var t;e.done?o(e.value):(t=e.value,t instanceof n?t:new n((function(e){e(t)}))).then(c,r)}d((i=i.apply(e,t||[])).next())}))};Object.defineProperty(t,"__esModule",{value:!0}),console.log("Cloud Sync main.ts loaded.");let i,o=[],s=new Set;function c(e){return n(this,arguments,void 0,(function*(e,t="GET",n=null){const i=new Headers({"Content-Type":"application/json",Accept:"*/*","X-Requested-With":"XMLHttpRequest"}),o=window.csrfToken;if(o)i.set("X-CSRF-Token",o);else if(["POST","PUT","DELETE"].includes(t.toUpperCase()))throw console.error(`CSRF token (window.csrfToken) is missing for ${t} request to ${e}. Cannot perform action.`),new Error("CSRF token is missing. Cannot perform action.");const s={method:t,headers:i,credentials:"include",mode:"same-origin",cache:"no-cache"};!n||"POST"!==t&&"PUT"!==t||(s.body=JSON.stringify(n));try{const n=`/api/plugins/cloud-sync${e.startsWith("/")?e:`/${e}`}`.replace(/\/+/g,"/"),i=yield fetch(n,s);if(!i.ok){const n=yield i.json().catch((()=>({message:`HTTP Error: ${i.status}`})));throw console.error(`API Error (${i.status}) on ${t} ${e}:`,n),new Error(n.message||`Request failed with status ${i.status}`)}return 204===i.status?null:yield i.json()}catch(n){throw console.error(`Network or API call error on ${t} ${e}:`,n),n}}))}function r(){var e,t,i,o,r,d,v,f,h,I,w,k,j,F,N,U,W,K;console.log("Initializing Cloud Sync UI..."),console.log("Setting up event listeners..."),null===(e=document.getElementById("webdav-connect-btn"))||void 0===e||e.addEventListener("click",l),null===(t=document.getElementById("github-connect-btn"))||void 0===t||t.addEventListener("click",a),null===(i=document.getElementById("s3-connect-btn"))||void 0===i||i.addEventListener("click",u),null===(o=document.getElementById("sftp-connect-btn"))||void 0===o||o.addEventListener("click",g),null===(r=document.getElementById("github-config-select"))||void 0===r||r.addEventListener("change",p),null===(d=document.getElementById("github-add-btn"))||void 0===d||d.addEventListener("click",b),null===(v=document.getElementById("github-delete-btn"))||void 0===v||v.addEventListener("click",E),null===(f=document.getElementById("github-init-git-btn"))||void 0===f||f.addEventListener("click",H),null===(h=document.getElementById("github-create-gitignore-btn"))||void 0===h||h.addEventListener("click",O),null===(I=document.getElementById("github-commit-btn"))||void 0===I||I.addEventListener("click",M),null===(w=document.getElementById("github-push-btn"))||void 0===w||w.addEventListener("click",q),null===(k=document.getElementById("github-pull-btn"))||void 0===k||k.addEventListener("click",D),null===(j=document.getElementById("github-status-btn"))||void 0===j||j.addEventListener("click",G),document.querySelectorAll('input[name="sftpAuth"]').forEach((e=>{e.addEventListener("change",m)})),null===(F=document.getElementById("expand-all-btn"))||void 0===F||F.addEventListener("click",L),null===(N=document.getElementById("collapse-all-btn"))||void 0===N||N.addEventListener("click",x),null===(U=document.getElementById("select-all-btn"))||void 0===U||U.addEventListener("click",C),null===(W=document.getElementById("deselect-all-btn"))||void 0===W||W.addEventListener("click",P),null===(K=document.getElementById("start-sync-btn"))||void 0===K||K.addEventListener("click",A),m(),y(),B(),$(),function(){n(this,void 0,void 0,(function*(){const e=document.getElementById("directory-tree");if(e){e.innerHTML='<div class="d-flex justify-content-center p-3"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><span class="ms-2">Loading directory structure...</span></div>';try{S(yield c("/directory-tree"),e),e.querySelectorAll(".tree-item-checkbox").forEach((e=>{const t=e,n=t.dataset.path;n&&s.has(n)?t.checked=!0:t.checked=!1,t.indeterminate=!1,t.classList.remove("indeterminate")})),T(e)}catch(t){e.innerHTML=`<div class="text-danger text-center p-3">Error loading directory tree: ${t.message}</div>`}}}))}()}function d(){console.log("Adding interference prevention for PAT field..."),setTimeout((()=>{const e=o.find((e=>"github"===e.type));if(e&&e.config&&e.config.token){const t=document.getElementById("github-pat");t&&(console.log("Explicitly setting PAT field value to prevent browser interference"),t.value=e.config.token)}}),500)}function l(){return n(this,void 0,void 0,(function*(){console.log("Attempting to save WebDAV config...");const e=document.getElementById("webdav-url"),t=document.getElementById("webdav-username"),n=document.getElementById("webdav-password"),i=document.getElementById("webdav-path"),o=document.getElementById("webdav-auth-status"),s=document.getElementById("webdav-connect-btn");if(!(e&&t&&n&&i&&o&&s))return void console.error("WebDAV form elements not found!");const r=e.value.trim(),d=t.value.trim(),l=n.value.trim();let a=i.value.trim();if(!r||!d)return void v(o,"Please provide URL and username.","danger");a&&!a.endsWith("/")&&(a+="/",i.value=a);const u={type:"webdav",name:`WebDAV: ${r.split("//")[1].split("/")[0]}`,enabled:!0,config:{url:r,username:d,password:l,path:a}};f(s,!0),v(o,"Saving and testing connection...","info");try{const e=(yield c("/providers")).find((e=>"webdav"===e.type));let t;if(e){console.log(`Updating existing WebDAV provider (ID: ${e.id})`);const n={name:u.name,enabled:u.enabled,config:u.config};t=yield c(`/providers/${e.id}`,"PUT",n)}else console.log("Adding new WebDAV provider"),t=yield c("/providers","POST",u);console.log(`Testing connection for provider ID: ${t.id}`);const n=yield c(`/providers/${t.id}/test`,"POST");n.success?(v(o,"WebDAV connection successful! Configuration saved.","success"),y()):v(o,`Configuration saved, but connection test failed: ${n.message}`,"warning")}catch(e){console.error("Error saving/testing WebDAV config:",e),v(o,`Error: ${e.message}`,"danger")}finally{f(s,!1)}}))}function a(){return n(this,void 0,void 0,(function*(){console.log("Attempting to save GitHub config...");const e=document.getElementById("github-pat"),t=document.getElementById("github-repo"),n=document.getElementById("github-branch"),i=document.getElementById("github-path"),s=document.getElementById("github-config-select"),r=document.getElementById("github-auth-status"),l=document.getElementById("github-connect-btn");if(!(e&&t&&n&&i&&r&&l))return void console.error("GitHub form elements not found!");const a=e.value.trim(),u=t.value.trim(),g=n.value.trim()||"main";let m=i.value.trim();if(!a||!u)return void v(r,"请同时提供个人访问令牌和仓库名称。","danger");m&&!m.endsWith("/")&&(m+="/",i.value=m);const h={type:"github",name:`GitHub: ${u}`,enabled:!0,config:{token:a,repo:u,branch:g,path:m}};f(l,!0),v(r,"保存并测试连接...","info");try{const e=s.value;let t;const n=o.filter((e=>"github"===e.type&&e.config.repo===u&&e.config.branch===g&&e.config.path===m));if(n.length>0&&(!e||n[0].id!==e)){const e=n[0];console.log(`检测到相同GitHub仓库配置 (ID: ${e.id})，更新现有配置而不是创建新配置`);const i={name:h.name,enabled:h.enabled,config:h.config};t=yield c(`/providers/${e.id}`,"PUT",i),s&&(s.value=e.id)}else if(e&&o.some((t=>t.id===e))){console.log(`更新现有GitHub配置 (ID: ${e})`);const n={name:h.name,enabled:h.enabled,config:h.config};t=yield c(`/providers/${e}`,"PUT",n)}else console.log("添加新的GitHub配置"),t=yield c("/providers","POST",h);console.log(`Testing connection for provider ID: ${t.id}`);const i=yield c(`/providers/${t.id}/test`,"POST");i.success?(v(r,"GitHub连接成功！配置已保存。","success"),yield I(t.id),yield y(),setTimeout(d,1500)):v(r,`配置已保存，但连接测试失败: ${i.message}`,"warning")}catch(e){console.error("Error saving/testing GitHub config:",e),v(r,`错误: ${e.message}`,"danger")}finally{f(l,!1)}}))}function u(){return n(this,void 0,void 0,(function*(){console.log("Attempting to save S3 config...");const e=document.getElementById("s3-access-key-id"),t=document.getElementById("s3-secret-access-key"),n=document.getElementById("s3-bucket"),i=document.getElementById("s3-region"),o=document.getElementById("s3-endpoint"),s=document.getElementById("s3-path-prefix"),r=document.getElementById("s3-auth-status"),d=document.getElementById("s3-connect-btn");if(!(e&&t&&n&&i&&o&&s&&r&&d))return void console.error("S3 form elements not found!");const l=e.value.trim(),a=t.value.trim(),u=n.value.trim(),g=i.value.trim()||"us-east-1",m=o.value.trim();let h=s.value.trim();if(!l||!a||!u)return void v(r,"Please provide Access Key, Secret Access Key, and Bucket Name.","danger");h&&!h.endsWith("/")&&(h+="/",s.value=h);const p={type:"s3",name:`S3: ${u}`,enabled:!0,config:{accessKeyId:l,secretAccessKey:a,bucket:u,region:g,endpoint:m||void 0,prefix:h||void 0}};f(d,!0),v(r,"Saving and testing connection...","info");try{const e=(yield c("/providers")).find((e=>"s3"===e.type));let t;if(e){console.log(`Updating existing S3 provider (ID: ${e.id})`);const n={name:p.name,enabled:p.enabled,config:p.config};t=yield c(`/providers/${e.id}`,"PUT",n)}else console.log("Adding new S3 provider"),t=yield c("/providers","POST",p);console.log(`Testing connection for provider ID: ${t.id}`);const n=yield c(`/providers/${t.id}/test`,"POST");n.success?(v(r,"S3 connection successful! Configuration saved.","success"),y()):v(r,`Configuration saved, but connection test failed: ${n.message}`,"warning")}catch(e){console.error("Error saving/testing S3 config:",e),v(r,`Error: ${e.message}`,"danger")}finally{f(d,!1)}}))}function g(){return n(this,void 0,void 0,(function*(){console.log("Attempting to save SFTP config...");const e=document.getElementById("sftp-host"),t=document.getElementById("sftp-port"),n=document.getElementById("sftp-username"),i=document.getElementById("sftp-password"),o=document.getElementById("sftp-privateKey"),s=document.getElementById("sftp-passphrase"),r=document.getElementById("sftp-path"),d=document.getElementById("sftpAuthKey"),l=document.getElementById("sftp-auth-status"),a=document.getElementById("sftp-connect-btn");if(!(e&&t&&n&&i&&o&&s&&r&&d&&l&&a))return void console.error("SFTP form elements not found!");const u=e.value.trim(),g=t.value.trim(),m=g?parseInt(g,10):22,h=n.value.trim(),p=i.value.trim(),b=o.value.trim(),E=s.value.trim(),I=d.checked;let B=r.value.trim();if(!u||!h)return void v(l,"Please provide Host and Username.","danger");if(I&&!b)return void v(l,"Private Key is required when using key authentication.","danger");if(!I&&!p)return void v(l,"Password is required when using password authentication.","danger");B&&!B.endsWith("/")&&(B+="/",r.value=B);const $={type:"sftp",name:`SFTP: ${h}@${u}:${m}`,enabled:!0,config:Object.assign(Object.assign({host:u,port:m,username:h},I?Object.assign({privateKey:b},E?{passphrase:E}:{}):{password:p}),{path:B})};f(a,!0),v(l,"Saving and testing connection...","info");try{const e=(yield c("/providers")).find((e=>"sftp"===e.type));let t;if(e){console.log(`Updating existing SFTP provider (ID: ${e.id})`);const n={name:$.name,enabled:$.enabled,config:$.config};t=yield c(`/providers/${e.id}`,"PUT",n)}else console.log("Adding new SFTP provider"),t=yield c("/providers","POST",$);console.log(`Testing connection for provider ID: ${t.id}`);const n=yield c(`/providers/${t.id}/test`,"POST");n.success?(v(l,"SFTP connection successful! Configuration saved.","success"),y()):v(l,`Configuration saved, but connection test failed: ${n.message}`,"warning")}catch(e){console.error("Error saving/testing SFTP config:",e),v(l,`Error: ${e.message}`,"danger")}finally{f(a,!1)}}))}function m(){var e;const t=document.getElementById("sftpAuthKey"),n=document.getElementById("sftpPassFields"),i=document.getElementById("sftpKeyFields"),o=null!==(e=null==t?void 0:t.checked)&&void 0!==e&&e;n&&(n.style.display=o?"none":"block"),i&&(i.style.display=o?"block":"none")}function v(e,t,n){e&&(e.className=`alert alert-${n}`,e.textContent=t)}function f(e,t){e&&(t?(e.disabled=!0,e.innerHTML='<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...'):(e.disabled=!1,"github-connect-btn"===e.id?e.textContent="Save GitHub Config":"webdav-connect-btn"===e.id?e.textContent="Save WebDAV Config":"s3-connect-btn"===e.id?e.textContent="Save S3 Config":"sftp-connect-btn"===e.id?e.textContent="Save SFTP Config":e.textContent="Save"))}function y(){return n(this,void 0,void 0,(function*(){console.log("Loading provider configurations...");try{const e=yield c("/providers");o=e.providers,i=e.activeGithubProviderId,h();const t=document.getElementById("start-sync-btn");return t&&(t.disabled=0===o.filter((e=>e.enabled)).length),B(),setTimeout(d,1e3),o}catch(e){console.error("Error loading provider configurations:",e);const t=document.getElementById("connection-status");t&&(t.innerHTML=`<div class="alert alert-danger">Error loading provider configurations: ${e.message}</div>`);const n=document.getElementById("start-sync-btn");return n&&(n.disabled=!0),[]}}))}function h(e){const t=o.filter((e=>"github"===e.type)),n=document.getElementById("github-config-select");if(n){const o=n.value;n.innerHTML='<option value="">-- Select a configuration --</option>',t.forEach((t=>{const o=document.createElement("option");o.value=t.id,o.textContent=t.name,o.selected=t.id===(e||i),n.appendChild(o)})),!n.value&&o&&(n.value=o)}let s;if(e?s=o.find((t=>t.id===e)):i?s=o.find((e=>e.id===i)):t.length>0&&(s=t[0]),s&&s.config){const e=document.getElementById("github-repo"),t=document.getElementById("github-branch"),n=document.getElementById("github-path"),i=document.getElementById("github-pat"),o=document.getElementById("github-auth-status");if(e&&(e.value=s.config.repo||""),t&&(t.value=s.config.branch||"main"),n&&(n.value=s.config.path||""),i&&(i.value=s.config.token||""),o){v(o,s.config.token?`GitHub配置已加载 - 仓库: ${s.config.repo}. PAT已加载.`:`GitHub配置已加载 - 仓库: ${s.config.repo}. 请输入PAT进行测试/保存.`,"info")}const c=document.getElementById("github-delete-btn");c&&(c.disabled=!s.id)}else{const e=document.getElementById("github-repo"),t=document.getElementById("github-branch"),n=document.getElementById("github-path"),i=document.getElementById("github-pat"),o=document.getElementById("github-auth-status");e&&(e.value=""),t&&(t.value="main"),n&&(n.value=""),i&&(i.value=""),o&&v(o,"请输入GitHub个人访问令牌和仓库详情。","info");const s=document.getElementById("github-delete-btn");s&&(s.disabled=!0)}d()}function p(){return n(this,void 0,void 0,(function*(){const e=document.getElementById("github-config-select").value;if(e)yield I(e),h(e);else{const e=document.getElementById("github-repo"),t=document.getElementById("github-branch"),n=document.getElementById("github-path"),i=document.getElementById("github-pat");e&&(e.value=""),t&&(t.value="main"),n&&(n.value=""),i&&(i.value="");const o=document.getElementById("github-delete-btn");o&&(o.disabled=!0)}}))}function b(){const e=document.getElementById("github-config-select");e&&(e.value="");const t=document.getElementById("github-repo"),n=document.getElementById("github-branch"),i=document.getElementById("github-path"),o=document.getElementById("github-pat"),s=document.getElementById("github-auth-status");t&&(t.value=""),n&&(n.value="main"),i&&(i.value=""),o&&(o.value=""),s&&v(s,"请输入新GitHub配置的详情。","info");const c=document.getElementById("github-delete-btn");c&&(c.disabled=!0)}function E(){return n(this,void 0,void 0,(function*(){const e=document.getElementById("github-config-select").value;if(e&&confirm("确定要删除此GitHub配置吗？"))try{yield c(`/providers/${e}`,"DELETE"),yield y(),b()}catch(e){console.error("Error deleting GitHub config:",e),alert(`删除配置失败: ${e.message}`)}}))}function I(e){return n(this,void 0,void 0,(function*(){try{yield c("/providers/github/active","POST",{providerId:e}),i=e}catch(e){console.error("Error setting active GitHub provider:",e)}}))}function B(){return n(this,void 0,void 0,(function*(){const e=document.getElementById("connection-status");if(e)try{if(0===o.length)return void(e.innerHTML='<div class="alert alert-warning">Not connected to any cloud storage service</div>');const t=o.filter((e=>e.enabled));if(0===t.length)return void(e.innerHTML='<div class="alert alert-warning">All providers are disabled</div>');let n='<div class="alert alert-success"><strong>Active connections:</strong><ul class="mb-0 mt-2">';t.forEach((e=>{let t="";switch(e.type){case"github":t=`Repository: ${e.config.repo}, Branch: ${e.config.branch||"main"}`;break;case"webdav":t=`Server: ${e.config.url.split("//")[1].split("/")[0]}`;break;case"s3":t=`Bucket: ${e.config.bucket}, Region: ${e.config.region}`;break;case"sftp":t=`${e.config.username}@${e.config.host}:${e.config.port||22}`}n+=`<li><i class="bi bi-cloud-check"></i> <strong>${e.type.toUpperCase()}</strong>: ${t}</li>`})),n+="</ul></div>",e.innerHTML=n;const i=document.getElementById("start-sync-btn");i&&(i.disabled=0===t.length)}catch(t){console.error("Error updating connection status:",t),e.innerHTML=`<div class="alert alert-danger">Error loading connection status: ${t.message}</div>`}}))}function $(){return n(this,void 0,void 0,(function*(){const e=document.getElementById("sync-history");if(e)try{const t=yield c("/sync/status");if(!t||0===Object.keys(t).length)return void(e.innerHTML='<div class="text-center text-muted">No sync history available</div>');let n="";Object.entries(t).map((([e,t])=>Object.assign(Object.assign({providerId:e},t),{providerInfo:o.find((t=>t.id===e))}))).sort(((e,t)=>(t.lastSyncTime||0)-(e.lastSyncTime||0))).forEach((e=>{const t=e.providerInfo;if(!t)return;const i=e.lastSyncTime?new Date(e.lastSyncTime).toLocaleString():"Never",o="success"===e.status?"success":"error"===e.status?"failed":"",s="success"===e.status?'<i class="bi bi-check-circle text-success"></i>':"error"===e.status?'<i class="bi bi-x-circle text-danger"></i>':"in_progress"===e.status?'<i class="bi bi-arrow-repeat text-primary"></i>':'<i class="bi bi-dash-circle text-muted"></i>';n+=`\n            <div class="sync-history-item ${o} mb-3">\n                <div><strong>${t.name}</strong> (${t.type})</div>\n                <div class="d-flex justify-content-between align-items-center">\n                    <div>${s} ${"success"===e.status?"Success":"error"===e.status?"Failed":"in_progress"===e.status?"In progress":"Not synced"}</div>\n                    <div class="text-muted small">${i}</div>\n                </div>\n                ${e.lastSyncError?`<div class="text-danger small mt-1">${e.lastSyncError}</div>`:""}\n            </div>`})),e.innerHTML=n||'<div class="text-center text-muted">No sync history available</div>'}catch(t){console.error("Error loading sync history:",t),e.innerHTML=`<div class="text-danger">Error loading sync history: ${t.message}</div>`}}))}function S(e,t,n=0){0===n&&(t.innerHTML=""),e.forEach((e=>{const i=document.createElement("div");i.classList.add("tree-item"),i.dataset.path=e.path,i.dataset.type=e.type;const o=document.createElement("div");o.classList.add("tree-item-content");const s=document.createElement("span");s.classList.add("tree-toggle"),"directory"===e.type?(s.innerHTML='<i class="bi bi-chevron-right"></i>',s.onclick=e=>{e.stopPropagation(),function(e){const t=e.querySelector(".tree-children"),n=e.querySelector(".tree-toggle i");if(t&&n){const e=t.classList.toggle("expanded");n.classList.toggle("bi-chevron-right",!e),n.classList.toggle("bi-chevron-down",e)}}(i)}):s.innerHTML="&nbsp;";const c=document.createElement("input");c.type="checkbox",c.classList.add("tree-item-checkbox","form-check-input"),c.dataset.path=e.path,c.onchange=()=>w(c);const r=document.createElement("i");r.classList.add("tree-icon","bi","directory"===e.type?"bi-folder":"bi-file-earmark"),"file"===e.type&&r.classList.add("file");const d=document.createElement("span");if(d.classList.add("tree-item-label"),d.textContent=e.name,d.onclick=()=>{c.checked=!c.checked,w(c)},o.appendChild(s),o.appendChild(c),o.appendChild(r),o.appendChild(d),"file"===e.type&&void 0!==e.size){const t=document.createElement("span");t.classList.add("tree-item-size"),t.textContent=function(e,t=2){if(0===e)return"0 Bytes";const n=1024,i=t<0?0:t,o=["Bytes","KB","MB","GB","TB"],s=Math.floor(Math.log(e)/Math.log(n));return parseFloat((e/Math.pow(n,s)).toFixed(i))+" "+o[s]}(e.size),o.appendChild(t)}if(i.appendChild(o),"directory"===e.type&&e.children&&e.children.length>0){const t=document.createElement("div");t.classList.add("tree-children"),S(e.children,t,n+1),i.appendChild(t)}t.appendChild(i)}))}function w(e){const t=e.dataset.path;if(!t)return;const n=e.checked;n?s.add(t):s.delete(t);const i=e.closest(".tree-item");if("directory"===(null==i?void 0:i.dataset.type)){i.querySelectorAll(".tree-item-checkbox").forEach((t=>{if(t!==e){const e=t.dataset.path;t.checked=n,e&&(n?s.add(e):s.delete(e)),t.indeterminate=!1,t.classList.remove("indeterminate")}}))}k(i)}function k(e){var t,n;let i=null===(t=null==e?void 0:e.parentElement)||void 0===t?void 0:t.closest(".tree-item");for(;i;){const e=i.querySelector(":scope > .tree-item-content > .tree-item-checkbox");if(!e)break;const t=i.querySelectorAll(":scope > .tree-children > .tree-item > .tree-item-content > .tree-item-checkbox");let o=!0,c=!0;0===t.length?(o=e.checked,c=!e.checked):t.forEach((e=>{(e.checked||e.indeterminate)&&(c=!1),e.checked&&!e.indeterminate||(o=!1)})),e.checked=o,e.indeterminate=!o&&!c,e.classList.toggle("indeterminate",e.indeterminate);const r=e.dataset.path;r&&(e.checked||e.indeterminate?s.add(r):s.delete(r)),i=null===(n=i.parentElement)||void 0===n?void 0:n.closest(".tree-item")}}function T(e){const t=e.querySelectorAll(".tree-item-checkbox");for(let e=t.length-1;e>=0;e--){k(t[e].closest(".tree-item"))}}function L(){document.querySelectorAll(".tree-children").forEach((e=>e.classList.add("expanded"))),document.querySelectorAll(".tree-toggle i.bi-chevron-right").forEach((e=>e.classList.replace("bi-chevron-right","bi-chevron-down")))}function x(){document.querySelectorAll(".tree-children.expanded").forEach((e=>e.classList.remove("expanded"))),document.querySelectorAll(".tree-toggle i.bi-chevron-down").forEach((e=>e.classList.replace("bi-chevron-down","bi-chevron-right")))}function C(){document.querySelectorAll(".tree-item-checkbox").forEach((e=>{const t=e,n=t.dataset.path;t.checked=!0,t.indeterminate=!1,t.classList.remove("indeterminate"),n&&s.add(n)})),T(document.getElementById("directory-tree"))}function P(){document.querySelectorAll(".tree-item-checkbox").forEach((e=>{const t=e,n=t.dataset.path;t.checked=!1,t.indeterminate=!1,t.classList.remove("indeterminate"),n&&s.delete(n)}))}function A(){return n(this,void 0,void 0,(function*(){const e=document.getElementById("sync-mode"),t=document.getElementById("compare-hash");if(!e||!t)return console.error("Sync setting elements not found");const i=e.value,r=t.checked,d=Array.from(s);if(0===d.length)return alert("Please select directories or files to sync.");console.log(`Starting sync: ${i}, Hash: ${r}, Paths:`,d);const l=document.getElementById("sync-progress"),a=document.getElementById("progress-bar"),u=document.getElementById("progress-text"),g=document.getElementById("progress-details");if(!(l&&a&&u&&g))return console.error("Progress elements not found");l.style.display="block",a.style.width="0%",a.className="progress-bar",a.setAttribute("aria-valuenow","0"),u.textContent="Initiating sync...",g.textContent="";try{const e=o.filter((e=>e.enabled));if(0===e.length)throw new Error("No enabled providers found for sync operation.");let t="",s={selectedPaths:d,useHash:r,mode:i};if("download-only"===i)if(1===e.length)t=`/sync/download/${e[0].id}`;else{const n=prompt(`Select a provider to download from (enter the number):\n${e.map(((e,t)=>`${t+1}. ${e.name} (${e.type})`)).join("\n")}`);if(!n||isNaN(parseInt(n)))throw new Error("No valid provider selected for download.");const i=parseInt(n)-1;if(i<0||i>=e.length)throw new Error("Invalid provider selection.");t=`/sync/download/${e[i].id}`}else t="/sync/upload";a.style.width="10%",a.setAttribute("aria-valuenow","10"),u.textContent="Sending sync request...",yield c(t,"POST",s),a.style.width="30%",a.setAttribute("aria-valuenow","30"),u.textContent="Sync operation started on server...",g.textContent="The sync is now running on the server. Check sync history for updates.";let l=0;const m=setInterval((()=>n(this,void 0,void 0,(function*(){try{const e=yield c("/sync/status");if(!Object.values(e).some((e=>"in_progress"===e.status))||l>=10){clearInterval(m),a.style.width="100%",a.setAttribute("aria-valuenow","100");Object.values(e).some((e=>"error"===e.status))?(u.textContent="Sync completed with errors",a.classList.add("bg-warning")):(u.textContent="Sync completed successfully",a.classList.add("bg-success")),$()}else{const e=Math.min(30+7*l,90);a.style.width=`${e}%`,a.setAttribute("aria-valuenow",e.toString()),l++}}catch(e){console.error("Error checking sync status:",e),clearInterval(m),u.textContent="Error checking sync status",a.classList.add("bg-danger")}}))),2e3)}catch(e){console.error("Sync operation failed:",e),u.textContent=`Sync failed: ${e.message}`,a.classList.add("bg-danger"),a.style.width="100%",a.setAttribute("aria-valuenow","100")}}))}function H(){return n(this,void 0,void 0,(function*(){const e=document.getElementById("git-init-output");if(e)if(i){F(e,"在数据目录中初始化Git仓库...","info");try{const t=yield c("/git/init","POST");F(e,t.message,t.success?"success":"danger")}catch(t){F(e,`错误: ${t.message}`,"danger")}}else F(e,"请先选择或创建GitHub配置。","danger")}))}function O(){return n(this,void 0,void 0,(function*(){const e=document.getElementById("git-gitignore-output");if(e){F(e,"创建.gitignore文件...","info");try{const t=yield c("/git/gitignore","POST");F(e,t.message,t.success?"success":"danger")}catch(t){F(e,`错误: ${t.message}`,"danger")}}}))}function M(){return n(this,void 0,void 0,(function*(){yield j("commit","提交更改...")}))}function q(){return n(this,void 0,void 0,(function*(){yield j("push","推送到远程...")}))}function D(){return n(this,void 0,void 0,(function*(){yield j("pull","从远程拉取...")}))}function G(){return n(this,void 0,void 0,(function*(){yield j("status","检查状态...")}))}function j(e,t){return n(this,void 0,void 0,(function*(){const n=document.getElementById("git-command-output");if(n){n.style.display="block",F(n,t,"info");try{const t=yield c(`/git/${e}`,"POST");F(n,t.output||t.message,t.success?"success":"danger")}catch(e){F(n,`错误: ${e.message}`,"danger")}}}))}function F(e,t,n){e.style.display="block",e.className=`small mt-2 text-${"info"===n?"muted":n}`,t.includes("\n")?e.innerHTML=`<pre class="mb-0 p-2 bg-light" style="white-space: pre-wrap;">${function(e){const t=document.createElement("div");return t.textContent=e,t.innerHTML}(t)}</pre>`:e.textContent=t}"loading"===document.readyState?document.addEventListener("DOMContentLoaded",r):r()}})[662](0,{})})();
//# sourceMappingURL=main.js.map