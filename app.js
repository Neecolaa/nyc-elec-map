const categoryLabels = {
  ll84_scored: "Scored building",
  ll84_benchmarked_no_score: "Benchmarked, no score",
};

const gradeBasisLabels = {
  historical_ll84_last_scored: "Last scored year",
  latest_ll84_score: "Latest score",
  no_grade_available: "No grade available",
};

const gradeColors = {
  A: "#1d8f5a",
  B: "#78b841",
  C: "#f2bf3a",
  D: "#ef7d32",
  F: "#c53d2f",
  "": "#98a2b3",
};

const state = {
  allRows: [],
  choroplethFeatures: [],
  visibleRows: [],
  visibleChoroplethFeatures: [],
  compareItems: [],
};

const COMPARE_STORAGE_KEY = "nyc-energy-map-compare-v1";
const LEGACY_COMPARE_STORAGE_KEY = "nyc-energy-map-favorites-v1";

const map = L.map("map", {
  zoomControl: false,
  preferCanvas: true,
}).setView([40.7128, -74.006], 11);

map.createPane("choroplethPane");
map.getPane("choroplethPane").style.zIndex = 450;
map.getPane("choroplethPane").style.pointerEvents = "none";

L.control
  .zoom({
    position: "topright",
  })
  .addTo(map);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 19,
}).addTo(map);

const layerGroup = L.layerGroup().addTo(map);
const choroplethLayer = L.geoJSON(null, {
  pane: "choroplethPane",
  style: () => ({
    weight: 0.35,
    color: "rgba(51, 65, 85, 0.28)",
    fillOpacity: 0.72,
  }),
});
const markerRenderer = L.canvas({ padding: 0.5 });

const searchInput = document.getElementById("search-input");
const viewMode = document.getElementById("view-mode");
const boroughFilter = document.getElementById("borough-filter");
const propertyTypeFilter = document.getElementById("property-type-filter");
const scoreFilterLabel = document.getElementById("score-filter-label");
const scoreFilterValue = document.getElementById("score-filter-value");
const scoreFilterComparison = document.getElementById("score-filter-comparison");
const clearFiltersButton = document.getElementById("clear-filters-button");
const categoryCheckboxes = Array.from(document.querySelectorAll('.toggle-group input[type="checkbox"]'));
const detailsContent = document.getElementById("details-content");
const compareContent = document.getElementById("compare-content");
const gradeLegend = document.getElementById("grade-legend");
const gradeLegendNote = document.getElementById("grade-legend-note");
const ghgLegend = document.getElementById("ghg-legend");
const ghgLegendNote = document.getElementById("ghg-legend-note");

const scoreFilterConfig = {
  points: {
    label: "Grade filter",
    allLabel: "All grades",
    options: [
      { value: "A", label: "A", rank: 5 },
      { value: "B", label: "B", rank: 4 },
      { value: "C", label: "C", rank: 3 },
      { value: "D", label: "D", rank: 2 },
      { value: "F", label: "F", rank: 1 },
    ],
  },
  ghg: {
    label: "Emissions filter",
    allLabel: "All emissions bands",
    options: [
      { value: "ghg_1", label: "Under 150 tCO2e", rank: 1 },
      { value: "ghg_2", label: "150-399.9 tCO2e", rank: 2 },
      { value: "ghg_3", label: "400-1,199.9 tCO2e", rank: 3 },
      { value: "ghg_4", label: "1,200+ tCO2e", rank: 4 },
    ],
  },
};

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatPostedCycle(year) {
  if (!year) {
    return "Not available";
  }
  return String(year + 1);
}

