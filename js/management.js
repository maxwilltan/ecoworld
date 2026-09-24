/* EcoWorld Management features. Load after consultant.js. */
/* ==============================
   Management features
   ============================== */

/* ---- js/management/core-overview.js ---- */
var configureRoleNavigation = function configureRoleNavigation(role){
  const management = role === "Management";

  document
    .querySelectorAll(".consultant-nav-item")
    .forEach(item =>
      item.classList.toggle("hidden", management)
    );

  document
    .querySelectorAll(".management-nav-item")
    .forEach(item =>
      item.classList.toggle("hidden", !management)
    );
};

var showManagementView = function showManagementView(viewName){
  ["overview", "history"].forEach(name => {
    const view = $(`${name}View`);
    if(view) view.classList.add("hidden");
  });

  if(viewName === "managementSettings"){
    if(typeof openManagementSubmissionSetupModalV121 === "function"){
      openManagementSubmissionSetupModalV121();
    }
    return;
  }

  const views = {
    managementOverview: "managementOverviewView",
    managementComparison: "managementComparisonView",
    managementPileReference: "managementPileReferenceView"
  };

  document
    .querySelectorAll(".management-view")
    .forEach(view =>
      view.classList.add("hidden")
    );

  const target = $(views[viewName] || views.managementOverview);
  target?.classList.remove("hidden");

  document
    .querySelectorAll(".side-nav-btn")
    .forEach(btn =>
      btn.classList.toggle(
        "active",
        btn.dataset.view === viewName
      )
    );

  if(viewName === "managementOverview"){
    renderManagementOverview();
  }

  if(viewName === "managementComparison"){
    renderManagementComparisonFilters();
    renderManagementComparisonSlots();
    renderManagementComparison();
  }

  if(viewName === "managementPileReference"){
    renderManagementPileReference();
  }
};

var consultantSettingsKey = function consultantSettingsKey(sectionTitle, rowKey){
  return `${sectionTitle}::${rowKey}`;
};

var defaultConsultantTableSettings = function defaultConsultantTableSettings(){
  const sections = {};
  const rows = {};

  OVERVIEW_SECTIONS.forEach(section => {
    sections[section.title] = {
      visible:true,
      label:section.title
    };

    section.rows.forEach(row => {
      rows[
        consultantSettingsKey(
          section.title,
          row.key
        )
      ] = {
        visible:true,
        label:row.label
      };
    });
  });

  rows[
    consultantSettingsKey(
      "Project Information",
      "landedType"
    )
  ] = {
    visible:true,
    label:"Landed Type"
  };

  return {sections, rows, customRows:[]};
};

var getConsultantTableSettings = function getConsultantTableSettings(){
  const defaults =
    defaultConsultantTableSettings();

  const stored = loadStorage(
    ECO_FRESH_STORAGE.tableSettings,
    null
  );

  if(!stored){
    return defaults;
  }

  const merged = {
    sections:{
      ...defaults.sections,
      ...(stored.sections || {})
    },
    rows:{
      ...defaults.rows,
      ...(stored.rows || {})
    },
    customRows:Array.isArray(stored.customRows)
      ? stored.customRows.filter(row =>
          row && row.section && row.key && row.label
        )
      : []
  };

  merged.customRows.forEach(row => {
    const key = consultantSettingsKey(
      row.section,
      row.key
    );

    if(!merged.rows[key]){
      merged.rows[key] = {
        visible:true,
        label:row.label
      };
    }
  });

  return merged;
};

var managementSettingsRowsForSection = function managementSettingsRowsForSection(section){
  const rows = [...section.rows];

  if(section.title === "Project Information"){
    const buildingIndex =
      rows.findIndex(row =>
        row.key === "buildingType"
      );

    rows.splice(
      buildingIndex + 1,
      0,
      {
        key:"landedType",
        label:"Landed Type",
        type:"select",
        custom:false
      }
    );
  }

  const settings =
    getConsultantTableSettings();

  const customRows =
    (settings.customRows || [])
      .filter(row =>
        row.section === section.title
      )
      .map(row => ({
        key:row.key,
        label:row.label,
        type:row.type || "text",
        placeholder:row.placeholder || "Enter value",
        custom:true
      }));

  return [...rows, ...customRows];
};

var collectManagementSettings = function collectManagementSettings(){
  const settings =
    getConsultantTableSettings();

  document
    .querySelectorAll(
      "[data-setting-section-visible]"
    )
    .forEach(input => {
      const section =
        input.dataset.settingSectionVisible;

      settings.sections[section].visible =
        input.checked;
    });

  document
    .querySelectorAll(
      "[data-setting-section-label]"
    )
    .forEach(input => {
      const section =
        input.dataset.settingSectionLabel;

      settings.sections[section].label =
        input.value.trim() || section;
    });

  document
    .querySelectorAll(
      "[data-setting-row-visible]"
    )
    .forEach(input => {
      const key =
        input.dataset.settingRowVisible;

      settings.rows[key].visible =
        input.checked;
    });

  document
    .querySelectorAll(
      "[data-setting-row-label]"
    )
    .forEach(input => {
      const key =
        input.dataset.settingRowLabel;

      settings.rows[key].label =
        input.value.trim() ||
        settings.rows[key].label;
    });

  return settings;
};

var managementSubmissionUpdated = function managementSubmissionUpdated(item){
  if(!item?.updatedAt) return "—";

  return new Date(item.updatedAt)
    .toLocaleString();
};

var renderManagementOverviewStats = function renderManagementOverviewStats(){
  const submissions =
    getSubmissions();

  const projects =
    new Set(
      submissions.map(item =>
        managementProjectKey(item)
      )
    );

  const latest =
    submissions
      .slice()
      .sort(
        (a,b) =>
          new Date(b.updatedAt || 0) -
          new Date(a.updatedAt || 0)
      )[0];

  $("managementStatSubmissions").textContent =
    submissions.length;

  if($("managementStatProjects")){
    $("managementStatProjects").textContent = projects.size;
  }

  $("managementStatLatest").textContent =
    latest
      ? latest.project
      : "—";

  if($("managementOverviewCount")){
    $("managementOverviewCount").textContent =
      `${submissions.length} submission${
        submissions.length === 1 ? "" : "s"
      }`;
  }
};

var managementSubmissionLoadingSummary = function managementSubmissionLoadingSummary(data){
  const rows = Array.isArray(data?.loadingCapacityRows)
    ? data.loadingCapacityRows
    : [];

  let totalPiles = 0;
  let totalCapacity = 0;
  let totalLoading = 0;
  let hasPiles = false;
  let hasCapacity = false;
  let hasLoading = false;

  rows.forEach(row => {
    const pileCount = Number(row?.numberOfPiles);
    const columnLoading = Number(row?.columnLoading);

    if(
      row?.numberOfPiles !== "" &&
      row?.numberOfPiles !== null &&
      row?.numberOfPiles !== undefined &&
      Number.isFinite(pileCount)
    ){
      totalPiles += pileCount;
      hasPiles = true;
    }

    const reference = MANAGEMENT_PILE_CAPACITY_REFERENCE.find(item =>
      item.pileType === row?.pileType &&
      String(item.pileSize) === String(row?.pileSize)
    );

    if(reference && Number.isFinite(pileCount)){
      const capacityPerPile = Number(reference.pileCapacity);
      if(Number.isFinite(capacityPerPile)){
        totalCapacity += pileCount * capacityPerPile;
        hasCapacity = true;
      }
    }

    if(
      row?.columnLoading !== "" &&
      row?.columnLoading !== null &&
      row?.columnLoading !== undefined &&
      Number.isFinite(columnLoading)
    ){
      totalLoading += columnLoading;
      hasLoading = true;
    }
  });

  const overallEfficiency =
    hasCapacity && hasLoading && totalCapacity > 0
      ? (totalLoading / totalCapacity) * 100
      : null;

  return {
    totalPiles: hasPiles ? totalPiles : null,
    totalCapacity: hasCapacity ? totalCapacity : null,
    totalLoading: hasLoading ? totalLoading : null,
    overallEfficiency
  };
};

var managementSubmissionTotalPiles = function managementSubmissionTotalPiles(data){
  const derived = managementSubmissionLoadingSummary(data).totalPiles;

  if(derived !== null){
    return String(Number(derived.toFixed(0)));
  }

  return data?.numberOfPiles || "—";
};

var managementSubmissionValueDisplay = function managementSubmissionValueDisplay(row, data){
  const value = data?.[row.key];

  if(row.type === "gridlinePair"){
    const vertical =
      data?.gridlineCarparkVertical !== "" &&
      data?.gridlineCarparkVertical !== null &&
      data?.gridlineCarparkVertical !== undefined
        ? data.gridlineCarparkVertical
        : (data?.gridlineCarpark ?? "");
    const horizontal =
      data?.gridlineCarparkHorizontal ?? "";

    const verticalDisplay =
      vertical === "" || vertical === null || vertical === undefined
        ? "—"
        : `${vertical} m`;
    const horizontalDisplay =
      horizontal === "" || horizontal === null || horizontal === undefined
        ? "—"
        : `${horizontal} m`;

    return `Vertical: ${verticalDisplay} · Horizontal: ${horizontalDisplay}`;
  }

  if(row.type === "file"){
    const files = normaliseDrawingFiles(value);

    return files.length
      ? `${files.length} file${files.length === 1 ? "" : "s"}`
      : "—";
  }

  if(row.type === "loadingSummary"){
    const derived = managementSubmissionLoadingSummary(data);

    if(row.key === "totalColumnLoading" && derived.totalLoading !== null){
      return String(Number(derived.totalLoading.toFixed(2)));
    }

    if(row.key === "totalPilesCapacity" && derived.totalCapacity !== null){
      return String(Number(derived.totalCapacity.toFixed(2)));
    }

    if(row.key === "overallEfficiency" && derived.overallEfficiency !== null){
      return `${Number(derived.overallEfficiency.toFixed(1))}%`;
    }
  }

  if(row.key === "overallEfficiency"){
    return value
      ? `${value}%`
      : "—";
  }

  if(
    value === undefined ||
    value === null ||
    value === ""
  ){
    return "—";
  }

  return String(value);
};

