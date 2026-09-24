/* EcoWorld shared data. Load before consultant.js and management.js. */

/* ==============================
   Shared data
   ============================== */

/* ---- js/data.js ---- */



const ECO_FRESH_STORAGE = {
  auth: "eco_fresh_v2_auth",
  sidebar: "eco_fresh_v2_sidebar_collapsed",
  submissions: "eco_fresh_v2_consultant_submissions",
  proposals: "eco_fresh_v2_consultant_proposals",
  tableSettings: "eco_fresh_management_table_settings_v2",
  portalHierarchy: "eco_fresh_management_portal_hierarchy_v1",
  dropdownOptions: "eco_fresh_management_dropdown_options_v1",
  pileReference: "eco_fresh_management_pile_reference_v1",
  pileOptimisation: "eco_fresh_management_pile_optimisation_v1",
  consultantAccess: "eco_fresh_management_consultant_access_v1"
};

/* Accepted pile-efficiency range for display and Management auto-optimisation. */
const PILE_EFFICIENCY_TARGET_MIN = 0.80;
const PILE_EFFICIENCY_TARGET_MAX = 0.90;

/* No seeded consultant demo accounts. Consultants are created from the
   Management page's Consultant Access editor instead. */
const CONSULTANT_ACCOUNT_DEFINITIONS = [];

const DEMO_ACCOUNTS = {
  management: {
    id: "management",
    name: "Internal",
    email: "management@ecoworld.com",
    role: "Management"
  }
};

const REGION_BUSINESS_UNITS = {
  "North": ["Eco Horizon", "Eco Terraces", "Eco Sun"],
  "Central North": ["Eco Grandeur", "Eco Ardence", "Eco Sanctuary"],
  "Central South": ["Eco Radiance", "Eco Majestic", "Eco Forest"],
  "Wilayah (BBCC)": ["BBCC One", "BBCC Two"],
  "Quantum": ["Quantum One"],
  "Negeri Sembilan": ["Eco NS One"],
  "South": ["Eco Spring", "Eco Tropics", "Eco Botanic"]
};

const BUSINESS_UNIT_PROJECTS = {
  "Eco Grandeur": ["Regent Garden", "Norton Garden"],
  "Eco Ardence": ["Arden Park", "Ember Court"],
  "Eco Sanctuary": ["Sanctuary Heights"],
  "Eco Horizon": ["Horizon Residences"],
  "Eco Terraces": ["Terrace Grove"],
  "Eco Sun": ["Sun Vista"],
  "Eco Radiance": ["Radiance Ville"],
  "Eco Majestic": ["Majestic Crest"],
  "Eco Forest": ["Forest Square"],
  "Eco Spring": ["Spring Meadow"],
  "Eco Tropics": ["Tropics Bay"],
  "Eco Botanic": ["Botanic East"],
  "BBCC One": ["BBCC Alpha"],
  "BBCC Two": ["BBCC Beta"],
  "Quantum One": ["Quantum Park"],
  "Eco NS One": ["NS Green"]
};

const MANAGEMENT_PILE_CAPACITY_REFERENCE = [
  { pileType: "RC Piles",    pileSize: "150",  pileCapacity: 250,   averagePrice: 810  },
  { pileType: "RC Piles",    pileSize: "200",  pileCapacity: 450,   averagePrice: 1265 },

  { pileType: "Spun Piles",  pileSize: "400",  pileCapacity: 1450,  averagePrice: "" },
  { pileType: "Spun Piles",  pileSize: "500",  pileCapacity: 2100,  averagePrice: "" },
  { pileType: "Spun Piles",  pileSize: "600",  pileCapacity: 2850,  averagePrice: "" },

  { pileType: "Bored Piles", pileSize: "600",  pileCapacity: 2400,  averagePrice: "" },
  { pileType: "Bored Piles", pileSize: "750",  pileCapacity: 3800,  averagePrice: "" },
  { pileType: "Bored Piles", pileSize: "900",  pileCapacity: 5500,  averagePrice: "" },
  { pileType: "Bored Piles", pileSize: "1000", pileCapacity: 6800,  averagePrice: "" },
  { pileType: "Bored Piles", pileSize: "1200", pileCapacity: 9800,  averagePrice: "" },
  { pileType: "Bored Piles", pileSize: "1350", pileCapacity: 12500, averagePrice: "" },
  { pileType: "Bored Piles", pileSize: "1500", pileCapacity: 15400, averagePrice: "" },
  { pileType: "Bored Piles", pileSize: "1800", pileCapacity: 22000, averagePrice: "" },
  { pileType: "Bored Piles", pileSize: "2000", pileCapacity: 27400, averagePrice: "" },
  { pileType: "Bored Piles", pileSize: "2200", pileCapacity: 33200, averagePrice: "" }
];

