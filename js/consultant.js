/* EcoWorld Consultant features. Load after data.js and before management.js. */
/* ==============================
   Consultant features
   ============================== */

/* ---- js/consultant/file-storage.js ---- */
var openEcoFileDb = function openEcoFileDb(){
  return new Promise((resolve, reject) => {
    if(!window.indexedDB){
      reject(new Error("This browser does not support IndexedDB file storage."));
      return;
    }

    const request = indexedDB.open(ECO_FILE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if(!db.objectStoreNames.contains(ECO_FILE_DB_STORE)){
        db.createObjectStore(ECO_FILE_DB_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open file storage."));
  });
};

var saveEcoFileBlob = async function saveEcoFileBlob(blob, metadata = {}){
  if(window.EcoBackend) return window.EcoBackend.uploadFile(blob, metadata);
  const db = await openEcoFileDb();
  const id = metadata.blobId || `file_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ECO_FILE_DB_STORE, "readwrite");
    tx.objectStore(ECO_FILE_DB_STORE).put({
      id,
      blob,
      name: metadata.name || "Uploaded file",
      type: metadata.type || blob.type || "application/octet-stream",
      size: metadata.size ?? blob.size ?? 0,
      lastModified: metadata.lastModified || Date.now(),
      savedAt: new Date().toISOString()
    });

    tx.oncomplete = () => {
      db.close();
      resolve({
        blobId: id,
        name: metadata.name || "Uploaded file",
        type: metadata.type || blob.type || "application/octet-stream",
        size: metadata.size ?? blob.size ?? 0,
        lastModified: metadata.lastModified || Date.now()
      });
    };

    tx.onerror = () => {
      const error = tx.error || new Error("Unable to store uploaded file.");
      db.close();
      reject(error);
    };

    tx.onabort = tx.onerror;
  });
};

var getEcoFileBlob = async function getEcoFileBlob(blobId){
  if(!blobId) return null;
  if(window.EcoBackend) return window.EcoBackend.getFile(blobId);
  const db = await openEcoFileDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ECO_FILE_DB_STORE, "readonly");
    const request = tx.objectStore(ECO_FILE_DB_STORE).get(blobId);

    request.onsuccess = () => {
      const record = request.result || null;
      db.close();
      resolve(record);
    };

    request.onerror = () => {
      const error = request.error || new Error("Unable to read uploaded file.");
      db.close();
      reject(error);
    };
  });
};

var getAllEcoFileRecords = async function getAllEcoFileRecords(){
  if(window.EcoBackend) return [];
  const db = await openEcoFileDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ECO_FILE_DB_STORE, "readonly");
    const request = tx.objectStore(ECO_FILE_DB_STORE).getAll();

    request.onsuccess = () => {
      const records = Array.isArray(request.result) ? request.result : [];
      db.close();
      resolve(records);
    };

    request.onerror = () => {
      const error = request.error || new Error("Unable to inspect uploaded file storage.");
      db.close();
      reject(error);
    };
  });
};

var ecoFileMetadataMatches = function ecoFileMetadataMatches(record, fileMeta){
  if(!record || !fileMeta) return false;

  const sameName = String(record.name || "") === String(fileMeta.name || "");
  const sameSize = Number(record.size || 0) === Number(fileMeta.size || 0);
  const metaType = String(fileMeta.type || "");
  const sameType = !metaType || String(record.type || "") === metaType;
  const metaModified = Number(fileMeta.lastModified || 0);
  const sameModified = !metaModified || Number(record.lastModified || 0) === metaModified;

  return sameName && sameSize && sameType && sameModified;
};

var recoverEcoFileRecord = async function recoverEcoFileRecord(fileMeta){
  if(!fileMeta) return null;

  if(fileMeta.blobId){
    const direct = await getEcoFileBlob(fileMeta.blobId);
    if(direct?.blob) return direct;
  }

  const records = await getAllEcoFileRecords();
  let matches = records.filter(record => ecoFileMetadataMatches(record, fileMeta));

  // Older metadata may not include lastModified/type. Fall back to name + size
  // only when that still identifies exactly one browser-stored file.
  if(matches.length !== 1){
    matches = records.filter(record =>
      String(record.name || "") === String(fileMeta.name || "") &&
      Number(record.size || 0) === Number(fileMeta.size || 0)
    );
  }

  return matches.length === 1 ? matches[0] : null;
};

var repairEcoFileReferences = function repairEcoFileReferences(fileMeta, recoveredRecord){
  if(window.EcoBackend) return;
  if(!fileMeta || !recoveredRecord?.id || typeof getSubmissions !== "function" || typeof setSubmissions !== "function") return;

  const submissions = getSubmissions();
  let changed = false;
  const drawingKeys = ["drawingArchitectural", "drawingStructural"];

  submissions.flatMap(submission => [submission,...(submission.previousVersions || [])]).forEach(submission => {
    if(!submission?.formData) return;
    drawingKeys.forEach(key => {
      const files = Array.isArray(submission.formData[key])
        ? submission.formData[key]
        : (submission.formData[key] ? [submission.formData[key]] : []);

      files.forEach(file => {
        const sameOldId = fileMeta.blobId && file?.blobId === fileMeta.blobId;
        const sameMeta = ecoFileMetadataMatches(recoveredRecord, file);
        if((sameOldId || sameMeta) && file?.blobId !== recoveredRecord.id){
          file.blobId = recoveredRecord.id;
          changed = true;
        }
      });
    });
  });

  if(changed){
    setSubmissions(submissions);
  }

  if(typeof state !== "undefined" && state?.formData){
    drawingKeys.forEach(key => {
      const files = Array.isArray(state.formData[key])
        ? state.formData[key]
        : (state.formData[key] ? [state.formData[key]] : []);
      files.forEach(file => {
        const sameOldId = fileMeta.blobId && file?.blobId === fileMeta.blobId;
        const sameMeta = ecoFileMetadataMatches(recoveredRecord, file);
        if((sameOldId || sameMeta) && file?.blobId !== recoveredRecord.id){
          file.blobId = recoveredRecord.id;
        }
      });
    });
  }
};

var deleteEcoFileBlob = async function deleteEcoFileBlob(blobId){
  if(!blobId) return;
  if(window.EcoBackend) return window.EcoBackend.deleteFile(blobId);
  const db = await openEcoFileDb();

  // Check after opening the database so saved/current and archived drawings
  // cannot be removed by stale form controls or another record's cleanup.
  const referenced = typeof getSubmissions === "function" && getSubmissions().some(item =>
    [item,...(item.previousVersions || [])].some(version =>
      ["drawingArchitectural","drawingStructural"].some(key => {
        const value = version.formData?.[key];
        return (Array.isArray(value) ? value : (value ? [value] : []))
          .some(file => file?.blobId === blobId);
      })
    )
  );
  if(referenced){ db.close(); return; }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ECO_FILE_DB_STORE, "readwrite");
    tx.objectStore(ECO_FILE_DB_STORE).delete(blobId);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      const error = tx.error || new Error("Unable to remove uploaded file.");
      db.close();
      reject(error);
    };

    tx.onabort = tx.onerror;
  });
};

var migrateLegacyDrawingFile = async function migrateLegacyDrawingFile(file){
  if(!file || !file.name) return file;
  if(file.blobId || !file.dataUrl) return file;

  const response = await fetch(file.dataUrl);
  const blob = await response.blob();

  return saveEcoFileBlob(blob, {
    name: file.name,
    type: file.type || blob.type,
    size: file.size || blob.size,
    lastModified: file.lastModified
  });
};

var migrateSubmissionDrawingFiles = async function migrateSubmissionDrawingFiles(submissions){
  const drawingKeys = ["drawingArchitectural", "drawingStructural"];

  for(const submission of submissions){
    if(!submission?.formData) continue;

    for(const key of drawingKeys){
      const files = Array.isArray(submission.formData[key])
        ? submission.formData[key]
        : (submission.formData[key] ? [submission.formData[key]] : []);

      if(!files.length) continue;

      const migrated = [];
      for(const file of files){
        migrated.push(await migrateLegacyDrawingFile(file));
      }
      submission.formData[key] = migrated;
    }
  }

  return submissions;
};

var openEcoStoredFile = async function openEcoStoredFile(fileMeta){
  if(!fileMeta) return;

  if(fileMeta.dataUrl){
    window.open(fileMeta.dataUrl, "_blank", "noopener");
    return;
  }

  if(!fileMeta.blobId){
    alert("This file is no longer available.");
    return;
  }

  // Open a blank tab synchronously so browsers do not block the later async navigation.
  const previewWindow = window.open("", "_blank");

  try{
    const record = await recoverEcoFileRecord(fileMeta);
    if(!record?.blob){
      if(previewWindow) previewWindow.close();
      alert("This drawing file is no longer available. Please re-upload it from the Consultant submission if needed.");
      return;
    }

    if(record.id && record.id !== fileMeta.blobId){
      repairEcoFileReferences(fileMeta, record);
      fileMeta.blobId = record.id;
    }

    const url = URL.createObjectURL(record.blob);
    if(previewWindow){
      previewWindow.location.href = url;
    }else{
      window.open(url, "_blank", "noopener");
    }

    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }catch(error){
    if(previewWindow) previewWindow.close();
    console.error(error);
    alert("Unable to open this uploaded file.");
  }
};

/* Browser file storage for consultant drawing uploads.
   Keeps large PDF/image bytes out of localStorage so submissions remain saveable. */
const ECO_FILE_DB_NAME = "ecoworld_portal_files_v1";
const ECO_FILE_DB_STORE = "files";
;

/* ---- js/consultant/core-selection.js ---- */
var monthYearLabel = function monthYearLabel(date = new Date()){
  const value = date instanceof Date ? date : new Date(date);
  if(Number.isNaN(value.getTime())) return "";
  return value.toLocaleString("en-US", { month:"short", year:"numeric" }).replace(" ", "-");
};

var currentMonthYearLabel = function currentMonthYearLabel(){
  return monthYearLabel(new Date());
};

var submissionYearLabel = function submissionYearLabel(item){
  return item?.year || monthYearLabel(item?.updatedAt) || "—";
};

var getMonthYearOptions = function getMonthYearOptions(){
  const now = new Date();
  const startYear = 2000;
  const endYear = now.getFullYear() + 8;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const options = [];

  for(let year = endYear; year >= startYear; year--){
    for(let month = 11; month >= 0; month--){
      options.push(`${months[month]}-${year}`);
    }
  }

  return options;
};

var populateYearSelect = function populateYearSelect(){
  const select = $("yearSelect");
  if(!select) return;

  const options = getMonthYearOptions();
  const current = state.selectedYear || currentMonthYearLabel();
  const finalOptions = options.includes(current) ? options : [current, ...options];

  select.innerHTML = finalOptions
    .map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
    .join("");

  state.selectedYear = current;
  select.value = current;
};

var loadStorage = function loadStorage(key, fallback){
  if(window.EcoBackend && key !== ECO_FRESH_STORAGE.sidebar){
    if(key === ECO_FRESH_STORAGE.auth) return null;
    if(key === ECO_FRESH_STORAGE.submissions) return window.EcoBackend.submissions();
    if(key === ECO_FRESH_STORAGE.consultantAccess) return window.EcoBackend.accounts() || fallback;
    return window.EcoBackend.setting(key, fallback);
  }
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(error){
    return fallback;
  }
};

var saveStorage = function saveStorage(key, value){
  if(window.EcoBackend && key !== ECO_FRESH_STORAGE.sidebar){
    if(key === ECO_FRESH_STORAGE.auth) return;
    if(key === ECO_FRESH_STORAGE.submissions || key === ECO_FRESH_STORAGE.consultantAccess){
      throw new Error("Use the secure backend operation for this change.");
    }
    return window.EcoBackend.saveSetting(key, value);
  }
  try{
    localStorage.setItem(key, JSON.stringify(value));
  }catch(error){
    console.error(`Unable to save browser storage key: ${key}`, error);
    throw error;
  }
};

var defaultFormData = function defaultFormData(){
  return {
    projectName: state.selectedProject || "",
    consultantName: typeof currentConsultantDisplayName === "function" ? currentConsultantDisplayName() : "",
    buildingType: "High Rise",
    landedType: "",
    highRiseType: "Residential – Duduk",
    highRiseCategory: "Long Block",
    transferFloor: "Separate Carpark Block (No Transfer Floor)",
    storeyCount: "",
    unitCount: "",
    gridlineCarpark: "",
    gridlineCarparkVertical: "",
    gridlineCarparkHorizontal: "",
    resiTowerBuildingEfficiency: "",
    carparkFloorEfficiency: "",
    overallBuildingEfficiency: "",
    pileType: "Bored Piles",
    pileSize: "",
    numberOfPiles: "",
    pilingCost: "",
    totalArea: "",
    totalColumnLoading: "",
    totalPilesCapacity: "",
    overallEfficiency: "",
    loadingCapacityRows: [],
    poundageRcColumn: "",
    poundageRcBeamCarpark: "",
    poundageRcBeamTypical: "",
    poundageRcSlab: "",
    poundageShearWall: "",
    poundageOverall: "",
    poundageSteelContent: "",
    poundageDetails: {},
    drawingArchitectural: [],
    drawingStructural: []
  };
};

var getSubmissions = function getSubmissions(){
  if(window.EcoBackend) return window.EcoBackend.submissions();
  return loadStorage(ECO_FRESH_STORAGE.submissions, []);
};

var setSubmissions = function setSubmissions(items){
  // setItem is atomic: a quota failure must leave the saved history untouched.
  saveStorage(ECO_FRESH_STORAGE.submissions, items);
};

var setAuth = function setAuth(auth){
  state.auth = auth;
  if(window.EcoBackend) return;
  if(auth){
    saveStorage(ECO_FRESH_STORAGE.auth, auth);
  }else{
    localStorage.removeItem(ECO_FRESH_STORAGE.auth);
  }
};

var applySidebarState = function applySidebarState(){
  const collapsed = state.sidebarCollapsed;
  $("sidebar").classList.toggle("collapsed", collapsed);
  $("appShell").classList.toggle("sidebar-collapsed", collapsed);
  saveStorage(ECO_FRESH_STORAGE.sidebar, collapsed);
};

var showView = function showView(viewName){
  state.currentView = viewName;

  if(state.auth?.role === "Management"){
    showManagementView(viewName);
    return;
  }

  ["overview", "history"].forEach(name => {
    const view = $(`${name}View`);
    if(view) view.classList.toggle("hidden", name !== viewName);
  });

  document.querySelectorAll(".management-view").forEach(view => {
    view.classList.add("hidden");
  });

  document.querySelectorAll(".side-nav-btn").forEach(btn => {
    btn.classList.toggle(
      "active",
      btn.dataset.view === viewName
    );
  });

  if(viewName === "history") renderHistory();
};

var consultantRegionBusinessUnits = function consultantRegionBusinessUnits(){
  if(
    state.auth?.role === "Consultant" &&
    typeof getConsultantAccessibleRegionBusinessUnits === "function"
  ){
    return getConsultantAccessibleRegionBusinessUnits();
  }

  if(
    typeof getConfiguredRegionBusinessUnits === "function"
  ){
    return getConfiguredRegionBusinessUnits();
  }

  return REGION_BUSINESS_UNITS;
};

var consultantBusinessUnitProjects = function consultantBusinessUnitProjects(){
  if(
    state.auth?.role === "Consultant" &&
    typeof getConsultantAccessibleBusinessUnitProjects === "function"
  ){
    return getConsultantAccessibleBusinessUnitProjects();
  }

  if(
    typeof getConfiguredBusinessUnitProjects === "function"
  ){
    return getConfiguredBusinessUnitProjects();
  }

  return BUSINESS_UNIT_PROJECTS;
};

var populateRevisionSelect = function populateRevisionSelect(){
  const select = $("revisionSelect");
  if(!select) return;

  const options =
    typeof getConfiguredRevisionOptions === "function"
      ? getConfiguredRevisionOptions()
      : ["Rev 0", "Rev 1", "Rev 2", "Rev 3"];

  const current =
    state.selectedRevision ||
    options[0] ||
    "Rev 0";

  const finalOptions =
    options.includes(current)
      ? options
      : [current, ...options];

  select.innerHTML =
    finalOptions
      .map(option =>
        `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`
      )
      .join("");

  state.selectedRevision =
    current;

  select.value =
    current;
};

var populateRegionSelect = function populateRegionSelect(){
  const select = $("regionSelect");
  if(!select) return;

  const regions = Object.keys(consultantRegionBusinessUnits());
  select.innerHTML = `<option value="">Select region</option>` +
    regions.map(region => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`).join("");

  if(state.selectedRegion && regions.includes(state.selectedRegion)){
    select.value = state.selectedRegion;
  }else{
    // A different consultant account may not have access to the Region that
    // was selected in the previous session. Reset the hierarchy so the
    // visible placeholder remains "Select region" instead of a blank select.
    state.selectedRegion = "";
    state.selectedBusinessUnit = "";
    state.selectedProject = "";
    select.value = "";
  }
};

var populateBusinessUnitSelect = function populateBusinessUnitSelect(){
  const select = $("businessUnitSelect");
  const options = consultantRegionBusinessUnits()[state.selectedRegion] || [];
  select.disabled = !state.selectedRegion;
  select.innerHTML = !state.selectedRegion
    ? `<option value="">Select region first</option>`
    : `<option value="">Select business unit</option>` + options.map(
        option => `<option value="${option}">${option}</option>`
      ).join("");
  if(state.selectedBusinessUnit && options.includes(state.selectedBusinessUnit)){
    select.value = state.selectedBusinessUnit;
  }else if(state.selectedBusinessUnit){
    state.selectedBusinessUnit = "";
    state.selectedProject = "";
    select.value = "";
  }
};

var populateProjectSelect = function populateProjectSelect(){
  const select = $("projectSelect");
  const options = consultantBusinessUnitProjects()[state.selectedBusinessUnit] || [];
  select.disabled = !state.selectedBusinessUnit;
  select.innerHTML = !state.selectedBusinessUnit
    ? `<option value="">Select business unit first</option>`
    : `<option value="">Select project</option>` + options.map(
        option => `<option value="${option}">${option}</option>`
      ).join("");
  if(state.selectedProject && options.includes(state.selectedProject)){
    select.value = state.selectedProject;
  }else if(state.selectedProject){
    state.selectedProject = "";
    select.value = "";
  }
};

var allProjectSearchItems = function allProjectSearchItems(){
  const items=[];

  Object.entries(consultantRegionBusinessUnits()).forEach(([region,businessUnits])=>{
    businessUnits.forEach(businessUnit=>{
      const projects=consultantBusinessUnitProjects()[businessUnit] || [];

      projects.forEach(project=>{
        items.push({
          region,
          businessUnit,
          project
        });
      });
    });
  });

  return items;
};

var closeProjectSearchResults = function closeProjectSearchResults(){
  const results=$("projectSearchResults");
  if(results)results.classList.add("hidden");
};

var renderProjectSearchResults = function renderProjectSearchResults(query){
  const results=$("projectSearchResults");
  const normalized=String(query || "").trim().toLowerCase();

  results.innerHTML="";

  if(!normalized){
    closeProjectSearchResults();
    return;
  }

  const matches=allProjectSearchItems()
    .filter(item=>
      item.project.toLowerCase().includes(normalized) ||
      item.businessUnit.toLowerCase().includes(normalized) ||
      item.region.toLowerCase().includes(normalized)
    )
    .slice(0,12);

  if(!matches.length){
    results.innerHTML=`<div class="project-search-empty">No project found</div>`;
    results.classList.remove("hidden");
    return;
  }

  matches.forEach(item=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="project-search-result";
    button.dataset.searchRegion=item.region;
    button.dataset.searchBusinessUnit=item.businessUnit;
    button.dataset.searchProject=item.project;
    button.innerHTML=`
      <span>
        <strong>${escapeHtml(item.project)}</strong>
        <small>${escapeHtml(item.region)} · ${escapeHtml(item.businessUnit)}</small>
      </span>
      <span>→</span>
    `;
    results.appendChild(button);
  });

  results.classList.remove("hidden");
};

var setSelectedProject = function setSelectedProject(project){
  const selected = String(project || "").trim();

  state.selectedProject = selected;
  state.formData.projectName = selected;

  if($("projectSearchInput")){
    $("projectSearchInput").value = selected;
  }

  closeProjectSearchResults();
  updateCurrentSelectionPill();
  loadFormForCurrentSelection();
};

var selectProjectFromSearch = function selectProjectFromSearch(item){
  state.selectedRegion=item.region;
  state.selectedBusinessUnit=item.businessUnit;
  state.selectedProject=item.project;

  $("regionSelect").value=state.selectedRegion;
  populateBusinessUnitSelect();
  $("businessUnitSelect").value=state.selectedBusinessUnit;
  populateProjectSelect();
  $("projectSelect").value=state.selectedProject;
  $("projectSearchInput").value=state.selectedProject;

  state.formData.projectName=state.selectedProject;
  closeProjectSearchResults();
  updateCurrentSelectionPill();
  loadFormForCurrentSelection();
};

var hasSelectedProject = function hasSelectedProject(){
  return Boolean(
    state.selectedRegion &&
    state.selectedBusinessUnit &&
    state.selectedProject
  );
};

var updateSubmissionLockState = function updateSubmissionLockState(){
  const selected = hasSelectedProject();
  const unlocked = typeof canEditCurrentSubmissionV31 === "function" && canEditCurrentSubmissionV31();
  const existing = typeof currentSelectedSubmissionV31 === "function" ? currentSelectedSubmissionV31() : null;

  const notice = $("submissionLockNotice");
  if(notice){
    notice.classList.toggle("hidden", unlocked);
    const title = notice.querySelector("strong");
    const detail = notice.querySelector("small");
    if(title) title.textContent = !selected ? "Select a project to begin" : existing ? "Submitted · Read only" : "Project access unavailable";
    if(detail) detail.textContent = !selected ? "Choose a region, business unit and project above." : existing ? "Management can allow editing for this individual submission. Drawings and calculation details remain available to view." : "Your consultant account must be active and assigned to this project.";
  }

  const tableCard =
    $("overviewTableBody")?.closest(".table-card");

  if(tableCard){
    tableCard.classList.toggle(
      "submission-locked",
      !selected
    );
  }

  $("overviewTableBody")
    ?.querySelectorAll(
      "input, select, textarea, button"
    )
    .forEach(control => {
      const viewAction = control.matches("[data-open-drawing-folder],[data-open-loading-table],[data-open-poundage-calculator]");
      control.disabled = viewAction ? !selected : !unlocked;
    });

  if($("revisionSelect")){
    $("revisionSelect").disabled = !selected;
  }

  if($("yearSelect")){
    $("yearSelect").disabled = !unlocked;
  }

  if($("clearFormBtn")){
    $("clearFormBtn").disabled = !unlocked;
  }

  if($("submitBtn")){
    $("submitBtn").disabled = !unlocked;
    $("submitBtn").textContent = existing && unlocked ? "Resubmit correction" : "Submit";
  }
  if(typeof refreshSubmissionModalPermissionsV31 === "function") refreshSubmissionModalPermissionsV31();
};

var updateCurrentSelectionPill = function updateCurrentSelectionPill(){
  const parts = [state.selectedRegion, state.selectedBusinessUnit, state.selectedProject].filter(Boolean);
  $("currentSelectionPill").textContent = parts.length ? parts.join(" / ") : "No project selected";
  $("valueColumnHeading").textContent = state.selectedRevision || "Current Revision";
  updateSubmissionLockState();
};

var findSubmission = function findSubmission(project, revision){
  return getSubmissions().find(item =>
    item.region === state.selectedRegion &&
    item.businessUnit === state.selectedBusinessUnit &&
    item.project === project &&
    item.revision === revision &&
    (
      state.auth?.role !== "Consultant" ||
      typeof submissionBelongsToCurrentConsultant !== "function" ||
      submissionBelongsToCurrentConsultant(item)
    )
  ) || null;
};

var numberOrNull = function numberOrNull(value){
  const num = Number(value);
  return value !== "" && value !== null && value !== undefined && Number.isFinite(num)
    ? num
    : null;
};

var ensureLoadingCapacityRows = function ensureLoadingCapacityRows(){
  if(!Array.isArray(state.formData.loadingCapacityRows)){
    state.formData.loadingCapacityRows = [];
  }
  return state.formData.loadingCapacityRows;
};

var loadingRowCalculation = function loadingRowCalculation(row){
  const count = numberOrNull(row.numberOfPiles);

  const capacityPerPile =
    findManagementPileCapacity(
      row.pileType,
      row.pileSize
    );

  const columnLoading = numberOrNull(row.columnLoading);

  const totalCapacity =
    count !== null &&
    capacityPerPile !== null
      ? count * capacityPerPile
      : null;

  const efficiency =
    totalCapacity !== null &&
    totalCapacity > 0 &&
    columnLoading !== null
      ? columnLoading / totalCapacity
      : null;

  return {
    count,
    capacityPerPile,
    columnLoading,
    totalCapacity,
    efficiency
  };
};

var calculateLoadingCapacityTotals = function calculateLoadingCapacityTotals(){
  const rows = ensureLoadingCapacityRows();

  let totalPiles = 0;
  let totalCapacity = 0;
  let totalLoading = 0;
  let anyCapacity = false;
  let anyLoading = false;

  rows.forEach(row => {
    const calc = loadingRowCalculation(row);

    if(calc.count !== null){
      totalPiles += calc.count;
    }

    if(calc.totalCapacity !== null){
      totalCapacity += calc.totalCapacity;
      anyCapacity = true;
    }

    if(calc.columnLoading !== null){
      totalLoading += calc.columnLoading;
      anyLoading = true;
    }
  });

  const overallEfficiency =
    anyCapacity &&
    anyLoading &&
    totalCapacity > 0
      ? totalLoading / totalCapacity
      : null;

  return {
    totalPiles,
    totalCapacity: anyCapacity ? totalCapacity : null,
    totalLoading: anyLoading ? totalLoading : null,
    overallEfficiency
  };
};

var syncLoadingSummaryToForm = function syncLoadingSummaryToForm(){
  const totals = calculateLoadingCapacityTotals();

  state.formData.totalColumnLoading =
    totals.totalLoading === null
      ? ""
      : String(Number(totals.totalLoading.toFixed(2)));

  state.formData.totalPilesCapacity =
    totals.totalCapacity === null
      ? ""
      : String(Number(totals.totalCapacity.toFixed(2)));

  state.formData.overallEfficiency =
    totals.overallEfficiency === null
      ? ""
      : String(Number((totals.overallEfficiency * 100).toFixed(1)));

  return totals;
};

var deriveEfficiency = function deriveEfficiency(){
  syncLoadingSummaryToForm();
};

var ensureSelectionLinkedFields = function ensureSelectionLinkedFields(){
  state.formData.projectName = state.selectedProject || state.formData.projectName || "";
};

var loadFormForCurrentSelection = function loadFormForCurrentSelection(){
  ensureSelectionLinkedFields();

  if(!state.selectedProject){
    state.formData = { ...defaultFormData(), projectName: "" };
    state.editingId = null;
    state.loadedSubmissionTokenV31 = null;
    renderOverviewTable();
    updateSaveStatus("Choose a project to start.");
    return;
  }

  const existing = findSubmission(state.selectedProject, state.selectedRevision);

  if(existing){
    state.formData = {
      ...defaultFormData(),
      ...structuredClone(existing.formData || {})
    };
    state.editingId = existing.id;
    state.loadedSubmissionTokenV31 = submissionContentTokenV31(existing);
    state.formData.projectName = state.selectedProject;
    state.selectedYear = submissionYearLabel(existing) === "—" ? currentMonthYearLabel() : submissionYearLabel(existing);
    populateYearSelect();
    renderOverviewTable();
    updateSaveStatus(`Loaded ${state.selectedProject} · ${state.selectedRevision} · Version ${Number(existing.versionNumber) || 1}. ${canConsultantEditSubmissionV31(existing) ? "Editing allowed. Resubmitting will lock this submission again." : "Read only. Management must allow editing before corrections."}`);
    return;
  }

  state.formData = {
    ...defaultFormData(),
    projectName: state.selectedProject || ""
  };
  state.editingId = null;
  state.loadedSubmissionTokenV31 = null;
  renderOverviewTable();
  if(!state.selectedYear) state.selectedYear = currentMonthYearLabel();
  populateYearSelect();
  updateSaveStatus(`New ${state.selectedRevision} · ${state.selectedYear} record for ${state.selectedProject}. Ready to edit.`);
};


const $ = (id) => document.getElementById(id);

const state = {
  auth: null,
  selectedRegion: "",
  selectedBusinessUnit: "",
  selectedProject: "",
  selectedRevision: "Rev 0",
  selectedYear: "",
  currentView: "overview",
  sidebarCollapsed: false,
  formData: {},
  editingId: null
};
;

/* ---- js/consultant/render-drawings.js ---- */
var updateSaveStatus = function updateSaveStatus(message){
  $("saveStatus").textContent = message;
};

var shouldShowRow = function shouldShowRow(row){
  if(typeof row.showWhen !== "function") return true;
  try{
    return !!row.showWhen(state.formData);
  }catch(error){
    return true;
  }
};

var escapeHtml = function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};

