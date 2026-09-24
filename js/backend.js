/* EcoWorld browser client for the Ecoworld Supabase project. */
(function(){
  const config = window.ECOWORLD_SUPABASE;
  const baseUrl = config.url.replace(/\/$/, "");
  const sessionKey = "ecoworld_supabase_session";
  const settingsKeys = new Set([
    "eco_fresh_management_table_settings_v2",
    "eco_fresh_management_portal_hierarchy_v1",
    "eco_fresh_management_dropdown_options_v1",
    "eco_fresh_management_pile_reference_v1",
    "eco_fresh_management_pile_optimisation_v1"
  ]);
  const cache = { settings:{}, submissions:[], accounts:null, auth:null };
  let session = null;
  let settingQueue = Promise.resolve();
  let saveErrorShown = false;

  function errorMessage(data, fallback){
    return data?.error_description || data?.msg || data?.message || data?.error || fallback;
  }

  async function parseResponse(response, fallback){
    const raw = await response.text();
    let data = null;
    try{ data = raw ? JSON.parse(raw) : null; }
    catch{ data = { message:raw }; }
    if(!response.ok) throw new Error(errorMessage(data, fallback));
    return data;
  }

  function persistSession(value){
    session = value;
    if(value) localStorage.setItem(sessionKey, JSON.stringify(value));
    else localStorage.removeItem(sessionKey);
  }

  async function refresh(){
    if(!session?.refresh_token) throw new Error("Please sign in again.");
    const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method:"POST",
      headers:{ apikey:config.publishableKey, "Content-Type":"application/json" },
      body:JSON.stringify({refresh_token:session.refresh_token})
    });
    const data = await parseResponse(response, "Session expired. Please sign in again.");
    persistSession({
      access_token:data.access_token,
      refresh_token:data.refresh_token || session.refresh_token,
      expires_at:Date.now() + Number(data.expires_in || 3600) * 1000
    });
    return session;
  }

  async function accessToken(){
    if(!session) throw new Error("Please sign in.");
    if(Date.now() > (session.expires_at || 0) - 120000) await refresh();
    return session.access_token;
  }

  async function request(path, options={}, retry=true){
    const token = await accessToken();
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers:{
        apikey:config.publishableKey,
        Authorization:`Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    if(response.status === 401 && retry){
      await refresh();
      return request(path, options, false);
    }
    return response;
  }

  async function invoke(action, values={}){
    const response = await request("/functions/v1/ecoworld-portal", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action,...values})
    });
    return parseResponse(response, "The portal could not contact its backend.");
  }

  function showSaveError(message){
    if(saveErrorShown) return;
    saveErrorShown = true;
    const warning = document.createElement("div");
    warning.id = "ecoworldSyncError";
    warning.setAttribute("role","alert");
    warning.style.cssText = "position:fixed;z-index:99999;left:16px;right:16px;bottom:16px;padding:14px 18px;background:#8b1e25;color:white;border-radius:8px;box-shadow:0 6px 18px #0004;font:14px Arial,sans-serif";
    warning.textContent = `A change was not saved to Supabase: ${message} Refresh before making more changes.`;
    document.body.appendChild(warning);
  }

  async function signIn(email,password){
    const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method:"POST",
      headers:{apikey:config.publishableKey,"Content-Type":"application/json"},
      body:JSON.stringify({email,password})
    });
    const data = await parseResponse(response, "Invalid email or password.");
    persistSession({
      access_token:data.access_token,
      refresh_token:data.refresh_token,
      expires_at:Date.now() + Number(data.expires_in || 3600) * 1000
    });
    try{ return await bootstrap(); }
    catch(error){ persistSession(null); throw error; }
  }

  async function restore(){
    try{
      const saved = JSON.parse(localStorage.getItem(sessionKey) || "null");
      if(!saved?.access_token) return null;
      session = saved;
      return await bootstrap();
    }catch(error){
      persistSession(null);
      throw error;
    }
  }

  async function bootstrap(){
    const data = await invoke("bootstrap");
    cache.settings = data.settings || {};
    cache.submissions = data.submissions || [];
    cache.accounts = data.accounts || null;
    cache.auth = data.auth || null;
    return cache.auth;
  }

  async function signOut(){
    const oldToken = session?.access_token;
    persistSession(null);
    cache.auth = null;
    cache.submissions = [];
    cache.settings = {};
    cache.accounts = null;
    if(oldToken){
      try{
        await fetch(`${baseUrl}/auth/v1/logout`, {
          method:"POST",
          headers:{apikey:config.publishableKey,Authorization:`Bearer ${oldToken}`}
        });
      }catch(error){ console.warn("Remote sign out failed.",error); }
    }
  }

  function setting(key,fallback){
    return Object.prototype.hasOwnProperty.call(cache.settings,key)
      ? cache.settings[key] : fallback;
  }

  function saveSetting(key,value){
    if(!settingsKeys.has(key)) return Promise.resolve();
    cache.settings[key] = structuredClone(value);
    settingQueue = settingQueue.catch(()=>{}).then(()=>invoke("save_setting",{key,value}));
    settingQueue.catch(error=>showSaveError(error.message));
    return settingQueue;
  }

  function submissions(){
    return structuredClone(cache.submissions);
  }

  function replaceSubmission(payload){
    const index = cache.submissions.findIndex(item=>item.id===payload.id);
    if(index < 0) cache.submissions.unshift(payload);
    else cache.submissions[index] = payload;
  }

  async function saveSubmission(payload,expectedVersion){
    const data = await invoke("save_submission",{payload,expectedVersion});
    replaceSubmission(data.payload);
    return data.payload;
  }

  async function setEdit(id,allowed){
    const data = await invoke("set_edit",{id,allowed});
    replaceSubmission(data.payload);
    return data.payload;
  }

  async function deleteSubmission(id){
    await invoke("delete_submission",{id});
    cache.submissions = cache.submissions.filter(item=>item.id!==id);
  }

  function accounts(){ return cache.accounts ? structuredClone(cache.accounts) : null; }

  async function saveAccounts(settings){
    const data = await invoke("save_accounts", {
      accounts:settings.accounts,
      accountOrder:settings.accountOrder
    });
    cache.accounts = data.accounts;
    return accounts();
  }

  function filePath(path){
    return path.split("/").map(encodeURIComponent).join("/");
  }

  async function uploadFile(blob,metadata={}){
    if(!cache.auth?.userId) throw new Error("Please sign in before uploading.");
    const path = `${cache.auth.userId}/${crypto.randomUUID()}`;
    const response = await request(
      `/storage/v1/object/ecoworld-drawings/${filePath(path)}`,{
        method:"POST",
        headers:{"Content-Type":metadata.type || blob.type || "application/octet-stream","x-upsert":"false"},
        body:blob
      });
    await parseResponse(response,"Drawing upload failed.");
    return {
      blobId:path,
      name:metadata.name || "Uploaded file",
      type:metadata.type || blob.type || "application/octet-stream",
      size:metadata.size ?? blob.size ?? 0,
      lastModified:metadata.lastModified || Date.now()
    };
  }

  async function getFile(path){
    const response = await request(
      `/storage/v1/object/authenticated/ecoworld-drawings/${filePath(path)}`);
    if(!response.ok) throw new Error("This drawing could not be opened.");
    return {id:path,blob:await response.blob()};
  }

  async function deleteFile(path){
    const response = await request(
      `/storage/v1/object/ecoworld-drawings/${filePath(path)}`,{method:"DELETE"});
    if(!response.ok && response.status!==404) await parseResponse(response,"Drawing deletion failed.");
  }

  window.EcoBackend = {
    signIn,restore,signOut,bootstrap,setting,saveSetting,submissions,
    saveSubmission,setEdit,deleteSubmission,accounts,saveAccounts,
    uploadFile,getFile,deleteFile,showSaveError
  };
})();