const OVERVIEW_SECTIONS = [
  {
    title: "Project Information",
    rows: [
      {
        key: "projectName",
        label: "Project Name",
        type: "text",
        placeholder: "Project name"
      },
      {
        key: "consultantName",
        label: "Consultant",
        type: "text",
        placeholder: "Enter consultant name"
      },
      {
        key: "buildingType",
        label: "Type of Building",
        type: "select",
        options: ["High Rise", "Landed"]
      },
      {
        key: "highRiseType",
        label: "High Rise Type",
        type: "select",
        options: ["Residential – Duduk", "Residential – Walk Up", "Commercial", "Mixed Development"],
        showWhen: data => data.buildingType === "High Rise"
      },
      {
        key: "highRiseCategory",
        label: "High Rise Category",
        type: "select",
        options: ["Long Block", "1 or 2 Block", "L-Shape", "Split Block"],
        showWhen: data => data.buildingType === "High Rise"
      },
      {
        key: "transferFloor",
        label: "With / No Transfer Floor",
        type: "select",
        options: [
          "Separate Carpark Block (No Transfer Floor)",
          "Resi Tower on Podium Carpark (With Transfer Floor)"
        ],
        showWhen: data => data.buildingType === "High Rise"
      },
      {
        key: "storeyCount",
        label: "Total No of Storey",
        type: "number",
        placeholder: "Enter total storey"
      },
      {
        key: "unitCount",
        label: "Number of Units",
        type: "number",
        placeholder: "Enter total units"
      },
      {
        key: "gridlineCarpark",
        label: "Gridline Dimension (Carpark Floor)",
        type: "gridlinePair"
      }
    ]
  },
  {
    title: "Building Efficiency",
    rows: [
      {
        key: "resiTowerBuildingEfficiency",
        label: "Resi Tower Typical Floor Building Efficiency, %",
        type: "number",
        step: "0.1",
        placeholder: "Enter efficiency"
      },
      {
        key: "carparkFloorEfficiency",
        label: "Carpark Floor Efficiency, sf/bay",
        type: "number",
        step: "0.01",
        placeholder: "Enter sf/bay"
      },
      {
        key: "overallBuildingEfficiency",
        label: "Overall Efficiency, %",
        type: "number",
        step: "0.1",
        placeholder: "Enter efficiency"
      }
    ]
  },
  {
    title: "Pilling Info",
    rows: [
      {
        key: "pileType",
        label: "Type of Piles",
        type: "select",
        options: ["Bored Piles", "Spun Piles", "RC Piles"]
      },
      {
        key: "pileSize",
        label: "Piles Sizes, mm",
        type: "number",
        placeholder: "Enter pile size"
      },
      {
        key: "numberOfPiles",
        label: "Total Number of Piles",
        type: "number",
        placeholder: "Enter total piles"
      },
      {
        key: "pilingCost",
        label: "Pilling Cost per GFA, RM/sf (if available)",
        type: "number",
        step: "0.01",
        placeholder: "Enter cost"
      }
    ]
  },
  {
    title: "Pile Efficiency & Loading",
    rows: [
      {
        key: "totalArea",
        label: "Total GFA or CFA (including roof or open deck), sf",
        type: "number",
        step: "0.01",
        placeholder: "Enter area"
      },
      {
        key: "totalColumnLoading",
        label: "Total Column Loading, kN",
        type: "loadingSummary"
      },
      {
        key: "totalPilesCapacity",
        label: "Total Piles Capacity, kN",
        type: "loadingSummary"
      },
      {
        key: "overallEfficiency",
        label: "Overall Average Piles Efficiency, %",
        type: "loadingSummary"
      }
    ]
  },
  {
    title: "Poundage",
    rows: [
      { key: "poundageRcColumn", label: "RC Column (kg/m³)", type: "number", step: "0.01", placeholder: "Enter value" },
      { key: "poundageRcBeamCarpark", label: "RC Beam – Carpark (kg/m³)", type: "number", step: "0.01", placeholder: "Enter value" },
      {
        key: "poundageRcBeamTypical",
        label: "RC Beam – Typ Unit Floor (kg/m³)",
        type: "number",
        step: "0.01",
        placeholder: "Enter value",
        showWhen: data => data.buildingType === "High Rise"
      },
      { key: "poundageRcSlab", label: "RC Slab (kg/m³)", type: "number", step: "0.01", placeholder: "Enter value" },
      {
        key: "poundageShearWall",
        label: "Shear Wall (kg/m³)",
        type: "number",
        step: "0.01",
        placeholder: "Enter value",
        showWhen: data => data.buildingType === "High Rise"
      },
      { key: "poundageOverall", label: "Overall Poundage (kg/m³)", type: "number", step: "0.01", placeholder: "Enter value" },
      {
        key: "poundageSteelContent",
        label: "Total Steel Content per Unit (Landed), kg",
        type: "number",
        step: "0.01",
        placeholder: "Enter value",
        showWhen: data => data.buildingType === "Landed"
      }
    ]
  },
  {
    title: "Drawings",
    rows: [
      {
        key: "drawingArchitectural",
        label: "Architectural Base Plan / Section / Elevation",
        type: "file",
        accept: ".pdf,.png,.jpg,.jpeg,.webp"
      },
      {
        key: "drawingStructural",
        label: "Structural Floor Plan / Piling Plan / Loading Demarcation Plan",
        type: "file",
        accept: ".pdf,.png,.jpg,.jpeg,.webp"
      }
    ]
  }
];
;
