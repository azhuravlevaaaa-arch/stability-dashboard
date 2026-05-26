const SHEET_ID = "1lccp_Iw-YHpwX3ewPHcVabhrUr1m3_S5shLq0UbufCY";
const GID = "1096086178";
const TODAY = startOfDay(new Date());
const STORAGE_KEY = "stability_measurement_drafts";
const LINK_STORAGE_KEY = "stability_protocol_links";
const APPS_SCRIPT_URL_KEY = "stability_apps_script_url";

const POINTS = [
  { key: "1д", label: "1 день", offset: 1 },
  { key: "1нед", label: "1 неделя", offset: 7 },
  { key: "2нед", label: "2 недели", offset: 14 },
  { key: "4нед", label: "4 недели", offset: 28 },
  { key: "8нед", label: "8 недель", offset: 56 },
  { key: "12нед", label: "12 недель", offset: 84 },
];

const els = {
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  dueCards: document.querySelector("#dueCards"),
  template: document.querySelector("#sampleCardTemplate"),
  sampleRows: document.querySelector("#sampleRows"),
  sampleCountLabel: document.querySelector("#sampleCountLabel"),
  totalSamples: document.querySelector("#totalSamples"),
  overdueCount: document.querySelector("#overdueCount"),
  todayCount: document.querySelector("#todayCount"),
  nextCount: document.querySelector("#nextCount"),
  draftCount: document.querySelector("#draftCount"),
  linkDraftCount: document.querySelector("#linkDraftCount"),
  updatedAt: document.querySelector("#updatedAt"),
  search: document.querySelector("#search"),
  statusFilter: document.querySelector("#statusFilter"),
  groupFilter: document.querySelector("#groupFilter"),
  sampleList: document.querySelector("#sampleList"),
  measurementForm: document.querySelector("#measurementForm"),
  sampleInput: document.querySelector("#sampleInput"),
  protocolPreviewInput: document.querySelector("#protocolPreviewInput"),
  protocolForm: document.querySelector("#protocolForm"),
  draftRows: document.querySelector("#draftRows"),
  linkRows: document.querySelector("#linkRows"),
  clearMeasurements: document.querySelector("#clearMeasurements"),
  clearLinks: document.querySelector("#clearLinks"),
  exportMeasurements: document.querySelector("#exportMeasurements"),
  exportLinks: document.querySelector("#exportLinks"),
  syncMeasurements: document.querySelector("#syncMeasurements"),
  appsScriptUrlInput: document.querySelector("#appsScriptUrlInput"),
  syncStatus: document.querySelector("#syncStatus"),
  sourceCount: document.querySelector("#sourceCount"),
  matchedCount: document.querySelector("#matchedCount"),
  unmatchedCount: document.querySelector("#unmatchedCount"),
  sourceAuditLabel: document.querySelector("#sourceAuditLabel"),
  sourceList: document.querySelector("#sourceList"),
  unmatchedList: document.querySelector("#unmatchedList"),
  summaryCards: document.querySelectorAll(".summary-card"),
};

let samples = [];
let sheetRows = [];
let sourceInventory = [];
let sourceMatch = null;
let drafts = loadDrafts();
let protocolLinks = loadProtocolLinks();

window.__handleSheet = (response) => {
  const rows = response.table.rows.map((row) => {
    const item = {};
    response.table.cols.forEach((col, index) => {
      item[col.label] = normalizeCell(row.c[index]);
    });
    return item;
  });

  sheetRows = rows.filter((row) => row["Образец"]);
  rebuildSamples();

  fillGroups(samples);
  fillSampleList(samples);
  renderAll();
};

async function loadLocalAudits() {
  try {
    const [inventoryResponse, matchResponse] = await Promise.all([
      fetch("./source-inventory.json"),
      fetch("./source-master-match.json"),
    ]);
    if (inventoryResponse.ok) sourceInventory = await inventoryResponse.json();
    if (matchResponse.ok) sourceMatch = await matchResponse.json();
    renderSources();
  } catch {
    els.sourceAuditLabel.textContent = "Локальный аудит файлов пока не загружен.";
  }
}

function normalizeCell(cell) {
  if (!cell) return "";
  return cell.f ?? cell.v ?? "";
}

