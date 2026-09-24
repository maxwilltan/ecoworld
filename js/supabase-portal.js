/* EcoWorld Supabase connection. The publishable key is safe for browser use;
   authorization is enforced by Supabase Auth and database RLS. */
const EcoBackend = (() => {
  const url = "https://yqxwiitsdxmypemwgows.supabase.co";
  const key = "sb_publishable_K8L3IhB63xeahlLRr7Wyhw_o4rkxA8j";
  const sessionKey = "ecoworld_supabase_session_v1";
  const bucket = "ecoworld-drawings";
  const configKeys = {
    eco_fresh_management_table_settings_v2: "table_settings",
    eco_fresh_management_portal_hierarchy_v1: "portal_hierarchy",
    eco_fresh_management_dropdown_options_v1: "dropdown_options",
    eco_fresh_management_pile_reference_v1: "pile_reference",
    eco_fresh_management_pile_optimisation_v1: "pile_optimisation"
  };
  let session = null;
  let profile = null;
  let cache = Object.create(null);
  let rows = new Map();
  let snapshots = new Map();
  let writeQueue = Promise.resolve();
  let refreshPromise = null;

  const failure = async response => {
    let body = {};
    try { body = await response.json(); } catch (_) { /* Preserve the HTTP error. */ }
    return new Error(body.message || body.msg || body.error_description || body.error || `Supabase request failed (${response.status}).`);
  };
  const remember = value => {
    session = value;
    if(value) localStorage.setItem(sessionKey, JSON.stringify(value));
    else localStorage.removeItem(sessionKey);
  };
  const authRequest = async (path, body) => {
    const response = await fetch(`${url}/auth/v1/${path}`, {
      method: "POST",
      headers: { apikey:key, "Content-Type":"application/json" },
      body:JSON.stringify(body)
    });
    if(!response.ok) throw await failure(response);
    return response.json();
  };
  const acceptTokens = tokens => {
    remember({
      access_token:tokens.access_token,
      refresh_token:tokens.refresh_token,
      expires_at:Math.floor(Date.now() / 1000) + Number(tokens.expires_in || 3600),
      user:tokens.user || session?.user || null
    });
  };
  const refresh = async () => {
    if(refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      if(!session?.refresh_token) throw new Error("Please log in again.");
      const tokens = await authRequest("token?grant_type=refresh_token", { refresh_token:session.refresh_token });
      acceptTokens(tokens);
    })();
    try { await refreshPromise; }
    finally { refreshPromise = null; }
  };
  const token = async () => {
    if(!session) throw new Error("Please log in again.");
    if(Date.now() / 1000 >= session.expires_at - 60) await refresh();
    return session.access_token;
  };
  const request = async (path, options = {}, retry = true) => {
    const accessToken = await token();
    const response = await fetch(`${url}${path}`, {
      ...options,
      headers: { apikey:key, Authorization:`Bearer ${accessToken}`, ...(options.headers || {}) }
    });
    if(response.status === 401 && retry){
      await refresh();
      return request(path, options, false);
    }
    if(!response.ok) throw await failure(response);
    if(response.status === 204) return null;
    const contentType = response.headers.get("content-type") || "";
    return contentType.includes("application/json") ? response.json() : response.blob();
  };
  const table = (name, query = "") => `/rest/v1/ecoworld_${name}${query ? `?${query}` : ""}`;
  const encode = value => encodeURIComponent(String(value));
  const selectAll = async (name, query = "") => {
    const result = [];
    for(let offset = 0;; offset += 1000){
      const separator = query ? "&" : "";
      const page = await request(table(name, `${query}${separator}limit=1000&offset=${offset}`));
      result.push(...page);
      if(page.length < 1000) return result;
    }
  };
  const enqueue = task => {
    const pending = writeQueue.then(task);
    writeQueue = pending.catch(() => {});
    return pending;
  };
  const submissionFromRow = row => ({
    ...row.payload,
    id:row.id,
    ownerUserId:row.owner_user_id,
    consultantAccountId:row.consultant_key,
    consultantAccountName:cache.eco_fresh_management_consultant_access_v1?.accounts?.[row.consultant_key]?.name || row.payload?.consultantAccountName || "",
    consultantAccountEmail:cache.eco_fresh_management_consultant_access_v1?.accounts?.[row.consultant_key]?.email || row.payload?.consultantAccountEmail || "",
    region:row.region,
    businessUnit:row.business_unit,
    project:row.project,
    revision:row.revision,
    year:row.year || row.payload?.year || "",
    versionNumber:row.version_number,
    editAccess:{ ...(row.payload?.editAccess || {}), allowed:row.edit_allowed },
    createdAt:row.created_at,
    updatedAt:row.updated_at
  });
  const accountCache = (profiles, access) => {
    const accounts = {};
    const accountOrder = [];
    for(const person of profiles){
      if(person.role !== "Consultant" || !person.consultant_key) continue;
      const id = person.consultant_key;
      accounts[id] = {
        id, name:person.display_name, email:person.email, password:"",
        active:person.active, builtin:false,
        projectKeys:access.filter(item => item.user_id === person.user_id).map(item => item.project_key),
        userId:person.user_id
      };
      accountOrder.push(id);
    }
    cache.eco_fresh_management_consultant_access_v1 = { version:3, accounts, accountOrder };
  };
  const refreshSubmissions = async () => {
    const current = await selectAll("submissions", "select=*");
    rows = new Map(current.map(row => [row.id, row]));
    cache.eco_fresh_v2_consultant_submissions = current.map(submissionFromRow);
    snapshots = new Map(cache.eco_fresh_v2_consultant_submissions.map(item => [item.id, JSON.stringify(item)]));
    return cache.eco_fresh_v2_consultant_submissions;
  };
  const loadPortal = async () => {
    const userId = session?.user?.id;
    if(!userId) throw new Error("Unable to verify your Supabase account.");
    const people = await selectAll("profiles", "select=*");
    profile = people.find(item => item.user_id === userId);
    if(!profile?.active || !["Management", "Consultant"].includes(profile.role)){
      throw new Error("This account does not have active EcoWorld portal access.");
    }
    const [access, settings] = await Promise.all([
      selectAll("project_access", "select=*"),
      selectAll("config", "select=key,value")
    ]);
    cache = Object.create(null);
    accountCache(people, access);
    for(const [storageKey, configKey] of Object.entries(configKeys)){
      const item = settings.find(row => row.key === configKey);
      if(item) cache[storageKey] = item.value;
    }
    await refreshSubmissions();
    return {
      userId,
      accountId:profile.consultant_key || "management",
      email:profile.email,
      name:profile.display_name,
      role:profile.role
    };
  };
  const signIn = async (email, password) => {
    const tokens = await authRequest("token?grant_type=password", { email, password });
    acceptTokens(tokens);
    try { return await loadPortal(); }
    catch(error){ remember(null); throw error; }
  };
  const restore = async () => {
    try {
      session = JSON.parse(localStorage.getItem(sessionKey) || "null");
      if(!session) return null;
      await token();
      const user = await request("/auth/v1/user");
      session.user = user;
      remember(session);
      return await loadPortal();
    } catch(error){
      console.error("Supabase session restore failed:", error);
      remember(null);
      return null;
    }
  };
  const signOut = async () => {
    const accessToken = session?.access_token;
    remember(null);
    profile = null;
    cache = Object.create(null);
    rows = new Map();
    snapshots = new Map();
    if(accessToken){
      try {
        await fetch(`${url}/auth/v1/logout`, {
          method:"POST", headers:{ apikey:key, Authorization:`Bearer ${accessToken}` }
        });
      } catch(error){ console.warn("Supabase sign-out request failed:", error); }
    }
  };
  const value = (storageKey, fallback) => Object.hasOwn(cache, storageKey) ? cache[storageKey] : fallback;
  const saveValue = (storageKey, newValue) => {
    const configKey = configKeys[storageKey];
    if(!configKey) throw new Error("This setting is not stored in Supabase.");
    if(profile?.role !== "Management") throw new Error("Management access is required to change settings.");
    const oldValue = cache[storageKey];
    cache[storageKey] = newValue;
    return enqueue(async () => {
      try {
        await request(table("config", "on_conflict=key"), {
          method:"POST",
          headers:{ "Content-Type":"application/json", Prefer:"resolution=merge-duplicates,return=representation" },
          body:JSON.stringify({ key:configKey, value:newValue, updated_by:session.user.id, updated_at:new Date().toISOString() })
        });
        cache[storageKey] = newValue;
      } catch(error){
        if(cache[storageKey] === newValue) cache[storageKey] = oldValue;
        alert(`Supabase could not save this setting: ${error.message}`);
        throw error;
      }
    });
  };
  const removeValue = storageKey => {
    const configKey = configKeys[storageKey];
    if(!configKey) return Promise.resolve();
    if(profile?.role !== "Management") return Promise.reject(new Error("Management access is required."));
    const oldValue = cache[storageKey];
    delete cache[storageKey];
    return enqueue(async () => {
      try { await request(table("config", `key=eq.${encode(configKey)}`), { method:"DELETE" }); }
      catch(error){ cache[storageKey] = oldValue; throw error; }
    });
  };
  const rowForSubmission = item => {
    const account = cache.eco_fresh_management_consultant_access_v1?.accounts?.[item.consultantAccountId];
    const existing = rows.get(item.id);
    return {
      id:item.id,
      owner_user_id:item.ownerUserId || existing?.owner_user_id || account?.userId || session.user.id,
      consultant_key:item.consultantAccountId || existing?.consultant_key || profile.consultant_key || "management",
      region:item.region || "",
      business_unit:item.businessUnit || "",
      project:item.project || "",
      revision:item.revision || "",
      year:item.year || null,
      version_number:Number(item.versionNumber) || 1,
      edit_allowed:item.editAccess?.allowed === true,
      payload:item,
      updated_at:new Date().toISOString(),
      ...(existing ? {} : { created_at:item.createdAt || new Date().toISOString() })
    };
  };
  const persistSubmissions = items => enqueue(async () => {
    const next = new Map(items.map(item => [item.id, item]));
    for(const item of items){
      const previous = rows.get(item.id);
      if(previous && snapshots.get(item.id) === JSON.stringify(item)) continue;
      const row = rowForSubmission(item);
      const endpoint = previous
        ? table("submissions", `id=eq.${encode(item.id)}&updated_at=eq.${encode(previous.updated_at)}`)
        : table("submissions");
      const saved = await request(endpoint, {
        method:previous ? "PATCH" : "POST",
        headers:{ "Content-Type":"application/json", Prefer:"return=representation" },
        body:JSON.stringify(row)
      });
      if(!Array.isArray(saved) || saved.length !== 1){
        throw new Error("This submission changed elsewhere. Reload the portal and try again.");
      }
      rows.set(item.id, saved[0]);
      snapshots.set(item.id, JSON.stringify(item));
    }
    for(const [id] of rows){
      if(next.has(id)) continue;
      if(profile?.role !== "Management") throw new Error("Only Management can delete submissions.");
      await request(table("submissions", `id=eq.${encode(id)}`), { method:"DELETE" });
      rows.delete(id);
      snapshots.delete(id);
    }
    cache.eco_fresh_v2_consultant_submissions = [...items];
  });
  const saveAccounts = async settings => {
    if(profile?.role !== "Management") throw new Error("Management access is required.");
    const accounts = (settings.accountOrder || Object.keys(settings.accounts || {}))
      .map(id => settings.accounts[id]).filter(Boolean)
      .map(item => ({
        id:item.id, name:item.name, email:item.email, password:item.password || "",
        active:item.active, projectKeys:item.projectKeys || []
      }));
    const result = await request("/functions/v1/ecoworld-manage-consultants", {
      method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ accounts })
    });
    if(!result?.ok) throw new Error(result?.error || "Could not save consultant accounts.");
    const people = await selectAll("profiles", "select=*");
    const access = await selectAll("project_access", "select=*");
    accountCache(people, access);
    return result;
  };
  const filePath = (name = "file") => {
    const safeName = String(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "file";
    return `${session.user.id}/uploads/${crypto.randomUUID()}-${safeName}`;
  };
  const uploadFile = async (blob, metadata = {}) => {
    const path = filePath(metadata.name);
    await request(`/storage/v1/object/${bucket}/${path}`, {
      method:"POST", headers:{ "Content-Type":metadata.type || blob.type || "application/octet-stream", "x-upsert":"false" },
      body:blob
    });
    return { blobId:path, name:metadata.name || "Uploaded file", type:metadata.type || blob.type,
      size:metadata.size ?? blob.size, lastModified:metadata.lastModified || Date.now() };
  };
  const isRemoteFile = id => /^[0-9a-f-]{36}\//i.test(String(id || ""));
  const downloadFile = async path => {
    const blob = await request(`/storage/v1/object/authenticated/${bucket}/${path}`);
    return { id:path, blob, name:path.split("/").pop(), type:blob.type, size:blob.size };
  };
  const deleteFile = path => request(`/storage/v1/object/${bucket}`, {
    method:"DELETE", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ prefixes:[path] })
  });
  return { signIn,restore,signOut,loadPortal,refreshSubmissions,value,saveValue,removeValue,
    persistSubmissions,saveAccounts,uploadFile,isRemoteFile,downloadFile,deleteFile,
    get profile(){ return profile; }, get userId(){ return session?.user?.id || null; } };
})();