var managementFormatFileSize = function managementFormatFileSize(bytes){
  const size = Number(bytes) || 0;
  if(size < 1024) return `${size} B`;
  if(size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

var managementDrawingFieldLabel = function managementDrawingFieldLabel(fieldKey, fallback = "Drawing Files"){
  if(fieldKey === "drawingArchitectural") return "Architectural Drawings";
  if(fieldKey === "drawingStructural") return "Structural Drawings";
  return fallback || "Drawing Files";
};

var closeManagementDrawingFolderModal = function closeManagementDrawingFolderModal(){
  $("managementDrawingFolderModal")?.classList.add("hidden");

  if($("managementSubmissionModal")?.classList.contains("hidden")){
    document.body.classList.remove("modal-open");
  }
};

var openManagementSubmissionFile = async function openManagementSubmissionFile(submissionId, fieldKey, fileIndex){
  const submission = getSubmissions().find(item => item.id === submissionId);
  if(!submission) return;

  const files = normaliseDrawingFiles(submission.formData?.[fieldKey]);
  const file = files[Number(fileIndex)];

  if(!file){
    alert("This uploaded file could not be found in the submission.");
    return;
  }

  if(typeof openEcoStoredFile === "function"){
    await openEcoStoredFile(file);
    return;
  }

  if(file.dataUrl){
    window.open(file.dataUrl, "_blank", "noopener");
    return;
  }

  alert("File storage is not available on this page.");
};

var managementPoundageRowLabel = function managementPoundageRowLabel(rowKey, fallback, buildingType){
  const isLanded =
    String(buildingType || "")
      .trim()
      .toLowerCase() === "landed";

  if(!isLanded){
    return fallback;
  }

  if(rowKey === "poundageRcColumn") return "RC Column (kg/m³)";
  if(rowKey === "poundageRcBeamCarpark") return "RC Beam (kg/m³)";
  if(rowKey === "poundageRcSlab") return "RC Slab (kg/m³)";
  if(rowKey === "poundageOverall") return "Overall Poundage (kg/m³)";
  if(rowKey === "poundageSteelContent") return "Total Steel Content per Unit (Landed), kg";

  return fallback;
};

var managementSubmissionProposedGuide = function managementSubmissionProposedGuide(sectionTitle, rowKey, buildingType){
  if(sectionTitle !== "Poundage"){
    return "";
  }

  const type =
    String(buildingType || "")
      .trim()
      .toLowerCase();

  const highRiseGuides = {
    poundageRcColumn:"200 – 250",
    poundageRcBeamCarpark:"200 – 225",
    poundageRcBeamTypical:"25 – 140",
    poundageRcSlab:"50 – 60 (BRC)\n70 – 90 (rebar)",
    poundageShearWall:"100 – 105",
    poundageOverall:""
  };

  const landedGuides = {
    poundageRcColumn:"150 – 215",
    poundageRcBeamCarpark:"115 – 150",
    poundageRcBeamTypical:"",
    poundageRcSlab:"60 – 60 (BRC)\n70 – 90 (rebar)",
    poundageShearWall:"",
    poundageOverall:"90 – 100",
    poundageSteelContent:""
  };

  const guides =
    type === "landed"
      ? landedGuides
      : highRiseGuides;

  return guides[rowKey] || "";
};

var closeManagementSubmissionModal = function closeManagementSubmissionModal(){
  $("managementSubmissionModal")
    .classList.add("hidden");

  $("managementDrawingFolderModal")
    ?.classList.add("hidden");

  document.body
    .classList.remove("modal-open");
};


let managementComparisonSelections = Array.from(
  {length:5},
  () => ({
    projectKey:"",
    revision:""
  })
);

let managementPileCheckSubmissionId = null;
let managementPileProposalRows = [];





/* ------------------------------------------------------------
   Consultant table settings
   ------------------------------------------------------------ */











/* ------------------------------------------------------------
   Management Overview
   ------------------------------------------------------------ */
;

/* ---- js/management/comparison-pile-reference.js ---- */
var managementProjectKey = function managementProjectKey(item){
  return [
    item.region || "",
    item.businessUnit || "",
    item.project || ""
  ].join("|||");
};

var managementProjectLabel = function managementProjectLabel(item){
  return `${item.project || "Project"} · ${item.businessUnit || "—"}`;
};

var managementComparisonProjectOptions = function managementComparisonProjectOptions(){
  const map = new Map();

  getSubmissions().forEach(item => {
    const key =
      managementProjectKey(item);

    if(!map.has(key)){
      map.set(key, item);
    }
  });

  return [...map.entries()]
    .sort((a,b) =>
      managementProjectLabel(a[1])
        .localeCompare(
          managementProjectLabel(b[1])
        )
    );
};

var managementComparisonRevisions = function managementComparisonRevisions(projectKey){
  return getSubmissions()
    .filter(item =>
      managementProjectKey(item) === projectKey
    )
    .map(item =>
      item.revision
    )
    .filter((value,index,array) =>
      array.indexOf(value) === index
    )
    .sort((a,b) => {
      const an =
        Number(String(a).match(/\d+/)?.[0] || 0);

      const bn =
        Number(String(b).match(/\d+/)?.[0] || 0);

      return an - bn;
    });
};

var selectedManagementComparisonSubmissions = function selectedManagementComparisonSubmissions(){
  return managementComparisonSelections
    .map(selection => {
      if(
        !selection.projectKey ||
        !selection.revision
      ){
        return null;
      }

      return getSubmissions()
        .find(item =>
          managementProjectKey(item) ===
            selection.projectKey &&
          item.revision ===
            selection.revision
        ) || null;
    })
    .filter(Boolean);
};

var managementComparisonNormalizedBuildingType = function managementComparisonNormalizedBuildingType(itemOrData){
  const data = itemOrData && itemOrData.formData
    ? itemOrData.formData
    : (itemOrData || {});

  const type = String(data.buildingType || "")
    .trim()
    .toLowerCase();

  if(type === "landed") return "Landed";
  if(type === "high rise" || type === "highrise") return "High Rise";

  return "";
};

var managementComparisonPoundageHighRiseKeys = function managementComparisonPoundageHighRiseKeys(){
  return [
    "poundageRcColumn",
    "poundageRcBeamCarpark",
    "poundageRcBeamTypical",
    "poundageRcSlab",
    "poundageShearWall",
    "poundageOverall"
  ];
};

var managementComparisonPoundageLandedKeys = function managementComparisonPoundageLandedKeys(){
  return [
    "poundageRcColumn",
    "poundageRcBeamCarpark",
    "poundageRcSlab",
    "poundageOverall",
    "poundageSteelContent"
  ];
};

var managementComparisonPoundageLabelWithoutUnit = function managementComparisonPoundageLabelWithoutUnit(label){
  return String(label || "")
    .replace(/\s*\(\s*kg\/m(?:³|3)\s*\)\s*$/i, "")
    .replace(/\s*,\s*kg\/m(?:³|3)\s*$/i, "")
    .trim();
};

var managementComparisonRows = function managementComparisonRows(items){
  const rows = [];

  OVERVIEW_SECTIONS.forEach(section => {
    if(!isConsultantSectionVisible(section.title)){
      return;
    }

    if(
      !managementComparisonSectionSelected(
        section.title
      )
    ){
      return;
    }

    if(section.title === "Poundage"){
      const sectionRows =
        managementSettingsRowsForSection(section);

      /*
        Poundage groups follow the building types currently being
        compared. If no project has been selected yet, keep both groups in the
        empty table structure.
      */
      const comparedBuildingTypes = new Set(
        (items || [])
          .map(item => managementComparisonNormalizedBuildingType(item))
          .filter(Boolean)
      );

      const showHighRisePoundage =
        !comparedBuildingTypes.size ||
        comparedBuildingTypes.has("High Rise");

      const showLandedPoundage =
        !comparedBuildingTypes.size ||
        comparedBuildingTypes.has("Landed");

      if(showHighRisePoundage){
        rows.push({
          type:"section",
          label:"Poundage (High Rise) (kg/m³)"
        });

        sectionRows.forEach(row => {
          if(
            !isConsultantRowVisible(
              section.title,
              row.key
            )
          ){
            return;
          }

          if(
            !managementComparisonPoundageHighRiseKeys()
              .includes(row.key)
          ){
            return;
          }

          rows.push({
            type:"field",
            sectionTitle:section.title,
            row,
            buildingTypeScope:"High Rise",
            label:managementComparisonPoundageLabelWithoutUnit(
              consultantRowLabel(
                section.title,
                row.key,
                row.label
              )
            )
          });
        });
      }

      if(showLandedPoundage){
        rows.push({
          type:"section",
          label:"Poundage (Landed) (kg/m³)"
        });

        sectionRows.forEach(row => {
          if(
            !isConsultantRowVisible(
              section.title,
              row.key
            )
          ){
            return;
          }

          if(
            !managementComparisonPoundageLandedKeys()
              .includes(row.key)
          ){
            return;
          }

          rows.push({
            type:"field",
            sectionTitle:section.title,
            row,
            buildingTypeScope:"Landed",
            label:managementComparisonPoundageLabelWithoutUnit(
              managementPoundageRowLabel(
                row.key,
                row.label,
                "Landed"
              )
            )
          });
        });
      }

      return;
    }

    rows.push({
      type:"section",
      label:consultantSectionLabel(section.title)
    });

    managementSettingsRowsForSection(section)
      .forEach(row => {
        if(
          !isConsultantRowVisible(
            section.title,
            row.key
          )
        ){
          return;
        }

        const visibleSomewhere =
          items.length === 0 ||
          items.some(item => {
            const data = item.formData || {};

            if(
              row.key === "landedType"
            ){
              return managementComparisonNormalizedBuildingType(data) === "Landed";
            }

            if(row.showWhen){
              return row.showWhen(data);
            }

            return true;
          });

        if(!visibleSomewhere){
          return;
        }

        rows.push({
          type:"field",
          sectionTitle:section.title,
          row
        });
      });
  });

  return rows;
};

var managementComparisonDisplay = function managementComparisonDisplay(item,entry){
  const data = item.formData || {};

  const normalizedEntry =
    entry && entry.row
      ? entry
      : {
          row:entry,
          buildingTypeScope:null
        };

  if(
    normalizedEntry.buildingTypeScope &&
    managementComparisonNormalizedBuildingType(data) !== normalizedEntry.buildingTypeScope
  ){
    return "—";
  }

  if(!normalizedEntry.row){
    return "—";
  }

  return managementSubmissionValueDisplay(
    normalizedEntry.row,
    data
  );
};

var saveManagementPileReference = function saveManagementPileReference(rows){
  saveStorage(
    ECO_FRESH_STORAGE.pileReference,
    rows
  );
};

var renderManagementPileReference = function renderManagementPileReference(){
  const body =
    $("managementPileReferenceBody");

  const rows =
    managementPileReference();

  body.innerHTML =
    rows.map((row,index) => `
      <tr>
        <td>
          <input
            type="text"
            value="${escapeHtml(row.pileType || "")}"
            data-pile-ref-index="${index}"
            data-pile-ref-field="pileType"
          />
        </td>
        <td>
          <input
            type="number"
            value="${escapeHtml(row.pileSize || "")}"
            data-pile-ref-index="${index}"
            data-pile-ref-field="pileSize"
          />
        </td>
        <td>
          <input
            type="number"
            value="${escapeHtml(row.pileCapacity ?? "")}"
            data-pile-ref-index="${index}"
            data-pile-ref-field="pileCapacity"
          />
        </td>
        <td>
          <input
            type="number"
            step="0.01"
            value="${escapeHtml(row.averagePrice ?? "")}"
            data-pile-ref-index="${index}"
            data-pile-ref-field="averagePrice"
            placeholder="Optional"
          />
        </td>
        <td>
          <button
            type="button"
            class="management-table-delete-btn"
            data-remove-pile-ref="${index}"
          >×</button>
        </td>
      </tr>
    `).join("");
};

var collectManagementPileReference = function collectManagementPileReference(){
  const rows = [];

  const trList =
    $("managementPileReferenceBody")
      .querySelectorAll("tr");

  trList.forEach((tr,index) => {
    const get = field =>
      tr.querySelector(
        `[data-pile-ref-index="${index}"][data-pile-ref-field="${field}"]`
      )?.value
      .trim() || "";

    const pileType = get("pileType");
    const pileSize = get("pileSize");
    const pileCapacity = get("pileCapacity");
    const averagePrice = get("averagePrice");

    if(
      pileType &&
      pileSize &&
      pileCapacity
    ){
      rows.push({
        pileType,
        pileSize,
        pileCapacity:Number(pileCapacity),
        averagePrice:
          averagePrice === ""
            ? ""
            : Number(averagePrice)
      });
    }
  });

  return rows;
};

/* ------------------------------------------------------------
   Comparison
   ------------------------------------------------------------ */























/* ------------------------------------------------------------
   Pile Reference
   ------------------------------------------------------------ */
;

/* ---- js/management/pile-check.js ---- */
var pileReferenceRate = function pileReferenceRate(pileType,pileSize){
  const row =
    managementPileReference()
      .find(item =>
        item.pileType === pileType &&
        String(item.pileSize) === String(pileSize)
      );

  if(!row) return null;

  const value =
    Number(row.averagePrice);

  return row.averagePrice !== "" &&
    Number.isFinite(value)
      ? value
      : null;
};

var managementSubmissionById = function managementSubmissionById(id){
  return getSubmissions()
    .find(item =>
      item.id === id
    ) || null;
};

var consultantPileRowCalculation = function consultantPileRowCalculation(row){
  const count =
    numberOrNull(row.numberOfPiles);

  const capacity =
    findManagementPileCapacity(
      row.pileType,
      row.pileSize
    );

  const load =
    numberOrNull(row.columnLoading);

  const totalCapacity =
    count !== null &&
    capacity !== null
      ? count * capacity
      : null;

  const efficiency =
    totalCapacity &&
    load !== null
      ? load / totalCapacity
      : null;

  const rate =
    pileReferenceRate(
      row.pileType,
      row.pileSize
    );

  const cost =
    rate !== null &&
    count !== null
      ? rate * count
      : null;

  return {
    count,
    capacity,
    load,
    totalCapacity,
    efficiency,
    rate,
    cost
  };
};

var managementProposalRowCalculation = function managementProposalRowCalculation(row){
  const count =
    numberOrNull(row.numberOfPiles);

  const capacity =
    findManagementPileCapacity(
      row.pileType,
      row.pileSize
    );

  const load =
    numberOrNull(row.columnLoading);

  const totalCapacity =
    count !== null &&
    capacity !== null
      ? count * capacity
      : null;

  const efficiency =
    totalCapacity &&
    load !== null
      ? load / totalCapacity
      : null;

  const rate =
    pileReferenceRate(
      row.pileType,
      row.pileSize
    );

  const cost =
    rate !== null &&
    count !== null
      ? rate * count
      : null;

  return {
    count,
    capacity,
    load,
    totalCapacity,
    efficiency,
    rate,
    cost
  };
};

var consultantRowAsManagementProposal = function consultantRowAsManagementProposal(row){
  return {
    columnNumber:row.columnNumber || "",
    columnLoading:row.columnLoading || "",
    pileType:row.pileType || "",
    pileSize:String(row.pileSize || ""),
    numberOfPiles:String(row.numberOfPiles || "")
  };
};

var findBestManagementPileProposal = function findBestManagementPileProposal(consultantRow){
  const consultant = consultantPileRowCalculation(consultantRow);

  // Search priced pile references and practical quantities. Prefer designs
  // within 80%-90%; only when none exist, use the cheapest design below 80%.
  // Never propose an efficiency above 90%.
  if(
    consultant.load === null ||
    consultant.load <= 0
  ){
    return null;
  }

  const loading = consultant.load;
  const refs = managementPileReference()
    .filter(row => Number(row.pileCapacity) > 0);

  const candidates = [];

  refs.forEach(ref => {
    const capacity = Number(ref.pileCapacity);
    const rate = pileReferenceRate(ref.pileType, ref.pileSize);

    // A known rate is required so Auto can genuinely select the cheapest
    // suitable option instead of guessing about cost.
    if(rate === null) return;

    for(let count = 1; count <= 20; count += 1){
      const totalCapacity = capacity * count;
      const efficiency = loading / totalCapacity;
      const cost = rate * count;

      if(efficiency <= 0 || efficiency > PILE_EFFICIENCY_TARGET_MAX){
        continue;
      }

      candidates.push({
        pileType:ref.pileType,
        pileSize:String(ref.pileSize),
        numberOfPiles:String(count),
        columnLoading:String(consultantRow.columnLoading || ""),
        efficiency,
        cost,
        capacity
      });
    }
  });

  const withinTarget = candidates.filter(item => item.efficiency >= PILE_EFFICIENCY_TARGET_MIN);
  const eligible = withinTarget.length
    ? withinTarget
    : candidates.filter(item => item.efficiency < PILE_EFFICIENCY_TARGET_MIN);

  if(!eligible.length){
    return null;
  }

  eligible.sort((a,b) => {
    if(a.cost !== b.cost){
      return a.cost - b.cost;
    }

    const pileDifference =
      Number(a.numberOfPiles) - Number(b.numberOfPiles);

    if(pileDifference !== 0){
      return pileDifference;
    }

    const tieTarget = withinTarget.length
      ? PILE_EFFICIENCY_TARGET_MAX
      : PILE_EFFICIENCY_TARGET_MIN;
    const efficiencyDifference =
      Math.abs(a.efficiency - tieTarget) -
      Math.abs(b.efficiency - tieTarget);

    if(efficiencyDifference !== 0){
      return efficiencyDifference;
    }

    return a.capacity - b.capacity;
  });

  return eligible[0];
};

var loadStoredManagementPileProposal = function loadStoredManagementPileProposal(submissionId){
  const store =
    loadStorage(
      ECO_FRESH_STORAGE.pileOptimisation,
      {}
    );

  return Array.isArray(store[submissionId])
    ? store[submissionId]
    : null;
};

var saveStoredManagementPileProposal = function saveStoredManagementPileProposal(){
  if(!managementPileCheckSubmissionId){
    return;
  }

  const store =
    loadStorage(
      ECO_FRESH_STORAGE.pileOptimisation,
      {}
    );

  store[managementPileCheckSubmissionId] =
    managementPileProposalRows;

  saveStorage(
    ECO_FRESH_STORAGE.pileOptimisation,
    store
  );
};

var initialiseManagementPileProposal = function initialiseManagementPileProposal(submission){
  const consultantRows =
    Array.isArray(submission.formData?.loadingCapacityRows)
      ? submission.formData.loadingCapacityRows
      : [];

  const stored =
    loadStoredManagementPileProposal(submission.id);

  managementPileProposalRows =
    consultantRows.map((row,index) => {
      const base = consultantRowAsManagementProposal(row);

      const storedRow =
        stored && stored.length === consultantRows.length
          ? stored[index]
          : null;

      // Opening Pile Check does not auto-change a row. Keep the last internal
      // selection when available; otherwise begin from the Consultant design.
      // Auto is applied only when the user clicks the Auto button.
      if(storedRow){
        return {
          ...base,
          ...storedRow,
          columnNumber:base.columnNumber,
          columnLoading:base.columnLoading
        };
      }

      return base;
    });
};

var managementPileTotals = function managementPileTotals(){
  const submission =
    managementSubmissionById(
      managementPileCheckSubmissionId
    );

  const consultantRows =
    submission?.formData?.loadingCapacityRows || [];

  let consultantPiles = 0;
  let consultantCapacity = 0;
  let consultantLoading = 0;
  let consultantCost = 0;
  let consultantCostComplete = true;

  let proposalPiles = 0;
  let proposalCapacity = 0;
  let proposalLoading = 0;
  let proposalCost = 0;
  let proposalCostComplete = true;

  consultantRows.forEach(row => {
    const calc =
      consultantPileRowCalculation(row);

    if(calc.count !== null){
      consultantPiles += calc.count;
    }

    if(calc.totalCapacity !== null){
      consultantCapacity += calc.totalCapacity;
    }

    if(calc.load !== null){
      consultantLoading += calc.load;
    }

    if(calc.cost === null){
      consultantCostComplete = false;
    }else{
      consultantCost += calc.cost;
    }
  });

  managementPileProposalRows.forEach(row => {
    const calc =
      managementProposalRowCalculation(row);

    if(calc.count !== null){
      proposalPiles += calc.count;
    }

    if(calc.totalCapacity !== null){
      proposalCapacity += calc.totalCapacity;
    }

    if(calc.load !== null){
      proposalLoading += calc.load;
    }

    if(calc.cost === null){
      proposalCostComplete = false;
    }else{
      proposalCost += calc.cost;
    }
  });

  return {
    consultantPiles,
    consultantCapacity,
    consultantLoading,
    consultantEfficiency:
      consultantCapacity > 0
        ? consultantLoading /
          consultantCapacity
        : null,
    consultantCost,
    consultantCostComplete,

    proposalPiles,
    proposalCapacity,
    proposalLoading,
    proposalEfficiency:
      proposalCapacity > 0
        ? proposalLoading /
          proposalCapacity
        : null,
    proposalCost,
    proposalCostComplete
  };
};

var moneyDisplay = function moneyDisplay(value){
  return Number(value)
    .toLocaleString(
      undefined,
      {
        style:"currency",
        currency:"MYR",
        maximumFractionDigits:0
      }
    );
};

var pileCapacityDisplay = function pileCapacityDisplay(value){
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString(undefined,{ maximumFractionDigits:0 })
    : "—";
};

var renderManagementPileSummary = function renderManagementPileSummary(){
  const totals =
    managementPileTotals();

  if(
    totals.consultantCostComplete &&
    totals.proposalCostComplete
  ){
    const saving =
      totals.consultantCost -
      totals.proposalCost;

    $("managementPileSaving").textContent =
      moneyDisplay(saving);

    $("managementPileSavingHint").textContent =
      saving >= 0
        ? "Potential saving against Consultant submission"
        : "Internal reference is currently more expensive";
  }else{
    $("managementPileSaving").textContent =
      "TBC";

    $("managementPileSavingHint").textContent =
      "Complete missing prices in Pile Reference";
  }

  const quantityDiff =
    totals.proposalPiles -
    totals.consultantPiles;

  $("managementPileQuantityDifference").textContent =
    `${quantityDiff > 0 ? "+" : ""}${quantityDiff}`;

  $("managementPileQuantityHint").textContent =
    quantityDiff > 0
      ? `Internal reference uses ${quantityDiff} more pile${quantityDiff === 1 ? "" : "s"}`
      : quantityDiff < 0
        ? `Internal reference uses ${Math.abs(quantityDiff)} fewer pile${Math.abs(quantityDiff) === 1 ? "" : "s"}`
        : "Same total pile quantity";

  if(
    totals.consultantEfficiency !== null &&
    totals.proposalEfficiency !== null
  ){
    const diff =
      (
        totals.proposalEfficiency -
        totals.consultantEfficiency
      ) * 100;

    const rounded =
      Number(diff.toFixed(1));

    $("managementPileEfficiencyDifference").textContent =
      `${rounded > 0 ? "+" : ""}${rounded}%`;

    $("managementPileEfficiencyHint").textContent =
      rounded > 0
        ? "Internal reference has higher overall efficiency"
        : rounded < 0
          ? "Internal reference has lower overall efficiency"
          : "Same overall pile efficiency";
  }else{
    $("managementPileEfficiencyDifference").textContent =
      "—";

    $("managementPileEfficiencyHint").textContent =
      "Complete loading and capacity data";
  }
};

var renderManagementPileOverallRow = function renderManagementPileOverallRow(){
  const totals = managementPileTotals();

  const consultantCost =
    totals.consultantCostComplete
      ? moneyDisplay(totals.consultantCost)
      : "TBC";

  const proposalCost =
    totals.proposalCostComplete
      ? moneyDisplay(totals.proposalCost)
      : "TBC";

  return `
    <tr class="management-pile-total-row">
      <td class="management-pile-total-label">Total / Overall</td>
      <td class="management-pile-total-value">${escapeHtml(pileCapacityDisplay(totals.consultantLoading))}</td>

      <td class="management-pile-total-muted">—</td>
      <td class="management-pile-total-muted">—</td>
      <td class="management-pile-total-value">${escapeHtml(String(totals.consultantPiles))}</td>
      <td class="management-pile-total-value">${escapeHtml(pileCapacityDisplay(totals.consultantCapacity))}</td>
      <td class="management-pile-total-value ${escapeHtml(loadingEfficiencyClass(totals.consultantEfficiency))}">${escapeHtml(formatLoadingEfficiency(totals.consultantEfficiency))}</td>
      <td class="management-pile-total-value">${escapeHtml(consultantCost)}</td>

      <td class="management-pile-total-muted">—</td>
      <td class="management-pile-total-muted">—</td>
      <td class="management-pile-total-value">${escapeHtml(String(totals.proposalPiles))}</td>
      <td class="management-pile-total-value">${escapeHtml(pileCapacityDisplay(totals.proposalCapacity))}</td>
      <td class="management-pile-total-value ${escapeHtml(loadingEfficiencyClass(totals.proposalEfficiency))}">${escapeHtml(formatLoadingEfficiency(totals.proposalEfficiency))}</td>
      <td class="management-pile-total-value">${escapeHtml(proposalCost)}</td>
      <td class="management-pile-total-muted">—</td>
    </tr>
  `;
};

var renderManagementPileCheck = function renderManagementPileCheck(){
  const submission =
    managementSubmissionById(
      managementPileCheckSubmissionId
    );

  if(!submission) return;

  const consultantRows =
    submission.formData?.loadingCapacityRows || [];

  $("managementPileCheckMeta").textContent =
    `${submission.project || "Project"} · ${submission.revision || ""}`;

  const body =
    $("managementPileCheckBody");

  if(!consultantRows.length){
    body.innerHTML = `
      <tr>
        <td colspan="15" class="management-pile-empty">
          Consultant did not submit Loading &amp; Capacity rows.
        </td>
      </tr>
    `;

    renderManagementPileSummary();
    return;
  }

  body.innerHTML =
    consultantRows.map((row,index) => {
      const consultant =
        consultantPileRowCalculation(row);

      const proposal =
        managementPileProposalRows[index] || {};

      // Always use the current Consultant loading for the internal calculation.
      // This prevents an older saved proposal from showing a stale efficiency.
      proposal.columnNumber = row.columnNumber || "";
      proposal.columnLoading = row.columnLoading || "";

      const proposalCalc =
        managementProposalRowCalculation(proposal);

      const proposalTypes =
        pileTypesFromManagementReference();

      const proposalSizes =
        pileSizesFromManagementReference(
          proposal.pileType
        );

      return `
        <tr>
          <td>${escapeHtml(row.columnNumber || `C${index + 1}`)}</td>
          <td>${escapeHtml(row.columnLoading || "—")}</td>

          <td>${escapeHtml(row.pileType || "—")}</td>
          <td>${escapeHtml(row.pileSize || "—")}</td>
          <td>${escapeHtml(row.numberOfPiles || "—")}</td>
          <td>${escapeHtml(pileCapacityDisplay(consultant.totalCapacity))}</td>
          <td class="${escapeHtml(loadingEfficiencyClass(consultant.efficiency))}">${escapeHtml(formatLoadingEfficiency(consultant.efficiency))}</td>
          <td>${
            consultant.cost !== null
              ? escapeHtml(moneyDisplay(consultant.cost))
              : "TBC"
          }</td>

          <td>
            <select
              data-management-pile-index="${index}"
              data-management-pile-field="pileType"
            >
              ${proposalTypes.map(type => `
                <option
                  value="${escapeHtml(type)}"
                  ${proposal.pileType === type ? "selected" : ""}
                >${escapeHtml(type)}</option>
              `).join("")}
            </select>
          </td>

          <td>
            <select
              data-management-pile-index="${index}"
              data-management-pile-field="pileSize"
            >
              ${proposalSizes.map(size => `
                <option
                  value="${escapeHtml(size)}"
                  ${String(proposal.pileSize) === String(size) ? "selected" : ""}
                >${escapeHtml(size)}</option>
              `).join("")}
            </select>
          </td>

          <td>
            <input
              type="number"
              min="1"
              max="20"
              value="${escapeHtml(proposal.numberOfPiles || "")}"
              data-management-pile-index="${index}"
              data-management-pile-field="numberOfPiles"
            />
          </td>

          <td>${escapeHtml(pileCapacityDisplay(proposalCalc.totalCapacity))}</td>
          <td class="${escapeHtml(loadingEfficiencyClass(proposalCalc.efficiency))}">${escapeHtml(formatLoadingEfficiency(proposalCalc.efficiency))}</td>
          <td>${
            proposalCalc.cost !== null
              ? escapeHtml(moneyDisplay(proposalCalc.cost))
              : "TBC"
          }</td>

          <td>
            <button
              type="button"
              class="management-row-auto-btn"
              data-management-auto-row="${index}"
            >Auto</button>
          </td>
        </tr>
      `;
    }).join("") + renderManagementPileOverallRow();

  renderManagementPileSummary();
};

var openManagementPileCheck = function openManagementPileCheck(submissionId){
  const submission =
    managementSubmissionById(submissionId);

  if(!submission) return;

  managementPileCheckSubmissionId =
    submissionId;

  initialiseManagementPileProposal(submission);

  renderManagementPileCheck();

  $("managementPileCheckModal")
    .classList.remove("hidden");

  document.body
    .classList.add("modal-open");
};

var closeManagementPileCheck = function closeManagementPileCheck(){
  saveStoredManagementPileProposal();

  $("managementPileCheckModal")
    .classList.add("hidden");

  document.body
    .classList.remove("modal-open");
};

var autoOptimiseManagementRow = function autoOptimiseManagementRow(index){
  const submission =
    managementSubmissionById(managementPileCheckSubmissionId);

  const consultantRow =
    submission?.formData?.loadingCapacityRows?.[index];

  const row = managementPileProposalRows[index];

  if(!row || !consultantRow) return;

  const best = findBestManagementPileProposal(consultantRow);

  if(!best) return;

  managementPileProposalRows[index] = {
    ...row,
    columnNumber:consultantRow.columnNumber || "",
    columnLoading:consultantRow.columnLoading || "",
    pileType:best.pileType,
    pileSize:best.pileSize,
    numberOfPiles:best.numberOfPiles
  };

  renderManagementPileCheck();
};

/* ------------------------------------------------------------
   Internal Pile Check
   ------------------------------------------------------------ */
;

/* ---- js/management/legacy-events.js ---- */


/* ------------------------------------------------------------
   Initialisation + event binding
   ------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
  $("managementSubmissionSearch")
    ?.addEventListener(
      "input",
      renderManagementOverview
    );

  $("managementRegionFilter")
    ?.addEventListener(
      "change",
      renderManagementOverview
    );

  $("managementBuildingFilter")
    ?.addEventListener(
      "change",
      renderManagementOverview
    );

  $("managementSubmissionList")
    ?.addEventListener(
      "click",
      event => {
        const viewButton =
          event.target.closest(
            "[data-management-view-submission]"
          );

        if(viewButton){
          openManagementSubmissionModal(
            viewButton.dataset.managementViewSubmission
          );
          return;
        }

        const pileButton =
          event.target.closest(
            "[data-management-pile-check]"
          );

        if(pileButton){
          openManagementPileCheck(
            pileButton.dataset.managementPileCheck
          );
        }
      }
    );

  [
    "closeManagementSubmissionModal",
    "doneManagementSubmissionModal"
  ].forEach(id =>
    $(id)?.addEventListener(
      "click",
      closeManagementSubmissionModal
    )
  );

  $("managementSubmissionModal")
    ?.addEventListener(
      "click",
      event => {
        const openFolderButton = event.target.closest(
          "[data-management-open-file-folder]"
        );

        if(openFolderButton){
          openManagementDrawingFolderModal(
            openFolderButton.dataset.managementOpenFileFolder,
            openFolderButton.dataset.managementFileFolderField,
            openFolderButton.dataset.managementFileFolderLabel
          );
          return;
        }

        if(
          event.target ===
          $("managementSubmissionModal")
        ){
          closeManagementSubmissionModal();
        }
      }
    );

  [
    "closeManagementDrawingFolderModal",
    "doneManagementDrawingFolderModal"
  ].forEach(id =>
    $(id)?.addEventListener(
      "click",
      closeManagementDrawingFolderModal
    )
  );

  $("managementDrawingFolderModal")
    ?.addEventListener(
      "click",
      event => {
        const openFileButton = event.target.closest(
          "[data-management-open-submission-file]"
        );

        if(openFileButton){
          openManagementSubmissionFile(
            openFileButton.dataset.managementOpenSubmissionFile,
            openFileButton.dataset.managementOpenFileField,
            openFileButton.dataset.managementOpenFileIndex
          );
          return;
        }

        if(event.target === $("managementDrawingFolderModal")){
          closeManagementDrawingFolderModal();
        }
      }
    );

  $("managementComparisonSlots")
    ?.addEventListener(
      "change",
      event => {
        const projectSelect =
          event.target.closest(
            "[data-comparison-project]"
          );

        if(projectSelect){
          const index =
            Number(
              projectSelect.dataset.comparisonProject
            );

          managementComparisonSelections[index] = {
            projectKey:projectSelect.value,
            revision:""
          };

          renderManagementComparisonSlots();
          renderManagementComparison();
          return;
        }

        const revisionSelect =
          event.target.closest(
            "[data-comparison-revision]"
          );

        if(revisionSelect){
          const index =
            Number(
              revisionSelect.dataset.comparisonRevision
            );

          managementComparisonSelections[index].revision =
            revisionSelect.value;

          renderManagementComparison();
        }
      }
    );

  $("saveConsultantTableSettings")
    ?.addEventListener(
      "click",
      () => {
        saveStorage(
          ECO_FRESH_STORAGE.tableSettings,
          collectManagementSettings()
        );

        renderManagementSettings();

        alert(
          "Consultant Submission table settings saved."
        );
      }
    );

  $("resetConsultantTableSettings")
    ?.addEventListener(
      "click",
      () => {
        if(
          !confirm(
            "Reset Consultant table settings to default?"
          )
        ){
          return;
        }

        EcoBackend.removeValue(ECO_FRESH_STORAGE.tableSettings)
          .catch(error => alert(`Could not reset settings: ${error.message}`));

        renderManagementSettings();
      }
    );

  $("managementPileReferenceBody")
    ?.addEventListener(
      "click",
      event => {
        const remove =
          event.target.closest(
            "[data-remove-pile-ref]"
          );

        if(!remove) return;

        remove.closest("tr")?.remove();
      }
    );

  $("addPileReferenceRowBtn")
    ?.addEventListener(
      "click",
      () => {
        const body =
          $("managementPileReferenceBody");

        const index =
          body.querySelectorAll("tr").length;

        body.insertAdjacentHTML(
          "beforeend",
          `
            <tr>
              <td><input type="text" data-pile-ref-index="${index}" data-pile-ref-field="pileType" placeholder="Pile Type" /></td>
              <td><input type="number" data-pile-ref-index="${index}" data-pile-ref-field="pileSize" placeholder="Size" /></td>
              <td><input type="number" data-pile-ref-index="${index}" data-pile-ref-field="pileCapacity" placeholder="Capacity" /></td>
              <td><input type="number" step="0.01" data-pile-ref-index="${index}" data-pile-ref-field="averagePrice" placeholder="Optional" /></td>
              <td><button type="button" class="management-table-delete-btn" data-remove-pile-ref="${index}">×</button></td>
            </tr>
          `
        );
      }
    );

  $("savePileReferenceBtn")
    ?.addEventListener(
      "click",
      () => {
        const rows =
          collectManagementPileReference();

        if(!rows.length){
          alert(
            "Add at least one valid pile reference."
          );
          return;
        }

        saveManagementPileReference(rows);
        renderManagementPileReference();

        alert(
          "Pile Reference saved. Consultant calculations now use the updated values."
        );
      }
    );

  $("resetPileReferenceBtn")
    ?.addEventListener(
      "click",
      () => {
        if(
          !confirm(
            "Reset Pile Reference to default values?"
          )
        ){
          return;
        }

        EcoBackend.removeValue(ECO_FRESH_STORAGE.pileReference)
          .catch(error => alert(`Could not reset pile reference: ${error.message}`));

        renderManagementPileReference();
      }
    );

  [
    "closeManagementPileCheckModal",
    "closeManagementPileCheckBottom"
  ].forEach(id =>
    $(id)?.addEventListener(
      "click",
      closeManagementPileCheck
    )
  );

  $("managementPileCheckModal")
    ?.addEventListener(
      "click",
      event => {
        if(
          event.target ===
          $("managementPileCheckModal")
        ){
          closeManagementPileCheck();
        }
      }
    );

  $("managementPileCheckBody")
    ?.addEventListener(
      "change",
      event => {
        const input =
          event.target.closest(
            "[data-management-pile-index][data-management-pile-field]"
          );

        if(!input) return;

        const index =
          Number(
            input.dataset.managementPileIndex
          );

        const field =
          input.dataset.managementPileField;

        const row =
          managementPileProposalRows[index];

        if(!row) return;

        row[field] =
          input.value;

        if(field === "pileType"){
          const sizes =
            pileSizesFromManagementReference(
              row.pileType
            );

          row.pileSize =
            sizes.includes(
              String(row.pileSize)
            )
              ? String(row.pileSize)
              : (sizes[0] || "");
        }

        renderManagementPileCheck();
      }
    );

  $("managementPileCheckBody")
    ?.addEventListener(
      "click",
      event => {
        const auto =
          event.target.closest(
            "[data-management-auto-row]"
          );

        if(!auto) return;

        autoOptimiseManagementRow(
          Number(
            auto.dataset.managementAutoRow
          )
        );
      }
    );

  $("managementAutoOptimiseAll")
    ?.addEventListener(
      "click",
      () => {
        managementPileProposalRows
          .forEach((row,index) =>
            autoOptimiseManagementRow(index)
          );

        renderManagementPileCheck();
      }
    );

});
;

/* ---- js/management/settings-config.js ---- */
var clonePortalObject = function clonePortalObject(value){
  return JSON.parse(JSON.stringify(value));
};

var defaultPortalHierarchyConfig = function defaultPortalHierarchyConfig(){
  return {
    regionBusinessUnits:
      clonePortalObject(REGION_BUSINESS_UNITS),
    businessUnitProjects:
      clonePortalObject(BUSINESS_UNIT_PROJECTS)
  };
};

var getPortalHierarchyConfig = function getPortalHierarchyConfig(){
  const stored =
    loadStorage(
      ECO_FRESH_STORAGE.portalHierarchy,
      null
    );

  const defaults =
    defaultPortalHierarchyConfig();

  if(
    !stored ||
    typeof stored !== "object"
  ){
    return defaults;
  }

  return {
    regionBusinessUnits:{
      ...defaults.regionBusinessUnits,
      ...(stored.regionBusinessUnits || {})
    },
    businessUnitProjects:{
      ...defaults.businessUnitProjects,
      ...(stored.businessUnitProjects || {})
    }
  };
};

var savePortalHierarchyConfig = function savePortalHierarchyConfig(config){
  saveStorage(
    ECO_FRESH_STORAGE.portalHierarchy,
    config
  );
};

var getConfiguredRegionBusinessUnits = function getConfiguredRegionBusinessUnits(){
  return getPortalHierarchyConfig()
    .regionBusinessUnits;
};

var getConfiguredBusinessUnitProjects = function getConfiguredBusinessUnitProjects(){
  return getPortalHierarchyConfig()
    .businessUnitProjects;
};

var overviewRowByKey = function overviewRowByKey(key){
  for(const section of OVERVIEW_SECTIONS){
    const row =
      section.rows.find(item =>
        item.key === key
      );

    if(row){
      return row;
    }
  }

  return null;
};

var defaultConsultantDropdownOptions = function defaultConsultantDropdownOptions(){
  return {
    buildingType:[
      ...(overviewRowByKey("buildingType")?.options || [
        "High Rise",
        "Landed"
      ])
    ],

    landedType:[
      "Terrace 22x70",
      "Terrace 20x70",
      "Semi-D",
      "Bungalow",
      "Cluster / Link"
    ],

    highRiseType:[
      ...(overviewRowByKey("highRiseType")?.options || [])
    ],

    highRiseCategory:[
      ...(overviewRowByKey("highRiseCategory")?.options || [])
    ],

    transferFloor:[
      ...(overviewRowByKey("transferFloor")?.options || [])
    ],

    revision:[
      "Rev 0",
      "Rev 1",
      "Rev 2",
      "Rev 3"
    ]
  };
};

var getConfiguredDropdownOptions = function getConfiguredDropdownOptions(){
  const defaults =
    defaultConsultantDropdownOptions();

  const stored =
    loadStorage(
      ECO_FRESH_STORAGE.dropdownOptions,
      null
    );

  if(!stored){
    return defaults;
  }

  const merged = {};

  Object.keys(defaults)
    .forEach(key => {
      merged[key] =
        Array.isArray(stored[key]) &&
        stored[key].length
          ? stored[key]
          : defaults[key];
    });

  return merged;
};

var saveConfiguredDropdownOptions = function saveConfiguredDropdownOptions(config){
  saveStorage(
    ECO_FRESH_STORAGE.dropdownOptions,
    config
  );
};

var getConsultantDropdownOptions = function getConsultantDropdownOptions(key, fallback=[]){
  if(key === "pileType"){
    const pileTypes =
      pileTypesFromManagementReference();

    return pileTypes.length
      ? pileTypes
      : fallback;
  }

  const config =
    getConfiguredDropdownOptions();

  return Array.isArray(config[key]) &&
    config[key].length
      ? config[key]
      : fallback;
};

var getConfiguredRevisionOptions = function getConfiguredRevisionOptions(){
  return getConsultantDropdownOptions(
    "revision",
    ["Rev 0","Rev 1","Rev 2","Rev 3"]
  );
};

var isConsultantSectionVisible = function isConsultantSectionVisible(sectionTitle){
  const settings =
    getConsultantTableSettings();

  return settings.sections?.[sectionTitle]?.visible !== false;
};

var consultantSectionLabel = function consultantSectionLabel(sectionTitle){
  const settings =
    getConsultantTableSettings();

  return (
    settings.sections?.[sectionTitle]?.label ||
    sectionTitle
  );
};

var isConsultantRowVisible = function isConsultantRowVisible(sectionTitle,rowKey){
  const settings =
    getConsultantTableSettings();

  return (
    settings.rows?.[
      consultantSettingsKey(sectionTitle,rowKey)
    ]?.visible !== false
  );
};

var consultantRowLabel = function consultantRowLabel(sectionTitle,rowKey,fallback){
  const settings =
    getConsultantTableSettings();

  return (
    settings.rows?.[
      consultantSettingsKey(sectionTitle,rowKey)
    ]?.label || fallback
  );
};

var managementSettingsDropdownLabel = function managementSettingsDropdownLabel(key){
  return (
    MANAGEMENT_DROPDOWN_DEFINITIONS_V20
      .find(item =>
        item.key === key
      )?.label ||
    key
  );
};

var renderManagementDropdownSettings = function renderManagementDropdownSettings(){
  const typeSelect =
    $("settingsDropdownTypeSelect");

  const list =
    $("settingsDropdownOptionList");

  if(!typeSelect || !list){
    return;
  }

  typeSelect.innerHTML =
    MANAGEMENT_DROPDOWN_DEFINITIONS_V20
      .map(item => `
        <option
          value="${escapeHtml(item.key)}"
          ${managementSettingsDropdownKey === item.key ? "selected" : ""}
        >
          ${escapeHtml(item.label)}
        </option>
      `)
      .join("");

  const config =
    getConfiguredDropdownOptions();

  const options =
    config[managementSettingsDropdownKey] || [];

  list.innerHTML =
    options.length
      ? options
          .map((option,index) => `
            <div class="management-dropdown-option-row">
              <span>${index + 1}</span>

              <input
                type="text"
                value="${escapeHtml(option)}"
                data-settings-dropdown-option="${index}"
              />

              <button
                type="button"
                class="management-table-delete-btn"
                data-remove-settings-dropdown-option="${index}"
                title="Remove option"
              >×</button>
            </div>
          `)
          .join("")
      : `
          <div class="management-settings-empty">
            No options yet. Add one above.
          </div>
        `;
};

var addManagementConsultantTableRowV21 = function addManagementConsultantTableRowV21(sectionTitle){
  const label =
    prompt(`Enter the new row name for ${sectionTitle}:`)
      ?.trim();

  if(!label) return;

  const settings =
    typeof collectManagementSettings === "function"
      ? collectManagementSettings()
      : getConsultantTableSettings();

  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"_")
    .replace(/^_+|_+$/g,"") || "custom_row";

  const key =
    `custom_${base}_${Date.now().toString(36)}`;

  settings.customRows = [
    ...(settings.customRows || []),
    {
      section:sectionTitle,
      key,
      label,
      type:"text",
      placeholder:"Enter value"
    }
  ];

  settings.rows[
    consultantSettingsKey(sectionTitle,key)
  ] = {
    visible:true,
    label
  };

  saveStorage(
    ECO_FRESH_STORAGE.tableSettings,
    settings
  );

  renderManagementConsultantTableSettingsV21();
};

var removeManagementConsultantTableRowV21 = function removeManagementConsultantTableRowV21(sectionTitle,rowKey){
  const settings =
    typeof collectManagementSettings === "function"
      ? collectManagementSettings()
      : getConsultantTableSettings();

  const customRow =
    (settings.customRows || [])
      .find(row =>
        row.section === sectionTitle &&
        row.key === rowKey
      );

  if(!customRow) return;

  if(
    !confirm(
      `Remove “${customRow.label}” from the Consultant Submission table?`
    )
  ){
    return;
  }

  settings.customRows =
    settings.customRows.filter(row =>
      !(
        row.section === sectionTitle &&
        row.key === rowKey
      )
    );

  delete settings.rows[
    consultantSettingsKey(sectionTitle,rowKey)
  ];

  saveStorage(
    ECO_FRESH_STORAGE.tableSettings,
    settings
  );

  renderManagementConsultantTableSettingsV21();
};

var collectCurrentDropdownOptionsFromUI = function collectCurrentDropdownOptionsFromUI(){
  return [
    ...document.querySelectorAll(
      "[data-settings-dropdown-option]"
    )
  ]
    .map(input =>
      input.value.trim()
    )
    .filter(Boolean);
};

var saveCurrentManagementDropdownOptions = function saveCurrentManagementDropdownOptions(){
  const config =
    getConfiguredDropdownOptions();

  const values =
    collectCurrentDropdownOptionsFromUI();

  if(!values.length){
    alert(
      `${managementSettingsDropdownLabel(managementSettingsDropdownKey)} must contain at least one option.`
    );
    return false;
  }

  config[managementSettingsDropdownKey] =
    [...new Set(values)];

  saveConfiguredDropdownOptions(config);

  return true;
};

var addManagementHierarchyRegion = function addManagementHierarchyRegion(){
  const name =
    prompt("Enter new Region name:")
      ?.trim();

  if(!name) return;

  const config =
    getPortalHierarchyConfig();

  if(config.regionBusinessUnits[name]){
    alert("This Region already exists.");
    return;
  }

  config.regionBusinessUnits[name] = [];
  savePortalHierarchyConfig(config);

  managementSettingsSelectedRegion = name;
  managementSettingsSelectedBusinessUnit = "";
  managementSettingsSelectedProject = "";

  renderManagementSettingsHierarchy();
};

var addManagementHierarchyBusinessUnit = function addManagementHierarchyBusinessUnit(){
  if(!managementSettingsSelectedRegion){
    alert("Select a Region first.");
    return;
  }

  const name =
    prompt("Enter new Business Unit name:")
      ?.trim();

  if(!name) return;

  const config =
    getPortalHierarchyConfig();

  const list =
    config.regionBusinessUnits[
      managementSettingsSelectedRegion
    ] || [];

  if(list.includes(name)){
    alert("This Business Unit already exists in the selected Region.");
    return;
  }

  list.push(name);

  config.regionBusinessUnits[
    managementSettingsSelectedRegion
  ] = list;

  if(
    !config.businessUnitProjects[name]
  ){
    config.businessUnitProjects[name] = [];
  }

  savePortalHierarchyConfig(config);

  managementSettingsSelectedBusinessUnit =
    name;

  managementSettingsSelectedProject = "";

  renderManagementSettingsHierarchy();
};

var addManagementHierarchyProject = function addManagementHierarchyProject(){
  if(!managementSettingsSelectedBusinessUnit){
    alert("Select a Business Unit first.");
    return;
  }

  const name =
    prompt("Enter new Project name:")
      ?.trim();

  if(!name) return;

  const config =
    getPortalHierarchyConfig();

  const list =
    config.businessUnitProjects[
      managementSettingsSelectedBusinessUnit
    ] || [];

  if(list.includes(name)){
    alert("This Project already exists.");
    return;
  }

  list.push(name);

  config.businessUnitProjects[
    managementSettingsSelectedBusinessUnit
  ] = list;

  savePortalHierarchyConfig(config);

  managementSettingsSelectedProject =
    name;

  renderManagementSettingsHierarchy();
};

var removeManagementHierarchyProject = function removeManagementHierarchyProject(){
  if(!managementSettingsSelectedProject){
    alert("Select a Project to remove.");
    return;
  }

  if(
    !confirm(
      `Remove project "${managementSettingsSelectedProject}" from the Consultant dropdown?`
    )
  ){
    return;
  }

  const config =
    getPortalHierarchyConfig();

  config.businessUnitProjects[
    managementSettingsSelectedBusinessUnit
  ] = (
    config.businessUnitProjects[
      managementSettingsSelectedBusinessUnit
    ] || []
  ).filter(project =>
    project !== managementSettingsSelectedProject
  );

  managementSettingsSelectedProject = "";

  savePortalHierarchyConfig(config);
  renderManagementSettingsHierarchy();
};

var removeManagementHierarchyBusinessUnit = function removeManagementHierarchyBusinessUnit(){
  if(!managementSettingsSelectedBusinessUnit){
    alert("Select a Business Unit to remove.");
    return;
  }

  if(
    !confirm(
      `Remove Business Unit "${managementSettingsSelectedBusinessUnit}" and its project dropdown entries?`
    )
  ){
    return;
  }

  const config =
    getPortalHierarchyConfig();

  config.regionBusinessUnits[
    managementSettingsSelectedRegion
  ] = (
    config.regionBusinessUnits[
      managementSettingsSelectedRegion
    ] || []
  ).filter(unit =>
    unit !== managementSettingsSelectedBusinessUnit
  );

  delete config.businessUnitProjects[
    managementSettingsSelectedBusinessUnit
  ];

  managementSettingsSelectedBusinessUnit = "";
  managementSettingsSelectedProject = "";

  savePortalHierarchyConfig(config);
  renderManagementSettingsHierarchy();
};

var removeManagementHierarchyRegion = function removeManagementHierarchyRegion(){
  if(!managementSettingsSelectedRegion){
    alert("Select a Region to remove.");
    return;
  }

  if(
    !confirm(
      `Remove Region "${managementSettingsSelectedRegion}" and its Business Unit dropdown entries?`
    )
  ){
    return;
  }

  const config =
    getPortalHierarchyConfig();

  const units =
    config.regionBusinessUnits[
      managementSettingsSelectedRegion
    ] || [];

  units.forEach(unit => {
    delete config.businessUnitProjects[unit];
  });

  delete config.regionBusinessUnits[
    managementSettingsSelectedRegion
  ];

  managementSettingsSelectedRegion = "";
  managementSettingsSelectedBusinessUnit = "";
  managementSettingsSelectedProject = "";

  savePortalHierarchyConfig(config);
  renderManagementSettingsHierarchy();
};

/* ============================================================
   V20 MANAGEMENT OVERRIDES
   - Dynamic project hierarchy
   - Consultant dropdown settings
   - Consultant-style Overview project bar
   - Dynamic Comparison columns
   ============================================================ */

const MANAGEMENT_DROPDOWN_DEFINITIONS_V20 = [
  { key:"buildingType", label:"Type of Building" },
  { key:"landedType", label:"Landed Type / Terrace Type" },
  { key:"highRiseType", label:"High Rise Type" },
  { key:"highRiseCategory", label:"High Rise Category" },
  { key:"transferFloor", label:"Transfer Floor Type" },
  { key:"revision", label:"Revision" }
];

let managementSettingsSelectedRegion = "";
let managementSettingsSelectedBusinessUnit = "";
let managementSettingsSelectedProject = "";
let managementSettingsDropdownKey = "landedType";

let managementOverviewSelectionV20 = {
  region:"",
  businessUnit:"",
  project:""
};

/* ---------------- Project hierarchy ---------------- */













/* ---------------- Consultant dropdown options ---------------- */













/* Consultant Submission table configuration */








/* ---------------- Settings UI ---------------- */
;

/* ---- js/management/overview.js ---- */
var populateManagementOverviewSelectorsV20 = function populateManagementOverviewSelectorsV20(){
  const regionSelect =
    $("managementOverviewRegionSelect");

  const businessUnitSelect =
    $("managementOverviewBusinessUnitSelect");

  const projectSelect =
    $("managementOverviewProjectSelect");

  if(
    !regionSelect ||
    !businessUnitSelect ||
    !projectSelect
  ){
    return;
  }

  const hierarchy =
    getPortalHierarchyConfig();

  const regions =
    Object.keys(
      hierarchy.regionBusinessUnits
    );

  if(
    managementOverviewSelectionV20.region &&
    !regions.includes(
      managementOverviewSelectionV20.region
    )
  ){
    managementOverviewSelectionV20 = {
      region:"",
      businessUnit:"",
      project:""
    };
  }

  regionSelect.innerHTML =
    `<option value="">All Regions</option>` +
    regions.map(region =>
      `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`
    ).join("");

  regionSelect.value =
    managementOverviewSelectionV20.region;

  const businessUnits =
    managementOverviewSelectionV20.region
      ? (
          hierarchy.regionBusinessUnits[
            managementOverviewSelectionV20.region
          ] || []
        )
      : [];

  businessUnitSelect.disabled =
    !managementOverviewSelectionV20.region;

  businessUnitSelect.innerHTML =
    !managementOverviewSelectionV20.region
      ? `<option value="">Select region first</option>`
      : (
          `<option value="">All Business Units</option>` +
          businessUnits
            .map(unit =>
              `<option value="${escapeHtml(unit)}">${escapeHtml(unit)}</option>`
            )
            .join("")
        );

  if(
    businessUnits.includes(
      managementOverviewSelectionV20.businessUnit
    )
  ){
    businessUnitSelect.value =
      managementOverviewSelectionV20.businessUnit;
  }else{
    managementOverviewSelectionV20.businessUnit = "";
    managementOverviewSelectionV20.project = "";
  }

  const projects =
    managementOverviewSelectionV20.businessUnit
      ? (
          hierarchy.businessUnitProjects[
            managementOverviewSelectionV20.businessUnit
          ] || []
        )
      : [];

  projectSelect.disabled =
    !managementOverviewSelectionV20.businessUnit;

  projectSelect.innerHTML =
    !managementOverviewSelectionV20.businessUnit
      ? `<option value="">Select business unit first</option>`
      : (
          `<option value="">All Projects</option>` +
          projects
            .map(project =>
              `<option value="${escapeHtml(project)}">${escapeHtml(project)}</option>`
            )
            .join("")
        );

  if(
    projects.includes(
      managementOverviewSelectionV20.project
    )
  ){
    projectSelect.value =
      managementOverviewSelectionV20.project;
  }else{
    managementOverviewSelectionV20.project = "";
  }
};

var closeManagementOverviewProjectSearchV20 = function closeManagementOverviewProjectSearchV20(){
  $("managementOverviewProjectSearchResults")
    ?.classList.add("hidden");
};

var managementSubmissionSearchItems = function managementSubmissionSearchItems(){
  const search =
    $("managementOverviewProjectSearch")
      ?.value
      .trim()
      .toLowerCase() || "";

  return getSubmissions()
    .filter(item => {
      if(
        managementOverviewSelectionV20.region &&
        item.region !==
          managementOverviewSelectionV20.region
      ){
        return false;
      }

      if(
        managementOverviewSelectionV20.businessUnit &&
        item.businessUnit !==
          managementOverviewSelectionV20.businessUnit
      ){
        return false;
      }

      if(
        managementOverviewSelectionV20.project &&
        item.project !==
          managementOverviewSelectionV20.project
      ){
        return false;
      }

      if(
        search &&
        !managementOverviewSelectionV20.project
      ){
        const data = item.formData || {};

        const haystack = [
          item.project,
          item.region,
          item.businessUnit,
          item.revision,
          typeof submissionYearLabel === "function" ? submissionYearLabel(item) : (item.year || ""),
          data.consultantName
        ]
          .join(" ")
          .toLowerCase();

        if(!haystack.includes(search)){
          return false;
        }
      }

      return true;
    })
    .sort(
      (a,b) =>
        new Date(b.updatedAt || 0) -
        new Date(a.updatedAt || 0)
    );
};

var updateManagementOverviewStatusV20 = function updateManagementOverviewStatusV20(count){
  const status =
    $("managementOverviewStatus");

  if(!status) return;

  const parts = [];

  if(managementOverviewSelectionV20.region){
    parts.push(
      managementOverviewSelectionV20.region
    );
  }

  if(managementOverviewSelectionV20.businessUnit){
    parts.push(
      managementOverviewSelectionV20.businessUnit
    );
  }

  if(managementOverviewSelectionV20.project){
    parts.push(
      managementOverviewSelectionV20.project
    );
  }

  status.textContent =
    `${count} submission${count === 1 ? "" : "s"} shown` +
    (
      parts.length
        ? ` · ${parts.join(" → ")}`
        : " · All projects"
    );
};

var renderManagementOverview = function renderManagementOverview(){
  populateManagementOverviewSelectorsV20();
  renderManagementOverviewStats();

  const container =
    $("managementSubmissionList");

  const items =
    managementSubmissionSearchItems();

  updateManagementOverviewStatusV20(
    items.length
  );

  if(!items.length){
    container.innerHTML = `
      <div class="empty-state compact-card">
        <div>
          <div class="empty-icon">▣</div>
          <strong>No matching submissions</strong>
          <span>Try another project selection or search.</span>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML =
    items.map(item => {
      const data = item.formData || {};

      return `
        <article class="management-submission-card">
          <div class="management-submission-main">
            <div class="management-submission-title-row">
              <div>
                <h3>${escapeHtml(item.project || "Project")}</h3>

                <div class="history-meta">
                  <span class="meta-chip">${escapeHtml(item.region || "—")}</span>
                  <span class="meta-chip">${escapeHtml(item.businessUnit || "—")}</span>
                  <span class="meta-chip">${escapeHtml(item.revision || "—")}</span>
                  <span class="meta-chip">${escapeHtml(typeof submissionYearLabel === "function" ? submissionYearLabel(item) : (item.year || "—"))}</span>
                </div>
              </div>

              <span class="management-submission-date">
                ${escapeHtml(managementSubmissionUpdated(item))}
              </span>
            </div>

            <div class="management-submission-info-grid">
              <div>
                <span>Consultant</span>
                <strong>${escapeHtml(data.consultantName || "—")}</strong>
              </div>

              <div>
                <span>Building Type</span>
                <strong>${escapeHtml(data.buildingType || "—")}</strong>
              </div>

              <div>
                <span>Overall Pile Efficiency</span>
                <strong>${
                  data.overallEfficiency
                    ? `${escapeHtml(data.overallEfficiency)}%`
                    : "—"
                }</strong>
              </div>

              <div>
                <span>Total Piles</span>
                <strong>${escapeHtml(managementSubmissionTotalPiles(data))}</strong>
              </div>
            </div>
          </div>

          <div class="management-submission-actions">
            <button
              class="ghost-btn compact-btn"
              type="button"
              data-management-view-submission="${escapeHtml(item.id)}"
            >View Submission</button>

            <button
              class="primary-btn compact-btn"
              type="button"
              data-management-pile-check="${escapeHtml(item.id)}"
            >Internal Pile Check</button>
          </div>
        </article>
      `;
    }).join("");
};

/* ---------------- Overview: Consultant-style selector bar ---------------- */
;

/* ---- js/management/comparison.js ---- */
var openManagementComparisonFilterPopup = function openManagementComparisonFilterPopup(){
  if(managementComparisonFilterCloseTimer){
    clearTimeout(
      managementComparisonFilterCloseTimer
    );

    managementComparisonFilterCloseTimer =
      null;
  }

  if(!managementComparisonFiltersOpen){
    managementComparisonFiltersOpen = true;
    renderManagementComparisonFilters();
  }
};

var scheduleManagementComparisonFilterClose = function scheduleManagementComparisonFilterClose(){
  if(managementComparisonFiltersPinned){
    return;
  }

  if(managementComparisonFilterCloseTimer){
    clearTimeout(
      managementComparisonFilterCloseTimer
    );
  }

  managementComparisonFilterCloseTimer =
    setTimeout(() => {
      managementComparisonFiltersOpen = false;
      renderManagementComparisonFilters();
    }, 180);
};

var managementComparisonSectionDefinitions = function managementComparisonSectionDefinitions(){
  return [
    "Project Information",
    "Building Efficiency",
    "Pilling Info",
    "Pile Efficiency & Loading",
    "Poundage",
    "Drawings"
  ];
};

var managementComparisonSectionSelected = function managementComparisonSectionSelected(
  sectionTitle
){
  return managementComparisonSelectedSections
    .has(sectionTitle);
};

var managementComparisonProjectType = function managementComparisonProjectType(item){
  return managementComparisonNormalizedBuildingType(item);
};

var managementComparisonCategoryDefinitions = function managementComparisonCategoryDefinitions(){
  if(
    managementComparisonTypeFilter === "Landed"
  ){
    return [];
  }

  return [
    {
      key:"highRiseCategory",
      label:"Resi Block",
      options:getConsultantDropdownOptions(
        "highRiseCategory",
        [
          "Long Block",
          "1 or 2 Block",
          "L-Shape",
          "Split Block"
        ]
      )
    },
    {
      key:"transferFloor",
      label:"With / No Transfer Floor",
      options:getConsultantDropdownOptions(
        "transferFloor",
        [
          "Separate Carpark Block (No Transfer Floor)",
          "Resi Tower on Podium Carpark (With Transfer Floor)"
        ]
      )
    }
  ];
};

var managementComparisonResetCategoriesForType = function managementComparisonResetCategoriesForType(){
  managementComparisonActiveCategories =
    managementComparisonTypeFilter === "High Rise"
      ? [
          "highRiseCategory",
          "transferFloor"
        ]
      : [];

  Object.keys(
    managementComparisonCategorySelections
  ).forEach(key => {
    managementComparisonCategorySelections[key] =
      new Set();
  });

  managementComparisonCategoryAddKey = "";
};

var managementComparisonProjectMatchesCategories = function managementComparisonProjectMatchesCategories(item){
  const data =
    item.formData || {};

  return managementComparisonActiveCategories
    .every(key => {
      const selected =
        managementComparisonCategorySelections[key] ||
        new Set();

      if(!selected.size){
        return true;
      }

      const value =
        String(data[key] || "")
          .trim();

      return selected.has(value);
    });
};

var managementComparisonFilteredProjectOptions = function managementComparisonFilteredProjectOptions(){
  return managementComparisonProjectOptions()
    .filter(([,item]) => {
      if(
        managementComparisonProjectType(item) !==
        managementComparisonTypeFilter
      ){
        return false;
      }

      return managementComparisonProjectMatchesCategories(
        item
      );
    });
};

var managementComparisonFilterProjects = function managementComparisonFilterProjects(){
  const allOptions =
    managementComparisonFilteredProjectOptions();

  const unique = new Map();

  allOptions.forEach(([key,item]) => {
    const displayKey =
      `${item.project || ""}||${item.businessUnit || ""}`;

    if(!unique.has(displayKey)){
      unique.set(
        displayKey,
        [key,item]
      );
    }
  });

  return Array.from(unique.values());
};

var managementComparisonFilterProjectKey = function managementComparisonFilterProjectKey(item){
  return `${item.project || ""}||${item.businessUnit || ""}`;
};

var managementComparisonSelectedProjectKeys = function managementComparisonSelectedProjectKeys(){
  return new Set(
    managementComparisonSelections
      .filter(selection =>
        selection.projectKey
      )
      .map(selection => {
        const match =
          managementComparisonProjectOptions()
            .find(([key]) =>
              key === selection.projectKey
            );

        if(!match) return "";

        return managementComparisonFilterProjectKey(
          match[1]
        );
      })
      .filter(Boolean)
  );
};

var setManagementComparisonProjectsFromFilter = function setManagementComparisonProjectsFromFilter(
  selectedDisplayKeys
){
  const options =
    managementComparisonFilterProjects();

  const currentByProject =
    new Map(
      managementComparisonSelections
        .filter(selection =>
          selection.projectKey
        )
        .map(selection => [
          selection.projectKey,
          selection
        ])
    );

  const selected =
    options.filter(([,item]) =>
      selectedDisplayKeys.has(
        managementComparisonFilterProjectKey(item)
      )
    );

  managementComparisonSelections =
    selected.map(([key]) => {
      const revisions =
        managementComparisonRevisions(key);

      const current =
        currentByProject.get(key);

      const existingRevision =
        current &&
        revisions.includes(current.revision)
          ? current.revision
          : "";

      return {
        projectKey:key,
        revision:
          existingRevision ||
          revisions[revisions.length - 1] ||
          ""
      };
    });

  if(
    managementComparisonSelections.length < 2
  ){
    while(
      managementComparisonSelections.length < 2
    ){
      managementComparisonSelections.push({
        projectKey:"",
        revision:""
      });
    }
  }

  renderManagementComparisonSlots();
  renderManagementComparison();
  renderManagementComparisonFilters();
};

var managementComparisonSelectAllFilteredProjects = function managementComparisonSelectAllFilteredProjects(){
  const allFilteredProjects =
    new Set(
      managementComparisonFilterProjects()
        .map(([,item]) =>
          managementComparisonFilterProjectKey(item)
        )
    );

  setManagementComparisonProjectsFromFilter(
    allFilteredProjects
  );
};

var managementComparisonCategoryOptionCount = function managementComparisonCategoryOptionCount(
  categoryKey,
  option
){
  return managementComparisonProjectOptions()
    .filter(([,item]) => {
      if(
        managementComparisonProjectType(item) !==
        managementComparisonTypeFilter
      ){
        return false;
      }

      return (
        String(
          item?.formData?.[categoryKey] || ""
        ).trim() === option
      );
    })
    .length;
};

var renderManagementComparisonFilters = function renderManagementComparisonFilters(){
  const container =
    $("managementComparisonFilters");

  if(!container) return;

  container.classList.toggle(
    "hidden",
    !managementComparisonFiltersOpen
  );

  const toggleButton =
    $("toggleComparisonFiltersBtn");

  if(toggleButton){
    toggleButton.classList.toggle(
      "active",
      managementComparisonFiltersOpen
    );

    toggleButton.classList.toggle(
      "pinned",
      managementComparisonFiltersPinned
    );

    toggleButton.innerHTML =
      managementComparisonFiltersOpen
        ? `Filters <span aria-hidden="true">▴</span>`
        : `Filters <span aria-hidden="true">▾</span>`;

    toggleButton.setAttribute(
      "aria-expanded",
      String(
        managementComparisonFiltersOpen
      )
    );
  }

  const projectOptions =
    managementComparisonFilterProjects();

  const selectedKeys =
    managementComparisonSelectedProjectKeys();

  const allSelected =
    projectOptions.length > 0 &&
    projectOptions.every(([,item]) =>
      selectedKeys.has(
        managementComparisonFilterProjectKey(item)
      )
    );

  const definitions =
    managementComparisonCategoryDefinitions();

  const sectionDefinitions =
    managementComparisonSectionDefinitions();

  const allSectionsSelected =
    sectionDefinitions.every(section =>
      managementComparisonSelectedSections
        .has(section)
    );

  container.innerHTML = `
    <div class="comparison-filter-selector-panel">
      <div class="comparison-filter-type-tabs">
        <button
          type="button"
          class="${
            managementComparisonTypeFilter === "Landed"
              ? "active"
              : ""
          }"
          data-comparison-type-filter="Landed"
        >
          LANDED
        </button>

        <button
          type="button"
          class="${
            managementComparisonTypeFilter === "High Rise"
              ? "active"
              : ""
          }"
          data-comparison-type-filter="High Rise"
        >
          HIGH RISE
        </button>
      </div>

      <div class="comparison-filter-columns">
        <div class="comparison-filter-project-panel">
          <div class="comparison-filter-panel-title">
            <div>
              <strong>
                ${escapeHtml(
                  managementComparisonTypeFilter
                )} Projects
              </strong>
              <small>Tick projects to compare</small>
            </div>

            <span class="comparison-filter-count">
              ${projectOptions.length}
            </span>
          </div>

          <div class="comparison-project-checklist">
            <label class="comparison-project-checkbox all-projects">
              <input
                type="checkbox"
                data-comparison-filter-all-projects
                ${allSelected ? "checked" : ""}
              />
              <span>All Projects</span>
            </label>

            ${
              projectOptions.length
                ? projectOptions.map(([,item]) => {
                    const displayKey =
                      managementComparisonFilterProjectKey(
                        item
                      );

                    return `
                      <label class="comparison-project-checkbox">
                        <input
                          type="checkbox"
                          data-comparison-filter-project="${escapeHtml(displayKey)}"
                          ${
                            selectedKeys.has(displayKey)
                              ? "checked"
                              : ""
                          }
                        />

                        <span>
                          <strong>
                            ${escapeHtml(
                              item.project || "Project"
                            )}
                          </strong>
                          <small>
                            ${escapeHtml(
                              item.businessUnit || "—"
                            )}
                          </small>
                        </span>
                      </label>
                    `;
                  }).join("")
                : `
                  <div class="comparison-filter-empty">
                    No matching ${escapeHtml(
                      managementComparisonTypeFilter
                    )} projects.
                  </div>
                `
            }
          </div>
        </div>

        <div class="comparison-filter-category-panel">
          <div class="comparison-filter-panel-title">
            <div>
              <strong>CATEGORY</strong>
              <small>
                ${
                  managementComparisonTypeFilter === "High Rise"
                    ? "Default category filters"
                    : "No category filter for Landed"
                }
              </small>
            </div>
          </div>

          <div class="comparison-active-categories">
            ${
              definitions.length
                ? definitions.map(definition => {
                    const selected =
                      managementComparisonCategorySelections[
                        definition.key
                      ] || new Set();

                    return `
                      <div class="comparison-category-card">
                        <div class="comparison-category-card-head">
                          <strong>
                            ${escapeHtml(
                              definition.label
                            )}
                          </strong>
                        </div>

                        <div class="comparison-category-options-checklist">
                          ${definition.options.map(option => `
                            <label>
                              <input
                                type="checkbox"
                                data-comparison-category-option="${escapeHtml(definition.key)}"
                                value="${escapeHtml(option)}"
                                ${
                                  selected.has(option)
                                    ? "checked"
                                    : ""
                                }
                              />

                              <span>
                                ${escapeHtml(option)}
                              </span>

                              <small>
                                ${managementComparisonCategoryOptionCount(
                                  definition.key,
                                  option
                                )}
                              </small>
                            </label>
                          `).join("")}
                        </div>
                      </div>
                    `;
                  }).join("")
                : `
                  <div class="comparison-category-empty">
                    Category filtering is not required for
                    <strong>Landed</strong>.
                  </div>
                `
            }
          </div>
        </div>

        <div class="comparison-filter-sections-panel comparison-filter-sections-panel-inline">
          <div class="comparison-filter-panel-title comparison-sections-title">
            <div>
              <strong>SECTIONS</strong>
              <small>
                Choose which parts of the comparison table to display
              </small>
            </div>
          </div>

          <div class="comparison-section-checklist">
            <label class="comparison-section-checkbox all-sections">
              <input
                type="checkbox"
                data-comparison-filter-all-sections
                ${allSectionsSelected ? "checked" : ""}
              />
              <span>All Sections</span>
            </label>

            ${sectionDefinitions.map(section => `
              <label class="comparison-section-checkbox">
                <input
                  type="checkbox"
                  data-comparison-section-option="${escapeHtml(section)}"
                  ${
                    managementComparisonSelectedSections.has(section)
                      ? "checked"
                      : ""
                  }
                />
                <span>${escapeHtml(section)}</span>
              </label>
            `).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
};

var updateComparisonColumnPillV20 = function updateComparisonColumnPillV20(){
  const pill =
    $("comparisonColumnCountPill");

  if(!pill) return;

  pill.textContent =
    `${managementComparisonSelections.length} column${
      managementComparisonSelections.length === 1
        ? ""
        : "s"
    }`;
};

var comparisonProjectSearchMatches = function comparisonProjectSearchMatches(query){
  const normalized =
    String(query || "")
      .trim()
      .toLowerCase();

  if(!normalized){
    return [];
  }

  return managementComparisonProjectOptions()
    .filter(([,item]) => {
      const searchable = [
        item.project,
        item.region,
        item.businessUnit
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalized);
    })
    .slice(0,10);
};

var renderComparisonProjectSearchResults = function renderComparisonProjectSearchResults(index, query){
  const results =
    document.querySelector(
      `[data-comparison-project-results="${index}"]`
    );

  if(!results){
    return;
  }

  const matches =
    comparisonProjectSearchMatches(query);

  if(!String(query || "").trim()){
    results.innerHTML = "";
    results.classList.add("hidden");
    return;
  }

  if(!matches.length){
    results.innerHTML = `
      <div class="comparison-project-search-empty">
        No project found
      </div>
    `;
    results.classList.remove("hidden");
    return;
  }

  results.innerHTML =
    matches.map(([key,item]) => `
      <button
        type="button"
        class="comparison-project-search-result"
        data-confirm-comparison-project="${index}"
        data-comparison-project-key="${escapeHtml(key)}"
      >
        <span>
          <strong>${escapeHtml(item.project || "Project")}</strong>
          <small>
            ${escapeHtml(item.region || "—")}
            ·
            ${escapeHtml(item.businessUnit || "—")}
          </small>
        </span>

        <span class="comparison-project-confirm-action">
          Select →
        </span>
      </button>
    `).join("");

  results.classList.remove("hidden");
};

var closeComparisonProjectSearchResults = function closeComparisonProjectSearchResults(exceptIndex=null){
  document
    .querySelectorAll(
      "[data-comparison-project-results]"
    )
    .forEach(results => {
      if(
        exceptIndex !== null &&
        String(results.dataset.comparisonProjectResults) ===
          String(exceptIndex)
      ){
        return;
      }

      results.classList.add("hidden");
    });
};

var renderManagementComparisonSlots = function renderManagementComparisonSlots(){
  const container =
    $("managementComparisonSlots");

  const projectOptions =
    managementComparisonProjectOptions();

  updateComparisonColumnPillV20();

  container.innerHTML =
    managementComparisonSelections
      .map((selection,index) => {
        const revisions =
          selection.projectKey
            ? managementComparisonRevisions(
                selection.projectKey
              )
            : [];

        if(
          selection.revision &&
          !revisions.includes(
            selection.revision
          )
        ){
          selection.revision = "";
        }

        const selectedProject =
          selection.projectKey
            ? projectOptions.find(
                ([key]) =>
                  key === selection.projectKey
              )?.[1]
            : null;

        return `
          <div class="management-comparison-slot">
            <div class="management-comparison-slot-top">
              <span class="management-comparison-slot-number">${index + 1}</span>

              ${
                managementComparisonSelections.length > 2
                  ? `<button
                      type="button"
                      class="management-comparison-remove-column"
                      data-remove-comparison-column="${index}"
                      title="Remove comparison column"
                    >×</button>`
                  : ""
              }
            </div>

            <div class="field-group">
              <label>Project</label>

              ${
                selectedProject
                  ? `
                    <div class="comparison-project-confirmed">
                      <div class="comparison-project-confirmed-copy">
                        <span class="comparison-project-check">✓</span>
                        <span>
                          <strong>${escapeHtml(selectedProject.project || "Project")}</strong>
                          <small>
                            ${escapeHtml(selectedProject.region || "—")}
                            ·
                            ${escapeHtml(selectedProject.businessUnit || "—")}
                          </small>
                        </span>
                      </div>

                      <button
                        type="button"
                        class="comparison-project-change-btn"
                        data-change-comparison-project="${index}"
                      >Change</button>
                    </div>
                  `
                  : `
                    <div class="comparison-project-search">
                      <span class="comparison-project-search-icon">⌕</span>

                      <input
                        type="search"
                        class="comparison-project-search-input"
                        data-comparison-project-search="${index}"
                        placeholder="Search project"
                        autocomplete="off"
                      />

                      <div
                        class="comparison-project-search-results hidden"
                        data-comparison-project-results="${index}"
                      ></div>
                    </div>
                  `
              }
            </div>

            <div class="field-group">
              <label>Revision</label>

              <select
                data-comparison-revision="${index}"
                ${selection.projectKey ? "" : "disabled"}
              >
                <option value="">Select revision</option>

                ${revisions.map(revision => `
                  <option
                    value="${escapeHtml(revision)}"
                    ${selection.revision === revision ? "selected" : ""}
                  >${escapeHtml(revision)}</option>
                `).join("")}
              </select>
            </div>
          </div>
        `;
      })
      .join("");
};

var managementComparisonGuide = function managementComparisonGuide(entry){
  if(
    !entry ||
    entry.type === "section" ||
    entry.sectionTitle !== "Poundage"
  ){
    return "";
  }

  return managementSubmissionProposedGuide(
    entry.sectionTitle,
    entry.row.key,
    entry.buildingTypeScope || ""
  );
};

var renderManagementComparison = function renderManagementComparison(){
  const items =
    selectedManagementComparisonSubmissions();

  const empty =
    $("managementComparisonEmpty");

  const table =
    $("managementComparisonTable");

  if(items.length < 2){
    empty.classList.remove("hidden");
    table.classList.add("hidden");
    table.style.minWidth = "";
    return;
  }

  empty.classList.add("hidden");
  table.classList.remove("hidden");

  table.style.minWidth =
    items.length > 5
      ? `${250 + items.length * 125}px`
      : "0px";

  $("managementComparisonHead").innerHTML = `
    <tr>
      <th>Item</th>

      ${items.map(item => `
        <th>
          <strong>${escapeHtml(item.project || "Project")}</strong>
          <small>${escapeHtml(item.revision || "")}</small>
        </th>
      `).join("")}
    </tr>
  `;

  const rows =
    managementComparisonRows(items);

  $("managementComparisonBody").innerHTML =
    rows.map(entry => {
      if(entry.type === "section"){
        return `
          <tr class="management-comparison-section-row">
            <td colspan="${items.length + 1}">
              ${escapeHtml(entry.label)}
            </td>
          </tr>
        `;
      }

      const values =
        items.map(item =>
          managementComparisonDisplay(
            item,
            entry
          )
        );

      const distinct =
        new Set(
          values.filter(value =>
            value !== "—"
          )
        );

      const label =
        entry.label ||
        entry.row.label;

      const guide =
        managementComparisonGuide(entry);

      return `
        <tr>
          <td>
            ${
              guide
                ? `
                  <div class="comparison-poundage-item">
                    <span class="comparison-poundage-label">${escapeHtml(label)}</span>
                    <span class="comparison-poundage-divider">|</span>
                    <small class="comparison-poundage-guide-text">${escapeHtml(guide)}</small>
                  </div>
                `
                : `
                  <span>${escapeHtml(label)}</span>
                `
            }
          </td>

          ${values.map(value => `
            <td class="${
              distinct.size > 1
                ? "comparison-different"
                : ""
            }">
              ${escapeHtml(value)}
            </td>
          `).join("")}
        </tr>
      `;
    }).join("");
};