function enrichSample(row) {
  const startDate = parseDate(row["Дата постановки"]);
  const points = POINTS.map((point) => {
    const draft = latestDraftFor(row["Образец"], point.key);
    const date = parseInputDate(draft?.date) || parseDate(row[`${point.key} - Дата`]) || addDays(startDate, point.offset);
    const measurement = {
      ph: draft?.ph || row[`${point.key} - pH`] || "",
      viscosity: draft?.viscosity || row[`${point.key} - Вязкость`] || "",
      appearance: draft?.appearance || row[`${point.key} - Внешний вид`] || "",
      note: draft?.note || "",
      local: Boolean(draft),
    };
    const done = Boolean((draft || row[`${point.key} - Дата`]) && (measurement.ph || measurement.viscosity || measurement.appearance || measurement.note));
    return {
      ...point,
      date,
      done,
      measurement,
      state: pointState(date, done),
    };
  });
  const nextPoint = points.find((point) => !point.done) || null;
  const lastPoint = [...points].reverse().find((point) => point.done) || null;
  const status = sampleStatus(points);

  return {
    name: row["Образец"],
    group: row["Группа"] || "Без группы",
    startDate,
    originalProtocol: row["Ссылка на протокол"],
    protocol: protocolFor(row["Образец"], row["Ссылка на протокол"]),
    rawStatus: row["Статус"] || "",
    points,
    nextPoint,
    lastPoint,
    status,
    searchable: Object.values(row).join(" ").toLowerCase(),
  };
}

function pointState(date, done) {
  if (done) return "done";
  if (!date) return "missing";
  const days = diffDays(TODAY, date);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "soon";
  return "future";
}

function sampleStatus(points) {
  if (points.every((point) => point.done)) return "done";
  if (points.some((point) => point.state === "overdue")) return "overdue";
  if (points.some((point) => point.state === "today")) return "today";
  if (points.some((point) => point.state === "soon")) return "soon";
  if (points.every((point) => !point.done)) return "missing";
  return "future";
}

function renderAll() {
  renderStats(samples);
  renderDashboard();
  renderSampleRows();
  renderDrafts();
  renderProtocolLinks();
  renderSources();
  renderSummaryActiveState();
  els.updatedAt.textContent = `Данные из Google Таблицы, расчет на ${formatDate(TODAY)}`;
}

function rebuildSamples() {
  samples = sheetRows
    .map(enrichSample)
    .sort((a, b) => statusWeight(a.status) - statusWeight(b.status) || a.name.localeCompare(b.name, "ru"));
}

function filteredSamples() {
  const query = els.search.value.trim().toLowerCase();
  const status = els.statusFilter.value;
  const group = els.groupFilter.value;
  return samples.filter((sample) => {
    const matchesSearch = !query || sample.searchable.includes(query);
    const matchesStatus = status === "all" || sample.status === status;
    const matchesGroup = group === "all" || sample.group === group;
    return matchesSearch && matchesStatus && matchesGroup;
  });
}

function renderDashboard() {
  const actionable = filteredSamples()
    .filter((sample) => ["overdue", "today", "soon", "missing"].includes(sample.status))
    .slice(0, 60);
  els.dueCards.textContent = "";
  actionable.forEach(renderCard);
  if (!actionable.length) {
    els.dueCards.append(emptyNode("По этим фильтрам нет срочных проверок."));
  }
}