var consultantPoundageRowLabel = function consultantPoundageRowLabel(rowKey, fallback){
  const isLanded =
    String(state.formData.buildingType || "")
      .trim()
      .toLowerCase() === "landed";

  if(!isLanded){
    return fallback;
  }

  if(rowKey === "poundageRcColumn") return "RC Column, kg/m³";
  if(rowKey === "poundageRcBeamCarpark") return "RC Beam, kg/m³";
  if(rowKey === "poundageRcSlab") return "RC Slab, kg/m³";
  if(rowKey === "poundageOverall") return "Overall Poundage, kg/m³";
  if(rowKey === "poundageSteelContent") return "Total Steel Content per Unit (Landed), kg";

  return fallback;
};

var landedTypeRowMarkup = function landedTypeRowMarkup(){
  const isLanded =
    String(state.formData.buildingType || "")
      .trim()
      .toLowerCase() === "landed";

  if(!isLanded){
    return "";
  }

  const options =
    typeof getConsultantDropdownOptions === "function"
      ? getConsultantDropdownOptions(
          "landedType",
          [
            "Terrace 22x70",
            "Terrace 20x70",
            "Semi-D",
            "Bungalow",
            "Cluster / Link"
          ]
        )
      : [
          "Terrace 22x70",
          "Terrace 20x70",
          "Semi-D",
          "Bungalow",
          "Cluster / Link"
        ];

  if(!state.formData.landedType){
    state.formData.landedType = options[0];
  }

  if(
    typeof isConsultantRowVisible === "function" &&
    !isConsultantRowVisible(
      "Project Information",
      "landedType"
    )
  ){
    return "";
  }

  const landedLabel =
    typeof consultantRowLabel === "function"
      ? consultantRowLabel(
          "Project Information",
          "landedType",
          "Landed Type"
        )
      : "Landed Type";

  return `
    <tr class="landed-type-row">
      <td>
        <div class="field-label">${escapeHtml(landedLabel)}</div>
      </td>
      <td>
        <select data-field="landedType">
          ${options.map(option => `
            <option
              value="${escapeHtml(option)}"
              ${state.formData.landedType === option ? "selected" : ""}
            >
              ${escapeHtml(option)}
            </option>
          `).join("")}
        </select>
      </td>
    </tr>
  `;
};

