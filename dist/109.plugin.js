"use strict";exports.id=109,exports.ids=[109],exports.modules={7490:(e,r,o)=>{o.r(r),o.d(r,{fromProcess:()=>d});var t=o(3054),s=o(8112),i=o(5317),c=o(9023),n=o(244);const a=async(e,r,o)=>{const t=r[e];if(!r[e])throw new s.C1(`Profile ${e} could not be found in shared credentials file.`,{logger:o});{const a=t.credential_process;if(void 0===a)throw new s.C1(`Profile ${e} did not contain credential_process.`,{logger:o});{const t=(0,c.promisify)(i.exec);try{const{stdout:o}=await t(a);let s;try{s=JSON.parse(o.trim())}catch{throw Error(`Profile ${e} credential_process returned invalid JSON.`)}return((e,r,o)=>{if(1!==r.Version)throw Error(`Profile ${e} credential_process did not return Version 1.`);if(void 0===r.AccessKeyId||void 0===r.SecretAccessKey)throw Error(`Profile ${e} credential_process returned invalid credentials.`);if(r.Expiration){const o=new Date;if(new Date(r.Expiration)<o)throw Error(`Profile ${e} credential_process returned expired credentials.`)}let t=r.AccountId;!t&&o?.[e]?.aws_account_id&&(t=o[e].aws_account_id);const s={accessKeyId:r.AccessKeyId,secretAccessKey:r.SecretAccessKey,...r.SessionToken&&{sessionToken:r.SessionToken},...r.Expiration&&{expiration:new Date(r.Expiration)},...r.CredentialScope&&{credentialScope:r.CredentialScope},...t&&{accountId:t}};return(0,n.g)(s,"CREDENTIALS_PROCESS","w"),s})(e,s,r)}catch(e){throw new s.C1(e.message,{logger:o})}}}},d=(e={})=>async({callerClientConfig:r}={})=>{e.logger?.debug("@aws-sdk/credential-provider-process - fromProcess");const o=await(0,t.YU)(e);return a((0,t.Bz)({profile:e.profile??r?.profile}),o,e.logger)}}};
//# sourceMappingURL=109.plugin.js.map