function normalizeSearchText(value) {
  if (!value) {
    return "";
  }

  const replacements = [
    [/\bfirst\b/g, "1"],
    [/\bsecond\b/g, "2"],
    [/\bthird\b/g, "3"],
    [/\bfourth\b/g, "4"],
    [/\bfifth\b/g, "5"],
    [/\bsixth\b/g, "6"],
    [/\bseventh\b/g, "7"],
    [/\beighth\b/g, "8"],
    [/\bninth\b/g, "9"],
    [/\btenth\b/g, "10"],
    [/\beleventh\b/g, "11"],
    [/\btwelfth\b/g, "12"],
    [/\bwest\b/g, "w"],
    [/\beast\b/g, "e"],
    [/\bnorth\b/g, "n"],
    [/\bsouth\b/g, "s"],
    [/\bavenue\b/g, "ave"],
    [/\bav\b/g, "ave"],
    [/\bstreet\b/g, "st"],
    [/\broad\b/g, "rd"],
    [/\bboulevard\b/g, "blvd"],
    [/\bplace\b/g, "pl"],
    [/\blane\b/g, "ln"],
    [/\bdrive\b/g, "dr"],
    [/\bcourt\b/g, "ct"],
    [/\bparkway\b/g, "pkwy"],
    [/\bhighway\b/g, "hwy"],
    [/\bterrace\b/g, "ter"],
  ];

  let normalized = value.toLowerCase();
  normalized = normalized.replace(/[.,#/]+/g, " ");
  normalized = normalized.replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1");

  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized.replace(/\bw\.\b/g, "w");
  normalized = normalized.replace(/\be\.\b/g, "e");
  normalized = normalized.replace(/\bn\.\b/g, "n");
  normalized = normalized.replace(/\bs\.\b/g, "s");

  return normalized.replace(/\s+/g, " ").trim();
}

function getMarkerStyle(row) {
  const fillColor = gradeColors[row.displayGrade || ""];
  return {
    radius: 5,
    fillColor,
    color: darkenHex(fillColor, 0.32),
    weight: 1.1,
    opacity: 1,
    fillOpacity: 0.82,
    renderer: markerRenderer,
  };
}

function darkenHex(hex, amount) {
  const safeHex = (hex || "#98a2b3").replace("#", "");
  const normalized = safeHex.length === 3
    ? safeHex.split("").map((char) => char + char).join("")
    : safeHex;
  const channels = normalized.match(/.{2}/g) || ["98", "a2", "b3"];
  const darkened = channels.map((channel) => {
    const value = parseInt(channel, 16);
    const next = Math.max(0, Math.min(255, Math.round(value * (1 - amount))));
    return next.toString(16).padStart(2, "0");
  });
  return `#${darkened.join("")}`;
}

function getChoroplethColor(value) {
  if (value === null || value === undefined) {
    return "#cbd5e1";
  }
  if (value < 150) {
    return "#fef3c7";
  }
  if (value < 400) {
    return "#fbbf24";
  }
  if (value < 1200) {
    return "#f97316";
  }
  return "#b91c1c";
}

function populateSelect(select, values, placeholder) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value || placeholder;
    select.appendChild(option);
  }
}

function populateScoreFilterOptions(mode) {
  const config = scoreFilterConfig[mode];
  const previousValue = scoreFilterValue.value;

  scoreFilterLabel.textContent = config.label;
  scoreFilterValue.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = config.allLabel;
  scoreFilterValue.appendChild(allOption);

  for (const optionConfig of config.options) {
    const option = document.createElement("option");
    option.value = optionConfig.value;
    option.textContent = optionConfig.label;
    scoreFilterValue.appendChild(option);
  }

  const hasPrevious = config.options.some((option) => option.value === previousValue);
  scoreFilterValue.value = hasPrevious ? previousValue : "all";
}

function getGhgBand(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (value < 150) {
    return "ghg_1";
  }
  if (value < 400) {
    return "ghg_2";
  }
  if (value < 1200) {
    return "ghg_3";
  }
  return "ghg_4";
}

function getScoreRank(mode, value) {
  const config = scoreFilterConfig[mode];
  return config.options.find((option) => option.value === value)?.rank ?? null;
}

function getRowScoreValue(row, mode) {
  if (mode === "ghg") {
    return getGhgBand(row.ll84TotalGhgEmissions ?? row.ghg ?? null);
  }
  return row.displayGrade || "";
}

function matchesScoreFilter(row, filters) {
  if (filters.scoreValue === "all") {
    return true;
  }

  const rowScoreValue = getRowScoreValue(row, filters.mode);
  const rowRank = getScoreRank(filters.mode, rowScoreValue);
  const filterRank = getScoreRank(filters.mode, filters.scoreValue);

  if (rowRank === null || filterRank === null) {
    return false;
  }

  if (filters.scoreComparison === "or_higher") {
    return rowRank >= filterRank;
  }
  if (filters.scoreComparison === "or_lower") {
    return rowRank <= filterRank;
  }
  return rowRank === filterRank;
}