var inputMarkup = function inputMarkup(row, value){
  const safeValue = value ?? "";

  if(row.type === "loadingSummary"){
    syncLoadingSummaryToForm();

    let displayValue = state.formData[row.key];

    if(displayValue === "" || displayValue === null || displayValue === undefined){
      displayValue = "—";
    }else if(row.key === "overallEfficiency"){
      displayValue = `${displayValue}%`;
    }else{
      displayValue = Number(displayValue).toLocaleString(undefined, {
        maximumFractionDigits: 2
      });
    }

    return `
      <div class="loading-summary-trigger loading-summary-static">
        <span class="loading-summary-main">
          <span class="loading-summary-value">${escapeHtml(displayValue)}</span>
          <span class="loading-summary-caption">Calculated from detailed table</span>
        </span>
      </div>
    `;
  }

  if(
    typeof isConsultantPoundageCalculatedField === "function" &&
    isConsultantPoundageCalculatedField(row.key)
  ){
    const displayValue =
      safeValue === "" || safeValue === null || safeValue === undefined
        ? "—"
        : `${Number(safeValue).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg/m³`;

    const isExceeding =
      safeValue !== "" &&
      typeof consultantPoundageExceedsGuide === "function" &&
      consultantPoundageExceedsGuide(row.key, safeValue);

    const exceedReason =
      typeof getPoundageDetail === "function"
        ? String(getPoundageDetail(row.key)?.exceedReason || "").trim()
        : "";

    return `
      <button
        type="button"
        class="poundage-calculator-trigger ${isExceeding ? "is-exceeding" : ""}"
        data-open-poundage-calculator="${escapeHtml(row.key)}"
        title="Enter steel weight and concrete volume"
      >
        <span class="poundage-trigger-main">
          <strong class="${isExceeding ? "poundage-value-exceeded" : ""}">${escapeHtml(displayValue)}</strong>
          ${
            safeValue === ""
              ? `<small>Click to calculate</small>`
              : isExceeding
                ? `<small class="poundage-caption-exceeded">Remark: ${escapeHtml(exceedReason || "—")}</small>`
                : ""
          }
        </span>
      </button>
    `;
  }

  if(row.type === "gridlinePair"){
    const verticalValue =
      state.formData.gridlineCarparkVertical !== "" &&
      state.formData.gridlineCarparkVertical !== null &&
      state.formData.gridlineCarparkVertical !== undefined
        ? state.formData.gridlineCarparkVertical
        : (state.formData.gridlineCarpark ?? "");
    const horizontalValue =
      state.formData.gridlineCarparkHorizontal ?? "";

    return `
      <div class="gridline-dimension-box">
        <label class="gridline-dimension-item">
          <span>Vertical</span>
          <div class="gridline-dimension-input-wrap">
            <input
              class="text-input"
              type="number"
              step="0.01"
              data-field="gridlineCarparkVertical"
              value="${escapeHtml(verticalValue)}"
              placeholder="Enter vertical"
            />
            <small>m</small>
          </div>
        </label>

        <label class="gridline-dimension-item">
          <span>Horizontal</span>
          <div class="gridline-dimension-input-wrap">
            <input
              class="text-input"
              type="number"
              step="0.01"
              data-field="gridlineCarparkHorizontal"
              value="${escapeHtml(horizontalValue)}"
              placeholder="Enter horizontal"
            />
            <small>m</small>
          </div>
        </label>
      </div>
    `;
  }

  if(row.type === "select"){
    const configuredOptions =
      typeof getConsultantDropdownOptions === "function"
        ? getConsultantDropdownOptions(
            row.key,
            row.options || []
          )
        : (row.options || []);

    const options = configuredOptions.map(option => {
      const selected = option === safeValue ? "selected" : "";
      return `<option value="${escapeHtml(option)}" ${selected}>${escapeHtml(option)}</option>`;
    }).join("");

    return `<select data-field="${row.key}">${options}</select>`;
  }

  if(row.type === "textarea"){
    return `<textarea data-field="${row.key}" placeholder="${escapeHtml(row.placeholder || "")}">${escapeHtml(safeValue)}</textarea>`;
  }

  if(row.type === "file"){
    const files = normaliseDrawingFiles(
      state.formData[row.key]
    );

    return `
      <div class="drawing-folder-upload-row">
        <div class="drawing-file-picker">
          <input
            type="file"
            data-file-field="${row.key}"
            accept="${escapeHtml(row.accept || "")}"
            aria-describedby="drawingUploadStatus-${escapeHtml(row.key)}"
            multiple
          />
          <div
            class="drawing-upload-status hidden"
            id="drawingUploadStatus-${escapeHtml(row.key)}"
            data-upload-status="${escapeHtml(row.key)}"
            role="status"
            aria-live="polite"
          >
            <span class="drawing-upload-spinner" aria-hidden="true"></span>
            <span data-upload-status-text>Preparing upload…</span>
          </div>
        </div>

        ${renderDrawingFolder(row.key, files)}
      </div>
    `;
  }

  const stepAttr = row.step ? `step="${row.step}"` : "";
  const placeholderAttr = `placeholder="${escapeHtml(row.placeholder || "")}"`;

  return `
    <input
      class="text-input"
      type="${row.type || "text"}"
      data-field="${row.key}"
      value="${escapeHtml(safeValue)}"
      ${stepAttr}
      ${placeholderAttr}
    />
  `;
};

var normaliseDrawingFiles = function normaliseDrawingFiles(value){
  if(Array.isArray(value)){
    return value.filter(file => file && file.name);
  }

  if(value && value.name){
    return [value];
  }

  return [];
};

var drawingFieldLabel = function drawingFieldLabel(fieldKey){
  if(fieldKey === "drawingArchitectural"){
    return "Architectural Drawings";
  }

  if(fieldKey === "drawingStructural"){
    return "Structural Drawings";
  }

  return "Drawing Files";
};

var getProjectDrawingRevisionGroups = function getProjectDrawingRevisionGroups(fieldKey){
  if(!state.selectedProject){
    return [];
  }

  const submissions = getSubmissions()
    .filter(item =>
      item.project === state.selectedProject &&
      item.region === state.selectedRegion &&
      item.businessUnit === state.selectedBusinessUnit &&
      (
        state.auth?.role !== "Consultant" ||
        typeof submissionBelongsToCurrentConsultant !== "function" ||
        submissionBelongsToCurrentConsultant(item)
      )
    );

  const revisionMap = new Map();

  submissions.forEach(item => {
    const files = normaliseDrawingFiles(
      item.formData?.[fieldKey]
    );

    if(files.length){
      revisionMap.set(
        item.revision || "Revision",
        files
      );
    }
  });

  // Include unsaved/current revision files too.
  const currentFiles = normaliseDrawingFiles(
    state.formData[fieldKey]
  );

  if(currentFiles.length){
    revisionMap.set(
      state.selectedRevision || "Current Revision",
      currentFiles
    );
  }

  const revisionOrder = value => {
    const match = String(value).match(/(\d+)/);
    return match ? Number(match[1]) : 9999;
  };

  return [...revisionMap.entries()]
    .map(([revision, files]) => ({
      revision,
      files
    }))
    .sort((a, b) =>
      revisionOrder(a.revision) -
      revisionOrder(b.revision)
    );
};

var getDrawingFolderTotalFiles = function getDrawingFolderTotalFiles(fieldKey){
  return getProjectDrawingRevisionGroups(fieldKey)
    .reduce(
      (total, group) =>
        total + group.files.length,
      0
    );
};

var renderDrawingFolder = function renderDrawingFolder(fieldKey, currentFiles){
  const totalFiles =
    getDrawingFolderTotalFiles(fieldKey);

  const currentCount =
    normaliseDrawingFiles(currentFiles).length;

  return `
    <button
      type="button"
      class="drawing-folder-card"
      data-open-drawing-folder="${fieldKey}"
    >
      <span class="drawing-folder-icon">▰</span>

      <span class="drawing-folder-copy">
        <strong>${escapeHtml(drawingFieldLabel(fieldKey))}</strong>
        <small>
          ${
            totalFiles
              ? `${totalFiles} file${totalFiles === 1 ? "" : "s"} across revisions`
              : "No files uploaded yet"
          }
          ${
            currentCount
              ? ` · ${currentCount} in ${escapeHtml(state.selectedRevision)}`
              : ""
          }
        </small>
      </span>

      <span class="drawing-folder-open">
        Open
        <strong>→</strong>
      </span>
    </button>
  `;
};

var closeDrawingFolderModal = function closeDrawingFolderModal(){
  $("drawingFolderModal")
    .classList.add("hidden");

  document.body.classList.remove("modal-open");
};

var renderOverviewTable = function renderOverviewTable(){
  deriveEfficiency();

  const tbody = $("overviewTableBody");
  let html = "";

  OVERVIEW_SECTIONS.forEach(section => {
    if(
      typeof isConsultantSectionVisible === "function" &&
      !isConsultantSectionVisible(section.title)
    ){
      return;
    }

    const isLoadingSection =
      section.title === "Pile Efficiency & Loading";

    const sectionDisplayLabel =
      typeof consultantSectionLabel === "function"
        ? consultantSectionLabel(section.title)
        : section.title;

    html += `
      <tr class="section-row">
        <td colspan="2">
          <div class="section-row-content">
            <span>${escapeHtml(sectionDisplayLabel)}</span>
            ${isLoadingSection ? `
              <button
                type="button"
                class="section-open-table-btn"
                data-open-loading-table="section"
              >
                Pile Efficiency Table →
              </button>
            ` : ""}
          </div>
        </td>
      </tr>
    `;

    const consultantSettings =
      typeof getConsultantTableSettings === "function"
        ? getConsultantTableSettings()
        : {customRows:[]};

    const customRows =
      (consultantSettings.customRows || [])
        .filter(item =>
          item.section === section.title
        )
        .map(item => ({
          key:item.key,
          label:item.label,
          type:item.type || "text",
          placeholder:item.placeholder || "Enter value",
          custom:true
        }));

    const sectionRows = [
      ...section.rows,
      ...customRows
    ];

    sectionRows.forEach(row => {
      if(!shouldShowRow(row)) return;

      if(
        typeof isConsultantRowVisible === "function" &&
        !isConsultantRowVisible(
          section.title,
          row.key
        )
      ){
        return;
      }

      const value = state.formData[row.key] ?? "";

      const baseRowDisplayLabel =
        typeof consultantRowLabel === "function"
          ? consultantRowLabel(
              section.title,
              row.key,
              row.label
            )
          : row.label;

      const rowDisplayLabel =
        section.title === "Poundage"
          ? consultantPoundageRowLabel(
              row.key,
              baseRowDisplayLabel
            )
          : baseRowDisplayLabel;

      html += `
        <tr>
          <td>
            <div class="field-label">${escapeHtml(rowDisplayLabel)}</div>
          </td>
          <td>${inputMarkup(row, value)}</td>
        </tr>
      `;

      if(row.key === "buildingType"){
        html += landedTypeRowMarkup();
      }
    });
  });

  tbody.innerHTML = html;
  updateCurrentSelectionPill();
  updateSubmissionLockState();
};


;

/* ---- js/consultant/submissions-history.js ---- */
var resetForm = function resetForm(){
  if(!canEditCurrentSubmissionV31()) return;
  state.formData = {
    ...defaultFormData(),
    projectName: state.selectedProject || ""
  };
  renderOverviewTable();
  updateSaveStatus("Form cleared.");
};

var handleFieldChange = async function handleFieldChange(target){
  if(!canEditCurrentSubmissionV31()) return;
  const key = target.dataset.field;
  if(!key) return;

  state.formData[key] = target.value;

  if(key === "buildingType"){
    const isLanded =
      String(target.value)
        .trim()
        .toLowerCase() === "landed";

    state.formData.buildingType = target.value;

    if(isLanded){
      if(!state.formData.landedType){
        state.formData.landedType =
        (
          typeof getConsultantDropdownOptions === "function"
            ? getConsultantDropdownOptions(
                "landedType",
                ["Terrace 22x70"]
              )
            : ["Terrace 22x70"]
        )[0] || "";
      }
    }else{
      state.formData.landedType = "";
    }

    renderOverviewTable();
    updateSaveStatus("Building type updated.");
    return;
  }

  updateSaveStatus("Unsaved changes.");
};

var setDrawingUploadStateV147 = function setDrawingUploadStateV147(target, active, message = ""){
  const fieldKey = target?.dataset?.fileField || "";

  if(active){
    activeDrawingUploadsV147 += 1;
  }else{
    activeDrawingUploadsV147 = Math.max(0, activeDrawingUploadsV147 - 1);
  }

  const uploadIsBusy = activeDrawingUploadsV147 > 0;
  document
    .querySelectorAll("[data-file-field]")
    .forEach(input => {
      input.disabled = uploadIsBusy;
      input.setAttribute("aria-busy", String(uploadIsBusy));
    });

  [$("submitBtn"), $("clearFormBtn")].forEach(button => {
    if(button) button.disabled = uploadIsBusy || !canEditCurrentSubmissionV31();
  });

  if(!fieldKey) return;

  const status = document.querySelector(
    `[data-upload-status="${fieldKey}"]`
  );
  const row = status?.closest(".drawing-folder-upload-row");

  status?.classList.toggle("hidden", !active);
  row?.classList.toggle("is-uploading", active);
  row?.setAttribute("aria-busy", String(active));

  const statusText = status?.querySelector("[data-upload-status-text]");
  if(statusText && message){
    statusText.textContent = message;
  }
};

var updateDrawingUploadMessageV147 = function updateDrawingUploadMessageV147(target, message){
  const fieldKey = target?.dataset?.fileField || "";
  const statusText = fieldKey
    ? document.querySelector(
        `[data-upload-status="${fieldKey}"] [data-upload-status-text]`
      )
    : null;

  if(statusText){
    statusText.textContent = message;
  }
};

var handleFileChange = async function handleFileChange(target){
  if(!canEditCurrentSubmissionV31()) return;
  const startingIdentity = selectedSubmissionIdentityV31();
  const key = target.dataset.fileField;
  const selectedFiles = Array.from(
    target.files || []
  );

  if(!key || !selectedFiles.length){
    return;
  }

  const existingFiles =
    normaliseDrawingFiles(
      state.formData[key]
    );

  const uploadedFiles = [];
  const uploadIndicatorStartedAt = Date.now();

  try{
    setDrawingUploadStateV147(
      target,
      true,
      `Uploading ${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"}…`
    );
    updateSaveStatus("Uploading file(s)…");

    for(const [index, file] of selectedFiles.entries()){
      updateDrawingUploadMessageV147(
        target,
        `Uploading ${index + 1} of ${selectedFiles.length}: ${file.name}`
      );

      const stored = await saveEcoFileBlob(file, {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified
      });

      uploadedFiles.push(stored);
    }

    if(!canEditCurrentSubmissionV31() || startingIdentity !== selectedSubmissionIdentityV31()){
      updateSaveStatus("The submission access or selection changed. Uploaded files were not added.");
      return;
    }
    state.formData[key] = [
      ...existingFiles,
      ...uploadedFiles
    ];

    renderOverviewTable();

    updateSaveStatus(
      `${uploadedFiles.length} file${
        uploadedFiles.length === 1 ? "" : "s"
      } uploaded. Unsaved changes.`
    );
  }catch(error){
    console.error(error);
    alert("Unable to store the uploaded file. Please try again or use a smaller file.");
    updateSaveStatus("File upload could not be stored.");
  }finally{
    const remainingIndicatorTime = 600 - (Date.now() - uploadIndicatorStartedAt);
    if(remainingIndicatorTime > 0){
      await new Promise(resolve => window.setTimeout(resolve, remainingIndicatorTime));
    }
    setDrawingUploadStateV147(target, false);
    target.value = "";
  }
};