/* ---------------- Comparison filters ---------------- */

let managementComparisonTypeFilter =
  "High Rise";

let managementComparisonFiltersOpen =
  false;

let managementComparisonFiltersPinned =
  false;

let managementComparisonFilterCloseTimer =
  null;





let managementComparisonCategoryAddKey =
  "";

let managementComparisonActiveCategories =
  [
    "highRiseCategory",
    "transferFloor"
  ];

let managementComparisonCategorySelections = {
  highRiseType:new Set(),
  highRiseCategory:new Set(),
  transferFloor:new Set(),
  landedType:new Set()
};



let managementComparisonSelectedSections =
  new Set(
    managementComparisonSectionDefinitions()
  );



























/* ---------------- Dynamic Comparison columns ---------------- */

managementComparisonSelections =
  Array.from(
    {length:4},
    () => ({
      projectKey:"",
      revision:""
    })
  );















/* keep references to the original Comparison filter functions before the
   combined Overview module replaces some legacy renderers. */
window.renderManagementComparisonFiltersLegacyV119 = renderManagementComparisonFilters;
window.setManagementComparisonProjectsFromFilterLegacyV119 = setManagementComparisonProjectsFromFilter;
;

/* ---- js/management/events-init.js ---- */
var initManagementPortal = function initManagementPortal(){
  renderManagementOverview();
  renderManagementComparisonFilters();
  renderManagementComparisonSlots();
  renderManagementComparison();
  renderManagementSettings();
  renderManagementPileReference();
};

