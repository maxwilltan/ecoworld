// EcoWorld portal API. All database and Auth administration stays server-side.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const ADMIN_KEY = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PUBLIC_KEY = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY") || "";
const LEGACY_ADMIN_KEY = !secretKeys.default;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const SETTINGS_KEYS = new Set([
  "eco_fresh_management_table_settings_v2",
  "eco_fresh_management_portal_hierarchy_v1",
  "eco_fresh_management_dropdown_options_v1",
  "eco_fresh_management_pile_reference_v1",
  "eco_fresh_management_pile_optimisation_v1",
]);

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function requiredString(value: unknown, label: string, max = 200) {
  const text = String(value ?? "").trim();
  if (!text || text.length > max) throw new ApiError(400, `Invalid ${label}.`);
  return text;
}

function adminHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: ADMIN_KEY,
    ...(LEGACY_ADMIN_KEY ? { Authorization: `Bearer ${ADMIN_KEY}` } : {}),
    ...extra,
  };
}

async function callApi(path: string, options: {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  prefer?: string;
} = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: options.method || "GET",
    headers: adminHeaders({
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...options.headers,
    }),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    throw new ApiError(response.status,
      typeof data === "object" ? (data?.msg || data?.message || data?.error_description || data?.error || "Backend request failed.") :
      (String(data || "Backend request failed.")));
  }
  return data;
}

function filter(value: string) { return encodeURIComponent(value); }
function table(name: string, params = "") {
  return `/rest/v1/${name}${params ? `?${params}` : ""}`;
}
async function selectRows(name: string, params = "") {
  return await callApi(table(name, params)) as any[];
}
async function insertRow(name: string, row: unknown) {
  const result = await callApi(table(name), {
    method: "POST", body: row, prefer: "return=representation",
  });
  return (result as any[])[0];
}
async function updateRows(name: string, params: string, values: unknown) {
  return await callApi(table(name, params), {
    method: "PATCH", body: values, prefer: "return=representation",
  }) as any[];
}

async function getAuthUser(token: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new ApiError(401, "Please sign in again.");
  const user = await response.json();
  if (!user?.id) throw new ApiError(401, "Please sign in again.");
  return user;
}

async function getProfile(userId: string) {
  const rows = await selectRows("portal_profiles", `id=eq.${filter(userId)}&select=*`);
  const profile = rows[0];
  if (!profile || !profile.active || profile.deleted_at) {
    throw new ApiError(403, "This account is not active in the EcoWorld portal.");
  }
  return profile;
}

function manager(profile: any) {
  if (profile.role !== "Management") throw new ApiError(403, "Management access required.");
}

function projectKey(payload: any) {
  const parts = ["region", "businessUnit", "project"]
    .map(key => requiredString(payload?.[key], key, 200));
  return parts.join("|||");
}

function cleanAccount(profile: any) {
  return {
    id: profile.account_id,
    name: profile.name,
    email: profile.email,
    password: "",
    active: profile.active,
    builtin: false,
    projectKeys: profile.project_keys || [],
  };
}

async function accountSnapshot() {
  const profiles = await selectRows("portal_profiles",
    "role=eq.Consultant&deleted_at=is.null&select=*&order=created_at.asc");
  const accounts: Record<string, unknown> = {};
  const accountOrder: string[] = [];
  for (const profile of profiles) {
    accounts[profile.account_id] = cleanAccount(profile);
    accountOrder.push(profile.account_id);
  }
  return { version: 3, accounts, accountOrder };
}

async function bootstrap(profile: any) {
  const [settingsRows, submissionRows, accounts] = await Promise.all([
    selectRows("portal_settings", "select=key,value"),
    selectRows("portal_submissions",
      `${profile.role === "Management" ? "" : `owner_user_id=eq.${filter(profile.id)}&`}select=payload&order=updated_at.desc`),
    profile.role === "Management"
      ? accountSnapshot()
      : Promise.resolve({
          version: 3,
          accounts: { [profile.account_id]: cleanAccount(profile) },
          accountOrder: [profile.account_id],
        }),
  ]);
  const settings: Record<string, unknown> = {};
  for (const row of settingsRows) settings[row.key] = row.value;
  return {
    auth: {
      email: profile.email, role: profile.role,
      accountId: profile.account_id, name: profile.name,
      userId: profile.id,
    },
    settings,
    submissions: submissionRows.map(row => row.payload),
    accounts,
  };
}