var buildSubmissionPayload = function buildSubmissionPayload(existingId = null){
  if(typeof syncLoadingSummaryToForm === "function"){
    syncLoadingSummaryToForm();
  }

  return {
    id: existingId || `sub_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    role: "Consultant",
    consultantAccountId: typeof currentConsultantAccountId === "function" ? currentConsultantAccountId() : "",
    consultantAccountName: typeof currentConsultantDisplayName === "function" ? currentConsultantDisplayName() : (state.formData.consultantName || ""),
    consultantAccountEmail: state.auth?.email || "",
    region: state.selectedRegion,
    businessUnit: state.selectedBusinessUnit,
    project: state.selectedProject,
    revision: state.selectedRevision,
    year: state.selectedYear || currentMonthYearLabel(),
    updatedAt: new Date().toISOString(),
    formData: structuredClone(state.formData)
  };
};

var showSubmissionSuccessNotice = function showSubmissionSuccessNotice(payload){
  const existing = document.getElementById("submissionSuccessBackdrop");
  if(existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "submissionSuccessBackdrop";
  backdrop.className = "modal-backdrop submission-success-backdrop";

  const submittedAt = new Date(payload?.updatedAt || Date.now());
  const timeText = submittedAt.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  backdrop.innerHTML = `
    <div class="submission-success-modal" role="dialog" aria-modal="true" aria-labelledby="submissionSuccessTitle">
      <div class="submission-success-icon" aria-hidden="true">✓</div>
      <p class="submission-success-eyebrow">SUBMISSION COMPLETE</p>
      <h2 id="submissionSuccessTitle">Submission Successful</h2>
      <p class="submission-success-copy">Your consultant submission has been saved successfully.</p>

      <div class="submission-success-details">
        <div>
          <span>Project</span>
          <strong>${escapeHtml(payload?.project || "—")}</strong>
        </div>
        <div>
          <span>Revision</span>
          <strong>${escapeHtml(payload?.revision || "—")}</strong>
        </div>
        <div>
          <span>Year</span>
          <strong>${escapeHtml(payload?.year || "—")}</strong>
        </div>
        <div class="submission-success-time">
          <span>Submitted</span>
          <strong>${escapeHtml(timeText)}</strong>
        </div>
      </div>

      <button type="button" class="primary-btn submission-success-done" id="submissionSuccessDone">Done</button>
    </div>`;

  document.body.appendChild(backdrop);
  document.body.classList.add("modal-open");

  const close = () => {
    backdrop.remove();
    document.body.classList.remove("modal-open");
    // Refresh after a successful submission so the Consultant returns to a
    // clean, newly loaded portal state and all saved data is re-read.
    window.location.reload();
  };

  backdrop.addEventListener("click", event => {
    if(event.target === backdrop) close();
  });

  const doneButton = backdrop.querySelector("#submissionSuccessDone");
  doneButton?.addEventListener("click", close);
  doneButton?.focus();
};

var showSubmissionConfirmNotice = function showSubmissionConfirmNotice(){
  const existing = document.getElementById("submissionConfirmBackdrop");
  if(existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "submissionConfirmBackdrop";
  backdrop.className = "modal-backdrop submission-success-backdrop submission-confirm-backdrop";

  const alreadySubmitted = !!currentSelectedSubmissionV31();

  backdrop.innerHTML = `
    <div class="submission-success-modal submission-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="submissionConfirmTitle">
      <button type="button" class="submission-confirm-close" id="submissionConfirmClose" aria-label="Close confirmation">×</button>
      <div class="submission-success-icon submission-confirm-icon" aria-hidden="true">?</div>
      <p class="submission-success-eyebrow submission-confirm-eyebrow">PLEASE CONFIRM</p>
      <h2 id="submissionConfirmTitle">${alreadySubmitted ? "Update This Submission?" : "Submit This Revision?"}</h2>
      <p class="submission-success-copy submission-confirm-copy">
        ${alreadySubmitted
          ? "Your correction will be saved as a new version of this submission. The previous values and drawings will stay in version history, and editing will lock again."
          : "Please confirm the project, revision and year below before sending this submission to Management."}
      </p>

      <div class="submission-success-details submission-confirm-details">
        <div>
          <span>Project</span>
          <strong>${escapeHtml(state.selectedProject || "—")}</strong>
        </div>
        <div>
          <span>Revision</span>
          <strong>${escapeHtml(state.selectedRevision || "—")}</strong>
        </div>
        <div>
          <span>Year</span>
          <strong>${escapeHtml(state.selectedYear || currentMonthYearLabel())}</strong>
        </div>
      </div>

      <div class="submission-confirm-actions">
        <button type="button" class="primary-btn submission-confirm-submit" id="submissionConfirmSubmit">${alreadySubmitted ? "Confirm Update" : "Confirm Submission"}</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  document.body.classList.add("modal-open");

  const close = () => {
    backdrop.remove();
    document.body.classList.remove("modal-open");
  };

  backdrop.addEventListener("click", event => {
    if(event.target === backdrop) close();
  });

  backdrop.querySelector("#submissionConfirmClose")?.addEventListener("click", close);
  backdrop.querySelector("#submissionConfirmSubmit")?.addEventListener("click", () => {
    close();
    saveSubmission({ confirmed: true });
  });

  backdrop.querySelector("#submissionConfirmSubmit")?.focus();
};

var showSubmissionErrorNotice = function showSubmissionErrorNotice(message){
  const existing = document.getElementById("submissionErrorBackdrop");
  if(existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "submissionErrorBackdrop";
  backdrop.className = "modal-backdrop submission-success-backdrop submission-error-backdrop";

  backdrop.innerHTML = `
    <div class="submission-success-modal submission-error-modal" role="alertdialog" aria-modal="true" aria-labelledby="submissionErrorTitle">
      <div class="submission-success-icon submission-error-icon" aria-hidden="true">!</div>
      <p class="submission-success-eyebrow submission-error-eyebrow">SUBMISSION NOT SAVED</p>
      <h2 id="submissionErrorTitle">Unable to Save Submission</h2>
      <p class="submission-success-copy submission-error-copy">${escapeHtml(message || "The submission could not be saved. Your current form values are still on screen.")}</p>
      <div class="submission-error-note">Your current entries have not been cleared, so you can try submitting again.</div>
      <button type="button" class="primary-btn submission-success-done submission-error-done" id="submissionErrorDone">Back to Submission</button>
    </div>`;

  document.body.appendChild(backdrop);
  document.body.classList.add("modal-open");

  const close = () => {
    backdrop.remove();
    document.body.classList.remove("modal-open");
  };

  backdrop.addEventListener("click", event => {
    if(event.target === backdrop) close();
  });

  const doneButton = backdrop.querySelector("#submissionErrorDone");
  doneButton?.addEventListener("click", close);
  doneButton?.focus();
};

var validateSubmission = function validateSubmission(){
  try{
    assertSubmissionSaveAllowedV31();
  }catch(error){
    showSubmissionErrorNotice(error.message);
    updateSubmissionLockState();
    return false;
  }
  if(!hasSelectedProject()){
    alert("Please select a project before filling or submitting.");
    return false;
  }

  if(!state.selectedRegion || !state.selectedBusinessUnit || !state.selectedProject){
    alert("Please choose Region, Business Unit, Select Project and Revision first.");
    return false;
  }
  if(!state.selectedRevision){
    alert("Please choose a revision.");
    return false;
  }
  if(!state.selectedYear){
    alert("Please choose a year.");
    return false;
  }
  if(!state.formData.consultantName?.trim()){
    alert("Please fill in Consultant.");
    return false;
  }

  if(typeof consultantPoundageMissingReasonField === "function"){
    const missingReasonField = consultantPoundageMissingReasonField();
    if(missingReasonField){
      alert(`${poundageFieldLabel(missingReasonField)} requires a remark before submitting.`);
      if(typeof openPoundageCalculator === "function"){
        openPoundageCalculator(missingReasonField);
      }
      return false;
    }
  }

  return true;
};

var saveSubmission = async function saveSubmission(options = {}){
  if(state.submissionSavingV31) return;
  if(!options?.confirmed){
    if(!validateSubmission()) return;
    showSubmissionConfirmNotice();
    return;
  }

  if(!validateSubmission()) return;
  state.submissionSavingV31 = true;

  const submitButton = $("submitBtn");
  const originalText = submitButton?.textContent || "Submit";

  if(submitButton){
    submitButton.disabled = true;
    submitButton.textContent = "Saving…";
  }

  let payload = null;

  try{
    const all = getSubmissions();
    const existing = assertSubmissionSaveAllowedV31(null,all);
    if(window.EcoBackend){
      payload = await window.EcoBackend.saveSubmission(
        buildSubmissionPayload(existing?.id || null),
        existing?.versionNumber || null
      );
    }else{
      const originalRecords = JSON.stringify(all);
      const existingIndex = existing ? all.findIndex(item => item.id === existing.id) : -1;
      payload = finaliseSubmissionVersionV31(buildSubmissionPayload(existing?.id || null),existing);
      await migrateSubmissionDrawingFiles([payload]);
      assertSubmissionSaveAllowedV31(payload,getSubmissions());
      if(existingIndex >= 0) all[existingIndex] = payload;
      else all.unshift(payload);
      await migrateSubmissionDrawingFiles(all.flatMap(item => [item,...(item.previousVersions || [])]));
      const latest = getSubmissions();
      assertSubmissionSaveAllowedV31(payload,latest);
      if(JSON.stringify(latest) !== originalRecords){
        throw new Error("The saved submissions changed while saving. Please reopen your submission and try again.");
      }
      setSubmissions(all);
    }
    state.formData = structuredClone(payload.formData);
    state.editingId = payload.id;
    state.loadedSubmissionTokenV31 = submissionContentTokenV31(payload);
  }catch(error){
    console.error("Submission storage failed:", error);

    const isQuotaError =
      error?.name === "QuotaExceededError" ||
      String(error?.message || "").toLowerCase().includes("quota");

    showSubmissionErrorNotice(
      isQuotaError
        ? "The browser storage limit was reached. Older portal data may still be using too much browser storage. Your current form values are still on screen, so please try submitting again."
        : (error?.message || "The submission could not be saved. Your current form values are still on screen. Please try again.")
    );
    updateSaveStatus("Submission was not saved.");
    return;
  }finally{
    state.submissionSavingV31 = false;
    if(submitButton){
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
    updateSubmissionLockState();
  }

  // The submission is already safely stored at this point. Any rendering issue
  // below is logged separately and must not trigger a false save-failure notice.
  try{
    updateSaveStatus(`Submitted successfully: ${payload.project} · ${payload.revision} · ${payload.year}.`);
    renderOverviewTable();
    renderHistory();
    showSubmissionSuccessNotice(payload);
  }catch(error){
    console.error("Submission saved, but the post-save UI refresh failed:", error);
    updateSaveStatus(`Submitted successfully: ${payload.project} · ${payload.revision} · ${payload.year}.`);
  }
};

var openSubmissionById = function openSubmissionById(submissionId){
  const item = getSubmissions().find(submission =>
    String(submission?.id || "") === String(submissionId || "") &&
    canViewSubmissionV31(submission)
  );

  if(!item){
    console.warn("Submission not found:", submissionId);
    return;
  }

  state.selectedRegion = item.region || "";
  state.selectedBusinessUnit = item.businessUnit || "";
  state.selectedProject = item.project || "";
  state.selectedRevision = item.revision || "Rev 0";

  const savedYear = submissionYearLabel(item);
  state.selectedYear =
    savedYear && savedYear !== "—"
      ? savedYear
      : currentMonthYearLabel();

  state.formData = {
    ...defaultFormData(),
    ...(item.formData ? structuredClone(item.formData) : {})
  };
  state.formData.projectName = state.selectedProject;
  state.editingId = item.id;
  state.loadedSubmissionTokenV31 = submissionContentTokenV31(item);

  // Restore the complete selector chain before rendering the saved form.
  populateRegionSelect();
  if($("regionSelect")) $("regionSelect").value = state.selectedRegion;

  populateBusinessUnitSelect();
  if($("businessUnitSelect")) $("businessUnitSelect").value = state.selectedBusinessUnit;

  populateProjectSelect();
  if($("projectSelect")) $("projectSelect").value = state.selectedProject;

  if($("projectSearchInput")){
    $("projectSearchInput").value = state.selectedProject;
  }

  populateRevisionSelect();
  if($("revisionSelect")) $("revisionSelect").value = state.selectedRevision;

  populateYearSelect();
  if($("yearSelect")) $("yearSelect").value = state.selectedYear;

  updateCurrentSelectionPill();
  renderOverviewTable();
  updateSaveStatus(
    `Loaded ${state.selectedProject} · ${state.selectedRevision} · Version ${Number(item.versionNumber) || 1}. ${canConsultantEditSubmissionV31(item) ? "Editing allowed. Resubmitting will lock this submission again." : "Read only. Management must allow editing before corrections."}`
  );

  showView("overview");

  // Return the Consultant workspace to the top after opening from History.
  const mainShell = $("mainShell");
  if(mainShell && typeof mainShell.scrollTo === "function"){
    mainShell.scrollTo({ top:0, behavior:"smooth" });
  }else{
    window.scrollTo({ top:0, behavior:"smooth" });
  }
};

var permanentlyDeleteSubmissionV141 = async function permanentlyDeleteSubmissionV141(item){
  if(!item) return false;
  // Removing and recreating a locked record would bypass correction approval.
  if(state.auth?.role !== "Management") return false;

  const submissions = getSubmissions();
  const next = submissions.filter(entry => entry.id !== item.id);
  if(window.EcoBackend) await window.EcoBackend.deleteSubmission(item.id);
  else setSubmissions(next);

  // Remove uploaded file blobs as a best-effort cleanup. A failed blob cleanup
  // must not bring the deleted submission back into History.
  const drawingKeys = ["drawingArchitectural", "drawingStructural"];
  const blobIds = [];

  [item,...(item.previousVersions || [])].forEach(version => {
    drawingKeys.forEach(key => {
      const files = Array.isArray(version.formData?.[key]) ? version.formData[key] : (version.formData?.[key] ? [version.formData[key]] : []);
      files.forEach(file => { if(file?.blobId) blobIds.push(file.blobId); });
    });
  });

  if(typeof deleteEcoFileBlob === "function" && blobIds.length){
    const remainingBlobIds = new Set();
    next.flatMap(submission => [submission,...(submission.previousVersions || [])]).forEach(submission => {
      drawingKeys.forEach(key => {
        const files = Array.isArray(submission.formData?.[key])
          ? submission.formData[key]
          : (submission.formData?.[key] ? [submission.formData[key]] : []);
        files.forEach(file => {
          if(file?.blobId) remainingBlobIds.add(file.blobId);
        });
      });
    });

    const orphanedBlobIds = [...new Set(blobIds)].filter(blobId => !remainingBlobIds.has(blobId));
    await Promise.allSettled(orphanedBlobIds.map(blobId => deleteEcoFileBlob(blobId)));
  }

  if(state.editingId === item.id){
    state.editingId = null;
  }

  renderHistory();
  if(typeof renderManagementOverview === "function"){
    renderManagementOverview();
  }
  return true;
};

var showDeleteSubmissionConfirmV141 = function showDeleteSubmissionConfirmV141(item, onDeleted){
  if(state.auth?.role !== "Management") return;
  const old = document.getElementById("submissionDeleteBackdrop");
  if(old) old.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "submissionDeleteBackdrop";
  backdrop.className = "modal-backdrop submission-success-backdrop submission-delete-backdrop";

  backdrop.innerHTML = `
    <div class="submission-success-modal submission-confirm-modal submission-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="submissionDeleteTitle">
      <button type="button" class="submission-confirm-close submission-delete-close" id="submissionDeleteClose" aria-label="Close deletion confirmation">×</button>
      <div class="submission-success-icon submission-delete-icon" aria-hidden="true">!</div>
      <p class="submission-success-eyebrow submission-delete-eyebrow">PLEASE CONFIRM</p>
      <h2 id="submissionDeleteTitle">Delete Submission?</h2>
      <p class="submission-success-copy submission-delete-copy">This submission will be removed from History and Internal review.</p>

      <div class="submission-success-details submission-confirm-details">
        <div>
          <span>Project</span>
          <strong>${escapeHtml(item.project || "—")}</strong>
        </div>
        <div>
          <span>Revision</span>
          <strong>${escapeHtml(item.revision || "—")}</strong>
        </div>
        <div>
          <span>Year</span>
          <strong>${escapeHtml(submissionYearLabel(item))}</strong>
        </div>
      </div>

      <div class="submission-confirm-actions submission-delete-actions">
        <button type="button" class="ghost-btn" id="submissionDeleteCancel">Cancel</button>
        <button type="button" class="primary-btn submission-delete-submit" id="submissionDeleteSubmit">Delete Submission</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  document.body.classList.add("modal-open");

  const close = () => {
    backdrop.remove();
    if(!document.querySelector(".modal-backdrop:not(.hidden)")){
      document.body.classList.remove("modal-open");
    }
  };

  backdrop.addEventListener("click", event => {
    if(event.target === backdrop) close();
  });

  backdrop.querySelector("#submissionDeleteClose")?.addEventListener("click", close);
  backdrop.querySelector("#submissionDeleteCancel")?.addEventListener("click", close);
  backdrop.querySelector("#submissionDeleteSubmit")?.addEventListener("click", async () => {
    const button = backdrop.querySelector("#submissionDeleteSubmit");
    if(button){
      button.disabled = true;
      button.textContent = "Deleting…";
    }

    try{
      await permanentlyDeleteSubmissionV141(item);
      close();
      if(typeof onDeleted === "function"){
        onDeleted(item);
      }
    }catch(error){
      console.error("Unable to delete submission", error);
      if(button){
        button.disabled = false;
        button.textContent = "Delete Submission";
      }
      if(typeof showSubmissionErrorNotice === "function"){
        close();
        showSubmissionErrorNotice("The submission could not be deleted. Please try again.");
      }
    }
  });

  backdrop.querySelector("#submissionDeleteSubmit")?.focus();
};

var deleteSubmissionById = function deleteSubmissionById(id){
  if(state.auth?.role !== "Management") return;
  const item = getSubmissions().find(entry => entry.id === id);
  if(!item) return;

  showDeleteSubmissionConfirmV141(item);
};

var renderHistory = function renderHistory(){
  const list = $("historyList");
  const items = getSubmissions()
    .filter(canViewSubmissionV31)
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  $("historyCountPill").textContent = `${items.length} submission${items.length === 1 ? "" : "s"}`;

  if(!items.length){
    list.innerHTML = `
      <div class="empty-state compact-card">
        <div>
          <div class="empty-icon">🕘</div>
          <strong>No submissions yet</strong>
          <span>Submit from Submission and the history will appear here.</span>
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = items.map(item => {
    const updated = new Date(item.updatedAt);
    const dateText = updated.toLocaleString();
    return `
      <div class="history-card">
        <div class="history-card-top">
          <div>
            <h3>${escapeHtml(item.project || "Untitled Project")}</h3>
            <div class="history-meta">
              <span class="meta-chip">${escapeHtml(item.region || "—")}</span>
              <span class="meta-chip">${escapeHtml(item.businessUnit || "—")}</span>
              <span class="meta-chip">${escapeHtml(item.revision || "—")}</span>
              <span class="meta-chip">${escapeHtml(submissionYearLabel(item))}</span>
              <span class="meta-chip">${item.editAccess?.allowed ? "Editing allowed" : "Locked"}</span>
            </div>
          </div>
          <span class="badge">${escapeHtml(dateText)}</span>
        </div>

        <div class="history-actions">
          <button class="small-btn soft" type="button" data-open-submission="${escapeHtml(item.id)}">${canConsultantEditSubmissionV31(item) ? "Edit & resubmit" : "View submission"}</button>
          ${state.auth?.role === "Management" ? `<button class="small-btn danger" type="button" data-delete-submission="${escapeHtml(item.id)}">Delete</button>` : ""}
        </div>
      </div>
    `;
  }).join("");
};





let activeDrawingUploadsV147 = 0;
;

/* ---- js/consultant/loading-capacity.js ---- */
var managementPileReference = function managementPileReference(){
  const stored = loadStorage(
    ECO_FRESH_STORAGE.pileReference ||
      "eco_fresh_management_pile_reference_v1",
    null
  );

  if(Array.isArray(stored) && stored.length){
    return stored;
  }

  return MANAGEMENT_PILE_CAPACITY_REFERENCE.map(item => ({...item}));
};

var pileTypesFromManagementReference = function pileTypesFromManagementReference(){
  return [
    ...new Set(
      managementPileReference()
        .map(item => item.pileType)
        .filter(Boolean)
    )
  ];
};

var pileSizesFromManagementReference = function pileSizesFromManagementReference(pileType){
  return managementPileReference()
    .filter(item => item.pileType === pileType)
    .map(item => String(item.pileSize))
    .filter(Boolean);
};

var findManagementPileCapacity = function findManagementPileCapacity(pileType, pileSize){
  const match = managementPileReference().find(item =>
    item.pileType === pileType &&
    String(item.pileSize) === String(pileSize)
  );

  return match
    ? Number(match.pileCapacity)
    : null;
};

var createBlankLoadingRow = function createBlankLoadingRow(){
  const pileType =
    pileTypesFromManagementReference()[0] ||
    "Spun Piles";

  const pileSize =
    pileSizesFromManagementReference(pileType)[0] ||
    "";

  return {
    columnNumber: "",
    pileType,
    pileSize,
    numberOfPiles: "",
    columnLoading: ""
  };
};

var formatLoadingNumber = function formatLoadingNumber(value, digits = 2){
  if(value === null || value === undefined || !Number.isFinite(Number(value))){
    return "—";
  }

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits
  });
};

var formatLoadingEfficiency = function formatLoadingEfficiency(value){
  if(value === null || value === undefined || !Number.isFinite(Number(value))){
    return "—";
  }
  return `${(Number(value) * 100).toFixed(1)}%`;
};

var loadingEfficiencyClass = function loadingEfficiencyClass(value){
  if(value === null || value === undefined || !Number.isFinite(Number(value))){
    return "";
  }

  const efficiency = Number(value);

  // Below 80% = over-designed / optimisation required.
  if(efficiency < PILE_EFFICIENCY_TARGET_MIN) return "efficiency-low";

  // 80% to 90% = within the accepted efficiency range.
  if(efficiency <= PILE_EFFICIENCY_TARGET_MAX) return "efficiency-good";

  // Above 90% = outside the target range; above 100% also exceeds pile capacity.
  return "efficiency-high";
};

var renderLoadingCapacityModal = function renderLoadingCapacityModal(){
  const rows = ensureLoadingCapacityRows();
  const body = $("loadingCapacityTableBody");

  if(!rows.length){
    body.innerHTML = `
      <tr>
        <td colspan="9" class="loading-empty-row">
          No rows yet. Add a row or paste data from Excel.
        </td>
      </tr>
    `;
  }else{
    body.innerHTML = rows.map((row, index) => {
      const calc = loadingRowCalculation(row);

      return `
        <tr>
          <td>
            <input
              type="text"
              value="${escapeHtml(row.columnNumber || "")}"
              data-loading-index="${index}"
              data-loading-field="columnNumber"
              placeholder="C1"
            />
          </td>

          <td>
            <select
              data-loading-index="${index}"
              data-loading-field="pileType"
            >
              ${pileTypesFromManagementReference().map(type => `
                <option value="${type}" ${row.pileType === type ? "selected" : ""}>${type}</option>
              `).join("")}
            </select>
          </td>

          <td>
            <select
              data-loading-index="${index}"
              data-loading-field="pileSize"
            >
              ${pileSizesFromManagementReference(row.pileType).map(size => `
                <option value="${size}" ${String(row.pileSize) === String(size) ? "selected" : ""}>${size}</option>
              `).join("")}
            </select>
          </td>

          <td>
            <input
              type="number"
              min="0"
              value="${escapeHtml(row.numberOfPiles || "")}"
              data-loading-index="${index}"
              data-loading-field="numberOfPiles"
              placeholder="4"
            />
          </td>

          <td class="calculated-cell management-reference-cell">
            <strong>${formatLoadingNumber(calc.capacityPerPile)}</strong>
          </td>

          <td class="calculated-cell">
            ${formatLoadingNumber(calc.totalCapacity)}
          </td>

          <td>
            <input
              type="number"
              min="0"
              step="0.01"
              value="${escapeHtml(row.columnLoading || "")}"
              data-loading-index="${index}"
              data-loading-field="columnLoading"
              placeholder="6500"
            />
          </td>

          <td class="calculated-cell ${loadingEfficiencyClass(calc.efficiency)}">
            ${formatLoadingEfficiency(calc.efficiency)}
          </td>

          <td class="loading-remove-cell">
            <button
              type="button"
              class="loading-remove-btn"
              data-remove-loading-row="${index}"
              aria-label="Remove row"
            >×</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  const totals = syncLoadingSummaryToForm();

  $("modalTotalColumnLoading").textContent =
    `${formatLoadingNumber(totals.totalLoading)} kN`;

  $("modalTotalPilesCapacity").textContent =
    `${formatLoadingNumber(totals.totalCapacity)} kN`;

  $("modalOverallPileEfficiency").textContent =
    totals.overallEfficiency === null
      ? "—"
      : formatLoadingEfficiency(totals.overallEfficiency);

  $("loadingFooterTotalPiles").textContent =
    formatLoadingNumber(totals.totalPiles, 0);

  $("loadingFooterCapacity").textContent =
    formatLoadingNumber(totals.totalCapacity);

  $("loadingFooterLoading").textContent =
    formatLoadingNumber(totals.totalLoading);

  $("loadingFooterEfficiency").textContent =
    totals.overallEfficiency === null
      ? "—"
      : formatLoadingEfficiency(totals.overallEfficiency);
  refreshSubmissionModalPermissionsV31();
};

var openLoadingCapacityModal = function openLoadingCapacityModal(){
  if(!hasSelectedProject()){
    alert("Select a project first.");
    return;
  }

  ensureLoadingCapacityRows();
  renderLoadingCapacityModal();
  $("loadingCapacityModal").classList.remove("hidden");
  document.body.classList.add("modal-open");
};

var closeLoadingCapacityModal = function closeLoadingCapacityModal(){
  $("loadingCapacityModal").classList.add("hidden");
  document.body.classList.remove("modal-open");
};

var addLoadingCapacityRow = function addLoadingCapacityRow(){
  if(!canEditCurrentSubmissionV31()) return;
  ensureLoadingCapacityRows().push(createBlankLoadingRow());
  renderLoadingCapacityModal();
};

var removeLoadingCapacityRow = function removeLoadingCapacityRow(index){
  if(!canEditCurrentSubmissionV31()) return;
  const rows = ensureLoadingCapacityRows();
  rows.splice(index, 1);
  renderLoadingCapacityModal();
};

var updateLoadingCapacityRow = function updateLoadingCapacityRow(index, field, value){
  if(!canEditCurrentSubmissionV31()) return;
  const rows = ensureLoadingCapacityRows();
  const row = rows[index];
  if(!row) return;

  row[field] = value;

  if(field === "pileType"){
    const availableSizes =
      pileSizesFromManagementReference(value);

    row.pileSize =
      availableSizes.includes(String(row.pileSize))
        ? String(row.pileSize)
        : (availableSizes[0] || "");
  }

  renderLoadingCapacityModal();
};

var normalisePastedPileType = function normalisePastedPileType(value){
  const text = String(value || "").trim().toLowerCase();

  if(text.includes("bored")) return "Bored Piles";
  if(text.includes("spun")) return "Spun Piles";
  if(text.includes("rc")) return "RC Piles";

  return value || "Spun Piles";
};

var isExcelLoadingHeaderRow = function isExcelLoadingHeaderRow(cells){
  const joined = cells
    .map(cell => String(cell || "").trim().toLowerCase())
    .join(" ");

  return (
    joined.includes("column numbering") ||
    joined.includes("column no") ||
    (
      joined.includes("pile size") &&
      joined.includes("column loading")
    )
  );
};

var normalisePastedPileSize = function normalisePastedPileSize(pileType, value){
  const requested = String(value || "").trim();
  const sizes = pileSizesFromManagementReference(pileType);

  if(sizes.includes(requested)){
    return requested;
  }

  return requested || sizes[0] || "";
};

var parseExcelLoadingRows = function parseExcelLoadingRows(rawText){
  const text = String(rawText || "").trim();
  if(!text) return [];

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const parsedRows = [];

  lines.forEach(line => {
    const cells = line.includes("\t")
      ? line.split("\t").map(cell => cell.trim())
      : line.split(",").map(cell => cell.trim());

    if(!cells.length || isExcelLoadingHeaderRow(cells)){
      return;
    }

    const pileType =
      normalisePastedPileType(cells[1]);

    let columnLoading = "";

    // New recommended format:
    // Column | Type | Size | No Piles | Column Loading
    if(cells.length === 5){
      columnLoading = cells[4] || "";
    }
    // Old compact V9/V10 format:
    // Column | Type | Size | No Piles | Capacity/Pile | Column Loading
    else if(cells.length === 6){
      columnLoading = cells[5] || "";
    }
    // Full copied table:
    // Column | Type | Size | No Piles | Capacity/Pile |
    // Total Capacity | Column Loading | Efficiency
    else if(cells.length >= 7){
      columnLoading = cells[6] || "";
    }

    const row = {
      columnNumber: cells[0] || "",
      pileType,
      pileSize:
        normalisePastedPileSize(
          pileType,
          cells[2]
        ),
      numberOfPiles: cells[3] || "",
      columnLoading
    };

    const hasUsefulValue = Object.values(row).some(
      value => String(value || "").trim() !== ""
    );

    if(hasUsefulValue){
      parsedRows.push(row);
    }
  });

  return parsedRows;
};

var importExcelLoadingRows = function importExcelLoadingRows(){
  if(!canEditCurrentSubmissionV31()) return;
  const rows = parseExcelLoadingRows(
    $("excelPasteInput").value
  );

  if(!rows.length){
    alert("Paste at least one Excel row first.");
    return;
  }

  state.formData.loadingCapacityRows = rows;
  renderLoadingCapacityModal();
  $("excelPastePanel").classList.add("hidden");
  $("excelPasteInput").value = "";
};

var applyLoadingCapacityToSubmission = function applyLoadingCapacityToSubmission(){
  if(!canEditCurrentSubmissionV31()) return;
  syncLoadingSummaryToForm();
  renderOverviewTable();
  updateSaveStatus("Loading & capacity table updated.");
  closeLoadingCapacityModal();
};


;

/* ---- js/consultant/poundage.js ---- */
var isConsultantPoundageCalculatedField = function isConsultantPoundageCalculatedField(fieldKey){
  return CONSULTANT_POUNDAGE_CALCULATED_FIELDS.has(fieldKey);
};

var consultantPoundageBuildingTypeKey = function consultantPoundageBuildingTypeKey(){
  return String(state.formData.buildingType || "")
    .trim()
    .toLowerCase() === "landed"
      ? "landed"
      : "highRise";
};

var consultantPoundageGuide = function consultantPoundageGuide(fieldKey){
  const typeKey = consultantPoundageBuildingTypeKey();
  return CONSULTANT_POUNDAGE_GUIDES[typeKey]?.[fieldKey] || null;
};

var consultantPoundageExceedsGuide = function consultantPoundageExceedsGuide(fieldKey, value){
  const guide = consultantPoundageGuide(fieldKey);
  const numericValue = Number(value);

  return !!(
    guide &&
    Number.isFinite(guide.max) &&
    Number.isFinite(numericValue) &&
    numericValue > guide.max
  );
};

var ensurePoundageDetailsStore = function ensurePoundageDetailsStore(){
  if(
    !state.formData.poundageDetails ||
    typeof state.formData.poundageDetails !== "object" ||
    Array.isArray(state.formData.poundageDetails)
  ){
    state.formData.poundageDetails = {};
  }

  return state.formData.poundageDetails;
};

var getPoundageDetail = function getPoundageDetail(fieldKey){
  const store = ensurePoundageDetailsStore();
  const existing = store[fieldKey];

  if(!existing || typeof existing !== "object"){
    store[fieldKey] = {
      steelWeight: "",
      concreteVolume: "",
      exceedReason: ""
    };
  }else if(typeof existing.exceedReason !== "string"){
    existing.exceedReason = "";
  }

  return store[fieldKey];
};

var poundageFieldLabel = function poundageFieldLabel(fieldKey){
  for(const section of OVERVIEW_SECTIONS){
    if(section.title !== "Poundage") continue;
    const row = section.rows.find(item => item.key === fieldKey);
    if(row){
      return consultantPoundageRowLabel(fieldKey, row.label);
    }
  }

  return "Poundage";
};

var calculatePoundageValue = function calculatePoundageValue(steelWeight, concreteVolume){
  const steel = Number(steelWeight);
  const concrete = Number(concreteVolume);

  if(
    !Number.isFinite(steel) ||
    !Number.isFinite(concrete) ||
    steel < 0 ||
    concrete <= 0
  ){
    return null;
  }

  return steel / concrete;
};

var setPoundageExceedanceUI = function setPoundageExceedanceUI(fieldKey, value){
  const warning = $("poundageExceedWarning");
  const reasonInput = $("poundageExceedReasonInput");
  const resultEl = $("poundageCalculatedResult");
  const resultPanel = resultEl?.closest(".poundage-result-panel");

  const isExceeding = consultantPoundageExceedsGuide(fieldKey, value);

  if(resultEl){
    resultEl.classList.toggle("poundage-result-exceeded", isExceeding);
  }
  if(resultPanel){
    resultPanel.classList.toggle("is-exceeding", isExceeding);
  }
  if(warning){
    warning.classList.toggle("hidden", !isExceeding);
  }

  if(!isExceeding && reasonInput){
    reasonInput.setAttribute("aria-required", "false");
  }else if(reasonInput){
    reasonInput.setAttribute("aria-required", "true");
  }

  return isExceeding;
};

var updatePoundageCalculatorPreview = function updatePoundageCalculatorPreview(){
  const steelInput = $("poundageSteelWeightInput");
  const concreteInput = $("poundageConcreteVolumeInput");
  const resultEl = $("poundageCalculatedResult");
  const errorEl = $("poundageCalculatorError");

  if(!steelInput || !concreteInput || !resultEl || !errorEl) return;

  errorEl.textContent = "";

  const steelRaw = steelInput.value;
  const concreteRaw = concreteInput.value;

  if(steelRaw === "" || concreteRaw === ""){
    resultEl.textContent = "—";
    setPoundageExceedanceUI(activePoundageCalculatorField, null);
    return;
  }

  const concrete = Number(concreteRaw);
  if(!Number.isFinite(concrete) || concrete <= 0){
    resultEl.textContent = "—";
    setPoundageExceedanceUI(activePoundageCalculatorField, null);
    errorEl.textContent = "Concrete Volume must be greater than 0 m³.";
    return;
  }

  const value = calculatePoundageValue(steelRaw, concreteRaw);
  if(value === null){
    resultEl.textContent = "—";
    setPoundageExceedanceUI(activePoundageCalculatorField, null);
    errorEl.textContent = "Enter valid non-negative values.";
    return;
  }

  resultEl.textContent = `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} kg/m³`;

  setPoundageExceedanceUI(activePoundageCalculatorField, value);
};

var openPoundageCalculator = function openPoundageCalculator(fieldKey){
  if(!isConsultantPoundageCalculatedField(fieldKey)) return;

  if(!hasSelectedProject()){
    alert("Select a project first.");
    return;
  }

  activePoundageCalculatorField = fieldKey;
  const detail = getPoundageDetail(fieldKey);

  const modalTitle = poundageFieldLabel(fieldKey)
    .replace(/\s*,\s*kg\/m³\s*$/i, "")
    .replace(/\s*\(kg\/m³\)\s*$/i, "");
  $("poundageCalculatorTitle").textContent = modalTitle;
  $("poundageCalculatorSubtitle").textContent = canEditCurrentSubmissionV31() ? "" : "Read only · submitted calculation";
  $("poundageSteelWeightInput").value = detail.steelWeight ?? "";
  $("poundageConcreteVolumeInput").value = detail.concreteVolume ?? "";
  $("poundageExceedReasonInput").value = detail.exceedReason ?? "";
  $("poundageCalculatorError").textContent = "";

  updatePoundageCalculatorPreview();
  $("poundageCalculatorModal").classList.remove("hidden");
  refreshSubmissionModalPermissionsV31();

  requestAnimationFrame(() => {
    $("poundageSteelWeightInput").focus();
  });
};

var closePoundageCalculator = function closePoundageCalculator(){
  $("poundageCalculatorModal").classList.add("hidden");
  activePoundageCalculatorField = "";
  $("poundageCalculatorError").textContent = "";
};

var consultantPoundageMissingReasonField = function consultantPoundageMissingReasonField(){
  for(const fieldKey of CONSULTANT_POUNDAGE_CALCULATED_FIELDS){
    const value = state.formData[fieldKey];
    if(!consultantPoundageExceedsGuide(fieldKey, value)) continue;

    const reason = getPoundageDetail(fieldKey).exceedReason;
    if(!String(reason || "").trim()){
      return fieldKey;
    }
  }

  return "";
};

var applyPoundageCalculation = function applyPoundageCalculation(){
  if(!canEditCurrentSubmissionV31()) return;
  const fieldKey = activePoundageCalculatorField;
  if(!isConsultantPoundageCalculatedField(fieldKey)) return;

  const steelRaw = $("poundageSteelWeightInput").value;
  const concreteRaw = $("poundageConcreteVolumeInput").value;
  const reasonRaw = $("poundageExceedReasonInput").value.trim();
  const errorEl = $("poundageCalculatorError");

  if(steelRaw === "" || concreteRaw === ""){
    errorEl.textContent = "Please fill in both Steel Weight and Concrete Volume.";
    return;
  }

  const value = calculatePoundageValue(steelRaw, concreteRaw);
  if(value === null){
    errorEl.textContent = "Concrete Volume must be greater than 0 m³ and both values must be valid.";
    return;
  }

  const isExceeding = consultantPoundageExceedsGuide(fieldKey, value);
  if(isExceeding && !reasonRaw){
    errorEl.textContent = "Remark is required.";
    $("poundageExceedReasonInput").focus();
    return;
  }

  const store = ensurePoundageDetailsStore();
  store[fieldKey] = {
    steelWeight: steelRaw,
    concreteVolume: concreteRaw,
    exceedReason: isExceeding ? reasonRaw : "",
    exceeded: isExceeding
  };

  state.formData[fieldKey] = Number(value.toFixed(2));

  closePoundageCalculator();
  renderOverviewTable();
  updateSaveStatus(
    isExceeding
      ? `${poundageFieldLabel(fieldKey)} exceeds the internal reference. Remark recorded.`
      : `${poundageFieldLabel(fieldKey)} calculated automatically.`
  );
};

var bindPoundageCalculatorEvents = function bindPoundageCalculatorEvents(){
  $("overviewTableBody").addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-poundage-calculator]");
    if(!trigger) return;

    openPoundageCalculator(trigger.dataset.openPoundageCalculator);
  });

  ["poundageSteelWeightInput", "poundageConcreteVolumeInput"].forEach(id => {
    $(id).addEventListener("input", updatePoundageCalculatorPreview);
  });

  $("applyPoundageCalculation").addEventListener("click", applyPoundageCalculation);
  $("closePoundageCalculatorModal").addEventListener("click", closePoundageCalculator);
  $("cancelPoundageCalculatorModal").addEventListener("click", closePoundageCalculator);

  $("poundageCalculatorModal").addEventListener("click", (event) => {
    if(event.target === $("poundageCalculatorModal")){
      closePoundageCalculator();
    }
  });
};

const CONSULTANT_POUNDAGE_CALCULATED_FIELDS = new Set([
  "poundageRcColumn",
  "poundageRcBeamCarpark",
  "poundageRcBeamTypical",
  "poundageRcSlab",
  "poundageShearWall",
  "poundageOverall"
]);

const CONSULTANT_POUNDAGE_GUIDES = {
  highRise: {
    poundageRcColumn: { text: "200 – 250 kg/m³", max: 250 },
    poundageRcBeamCarpark: { text: "200 – 225 kg/m³", max: 225 },
    poundageRcBeamTypical: { text: "25 – 140 kg/m³", max: 140 },
    // The row allows BRC or rebar. Use the highest permitted guide ceiling.
    poundageRcSlab: { text: "50 – 60 (BRC) / 70 – 90 (rebar) kg/m³", max: 90 },
    poundageShearWall: { text: "100 – 105 kg/m³", max: 105 },
    poundageOverall: null
  },
  landed: {
    poundageRcColumn: { text: "150 – 215 kg/m³", max: 215 },
    poundageRcBeamCarpark: { text: "115 – 150 kg/m³", max: 150 },
    poundageRcBeamTypical: null,
    // The row allows BRC or rebar. Use the highest permitted guide ceiling.
    poundageRcSlab: { text: "60 – 60 (BRC) / 70 – 90 (rebar) kg/m³", max: 90 },
    poundageShearWall: null,
    poundageOverall: { text: "90 – 100 kg/m³", max: 100 }
  }
};

let activePoundageCalculatorField = "";
;

/* ---- js/consultant/access-control.js ---- */
var accessPortalHierarchyV139 = function accessPortalHierarchyV139(){
  const regionBusinessUnits =
    typeof getConfiguredRegionBusinessUnits === "function"
      ? getConfiguredRegionBusinessUnits()
      : REGION_BUSINESS_UNITS;

  const businessUnitProjects =
    typeof getConfiguredBusinessUnitProjects === "function"
      ? getConfiguredBusinessUnitProjects()
      : BUSINESS_UNIT_PROJECTS;

  return { regionBusinessUnits, businessUnitProjects };
};

var consultantProjectAccessKeyV139 = function consultantProjectAccessKeyV139(region,businessUnit,project){
  return [region,businessUnit,project]
    .map(value => String(value || "").trim())
    .join("|||" );
};

var allPortalProjectEntriesV139 = function allPortalProjectEntriesV139(){
  const { regionBusinessUnits, businessUnitProjects } = accessPortalHierarchyV139();
  const entries = [];

  Object.entries(regionBusinessUnits || {}).forEach(([region,businessUnits]) => {
    (businessUnits || []).forEach(businessUnit => {
      (businessUnitProjects?.[businessUnit] || []).forEach(project => {
        entries.push({
          region,
          businessUnit,
          project,
          key: consultantProjectAccessKeyV139(region,businessUnit,project)
        });
      });
    });
  });

  return entries;
};

var defaultConsultantAccessSettingsV139 = function defaultConsultantAccessSettingsV139(){
  const allKeys = allPortalProjectEntriesV139().map(item => item.key);
  const accounts = {};
  const accountOrder = [];

  CONSULTANT_ACCOUNT_DEFINITIONS.forEach(account => {
    accounts[account.id] = {
      id: account.id,
      name: account.name,
      email: account.email,
      password: "",
      active: true,
      builtin: false,
      projectKeys: [...allKeys]
    };
    accountOrder.push(account.id);
  });

  return { version:2, accounts, accountOrder };
};

var normaliseStoredConsultantAccountV144 = function normaliseStoredConsultantAccountV144(id,saved,fallback=null){
  const base = fallback || {};
  const projectKeys = Array.isArray(saved?.projectKeys)
    ? [...new Set(saved.projectKeys.map(String))]
    : Array.isArray(base.projectKeys)
      ? [...base.projectKeys]
      : [];

  return {
    id,
    name: String(saved?.name ?? base.name ?? "Consultant").trim() || "Consultant",
    email: String(saved?.email ?? base.email ?? "").trim().toLowerCase(),
    password: String(saved?.password ?? base.password ?? ""),
    active: saved?.active !== undefined ? !!saved.active : (base.active !== undefined ? !!base.active : true),
    builtin: saved?.builtin !== undefined ? !!saved.builtin : !!base.builtin,
    projectKeys
  };
};

var getConsultantAccessSettings = function getConsultantAccessSettings(){
  const defaults = defaultConsultantAccessSettingsV139();
  const stored = loadStorage(ECO_FRESH_STORAGE.consultantAccess, null);

  // First run only: no consultants are seeded by default. Once Internal
  // saves the account list (adding consultants via the Management page),
  // the stored list becomes the source of truth.
  if(!stored?.accounts){
    return defaults;
  }

  const accounts = {};
  const accountOrder = [];
  const storedOrder = Array.isArray(stored.accountOrder)
    ? stored.accountOrder.map(String)
    : Object.keys(stored.accounts || {});

  storedOrder.forEach(id => {
    if(!stored.accounts?.[id] || accounts[id]) return;
    const fallback = defaults.accounts?.[id] || null;
    accounts[id] = normaliseStoredConsultantAccountV144(id,stored.accounts[id],fallback);
    accounts[id].builtin = false;
    accountOrder.push(id);
  });

  Object.keys(stored.accounts || {}).forEach(id => {
    if(accounts[id]) return;
    const fallback = defaults.accounts?.[id] || null;
    accounts[id] = normaliseStoredConsultantAccountV144(id,stored.accounts[id],fallback);
    accounts[id].builtin = false;
    accountOrder.push(id);
  });

  return { version:3, accounts, accountOrder };
};

var saveConsultantAccessSettings = async function saveConsultantAccessSettings(settings){
  if(window.EcoBackend) return await window.EcoBackend.saveAccounts(settings);
  const clean = {
    version:3,
    accounts: settings?.accounts || {},
    accountOrder: Array.isArray(settings?.accountOrder)
      ? [...settings.accountOrder]
      : Object.keys(settings?.accounts || {})
  };
  saveStorage(ECO_FRESH_STORAGE.consultantAccess, clean);
};

var consultantAccountsInOrderV144 = function consultantAccountsInOrderV144(settings=getConsultantAccessSettings()){
  const order = Array.isArray(settings.accountOrder)
    ? settings.accountOrder
    : Object.keys(settings.accounts || {});
  return order.map(id => settings.accounts?.[id]).filter(Boolean);
};

var currentConsultantAccountId = function currentConsultantAccountId(){
  if(state.auth?.role !== "Consultant") return "";
  return state.auth?.accountId || "jsw";
};

var currentConsultantAccountConfig = function currentConsultantAccountConfig(){
  const id = currentConsultantAccountId();
  return getConsultantAccessSettings().accounts?.[id] || null;
};

var currentConsultantDisplayName = function currentConsultantDisplayName(){
  if(state.auth?.role !== "Consultant") return "";
  const config = currentConsultantAccountConfig();
  return config?.name || state.auth?.name || "External";
};

var normaliseConsultantAuth = function normaliseConsultantAuth(auth){
  if(!auth || auth.role !== "Consultant") return auth;

  const settings = getConsultantAccessSettings();
  let account = auth.accountId ? settings.accounts?.[auth.accountId] : null;

  // An explicit deleted account must never become another consultant's session.
  if(auth.accountId && !account) return null;

  if(!account && auth.email){
    account = consultantAccountsInOrderV144(settings).find(item =>
      item.email.toLowerCase() === String(auth.email || "").toLowerCase()
    );
  }

  // Legacy single-consultant sessions remain mapped to JSW.
  if(!account && !auth.accountId && !auth.email){
    account = settings.accounts?.jsw || consultantAccountsInOrderV144(settings)[0];
  }

  if(!account || !account.active) return null;

  return {
    ...auth,
    accountId:account.id,
    email:account.email || auth.email,
    name:account.name,
    role:"Consultant"
  };
};

var submissionOwnerAccountIdV139 = function submissionOwnerAccountIdV139(item){
  return item?.consultantAccountId || "jsw";
};

var submissionBelongsToCurrentConsultant = function submissionBelongsToCurrentConsultant(item){
  if(state.auth?.role !== "Consultant") return true;
  return submissionOwnerAccountIdV139(item) === currentConsultantAccountId();
};

var consultantCanAccessProjectV139 = function consultantCanAccessProjectV139(region,businessUnit,project){
  if(state.auth?.role !== "Consultant") return true;
  const config = currentConsultantAccountConfig();
  if(!config || !config.active) return false;
  const key = consultantProjectAccessKeyV139(region,businessUnit,project);
  return config.projectKeys.includes(key);
};

var getConsultantAccessibleBusinessUnitProjects = function getConsultantAccessibleBusinessUnitProjects(){
  const { regionBusinessUnits, businessUnitProjects } = accessPortalHierarchyV139();
  const output = {};

  Object.entries(regionBusinessUnits || {}).forEach(([region,businessUnits]) => {
    (businessUnits || []).forEach(businessUnit => {
      const projects = (businessUnitProjects?.[businessUnit] || []).filter(project =>
        consultantCanAccessProjectV139(region,businessUnit,project)
      );
      if(projects.length){
        output[businessUnit] = projects;
      }
    });
  });

  return output;
};

var getConsultantAccessibleRegionBusinessUnits = function getConsultantAccessibleRegionBusinessUnits(){
  const { regionBusinessUnits } = accessPortalHierarchyV139();
  const projectMap = getConsultantAccessibleBusinessUnitProjects();
  const output = {};

  Object.entries(regionBusinessUnits || {}).forEach(([region,businessUnits]) => {
    const allowed = (businessUnits || []).filter(businessUnit =>
      Array.isArray(projectMap[businessUnit]) && projectMap[businessUnit].length
    );
    if(allowed.length){
      output[region] = allowed;
    }
  });

  return output;
};

var findPortalLoginAccountV144 = function findPortalLoginAccountV144(email,password){
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPassword = String(password || "");

  const management = DEMO_ACCOUNTS.management;
  if(
    management &&
    management.email.toLowerCase() === cleanEmail &&
    management.password === cleanPassword
  ){
    return management;
  }

  const account = consultantAccountsInOrderV144().find(item =>
    item.active &&
    item.email &&
    item.email.toLowerCase() === cleanEmail &&
    item.password === cleanPassword
  );

  return account
    ? {
        id:account.id,
        name:account.name,
        email:account.email,
        password:account.password,
        role:"Consultant"
      }
    : null;
};

var cloneConsultantAccessV139 = function cloneConsultantAccessV139(value){
  return JSON.parse(JSON.stringify(value));
};

var newConsultantAccountIdV144 = function newConsultantAccountIdV144(){
  return `consultant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
};

var validateConsultantAccessDraftV144 = function validateConsultantAccessDraftV144(){
  const accounts = consultantAccountsInOrderV144(consultantAccessDraftV139);
  const emails = new Set();

  for(const account of accounts){
    account.name = String(account.name || "").trim();
    account.email = String(account.email || "").trim().toLowerCase();
    account.password = String(account.password || "");

    if(!account.name){
      return {ok:false,id:account.id,message:"Account name is required."};
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)){
      return {ok:false,id:account.id,message:`Enter a valid login email for ${account.name}.`};
    }
    if(account.email === String(DEMO_ACCOUNTS.management.email).toLowerCase()){
      return {ok:false,id:account.id,message:"This email is already used by the Internal account."};
    }
    if(emails.has(account.email)){
      return {ok:false,id:account.id,message:"Each consultant must use a unique login email."};
    }
    emails.add(account.email);
    const existingAccount = window.EcoBackend?.accounts()?.accounts?.[account.id];
    if((!existingAccount || account.password) && account.password.length < 8){
      return {ok:false,id:account.id,message:`Temporary password for ${account.name} must contain at least 8 characters.`};
    }
  }

  return {ok:true};
};

/* Consultant accounts, authentication and project access */

let consultantAccessDraftV139 = null;
let consultantAccessActiveIdV139 = "jsw";
;

/* ---- js/consultant/submission-permissions.js ---- */
var submissionOwnerV31 = function submissionOwnerV31(item){
  return String(item?.consultantAccountId || "jsw");
};

var submissionIdentityV31 = function submissionIdentityV31(item){
  return JSON.stringify([
    item?.region || "", item?.businessUnit || "", item?.project || "",
    item?.revision || "", submissionOwnerV31(item)
  ]);
};

var selectedSubmissionIdentityV31 = function selectedSubmissionIdentityV31(){
  return submissionIdentityV31({
    region:state.selectedRegion, businessUnit:state.selectedBusinessUnit,
    project:state.selectedProject, revision:state.selectedRevision,
    consultantAccountId:currentConsultantAccountId()
  });
};

var currentSelectedSubmissionV31 = function currentSelectedSubmissionV31(items=getSubmissions()){
  const identity = selectedSubmissionIdentityV31();
  return items.find(item => item.id === state.editingId && submissionIdentityV31(item) === identity)
    || items.find(item => submissionIdentityV31(item) === identity) || null;
};

var canConsultantEditSubmissionV31 = function canConsultantEditSubmissionV31(item){
  return !!(state.auth?.role === "Consultant" && canViewSubmissionV31(item) &&
    item.editAccess?.allowed === true);
};

var canViewSubmissionV31 = function canViewSubmissionV31(item){
  if(!item) return false;
  if(state.auth?.role === "Management") return true;
  return !!(state.auth?.role === "Consultant" &&
    submissionOwnerV31(item) === currentConsultantAccountId() &&
    currentConsultantAccountConfig()?.active &&
    consultantCanAccessProjectV139(item.region,item.businessUnit,item.project));
};

var canEditCurrentSubmissionV31 = function canEditCurrentSubmissionV31(){
  if(state.auth?.role !== "Consultant" || !hasSelectedProject()) return false;
  if(!currentConsultantAccountConfig()?.active ||
    !consultantCanAccessProjectV139(state.selectedRegion,state.selectedBusinessUnit,state.selectedProject)) return false;
  const existing = currentSelectedSubmissionV31();
  // A record removed while it was open must be reopened as a new selection.
  if(state.editingId && !existing) return false;
  return !existing || canConsultantEditSubmissionV31(existing);
};

var submissionContentTokenV31 = function submissionContentTokenV31(item){
  if(!item) return null;
  return JSON.stringify([item.id,submissionIdentityV31(item),item.updatedAt,
    Number(item.versionNumber) || 1,item.formData]);
};

var assertSubmissionSaveAllowedV31 = function assertSubmissionSaveAllowedV31(payload=null,items=getSubmissions()){
  if(state.auth?.role !== "Consultant" || !currentConsultantAccountConfig()?.active ||
    !consultantCanAccessProjectV139(state.selectedRegion,state.selectedBusinessUnit,state.selectedProject)){
    throw new Error("Your consultant account must be active and assigned to this project before submitting.");
  }
  if(payload && submissionIdentityV31(payload) !== selectedSubmissionIdentityV31()){
    throw new Error("The selected project, revision or account changed while saving. Please reopen the submission.");
  }
  const existing = currentSelectedSubmissionV31(items);
  if(state.editingId && (!existing || existing.id !== state.editingId)){
    throw new Error("This submission changed or was removed. Please reopen it before submitting.");
  }
  if(existing && !canConsultantEditSubmissionV31(existing)){
    throw new Error("This submission is locked. Management must allow editing for this individual submission first.");
  }
  if(existing && state.loadedSubmissionTokenV31 &&
    state.loadedSubmissionTokenV31 !== submissionContentTokenV31(existing)){
    throw new Error("A newer version of this submission is available. Please reopen it before making a correction.");
  }
  return existing;
};

var submissionSnapshotV31 = function submissionSnapshotV31(item){
  const snapshot = structuredClone(item);
  delete snapshot.previousVersions;
  snapshot.versionNumber = Number(item.versionNumber) || 1;
  return snapshot;
};

var finaliseSubmissionVersionV31 = function finaliseSubmissionVersionV31(payload,existing){
  const now = new Date().toISOString();
  const actor = state.auth?.email || currentConsultantAccountId();
  const version = existing ? (Number(existing.versionNumber) || 1) + 1 : 1;
  return {
    ...payload,
    id:existing?.id || payload.id,
    revision:existing?.revision || payload.revision,
    createdAt:existing?.createdAt || existing?.updatedAt || now,
    updatedAt:now,
    versionNumber:version,
    previousVersions:existing ? [
      ...(existing.previousVersions || []).map(submissionSnapshotV31),
      submissionSnapshotV31(existing)
    ] : [],
    editAccess:{allowed:false,changedAt:now,changedBy:actor},
    audit:[...(existing?.audit || []),{
      action:existing ? "resubmitted" : "submitted",at:now,by:actor,versionNumber:version
    }]
  };
};

var managementSetSubmissionEditingV31 = async function managementSetSubmissionEditingV31(id,allowed){
  if(state.auth?.role !== "Management") throw new Error("Only Management can change submission editing access.");
  if(window.EcoBackend) return await window.EcoBackend.setEdit(id,allowed);
  const items = getSubmissions();
  const item = items.find(entry => String(entry.id) === String(id));
  if(!item) throw new Error("Submission not found. Please refresh the list.");
  const now = new Date().toISOString();
  const by = state.auth.email || "Management";
  item.editAccess = {allowed:allowed === true,changedAt:now,changedBy:by};
  item.versionNumber = Number(item.versionNumber) || 1;
  item.audit = [...(item.audit || []),{
    action:allowed === true ? "editing_allowed" : "editing_locked",at:now,by
  }];
  setSubmissions(items);
  return item;
};

var refreshSubmissionModalPermissionsV31 = function refreshSubmissionModalPermissionsV31(){
  const editable = canEditCurrentSubmissionV31();
  ["loadingCapacityModal","poundageCalculatorModal"].forEach(id => {
    const modal = $(id);
    modal?.querySelectorAll("input,select,textarea").forEach(control => { control.disabled = !editable; });
  });
  ["addLoadingRowBtn","toggleExcelPasteBtn","clearExcelPasteBtn","importExcelRowsBtn",
    "saveLoadingCapacityModal","applyPoundageCalculation"].forEach(id => {
    if($(id)) $(id).disabled = !editable;
  });
  $("loadingCapacityTableBody")?.querySelectorAll("[data-remove-loading-row]")
    .forEach(button => { button.disabled = !editable; });
  $("drawingFolderModal")?.querySelectorAll("[data-folder-remove-field]")
    .forEach(button => { button.hidden = !editable; button.disabled = !editable; });
};

/* individual correction permissions and immutable submission versions.
   This local portal stores permissions in the same browser as its records. */


























// Other tabs can revoke editing or deactivate an account while a form is open.
window.addEventListener("storage",event => {
  if(![ECO_FRESH_STORAGE.submissions,ECO_FRESH_STORAGE.consultantAccess].includes(event.key)) return;
  if(state.auth?.role === "Consultant"){
    updateSubmissionLockState();
    refreshSubmissionModalPermissionsV31();
    if(state.currentView === "history") renderHistory();
  }
});
;

/* ---- js/consultant/drawing-revision.js ---- */
var drawingRevisionSelectedV147 = function drawingRevisionSelectedV147(fieldKey, groups){
  const modal=$("drawingFolderModal");
  let selected=modal?.dataset?.drawingRevision || state.selectedRevision || "";
  if(!groups.some(group=>group.revision===selected)){
    selected=groups.some(group=>group.revision===state.selectedRevision)
      ? state.selectedRevision
      : (groups[0]?.revision || "");
  }
  if(modal) modal.dataset.drawingRevision=selected;
  return selected;
};

var renderDrawingFolderModal = function renderDrawingFolderModal(fieldKey){
  const groups=getProjectDrawingRevisionGroups(fieldKey);
  const selector=$("drawingRevisionSelectV147");
  const modal=$("drawingFolderModal");

  $("drawingFolderModalTitle").textContent=drawingFieldLabel(fieldKey);
  $("drawingFolderModalMeta").textContent=state.selectedProject || "Drawing Files";

  const selectedRevision=drawingRevisionSelectedV147(fieldKey,groups);

  if(selector){
    selector.innerHTML=groups.length
      ? groups.map(group=>`<option value="${escapeHtml(group.revision)}" ${group.revision===selectedRevision?"selected":""}>${escapeHtml(group.revision)}</option>`).join("")
      : `<option value="${escapeHtml(state.selectedRevision||"Current Revision")}">${escapeHtml(state.selectedRevision||"Current Revision")}</option>`;
    selector.disabled=groups.length<=1;
  }

  const body=$("drawingFolderModalBody");
  const group=groups.find(item=>item.revision===selectedRevision);

  if(!group){
    body.innerHTML=`
      <div class="drawing-folder-empty">
        <div class="drawing-folder-empty-icon">▰</div>
        <strong>No files yet</strong>
      </div>`;
    return;
  }

  body.innerHTML=`
    <section class="drawing-revision-group">
      <div class="drawing-revision-head">
        <strong>${escapeHtml(group.revision)}</strong>
        <span>${group.files.length} file${group.files.length===1?"":"s"}</span>
      </div>
      <div class="drawing-folder-file-list">
        ${group.files.map((file,index)=>`
          <div class="drawing-folder-file-row">
            <div class="drawing-folder-file-info">
              <span class="drawing-file-type">${escapeHtml(String(file.name||"").split(".").pop().toUpperCase())}</span>
              <div>
                <strong>${escapeHtml(file.name)}</strong>
                <small>${file.size?`${Math.max(1,Math.round(file.size/1024))} KB`:"Uploaded file"}</small>
              </div>
            </div>
            <div class="drawing-folder-file-actions">
              ${file.blobId
                ? `<button type="button" class="drawing-open-file-btn" data-open-drawing-revision-file="${index}">Open</button>`
                : file.dataUrl
                  ? `<a class="drawing-open-file-btn" href="${file.dataUrl}" target="_blank" rel="noopener">Open</a>`
                  : ""}
              ${group.revision===state.selectedRevision && canEditCurrentSubmissionV31()
                ? `<button type="button" class="drawing-folder-remove-btn" data-folder-remove-field="${fieldKey}" data-folder-remove-index="${index}">Remove</button>`
                : ""}
            </div>
          </div>`).join("")}
      </div>
    </section>`;
};

var openDrawingFolderModal = function openDrawingFolderModal(fieldKey){
  if(!hasSelectedProject()){
    alert("Select a project first.");
    return;
  }
  const modal=$("drawingFolderModal");
  modal.dataset.fieldKey=fieldKey;
  modal.dataset.drawingRevision=state.selectedRevision || "";
  renderDrawingFolderModal(fieldKey);
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
};

/* drawing-only revision selector for Consultant drawing folder. */







document.addEventListener("DOMContentLoaded",()=>{
  $("drawingRevisionSelectV147")?.addEventListener("change",event=>{
    const modal=$("drawingFolderModal");
    modal.dataset.drawingRevision=event.target.value;
    renderDrawingFolderModal(modal.dataset.fieldKey || "");
  });

  $("drawingFolderModal")?.addEventListener("click", async event => {
    const button = event.target.closest("[data-open-drawing-revision-file]");
    if(!button) return;

    const modal = $("drawingFolderModal");
    const fieldKey = modal?.dataset?.fieldKey || "";
    const revision = modal?.dataset?.drawingRevision || "";
    const group = getProjectDrawingRevisionGroups(fieldKey).find(item => item.revision === revision);
    const file = group?.files?.[Number(button.dataset.openDrawingRevisionFile)];
    if(file) await openEcoStoredFile(file);
  });
});
;

/* ---- js/consultant/events.js ---- */
var returnToLoginV147 = function returnToLoginV147(){
  if(window.EcoBackend) window.EcoBackend.signOut();
  setAuth(null);
  $("appShell").classList.add("hidden");
  $("loginPage").classList.remove("hidden");
  $("loginForm")?.reset();
  $("loginError").textContent = "";
  $("managementSettingsModal")?.classList.add("hidden");
  document.body.classList.remove("modal-open", "management-settings-modal-open-v121");
  window.requestAnimationFrame(() => $("emailInput")?.focus());
};

/* Give Chrome a login entry to return to when the portal opens. */
var rememberPortalAppHistoryV148 = function rememberPortalAppHistoryV148(){
  if(history.state?.ecoPortalView === "app") return;
  history.replaceState({ecoPortalView:"login"}, "");
  history.pushState({ecoPortalView:"app"}, "");
};

var logOutToLoginV148 = function logOutToLoginV148(){
  returnToLoginV147();
  if(history.state?.ecoPortalView === "app") history.back();
};

if(history.state?.ecoPortalView !== "app"){
  history.replaceState({ecoPortalView:"login"}, "");
}
window.addEventListener("popstate", () => {
  if(history.state?.ecoPortalView === "app" && state.auth) return;
  returnToLoginV147();
  history.replaceState({ecoPortalView:"login"}, "");
});

var bindEvents = function bindEvents(){
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = $("emailInput").value.trim().toLowerCase();
    const password = $("passwordInput").value;
    if(window.EcoBackend){
      const button = $("loginForm").querySelector('button[type="submit"]');
      button.disabled = true;
      try{
        const auth = await window.EcoBackend.signIn(email,password);
        setAuth(auth);
        $("loginError").textContent = "";
        launchApp();
      }catch(error){
        $("loginError").textContent = error?.message || "Unable to sign in.";
      }finally{
        button.disabled = false;
      }
      return;
    }
    $("loginError").textContent = "The Supabase connection is unavailable. Reload the page or contact Management.";
  });

  $("logoutBtn").addEventListener("click", () => {
    logOutToLoginV148();
  });

  $("managementHeaderLogoutBtn")?.addEventListener("click", () => {
    logOutToLoginV148();
  });

  $("sidebarToggle").addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    applySidebarState();
  });

  $("sideNav").addEventListener("click", (event) => {
    const btn = event.target.closest(".side-nav-btn");
    if(!btn) return;
    showView(btn.dataset.view);
  });

  $("regionSelect").addEventListener("change", (event) => {
    state.selectedRegion = event.target.value;
    state.selectedBusinessUnit = "";
    state.selectedProject = "";
    $("projectSearchInput").value = "";
    populateBusinessUnitSelect();
    populateProjectSelect();
    updateCurrentSelectionPill();
    loadFormForCurrentSelection();
  });

  $("businessUnitSelect").addEventListener("change", (event) => {
    state.selectedBusinessUnit = event.target.value;
    state.selectedProject = "";
    $("projectSearchInput").value = "";
    populateProjectSelect();
    updateCurrentSelectionPill();
    loadFormForCurrentSelection();
  });

  $("projectSelect").addEventListener("change", (event) => {
    setSelectedProject(event.target.value.trim());
  });

  $("projectSearchInput").addEventListener("input", (event) => {
    renderProjectSearchResults(event.target.value);
  });

  $("projectSearchInput").addEventListener("focus", (event) => {
    if(event.target.value.trim()){
      renderProjectSearchResults(event.target.value);
    }
  });

  $("projectSearchResults").addEventListener("click", (event) => {
    const button=event.target.closest("[data-search-project]");
    if(!button)return;

    selectProjectFromSearch({
      region:button.dataset.searchRegion,
      businessUnit:button.dataset.searchBusinessUnit,
      project:button.dataset.searchProject
    });
  });

  document.addEventListener("click", (event) => {
    if(!event.target.closest(".project-search-wrap")){
      closeProjectSearchResults();
    }
  });

  $("revisionSelect").addEventListener("change", (event) => {
    state.selectedRevision = event.target.value;
    loadFormForCurrentSelection();
  });

  $("yearSelect")?.addEventListener("change", (event) => {
    if(!canEditCurrentSubmissionV31()) return;
    state.selectedYear = event.target.value;
    updateSaveStatus(`Year set to ${state.selectedYear}. Unsaved changes.`);
  });

  $("overviewTableBody").addEventListener("input", (event) => {
    const target = event.target;

    if(
      target.matches("[data-field]") &&
      target.tagName !== "SELECT"
    ){
      handleFieldChange(target);
    }
  });

  $("overviewTableBody").addEventListener("change", async (event) => {
    const target = event.target;

    if(
      target.matches("[data-field]") &&
      target.tagName === "SELECT"
    ){
      handleFieldChange(target);
    }

    if(target.matches("[data-file-field]")){
      await handleFileChange(target);
    }
  });

  $("overviewTableBody").addEventListener("click", (event) => {
    const folderButton =
      event.target.closest(
        "[data-open-drawing-folder]"
      );

    if(folderButton){
      openDrawingFolderModal(
        folderButton.dataset.openDrawingFolder
      );
    }
  });

  $("closeDrawingFolderModal").addEventListener(
    "click",
    closeDrawingFolderModal
  );

  $("doneDrawingFolderModal").addEventListener(
    "click",
    closeDrawingFolderModal
  );

  $("drawingFolderModal").addEventListener(
    "click",
    async (event) => {
      if(event.target === $("drawingFolderModal")){
        closeDrawingFolderModal();
        return;
      }

      const openStoredFileButton =
        event.target.closest(
          "[data-open-stored-file]"
        );

      if(openStoredFileButton){
        const blobId = openStoredFileButton.dataset.openStoredFile;
        await openEcoStoredFile({ blobId });
        return;
      }

      const removeButton =
        event.target.closest(
          "[data-folder-remove-field]"
        );

      if(removeButton){
        if(!canEditCurrentSubmissionV31()) return;
        const fieldKey =
          removeButton.dataset.folderRemoveField;

        const fileIndex =
          Number(
            removeButton.dataset.folderRemoveIndex
          );

        const files =
          normaliseDrawingFiles(
            state.formData[fieldKey]
          );

        if(
          fileIndex >= 0 &&
          fileIndex < files.length
        ){
          files.splice(fileIndex, 1);
          state.formData[fieldKey] = files;
          // Saved and archived versions may still reference this drawing blob.

          renderDrawingFolderModal(fieldKey);
          renderOverviewTable();

          updateSaveStatus(
            "Drawing file removed."
          );
        }
      }
    }
  );

  $("clearFormBtn").addEventListener("click", () => {
    if(!canEditCurrentSubmissionV31()) return;
    if(!confirm("Clear the current form values?")) return;
    resetForm();
  });

  $("submitBtn").addEventListener("click", saveSubmission);

  $("overviewTableBody").addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-loading-table]");
    if(trigger){
      openLoadingCapacityModal();
    }
  });

  $("closeLoadingCapacityModal").addEventListener("click", closeLoadingCapacityModal);
  $("cancelLoadingCapacityModal").addEventListener("click", closeLoadingCapacityModal);

  $("loadingCapacityModal").addEventListener("click", (event) => {
    if(event.target === $("loadingCapacityModal")){
      closeLoadingCapacityModal();
    }
  });

  $("addLoadingRowBtn").addEventListener("click", addLoadingCapacityRow);

  $("toggleExcelPasteBtn").addEventListener("click", () => {
    if(!canEditCurrentSubmissionV31()) return;
    $("excelPastePanel").classList.toggle("hidden");
    if(!$("excelPastePanel").classList.contains("hidden")){
      $("excelPasteInput").focus();
    }
  });

  $("clearExcelPasteBtn").addEventListener("click", () => {
    if(!canEditCurrentSubmissionV31()) return;
    $("excelPasteInput").value = "";
    $("excelPasteInput").focus();
  });

  const openExcelPasteGuide = () => {
    $("excelGuideModal").classList.remove("hidden");
  };

  const closeExcelPasteGuide = () => {
    $("excelGuideModal").classList.add("hidden");
  };

  $("openExcelPasteGuideBtn").addEventListener("click", openExcelPasteGuide);
  $("closeExcelPasteGuideBtn").addEventListener("click", closeExcelPasteGuide);
  $("closeExcelPasteGuideBtnSecondary").addEventListener("click", closeExcelPasteGuide);
  $("excelGuideModal").addEventListener("click", (event) => {
    if(event.target === $("excelGuideModal")){
      closeExcelPasteGuide();
    }
  });

  $("importExcelRowsBtn").addEventListener("click", importExcelLoadingRows);

  $("loadingCapacityTableBody").addEventListener("change", (event) => {
    const target = event.target;

    if(target.matches("[data-loading-index][data-loading-field]")){
      updateLoadingCapacityRow(
        Number(target.dataset.loadingIndex),
        target.dataset.loadingField,
        target.value
      );
    }
  });

  $("loadingCapacityTableBody").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-loading-row]");
    if(removeButton){
      removeLoadingCapacityRow(
        Number(removeButton.dataset.removeLoadingRow)
      );
    }
  });

  $("saveLoadingCapacityModal").addEventListener("click", applyLoadingCapacityToSubmission);

  $("historyList").addEventListener("click", (event) => {
    const versionId = event.target.closest("[data-view-submission-versions]")?.dataset.viewSubmissionVersions;
    if(versionId){
      if(typeof showSubmissionVersionHistoryV31 === "function") showSubmissionVersionHistoryV31(versionId);
      return;
    }
    const openId = event.target.closest("[data-open-submission]")?.dataset.openSubmission;
    const deleteId = event.target.closest("[data-delete-submission]")?.dataset.deleteSubmission;

    if(openId){
      openSubmissionById(openId);
      return;
    }
    if(deleteId){
      deleteSubmissionById(deleteId);
    }
  });
};