function renderSampleRows() {
  const rows = filteredSamples();
  els.sampleRows.textContent = "";
  els.sampleCountLabel.textContent = `${rows.length} из ${samples.length}`;
  rows.forEach((sample) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(sample.name)}</strong></td>
      <td>${escapeHtml(sample.group)}</td>
      <td>${formatDate(sample.startDate) || "не указана"}</td>
      <td>${sample.lastPoint ? `${sample.lastPoint.label}, ${formatDate(sample.lastPoint.date)}` : "нет измерений"}</td>
      <td>${sample.nextPoint ? `${sample.nextPoint.label}, ${formatDate(sample.nextPoint.date)}` : "закрыто"}</td>
      <td>${statusLabel(sample.status)}</td>
      <td>${sample.protocol ? `<a href="${escapeAttr(sample.protocol)}" target="_blank" rel="noreferrer">открыть</a>` : `<button class="button secondary table-add-protocol" type="button">добавить</button>`}</td>
    `;
    const addProtocol = tr.querySelector(".table-add-protocol");
    if (addProtocol) {
      addProtocol.addEventListener("click", () => {
        activateView("links");
        document.querySelector("#protocolSampleInput").value = sample.name;
        document.querySelector("#protocolUrlInput").focus();
      });
    }
    els.sampleRows.append(tr);
  });
}

function renderStats(source) {
  els.totalSamples.textContent = source.length;
  els.overdueCount.textContent = source.filter((sample) => sample.status === "overdue").length;
  els.todayCount.textContent = source.filter((sample) => sample.status === "today").length;
  els.nextCount.textContent = source.filter((sample) => sample.status === "soon").length;
  els.draftCount.textContent = drafts.length;
  els.linkDraftCount.textContent = protocolLinks.length;
}

function renderCard(sample) {
  const node = els.template.content.cloneNode(true);
  node.querySelector("h3").textContent = sample.name;
  node.querySelector(".group").textContent = sample.group;
  node.querySelector(".start-date").textContent = formatDate(sample.startDate) || "Не указана";
  node.querySelector(".last-measurement").textContent = sample.lastPoint
    ? `${sample.lastPoint.label}, ${formatDate(sample.lastPoint.date)}`
    : "Нет измерений";
  node.querySelector(".next-point").textContent = sample.nextPoint
    ? `${sample.nextPoint.label}, ${formatDate(sample.nextPoint.date)}`
    : "Все точки закрыты";

  const badge = node.querySelector(".badge");
  badge.textContent = statusLabel(sample.status);
  badge.classList.add(sample.status);

  const timeline = node.querySelector(".timeline");
  sample.points.forEach((point) => {
    const item = document.createElement("div");
    item.className = `point ${point.state}`;
    item.innerHTML = `
      <strong>${point.label}</strong>
      <span>${formatDate(point.date) || "нет даты"}</span>
      <span>${point.done ? "внесено" : statusLabel(point.state)}</span>
    `;
    timeline.append(item);
  });

  node.querySelector(".latest").textContent = latestText(sample);
  node.querySelector(".add-measurement").addEventListener("click", () => {
    activateView("entry");
    document.querySelector("#sampleInput").value = sample.name;
    document.querySelector("#pointInput").value = sample.nextPoint?.key || "1д";
    document.querySelector("#dateInput").value = dateInputValue(new Date());
    updateProtocolPreview();
  });
  node.querySelector(".add-protocol").addEventListener("click", () => {
    activateView("links");
    document.querySelector("#protocolSampleInput").value = sample.name;
    document.querySelector("#protocolUrlInput").value = sample.protocol || "";
    document.querySelector("#protocolUrlInput").focus();
  });

  const protocol = node.querySelector(".protocol");
  if (sample.protocol) {
    protocol.href = sample.protocol;
  } else {
    protocol.remove();
  }

  els.dueCards.append(node);
}

function latestText(sample) {
  if (!sample.lastPoint) return sample.rawStatus || "Измерений пока нет.";
  const { ph, viscosity, appearance } = sample.lastPoint.measurement;
  const parts = [];
  if (ph) parts.push(`pH: ${ph}`);
  if (viscosity) parts.push(`вязкость: ${viscosity}`);
  if (appearance) parts.push(`вид: ${appearance}`);
  if (sample.lastPoint.measurement.local) parts.push("локально внесено");
  return parts.join(" | ") || sample.rawStatus || "Измерение внесено без деталей.";
}

function renderDrafts() {
  els.draftRows.textContent = "";
  els.draftCount.textContent = drafts.length;
  if (!drafts.length) {
    els.draftRows.append(emptyNode("Пока нет локальных внесений."));
    return;
  }
  [...drafts].reverse().forEach((draft) => {
    const item = document.createElement("div");
    item.className = "draft-item";
    item.innerHTML = `
      <strong>${escapeHtml(draft.sample)} — ${pointLabel(draft.point)}, ${formatInputDate(draft.date)}</strong>
      <span>T: ${escapeHtml(draft.temperature || "-")}°C | pH: ${escapeHtml(draft.ph || "-")} | вязкость: ${escapeHtml(draft.viscosity || "-")} | вид: ${escapeHtml(draft.appearance || "-")}</span>
      ${draft.targetSheet ? `<p class="muted">Лист: ${escapeHtml(draft.targetSheet)}</p>` : ""}
      ${draft.protocol ? `<p class="muted">Протокол: ${escapeHtml(draft.protocol)}</p>` : ""}
      ${draft.note ? `<p class="muted">${escapeHtml(draft.note)}</p>` : ""}
    `;
    els.draftRows.append(item);
  });
}

function renderProtocolLinks() {
  els.linkRows.textContent = "";
  els.linkDraftCount.textContent = protocolLinks.length;
  if (!protocolLinks.length) {
    els.linkRows.append(emptyNode("Пока нет добавленных ссылок."));
    return;
  }
  [...protocolLinks].reverse().forEach((link) => {
    const item = document.createElement("div");
    item.className = "draft-item";
    item.innerHTML = `
      <strong>${escapeHtml(link.sample)}</strong>
      <a href="${escapeAttr(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.url)}</a>
      ${link.note ? `<p class="muted">${escapeHtml(link.note)}</p>` : ""}
    `;
    els.linkRows.append(item);
  });
}

function renderSources() {
  if (!sourceInventory.length && !sourceMatch) return;
  els.sourceCount.textContent = sourceInventory.length;
  els.matchedCount.textContent = sourceMatch?.matchedMaster ?? 0;
  els.unmatchedCount.textContent = sourceMatch?.unmatchedMaster?.length ?? 0;
  els.sourceAuditLabel.textContent = "По загруженным Excel-файлам и текущей мастер-таблице.";

  els.sourceList.textContent = "";
  sourceInventory
    .filter((item) => item.keywordHits?.length >= 4)
    .sort((a, b) => b.nonEmptyCells - a.nonEmptyCells)
    .slice(0, 24)
    .forEach((item) => {
      const node = document.createElement("div");
      node.className = "source-item";
      node.innerHTML = `
        <strong>${escapeHtml(item.file)}</strong>
        <span>${item.sheetCount} лист(а), ${item.nonEmptyCells} ячеек; даты: ${escapeHtml((item.sampleDates || []).slice(0, 4).join(", ") || "не найдены")}</span>
      `;
      els.sourceList.append(node);
    });

  els.unmatchedList.textContent = "";
  (sourceMatch?.unmatchedMaster || []).slice(0, 40).forEach((item) => {
    const node = document.createElement("div");
    node.className = "source-item";
    node.innerHTML = `
      <strong>строка ${item.row}: ${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.group || "без группы")}${item.hasProtocol ? "" : " | нет ссылки на протокол"}</span>
    `;
    els.unmatchedList.append(node);
  });
}

function fillGroups(source) {
  const current = els.groupFilter.value;
  els.groupFilter.innerHTML = `<option value="all">Все группы</option>`;
  const groups = [...new Set(source.map((sample) => sample.group))].sort((a, b) => a.localeCompare(b, "ru"));
  groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = group;
    els.groupFilter.append(option);
  });
  els.groupFilter.value = [...els.groupFilter.options].some((option) => option.value === current) ? current : "all";
}

function fillSampleList(source) {
  els.sampleList.textContent = "";
  source.forEach((sample) => {
    const option = document.createElement("option");
    option.value = sample.name;
    els.sampleList.append(option);
  });
}

function saveDraft(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.measurementForm).entries());
  const sample = samples.find((item) => item.name === data.sample);
  drafts.push({
    ...data,
    pointLabel: pointLabel(data.point),
    protocol: sample?.protocol || data.protocol || "",
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  els.measurementForm.reset();
  document.querySelector("#dateInput").value = dateInputValue(new Date());
  updateProtocolPreview();
  rebuildSamples();
  renderAll();
}

async function syncMeasurements() {
  const url = els.appsScriptUrlInput.value.trim();
  if (!url) {
    els.syncStatus.textContent = "Сначала вставь URL Apps Script.";
    return;
  }
  if (!drafts.length) {
    els.syncStatus.textContent = "Нет локальных внесений для отправки.";
    return;
  }
  localStorage.setItem(APPS_SCRIPT_URL_KEY, url);
  els.syncStatus.textContent = "Отправляю данные в Google Sheets...";

  try {
    for (const draft of drafts) {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "measurement",
          ...draft,
          point: draft.pointLabel || pointLabel(draft.point),
        }),
      });
    }
    els.syncStatus.textContent = `Отправлено записей: ${drafts.length}. Проверь Google Sheets.`;
  } catch (error) {
    els.syncStatus.textContent = `Не удалось отправить: ${error.message}`;
  }
}

function loadDrafts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function latestDraftFor(sampleName, pointKey) {
  return [...drafts].reverse().find((draft) => draft.sample === sampleName && draft.point === pointKey);
}

function loadProtocolLinks() {
  try {
    return JSON.parse(localStorage.getItem(LINK_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function protocolFor(sampleName, originalProtocol = "") {
  const link = [...protocolLinks].reverse().find((item) => item.sample === sampleName);
  return link?.url || originalProtocol || "";
}

function refreshProtocolLinksInSamples() {
  samples = samples.map((sample) => ({
    ...sample,
    protocol: protocolFor(sample.name, sample.originalProtocol),
    searchable: `${sample.searchable} ${protocolFor(sample.name, sample.originalProtocol)}`.toLowerCase(),
  }));
}

function saveProtocolLink(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.protocolForm).entries());
  protocolLinks.push({
    ...data,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(protocolLinks));
  els.protocolForm.reset();
  refreshProtocolLinksInSamples();
  renderAll();
}

function exportDrafts() {
  const headers = ["Образец", "Точка", "Дата измерения", "T, °C", "Лист Google Sheets", "pH", "Вязкость", "Внешний вид", "Ссылка на протокол", "Комментарий", "Создано"];
  const rows = drafts.map((draft) => [
    draft.sample,
    pointLabel(draft.point),
    formatInputDate(draft.date),
    draft.temperature,
    draft.targetSheet,
    draft.ph,
    draft.viscosity,
    draft.appearance,
    draft.protocol,
    draft.note,
    draft.createdAt,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stability-measurements-${dateInputValue(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportProtocolLinks() {
  const headers = ["Образец", "Ссылка на протокол", "Комментарий", "Создано"];
  const rows = protocolLinks.map((link) => [link.sample, link.url, link.note, link.createdAt]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stability-protocol-links-${dateInputValue(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearDrafts() {
  if (!drafts.length) return;
  if (!confirm("Очистить локальные внесения?")) return;
  drafts = [];
  localStorage.removeItem(STORAGE_KEY);
  renderDrafts();
  renderStats(samples);
}

function clearProtocolLinks() {
  if (!protocolLinks.length) return;
  if (!confirm("Очистить локально добавленные ссылки?")) return;
  protocolLinks = [];
  localStorage.removeItem(LINK_STORAGE_KEY);
  refreshProtocolLinksInSamples();
  renderAll();
}

function updateProtocolPreview() {
  const sample = samples.find((item) => item.name === els.sampleInput.value);
  els.protocolPreviewInput.value = sample?.protocol || "";
}

function activateView(view) {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  els.views.forEach((section) => section.classList.toggle("active", section.id === `${view}View`));
}

function activateSummaryCard(card) {
  const status = card.dataset.status;
  const view = card.dataset.viewShortcut;
  if (status) {
    els.statusFilter.value = status;
    activateView(status === "all" ? "samples" : "dashboard");
    renderAll();
    return;
  }
  if (view) activateView(view);
}

function renderSummaryActiveState() {
  els.summaryCards.forEach((card) => {
    const active = card.dataset.status && card.dataset.status === els.statusFilter.value;
    card.classList.toggle("active-filter", Boolean(active));
  });
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function parseInputDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDays(date, days) {
  if (!date) return null;
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function diffDays(from, to) {
  const day = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / day);
}

function formatDate(date) {
  if (!date) return "";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function dateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function formatInputDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function statusLabel(status) {
  return {
    overdue: "Просрочено",
    today: "Сегодня",
    soon: "Скоро",
    done: "Закрыто",
    missing: "Нет данных",
    future: "Позже",
  }[status] || "В работе";
}

function pointLabel(key) {
  return POINTS.find((point) => point.key === key)?.label || key;
}

function statusWeight(status) {
  return {
    overdue: 0,
    today: 1,
    soon: 2,
    missing: 3,
    future: 4,
    done: 5,
  }[status] ?? 6;
}

function emptyNode(text) {
  const node = document.createElement("div");
  node.className = "empty";
  node.textContent = text;
  return node;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function loadSheet() {
  const script = document.createElement("script");
  const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
  url.searchParams.set("gid", GID);
  url.searchParams.set("headers", "1");
  url.searchParams.set("tqx", "out:json;responseHandler:__handleSheet");
  script.src = url.toString();
  script.onerror = () => {
    els.updatedAt.textContent = "Не удалось загрузить Google Таблицу. Проверьте доступ по ссылке.";
  };
  document.body.append(script);
}

els.search.addEventListener("input", renderAll);
els.statusFilter.addEventListener("change", renderAll);
els.groupFilter.addEventListener("change", renderAll);
els.measurementForm.addEventListener("submit", saveDraft);
els.sampleInput.addEventListener("input", updateProtocolPreview);
els.protocolForm.addEventListener("submit", saveProtocolLink);
els.exportMeasurements.addEventListener("click", exportDrafts);
els.exportLinks.addEventListener("click", exportProtocolLinks);
els.syncMeasurements.addEventListener("click", syncMeasurements);
els.clearMeasurements.addEventListener("click", clearDrafts);
els.clearLinks.addEventListener("click", clearProtocolLinks);
els.tabs.forEach((tab) => tab.addEventListener("click", () => activateView(tab.dataset.view)));
els.summaryCards.forEach((card) => {
  card.addEventListener("click", () => activateSummaryCard(card));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateSummaryCard(card);
    }
  });
});

document.querySelector("#dateInput").value = dateInputValue(new Date());
els.appsScriptUrlInput.value = localStorage.getItem(APPS_SCRIPT_URL_KEY) || "";
renderDrafts();
loadLocalAudits();
loadSheet();