function clearFilters() {
  searchInput.value = "";
  boroughFilter.value = "all";
  propertyTypeFilter.value = "all";
  scoreFilterValue.value = "all";
  scoreFilterComparison.value = "exactly";
  categoryCheckboxes.forEach((input) => {
    input.checked = true;
  });
}

function makePopupHtml(row) {
  const grade = row.displayGrade || "Not available";
  const ghgValue =
    row.ll84TotalGhgEmissions ?? row.ghg ?? row.ll84_total_ghg_emissions_mtco2e ?? null;
  const ghg = ghgValue !== null && ghgValue !== undefined
    ? `${formatNumber(ghgValue, { maximumFractionDigits: 1 })} tCO2e`
    : "Not available";
  const isCompared = isComparedByBbl(row.bbl);

  return `
    <div>
      <p class="popup-title">${row.address || row.propertyName || "Unknown address"}</p>
      <p class="popup-subtitle">${row.borough || "Unknown borough"} · ${categoryLabels[row.mapCategory]}</p>
      <p class="popup-subtitle">Grade: ${grade}</p>
      <p class="popup-subtitle">Yearly emissions: ${ghg}</p>
      <button class="popup-compare-button ${isCompared ? "is-compared" : ""}" data-bbl="${row.bbl}">
        ${isCompared ? "Remove from Comparison" : "Include in Comparison"}
      </button>
    </div>
  `;
}

function normalizeFeature(feature) {
  const props = feature.properties;
  return {
    bbl: props.bbl,
    address: props.address,
    searchAliases: parseSearchAliases(props.address_aliases),
    borough: props.borough,
    mapCategory: props.map_category,
    displayGrade: props.display_grade,
    propertyName: props.ll84_property_name,
    propertyType: props.ll84_property_type,
    largestUseType: props.ll84_largest_property_use_type,
    displayGradeBasis: props.display_grade_basis,
    derivedGrade: props.derived_grade_from_ll84_score,
    lastScoredYear: props.ll84_last_scored_year ? Number(props.ll84_last_scored_year) : null,
    lastScoredEnergyStarScore: props.ll84_last_scored_energy_star_score,
    lastScoredDerivedGrade: props.ll84_last_scored_derived_grade,
    ll84Year: props.ll84_calendar_year ? Number(props.ll84_calendar_year) : null,
    ll84EnergyStarScore: props.ll84_energy_star_score,
    ll84SiteEui: props.ll84_site_eui_kbtu_ft2,
    ll84WeatherNormalizedSiteEui: props.ll84_weather_normalized_site_eui_kbtu_ft2,
    ll84EstimatedYearlyEnergyKwh: props.ll84_estimated_yearly_energy_kwh,
    ll84ElectricityKwh: props.ll84_electricity_use_grid_purchase_kwh,
    ll84WeatherNormalizedElectricityKwh: props.ll84_weather_normalized_electricity_use_kwh,
    ll84AnnualMaxDemandKw: props.ll84_annual_max_demand_kw,
    ll84NaturalGasTherms: props.ll84_natural_gas_use_therms,
    ll84TotalGhgEmissions: props.ll84_total_ghg_emissions_mtco2e,
    ll84PropertyGfa: props.ll84_property_gfa_buildings_ft2,
    ghg: props.ll84_total_ghg_emissions_mtco2e,
    feature,
  };
}

function parseSearchAliases(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return String(value || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function loadCompareItems() {
  try {
    const raw =
      window.localStorage.getItem(COMPARE_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_COMPARE_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) => item && item.bbl);
  } catch {
    return [];
  }
}

function saveCompareItems() {
  window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(state.compareItems));
}

function isComparedByBbl(bbl) {
  return state.compareItems.some((item) => item.bbl === bbl);
}

function getRowByBbl(bbl) {
  return state.allRows.find((row) => row.bbl === bbl) || state.choroplethFeatures.find((row) => row.bbl === bbl);
}

function hydrateCompareItems(compareItems) {
  return compareItems
    .map((item) => {
      const row = getRowByBbl(item.bbl);
      return row ? buildCompareRecord(row) : item;
    })
    .filter((item) => item && item.bbl);
}