var launchApp = function launchApp(){
  const auth =
    state.auth ||
    loadStorage(
      ECO_FRESH_STORAGE.auth,
      null
    );

  if(!auth) return;

  if(
    auth.role === "Consultant" &&
    typeof normaliseConsultantAuth === "function"
  ){
    state.auth = normaliseConsultantAuth(auth);
    if(JSON.stringify(state.auth) !== JSON.stringify(auth)){
      saveStorage(ECO_FRESH_STORAGE.auth, state.auth);
    }
  }else{
    state.auth = auth;
  }

  if(!state.auth){
    setAuth(null);
    $("appShell").classList.add("hidden");
    $("loginPage").classList.remove("hidden");
    $("loginError").textContent = "This consultant account is no longer available. Please contact Management.";
    return;
  }

  const activeAuth = state.auth;

  state.sidebarCollapsed =
    !!loadStorage(
      ECO_FRESH_STORAGE.sidebar,
      false
    );

  const visibleRole = activeAuth.role === "Management" ? "Internal" : "External";

  $("appShell").classList.toggle("management-mode-v126", activeAuth.role === "Management");
  if($("managementHeaderRole")) $("managementHeaderRole").textContent = visibleRole;
  if($("managementHeaderEmail")) $("managementHeaderEmail").textContent = activeAuth.email;

  if(activeAuth.role === "Consultant"){
    $("accountRole").textContent =
      typeof currentConsultantDisplayName === "function"
        ? currentConsultantDisplayName()
        : (activeAuth.name || "External");

    $("accountEmail").textContent =
      `External · ${activeAuth.email}`;

    $("accountAvatar").textContent =
      (typeof currentConsultantDisplayName === "function"
        ? currentConsultantDisplayName()
        : (activeAuth.name || "E"))
        .trim()
        .charAt(0)
        .toUpperCase() || "E";
  }else{
    $("accountRole").textContent = visibleRole;
    $("accountEmail").textContent = activeAuth.email;
    $("accountAvatar").textContent = "I";
  }

  populateRegionSelect();
  populateBusinessUnitSelect();
  populateProjectSelect();
  populateRevisionSelect();
  populateYearSelect();
  updateCurrentSelectionPill();
  applySidebarState();

  configureRoleNavigation(
    activeAuth.role
  );

  /*
    Set the correct role landing page BEFORE making
    the application visible. This prevents Management
    from opening or briefly showing the Consultant page.
  */
  if(activeAuth.role === "Management"){
    state.currentView =
      "managementOverview";

    ["overview","history"]
      .forEach(name => {
        const view =
          $(`${name}View`);

        if(view){
          view.classList.add("hidden");
        }
      });

    initManagementPortal();
    showManagementView(
      "managementOverview"
    );

    $("loginPage")
      .classList.add("hidden");

    $("appShell")
      .classList.remove("hidden");

    rememberPortalAppHistoryV148();
    return;
  }

  state.currentView =
    "overview";

  document
    .querySelectorAll(".management-view")
    .forEach(view =>
      view.classList.add("hidden")
    );

  state.formData =
    defaultFormData();
  state.editingId = null;
  state.loadedSubmissionTokenV31 = null;

  renderOverviewTable();
  renderHistory();
  showView("overview");

  $("loginPage")
    .classList.add("hidden");

  $("appShell")
    .classList.remove("hidden");

  rememberPortalAppHistoryV148();
};







bindEvents();
bindPoundageCalculatorEvents();
// Management modules below this script finish installing their overrides first.
document.addEventListener("DOMContentLoaded", async () => {
  if(!window.EcoBackend){
    $("loginError").textContent = "The Supabase connection is unavailable. Reload the page or contact Management.";
    return;
  }
  try{
    const auth = await window.EcoBackend.restore();
    if(auth){ setAuth(auth); launchApp(); }
  }catch(error){
    $("loginError").textContent = error?.message || "Please sign in again.";
  }
});
;
