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
};

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
const categoryCheckboxes = Array.from(document.querySelectorAll('.toggle-group input[type="checkbox"]'));
const detailsContent = document.getElementById("details-content");
const gradeLegend = document.getElementById("grade-legend");
const gradeLegendNote = document.getElementById("grade-legend-note");
const ghgLegend = document.getElementById("ghg-legend");
const ghgLegendNote = document.getElementById("ghg-legend-note");

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

function makePopupHtml(row) {
  const grade = row.displayGrade || "Not available";
  const ghgValue =
    row.ll84TotalGhgEmissions ?? row.ghg ?? row.ll84_total_ghg_emissions_mtco2e ?? null;
  const ghg = ghgValue !== null && ghgValue !== undefined
    ? `${formatNumber(ghgValue, { maximumFractionDigits: 1 })} tCO2e`
    : "Not available";

  return `
    <div>
      <p class="popup-title">${row.address || row.propertyName || "Unknown address"}</p>
      <p class="popup-subtitle">${row.borough || "Unknown borough"} · ${categoryLabels[row.mapCategory]}</p>
      <p class="popup-subtitle">Grade: ${grade}</p>
      <p class="popup-subtitle">GHG: ${ghg}</p>
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

function renderDetails(row) {
  detailsContent.innerHTML = `
    <h3 class="details-title">${row.address || row.propertyName || "Unknown address"}</h3>
    <p class="details-meta">${row.borough || "Unknown borough"} · ${categoryLabels[row.mapCategory]} · BBL ${row.bbl}</p>
    <div class="details-grid">
      <div class="detail-card"><span>Display Grade</span><strong>${row.displayGrade || "Not available"}</strong></div>
      <div class="detail-card"><span>Display Grade Basis</span><strong>${gradeBasisLabels[row.displayGradeBasis] || "Not available"}</strong></div>
      <div class="detail-card"><span>Latest Derived Grade</span><strong>${row.derivedGrade || "Not available"}</strong></div>
      <div class="detail-card"><span>Last Scored Benchmarking Year</span><strong>${row.lastScoredDerivedGrade ? `${row.lastScoredDerivedGrade} / ${row.lastScoredEnergyStarScore ?? "?"} (${row.lastScoredYear || "?"})` : "Not available"}</strong></div>
      <div class="detail-card"><span>Approx. Posted Cycle</span><strong>${row.lastScoredYear ? formatPostedCycle(row.lastScoredYear) : "Not available"}</strong></div>
      <div class="detail-card"><span>Latest ENERGY STAR</span><strong>${row.ll84EnergyStarScore ?? "Not available"}</strong></div>
      <div class="detail-card"><span>Property Type</span><strong>${row.propertyType || "Not available"}</strong></div>
      <div class="detail-card"><span>Latest Benchmarking Year</span><strong>${row.ll84Year || "Not available"}</strong></div>
      <div class="detail-card"><span>Weather-Normalized Site EUI</span><strong>${row.ll84WeatherNormalizedSiteEui ? formatNumber(row.ll84WeatherNormalizedSiteEui, { maximumFractionDigits: 1 }) + " kBtu/ft²" : "Not available"}</strong></div>
      <div class="detail-card"><span>Electricity Use</span><strong>${row.ll84ElectricityKwh ? formatNumber(row.ll84ElectricityKwh, { maximumFractionDigits: 0 }) + " kWh" : "Not available"}</strong></div>
      <div class="detail-card"><span>Gross Floor Area</span><strong>${row.ll84PropertyGfa ? formatNumber(row.ll84PropertyGfa) + " ft²" : "Not available"}</strong></div>
      <div class="detail-card"><span>GHG Emissions</span><strong>${row.ll84TotalGhgEmissions ? formatNumber(row.ll84TotalGhgEmissions, { maximumFractionDigits: 1 }) + " tCO2e" : "Not available"}</strong></div>
    </div>
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
  document.getElementById("latest-score-count").textContent = formatNumber(
    rows.filter((row) => row.ll84EnergyStarScore !== null && row.ll84EnergyStarScore !== undefined).length
  );
  document.getElementById("no-score-count").textContent = formatNumber(counts.ll84_benchmarked_no_score);
}

function getFilters() {
  return {
    mode: viewMode.value,
    query: normalizeSearchText(searchInput.value),
    borough: boroughFilter.value,
    propertyType: propertyTypeFilter.value,
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
    const props = layer.feature.properties;
    layer.setStyle({
      fillColor: getChoroplethColor(props.ll84_total_ghg_emissions_mtco2e),
    });
    layer.bindPopup(makePopupHtml(normalizeFeature(layer.feature)));
    layer.on("click", () => {
      renderDetails({
        displayGrade: props.display_grade,
        displayGradeBasis: props.display_grade_basis,
        derivedGrade: props.derived_grade_from_ll84_score || "",
        lastScoredDerivedGrade: props.ll84_last_scored_derived_grade || "",
        lastScoredEnergyStarScore: props.ll84_last_scored_energy_star_score || null,
        lastScoredYear: props.ll84_last_scored_year ? Number(props.ll84_last_scored_year) : null,
        ll84EnergyStarScore: props.ll84_energy_star_score,
        propertyType: props.ll84_property_type,
        ll84Year: props.ll84_calendar_year ? Number(props.ll84_calendar_year) : null,
        ll84WeatherNormalizedSiteEui: props.ll84_weather_normalized_site_eui_kbtu_ft2,
        ll84ElectricityKwh: props.ll84_electricity_use_grid_purchase_kwh,
        ll84PropertyGfa: props.ll84_property_gfa_buildings_ft2,
        ll84TotalGhgEmissions: props.ll84_total_ghg_emissions_mtco2e,
        address: props.address,
        borough: props.borough,
        bbl: props.bbl,
        mapCategory: props.map_category,
      });
    });
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
  const [pointsResponse, ghgResponse] = await Promise.all([
    fetch("./energy_map_data.json"),
    fetch("./ghg_choropleth_data.geojson"),
  ]);
  state.allRows = await pointsResponse.json();
  const ghgGeojson = await ghgResponse.json();
  state.choroplethFeatures = ghgGeojson.features.map(normalizeFeature);

  const boroughs = [...new Set(state.allRows.map((row) => row.borough).filter(Boolean))].sort();
  const propertyTypes = [...new Set(state.allRows.map((row) => row.propertyType).filter(Boolean))].sort();
  populateSelect(boroughFilter, boroughs, "Unknown borough");
  populateSelect(propertyTypeFilter, propertyTypes, "Unknown type");

  const debouncedApply = (() => {
    let timeoutId = null;
    return () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => applyFilters(), 120);
    };
  })();

  searchInput.addEventListener("input", debouncedApply);
  viewMode.addEventListener("change", () => applyFilters({ fitBounds: true }));
  boroughFilter.addEventListener("change", () => applyFilters());
  propertyTypeFilter.addEventListener("change", () => applyFilters());
  categoryCheckboxes.forEach((input) => input.addEventListener("change", () => applyFilters()));

  applyFilters({ fitBounds: true });
}

init().catch((error) => {
  detailsContent.textContent = `Could not load the map data. ${error.message}`;
});
