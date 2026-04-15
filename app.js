const categoryLabels = {
  ll33_graded: "Official LL33 grade",
  ll84_scored_no_ll33: "LL84 scored, no LL33 match",
  ll84_benchmarked_no_score: "LL84 benchmarked, no score",
};

const gradeBasisLabels = {
  historical_ll84_last_scored: "Last scored LL84 year",
  official_ll33: "Official LL33 grade",
  latest_ll84_score: "Latest LL84 score",
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

const categoryBorders = {
  ll33_graded: "#18212f",
  ll84_scored_no_ll33: "#0f766e",
  ll84_benchmarked_no_score: "#667085",
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

function getMarkerStyle(row) {
  return {
    radius: 5,
    fillColor: gradeColors[row.displayGrade || ""],
    color: categoryBorders[row.mapCategory],
    weight: 1.4,
    opacity: 1,
    fillOpacity: 0.82,
    renderer: markerRenderer,
  };
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
  return `
    <div>
      <p class="popup-title">${row.address || row.propertyName || "Unknown address"}</p>
      <p class="popup-subtitle">${row.borough || "Unknown borough"} · ${categoryLabels[row.mapCategory]}</p>
    </div>
  `;
}

function normalizeFeature(feature) {
  const props = feature.properties;
  return {
    bbl: props.bbl,
    address: props.address,
    borough: props.borough,
    mapCategory: props.map_category,
    displayGrade: props.display_grade,
    propertyName: props.ll84_property_name,
    propertyType: props.ll84_property_type,
    ghg: props.ll84_total_ghg_emissions_mtco2e,
    feature,
  };
}

function renderDetails(row) {
  detailsContent.innerHTML = `
    <h3 class="details-title">${row.address || row.propertyName || "Unknown address"}</h3>
    <p class="details-meta">${row.borough || "Unknown borough"} · ${categoryLabels[row.mapCategory]} · BBL ${row.bbl}</p>
    <div class="details-grid">
      <div class="detail-card"><span>Display Grade</span><strong>${row.displayGrade || "Not available"}</strong></div>
      <div class="detail-card"><span>Display Grade Basis</span><strong>${gradeBasisLabels[row.displayGradeBasis] || "Not available"}</strong></div>
      <div class="detail-card"><span>Official LL33 Grade</span><strong>${row.officialGrade || "Not available"}</strong></div>
      <div class="detail-card"><span>Derived LL84 Grade</span><strong>${row.derivedGrade || "Not available"}</strong></div>
      <div class="detail-card"><span>Last Scored Benchmarking Year</span><strong>${row.lastScoredDerivedGrade ? `${row.lastScoredDerivedGrade} / ${row.lastScoredEnergyStarScore ?? "?"} (${row.lastScoredYear || "?"})` : "Not available"}</strong></div>
      <div class="detail-card"><span>Approx. Posted Cycle</span><strong>${row.lastScoredYear ? formatPostedCycle(row.lastScoredYear) : "Not available"}</strong></div>
      <div class="detail-card"><span>Latest LL84 ENERGY STAR</span><strong>${row.ll84EnergyStarScore ?? "Not available"}</strong></div>
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
      ll33_graded: 0,
      ll84_scored_no_ll33: 0,
      ll84_benchmarked_no_score: 0,
    }
  );

  document.getElementById("visible-count").textContent = formatNumber(counts.total);
  document.getElementById("ll33-count").textContent = formatNumber(counts.ll33_graded);
  document.getElementById("derived-count").textContent = formatNumber(counts.ll84_scored_no_ll33);
  document.getElementById("no-score-count").textContent = formatNumber(counts.ll84_benchmarked_no_score);
}

function getFilters() {
  return {
    mode: viewMode.value,
    query: searchInput.value.trim().toLowerCase(),
    borough: boroughFilter.value,
    propertyType: propertyTypeFilter.value,
    categories: new Set(categoryCheckboxes.filter((input) => input.checked).map((input) => input.value)),
  };
}

function getSearchScore(row, query) {
  if (!query) {
    return 0;
  }
  const address = (row.address || "").toLowerCase();
  const propertyName = (row.propertyName || "").toLowerCase();
  const bbl = (row.bbl || "").toLowerCase();
  const borough = (row.borough || "").toLowerCase();

  if (propertyName === query || address === query || bbl === query) {
    return 100;
  }
  if (propertyName.startsWith(query) || address.startsWith(query)) {
    return 80;
  }
  if (propertyName.includes(query)) {
    return 60;
  }
  if (address.includes(query)) {
    return 40;
  }
  if (borough.includes(query) || bbl.includes(query)) {
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
  const haystack = [row.address, row.propertyName, row.borough, row.bbl].join(" ").toLowerCase();
  return haystack.includes(filters.query);
}

function featureMatchesFilters(featureRow, filters) {
  return rowMatchesFilters(featureRow, filters);
}

function renderMap(rows) {
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

function renderChoropleth(features) {
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
        officialGrade: props.ll33_grade || "",
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