/* ---------------- V20 init ---------------- */



document.addEventListener("DOMContentLoaded", () => {
  /* Overview selectors */
  $("managementOverviewRegionSelect")
    ?.addEventListener("change", event => {
      managementOverviewSelectionV20.region =
        event.target.value;

      managementOverviewSelectionV20.businessUnit = "";
      managementOverviewSelectionV20.project = "";

      $("managementOverviewProjectSearch").value = "";

      renderManagementOverview();
    });

  $("managementOverviewBusinessUnitSelect")
    ?.addEventListener("change", event => {
      managementOverviewSelectionV20.businessUnit =
        event.target.value;

      managementOverviewSelectionV20.project = "";

      $("managementOverviewProjectSearch").value = "";

      renderManagementOverview();
    });

  $("managementOverviewProjectSelect")
    ?.addEventListener("change", event => {
      managementOverviewSelectionV20.project =
        event.target.value;

      $("managementOverviewProjectSearch").value =
        event.target.value;

      renderManagementOverview();
    });

  $("managementOverviewProjectSearch")
    ?.addEventListener("input", event => {
      if(
        managementOverviewSelectionV20.project &&
        event.target.value !==
          managementOverviewSelectionV20.project
      ){
        managementOverviewSelectionV20.project = "";
        $("managementOverviewProjectSelect").value = "";
      }

      renderManagementOverviewProjectSearchV20(
        event.target.value
      );

      renderManagementOverview();
    });

  $("managementOverviewProjectSearch")
    ?.addEventListener("focus", event => {
      if(event.target.value.trim()){
        renderManagementOverviewProjectSearchV20(
          event.target.value
        );
      }
    });

  $("managementOverviewProjectSearchResults")
    ?.addEventListener("click", event => {
      const button =
        event.target.closest(
          "[data-management-search-project]"
        );

      if(!button) return;

      managementOverviewSelectionV20 = {
        region:
          button.dataset.managementSearchRegion,
        businessUnit:
          button.dataset.managementSearchBusinessUnit,
        project:
          button.dataset.managementSearchProject
      };

      $("managementOverviewProjectSearch").value =
        managementOverviewSelectionV20.project;

      closeManagementOverviewProjectSearchV20();
      renderManagementOverview();
    });

  document.addEventListener("click", event => {
    if(
      !event.target.closest(
        "#managementOverviewProjectSearch"
      ) &&
      !event.target.closest(
        "#managementOverviewProjectSearchResults"
      )
    ){
      closeManagementOverviewProjectSearchV20();
    }
  });

  const comparisonFilterButton =
    $("toggleComparisonFiltersBtn");

  const comparisonFilterPanel =
    $("managementComparisonFilters");

  comparisonFilterButton
    ?.addEventListener("mouseenter", () => {
      openManagementComparisonFilterPopup();
    });

  comparisonFilterButton
    ?.addEventListener("mouseleave", () => {
      scheduleManagementComparisonFilterClose();
    });

  comparisonFilterButton
    ?.addEventListener("click", () => {
      managementComparisonFiltersPinned =
        !managementComparisonFiltersPinned;

      managementComparisonFiltersOpen =
        managementComparisonFiltersPinned;

      renderManagementComparisonFilters();
    });

  comparisonFilterPanel
    ?.addEventListener("mouseenter", () => {
      openManagementComparisonFilterPopup();
    });

  comparisonFilterPanel
    ?.addEventListener("mouseleave", () => {
      scheduleManagementComparisonFilterClose();
    });

  /* Comparison filter controls */
  document.addEventListener("click", event => {
    const typeButton =
      event.target.closest(
        "[data-comparison-type-filter]"
      );

    if(typeButton){
      managementComparisonTypeFilter =
        typeButton.dataset.comparisonTypeFilter;

      managementComparisonResetCategoriesForType();

      /*
        Selecting Landed / High Rise automatically
        fills every matching project, as requested.
      */
      managementComparisonSelectAllFilteredProjects();

      return;
    }

    const addCategoryButton =
      event.target.closest(
        "#addManagementComparisonCategoryBtn"
      );

    if(addCategoryButton){
      const select =
        $("managementComparisonCategorySelect");

      const key =
        select?.value || "";

      if(
        key &&
        !managementComparisonActiveCategories
          .includes(key)
      ){
        managementComparisonActiveCategories
          .push(key);

        managementComparisonCategorySelections[
          key
        ] = new Set();

        managementComparisonCategoryAddKey = "";

        renderManagementComparisonFilters();
      }

      return;
    }

    const removeCategory =
      event.target.closest(
        "[data-remove-comparison-category]"
      );

    if(removeCategory){
      const key =
        removeCategory.dataset
          .removeComparisonCategory;

      managementComparisonActiveCategories =
        managementComparisonActiveCategories
          .filter(item =>
            item !== key
          );

      managementComparisonCategorySelections[
        key
      ] = new Set();

      managementComparisonSelectAllFilteredProjects();

      return;
    }
  });

  document.addEventListener("change", event => {
    const categorySelect =
      event.target.closest(
        "#managementComparisonCategorySelect"
      );

    if(categorySelect){
      managementComparisonCategoryAddKey =
        categorySelect.value;

      return;
    }

    const allSections =
      event.target.closest(
        "[data-comparison-filter-all-sections]"
      );

    if(allSections){
      managementComparisonSelectedSections =
        allSections.checked
          ? new Set(
              managementComparisonSectionDefinitions()
            )
          : new Set();

      renderManagementComparisonFilters();
      renderManagementComparison();

      return;
    }

    const sectionOption =
      event.target.closest(
        "[data-comparison-section-option]"
      );

    if(sectionOption){
      const selected =
        new Set(
          Array.from(
            document.querySelectorAll(
              "[data-comparison-section-option]:checked"
            )
          ).map(input =>
            input.dataset.comparisonSectionOption
          )
        );

      managementComparisonSelectedSections =
        selected;

      renderManagementComparisonFilters();
      renderManagementComparison();

      return;
    }

    const allProjects =
      event.target.closest(
        "[data-comparison-filter-all-projects]"
      );

    if(allProjects){
      if(allProjects.checked){
        managementComparisonSelectAllFilteredProjects();
      }else{
        setManagementComparisonProjectsFromFilter(
          new Set()
        );
      }

      return;
    }

    const projectCheckbox =
      event.target.closest(
        "[data-comparison-filter-project]"
      );

    if(projectCheckbox){
      const selected =
        new Set(
          Array.from(
            document.querySelectorAll(
              "[data-comparison-filter-project]:checked"
            )
          ).map(input =>
            input.dataset.comparisonFilterProject
          )
        );

      setManagementComparisonProjectsFromFilter(
        selected
      );

      return;
    }

    const categoryOption =
      event.target.closest(
        "[data-comparison-category-option]"
      );

    if(categoryOption){
      const key =
        categoryOption.dataset
          .comparisonCategoryOption;

      const selected =
        new Set(
          Array.from(
            document.querySelectorAll(
              `[data-comparison-category-option="${key}"]:checked`
            )
          ).map(input =>
            input.value
          )
        );

      managementComparisonCategorySelections[
        key
      ] = selected;

      /*
        Category selections refine the matching project
        list and automatically fill those matching projects.
      */
      managementComparisonSelectAllFilteredProjects();

      return;
    }
  });

  $("managementComparisonSlots")
    ?.addEventListener("input", event => {
      const searchInput =
        event.target.closest(
          "[data-comparison-project-search]"
        );

      if(!searchInput){
        return;
      }

      const index =
        Number(
          searchInput.dataset.comparisonProjectSearch
        );

      closeComparisonProjectSearchResults(index);

      renderComparisonProjectSearchResults(
        index,
        searchInput.value
      );
    });

  $("managementComparisonSlots")
    ?.addEventListener("focusin", event => {
      const searchInput =
        event.target.closest(
          "[data-comparison-project-search]"
        );

      if(!searchInput){
        return;
      }

      const index =
        Number(
          searchInput.dataset.comparisonProjectSearch
        );

      closeComparisonProjectSearchResults(index);

      if(searchInput.value.trim()){
        renderComparisonProjectSearchResults(
          index,
          searchInput.value
        );
      }
    });

  document.addEventListener("click", event => {
    if(
      !event.target.closest(
        ".comparison-project-search"
      )
    ){
      closeComparisonProjectSearchResults();
    }
  });

  /* Comparison add/remove */
  $("addComparisonColumnBtn")
    ?.addEventListener("click", () => {
      if(
        managementComparisonSelections.length >= 8
      ){
        alert(
          "The prototype currently supports up to 8 comparison columns."
        );
        return;
      }

      managementComparisonSelections.push({
        projectKey:"",
        revision:""
      });

      renderManagementComparisonSlots();
      renderManagementComparison();
    });

  $("managementComparisonSlots")
    ?.addEventListener("click", event => {
      const confirmedResult =
        event.target.closest(
          "[data-confirm-comparison-project]"
        );

      if(confirmedResult){
        const index =
          Number(
            confirmedResult.dataset.confirmComparisonProject
          );

        managementComparisonSelections[index] = {
          projectKey:
            confirmedResult.dataset.comparisonProjectKey,
          revision:""
        };

        renderManagementComparisonSlots();
        renderManagementComparison();
        return;
      }

      const changeProject =
        event.target.closest(
          "[data-change-comparison-project]"
        );

      if(changeProject){
        const index =
          Number(
            changeProject.dataset.changeComparisonProject
          );

        managementComparisonSelections[index] = {
          projectKey:"",
          revision:""
        };

        renderManagementComparisonSlots();
        renderManagementComparison();

        requestAnimationFrame(() => {
          document
            .querySelector(
              `[data-comparison-project-search="${index}"]`
            )
            ?.focus();
        });

        return;
      }

      const remove =
        event.target.closest(
          "[data-remove-comparison-column]"
        );

      if(!remove) return;

      if(
        managementComparisonSelections.length <= 2
      ){
        return;
      }

      managementComparisonSelections.splice(
        Number(
          remove.dataset.removeComparisonColumn
        ),
        1
      );

      renderManagementComparisonSlots();
      renderManagementComparison();
    });

  /* Consultant Submission table settings */
  $("managementConsultantTableSettingsBody")
    ?.addEventListener("click", event => {
      const addButton =
        event.target.closest(
          "[data-add-consultant-setting-row]"
        );

      if(addButton){
        addManagementConsultantTableRowV21(
          addButton.dataset.addConsultantSettingRow
        );
        return;
      }

      const removeButton =
        event.target.closest(
          "[data-remove-consultant-setting-row]"
        );

      if(removeButton){
        removeManagementConsultantTableRowV21(
          removeButton.dataset.removeConsultantSettingSection,
          removeButton.dataset.removeConsultantSettingRow
        );
      }
    });

  /* Settings hierarchy */
  $("settingsRegionSelect")
    ?.addEventListener("change", event => {
      managementSettingsSelectedRegion =
        event.target.value;

      managementSettingsSelectedBusinessUnit = "";
      managementSettingsSelectedProject = "";

      renderManagementSettingsHierarchy();
    });

  $("settingsBusinessUnitSelect")
    ?.addEventListener("change", event => {
      managementSettingsSelectedBusinessUnit =
        event.target.value;

      managementSettingsSelectedProject = "";

      renderManagementSettingsHierarchy();
    });

  $("settingsProjectSelect")
    ?.addEventListener("change", event => {
      managementSettingsSelectedProject =
        event.target.value;

      renderManagementSettingsHierarchy();
    });

  $("addSettingsRegionBtn")
    ?.addEventListener(
      "click",
      addManagementHierarchyRegion
    );

  $("addSettingsBusinessUnitBtn")
    ?.addEventListener(
      "click",
      addManagementHierarchyBusinessUnit
    );

  $("addSettingsProjectBtn")
    ?.addEventListener(
      "click",
      addManagementHierarchyProject
    );

  $("removeSettingsRegionBtn")
    ?.addEventListener(
      "click",
      removeManagementHierarchyRegion
    );

  $("removeSettingsBusinessUnitBtn")
    ?.addEventListener(
      "click",
      removeManagementHierarchyBusinessUnit
    );

  $("removeSettingsProjectBtn")
    ?.addEventListener(
      "click",
      removeManagementHierarchyProject
    );

  /* Dropdown settings */
  $("settingsDropdownTypeSelect")
    ?.addEventListener("change", event => {
      saveCurrentManagementDropdownOptions();

      managementSettingsDropdownKey =
        event.target.value;

      $("settingsDropdownAddInput").value = "";

      renderManagementDropdownSettings();
    });

  $("addDropdownOptionBtn")
    ?.addEventListener("click", () => {
      const input =
        $("settingsDropdownAddInput");

      const value =
        input.value.trim();

      if(!value) return;

      const current =
        collectCurrentDropdownOptionsFromUI();

      if(
        current.some(option =>
          option.toLowerCase() ===
          value.toLowerCase()
        )
      ){
        alert("This option already exists.");
        return;
      }

      const config =
        getConfiguredDropdownOptions();

      config[managementSettingsDropdownKey] = [
        ...current,
        value
      ];

      saveConfiguredDropdownOptions(config);

      input.value = "";

      renderManagementDropdownSettings();
    });

  $("settingsDropdownOptionList")
    ?.addEventListener("click", event => {
      const remove =
        event.target.closest(
          "[data-remove-settings-dropdown-option]"
        );

      if(!remove) return;

      const index =
        Number(
          remove.dataset.removeSettingsDropdownOption
        );

      const current =
        collectCurrentDropdownOptionsFromUI();

      if(current.length <= 1){
        alert(
          "Keep at least one option in this dropdown."
        );
        return;
      }

      current.splice(index,1);

      const config =
        getConfiguredDropdownOptions();

      config[managementSettingsDropdownKey] =
        current;

      saveConfiguredDropdownOptions(config);

      renderManagementDropdownSettings();
    });

  $("saveDropdownSettingsBtn")
    ?.addEventListener("click", () => {
      if(
        saveCurrentManagementDropdownOptions()
      ){
        alert(
          "Consultant dropdown options saved."
        );

        renderManagementDropdownSettings();
      }
    });
});
;

/* ---- js/management/submission-setup.js ---- */
var isConsultantSectionVisible = function isConsultantSectionVisible(){
  return true;
};

var consultantSectionLabel = function consultantSectionLabel(sectionTitle){
  return sectionTitle;
};

var isConsultantRowVisible = function isConsultantRowVisible(){
  return true;
};

var consultantRowLabel = function consultantRowLabel(sectionTitle,rowKey,fallback){
  return fallback;
};

var managementSettingsDropdownIsEditableV22 = function managementSettingsDropdownIsEditableV22(key){
  return [
    "buildingType",
    "landedType",
    "highRiseType",
    "highRiseCategory",
    "transferFloor",
    "revision"
  ].includes(key);
};

var managementSettingsDropdownFallbackV22 = function managementSettingsDropdownFallbackV22(key,row=null){
  if(key === "landedType"){
    return [
      "Terrace 22x70",
      "Terrace 20x70",
      "Semi-D",
      "Bungalow",
      "Cluster / Link"
    ];
  }

  if(key === "revision"){
    return ["Rev 0","Rev 1","Rev 2","Rev 3"];
  }

  return row?.options || [];
};

var managementSettingsDropdownOptionsV22 = function managementSettingsDropdownOptionsV22(key,row=null){
  if(key === "pileType"){
    return getConsultantDropdownOptions(
      "pileType",
      row?.options || ["Bored Piles","Spun Piles","RC Piles"]
    );
  }

  if(managementSettingsDropdownIsEditableV22(key)){
    return getConsultantDropdownOptions(
      key,
      managementSettingsDropdownFallbackV22(key,row)
    );
  }

  return row?.options || [];
};

var managementSettingsOptionEditorMarkupV22 = function managementSettingsOptionEditorMarkupV22(key,row=null){
  if(
    managementSettingsOpenDropdownV22 !== key ||
    !managementSettingsDropdownIsEditableV22(key)
  ){
    return "";
  }

  const options = managementSettingsDropdownOptionsV22(key,row);

  return `
    <div class="management-inline-dropdown-editor" data-management-dropdown-editor="${escapeHtml(key)}">
      <div class="management-inline-dropdown-editor-head">
        <strong>Edit Dropdown</strong>
        <button
          type="button"
          class="management-inline-editor-close"
          data-close-management-dropdown="${escapeHtml(key)}"
          aria-label="Close dropdown editor"
          title="Close"
        >×</button>
      </div>

      <div class="management-inline-dropdown-option-list">
        ${options.map((option,index) => `
          <div class="management-inline-dropdown-option-row">
            <input
              type="text"
              value="${escapeHtml(option)}"
              data-management-dropdown-option-key="${escapeHtml(key)}"
              data-management-dropdown-option-index="${index}"
              aria-label="Dropdown option ${index + 1}"
            />
            <button
              type="button"
              class="management-inline-option-remove"
              data-remove-management-dropdown-option="${escapeHtml(key)}"
              data-remove-management-dropdown-index="${index}"
              title="Remove option"
              aria-label="Remove option"
            >×</button>
          </div>
        `).join("")}
      </div>

      <button
        type="button"
        class="management-inline-add-option-btn"
        data-add-management-dropdown-option="${escapeHtml(key)}"
      >
        <span>＋</span>
        Add Option
      </button>
    </div>
  `;
};

var managementSettingsPreviewShouldShowRowV22 = function managementSettingsPreviewShouldShowRowV22(row){
  if(row.key === "landedType"){
    return String(
      managementSettingsPreviewDataV22.buildingType || ""
    ).toLowerCase() === "landed";
  }

  if(typeof row.showWhen !== "function"){
    return true;
  }

  try{
    return !!row.showWhen(
      managementSettingsPreviewDataV22
    );
  }catch(error){
    return true;
  }
};