function buildCompareRecord(row) {
  return {
    bbl: row.bbl,
    address: row.address || row.propertyName || "Unknown address",
    borough: row.borough || "",
    displayGrade: row.displayGrade || "",
    lastScoredYear: row.lastScoredYear ?? null,
    lastScoredEnergyStarScore: row.lastScoredEnergyStarScore ?? null,
    lastScoredDerivedGrade: row.lastScoredDerivedGrade || "",
    propertyType: row.propertyType || "",
    ll84TotalGhgEmissions: row.ll84TotalGhgEmissions ?? row.ghg ?? null,
    ll84EstimatedYearlyEnergyKwh: row.ll84EstimatedYearlyEnergyKwh ?? null,
    ll84PropertyGfa: row.ll84PropertyGfa ?? null,
    ll84ElectricityKwh: row.ll84ElectricityKwh ?? null,
    ll84NaturalGasTherms: row.ll84NaturalGasTherms ?? null,
    ll84WeatherNormalizedSiteEui: row.ll84WeatherNormalizedSiteEui ?? null,
  };
}

function toggleCompareByBbl(bbl) {
  const existingIndex = state.compareItems.findIndex((item) => item.bbl === bbl);
  if (existingIndex >= 0) {
    state.compareItems.splice(existingIndex, 1);
  } else {
    const row = getRowByBbl(bbl);
    if (!row) {
      return false;
    }
    state.compareItems.unshift(buildCompareRecord(row));
  }
  saveCompareItems();
  renderCompareItems();
  return existingIndex < 0;
}

function focusCompareItem(bbl) {
  const row = getRowByBbl(bbl);
  if (!row) {
    return;
  }
  renderDetails(row);
  if (row.latitude !== undefined && row.longitude !== undefined) {
    map.flyTo([row.latitude, row.longitude], Math.max(map.getZoom(), 16), { duration: 0.6 });
  }
}