async function saveSetting(profile: any, body: any) {
  manager(profile);
  const key = requiredString(body.key, "setting key");
  if (!SETTINGS_KEYS.has(key)) throw new ApiError(400, "Unknown setting.");
  if (body.value === undefined || JSON.stringify(body.value).length > 500000) {
    throw new ApiError(413, "Setting is too large.");
  }
  await callApi(table("portal_settings", "on_conflict=key"), {
    method: "POST",
    body: { key, value: body.value, updated_by: profile.id, updated_at: new Date().toISOString() },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  return { ok: true };
}

function validateFileRefs(formData: any, ownerId: string) {
  for (const field of ["drawingArchitectural", "drawingStructural"]) {
    const entries = formData?.[field];
    for (const file of Array.isArray(entries) ? entries : (entries ? [entries] : [])) {
      if (!file?.blobId || !String(file.blobId).startsWith(`${ownerId}/`)) {
        throw new ApiError(400, "A drawing reference does not belong to this account.");
      }
    }
  }
}

async function saveSubmission(profile: any, body: any) {
  if (profile.role !== "Consultant") throw new ApiError(403, "Consultant access required.");
  const proposed = body.payload;
  if (!proposed || typeof proposed !== "object" || !proposed.formData ||
      typeof proposed.formData !== "object") throw new ApiError(400, "Invalid submission.");
  if (JSON.stringify(proposed.formData).length > 1000000) {
    throw new ApiError(413, "Submission is too large. Drawings must be uploaded separately.");
  }
  const key = projectKey(proposed);
  if (!Array.isArray(profile.project_keys) || !profile.project_keys.includes(key)) {
    throw new ApiError(403, "This account is not assigned to the selected project.");
  }
  const revision = requiredString(proposed.revision, "revision", 100);
  validateFileRefs(proposed.formData, profile.id);
  const rows = await selectRows("portal_submissions",
    `owner_user_id=eq.${filter(profile.id)}&project_key=eq.${filter(key)}&revision=eq.${filter(revision)}&select=*`);
  const existing = rows[0] || null;
  const now = new Date().toISOString();
  if (existing && (!existing.edit_allowed ||
      Number(body.expectedVersion) !== Number(existing.version_number))) {
    throw new ApiError(409, "This submission is locked or has changed. Reopen it before saving.");
  }
  if (!existing && body.expectedVersion) {
    throw new ApiError(409, "This submission has changed. Reopen it before saving.");
  }
  const oldPayload = existing?.payload || null;
  const version = existing ? existing.version_number + 1 : 1;
  const snapshot = oldPayload ? structuredClone(oldPayload) : null;
  if (snapshot) delete snapshot.previousVersions;
  const payload = {
    ...proposed,
    id: existing?.id || `sub_${crypto.randomUUID()}`,
    role: "Consultant",
    consultantAccountId: profile.account_id,
    consultantAccountName: profile.name,
    consultantAccountEmail: profile.email,
    region: requiredString(proposed.region, "region"),
    businessUnit: requiredString(proposed.businessUnit, "business unit"),
    project: requiredString(proposed.project, "project"),
    revision,
    createdAt: oldPayload?.createdAt || now,
    updatedAt: now,
    versionNumber: version,
    previousVersions: oldPayload
      ? [...(oldPayload.previousVersions || []), snapshot] : [],
    editAccess: { allowed: false, changedAt: now, changedBy: profile.email },
    audit: [...(oldPayload?.audit || []), {
      action: existing ? "resubmitted" : "submitted",
      at: now, by: profile.email, versionNumber: version,
    }],
  };
  if (existing) {
    const updated = await updateRows("portal_submissions",
      `id=eq.${filter(existing.id)}&version_number=eq.${existing.version_number}&edit_allowed=eq.true`,
      { payload, version_number: version, edit_allowed: false, updated_at: now });
    if (!updated.length) throw new ApiError(409, "This submission changed while saving. Reopen it.");
  } else {
    await insertRow("portal_submissions", {
      id: payload.id, owner_user_id: profile.id,
      consultant_account_id: profile.account_id, project_key: key,
      revision, version_number: 1, edit_allowed: false,
      payload, created_at: now, updated_at: now,
    });
  }
  return { payload };
}

async function getSubmission(id: string) {
  const rows = await selectRows("portal_submissions", `id=eq.${filter(id)}&select=*`);
  if (!rows[0]) throw new ApiError(404, "Submission not found.");
  return rows[0];
}

async function setEdit(profile: any, body: any) {
  manager(profile);
  const id = requiredString(body.id, "submission id");
  const existing = await getSubmission(id);
  const allowed = body.allowed === true;
  const now = new Date().toISOString();
  const payload = {
    ...existing.payload,
    editAccess: { allowed, changedAt: now, changedBy: profile.email },
    audit: [...(existing.payload.audit || []), {
      action: allowed ? "editing_allowed" : "editing_locked",
      at: now, by: profile.email,
    }],
    updatedAt: now,
  };
  const updated = await updateRows("portal_submissions",
    `id=eq.${filter(id)}&updated_at=eq.${filter(existing.updated_at)}`,
    { payload, edit_allowed: allowed, updated_at: now });
  if (!updated.length) throw new ApiError(409, "This submission changed. Refresh and try again.");
  return { payload };
}

async function deleteSubmission(profile: any, body: any) {
  manager(profile);
  const id = requiredString(body.id, "submission id");
  await callApi(table("portal_submissions", `id=eq.${filter(id)}`), {
    method: "DELETE", prefer: "return=minimal",
  });
  return { ok: true };
}

async function saveAccounts(profile: any, body: any) {
  manager(profile);
  const input = body.accounts;
  const order = body.accountOrder;
  if (!input || typeof input !== "object" || !Array.isArray(order) || order.length > 200) {
    throw new ApiError(400, "Invalid consultant list.");
  }
  const existing = await selectRows("portal_profiles",
    "role=eq.Consultant&deleted_at=is.null&select=*");
  const byAccountId = new Map(existing.map(row => [row.account_id, row]));
  const seenEmails = new Set<string>();
  for (const rawId of order) {
    const accountId = requiredString(rawId, "account id", 120);
    const item = input[accountId];
    if (!item || typeof item !== "object") throw new ApiError(400, "Invalid consultant.");
    const email = requiredString(item.email, "consultant email").toLowerCase();
    const name = requiredString(item.name, "consultant name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seenEmails.has(email)) {
      throw new ApiError(400, "Consultant emails must be valid and unique.");
    }
    seenEmails.add(email);
    const keys = Array.isArray(item.projectKeys)
      ? [...new Set(item.projectKeys.map(String).filter(key => key.length <= 700))] : [];
    const password = String(item.password || "");
    const prior = byAccountId.get(accountId);
    let userId = prior?.id;
    if (!prior) {
      if (password.length < 8) {
        throw new ApiError(400, `Give ${name} a temporary password of at least 8 characters.`);
      }
      const pending = await selectRows("portal_profiles",
        `email=eq.${filter(email)}&account_id=like.pending-*&select=*`);
      if (pending[0]) {
        userId = pending[0].id;
        await callApi(`/auth/v1/admin/users/${filter(userId)}`, {
          method: "PUT", body: { password, email_confirm: true },
        });
      } else {
        const created = await callApi("/auth/v1/admin/users", {
          method: "POST",
          body: { email, password, email_confirm: true, user_metadata: { name } },
        });
        userId = created.user?.id || created.id;
      }
      if (!userId) throw new ApiError(500, "Account creation did not return a user ID.");
      const updated = await updateRows("portal_profiles", `id=eq.${filter(userId)}`, {
        account_id: accountId, email, name, role: "Consultant",
        active: item.active !== false, project_keys: keys,
        deleted_at: null, updated_at: new Date().toISOString(),
      });
      if (!updated.length) throw new ApiError(500, "Consultant profile was not created.");
    } else {
      const authChanges: Record<string, unknown> = {};
      if (email !== prior.email) authChanges.email = email;
      if (password) {
        if (password.length < 8) throw new ApiError(400, "New passwords need at least 8 characters.");
        authChanges.password = password;
      }
      if (Object.keys(authChanges).length) {
        await callApi(`/auth/v1/admin/users/${filter(userId)}`, {
          method: "PUT", body: authChanges,
        });
      }
      const updated = await updateRows("portal_profiles", `id=eq.${filter(userId)}`, {
        email, name, active: item.active !== false,
        project_keys: keys, updated_at: new Date().toISOString(),
      });
      if (!updated.length) throw new ApiError(500, "Consultant profile was not updated.");
    }
  }
  const selected = new Set(order.map(String));
  for (const old of existing) {
    if (selected.has(old.account_id)) continue;
    await updateRows("portal_profiles", `id=eq.${filter(old.id)}`, {
      active: false, deleted_at: new Date().toISOString(),
      project_keys: [], updated_at: new Date().toISOString(),
    });
  }
  return { accounts: await accountSnapshot() };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  try {
    if (!ADMIN_KEY || !PUBLIC_KEY || !SUPABASE_URL) {
      throw new ApiError(503, "Backend keys are not configured.");
    }
    const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") || "")?.[1];
    if (!token) throw new ApiError(401, "Please sign in.");
    const user = await getAuthUser(token);
    const profile = await getProfile(user.id);
    const body = await request.json();
    let result: unknown;
    switch (body?.action) {
      case "bootstrap": result = await bootstrap(profile); break;
      case "save_setting": result = await saveSetting(profile, body); break;
      case "save_submission": result = await saveSubmission(profile, body); break;
      case "set_edit": result = await setEdit(profile, body); break;
      case "delete_submission": result = await deleteSubmission(profile, body); break;
      case "save_accounts": result = await saveAccounts(profile, body); break;
      default: throw new ApiError(400, "Unknown action.");
    }
    return reply(result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    if (status === 500) console.error(error);
    return reply({ error: status === 500 ? "Backend request failed." : String((error as Error).message) }, status);
  }
});