var managementSettingsPoundageLabelV22 = function managementSettingsPoundageLabelV22(rowKey,fallback){
  const isLanded =
    String(
      managementSettingsPreviewDataV22.buildingType || ""
    ).trim().toLowerCase() === "landed";

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

var managementSettingsInputMarkupV22 = function managementSettingsInputMarkupV22(section,row){
  const key = row.key;
  const value =
    key === "projectName"
      ? (managementSettingsSelectedProject || "")
      : (managementSettingsPreviewDataV22[key] ?? "");

  if(row.type === "gridlinePair"){
    const verticalValue =
      managementSettingsPreviewDataV22.gridlineCarparkVertical !== "" &&
      managementSettingsPreviewDataV22.gridlineCarparkVertical !== null &&
      managementSettingsPreviewDataV22.gridlineCarparkVertical !== undefined
        ? managementSettingsPreviewDataV22.gridlineCarparkVertical
        : (managementSettingsPreviewDataV22.gridlineCarpark ?? "");
    const horizontalValue =
      managementSettingsPreviewDataV22.gridlineCarparkHorizontal ?? "";

    return `
      <div class="gridline-dimension-box management-gridline-preview">
        <label class="gridline-dimension-item">
          <span>Vertical</span>
          <div class="gridline-dimension-input-wrap">
            <input
              class="text-input"
              type="number"
              step="0.01"
              value="${escapeHtml(verticalValue)}"
              placeholder="Enter vertical"
              readonly
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
              value="${escapeHtml(horizontalValue)}"
              placeholder="Enter horizontal"
              readonly
            />
            <small>m</small>
          </div>
        </label>
      </div>
    `;
  }

  if(row.type === "select"){
    const options =
      managementSettingsDropdownOptionsV22(key,row);

    if(
      options.length &&
      !options.includes(value)
    ){
      managementSettingsPreviewDataV22[key] = options[0];
    }

    const current =
      managementSettingsPreviewDataV22[key] ?? options[0] ?? "";

    const editButton =
      managementSettingsDropdownIsEditableV22(key)
        ? `
          <button
            type="button"
            class="management-inline-icon-btn management-dropdown-edit-btn"
            data-edit-management-dropdown="${escapeHtml(key)}"
            title="Edit ${escapeHtml(row.label)} dropdown"
            aria-label="Edit ${escapeHtml(row.label)} dropdown"
          >✎</button>
        `
        : "";

    return `
      <div class="management-settings-table-control">
        <div class="management-settings-select-edit-row table-inline-select-row">
          <select
            data-management-preview-field="${escapeHtml(key)}"
          >
            ${options.map(option => `
              <option
                value="${escapeHtml(option)}"
                ${String(option) === String(current) ? "selected" : ""}
              >${escapeHtml(option)}</option>
            `).join("")}
          </select>
          ${editButton}
        </div>
        ${managementSettingsOptionEditorMarkupV22(key,row)}
      </div>
    `;
  }

  if(row.type === "loadingSummary"){
    return `
      <div class="loading-summary-trigger loading-summary-static management-settings-preview-disabled">
        <span class="loading-summary-main">
          <span class="loading-summary-value">—</span>
          <span class="loading-summary-caption">Calculated from detailed table</span>
        </span>
      </div>
    `;
  }

  if(row.type === "file"){
    return `
      <div class="drawing-folder-upload-row management-settings-preview-file">
        <input type="file" disabled />
      </div>
    `;
  }

  const step = row.step ? `step="${escapeHtml(row.step)}"` : "";
  const type = row.type || "text";

  return `
    <div class="management-settings-table-control">
      <input
        class="text-input"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value)}"
        ${step}
        placeholder="${escapeHtml(row.placeholder || "")}"
        readonly
      />
      ${row.custom ? `
        <button
          type="button"
          class="management-inline-icon-btn danger management-custom-row-delete"
          data-remove-consultant-setting-row="${escapeHtml(row.key)}"
          data-remove-consultant-setting-section="${escapeHtml(section.title)}"
          title="Remove custom row"
          aria-label="Remove custom row"
        >×</button>
      ` : ""}
    </div>
  `;
};

var renderManagementConsultantTableSettingsV21 = function renderManagementConsultantTableSettingsV21(){
  const body =
    $("managementConsultantTableSettingsBody");

  if(!body) return;

  let html = "";

  OVERVIEW_SECTIONS.forEach(section => {
    html += `
      <tr class="section-row management-settings-section-row">
        <td colspan="2">
          <div class="section-row-content management-settings-section-content-v22">
            <span>${escapeHtml(section.title)}</span>
            <button
              type="button"
              class="management-section-add-row-icon"
              data-add-consultant-setting-row="${escapeHtml(section.title)}"
              title="Add row to ${escapeHtml(section.title)}"
              aria-label="Add row to ${escapeHtml(section.title)}"
            >＋</button>
          </div>
        </td>
      </tr>
    `;

    managementSettingsRowsForSection(section)
      .forEach(row => {
        if(!managementSettingsPreviewShouldShowRowV22(row)){
          return;
        }

        const rowLabel =
          section.title === "Poundage"
            ? managementSettingsPoundageLabelV22(
                row.key,
                row.label
              )
            : row.label;

        html += `
          <tr class="management-settings-preview-row ${row.custom ? "is-custom-row" : ""}">
            <td>
              <div class="field-label">${escapeHtml(rowLabel)}</div>
            </td>
            <td>
              ${managementSettingsInputMarkupV22(section,row)}
            </td>
          </tr>
        `;
      });
  });

  body.innerHTML = html;

  const heading =
    $("managementSettingsValueHeading");

  if(heading){
    heading.textContent =
      managementSettingsRevisionV22 ||
      "Current Revision";
  }
};

var renderManagementSettingsRevisionV22 = function renderManagementSettingsRevisionV22(){
  const select =
    $("managementSettingsRevisionSelect");

  if(!select) return;

  const options =
    managementSettingsDropdownOptionsV22(
      "revision"
    );

  if(
    !options.includes(
      managementSettingsRevisionV22
    )
  ){
    managementSettingsRevisionV22 =
      options[0] || "Rev 0";
  }

  select.innerHTML =
    options.map(option => `
      <option
        value="${escapeHtml(option)}"
        ${option === managementSettingsRevisionV22 ? "selected" : ""}
      >${escapeHtml(option)}</option>
    `).join("");

  select.value =
    managementSettingsRevisionV22;

  const editor =
    $("managementSettingsRevisionEditor");

  if(editor){
    if(managementSettingsOpenDropdownV22 === "revision"){
      editor.classList.remove("hidden");
      editor.innerHTML =
        managementSettingsOptionEditorMarkupV22(
          "revision"
        )
        .replace(
          'class="management-inline-dropdown-editor"',
          'class="management-inline-dropdown-editor revision-inline-editor"'
        );
    }else{
      editor.classList.add("hidden");
      editor.innerHTML = "";
    }
  }
};

var renderManagementSettingsYearV87 = function renderManagementSettingsYearV87(){
  const select = $("managementSettingsYearSelect");
  if(!select || typeof getMonthYearOptions !== "function") return;

  const options = getMonthYearOptions();
  const current = managementSettingsYearV87 || currentMonthYearLabel();
  const finalOptions = options.includes(current) ? options : [current, ...options];

  select.innerHTML = finalOptions
    .map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
    .join("");

  managementSettingsYearV87 = current;
  select.value = current;
};

var managementSettingsProjectItemsV22 = function managementSettingsProjectItemsV22(){
  const items = [];
  const regions =
    getConfiguredRegionBusinessUnits();
  const projectsByBusinessUnit =
    getConfiguredBusinessUnitProjects();

  Object.entries(regions)
    .forEach(([region,businessUnits]) => {
      (businessUnits || [])
        .forEach(businessUnit => {
          (
            projectsByBusinessUnit[
              businessUnit
            ] || []
          ).forEach(project => {
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

var renderManagementSettingsHierarchy = function renderManagementSettingsHierarchy(){
  const regionSelect =
    $("managementSettingsRegionSelect");
  const businessUnitSelect =
    $("managementSettingsBusinessUnitSelect");
  const projectSelect =
    $("managementSettingsProjectSelect");

  if(
    !regionSelect ||
    !businessUnitSelect ||
    !projectSelect
  ){
    return;
  }

  const hierarchy =
    getPortalHierarchyConfig();

  const regions =
    Object.keys(
      hierarchy.regionBusinessUnits
    );

  if(
    managementSettingsSelectedRegion &&
    !regions.includes(
      managementSettingsSelectedRegion
    )
  ){
    managementSettingsSelectedRegion = "";
  }

  regionSelect.innerHTML =
    `<option value="">Select region</option>` +
    regions.map(region => `
      <option value="${escapeHtml(region)}">${escapeHtml(region)}</option>
    `).join("");

  regionSelect.value =
    managementSettingsSelectedRegion;

  const businessUnits =
    managementSettingsSelectedRegion
      ? (
          hierarchy.regionBusinessUnits[
            managementSettingsSelectedRegion
          ] || []
        )
      : [];

  if(
    managementSettingsSelectedBusinessUnit &&
    !businessUnits.includes(
      managementSettingsSelectedBusinessUnit
    )
  ){
    managementSettingsSelectedBusinessUnit = "";
  }

  businessUnitSelect.disabled =
    !managementSettingsSelectedRegion;

  businessUnitSelect.innerHTML =
    !managementSettingsSelectedRegion
      ? `<option value="">Select region first</option>`
      : `<option value="">Select business unit</option>` +
        businessUnits.map(unit => `
          <option value="${escapeHtml(unit)}">${escapeHtml(unit)}</option>
        `).join("");

  businessUnitSelect.value =
    managementSettingsSelectedBusinessUnit;

  const projects =
    managementSettingsSelectedBusinessUnit
      ? (
          hierarchy.businessUnitProjects[
            managementSettingsSelectedBusinessUnit
          ] || []
        )
      : [];

  if(
    managementSettingsSelectedProject &&
    !projects.includes(
      managementSettingsSelectedProject
    )
  ){
    managementSettingsSelectedProject = "";
  }

  projectSelect.disabled =
    !managementSettingsSelectedBusinessUnit;

  projectSelect.innerHTML =
    !managementSettingsSelectedBusinessUnit
      ? `<option value="">Select business unit first</option>`
      : `<option value="">Select project</option>` +
        projects.map(project => `
          <option value="${escapeHtml(project)}">${escapeHtml(project)}</option>
        `).join("");

  projectSelect.value =
    managementSettingsSelectedProject;

  managementSettingsPreviewDataV22.projectName =
    managementSettingsSelectedProject || "";

  const pill =
    $("managementSettingsSelectionPill");

  if(pill){
    const parts = [
      managementSettingsSelectedRegion,
      managementSettingsSelectedBusinessUnit,
      managementSettingsSelectedProject
    ].filter(Boolean);

    pill.textContent =
      parts.length
        ? parts.join(" / ")
        : "No project selected";
  }

  const status =
    $("managementSettingsStatus");

  if(status){
    // Keep the Management Edit workspace free of helper/description copy.
    status.textContent = "";
  }

  renderManagementConsultantTableSettingsV21();
  renderManagementSettingsRevisionV22();
  renderManagementSettingsYearV87();
};

var renderManagementSettingsSearchResultsV22 = function renderManagementSettingsSearchResultsV22(query){
  const results =
    $("managementSettingsProjectSearchResults");

  if(!results) return;

  const normalized =
    String(query || "")
      .trim()
      .toLowerCase();

  results.innerHTML = "";

  if(!normalized){
    results.classList.add("hidden");
    return;
  }

  const matches =
    managementSettingsProjectItemsV22()
      .filter(item =>
        item.project.toLowerCase().includes(normalized) ||
        item.businessUnit.toLowerCase().includes(normalized) ||
        item.region.toLowerCase().includes(normalized)
      )
      .slice(0,12);

  if(!matches.length){
    results.innerHTML =
      `<div class="project-search-empty">No project found</div>`;
    results.classList.remove("hidden");
    return;
  }

  results.innerHTML =
    matches.map(item => `
      <button
        type="button"
        class="project-search-result"
        data-management-settings-search-region="${escapeHtml(item.region)}"
        data-management-settings-search-business-unit="${escapeHtml(item.businessUnit)}"
        data-management-settings-search-project="${escapeHtml(item.project)}"
      >
        <span>
          <strong>${escapeHtml(item.project)}</strong>
          <small>${escapeHtml(item.region)} · ${escapeHtml(item.businessUnit)}</small>
        </span>
        <span>→</span>
      </button>
    `).join("");

  results.classList.remove("hidden");
};

var saveManagementSettingsDropdownOptionV22 = function saveManagementSettingsDropdownOptionV22(key,index,value){
  const clean = String(value || "").trim();

  if(!clean){
    renderManagementConsultantTableSettingsV21();
    renderManagementSettingsRevisionV22();
    return;
  }

  const config =
    getConfiguredDropdownOptions();

  const current = [
    ...(config[key] ||
      managementSettingsDropdownFallbackV22(key))
  ];

  if(index < 0 || index >= current.length){
    return;
  }

  const previous = current[index];
  current[index] = clean;
  config[key] = [...new Set(current)];
  saveConfiguredDropdownOptions(config);

  if(
    managementSettingsPreviewDataV22[key] === previous
  ){
    managementSettingsPreviewDataV22[key] = clean;
  }

  if(
    key === "revision" &&
    managementSettingsRevisionV22 === previous
  ){
    managementSettingsRevisionV22 = clean;
  }

  renderManagementConsultantTableSettingsV21();
  renderManagementSettingsRevisionV22();
};

var addManagementSettingsDropdownOptionV22 = function addManagementSettingsDropdownOptionV22(key){
  const value =
    prompt(
      `Add option to ${managementSettingsDropdownLabel(key)}:`
    )?.trim();

  if(!value) return;

  const config =
    getConfiguredDropdownOptions();

  const current = [
    ...(config[key] ||
      managementSettingsDropdownFallbackV22(key))
  ];

  if(
    current.some(option =>
      option.toLowerCase() ===
      value.toLowerCase()
    )
  ){
    alert("This option already exists.");
    return;
  }

  config[key] = [...current,value];
  saveConfiguredDropdownOptions(config);

  renderManagementConsultantTableSettingsV21();
  renderManagementSettingsRevisionV22();
};

var removeManagementSettingsDropdownOptionV22 = function removeManagementSettingsDropdownOptionV22(key,index){
  const config =
    getConfiguredDropdownOptions();

  const current = [
    ...(config[key] ||
      managementSettingsDropdownFallbackV22(key))
  ];

  if(current.length <= 1){
    alert("Keep at least one option in this dropdown.");
    return;
  }

  if(index < 0 || index >= current.length){
    return;
  }

  const removed = current[index];
  current.splice(index,1);
  config[key] = current;
  saveConfiguredDropdownOptions(config);

  if(
    managementSettingsPreviewDataV22[key] === removed
  ){
    managementSettingsPreviewDataV22[key] =
      current[0] || "";
  }

  if(
    key === "revision" &&
    managementSettingsRevisionV22 === removed
  ){
    managementSettingsRevisionV22 =
      current[0] || "Rev 0";
  }

  renderManagementConsultantTableSettingsV21();
  renderManagementSettingsRevisionV22();
};

var renderManagementSettings = function renderManagementSettings(){
  renderManagementSettingsHierarchy();
  renderManagementSettingsRevisionV22();
};

/* ============================================================
   V22 MANAGEMENT SETTINGS
   - Mirrors Consultant Submission layout 1:1
   - Project hierarchy editing is integrated into the top selectors
   - Consultant dropdown options are edited inline beside each dropdown
   - Section/row title editing removed
   ============================================================ */

let managementSettingsPreviewDataV22 = {
  projectName:"",
  consultantName:"",
  buildingType:"High Rise",
  landedType:"",
  highRiseType:"Residential – Duduk",
  highRiseCategory:"Long Block",
  transferFloor:"Separate Carpark Block (No Transfer Floor)",
  storeyCount:"",
  unitCount:"",
  gridlineCarpark:"",
  gridlineCarparkVertical:"",
  gridlineCarparkHorizontal:"",
  resiTowerBuildingEfficiency:"",
  carparkFloorEfficiency:"",
  overallBuildingEfficiency:"",
  pileType:"Bored Piles",
  pileSize:"",
  numberOfPiles:"",
  pilingCost:"",
  totalArea:"",
  totalColumnLoading:"",
  totalPilesCapacity:"",
  overallEfficiency:"",
  poundageRcColumn:"",
  poundageRcBeamCarpark:"",
  poundageRcBeamTypical:"",
  poundageRcSlab:"",
  poundageShearWall:"",
  poundageOverall:"",
  poundageSteelContent:"",
  drawingArchitectural:[],
  drawingStructural:[]
};

let managementSettingsRevisionV22 = "Rev 0";
let managementSettingsYearV87 = "";
let managementSettingsOpenDropdownV22 = "";

/* Title editing is intentionally disabled in v22. */
;

/* ---- js/management/settings-events.js ---- */


/* ============================================================
   V22 Settings events: integrated Consultant Submission editor
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  $("managementSettingsRegionSelect")
    ?.addEventListener("change", event => {
      managementSettingsSelectedRegion =
        event.target.value;
      managementSettingsSelectedBusinessUnit = "";
      managementSettingsSelectedProject = "";
      renderManagementSettingsHierarchy();
    });

  $("managementSettingsBusinessUnitSelect")
    ?.addEventListener("change", event => {
      managementSettingsSelectedBusinessUnit =
        event.target.value;
      managementSettingsSelectedProject = "";
      renderManagementSettingsHierarchy();
    });

  $("managementSettingsProjectSelect")
    ?.addEventListener("change", event => {
      managementSettingsSelectedProject =
        event.target.value;

      const search =
        $("managementSettingsProjectSearch");

      if(search){
        search.value =
          managementSettingsSelectedProject;
      }

      renderManagementSettingsHierarchy();
    });

  $("managementSettingsRevisionSelect")
    ?.addEventListener("change", event => {
      managementSettingsRevisionV22 =
        event.target.value;
      renderManagementConsultantTableSettingsV21();
    });

  $("managementSettingsYearSelect")
    ?.addEventListener("change", event => {
      managementSettingsYearV87 = event.target.value;
    });

  $("managementSettingsProjectSearch")
    ?.addEventListener("input", event => {
      renderManagementSettingsSearchResultsV22(
        event.target.value
      );
    });

  $("managementSettingsProjectSearchResults")
    ?.addEventListener("click", event => {
      const result =
        event.target.closest(
          "[data-management-settings-search-project]"
        );

      if(!result) return;

      managementSettingsSelectedRegion =
        result.dataset.managementSettingsSearchRegion;
      managementSettingsSelectedBusinessUnit =
        result.dataset.managementSettingsSearchBusinessUnit;
      managementSettingsSelectedProject =
        result.dataset.managementSettingsSearchProject;

      const search =
        $("managementSettingsProjectSearch");

      if(search){
        search.value =
          managementSettingsSelectedProject;
      }

      $("managementSettingsProjectSearchResults")
        ?.classList.add("hidden");

      renderManagementSettingsHierarchy();
    });

  $("addManagementSettingsRegionBtn")
    ?.addEventListener(
      "click",
      addManagementHierarchyRegion
    );

  $("addManagementSettingsBusinessUnitBtn")
    ?.addEventListener(
      "click",
      addManagementHierarchyBusinessUnit
    );

  $("addManagementSettingsProjectBtn")
    ?.addEventListener(
      "click",
      addManagementHierarchyProject
    );

  $("removeManagementSettingsRegionBtn")
    ?.addEventListener(
      "click",
      removeManagementHierarchyRegion
    );

  $("removeManagementSettingsBusinessUnitBtn")
    ?.addEventListener(
      "click",
      removeManagementHierarchyBusinessUnit
    );

  $("removeManagementSettingsProjectBtn")
    ?.addEventListener(
      "click",
      removeManagementHierarchyProject
    );

  $("managementSettingsView")
    ?.addEventListener("click", event => {
      const edit =
        event.target.closest(
          "[data-edit-management-dropdown]"
        );

      if(edit){
        const key =
          edit.dataset.editManagementDropdown;

        managementSettingsOpenDropdownV22 =
          managementSettingsOpenDropdownV22 === key
            ? ""
            : key;

        renderManagementConsultantTableSettingsV21();
        renderManagementSettingsRevisionV22();
        return;
      }

      const close =
        event.target.closest(
          "[data-close-management-dropdown]"
        );

      if(close){
        managementSettingsOpenDropdownV22 = "";
        renderManagementConsultantTableSettingsV21();
        renderManagementSettingsRevisionV22();
        return;
      }

      const addOption =
        event.target.closest(
          "[data-add-management-dropdown-option]"
        );

      if(addOption){
        addManagementSettingsDropdownOptionV22(
          addOption.dataset.addManagementDropdownOption
        );
        return;
      }

      const removeOption =
        event.target.closest(
          "[data-remove-management-dropdown-option]"
        );

      if(removeOption){
        removeManagementSettingsDropdownOptionV22(
          removeOption.dataset.removeManagementDropdownOption,
          Number(
            removeOption.dataset.removeManagementDropdownIndex
          )
        );
        return;
      }
    });

  $("managementSettingsView")
    ?.addEventListener("change", event => {
      const preview =
        event.target.closest(
          "[data-management-preview-field]"
        );

      if(preview){
        managementSettingsPreviewDataV22[
          preview.dataset.managementPreviewField
        ] = preview.value;

        renderManagementConsultantTableSettingsV21();
        return;
      }

      const option =
        event.target.closest(
          "[data-management-dropdown-option-key]"
        );

      if(option){
        saveManagementSettingsDropdownOptionV22(
          option.dataset.managementDropdownOptionKey,
          Number(
            option.dataset.managementDropdownOptionIndex
          ),
          option.value
        );
      }
    });

  document.addEventListener("click", event => {
    if(
      !event.target.closest(
        "#managementSettingsProjectSearch"
      ) &&
      !event.target.closest(
        "#managementSettingsProjectSearchResults"
      )
    ){
      $("managementSettingsProjectSearchResults")
        ?.classList.add("hidden");
    }
  });
});
;

/* ---- js/management/overview-comparison.js ---- */
var managementLatestSubmissionMapV103 = function managementLatestSubmissionMapV103(){
  const latest = new Map();
  getSubmissions().forEach(item => {
    const key = managementProjectKey(item);
    const current = latest.get(key);
    if(!current || new Date(item.updatedAt || 0).getTime() > new Date(current.updatedAt || 0).getTime()){
      latest.set(key,item);
    }
  });
  return latest;
};

var managementCleanSelectedProjectsV103 = function managementCleanSelectedProjectsV103(){
  const valid = new Set(managementLatestSubmissionMapV103().keys());
  managementOverviewSelectedProjectKeysV103 = new Set(
    [...managementOverviewSelectedProjectKeysV103].filter(key => valid.has(key))
  );
};

var managementSelectedSubmissionsV103 = function managementSelectedSubmissionsV103(){
  const latest = managementLatestSubmissionMapV103();
  return [...managementOverviewSelectedProjectKeysV103]
    .map(key => latest.get(key))
    .filter(Boolean);
};

var managementThisWeekRangeV107 = function managementThisWeekRangeV107(){
  const now=new Date();
  const start=new Date(now);
  const day=(start.getDay()+6)%7; // Monday = 0
  start.setHours(0,0,0,0);
  start.setDate(start.getDate()-day);

  const end=new Date(start);
  end.setDate(end.getDate()+7);
  return {start,end};
};

var managementThisWeekSubmissionsV107 = function managementThisWeekSubmissionsV107(submissions){
  const {start,end}=managementThisWeekRangeV107();
  return submissions.filter(item=>{
    const date=new Date(item.updatedAt||item.submittedAt||0);
    return !Number.isNaN(date.getTime()) && date>=start && date<end;
  });
};

var managementRenderThisWeekSubmissionsV107 = function managementRenderThisWeekSubmissionsV107(items){
  const countEl=$("managementStatLatest");
  const listEl=$("managementWeeklySubmissionList");
  if(countEl) countEl.textContent=String(items.length);
  if(!listEl) return;

  if(!items.length){
    listEl.innerHTML=`<small class="management-weekly-empty">No submissions this week.</small>`;
    return;
  }

  listEl.innerHTML=items.map(item=>{
    const date=new Date(item.updatedAt||item.submittedAt||0);
    const dateText=Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString([], {weekday:"short",day:"2-digit",month:"short"});
    const revision=item.revision||"—";
    const year=item.year||"";
    return `
      <div class="management-weekly-submission-item">
        <div class="management-weekly-submission-copy">
          <b>${escapeHtml(item.project||"Unnamed project")}</b>
          <small>${escapeHtml([revision,year].filter(Boolean).join(" · "))}</small>
        </div>
        <time>${escapeHtml(dateText)}</time>
      </div>
    `;
  }).join("");
};

var managementUpdateOverviewStatsV103 = function managementUpdateOverviewStatsV103(){
  const submissions=getSubmissions().slice().sort(
    (a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0)
  );
  const selectedCount=managementOverviewSelectedProjectKeysV103.size;
  const thisWeek=managementThisWeekSubmissionsV107(submissions);

  if($("managementStatSubmissions")) $("managementStatSubmissions").textContent=String(submissions.length);
  if($("managementStatSelected")) $("managementStatSelected").textContent=String(selectedCount);
  managementRenderThisWeekSubmissionsV107(thisWeek);
  if($("managementOverviewCount")) $("managementOverviewCount").textContent=`${selectedCount} selected`;
};

var managementUpdateOverviewStatusV103 = function managementUpdateOverviewStatusV103(visibleCount){
  const status=$("managementOverviewStatus");
  if(!status) return;
  const parts=[];
  if(managementOverviewSelectionV20.region) parts.push(managementOverviewSelectionV20.region);
  if(managementOverviewSelectionV20.businessUnit) parts.push(managementOverviewSelectionV20.businessUnit);

  status.textContent=
    `${visibleCount} project${visibleCount===1?"":"s"} available`+
    (parts.length ? ` · ${parts.join(" → ")}` : " · All projects")+
    ` · ${managementOverviewSelectedProjectKeysV103.size} selected`;
};

var managementProjectDropdownLabelV103 = function managementProjectDropdownLabelV103(){
  const selected=managementSelectedSubmissionsV103();
  if(!selected.length) return "Select Project";
  if(selected.length===1) return selected[0].project || "1 project selected";
  return `${selected.length} projects selected`;
};

var closeManagementProjectMultiSelectV103 = function closeManagementProjectMultiSelectV103(){
  const panel=$("managementOverviewProjectMultiSelectPanel");
  const trigger=$("managementOverviewProjectMultiSelectTrigger");
  panel?.classList.add("hidden");
  trigger?.setAttribute("aria-expanded","false");
};

var renderManagementProjectMultiSelectV103 = function renderManagementProjectMultiSelectV103(){
  const trigger=$("managementOverviewProjectMultiSelectTrigger");
  const label=$("managementOverviewProjectMultiSelectLabel");
  const panel=$("managementOverviewProjectMultiSelectPanel");
  const container=$("managementProjectCheckboxListV103");
  if(!trigger || !label || !panel || !container) return;

  managementCleanSelectedProjectsV103();

  const hasBusinessUnit=Boolean(managementOverviewSelectionV20.businessUnit);
  trigger.disabled=!hasBusinessUnit;

  if(!hasBusinessUnit){
    label.textContent="Select business unit first";
    container.innerHTML="";
    closeManagementProjectMultiSelectV103();
    managementUpdateOverviewStatusV103(0);
    return;
  }

  label.textContent=managementProjectDropdownLabelV103();

  /* show every configured project in the selected Business Unit.
     Projects without any submitted revision stay visible but cannot be ticked. */
  const hierarchy=getPortalHierarchyConfig();
  const region=managementOverviewSelectionV20.region || "";
  const businessUnit=managementOverviewSelectionV20.businessUnit || "";
  const projects=(hierarchy.businessUnitProjects[businessUnit] || []).slice();
  const latest=managementLatestSubmissionMapV103();

  const entries=projects.map(project=>{
    const key=managementProjectKey({region,businessUnit,project});
    return {key,project,submission:latest.get(key) || null};
  });

  managementUpdateOverviewStatusV103(entries.length);

  if(!entries.length){
    container.innerHTML=`<div class="internal-project-multiselect-empty">No projects configured for this Business Unit.</div>`;
    return;
  }

  container.innerHTML=entries.map(({key,project,submission})=>{
    const available=Boolean(submission);
    const selected=available && managementOverviewSelectedProjectKeysV103.has(key);
    return `
      <label class="internal-project-multiselect-option ${selected?"selected":""} ${available?"":"unavailable"}" ${available?"":'title="No submission available"'}>
        <input
          type="checkbox"
          data-management-project-checkbox-v103="${escapeHtml(key)}"
          ${selected?"checked":""}
          ${available?"":"disabled"}
        />
        <span>${escapeHtml(project || "Project")}</span>
      </label>
    `;
  }).join("");
};

var managementSyncComparisonSelectionsV103 = function managementSyncComparisonSelectionsV103(){
  const items=managementSelectedSubmissionsV103();
  managementComparisonSelections=items.map(item=>({
    projectKey:managementProjectKey(item),
    revision:item.revision||"",
    submissionId:item.id
  }));
  managementUpdateOverviewStatsV103();
  renderManagementComparison();
};

var renderManagementComparisonSlots = function renderManagementComparisonSlots(){ return; };

var renderManagementComparisonFilters = function renderManagementComparisonFilters(){ return; };

var selectedManagementComparisonSubmissions = function selectedManagementComparisonSubmissions(){
  return managementComparisonSelections
    .map(selection=>{
      if(selection.submissionId){
        return getSubmissions().find(item=>item.id===selection.submissionId)||null;
      }
      if(!selection.projectKey) return null;
      return getSubmissions()
        .filter(item=>managementProjectKey(item)===selection.projectKey && (!selection.revision || item.revision===selection.revision))
        .sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0))[0]||null;
    })
    .filter(Boolean);
};

var renderManagementComparison = function renderManagementComparison(){
  const card=$("managementCombinedComparisonCardV101");
  const table=$("managementComparisonTable");
  const empty=$("managementComparisonEmpty");
  const head=$("managementComparisonHead");
  const body=$("managementComparisonBody");
  const pill=$("comparisonColumnCountPill");
  const summary=$("managementCombinedComparisonSummaryV101");
  if(!card || !table || !empty || !head || !body) return;

  const items=selectedManagementComparisonSubmissions();

  if(pill) pill.textContent=`${items.length} project${items.length===1?"":"s"}`;
  if(summary){
    summary.textContent=items.length
      ? `${items.length} selected project${items.length===1?"":"s"}.`
      : "Tick projects from Select Project to start comparing.";
  }

  if(!items.length){
    card.classList.add("hidden");
    empty.classList.remove("hidden");
    table.classList.add("hidden");
    table.style.minWidth="";
    return;
  }

  card.classList.remove("hidden");
  empty.classList.add("hidden");
  table.classList.remove("hidden");
  table.style.minWidth=items.length>4 ? `${260+items.length*175}px` : "0px";

  head.innerHTML=`
    <tr>
      <th>Item</th>
      ${items.map(item=>{
        const year=typeof submissionYearLabel==="function" ? submissionYearLabel(item) : (item.year||"—");
        return `
          <th>
            <div class="management-comparison-project-head-v101">
              <strong>${escapeHtml(item.project||"Project")}</strong>
              <small>${escapeHtml(item.revision||"—")} · ${escapeHtml(year||"—")}</small>
            </div>
          </th>
        `;
      }).join("")}
    </tr>
  `;

  const rows=managementComparisonRows(items);
  body.innerHTML=rows.map(entry=>{
    if(entry.type==="section"){
      return `<tr class="management-comparison-section-row"><td colspan="${items.length+1}">${escapeHtml(entry.label)}</td></tr>`;
    }

    const values=items.map(item=>managementComparisonDisplay(item,entry));
    const distinct=new Set(values.filter(value=>value!=="—"));
    const labelText=entry.label||entry.row.label;
    const guide=managementComparisonGuide(entry);

    return `
      <tr>
        <td>
          ${guide
            ? `<div class="comparison-poundage-item"><span class="comparison-poundage-label">${escapeHtml(labelText)}</span><span class="comparison-poundage-divider">|</span><small class="comparison-poundage-guide-text">${escapeHtml(guide)}</small></div>`
            : `<span>${escapeHtml(labelText)}</span>`}
        </td>
        ${values.map(value=>`<td class="${distinct.size>1?"comparison-different":""}">${escapeHtml(value)}</td>`).join("")}
      </tr>
    `;
  }).join("");
};

var renderManagementOverview = function renderManagementOverview(){
  /* Project is now multi-selected through the custom dropdown, not a single filter. */
  managementOverviewSelectionV20.project="";
  populateManagementOverviewSelectorsV20();
  managementCleanSelectedProjectsV103();
  managementUpdateOverviewStatsV103();
  renderManagementProjectMultiSelectV103();
  managementSyncComparisonSelectionsV103();
};

/* Internal Overview + Comparison with checkbox multi-select inside Select Project */

let managementOverviewSelectedProjectKeysV103 = new Set();

























/* Disable the old column/slot comparison UI. */









/* Any stale comparison navigation goes back to the combined Overview. */
const showManagementViewBeforeV103=showManagementView;
showManagementView=function(viewName){
  return showManagementViewBeforeV103(viewName==="managementComparison" ? "managementOverview" : viewName);
};

document.addEventListener("DOMContentLoaded",()=>{
  const weeklyTrigger=$("managementWeeklySubmissionsTrigger");
  const weeklyPopover=$("managementWeeklySubmissionsPopover");
  const weeklyCard=$("managementWeeklySubmissionsCard");

  function closeWeeklySubmissionsDropdown(){
    if(!weeklyTrigger || !weeklyPopover) return;
    weeklyPopover.classList.add("hidden");
    weeklyTrigger.setAttribute("aria-expanded","false");
    weeklyCard?.classList.remove("weekly-open");
  }

  weeklyTrigger?.addEventListener("click",event=>{
    event.stopPropagation();
    if(!weeklyPopover) return;
    const opening=weeklyPopover.classList.contains("hidden");
    weeklyPopover.classList.toggle("hidden",!opening);
    weeklyTrigger.setAttribute("aria-expanded",opening?"true":"false");
    weeklyCard?.classList.toggle("weekly-open",opening);
  });

  weeklyPopover?.addEventListener("click",event=>event.stopPropagation());

  document.addEventListener("click",event=>{
    if(!event.target.closest("#managementWeeklySubmissionsCard")){
      closeWeeklySubmissionsDropdown();
    }
  });

  document.addEventListener("keydown",event=>{
    if(event.key==="Escape") closeWeeklySubmissionsDropdown();
  });
  $("managementOverviewProjectMultiSelectTrigger")?.addEventListener("click",()=>{
    const trigger=$("managementOverviewProjectMultiSelectTrigger");
    const panel=$("managementOverviewProjectMultiSelectPanel");
    if(!trigger || trigger.disabled || !panel) return;
    const opening=panel.classList.contains("hidden");
    panel.classList.toggle("hidden",!opening);
    trigger.setAttribute("aria-expanded",opening?"true":"false");
    if(opening) closeManagementOverviewProjectSearchV20?.();
  });

  const projectCheckboxListV103=$("managementProjectCheckboxListV103");

  function applyManagementProjectCheckboxV113(checkbox){
    if(!checkbox) return;
    const key=checkbox.dataset.managementProjectCheckboxV103;
    if(!key) return;

    if(checkbox.checked) managementOverviewSelectedProjectKeysV103.add(key);
    else managementOverviewSelectedProjectKeysV103.delete(key);

    checkbox.closest(".internal-project-multiselect-option")
      ?.classList.toggle("selected", checkbox.checked);

    const label=$("managementOverviewProjectMultiSelectLabel");
    if(label) label.textContent=managementProjectDropdownLabelV103();

    managementSyncComparisonSelectionsV103();
  }

  projectCheckboxListV103?.addEventListener("change",event=>{
    const checkbox=event.target.closest("[data-management-project-checkbox-v103]");
    if(!checkbox) return;
    event.stopPropagation();
    applyManagementProjectCheckboxV113(checkbox);
  });

  projectCheckboxListV103?.addEventListener("click",event=>{
    const option=event.target.closest(".internal-project-multiselect-option");
    if(!option) return;
    event.stopPropagation();

    /* Make the full project row clickable. Prevent the label's synthetic
       checkbox click when the user clicked the row/text, then toggle once. */
    const checkbox=option.querySelector("[data-management-project-checkbox-v103]");
    if(!checkbox || checkbox.disabled) return;

    if(event.target!==checkbox){
      event.preventDefault();
      checkbox.checked=!checkbox.checked;
      applyManagementProjectCheckboxV113(checkbox);
    }
  });

  $("clearManagementProjectSelectionV103")?.addEventListener("click",event=>{
    event.stopPropagation();
    managementOverviewSelectedProjectKeysV103.clear();
    renderManagementProjectMultiSelectV103();
    managementSyncComparisonSelectionsV103();
  });

  document.addEventListener("click",event=>{
    if(!event.target.closest("#managementOverviewProjectMultiSelectV103")){
      closeManagementProjectMultiSelectV103();
    }
  });

  $("managementOverviewRegionSelect")?.addEventListener("change",()=>closeManagementProjectMultiSelectV103());
  $("managementOverviewBusinessUnitSelect")?.addEventListener("change",()=>closeManagementProjectMultiSelectV103());

});
;

/* ---- js/management/search-project-checkbox.js ---- */
var renderManagementOverviewProjectSearchV20 = function renderManagementOverviewProjectSearchV20(query){
  const results = $("managementOverviewProjectSearchResults");
  if(!results) return;

  const normalized = String(query || "").trim().toLowerCase();
  results.innerHTML = "";

  if(!normalized){
    closeManagementOverviewProjectSearchV20();
    return;
  }

  const latest = [...managementLatestSubmissionMapV103().entries()]
    .map(([key,item]) => ({ key, item }))
    .filter(({item}) => {
      return String(item.project || "").toLowerCase().includes(normalized) ||
        String(item.businessUnit || "").toLowerCase().includes(normalized) ||
        String(item.region || "").toLowerCase().includes(normalized);
    })
    .sort((a,b) => String(a.item.project || "").localeCompare(String(b.item.project || "")))
    .slice(0,20);

  if(!latest.length){
    results.innerHTML = `<div class="project-search-empty">No project found</div>`;
    results.classList.remove("hidden");
    return;
  }

  results.innerHTML = latest.map(({key,item}) => {
    const checked = managementOverviewSelectedProjectKeysV103.has(key);
    return `
      <label class="project-search-result management-search-checkbox-result ${checked ? "selected" : ""}">
        <input
          type="checkbox"
          data-management-search-checkbox-v116="${escapeHtml(key)}"
          ${checked ? "checked" : ""}
        />
        <span class="management-search-checkbox-copy">
          <strong>${escapeHtml(item.project || "Project")}</strong>
          <small>${escapeHtml(item.region || "—")} · ${escapeHtml(item.businessUnit || "—")}</small>
        </span>
      </label>
    `;
  }).join("");

  results.classList.remove("hidden");
};

/* Search Project results use the same checkbox comparison selection as Select Project. */



document.addEventListener("DOMContentLoaded", () => {
  const results = $("managementOverviewProjectSearchResults");
  if(!results) return;

  results.addEventListener("change", event => {
    const checkbox = event.target.closest("[data-management-search-checkbox-v116]");
    if(!checkbox) return;
    event.stopPropagation();

    const key = checkbox.dataset.managementSearchCheckboxV116;
    if(!key) return;

    if(checkbox.checked) managementOverviewSelectedProjectKeysV103.add(key);
    else managementOverviewSelectedProjectKeysV103.delete(key);

    checkbox.closest(".management-search-checkbox-result")
      ?.classList.toggle("selected", checkbox.checked);

    const selectProjectCheckbox = document.querySelector(
      `[data-management-project-checkbox-v103="${CSS.escape(key)}"]`
    );
    if(selectProjectCheckbox){
      selectProjectCheckbox.checked = checkbox.checked;
      selectProjectCheckbox.closest(".internal-project-multiselect-option")
        ?.classList.toggle("selected", checkbox.checked);
    }

    const selectProjectLabel = $("managementOverviewProjectMultiSelectLabel");
    if(selectProjectLabel) selectProjectLabel.textContent = managementProjectDropdownLabelV103();

    managementSyncComparisonSelectionsV103();
  });

  results.addEventListener("click", event => {
    if(event.target.closest("[data-management-search-checkbox-v116]")){
      event.stopPropagation();
      return;
    }

    const row = event.target.closest(".management-search-checkbox-result");
    if(!row) return;
    event.preventDefault();
    event.stopPropagation();

    const checkbox = row.querySelector("[data-management-search-checkbox-v116]");
    if(!checkbox) return;
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event("change", { bubbles:true }));
  });
});
;

/* ---- js/management/revision-selector.js ---- */
var managementProjectSubmissionsV118 = function managementProjectSubmissionsV118(projectKey){
  return getSubmissions()
    .filter(item => managementProjectKey(item) === projectKey)
    .sort((a,b) => {
      const revisionA = String(a.revision || "");
      const revisionB = String(b.revision || "");
      const numberA = Number((revisionA.match(/\d+/) || [9999])[0]);
      const numberB = Number((revisionB.match(/\d+/) || [9999])[0]);
      if(numberA !== numberB) return numberA - numberB;
      const revisionCompare = revisionA.localeCompare(revisionB, undefined, { numeric:true, sensitivity:"base" });
      if(revisionCompare) return revisionCompare;
      const yearA = typeof submissionYearLabel === "function" ? submissionYearLabel(a) : (a.year || "");
      const yearB = typeof submissionYearLabel === "function" ? submissionYearLabel(b) : (b.year || "");
      const yearCompare = String(yearA).localeCompare(String(yearB), undefined, { numeric:true, sensitivity:"base" });
      if(yearCompare) return yearCompare;
      return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
    });
};

var managementEnsureRevisionSelectionsV118 = function managementEnsureRevisionSelectionsV118(){
  const selectedProjects = new Set(managementOverviewSelectedProjectKeysV103);

  [...managementSelectedRevisionIdsV118.keys()].forEach(projectKey => {
    if(!selectedProjects.has(projectKey)) managementSelectedRevisionIdsV118.delete(projectKey);
  });

  selectedProjects.forEach(projectKey => {
    const submissions = managementProjectSubmissionsV118(projectKey);
    const validIds = new Set(submissions.map(item => item.id));
    let selected = managementSelectedRevisionIdsV118.get(projectKey);

    if(selected){
      selected = new Set([...selected].filter(id => validIds.has(id)).slice(0,2));
    }

    if(!selected || !selected.size){
      const latest = submissions.slice().sort(
        (a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
      )[0];
      selected = new Set(latest ? [latest.id] : []);
    }

    managementSelectedRevisionIdsV118.set(projectKey, selected);
  });
};

var managementSelectedSubmissionsByRevisionV118 = function managementSelectedSubmissionsByRevisionV118(){
  managementEnsureRevisionSelectionsV118();
  const items = [];

  [...managementOverviewSelectedProjectKeysV103].forEach(projectKey => {
    const submissions = managementProjectSubmissionsV118(projectKey);
    const selectedIds = managementSelectedRevisionIdsV118.get(projectKey) || new Set();
    submissions.forEach(item => {
      if(selectedIds.has(item.id)) items.push(item);
    });
  });

  return items;
};

var managementSyncComparisonSelectionsV103 = function managementSyncComparisonSelectionsV103(){
  const items = managementSelectedSubmissionsByRevisionV118();
  managementComparisonSelections = items.map(item => ({
    projectKey: managementProjectKey(item),
    revision: item.revision || "",
    submissionId: item.id
  }));
  managementUpdateOverviewStatsV103();
  renderManagementComparison();
};

var managementRevisionLabelV118 = function managementRevisionLabelV118(item){
  const revision = item.revision || "—";
  const year = typeof submissionYearLabel === "function" ? submissionYearLabel(item) : (item.year || "—");
  return `${revision} · ${year || "—"}`;
};

var ensureManagementRevisionPopoverV118 = function ensureManagementRevisionPopoverV118(){
  let popover = document.getElementById("managementRevisionPopoverV118");
  if(popover) return popover;

  popover = document.createElement("div");
  popover.id = "managementRevisionPopoverV118";
  popover.className = "management-revision-popover-v118 hidden";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "Select revisions to compare");
  document.body.appendChild(popover);
  return popover;
};

var closeManagementRevisionPopoverV118 = function closeManagementRevisionPopoverV118(){
  const popover = document.getElementById("managementRevisionPopoverV118");
  popover?.classList.add("hidden");
  managementRevisionPopoverProjectKeyV118 = "";
};

var positionManagementRevisionPopoverV118 = function positionManagementRevisionPopoverV118(trigger, popover){
  if(!trigger || !popover) return;
  const rect = trigger.getBoundingClientRect();
  const width = 250;
  const viewportPadding = 10;
  let left = rect.left;
  if(left + width > window.innerWidth - viewportPadding){
    left = window.innerWidth - width - viewportPadding;
  }
  left = Math.max(viewportPadding, left);

  popover.style.width = `${width}px`;
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(rect.bottom + 6)}px`;
};

var renderManagementRevisionPopoverV118 = function renderManagementRevisionPopoverV118(projectKey, trigger){
  const popover = ensureManagementRevisionPopoverV118();
  const submissions = managementProjectSubmissionsV118(projectKey);
  const selected = managementSelectedRevisionIdsV118.get(projectKey) || new Set();
  const maxReached = selected.size >= 2;

  popover.innerHTML = `
    <div class="management-revision-popover-head-v118">
      <div>
        <strong>Revision</strong>
        <small>Select up to 2 revisions</small>
      </div>
      <span>${selected.size}/2</span>
    </div>
    <div class="management-revision-options-v118">
      ${submissions.map(item => {
        const checked = selected.has(item.id);
        const disableUnchecked = !checked && maxReached;
        /* Keep at least one revision selected while the project itself is selected. */
        const disableOnlyChecked = checked && selected.size === 1;
        const disabled = disableUnchecked || disableOnlyChecked;
        return `
          <label class="management-revision-option-v118 ${checked ? "selected" : ""} ${disabled && !checked ? "limit-disabled" : ""}">
            <input
              type="checkbox"
              data-management-revision-checkbox-v118="${escapeHtml(item.id)}"
              data-management-revision-project-v118="${escapeHtml(projectKey)}"
              ${checked ? "checked" : ""}
              ${disabled ? "disabled" : ""}
            />
            <span>${escapeHtml(managementRevisionLabelV118(item))}</span>
          </label>
        `;
      }).join("")}
    </div>
  `;

  popover.classList.remove("hidden");
  managementRevisionPopoverProjectKeyV118 = projectKey;
  positionManagementRevisionPopoverV118(trigger, popover);
};

var renderManagementProjectSeparators = function renderManagementProjectSeparators(){
  const wrap=document.querySelector("#managementOverviewView .management-comparison-table-wrap");
  const table=$("managementComparisonTable");
  if(!wrap || !table) return;

  wrap.querySelectorAll(".management-project-separator-line, .management-table-outline-frame").forEach(line=>line.remove());
  if(table.classList.contains("hidden")) return;

  const firstRevisionCell = table.querySelector(".management-comparison-revision-head");
  const groupStartCells = [...table.querySelectorAll(".management-comparison-revision-head.management-project-group-start")];
  const boundaryCells = [firstRevisionCell, ...groupStartCells].filter((cell, index, arr)=>cell && arr.indexOf(cell)===index);
  if(!boundaryCells.length) return;

  const wrapRect=wrap.getBoundingClientRect();
  const tableRect=table.getBoundingClientRect();
  const top=tableRect.top-wrapRect.top+wrap.scrollTop;
  const left=tableRect.left-wrapRect.left+wrap.scrollLeft;
  const height=table.offsetHeight;
  const width=table.offsetWidth;

  const outline=document.createElement("span");
  outline.className="management-table-outline-frame";
  outline.setAttribute("aria-hidden","true");
  outline.style.left=`${left}px`;
  outline.style.top=`${top}px`;
  outline.style.width=`${width}px`;
  outline.style.height=`${height}px`;
  wrap.appendChild(outline);

  boundaryCells.forEach(cell=>{
    const cellRect=cell.getBoundingClientRect();
    const line=document.createElement("span");
    line.className="management-project-separator-line";
    line.setAttribute("aria-hidden","true");
    line.style.left=`${cellRect.left-wrapRect.left+wrap.scrollLeft}px`;
    line.style.top=`${top}px`;
    line.style.height=`${height}px`;
    wrap.appendChild(line);
  });
};

var renderManagementPoundageGuideSeparators = function renderManagementPoundageGuideSeparators(){
  const wrap=document.querySelector("#managementOverviewView .management-comparison-table-wrap");
  const table=$("managementComparisonTable");
  if(!wrap || !table) return;

  wrap.querySelectorAll(".management-poundage-guide-separator-line").forEach(line=>line.remove());
  if(table.classList.contains("hidden")) return;

  const wrapRect=wrap.getBoundingClientRect();
  const sectionRows=[...table.querySelectorAll("tbody .management-comparison-section-row")];

  sectionRows.forEach(sectionRow=>{
    const label=String(sectionRow.dataset.managementSectionLabel||"");
    if(!/^Poundage/.test(label)) return;

    let row=sectionRow.nextElementSibling;
    let firstGuideCell=null;
    let lastPoundageRow=null;

    while(row && !row.classList.contains("management-comparison-section-row")){
      const guideCell=row.querySelector(".management-poundage-item-cell .comparison-poundage-inline-guide-col");
      if(guideCell && !firstGuideCell) firstGuideCell=guideCell;
      if(guideCell) lastPoundageRow=row;
      row=row.nextElementSibling;
    }

    if(!firstGuideCell || !lastPoundageRow) return;

    const guideRect=firstGuideCell.getBoundingClientRect();
    const sectionRect=sectionRow.getBoundingClientRect();
    const lastRect=lastPoundageRow.getBoundingClientRect();

    const line=document.createElement("span");
    line.className="management-poundage-guide-separator-line";
    line.setAttribute("aria-hidden","true");
    line.style.left=`${guideRect.left-wrapRect.left+wrap.scrollLeft}px`;
    line.style.top=`${sectionRect.top-wrapRect.top+wrap.scrollTop}px`;
    line.style.height=`${lastRect.bottom-sectionRect.top}px`;
    wrap.appendChild(line);
  });
};

var renderManagementComparison = function renderManagementComparison(){
  const card=$("managementCombinedComparisonCardV101");
  const table=$("managementComparisonTable");
  const empty=$("managementComparisonEmpty");
  const head=$("managementComparisonHead");
  const body=$("managementComparisonBody");
  const pill=$("comparisonColumnCountPill");
  const summary=$("managementCombinedComparisonSummaryV101");
  if(!card || !table || !empty || !head || !body) return;

  const items=selectedManagementComparisonSubmissions();
  const projectCount=new Set(items.map(item=>managementProjectKey(item))).size;
  // Keep one blank project column when there are no selected submissions.
  const columnCount=Math.max(1, items.length);

  table.classList.toggle("management-single-column-view", columnCount === 1);
  card.classList.toggle("management-single-column-card", columnCount === 1);

  if(pill) pill.textContent=`${items.length} column${items.length===1?"":"s"}`;
  if(summary){
    summary.textContent=items.length
      ? `${projectCount} selected project${projectCount===1?"":"s"} · ${items.length} comparison column${items.length===1?"":"s"}.`
      : "Tick projects from Select Project to start comparing.";
  }

  if(!items.length){
    closeManagementRevisionPopoverV118();
  }

  card.classList.remove("hidden");
  empty.classList.add("hidden");
  table.classList.remove("hidden");
  table.style.minWidth=items.length>4 ? `${380+items.length*175}px` : "0px";

  const projectGroups=[];
  items.forEach((item,index)=>{
    const projectKey=managementProjectKey(item);
    const last=projectGroups[projectGroups.length-1];
    if(last && last.projectKey===projectKey){
      last.items.push({item,index});
    }else{
      projectGroups.push({
        projectKey,
        projectName:item.project||"Project",
        items:[{item,index}]
      });
    }
  });

  head.innerHTML=`
    <tr class="management-comparison-project-group-row">
      <th rowspan="2" class="management-comparison-item-head">Item</th>
      ${projectGroups.map((group,groupIndex)=>`
        <th
          colspan="${group.items.length}"
          class="management-comparison-project-group-head ${groupIndex>0?"management-project-group-start":""}"
        >
          <strong>${escapeHtml(group.projectName)}</strong>
        </th>
      `).join("") || `<th class="management-comparison-project-group-head"><strong>No project selected</strong></th>`}
    </tr>
    <tr class="management-comparison-revision-row">
      ${items.map((item,index)=>{
        const projectKey=managementProjectKey(item);
        const isGroupStart=index>0 && managementProjectKey(items[index-1])!==projectKey;
        return `
          <th class="management-comparison-revision-head ${isGroupStart?"management-project-group-start":""}">
            <button
              type="button"
              class="management-revision-trigger-v118"
              data-management-revision-trigger-v118="${escapeHtml(projectKey)}"
              aria-haspopup="dialog"
              title="Choose revisions to compare"
            >
              <span>${escapeHtml(managementRevisionLabelV118(item))}</span>
              <span class="management-revision-chevron-v118" aria-hidden="true">⌄</span>
            </button>
          </th>
        `;
      }).join("") || `<th class="management-comparison-revision-head"><span class="management-revision-trigger-v118">—</span></th>`}
    </tr>
  `;

  const rows=managementComparisonRows(items);
  const poundageGuideShown={};
  body.innerHTML=rows.map(entry=>{
    if(entry.type==="section"){
      return `<tr class="management-comparison-section-row" data-management-section-label="${escapeHtml(entry.label)}"><td colspan="${columnCount+1}"><div class="management-comparison-section-head-v124">${/^Poundage/.test(entry.label||"") ? `<span class="management-poundage-section-title-with-guide"><span class="management-poundage-section-title-main">${escapeHtml(entry.label)}</span><span class="management-poundage-section-title-guide">Guide (kg/m³)</span></span>` : `<span>${escapeHtml(entry.label)}</span>`}${typeof managementComparisonSectionActionsV136 === "function" ? managementComparisonSectionActionsV136(entry.label, items) : (entry.label === "Pilling Info" ? `<button type="button" class="management-pile-reference-comparison-btn-v124" data-open-management-pile-reference-v124="true">Pile Reference</button>` : "")}</div></td></tr>`;
    }

    const values=items.map(item=>managementComparisonDisplay(item,entry));
    const distinct=new Set(values.filter(value=>value!=="—"));
    const labelText=entry.label||entry.row.label;
    const guide=managementComparisonGuide(entry);
    const poundageGuideKey=(entry.buildingTypeScope||"default");
    const showGuideHead=!!guide && entry.sectionTitle==="Poundage" && !poundageGuideShown[poundageGuideKey];
    if(showGuideHead) poundageGuideShown[poundageGuideKey]=true;

    return `
      <tr>
        <td class="${guide ? `management-poundage-item-cell` : ``}">${guide ? `
          <div class="comparison-poundage-inline-guide${showGuideHead?` comparison-poundage-inline-guide-first`:``}">
            <span class="comparison-poundage-label">${escapeHtml(labelText)}</span>
            <span class="comparison-poundage-inline-divider" aria-hidden="true"></span>
            <span class="comparison-poundage-inline-guide-col"><small class="comparison-poundage-guide-text">${escapeHtml(guide)}</small></span>
          </div>
        ` : `<span>${escapeHtml(labelText)}</span>`}</td>
        ${items.map((item,index)=>{
          const isGroupStart=index>0 && managementProjectKey(items[index-1])!==managementProjectKey(item);
          const classes=[distinct.size>1?"comparison-different":"",isGroupStart?"management-project-group-start":""].filter(Boolean).join(" ");
          return `<td class="${classes}">${typeof managementComparisonCellMarkupV131 === "function" ? managementComparisonCellMarkupV131(item,entry,values[index]) : escapeHtml(values[index])}</td>`;
        }).join("") || `<td>—</td>`}
      </tr>
    `;
  }).join("");

  requestAnimationFrame(()=>{
    renderManagementProjectSeparators();
    renderManagementPoundageGuideSeparators();
  });

  /* If the popover was open before the table rerender, keep it open beside the
     first matching revision trigger so users can tick a second revision. */
  if(managementRevisionPopoverProjectKeyV118){
    requestAnimationFrame(()=>{
      const key=managementRevisionPopoverProjectKeyV118;
      const trigger=[...document.querySelectorAll("[data-management-revision-trigger-v118]")]
        .find(node=>node.dataset.managementRevisionTriggerV118===key);
      if(trigger) renderManagementRevisionPopoverV118(key,trigger);
      else closeManagementRevisionPopoverV118();
    });
  }
};

/* per-project revision multi-select for Internal comparison (maximum 2). */

let managementSelectedRevisionIdsV118 = new Map();
let managementRevisionPopoverProjectKeyV118 = "";







/* Replace the V103 latest-only sync with revision-aware selections. */
















/* Replace the comparison renderer so every selected revision is its own column. */


document.addEventListener("DOMContentLoaded",()=>{
  ensureManagementRevisionPopoverV118();
  window.addEventListener("resize",()=>requestAnimationFrame(()=>{
    renderManagementProjectSeparators();
    renderManagementPoundageGuideSeparators();
  }));

  document.addEventListener("click",event=>{
    const trigger=event.target.closest("[data-management-revision-trigger-v118]");
    if(trigger){
      event.preventDefault();
      event.stopPropagation();
      const projectKey=trigger.dataset.managementRevisionTriggerV118;
      if(!projectKey) return;

      managementEnsureRevisionSelectionsV118();
      const popover=ensureManagementRevisionPopoverV118();
      const isSameOpen=managementRevisionPopoverProjectKeyV118===projectKey && !popover.classList.contains("hidden");
      if(isSameOpen){
        closeManagementRevisionPopoverV118();
      }else{
        renderManagementRevisionPopoverV118(projectKey,trigger);
      }
      return;
    }

    if(!event.target.closest("#managementRevisionPopoverV118")){
      closeManagementRevisionPopoverV118();
    }
  });

  document.addEventListener("change",event=>{
    const checkbox=event.target.closest("[data-management-revision-checkbox-v118]");
    if(!checkbox) return;
    event.stopPropagation();

    const projectKey=checkbox.dataset.managementRevisionProjectV118;
    const submissionId=checkbox.dataset.managementRevisionCheckboxV118;
    if(!projectKey || !submissionId) return;

    const selected=new Set(managementSelectedRevisionIdsV118.get(projectKey) || []);
    if(checkbox.checked){
      if(selected.size>=2){
        checkbox.checked=false;
        return;
      }
      selected.add(submissionId);
    }else{
      if(selected.size<=1){
        checkbox.checked=true;
        return;
      }
      selected.delete(submissionId);
    }

    managementSelectedRevisionIdsV118.set(projectKey,selected);
    managementRevisionPopoverProjectKeyV118=projectKey;
    managementSyncComparisonSelectionsV103();
  });

  window.addEventListener("resize",closeManagementRevisionPopoverV118);
  window.addEventListener("scroll",closeManagementRevisionPopoverV118,true);
});
;

/* ---- js/management/comparison-filter-sync.js ---- */
var managementSetComparisonSourceV119 = function managementSetComparisonSourceV119(source){
  managementComparisonSourceV119 = source === "filter" ? "filter" : "project";
};

var managementFilterActiveProjectKeysV119 = function managementFilterActiveProjectKeysV119(){
  return [...new Set(
    (managementComparisonSelections || [])
      .map(selection => selection && selection.projectKey)
      .filter(Boolean)
  )];
};

var managementSyncProjectTicksFromFilterV120 = function managementSyncProjectTicksFromFilterV120(){
  const projectKeys = managementFilterActiveProjectKeysV119();

  /* Filter-selected projects become the same checked project set used by the
     Select Project and Search Project controls. */
  managementOverviewSelectedProjectKeysV103 = new Set(projectKeys);

  if(typeof renderManagementProjectMultiSelectV103 === "function"){
    renderManagementProjectMultiSelectV103();
  }

  const searchInput = $("managementOverviewProjectSearch");
  const searchQuery = String(searchInput?.value || "").trim();
  if(searchQuery && typeof renderManagementOverviewProjectSearchV20 === "function"){
    renderManagementOverviewProjectSearchV20(searchQuery);
  }

  if(typeof managementUpdateOverviewStatsV103 === "function"){
    managementUpdateOverviewStatsV103();
  }
};

var managementEnsureFilterRevisionSelectionsV119 = function managementEnsureFilterRevisionSelectionsV119(projectKeys){
  const active = new Set(projectKeys);

  /* Do not erase revision choices belonging to manually ticked projects; just
     validate/initialise the projects currently coming from the filter. */
  projectKeys.forEach(projectKey => {
    const submissions = managementProjectSubmissionsV118(projectKey);
    const validIds = new Set(submissions.map(item => item.id));
    let selected = new Set(
      [...(managementSelectedRevisionIdsV118.get(projectKey) || [])]
        .filter(id => validIds.has(id))
        .slice(0,2)
    );

    if(!selected.size){
      const currentSelections = (managementComparisonSelections || [])
        .filter(selection => selection && selection.projectKey === projectKey);

      currentSelections.forEach(selection => {
        if(selected.size >= 2) return;
        let match = null;
        if(selection.submissionId){
          match = submissions.find(item => item.id === selection.submissionId) || null;
        }
        if(!match && selection.revision){
          match = submissions
            .filter(item => String(item.revision || "") === String(selection.revision || ""))
            .sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0] || null;
        }
        if(match) selected.add(match.id);
      });
    }

    if(!selected.size){
      const latest = submissions.slice().sort(
        (a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
      )[0];
      if(latest) selected.add(latest.id);
    }

    managementSelectedRevisionIdsV118.set(projectKey, selected);
  });
};

var managementFilteredSubmissionsByRevisionV119 = function managementFilteredSubmissionsByRevisionV119(){
  const projectKeys = managementFilterActiveProjectKeysV119();
  managementEnsureFilterRevisionSelectionsV119(projectKeys);
  const items = [];

  projectKeys.forEach(projectKey => {
    const selectedIds = managementSelectedRevisionIdsV118.get(projectKey) || new Set();
    managementProjectSubmissionsV118(projectKey).forEach(item => {
      if(selectedIds.has(item.id)) items.push(item);
    });
  });

  return items;
};

/* restore Comparison filters on the combined Internal Overview.
   Conflict rule: whichever selector was used most recently wins.
   - Filter action last => filtered projects populate the comparison table.
   - Project tick/search tick last => ticked projects populate the comparison table.
   Revision selection remains attached to the currently active project set. */

let managementComparisonSourceV119 = "project";



/* Re-enable the original filter renderer that V103 intentionally disabled. */
if(typeof window.renderManagementComparisonFiltersLegacyV119 === "function"){
  renderManagementComparisonFilters = function(){
    return window.renderManagementComparisonFiltersLegacyV119();
  };
}









/* V118 made this function revision-aware for project ticks. Extend it so the
   active filter set can also retain revision choices without falling back to
   stale project ticks. */
const managementSyncComparisonSelectionsProjectV119 = managementSyncComparisonSelectionsV103;
managementSyncComparisonSelectionsV103 = function(){
  if(managementComparisonSourceV119 !== "filter"){
    return managementSyncComparisonSelectionsProjectV119();
  }

  const items = managementFilteredSubmissionsByRevisionV119();
  managementComparisonSelections = items.map(item => ({
    projectKey: managementProjectKey(item),
    revision: item.revision || "",
    submissionId: item.id
  }));
  managementUpdateOverviewStatsV103();
  renderManagementComparison();
  renderManagementComparisonFilters();
};

/* The legacy filter setter remains the source of the old filter semantics.
   Wrap it only to mark Filter as the latest source and then convert its latest
   revision choices to the new V118 revision-aware columns. */
if(typeof window.setManagementComparisonProjectsFromFilterLegacyV119 === "function"){
  setManagementComparisonProjectsFromFilter = function(selectedDisplayKeys){
    managementSetComparisonSourceV119("filter");
    window.setManagementComparisonProjectsFromFilterLegacyV119(selectedDisplayKeys);
    managementSyncProjectTicksFromFilterV120();
    managementSyncComparisonSelectionsV103();
  };
}

/* Project tickboxes (Select Project and Search Project) get priority as soon as
   the user interacts with them. Capture phase runs before the existing V103 / V116 handlers. */
document.addEventListener("change", event => {
  if(event.target.closest(
    "[data-management-project-checkbox-v103], [data-management-search-checkbox-v116]"
  )){
    managementSetComparisonSourceV119("project");
  }
}, true);

document.addEventListener("click", event => {
  if(event.target.closest(
    ".internal-project-multiselect-option, [data-management-search-checkbox-v116], #clearManagementProjectSelectionV103"
  )){
    managementSetComparisonSourceV119("project");
  }
}, true);

/* Filter interactions mark Filter as the latest source before the older event
   handlers rebuild the comparison selection. Section-only filters don't alter
   project selection, but they still remain part of the filter workflow. */
document.addEventListener("click", event => {
  if(event.target.closest(
    "[data-comparison-type-filter], #addManagementComparisonCategoryBtn, [data-remove-comparison-category]"
  )){
    managementSetComparisonSourceV119("filter");
  }
}, true);

document.addEventListener("change", event => {
  if(event.target.closest(
    "[data-comparison-filter-all-projects], [data-comparison-filter-project], [data-comparison-category-option]"
  )){
    managementSetComparisonSourceV119("filter");
  }
}, true);

/* Keep the filter popup above the merged comparison table and other selectors. */
document.addEventListener("DOMContentLoaded", () => {
  /* Filters are visible from the start instead of behaving like a hidden popup. */
  managementComparisonFiltersOpen = true;
  managementComparisonFiltersPinned = true;
  renderManagementComparisonFilters();
  renderManagementComparison();
});
;

/* ---- js/management/submission-setup-modal.js ---- */


/* ============================================================
   Submission Setup modal access from Internal Overview
   ============================================================ */
(function(){
  function openManagementSubmissionSetupModalV121(){
    if(state.auth?.role !== "Management") return;
    const modal = document.getElementById("managementSettingsModal");
    if(!modal) return;

    if(typeof window.beginManagementEditV31 === "function") window.beginManagementEditV31();

    if(typeof renderManagementSettings === "function"){
      renderManagementSettings();
    }

    modal.classList.remove("hidden");
    document.body.classList.add("management-settings-modal-open-v121");

    window.setTimeout(() => {
      document.getElementById("closeManagementSubmissionSetupBtn")?.focus();
    }, 0);
  }

  function closeManagementSubmissionSetupModalV121(){
    const modal = document.getElementById("managementSettingsModal");
    if(!modal) return;
    if(typeof window.managementEditMayCloseV31 === "function" && !window.managementEditMayCloseV31()) return;
    modal.classList.add("hidden");
    document.body.classList.remove("management-settings-modal-open-v121");
    document.getElementById("openManagementSubmissionSetupBtn")?.focus();
  }

  window.openManagementSubmissionSetupModalV121 = openManagementSubmissionSetupModalV121;
  window.closeManagementSubmissionSetupModalV121 = closeManagementSubmissionSetupModalV121;

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("openManagementSubmissionSetupBtn")
      ?.addEventListener("click", openManagementSubmissionSetupModalV121);

    document.getElementById("closeManagementSubmissionSetupBtn")
      ?.addEventListener("click", closeManagementSubmissionSetupModalV121);

    document.getElementById("managementSettingsModal")
      ?.addEventListener("click", event => {
        if(event.target === event.currentTarget){
          closeManagementSubmissionSetupModalV121();
        }
      });

    document.addEventListener("keydown", event => {
      if(event.key !== "Escape") return;
      if(document.querySelector("#submissionVersionHistoryV31:not(.hidden)")) return;
      const modal = document.getElementById("managementSettingsModal");
      if(modal && !modal.classList.contains("hidden")){
        closeManagementSubmissionSetupModalV121();
      }
    });
  });
})();
;

/* ---- js/management/pile-reference-modal.js ---- */


/* ============================================================
   Pile Reference modal from Comparison > Pilling Info
   ============================================================ */
(function(){
  function openManagementPileReferenceModalV124(){
    const modal=document.getElementById("managementPileReferenceModalV124");
    if(!modal) return;

    if(typeof renderManagementPileReference === "function"){
      renderManagementPileReference();
    }

    modal.classList.remove("hidden");
    document.body.classList.add("management-pile-reference-modal-open-v124");

    window.setTimeout(()=>{
      document.getElementById("closeManagementPileReferenceModalV124")?.focus();
    },0);
  }

  function closeManagementPileReferenceModalV124(){
    const modal=document.getElementById("managementPileReferenceModalV124");
    if(!modal) return;
    modal.classList.add("hidden");
    document.body.classList.remove("management-pile-reference-modal-open-v124");
  }

  window.openManagementPileReferenceModalV124=openManagementPileReferenceModalV124;
  window.closeManagementPileReferenceModalV124=closeManagementPileReferenceModalV124;

  document.addEventListener("DOMContentLoaded",()=>{
    document.addEventListener("click",event=>{
      const trigger=event.target.closest("[data-open-management-pile-reference-v124]");
      if(!trigger) return;
      event.preventDefault();
      event.stopPropagation();
      openManagementPileReferenceModalV124();
    });

    document.getElementById("closeManagementPileReferenceModalV124")
      ?.addEventListener("click",closeManagementPileReferenceModalV124);

    document.getElementById("managementPileReferenceModalV124")
      ?.addEventListener("click",event=>{
        if(event.target===event.currentTarget){
          closeManagementPileReferenceModalV124();
        }
      });

    document.addEventListener("keydown",event=>{
      if(event.key!=="Escape") return;
      const modal=document.getElementById("managementPileReferenceModalV124");
      if(modal && !modal.classList.contains("hidden")){
        closeManagementPileReferenceModalV124();
      }
    });
  });
})();
;

/* ---- js/management/detail-review.js ---- */


/* detailed Management comparison review for Poundage and Drawings. */

/* The full Management submission review now lists each uploaded file directly,
   rather than requiring a second folder popup before the file can be reviewed. */

document.addEventListener("DOMContentLoaded",()=>{
  document.addEventListener("click",event=>{
    const button=event.target.closest("[data-management-direct-open-file-v131]");
    if(!button) return;
    event.preventDefault();
    event.stopPropagation();

    if(typeof openManagementSubmissionFile !== "function") return;
    openManagementSubmissionFile(
      button.dataset.managementDirectOpenFileV131,
      button.dataset.managementDirectFileFieldV131,
      button.dataset.managementDirectFileIndexV131
    );
  });
});
;

/* ---- js/management/review-modals.js ---- */
var managementPoundageReviewDetailV132 = function managementPoundageReviewDetailV132(item, fieldKey){
  const store=item?.formData?.poundageDetails;
  if(!store || typeof store!=="object" || Array.isArray(store)) return {};
  const detail=store[fieldKey];
  return detail && typeof detail==="object" ? detail : {};
};

var managementPoundageReviewTriggerV132 = function managementPoundageReviewTriggerV132(item, entry, valueDisplay){
  const data=item?.formData || {};
  if(entry?.buildingTypeScope && managementComparisonNormalizedBuildingType(data)!==entry.buildingTypeScope){
    return `<span class="management-comparison-empty-v131">—</span>`;
  }

  const fieldKey=entry?.row?.key || "";
  const detail=managementPoundageReviewDetailV132(item,fieldKey);
  const remark=String(detail.exceedReason || "").trim();
  const exceeded=!!detail.exceeded;
  const label=entry?.label || entry?.row?.label || "Poundage";

  return `
    <button
      type="button"
      class="management-poundage-review-trigger-v132 ${exceeded ? "is-exceeded" : ""}"
      data-management-poundage-review-v132="${escapeHtml(item.id || "")}"
      data-management-poundage-field-v132="${escapeHtml(fieldKey)}"
      data-management-poundage-label-v132="${escapeHtml(label)}"
      data-management-poundage-value-v132="${escapeHtml(valueDisplay || "—")}"
    >
      <span class="management-poundage-review-trigger-copy-v132">
        <strong>${escapeHtml(valueDisplay || "—")}</strong>
        ${remark ? `<small>Remark: ${escapeHtml(remark)}</small>` : ``}
      </span>
    </button>
  `;
};

var managementComparisonDrawingMarkupV132 = function managementComparisonDrawingMarkupV132(item, entry){
  const fieldKey=entry?.row?.key || "";
  const files=normaliseDrawingFiles(item?.formData?.[fieldKey]);
  if(!files.length) return `<span class="management-comparison-empty-v131">—</span>`;

  const label=managementDrawingFieldLabel(fieldKey,entry?.row?.label || "Drawing Files");
  return `
    <button
      type="button"
      class="drawing-folder-card management-drawing-folder-card management-comparison-drawing-folder-v132"
      data-management-open-file-folder="${escapeHtml(item.id || "")}"
      data-management-file-folder-field="${escapeHtml(fieldKey)}"
      data-management-file-folder-label="${escapeHtml(label)}"
    >
      <span class="drawing-folder-icon">▰</span>
      <span class="drawing-folder-copy">
        <strong>${escapeHtml(label)}</strong>
        <small>${files.length} file${files.length===1?"":"s"} uploaded</small>
      </span>
      <span class="drawing-folder-open">Open <strong>→</strong></span>
    </button>
  `;
};

var managementComparisonCellMarkupV131 = function managementComparisonCellMarkupV131(item, entry, valueDisplay){
  if(entry?.sectionTitle==="Poundage"){
    return managementPoundageReviewTriggerV132(item,entry,valueDisplay);
  }
  if(entry?.row?.type==="file"){
    return managementComparisonDrawingMarkupV132(item,entry);
  }
  return escapeHtml(valueDisplay || "—");
};

var managementSubmissionFileMarkup = function managementSubmissionFileMarkup(submissionId,row,data){
  const files=normaliseDrawingFiles(data?.[row.key]);
  if(!files.length) return `<div class="management-readonly-value">—</div>`;

  const label=managementDrawingFieldLabel(row.key,row.label || "Drawing Files");
  return `
    <button
      type="button"
      class="drawing-folder-card management-drawing-folder-card"
      data-management-open-file-folder="${escapeHtml(submissionId)}"
      data-management-file-folder-field="${escapeHtml(row.key)}"
      data-management-file-folder-label="${escapeHtml(label)}"
    >
      <span class="drawing-folder-icon">▰</span>
      <span class="drawing-folder-copy">
        <strong>${escapeHtml(label)}</strong>
        <small>${files.length} file${files.length===1?"":"s"} uploaded</small>
      </span>
      <span class="drawing-folder-open">Open <strong>→</strong></span>
    </button>
  `;
};

var openManagementPoundageReviewV132 = function openManagementPoundageReviewV132(button){
  const submissionId=button?.dataset?.managementPoundageReviewV132 || "";
  const fieldKey=button?.dataset?.managementPoundageFieldV132 || "";
  const submission=getSubmissions().find(item=>item.id===submissionId);
  if(!submission) return;

  const detail=managementPoundageReviewDetailV132(submission,fieldKey);
  const remark=String(detail.exceedReason || "").trim();
  const label=button.dataset.managementPoundageLabelV132 || "Poundage";
  const value=button.dataset.managementPoundageValueV132 || "—";

  $("managementPoundageReviewTitleV132").textContent=label;
  $("managementPoundageReviewMetaV132").textContent=[
    submission.project,
    submission.revision,
    typeof submissionYearLabel==="function" ? submissionYearLabel(submission) : submission.year
  ].filter(Boolean).join(" · ");
  $("managementPoundageReviewValueV132").textContent=value;
  $("managementPoundageReviewValueV132").classList.toggle("is-exceeded",!!detail.exceeded);
  $("managementPoundageReviewSteelV133").textContent = detail.steelWeight !== undefined && String(detail.steelWeight).trim() !== "" ? String(detail.steelWeight) : "—";
  $("managementPoundageReviewConcreteV133").textContent = detail.concreteVolume !== undefined && String(detail.concreteVolume).trim() !== "" ? String(detail.concreteVolume) : "—";
  $("managementPoundageReviewRemarkV132").textContent=remark || "—";

  $("managementPoundageReviewModalV132").classList.remove("hidden");
  document.body.classList.add("modal-open");
};

var managementHasVisibleModalV134 = function managementHasVisibleModalV134(){
  const modalIds=[
    "managementSubmissionModal",
    "managementDrawingFolderModal",
    "managementSettingsModal",
    "managementPileReferenceModalV124",
    "loadingCapacityModal",
    "pileCheckModal"
  ];

  return modalIds.some(id=>{
    const el=$(id);
    return !!el && !el.classList.contains("hidden");
  });
};

var closeManagementPoundageReviewV132 = function closeManagementPoundageReviewV132(){
  $("managementPoundageReviewModalV132")?.classList.add("hidden");

  /* release the global scroll lock whenever no other modal is still open.
     The previous check used an obsolete managementSettingsModalV121 id, so
     body.modal-open could remain stuck after closing Poundage review. */
  if(!managementHasVisibleModalV134()){
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("overflow");
  }
};

var openManagementSubmissionModal = function openManagementSubmissionModal(submissionId){
  const item=getSubmissions().find(sub=>sub.id===submissionId);
  if(!item) return;
  const data=item.formData || {};

  $("managementSubmissionModalTitle").textContent=item.project || "Submission";
  $("managementSubmissionModalMeta").textContent=`${item.region || "—"} · ${item.businessUnit || "—"} · ${item.revision || "—"} · ${typeof submissionYearLabel === "function" ? submissionYearLabel(item) : (item.year || "—")}`;

  let bodyHtml=`
    <div class="management-readonly-submission-wrap">
      <table class="overview-table management-readonly-submission-table">
        <thead><tr><th>Item</th><th>${escapeHtml(item.revision || "Value")}</th></tr></thead>
        <tbody>
  `;

  OVERVIEW_SECTIONS.forEach(section=>{
    bodyHtml+=`<tr class="section-row"><td colspan="2"><div class="section-row-content"><span>${escapeHtml(section.title)}</span></div></td></tr>`;
    const rows=managementSettingsRowsForSection(section);

    rows.forEach(row=>{
      if(row.key==="landedType" && data.buildingType!=="Landed") return;
      if(row.showWhen && !row.showWhen(data)) return;
      const valueDisplay=managementSubmissionValueDisplay(row,data);

      if(row.type==="file"){
        bodyHtml+=`
          <tr>
            <td><div class="field-label">${escapeHtml(row.label)}</div></td>
            <td>${managementSubmissionFileMarkup(item.id,row,data)}</td>
          </tr>`;
        return;
      }

      if(section.title==="Poundage"){
        const detail=managementPoundageReviewDetailV132(item,row.key);
        const remark=String(detail.exceedReason || "").trim();
        const exceeded=!!detail.exceeded;
        const label=managementPoundageRowLabel(row.key,row.label,data.buildingType);
        bodyHtml+=`
          <tr>
            <td><div class="field-label">${escapeHtml(label)}</div></td>
            <td>
              <button
                type="button"
                class="management-poundage-review-trigger-v132 ${exceeded ? "is-exceeded" : ""}"
                data-management-poundage-review-v132="${escapeHtml(item.id)}"
                data-management-poundage-field-v132="${escapeHtml(row.key)}"
                data-management-poundage-label-v132="${escapeHtml(label)}"
                data-management-poundage-value-v132="${escapeHtml(valueDisplay || "—")}"
              >
                <span class="management-poundage-review-trigger-copy-v132">
                  <strong>${escapeHtml(valueDisplay || "—")}</strong>
                  ${remark ? `<small>Remark: ${escapeHtml(remark)}</small>` : ``}
                </span>
              </button>
            </td>
          </tr>`;
        return;
      }

      bodyHtml+=`
        <tr>
          <td><div class="field-label">${escapeHtml(row.label)}</div></td>
          <td><div class="management-readonly-value">${escapeHtml(valueDisplay)}</div></td>
        </tr>`;
    });
  });

  bodyHtml+=`</tbody></table></div>`;
  $("managementSubmissionModalBody").innerHTML=bodyHtml;
  $("managementSubmissionModal").classList.remove("hidden");
  document.body.classList.add("modal-open");
};

/* Consultant-style compact review for Internal Poundage + Drawings. */







/* Override V131: compact Consultant-style cells. */


/* Override V131: one folder represents the complete drawing set for the selected revision. */








/* Override the full Management submission modal too: Poundage is read-only via popup,
   and Drawings remain one folder card per drawing category. */


document.addEventListener("DOMContentLoaded",()=>{
  document.addEventListener("click",event=>{
    const poundage=event.target.closest("[data-management-poundage-review-v132]");
    if(poundage){
      event.preventDefault();
      event.stopPropagation();
      openManagementPoundageReviewV132(poundage);
      return;
    }

    /* Existing folder listener only covers the full submission modal. This covers
       folder cards rendered directly inside the Comparison table. */
    const folder=event.target.closest("[data-management-open-file-folder]");
    if(folder && !folder.closest("#managementSubmissionModal")){
      event.preventDefault();
      event.stopPropagation();
      openManagementDrawingFolderModal(
        folder.dataset.managementOpenFileFolder,
        folder.dataset.managementFileFolderField,
        folder.dataset.managementFileFolderLabel
      );
    }
  });

  $("closeManagementPoundageReviewV132")?.addEventListener("click",closeManagementPoundageReviewV132);
  $("managementPoundageReviewModalV132")?.addEventListener("click",event=>{
    if(event.target===$("managementPoundageReviewModalV132")) closeManagementPoundageReviewV132();
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape" && !$("managementPoundageReviewModalV132")?.classList.contains("hidden")){
      closeManagementPoundageReviewV132();
    }
  });
});
;

/* ---- js/management/internal-pile-check.js ---- */
var managementComparisonSectionActionsV136 = function managementComparisonSectionActionsV136(label, items = []){
  if(label === "Pilling Info"){
    return `
      <button
        type="button"
        class="management-pile-reference-comparison-btn-v124"
        data-open-management-pile-reference-v124="true"
      >Pile Reference</button>
    `;
  }

  if(label === "Pile Efficiency & Loading"){
    const disabled = !Array.isArray(items) || !items.length;
    return `
      <button
        type="button"
        class="management-pile-check-comparison-btn-v136"
        data-open-management-pile-check-v136="true"
        ${disabled ? "disabled" : ""}
        ${disabled ? 'title="Select a project first"' : 'title="Open Internal Pile Check"'}
      >Pile Check</button>
    `;
  }

  return "";
};

var ensureManagementPileCheckChooserV136 = function ensureManagementPileCheckChooserV136(){
  if(managementPileCheckChooserV136) return managementPileCheckChooserV136;

  const chooser = document.createElement("div");
  chooser.id = "managementPileCheckChooserV136";
  chooser.className = "management-pile-check-chooser-v136 hidden";
  chooser.setAttribute("role", "dialog");
  chooser.setAttribute("aria-label", "Choose project revision for pile check");
  document.body.appendChild(chooser);
  managementPileCheckChooserV136 = chooser;
  return chooser;
};

var closeManagementPileCheckChooserV136 = function closeManagementPileCheckChooserV136(){
  const chooser = ensureManagementPileCheckChooserV136();
  chooser.classList.add("hidden");
  chooser.innerHTML = "";
};

var positionManagementPileCheckChooserV136 = function positionManagementPileCheckChooserV136(trigger, chooser){
  if(!trigger || !chooser) return;
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(320, Math.max(250, window.innerWidth - 24));
  let left = rect.right - width;
  left = Math.max(12, Math.min(left, window.innerWidth - width - 12));

  let top = rect.bottom + 7;
  const estimatedHeight = Math.min(300, 64 + chooser.querySelectorAll("[data-pile-check-submission-v136]").length * 48);
  if(top + estimatedHeight > window.innerHeight - 12){
    top = Math.max(12, rect.top - estimatedHeight - 7);
  }

  chooser.style.width = `${width}px`;
  chooser.style.left = `${Math.round(left)}px`;
  chooser.style.top = `${Math.round(top)}px`;
};

var managementPileCheckComparisonItemsV136 = function managementPileCheckComparisonItemsV136(){
  if(typeof selectedManagementComparisonSubmissions !== "function") return [];
  const seen = new Set();
  return selectedManagementComparisonSubmissions().filter(item => {
    if(!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

var openManagementPileCheckFromComparisonV136 = function openManagementPileCheckFromComparisonV136(trigger){
  const items = managementPileCheckComparisonItemsV136();
  if(!items.length) return;

  if(items.length === 1){
    closeManagementPileCheckChooserV136();
    openManagementPileCheck(items[0].id);
    return;
  }

  const chooser = ensureManagementPileCheckChooserV136();
  chooser.innerHTML = `
    <div class="management-pile-check-chooser-head-v136">
      <strong>Internal Pile Check</strong>
      <small>Choose a project revision</small>
    </div>
    <div class="management-pile-check-chooser-list-v136">
      ${items.map(item => {
        const year = typeof submissionYearLabel === "function"
          ? submissionYearLabel(item)
          : (item.year || "");
        return `
          <button
            type="button"
            class="management-pile-check-choice-v136"
            data-pile-check-submission-v136="${escapeHtml(item.id)}"
          >
            <strong>${escapeHtml(item.project || "Project")}</strong>
            <span>${escapeHtml(item.revision || "—")}${year ? ` · ${escapeHtml(year)}` : ""}</span>
          </button>
        `;
      }).join("")}
    </div>
  `;
  chooser.classList.remove("hidden");
  positionManagementPileCheckChooserV136(trigger, chooser);
};

var managementPileCheckModalIsOpenV136 = function managementPileCheckModalIsOpenV136(){
  const modal = document.getElementById("managementPileCheckModal");
  return Boolean(modal && !modal.classList.contains("hidden"));
};

/* ============================================================
   Internal Pile Check from Comparison > Pile Efficiency & Loading
   ============================================================ */

let managementPileCheckChooserV136 = null;















document.addEventListener("DOMContentLoaded", () => {
  ensureManagementPileCheckChooserV136();

  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-open-management-pile-check-v136]");
    if(trigger){
      event.preventDefault();
      event.stopPropagation();
      if(trigger.disabled) return;
      openManagementPileCheckFromComparisonV136(trigger);
      return;
    }

    const choice = event.target.closest("[data-pile-check-submission-v136]");
    if(choice){
      event.preventDefault();
      event.stopPropagation();
      const id = choice.dataset.pileCheckSubmissionV136;
      closeManagementPileCheckChooserV136();
      if(id) openManagementPileCheck(id);
      return;
    }

    const chooser = ensureManagementPileCheckChooserV136();
    if(!chooser.classList.contains("hidden") && !event.target.closest("#managementPileCheckChooserV136")){
      closeManagementPileCheckChooserV136();
    }
  });

  document.addEventListener("keydown", event => {
    if(event.key === "Escape" && !managementPileCheckModalIsOpenV136()){
      closeManagementPileCheckChooserV136();
    }
  });

  window.addEventListener("resize", closeManagementPileCheckChooserV136);
  window.addEventListener("scroll", closeManagementPileCheckChooserV136, true);
});
;

/* ---- js/management/drawing-revision.js ---- */
var managementDrawingRevisionCandidatesV147 = function managementDrawingRevisionCandidatesV147(anchorSubmission, fieldKey){
  if(!anchorSubmission) return [];
  const ownerId = anchorSubmission.consultantAccountId || "";

  return getSubmissions()
    .filter(item =>
      item.project === anchorSubmission.project &&
      item.region === anchorSubmission.region &&
      item.businessUnit === anchorSubmission.businessUnit &&
      (!ownerId || !item.consultantAccountId || item.consultantAccountId === ownerId) &&
      normaliseDrawingFiles(item.formData?.[fieldKey]).length
    )
    .sort((a,b) => {
      const aMatch=String(a.revision||"").match(/(\d+)/);
      const bMatch=String(b.revision||"").match(/(\d+)/);
      const aRev=aMatch?Number(aMatch[1]):-1;
      const bRev=bMatch?Number(bMatch[1]):-1;
      if(aRev!==bRev) return aRev-bRev;
      return String(a.year||a.submittedAt||"").localeCompare(String(b.year||b.submittedAt||""));
    });
};

var managementDrawingRevisionLabelV147 = function managementDrawingRevisionLabelV147(item){
  const revision=item?.revision || "Revision";
  const year=typeof submissionYearLabel === "function" ? submissionYearLabel(item) : (item?.year || "");
  return [revision,year].filter(Boolean).join(" · ");
};

var renderManagementDrawingFolderFilesV147 = function renderManagementDrawingFolderFilesV147(submission, fieldKey){
  const files=normaliseDrawingFiles(submission?.formData?.[fieldKey]);
  const body=$("managementDrawingFolderModalBody");
  if(!body) return;

  if(!files.length){
    body.innerHTML=`
      <div class="drawing-folder-empty">
        <div class="drawing-folder-empty-icon">▰</div>
        <strong>No files uploaded</strong>
      </div>`;
    return;
  }

  body.innerHTML=`
    <section class="drawing-revision-group">
      <div class="drawing-revision-head">
        <strong>${escapeHtml(managementDrawingRevisionLabelV147(submission))}</strong>
        <span>${files.length} file${files.length===1?"":"s"}</span>
      </div>
      <div class="drawing-folder-file-list">
        ${files.map((file,index)=>`
          <div class="drawing-folder-file-row">
            <div class="drawing-folder-file-info">
              <span class="drawing-file-type">${escapeHtml(String(file.name||"FILE").split(".").pop().toUpperCase())}</span>
              <div>
                <strong>${escapeHtml(file.name||`File ${index+1}`)}</strong>
                <small>${escapeHtml(managementFormatFileSize(file.size||0))}</small>
              </div>
            </div>
            <div class="drawing-folder-file-actions">
              <button
                type="button"
                class="drawing-open-file-btn"
                data-management-open-submission-file="${escapeHtml(submission.id||"")}"
                data-management-open-file-field="${escapeHtml(fieldKey)}"
                data-management-open-file-index="${index}"
              >Open</button>
            </div>
          </div>`).join("")}
      </div>
    </section>`;
};

var renderManagementDrawingFolderModal = function renderManagementDrawingFolderModal(submissionId, fieldKey, fallbackLabel){
  const anchorSubmission=getSubmissions().find(item=>item.id===submissionId);
  if(!anchorSubmission) return false;

  const candidates=managementDrawingRevisionCandidatesV147(anchorSubmission,fieldKey);
  const title=managementDrawingFieldLabel(fieldKey,fallbackLabel);
  const modal=$("managementDrawingFolderModal");
  const selector=$("managementDrawingRevisionSelectV147");
  if(!modal || !selector) return false;

  modal.dataset.anchorSubmissionId=submissionId;
  modal.dataset.fieldKey=fieldKey;
  modal.dataset.fallbackLabel=fallbackLabel||"";

  let selectedId=modal.dataset.drawingSubmissionId || submissionId;
  if(!candidates.some(item=>item.id===selectedId)){
    selectedId=candidates.some(item=>item.id===submissionId) ? submissionId : (candidates[0]?.id || submissionId);
  }
  modal.dataset.drawingSubmissionId=selectedId;

  $("managementDrawingFolderModalTitle").textContent=title;
  $("managementDrawingFolderModalMeta").textContent=anchorSubmission.project || "Drawing Files";

  selector.innerHTML=candidates.length
    ? candidates.map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===selectedId?"selected":""}>${escapeHtml(managementDrawingRevisionLabelV147(item))}</option>`).join("")
    : `<option value="${escapeHtml(submissionId)}">${escapeHtml(managementDrawingRevisionLabelV147(anchorSubmission))}</option>`;
  selector.disabled=candidates.length<=1;

  const selectedSubmission=getSubmissions().find(item=>item.id===selectedId) || anchorSubmission;
  renderManagementDrawingFolderFilesV147(selectedSubmission,fieldKey);
  return true;
};

var openManagementDrawingFolderModal = function openManagementDrawingFolderModal(submissionId, fieldKey, fallbackLabel){
  const modal=$("managementDrawingFolderModal");
  if(modal){
    modal.dataset.drawingSubmissionId=submissionId;
  }
  if(!renderManagementDrawingFolderModal(submissionId,fieldKey,fallbackLabel)) return;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
};

/* drawing-only revision selector for Internal review. */











document.addEventListener("DOMContentLoaded",()=>{
  $("managementDrawingRevisionSelectV147")?.addEventListener("change",event=>{
    const modal=$("managementDrawingFolderModal");
    if(!modal) return;
    modal.dataset.drawingSubmissionId=event.target.value;
    renderManagementDrawingFolderModal(
      modal.dataset.anchorSubmissionId || event.target.value,
      modal.dataset.fieldKey || "",
      modal.dataset.fallbackLabel || ""
    );
  });
});
;

/* ---- js/management/submission-version-history.js ---- */


/* Read-only saved versions; opening a version never changes the active form. */
(function(){
  let activeId = "";
  let returnFocus = null;

  function accessibleRecord(){
    const record = getSubmissions().find(item => String(item.id) === String(activeId));
    if(!record) return null;
    if(state.auth?.role === "Management") return record;
    if(state.auth?.role !== "Consultant") return null;
    const account = currentConsultantAccountConfig();
    return account?.active && submissionBelongsToCurrentConsultant(record) &&
      consultantCanAccessProjectV139(record.region, record.businessUnit, record.project) ? record : null;
  }

  function versions(record){
    return [record, ...(Array.isArray(record.previousVersions) ? record.previousVersions.slice().reverse() : [])];
  }

  function dateLabel(value){
    const date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
  }

  function valueMarkup(value){
    if(value === null || value === undefined || value === "") return "—";
    if(Array.isArray(value)){
      if(!value.length) return "—";
      return `<ol class="version-history-list">${value.map(item => `<li>${valueMarkup(item)}</li>`).join("")}</ol>`;
    }
    if(typeof value === "object"){
      return `<dl class="version-history-values">${Object.entries(value).map(([key,item]) => `<div><dt>${escapeHtml(fieldLabel(key))}</dt><dd>${valueMarkup(item)}</dd></div>`).join("")}</dl>`;
    }
    return escapeHtml(value);
  }

  function fieldLabel(key){
    const labels = { loadingCapacityRows:"Loading / capacity details", poundageDetails:"Poundage calculations", steelWeight:"Steel weight (kg)", concreteVolume:"Concrete volume (m³)", exceedReason:"Remark", exceeded:"Guide exceeded", columnLoading:"Column loading (kN)", totalCapacity:"Total capacity (kN)", gridlineCarparkVertical:"Gridline — vertical", gridlineCarparkHorizontal:"Gridline — horizontal" };
    if(labels[key]) return labels[key];
    for(const section of OVERVIEW_SECTIONS){
      const rows = typeof managementSettingsRowsForSection === "function" ? managementSettingsRowsForSection(section) : section.rows;
      const row = rows.find(item => item.key === key);
      if(row) return row.label;
    }
    return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, text => text.toUpperCase());
  }

  function close(){
    document.getElementById("submissionVersionHistoryV31")?.remove();
    activeId = "";
    returnFocus?.focus();
  }

  function renderVersion(versionNumber){
    const record = accessibleRecord();
    const body = document.getElementById("submissionVersionBodyV31");
    if(!record || !body){ close(); return; }
    const allVersions = versions(record);
    const index = allVersions.findIndex((item,position) =>
      Number(item.versionNumber || (allVersions.length-position)) === Number(versionNumber));
    const version = allVersions[index];
    if(!version){ close(); return; }
    const selectedVersionNumber = version.versionNumber || (allVersions.length-index);
    const data = version.formData || {};
    const fields = Object.entries(data);
    const rows = fields.map(([key,value]) => {
      if(key === "drawingArchitectural" || key === "drawingStructural"){
        const files = normaliseDrawingFiles(value);
        return `<tr><th scope="row">${escapeHtml(fieldLabel(key))}</th><td>${files.length ? files.map((file,fileIndex) => `<button type="button" class="small-btn soft" data-version-file-field="${escapeHtml(key)}" data-version-file-index="${fileIndex}">${escapeHtml(file.name || "Open drawing")}</button>`).join(" ") : "—"}</td></tr>`;
      }
      if(value && typeof value === "object"){
        return `<tr><th scope="row">${escapeHtml(fieldLabel(key))}</th><td><details><summary>View saved details</summary>${valueMarkup(value)}</details></td></tr>`;
      }
      return `<tr><th scope="row">${escapeHtml(fieldLabel(key))}</th><td>${valueMarkup(value)}</td></tr>`;
    }).join("");
    body.innerHTML = `<p class="version-history-meta">${escapeHtml(version.revision || "—")} · ${escapeHtml(submissionYearLabel(version))} · Saved ${escapeHtml(dateLabel(version.updatedAt))}</p><table class="version-history-table"><thead><tr><th>Item</th><th>Saved value</th></tr></thead><tbody>${rows}</tbody></table>`;
    body.querySelectorAll("[data-version-file-field]").forEach(button => button.addEventListener("click", () => {
      const fresh = accessibleRecord();
      const freshVersions = fresh ? versions(fresh) : [];
      const selected = freshVersions.find((item,position) =>
        (item.versionNumber || (freshVersions.length-position)) === selectedVersionNumber);
      if(!selected){ close(); return; }
      const file = normaliseDrawingFiles(selected.formData?.[button.dataset.versionFileField])[Number(button.dataset.versionFileIndex)];
      if(file) openEcoStoredFile(file);
    }));
  }

  window.showSubmissionVersionHistoryV31 = function(id){
    document.getElementById("submissionVersionHistoryV31")?.remove();
    activeId = id;
    const record = accessibleRecord();
    if(!record) return;
    returnFocus = document.activeElement;
    const allVersions = versions(record);
    const modal = document.createElement("div");
    modal.id = "submissionVersionHistoryV31";
    modal.className = "version-history-backdrop";
    modal.innerHTML = `<section class="version-history-dialog" role="dialog" aria-modal="true" aria-labelledby="submissionVersionTitleV31"><header><div><h2 id="submissionVersionTitleV31">Version history</h2><p>${escapeHtml(record.project || "Project")} · ${escapeHtml(record.consultantAccountName || record.formData?.consultantName || "Consultant")}</p></div><button type="button" class="small-btn soft" id="closeSubmissionVersionsV31" aria-label="Close version history">Close</button></header><div class="version-history-picker"><label for="submissionVersionSelectV31">Saved version</label><select id="submissionVersionSelectV31">${allVersions.map((item,index) => `<option value="${escapeHtml(item.versionNumber || (allVersions.length-index))}">Version ${escapeHtml(item.versionNumber || (allVersions.length-index))}${index === 0 ? " — current" : " — previous"} · ${escapeHtml(dateLabel(item.updatedAt))}</option>`).join("")}</select><span>Read only · original submissions and drawings retained</span></div><div id="submissionVersionBodyV31" class="version-history-body"></div></section>`;
    document.body.appendChild(modal);
    modal.querySelector("#closeSubmissionVersionsV31").addEventListener("click", close);
    modal.querySelector("#submissionVersionSelectV31").addEventListener("change", event => renderVersion(Number(event.target.value)));
    modal.addEventListener("click", event => { if(event.target === modal) close(); });
    modal.addEventListener("keydown", event => {
      if(event.key === "Escape"){ event.preventDefault(); event.stopPropagation(); close(); }
      if(event.key === "Tab"){
        const controls = [...modal.querySelectorAll("button,select,summary")].filter(node => !node.disabled && node.getClientRects().length);
        const first = controls[0], last = controls[controls.length-1];
        if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
        else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
      }
    });
    renderVersion(record.versionNumber || allVersions.length);
    modal.querySelector("#closeSubmissionVersionsV31").focus();
  };
})();
;

/* ---- js/management/consultant-edit.js ---- */


/* One Edit workspace for consultant accounts, assignments and submissions. */
(function(){
  let savedDraft = "";
  let activeTab = "setup";
  let deleteArmed = "";

  const el = id => document.getElementById(id);
  const isManagement = () => state.auth?.role === "Management";
  const account = () => consultantAccessDraftV139?.accounts?.[consultantAccessActiveIdV139] || null;
  const dirty = () => !!consultantAccessDraftV139 && JSON.stringify(consultantAccessDraftV139) !== savedDraft;
  const projectKey = () => managementSettingsSelectedRegion && managementSettingsSelectedBusinessUnit && managementSettingsSelectedProject
    ? consultantProjectAccessKeyV139(managementSettingsSelectedRegion, managementSettingsSelectedBusinessUnit, managementSettingsSelectedProject)
    : "";

  function status(message){
    el("editSaveStatusV31").textContent = message || (dirty() ? "Unsaved consultant access changes" : "Consultant access is up to date.");
    el("editSaveStatusV31").classList.toggle("is-unsaved", dirty());
    el("editSaveAccessV31").disabled = !dirty();
  }

  function syncAccount(){
    const item = account();
    if(!item) return;
    item.name = el("editConsultantNameV31").value.trim();
    item.email = el("editConsultantEmailV31").value.trim().toLowerCase();
    item.password = el("editConsultantPasswordV31").value;
    item.active = el("editConsultantActiveV31").checked;
  }

  function renderSelector(){
    const items = consultantAccountsInOrderV144(consultantAccessDraftV139);
    const select = el("editConsultantSelectV31");
    select.innerHTML = items.length
      ? items.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || "Unnamed consultant")}${item.active ? "" : " (inactive)"}</option>`).join("")
      : '<option value="">No consultants — add one to get started</option>';
    select.disabled = !items.length;
    select.value = consultantAccessActiveIdV139;
    const item = account();
    el("editAccountStateV31").textContent = item ? (item.active ? "Active account" : "Inactive account") : "";
    el("editAccountStateV31").classList.toggle("is-inactive", !!item && !item.active);
  }

  function renderAccount(){
    const item = account();
    [["editConsultantNameV31", "name"], ["editConsultantEmailV31", "email"], ["editConsultantPasswordV31", "password"]].forEach(([id, key]) => {
      el(id).value = item?.[key] || "";
      el(id).disabled = !item;
    });
    el("editConsultantActiveV31").checked = !!item?.active;
    el("editConsultantActiveV31").disabled = !item;
    el("editDeleteConsultantV31").disabled = !item;
    el("editShowPasswordV31").disabled = !item;
    el("editConsultantPasswordV31").type = "password";
    el("editShowPasswordV31").textContent = "Show";
    el("editShowPasswordV31").setAttribute("aria-pressed", "false");
    el("editDeleteConsultantV31").textContent = "Delete consultant";
    el("editDeleteConsultantV31").classList.remove("is-armed");
    deleteArmed = "";
    el("editAccessErrorV31").textContent = "";
    renderSelector();
    renderAssignments();
    renderPast();
    status();
  }

  function renderAssignments(){
    const item = account();
    const key = projectKey();
    const assigned = !!item?.projectKeys?.includes(key);
    el("editAssignProjectV31").checked = !!key && assigned;
    el("editAssignProjectV31").disabled = !item || !key;
    el("editAssignProjectLabelV31").textContent = `Assign this project to ${item?.name || "this consultant"}`;
    // Keep the assignment area clean: no instructional/helper description text.
    el("editAssignmentHintV31").textContent = "";
    const keys = item?.projectKeys || [];
    el("editAssignedCountV31").textContent = `Assigned projects (${keys.length})`;
    el("editAssignAllV31").disabled = !item;
    el("editClearAssignmentsV31").disabled = !keys.length;
    const available = new Map(allPortalProjectEntriesV139().map(entry => [entry.key, entry]));
    el("editAssignedListV31").innerHTML = `<div class="edit-list-table-v38 edit-assigned-table-v38">
      <div class="edit-list-head-v38"><span>Assigned Project</span></div>
      ${keys.length ? keys.map(key => {
        const entry = available.get(key);
        const parts = key.split("|||");
        const region = entry?.region || parts[0] || "";
        const businessUnit = entry?.businessUnit || parts[1] || "";
        const project = entry?.project || parts[2] || key;
        return `<div class="edit-list-row-v38 edit-assigned-row-v38">
          <div class="edit-list-main-v38 edit-static-project-v46">
            <strong>${escapeHtml(project)}</strong>
            <small>${escapeHtml(region)} · ${escapeHtml(businessUnit)}${entry ? "" : " · Removed from project list"}</small>
          </div>
          <button type="button" class="edit-remove-assignment-v31 edit-list-action-v38" data-edit-remove-project-v31="${escapeHtml(key)}" aria-label="Remove ${escapeHtml(project)} assignment" title="Remove assignment">×</button>
        </div>`;
      }).join("") : '<div class="edit-empty-v31 edit-empty-row-v39">No assigned project</div>'}
    </div>`;
  }

  function selectedSubmissions(){
    if(!account()) return [];
    // Past Submission is account-level history. It must remain independent
    // from the Region / Business Unit / Project selection used below.
    return getSubmissions().filter(item =>
      submissionOwnerAccountIdV139(item) === consultantAccessActiveIdV139
    ).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  function renderPast(){
    const items = selectedSubmissions();
    el("editPastCountV31").textContent = String(items.length);
    const savedAccount = getConsultantAccessSettings().accounts?.[consultantAccessActiveIdV139];
    el("editHistoryNoticeV31").textContent = !account() ? "Choose a consultant to see their submissions."
      : `Showing ${account().name || "this consultant"}'s submissions across all projects.`;
    el("editPastListV31").innerHTML = `<div class="edit-list-table-v38 edit-past-table-v38"><div class="edit-list-head-v38"><span>Past Submission</span></div>${items.length ? items.map(item => {
      const open = item.editAccess?.allowed === true;
      const key = consultantProjectAccessKeyV139(item.region, item.businessUnit, item.project);
      const canOpen = !!savedAccount?.active && savedAccount.projectKeys.includes(key);
      const date = item.updatedAt ? new Date(item.updatedAt) : null;
      const dateText = date && !Number.isNaN(date.getTime()) ? date.toLocaleString([], {dateStyle:"medium", timeStyle:"short"}) : "Date unavailable";
      return `<article class="edit-submission-row-v31 edit-submission-row-v38">
        <div class="edit-submission-main-v31 edit-list-main-v38">
          <strong>${escapeHtml(item.project || "Unnamed project")}</strong>
          <div class="edit-submission-meta-inline-v43">
            <small>${escapeHtml(item.region || "—")} · ${escapeHtml(item.businessUnit || "—")}</small>
            <span>${escapeHtml(item.revision || "—")}</span>
            <span>${escapeHtml(typeof submissionYearLabel === "function" ? submissionYearLabel(item) : item.year || "—")}</span>
          </div>
        </div>
        <div class="edit-submission-actions-v31 edit-submission-actions-v38">
          <button class="edit-permission-action-v43 ${open ? "is-open" : "is-locked"}" type="button" data-edit-permission-v31="${escapeHtml(item.id)}" data-allow="${open ? "false" : "true"}" ${!open && !canOpen ? "disabled" : ""}>
            <span class="edit-permission-dot-v43" aria-hidden="true"></span>
            <span>${open ? "Lock editing" : "Allow editing"}</span>
          </button>
          <button
            class="edit-delete-submission-v147"
            type="button"
            data-edit-delete-submission-v147="${escapeHtml(item.id)}"
            aria-label="Delete ${escapeHtml(item.project || "this")} submission"
          >Delete</button>
        </div>
      </article>`;
    }).join("") : `<div class="edit-empty-v31 edit-empty-row-v39">${account() ? "No past submission" : "No consultant selected"}</div>`}</div>`;
  }

  function setTab(tab, focus=false){
    activeTab = tab;
    document.querySelectorAll("[data-edit-tab-v31]").forEach(button => {
      const selected = button.dataset.editTabV31 === tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      if(selected && focus) button.focus();
    });
    if(el("editSetupPanelV31")) el("editSetupPanelV31").classList.remove("hidden");
    if(el("editPastPanelV31")) el("editPastPanelV31").classList.remove("hidden");
    renderPast();
  }

  async function saveAccess(){
    if(!isManagement() || !consultantAccessDraftV139) return false;
    syncAccount();
    const validation = validateConsultantAccessDraftV144();
    if(!validation.ok){
      consultantAccessActiveIdV139 = validation.id || consultantAccessActiveIdV139;
      renderAccount();
      el("editAccountDetailsV31").open = true;
      el("editAccessErrorV31").textContent = validation.message;
      el("editAccessErrorV31").scrollIntoView({block:"nearest"});
      return false;
    }
    try{
      await saveConsultantAccessSettings(consultantAccessDraftV139);
      consultantAccessDraftV139 = cloneConsultantAccessV139(getConsultantAccessSettings());
      savedDraft = JSON.stringify(consultantAccessDraftV139);
      renderAccount();
      el("editClosePromptV31").classList.add("hidden");
      status("Consultant details and project assignments saved.");
      return true;
    }catch(error){
      el("editAccessErrorV31").textContent = error?.message || "Could not save consultant access.";
      return false;
    }
  }

  window.beginManagementEditV31 = function(){
    if(!isManagement()) return;
    if(!dirty()){
      consultantAccessDraftV139 = cloneConsultantAccessV139(getConsultantAccessSettings());
      savedDraft = JSON.stringify(consultantAccessDraftV139);
    }
    if(!account()) consultantAccessActiveIdV139 = consultantAccessDraftV139.accountOrder[0] || "";
    el("editClosePromptV31").classList.add("hidden");
    renderAccount();
    setTab(activeTab);
  };

  window.managementEditMayCloseV31 = function(){
    if(!dirty()) return true;
    el("editClosePromptV31").classList.remove("hidden");
    el("editKeepEditingV31").focus();
    return false;
  };

  const renderHierarchy = renderManagementSettingsHierarchy;
  renderManagementSettingsHierarchy = function(){
    const result = renderHierarchy.apply(this, arguments);
    if(consultantAccessDraftV139 && el("editAssignProjectV31")){
      renderAssignments();
      renderPast();
    }
    return result;
  };

  document.addEventListener("DOMContentLoaded", () => {
    el("editConsultantSelectV31").addEventListener("change", event => {
      if(!isManagement()) return;
      syncAccount();
      consultantAccessActiveIdV139 = event.target.value;
      renderAccount();
    });

    ["editConsultantNameV31", "editConsultantEmailV31", "editConsultantPasswordV31", "editConsultantActiveV31"].forEach(id => {
      el(id).addEventListener(id === "editConsultantActiveV31" ? "change" : "input", () => {
        if(!isManagement()) return;
        syncAccount();
        renderSelector();
        renderAssignments();
        status();
        el("editAccessErrorV31").textContent = "";
      });
    });

    el("editAddConsultantV31").addEventListener("click", () => {
      if(!isManagement() || !consultantAccessDraftV139) return;
      syncAccount();
      const id = newConsultantAccountIdV144();
      consultantAccessDraftV139.accounts[id] = {id, name:"New Consultant", email:"", password:"", active:true, builtin:false, projectKeys:[]};
      consultantAccessDraftV139.accountOrder.push(id);
      consultantAccessActiveIdV139 = id;
      renderAccount();
      el("editAccountDetailsV31").open = true;
      el("editConsultantNameV31").focus();
      el("editConsultantNameV31").select();
    });

    el("editDeleteConsultantV31").addEventListener("click", () => {
      if(!isManagement() || !account()) return;
      if(deleteArmed !== account().id){
        deleteArmed = account().id;
        el("editDeleteConsultantV31").textContent = "Confirm delete consultant";
        el("editDeleteConsultantV31").classList.add("is-armed");
        return;
      }
      delete consultantAccessDraftV139.accounts[deleteArmed];
      consultantAccessDraftV139.accountOrder = consultantAccessDraftV139.accountOrder.filter(id => id !== deleteArmed);
      consultantAccessActiveIdV139 = consultantAccessDraftV139.accountOrder[0] || "";
      renderAccount();
    });

    el("editShowPasswordV31").addEventListener("click", () => {
      const show = el("editConsultantPasswordV31").type === "password";
      el("editConsultantPasswordV31").type = show ? "text" : "password";
      el("editShowPasswordV31").textContent = show ? "Hide" : "Show";
      el("editShowPasswordV31").setAttribute("aria-pressed", String(show));
    });

    el("editAssignProjectV31").addEventListener("change", event => {
      if(!isManagement() || !account() || !projectKey()) return;
      const keys = new Set(account().projectKeys);
      if(event.target.checked) keys.add(projectKey()); else keys.delete(projectKey());
      account().projectKeys = [...keys];
      renderAssignments();
      status();
    });

    el("editAssignAllV31").addEventListener("click", () => {
      if(!isManagement() || !account()) return;
      account().projectKeys = allPortalProjectEntriesV139().map(item => item.key);
      renderAssignments();
      status();
    });
    el("editClearAssignmentsV31").addEventListener("click", () => {
      if(!isManagement() || !account()) return;
      account().projectKeys = [];
      renderAssignments();
      status();
    });
    el("editAssignedListV31").addEventListener("click", event => {
      if(!isManagement() || !account()) return;
      const remove = event.target.closest("[data-edit-remove-project-v31]");
      if(remove){
        account().projectKeys = account().projectKeys.filter(key => key !== remove.dataset.editRemoveProjectV31);
        renderAssignments();
        status();
        return;
      }
    });

    document.querySelectorAll("[data-edit-tab-v31]").forEach(button => {
      button.addEventListener("click", () => setTab(button.dataset.editTabV31));
      button.addEventListener("keydown", event => {
        if(!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        setTab(event.key === "Home" ? "setup" : event.key === "End" ? "past" : activeTab === "setup" ? "past" : "setup", true);
      });
    });

    el("editPastListV31").addEventListener("click", async event => {
      if(!isManagement()) return;
      const deleteButton = event.target.closest("[data-edit-delete-submission-v147]");
      if(deleteButton){
        const submission = getSubmissions().find(
          item => item.id === deleteButton.dataset.editDeleteSubmissionV147
        );
        if(!submission) return;

        showDeleteSubmissionConfirmV141(submission, () => {
          renderPast();
          el("editHistoryNoticeV31").textContent = "Submission deleted permanently.";
        });
        return;
      }

      const versions = event.target.closest("[data-edit-versions-v31]");
      if(versions){
        window.showSubmissionVersionHistoryV31(versions.dataset.editVersionsV31);
        return;
      }
      const button = event.target.closest("[data-edit-permission-v31]");
      if(!button || button.disabled) return;
      try{
        const allow = button.dataset.allow === "true";
        await window.managementSetSubmissionEditingV31(button.dataset.editPermissionV31, allow);
        renderPast();
        el("editHistoryNoticeV31").textContent = allow ? "Editing allowed for this submission. The consultant can reopen it from History and resubmit." : "Submission locked. The consultant can view it but cannot change it.";
      }catch(error){
        el("editHistoryNoticeV31").textContent = error?.message || "Could not change editing permission. Please try again.";
      }
    });

    el("editSaveAccessV31").addEventListener("click", saveAccess);
    el("editSaveCloseV31").addEventListener("click", async () => {
      if(await saveAccess()) window.closeManagementSubmissionSetupModalV121();
    });
    el("editDiscardCloseV31").addEventListener("click", () => {
      consultantAccessDraftV139 = null;
      savedDraft = "";
      el("editClosePromptV31").classList.add("hidden");
      window.closeManagementSubmissionSetupModalV121();
    });
    el("editKeepEditingV31").addEventListener("click", () => {
      el("editClosePromptV31").classList.add("hidden");
      el("editSaveAccessV31").focus();
    });

    window.addEventListener("storage", event => {
      if(event.key === ECO_FRESH_STORAGE.submissions && !el("managementSettingsModal").classList.contains("hidden")) renderPast();
    });
  });
})();
;