function renderCompareItems() {
  if (!state.compareItems.length) {
    compareContent.className = "compare-empty";
    compareContent.textContent = "No buildings in compare yet. Use the button in a map popup to add one.";
    return;
  }

  compareContent.className = "compare-list";
  compareContent.innerHTML = state.compareItems
    .map((item) => {
      const energyEfficiency = item.lastScoredDerivedGrade
        ? `${item.lastScoredDerivedGrade} / ${item.lastScoredEnergyStarScore ?? "?"} (${item.lastScoredYear || "?"})`
        : "Not available";
      const ghg = item.ll84TotalGhgEmissions !== null && item.ll84TotalGhgEmissions !== undefined
        ? `${formatNumber(item.ll84TotalGhgEmissions, { maximumFractionDigits: 1 })} tCO2e`
        : "Not available";
      const estimatedEnergy = item.ll84EstimatedYearlyEnergyKwh !== null && item.ll84EstimatedYearlyEnergyKwh !== undefined
        ? `${formatNumber(item.ll84EstimatedYearlyEnergyKwh, { maximumFractionDigits: 0 })} kWh`
        : "Not available";
      const electricityUse = item.ll84ElectricityKwh !== null && item.ll84ElectricityKwh !== undefined
        ? `${formatNumber(item.ll84ElectricityKwh, { maximumFractionDigits: 0 })} kWh`
        : "Not available";
      const gasUse = item.ll84NaturalGasTherms !== null && item.ll84NaturalGasTherms !== undefined
        ? `${formatNumber(item.ll84NaturalGasTherms, { maximumFractionDigits: 0 })} therms`
        : "Not available";
      const floorArea = item.ll84PropertyGfa !== null && item.ll84PropertyGfa !== undefined
        ? `${formatNumber(item.ll84PropertyGfa)} ft²`
        : "Not available";
      const normalizedEui = item.ll84WeatherNormalizedSiteEui !== null && item.ll84WeatherNormalizedSiteEui !== undefined
        ? `${formatNumber(item.ll84WeatherNormalizedSiteEui, { maximumFractionDigits: 1 })} kBtu/ft²`
        : "Not available";
      return `
        <div class="compare-item">
          <div>
            <p class="compare-item-title">${item.address}</p>
            <p class="compare-item-meta">${item.borough || "Unknown borough"} · BBL ${item.bbl}</p>
          </div>
          <div class="compare-metrics">
            <div class="compare-metric"><span>Energy Efficiency Rating</span><strong>${energyEfficiency}</strong></div>
            <div class="compare-metric"><span>Property Type</span><strong>${item.propertyType || "Not available"}</strong></div>
            <div class="compare-metric"><span>Yearly Greenhouse Gas (GHG) Emissions</span><strong>${ghg}</strong></div>
            <div class="compare-metric"><span>Est. Yearly Energy Use</span><strong>${estimatedEnergy}</strong></div>
          </div>
          <details class="details-more compare-more">
            <summary>More Details</summary>
            <div class="compare-metrics compare-metrics-more">
              <div class="compare-metric"><span>Gross Floor Area</span><strong>${floorArea}</strong></div>
              <div class="compare-metric"><span>Electricity Use</span><strong>${electricityUse}</strong></div>
              <div class="compare-metric"><span>Natural Gas Use</span><strong>${gasUse}</strong></div>
              <div class="compare-metric"><span>Weather-Normalized Site EUI</span><strong>${normalizedEui}</strong></div>
            </div>
          </details>
          <div class="compare-actions">
            <button class="compare-button" data-bbl="${item.bbl}">Focus</button>
            <button class="compare-remove" data-bbl="${item.bbl}">Remove</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderDetails(row) {
  detailsContent.innerHTML = `
    <h3 class="details-title">${row.address || row.propertyName || "Unknown address"}</h3>
    <p class="details-meta">${row.borough || "Unknown borough"} · ${categoryLabels[row.mapCategory]} · BBL ${row.bbl}</p>
    <div class="details-grid">
      <div class="detail-card"><span>Energy Efficiency Rating</span><strong>${row.lastScoredDerivedGrade ? `${row.lastScoredDerivedGrade} / ${row.lastScoredEnergyStarScore ?? "?"} (${row.lastScoredYear || "?"})` : "Not available"}</strong></div>
      <div class="detail-card"><span>Property Type</span><strong>${row.propertyType || "Not available"}</strong></div>
      <div class="detail-card"><span>Yearly Greenhouse Gas (GHG) Emissions</span><strong>${row.ll84TotalGhgEmissions ? formatNumber(row.ll84TotalGhgEmissions, { maximumFractionDigits: 1 }) + " tCO2e" : "Not available"}</strong></div>
      <div class="detail-card"><span>Est. Yearly Energy Use</span><strong>${row.ll84EstimatedYearlyEnergyKwh ? formatNumber(row.ll84EstimatedYearlyEnergyKwh, { maximumFractionDigits: 0 }) + " kWh" : "Not available"}</strong></div>
    </div>
    <details class="details-more">
      <summary>More Details</summary>
      <div class="details-grid details-grid-more">
        <div class="detail-card"><span>Gross Floor Area</span><strong>${row.ll84PropertyGfa ? formatNumber(row.ll84PropertyGfa) + " ft²" : "Not available"}</strong></div>
        <div class="detail-card"><span>Electricity Use</span><strong>${row.ll84ElectricityKwh ? formatNumber(row.ll84ElectricityKwh, { maximumFractionDigits: 0 }) + " kWh" : "Not available"}</strong></div>
        <div class="detail-card"><span>Natural Gas Use</span><strong>${row.ll84NaturalGasTherms ? `${formatNumber(row.ll84NaturalGasTherms, { maximumFractionDigits: 0 })} therms (~${formatNumber(row.ll84NaturalGasTherms * 29.3001, { maximumFractionDigits: 0 })} kWh)` : "Not available"}</strong></div>
        <div class="detail-card"><span>Weather-Normalized Site EUI</span><strong>${row.ll84WeatherNormalizedSiteEui ? formatNumber(row.ll84WeatherNormalizedSiteEui, { maximumFractionDigits: 1 }) + " kBtu/ft²" : "Not available"}</strong></div>
      </div>
    </details>
  `;
}

function updateStats(rows) {
  const counts = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.mapCategory] += 1;
      return acc;
    },
    {
      total: 0,
      ll84_scored: 0,
      ll84_benchmarked_no_score: 0,
    }
  );

  document.getElementById("visible-count").textContent = formatNumber(counts.total);
  document.getElementById("scored-count").textContent = formatNumber(counts.ll84_scored);
  document.getElementById("no-score-count").textContent = formatNumber(counts.ll84_benchmarked_no_score);
}

function getFilters() {
  return {
    mode: viewMode.value,
    query: normalizeSearchText(searchInput.value),
    borough: boroughFilter.value,
    propertyType: propertyTypeFilter.value,
    scoreValue: scoreFilterValue.value,
    scoreComparison: scoreFilterComparison.value,
    categories: new Set(categoryCheckboxes.filter((input) => input.checked).map((input) => input.value)),
  };
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasDigit(value) {
  return /\d/.test(value || "");
}

function matchesSearchText(text, query) {
  if (!query) {
    return true;
  }
  const normalizedText = normalizeSearchText(text);
  if (!normalizedText) {
    return false;
  }
  if (normalizedText === query) {
    return true;
  }
  if (normalizedText.startsWith(query)) {
    return true;
  }
  if (!hasDigit(query)) {
    return normalizedText.includes(query);
  }
  const tokenPattern = new RegExp(`(^|\\D)${escapeRegex(query)}(\\D|$)`);
  return tokenPattern.test(normalizedText);
}

function getSearchScore(row, query) {
  if (!query) {
    return 0;
  }
  const address = normalizeSearchText(row.address);
  const aliases = (row.searchAliases || []).map((alias) => normalizeSearchText(alias));
  const propertyName = normalizeSearchText(row.propertyName);
  const bbl = normalizeSearchText(row.bbl);
  const borough = normalizeSearchText(row.borough);

  if (propertyName === query || address === query || bbl === query || aliases.includes(query)) {
    return 100;
  }
  if (
    propertyName.startsWith(query) ||
    address.startsWith(query) ||
    aliases.some((alias) => alias.startsWith(query))
  ) {
    return 80;
  }
  if (matchesSearchText(propertyName, query)) {
    return 60;
  }
  if (matchesSearchText(address, query) || aliases.some((alias) => matchesSearchText(alias, query))) {
    return 40;
  }
  if (matchesSearchText(borough, query) || matchesSearchText(bbl, query)) {
    return 20;
  }
  return 0;
}

function rowMatchesFilters(row, filters) {
  if (!filters.categories.has(row.mapCategory)) {
    return false;
  }
  if (!matchesScoreFilter(row, filters)) {
    return false;
  }
  if (filters.borough !== "all" && row.borough !== filters.borough) {
    return false;
  }
  if (filters.propertyType !== "all" && row.propertyType !== filters.propertyType) {
    return false;
  }
  if (!filters.query) {
    return true;
  }
  return [row.address, ...(row.searchAliases || []), row.propertyName, row.borough, row.bbl].some((value) =>
    matchesSearchText(value, filters.query)
  );
}

function featureMatchesFilters(featureRow, filters) {
  return rowMatchesFilters(featureRow, filters);
}

function renderMap(rows) {
  map.getPane("choroplethPane").style.pointerEvents = "none";
  layerGroup.clearLayers();
  choroplethLayer.clearLayers();
  map.removeLayer(choroplethLayer);
  for (const row of rows) {
    const marker = L.circleMarker([row.latitude, row.longitude], getMarkerStyle(row));
    marker.bindPopup(makePopupHtml(row));
    marker.on("click", () => renderDetails(row));
    marker.addTo(layerGroup);
  }
}

function updateLegend(mode) {
  const showGhg = mode === "ghg";
  gradeLegend.classList.toggle("is-hidden", showGhg);
  gradeLegendNote.classList.toggle("is-hidden", showGhg);
  ghgLegend.classList.toggle("is-hidden", !showGhg);
  ghgLegendNote.classList.toggle("is-hidden", !showGhg);
}

function renderChoropleth(features) {
  map.getPane("choroplethPane").style.pointerEvents = "auto";
  layerGroup.clearLayers();
  choroplethLayer.clearLayers();
  choroplethLayer.addData(features);
  choroplethLayer.eachLayer((layer) => {
    const row = normalizeFeature(layer.feature);
    const props = layer.feature.properties;
    layer.setStyle({
      fillColor: getChoroplethColor(props.ll84_total_ghg_emissions_mtco2e),
    });
    layer.bindPopup(makePopupHtml(row));
    layer.on("click", () => renderDetails(row));
  });
  choroplethLayer.addTo(map);
}

function applyFilters({ fitBounds = false } = {}) {
  const filters = getFilters();
  let visibleRows = state.allRows.filter((row) => rowMatchesFilters(row, filters));
  let visibleFeatures = state.choroplethFeatures.filter((featureRow) => featureMatchesFilters(featureRow, filters));

  if (filters.query) {
    visibleRows = visibleRows
      .map((row) => ({ row, score: getSearchScore(row, filters.query) }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.row);

    visibleFeatures = visibleFeatures
      .map((item) => ({ item, score: getSearchScore(item, filters.query) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);
  }
  state.visibleRows = visibleRows;
  state.visibleChoroplethFeatures = visibleFeatures;
  if (filters.mode === "ghg") {
    renderChoropleth(visibleFeatures.map((item) => item.feature));
    updateStats(visibleFeatures);
  } else {
    renderMap(visibleRows);
    updateStats(visibleRows);
  }
  updateLegend(filters.mode);

  const shouldFit = fitBounds || Boolean(filters.query);
  const focusRows =
    filters.mode === "ghg"
      ? visibleFeatures.slice(0, 12).map((item) => item.feature)
      : visibleRows.slice(0, 12);
  const boundsRows = filters.mode === "ghg" ? visibleFeatures.map((item) => item.feature) : visibleRows;
  if (shouldFit && boundsRows.length) {
    const bounds =
      filters.mode === "ghg"
        ? L.geoJSON(focusRows).getBounds()
        : L.latLngBounds(focusRows.map((row) => [row.latitude, row.longitude]));
    map.fitBounds(bounds.pad(0.04));
  }
}

async function init() {
  populateScoreFilterOptions(viewMode.value);
  renderCompareItems();

  const [pointsResponse, ghgResponse] = await Promise.all([
    fetch("./energy_map_data.json"),
    fetch("./ghg_choropleth_data.geojson"),
  ]);
  state.allRows = await pointsResponse.json();
  const ghgGeojson = await ghgResponse.json();
  state.choroplethFeatures = ghgGeojson.features.map(normalizeFeature);
  state.compareItems = hydrateCompareItems(loadCompareItems()).filter((item) => getRowByBbl(item.bbl));
  saveCompareItems();

  const boroughs = [...new Set(state.allRows.map((row) => row.borough).filter(Boolean))].sort();
  const propertyTypes = [...new Set(state.allRows.map((row) => row.propertyType).filter(Boolean))].sort();
  populateSelect(boroughFilter, boroughs, "Unknown borough");
  populateSelect(propertyTypeFilter, propertyTypes, "Unknown type");
  populateScoreFilterOptions(viewMode.value);

  const debouncedApply = (() => {
    let timeoutId = null;
    return () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => applyFilters(), 120);
    };
  })();

  searchInput.addEventListener("input", debouncedApply);
  viewMode.addEventListener("change", () => {
    populateScoreFilterOptions(viewMode.value);
    applyFilters();
  });
  boroughFilter.addEventListener("change", () => applyFilters());
  propertyTypeFilter.addEventListener("change", () => applyFilters());
  scoreFilterValue.addEventListener("change", () => applyFilters());
  scoreFilterComparison.addEventListener("change", () => applyFilters());
  categoryCheckboxes.forEach((input) => input.addEventListener("change", () => applyFilters()));
  clearFiltersButton.addEventListener("click", () => {
    clearFilters();
    applyFilters({ fitBounds: true });
  });
  map.getContainer().addEventListener("click", (event) => {
    const popupButton = event.target.closest(".popup-compare-button");
    if (popupButton) {
      event.preventDefault();
      const isNowCompared = toggleCompareByBbl(popupButton.dataset.bbl);
      popupButton.classList.toggle("is-compared", isNowCompared);
      popupButton.textContent = isNowCompared ? "Remove from Comparison" : "Include in Comparison";
    }
  });
  compareContent.addEventListener("click", (event) => {
    const compareViewButton = event.target.closest(".compare-button");
    if (compareViewButton) {
      event.preventDefault();
      focusCompareItem(compareViewButton.dataset.bbl);
      return;
    }

    const compareRemoveButton = event.target.closest(".compare-remove");
    if (compareRemoveButton) {
      event.preventDefault();
      toggleCompareByBbl(compareRemoveButton.dataset.bbl);
    }
  });

  renderCompareItems();
  applyFilters({ fitBounds: true });
}

init().catch((error) => {
  const isFileProtocol = window.location.protocol === "file:";
  detailsContent.textContent = isFileProtocol
    ? "Could not load the map data. Open the site through a local web server rather than file://."
    : `Could not load the map data. ${error.message}`;
});
