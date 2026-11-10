/* Dashboard de incidencias ACC · LI-114 — página estática (GitHub Pages).
   Datos: data/incidencias.json y data/historial.json, generados por build_data.py. */
"use strict";

const DIA = 86400000;
const META_I1 = 0.75;
const UMBRAL_PEND = 15; // días, provisional (pendiente #63 de la wiki)
const SIT = { P: "Le toca a Sinohydro", R: "Le toca al revisor", C: "Cerrada" };
// Estados de ACC en el orden de Forma. Flujo del proyecto ("ACC: Preguntas frecuentes"):
// Abierta → (notificación formal) → Pendiente → Completada → ¿se valida? → Cerrada | No aprobada → Pendiente…
let ESTADOS = ["Borrador", "Abierta", "Pendiente", "Completada", "No aprobada", "Cerrada"];
const CORTO = { Borrador: "Borr.", Abierta: "Abier.", Pendiente: "Pend.", Completada: "Compl.", "No aprobada": "No apr.", Cerrada: "Cerr." };
const TOCA_TXT = { P: "le toca a Sinohydro", R: "le toca al revisor", C: null };
const DESC_EST = {
  Borrador: "El revisor la está redactando y todavía no la emite.",
  Abierta: "El revisor la creó y está lista para atención. Sinohydro la pasa a Pendiente cuando recibe la notificación formal de la revisión.",
  Pendiente: "Sinohydro recibió la notificación formal y la está atendiendo.",
  Completada: "Sinohydro la atendió y notificó al revisor. Queda lista para que el revisor la valide en la siguiente entrega.",
  "No aprobada": "El revisor verificó la respuesta y considera que no fue atendida. Sinohydro debe atenderla otra vez.",
  Cerrada: "El revisor verificó la respuesta y la da por atendida. Es la única que cuenta como resuelta en el KPI I1.",
};
const TOCA_EST = { Borrador: "R", Abierta: "P", Pendiente: "P", Completada: "R", "No aprobada": "P", Cerrada: "C" };
const RANGOS = [["0-7 d", 0, 7], ["8-15 d", 7, 15], ["16-30 d", 15, 30], ["31-60 d", 30, 60], ["> 60 d", 60, Infinity]];

let DATA = [], META = {}, HIST = [], CORTE = null;
const charts = {};
const state = { tab: "resumen", rev: "", ent: "", trv: "", fase: "", q: "", sit: "", doc: "", tsr: "", page: 0 };

/* ---------- utilidades ---------- */
const $ = (id) => document.getElementById(id);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmt = (n) => (n == null || isNaN(n) ? "–" : Math.round(n).toLocaleString("es-PE"));
const fmt1 = (n) => (n == null || isNaN(n) ? "–" : n.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const pct = (n) => (n == null || isNaN(n) ? "–" : (n * 100).toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %");
const fecha = (d) => (d ? d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–");
const fechaHora = (d) => (d ? fecha(d) + " " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false }) : "–");
const lunes = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const sinHora = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mediana = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const promedio = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

function el(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style") e.setAttribute("style", v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h != null) e.append(h instanceof Node ? h : document.createTextNode(String(h)));
  return e;
}
const llenar = (id, ...hijos) => { const c = $(id); c.replaceChildren(...hijos.flat()); return c; };
const key = (color) => el("span", { class: "key", style: `background:${color}` });
const colEst = (e) => { const i = ["Borrador", "Abierta", "Pendiente", "Completada", "No aprobada", "Cerrada"].indexOf(e); return i < 0 ? css("--ink-3") : css(`--est-${i}`); };
const estadosAbiertos = () => ESTADOS.filter((e) => e !== "Cerrada");
const chipEstado = (r) => el("span", { class: "sit" }, key(colEst(r.estado)), r.estado);

/* ---------- enlaces a ACC (requieren sesión en ACC con acceso al proyecto) ---------- */
const enc = encodeURIComponent;
function urlIncidencia(r) {
  const b = META.acc && META.acc.issues;
  return b && r.gid ? `${b}?issueId=${enc(r.gid)}` : null;
}
function urlDocumento(r, conMarca = true) {
  const a = META.acc, c = a && r.dl != null ? a.docLinks[r.dl] : null;
  if (!c || !a.files) return null;
  let u = `${a.files}?entityId=${enc(c[0])}&folderUrn=${enc(c[1])}`;
  if (conMarca && r.gid) u += `&issueId=${enc(r.gid)}&markups=${enc(JSON.stringify({ selection: { fbt: "issue", fbids: [r.gid] } }))}`;
  return u + `&viewableGuid=${enc(c[2])}`;
}
function enlaceAcc(url, texto, titulo) {
  if (!url) return texto;
  return el("a", { class: "acc", href: url, target: "_blank", rel: "noopener noreferrer", title: titulo, onclick: (e) => e.stopPropagation() }, texto, el("span", { class: "ext", "aria-hidden": "true" }, " ↗"));
}

/* ---------- datos ---------- */
function preparar(rows) {
  for (const r of rows) {
    r.dCre = r.creado ? new Date(r.creado) : null;
    r.dCer = r.cerrado ? new Date(r.cerrado) : null;
    r.dVen = r.venc ? new Date(r.venc) : null;
    r.diasCierre = r.dCer && r.dCre ? (r.dCer - r.dCre) / DIA : null;
    r.edad = r.sit !== "C" && r.dCre ? (CORTE - r.dCre) / DIA : null;
    r.rango = r.edad == null ? null : RANGOS.find(([, a, b]) => r.edad > a - (a === 0 ? 1 : 0) && r.edad <= b)[0];
    r.texto = [r.id, r.titulo, r.desc, r.doc, r.coment, r.creador, r.tipo].filter(Boolean).join(" ").toLowerCase();
  }
  return rows;
}

const filtrados = () => DATA.filter((r) =>
  (!state.rev || r.rev === state.rev) && (!state.ent || (r.entregable || "(sin dato)") === state.ent) &&
  (!state.trv || (r.tipoRev || "(sin dato)") === state.trv) && (!state.fase || (r.fase || "(sin dato)") === state.fase));

function contar(rows) {
  const c = { total: rows.length, P: 0, R: 0, C: 0 };
  c.est = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
  for (const r of rows) { c[r.sit]++; c.est[r.estado] = (c.est[r.estado] || 0) + 1; }
  c.NC = c.P + c.R;
  c.i1 = c.total ? c.C / c.total : null;
  c.faltan = Math.max(0, Math.ceil(META_I1 * c.total - c.C));
  return c;
}

/* ---------- estado en la URL (para compartir enlaces) ---------- */
function leerHash() {
  const [tab, qs] = location.hash.slice(1).split("?");
  if (tab) state.tab = tab;
  const p = new URLSearchParams(qs || "");
  for (const k of ["rev", "ent", "trv", "fase", "q", "sit", "doc", "tsr"]) state[k] = p.get(k) || "";
}
function escribirHash() {
  const p = new URLSearchParams();
  for (const k of ["rev", "ent", "trv", "fase", "q", "sit", "doc", "tsr"]) if (state[k]) p.set(k, state[k]);
  const h = "#" + state.tab + (p.toString() ? "?" + p : "");
  if (location.hash !== h) history.replaceState(null, "", h);
}

/* ---------- Chart.js ---------- */
const etiquetas = { // etiquetas directas dentro de barras (solo si caben)
  id: "etiquetas",
  afterDatasetsDraw(chart, _a, opts) {
    if (!opts || !opts.mostrar) return;
    const { ctx } = chart;
    ctx.save();
    ctx.font = "600 11px Segoe UI, system-ui, sans-serif";
    ctx.fillStyle = css("--ink");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      meta.data.forEach((bar, j) => {
        const v = opts.valor ? opts.valor(i, j) : ds.data[j];
        if (!v) return;
        const { x, y, base, width, height } = bar.getProps(["x", "y", "base", "width", "height"], true);
        const horiz = chart.options.indexAxis === "y";
        const largo = Math.abs(horiz ? x - base : base - y), ancho = horiz ? height : width;
        const t = fmt(v);
        if (largo < ctx.measureText(t).width + 10 || ancho < 14) return;
        ctx.fillText(t, horiz ? (x + base) / 2 : x, horiz ? y : (y + base) / 2);
      });
    });
    ctx.restore();
  },
};

function baseOpts(extra = {}) {
  const ink2 = css("--ink-2"), grid = css("--grid"), surf = css("--surface"), ink = css("--ink"), line = css("--line");
  return Object.assign({
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "top", align: "start", labels: { color: ink2, boxWidth: 12, boxHeight: 12, usePointStyle: false } },
      tooltip: { backgroundColor: surf, titleColor: ink2, bodyColor: ink, borderColor: line, borderWidth: 1, padding: 8,
        bodyFont: { weight: "600" }, boxWidth: 10, boxHeight: 2, usePointStyle: false },
    },
    scales: {
      x: { grid: { display: false }, border: { color: line }, ticks: { color: ink2 } },
      y: { grid: { color: grid }, border: { display: false }, ticks: { color: ink2, precision: 0 }, beginAtZero: true },
    },
  }, extra);
}
function grafico(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), config);
  return charts[id];
}
const barDs = (label, data, color, extra = {}) => Object.assign({ label, data, backgroundColor: color, borderColor: css("--surface"),
  borderWidth: 1, borderRadius: 4, borderSkipped: "start", maxBarThickness: 46 }, extra);
const lineDs = (label, data, color, extra = {}) => Object.assign({ label, data, borderColor: color, backgroundColor: color,
  borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.25 }, extra);

/* ---------- series semanales ---------- */
function semanas(rows) {
  if (!rows.length) return [];
  const ini = lunes(new Date(Math.min(...rows.filter((r) => r.dCre).map((r) => r.dCre))));
  const out = [];
  for (let w = new Date(ini); w <= CORTE; w = new Date(w.getTime() + 7 * DIA)) {
    const fin = new Date(Math.min(w.getTime() + 7 * DIA, CORTE.getTime() + 1));
    let cre = 0, cer = 0, saldo = 0, creAc = 0, cerAc = 0;
    for (const r of rows) {
      if (r.dCre && r.dCre >= w && r.dCre < fin) cre++;
      if (r.dCer && r.dCer >= w && r.dCer < fin) cer++;
      if (r.dCre && r.dCre < fin) { creAc++; if (!r.dCer || r.dCer >= fin) saldo++; }
      if (r.dCer && r.dCer < fin) cerAc++;
    }
    out.push({ w, cre, cer, saldo, creAc, cerAc });
  }
  return out;
}
const etiquetaSemana = (w) => w.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });

/* ---------- 1 Resumen ---------- */
function tile(lab, val, sub, color, info) {
  return el("div", { class: "tile" }, el("div", { class: "lab" }, color ? key(color) : null, el("span", {}, lab),
    info ? el("button", { type: "button", class: "info", "aria-label": `Qué es: ${lab}`, "data-tip": info }, "i") : null),
    el("div", { class: "val" }, val), sub ? el("div", { class: "sub" }, sub) : null);
}

/* ---------- ayuda al pasar el mouse (o al tocar / enfocar con teclado) ---------- */
function mostrarAyuda(btn) {
  const tt = $("tt");
  tt.textContent = btn.dataset.tip;
  tt.hidden = false;
  const r = btn.getBoundingClientRect(), w = tt.offsetWidth, h = tt.offsetHeight;
  const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  const y = r.bottom + 6 + h > innerHeight - 8 ? r.top - h - 6 : r.bottom + 6;
  tt.style.left = x + "px"; tt.style.top = y + "px";
  btn.setAttribute("aria-describedby", "tt");
}
function ocultarAyuda() { $("tt").hidden = true; document.querySelectorAll("[aria-describedby=tt]").forEach((b) => b.removeAttribute("aria-describedby")); }
function iniciarAyuda() {
  const sobre = (e) => e.target.closest && e.target.closest(".info");
  document.addEventListener("mouseover", (e) => { const b = sobre(e); if (b) mostrarAyuda(b); });
  document.addEventListener("mouseout", (e) => { if (sobre(e)) ocultarAyuda(); });
  document.addEventListener("focusin", (e) => { const b = sobre(e); if (b) mostrarAyuda(b); });
  document.addEventListener("focusout", (e) => { if (sobre(e)) ocultarAyuda(); });
  document.addEventListener("click", (e) => { const b = sobre(e); if (b) { e.stopPropagation(); $("tt").hidden ? mostrarAyuda(b) : ocultarAyuda(); } else ocultarAyuda(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") ocultarAyuda(); });
  addEventListener("scroll", ocultarAyuda, { passive: true });
}
function barraProgreso(v, etiqueta = false) {
  return el("div", { class: "progreso", role: "img", "aria-label": `I1 ${pct(v)} de meta 75 %` },
    el("div", { class: "fill", style: `width:${Math.min(100, (v || 0) * 100)}%` }),
    el("div", { class: "meta", style: `left:${META_I1 * 100}%` }, etiqueta ? el("span", {}, "meta 75 %") : null));
}
function renderResumen(rows) {
  const c = contar(rows);
  const hace7 = new Date(CORTE.getTime() - 7 * DIA);
  const cre7 = rows.filter((r) => r.dCre && r.dCre > hace7).length, cer7 = rows.filter((r) => r.dCer && r.dCer > hace7).length;
  const v7 = cre7 - cer7;
  llenar("tilesResumen",
    tile("Incidencias", fmt(c.total), `${fmt(c.P)} le tocan a Sinohydro · ${fmt(c.R)} al revisor`, null,
      "Total de incidencias de la exportación de ACC, con los filtros aplicados. Le tocan a Sinohydro las Abiertas, Pendientes y No aprobadas; al revisor, las Completadas y los Borradores."),
    tile("Cierres que faltan para el 75 %", fmt(c.faltan), null, null,
      "Cuántas incidencias más tendrían que pasar a Cerrada para que el KPI I1 llegue a la meta: 75 % del total menos las cerradas. Si se crean incidencias nuevas, la cifra sube."),
    tile("Variación del saldo (7 días)", (v7 > 0 ? "+" : "") + fmt(v7), `${fmt(cre7)} creadas · ${fmt(cer7)} cerradas`, null,
      "Cuánto cambió el saldo (incidencias no cerradas) en los 7 días anteriores al corte: creadas en esos 7 días menos cerradas en esos 7 días. Negativo = el saldo bajó porque se cerró más de lo que entró. Positivo = el saldo creció."));
  llenar("tilesEstados", ESTADOS.map((e) => tile(e, fmt(c.est[e]), TOCA_TXT[TOCA_EST[e] || "P"], colEst(e),
    DESC_EST[e] || "Estado de ACC que el dashboard no tiene registrado. Se cuenta como de Sinohydro hasta asignarlo.")));

  const ok = c.i1 >= META_I1;
  const porRev = ["ANIN", "Supervisión"].map((rv) => [rv, contar(rows.filter((r) => r.rev === rv))]).filter(([, x]) => x.total);
  llenar("kpiI1", el("div", { class: "kpi" },
    el("div", { class: "hero" }, pct(c.i1)),
    el("div", { class: "estado " + (ok ? "bien" : "mal") }, ok ? "✓ Cumple la meta" : "✕ No cumple la meta", el("span", { style: "color:var(--ink-3);font-weight:400" }, ` · faltan ${fmt(c.faltan)} cierres`)),
    el("div", { style: "margin-top:16px" }, barraProgreso(c.i1, true)),
    el("div", { class: "kpi-rev" }, porRev.flatMap(([rv, x]) => [el("span", {}, rv), barraProgreso(x.i1), el("b", {}, pct(x.i1))]))));

  const revs = ["ANIN", "Supervisión", "Contratista"].filter((rv) => rows.some((r) => r.rev === rv));
  const cuentas = revs.map((rv) => contar(rows.filter((r) => r.rev === rv)));
  grafico("chSituacion", {
    type: "bar",
    data: { labels: revs, datasets: ESTADOS.map((e) => barDs(e, cuentas.map((x) => (x.total ? (100 * x.est[e]) / x.total : 0)), colEst(e), { borderRadius: 0, borderWidth: 2 })) },
    options: baseOpts({
      indexAxis: "y", interaction: { mode: "nearest", intersect: true },
      scales: { x: { stacked: true, max: 100, grid: { color: css("--grid") }, ticks: { color: css("--ink-2"), callback: (v) => v + " %" } }, y: { stacked: true, grid: { display: false }, ticks: { color: css("--ink-2") } } },
      plugins: Object.assign(baseOpts().plugins, {
        tooltip: Object.assign(baseOpts().plugins.tooltip, { callbacks: { label: (it) => ` ${fmt(cuentas[it.dataIndex].est[ESTADOS[it.datasetIndex]])} · ${fmt1(it.raw)} % — ${it.dataset.label}` } }),
        etiquetas: { mostrar: true, valor: (i, j) => cuentas[j].est[ESTADOS[i]] },
      }),
    }),
    plugins: [etiquetas],
  });

  const sem = semanas(rows);
  grafico("chSaldo", {
    type: "line",
    data: { labels: sem.map((s) => etiquetaSemana(s.w)), datasets: [lineDs("Saldo no cerrado", sem.map((s) => s.saldo), css("--ink-2"), { fill: false })] },
    options: baseOpts({ plugins: Object.assign(baseOpts().plugins, { legend: { display: false } }) }),
  });

  renderHistorial();
}
function renderHistorial() {
  const cab = ["Corte", "Total", ...ESTADOS, "I1 total", "I1 ANIN", "I1 Supervisión", "Δ cerradas"];
  const filas = HIST.map((h, i) => {
    const prev = HIST[i - 1];
    const i1 = (x) => (x && x.total ? x.C / x.total : null);
    return el("tr", {}, el("td", {}, fechaHora(new Date(h.corte))), el("td", { class: "num" }, fmt(h.Total.total)),
      ESTADOS.map((e) => el("td", { class: "num" }, h.Total.estados ? fmt(h.Total.estados[e] || 0) : "–")), el("td", { class: "num" }, pct(i1(h.Total))),
      el("td", { class: "num" }, pct(i1(h.ANIN))), el("td", { class: "num" }, pct(i1(h["Supervisión"]))),
      el("td", { class: "num" }, prev ? (h.Total.C - prev.Total.C >= 0 ? "+" : "") + fmt(h.Total.C - prev.Total.C) : "–"));
  });
  llenar("historial", el("div", { class: "scroll" }, el("table", {}, el("thead", {}, el("tr", {}, cab.map((t, i) => el("th", { class: i ? "num" : null }, t)))), el("tbody", {}, filas.reverse()))),
    HIST.length < 2 ? el("p", { class: "nota" }, "Por ahora hay un solo corte. La tabla se irá llenando con cada exportación publicada (no depende de los filtros).") : el("p", { class: "nota" }, "Totales del proyecto; no dependen de los filtros."));
}

/* ---------- 2 Tendencia ---------- */
function renderTendencia(rows) {
  const sem = semanas(rows), labels = sem.map((s) => etiquetaSemana(s.w));
  grafico("chSemanal", {
    type: "bar",
    data: { labels, datasets: [barDs("Creadas", sem.map((s) => s.cre), colEst("Abierta")), barDs("Cerradas", sem.map((s) => s.cer), colEst("Cerrada"))] },
    options: baseOpts(),
  });
  grafico("chAcum", {
    type: "line",
    data: { labels, datasets: [lineDs("Creadas acumuladas", sem.map((s) => s.creAc), colEst("Abierta")), lineDs("Cerradas acumuladas", sem.map((s) => s.cerAc), colEst("Cerrada"))] },
    options: baseOpts(),
  });
  const meses = new Map();
  for (const r of rows) {
    if (r.dCre) { const k = r.creado.slice(0, 7); (meses.get(k) || meses.set(k, { cre: 0, cer: 0 }).get(k)).cre++; }
    if (r.dCer) { const k = r.cerrado.slice(0, 7); (meses.get(k) || meses.set(k, { cre: 0, cer: 0 }).get(k)).cer++; }
  }
  let saldo = 0;
  const filas = [...meses.entries()].sort().map(([k, v]) => {
    saldo += v.cre - v.cer;
    const d = new Date(k + "-01T00:00");
    return el("tr", {}, el("td", {}, d.toLocaleDateString("es-PE", { month: "long", year: "numeric" })), el("td", { class: "num" }, fmt(v.cre)), el("td", { class: "num" }, fmt(v.cer)), el("td", { class: "num" }, fmt(saldo)));
  });
  llenar("tablaMensual", el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "Mes"), el("th", { class: "num" }, "Creadas"), el("th", { class: "num" }, "Cerradas"), el("th", { class: "num" }, "Saldo al cierre del mes"))), el("tbody", {}, filas)),
    el("p", { class: "nota" }, "El último mes va hasta la fecha de corte."));
}

/* ---------- 3 Antigüedad ---------- */
function irDetalle(filtro) {
  Object.assign(state, { doc: "", tsr: "", q: "", sit: "NC", page: 0 }, filtro);
  cambiarTab("detalle");
}
function renderAntiguedad(rows) {
  const nc = rows.filter((r) => r.sit !== "C");
  llenar("tilesAntig",
    tile("Antigüedad promedio de las no cerradas", fmt1(promedio(nc.map((r) => r.edad))) + " d", null, null,
      "Promedio de días desde que se creó cada incidencia hasta la fecha de corte. Solo cuenta las no cerradas (cualquier estado distinto de Cerrada)."),
    tile("Días hasta el cierre (mediana)", fmt1(mediana(rows.filter((r) => r.diasCierre != null).map((r) => r.diasCierre))) + " d", null, null,
      "Días entre la creación y el cierre de las incidencias Cerradas. La mediana es el valor del medio: la mitad se cerró en menos días y la otra mitad en más. Se usa en vez del promedio para que unas pocas incidencias muy lentas no lo distorsionen."),
    tile(`Le toca a Sinohydro > ${UMBRAL_PEND} días`, fmt(nc.filter((r) => r.sit === "P" && r.edad > UMBRAL_PEND).length), "Abierta, Pendiente o No aprobada · umbral provisional", null,
      `Incidencias en Abierta, Pendiente o No aprobada con más de ${UMBRAL_PEND} días desde que se crearon (no desde su último cambio de estado). El umbral es provisional: el contrato fija plazos por entregable, no por incidencia.`),
    tile("No cerradas > 30 días", fmt(nc.filter((r) => r.edad > 30).length), null, null,
      "Incidencias en cualquier estado distinto de Cerrada con más de 30 días desde que se crearon."));
  const porRango = (e) => RANGOS.map(([lab]) => nc.filter((r) => r.rango === lab && r.estado === e).length);
  grafico("chRangos", {
    type: "bar",
    data: { labels: RANGOS.map((x) => x[0]), datasets: estadosAbiertos().map((e) => barDs(e, porRango(e), colEst(e), { borderWidth: 2, borderRadius: 0 })) },
    options: baseOpts({ scales: { x: { stacked: true, grid: { display: false }, ticks: { color: css("--ink-2") } }, y: { stacked: true, beginAtZero: true, grid: { color: css("--grid") }, ticks: { color: css("--ink-2"), precision: 0 } } },
      plugins: Object.assign(baseOpts().plugins, { etiquetas: { mostrar: true } }) }),
    plugins: [etiquetas],
  });
  const top = [...nc].sort((a, b) => b.edad - a.edad || a.n - b.n).slice(0, 25);
  const maxE = top.length ? top[0].edad : 1;
  llenar("tablaAntiguas", el("table", {},
    el("thead", {}, el("tr", {}, ["ID", "Título", "Revisor", "Estado", "Documento", "Creado por", "Creado el", "Antigüedad (d)"].map((t, i) => el("th", { class: i === 7 ? "num" : null }, t)))),
    el("tbody", {}, top.map((r) => el("tr", { class: "clic", tabindex: "0", title: "Ver documento en Detalle", onclick: () => irDetalle({ doc: r.docCorto || r.doc }), onkeydown: (e) => e.key === "Enter" && irDetalle({ doc: r.docCorto || r.doc }) },
      el("td", {}, enlaceAcc(urlIncidencia(r), r.id, "Abrir la incidencia en ACC")), el("td", {}, r.titulo), el("td", {}, r.rev), el("td", {}, chipEstado(r)),
      el("td", {}, enlaceAcc(urlDocumento(r), r.docCorto || r.doc || "–", "Abrir el documento en ACC con la marca de la incidencia")), el("td", {}, r.creador || "–"), el("td", {}, fecha(r.dCre)),
      el("td", { class: "num" }, el("div", { class: "barra-celda" }, el("i", { style: `width:${Math.max(2, (90 * r.edad) / maxE)}px` }), fmt1(r.edad))))))));
}

/* ---------- 4 Especialidad ---------- */
function renderEspecialidad(rows) {
  const grupos = new Map();
  for (const r of rows) { const k = r.tsr || "(sin tipo)"; (grupos.get(k) || grupos.set(k, []).get(k)).push(r); }
  const esp = [...grupos.entries()].map(([k, rs]) => ({ k, c: contar(rs), med: mediana(rs.filter((r) => r.diasCierre != null).map((r) => r.diasCierre)) }))
    .sort((a, b) => b.c.total - a.c.total);
  const maxCelda = Math.max(1, ...esp.flatMap((e) => ESTADOS.map((x) => e.c.est[x])));
  const seq = (v) => { if (!v) return "transparent"; const i = Math.min(4, Math.floor((4 * v) / maxCelda + 0.5)); return css(`--seq-${i}`); };
  const tinta = (v) => (v && Math.floor((4 * v) / maxCelda + 0.5) >= 3 ? "#ffffff" : css("--ink"));
  llenar("matrizEsp", el("table", {},
    el("thead", {}, el("tr", {}, el("th", {}, "Tipo"), ESTADOS.map((x) => el("th", { class: "num", title: x }, el("span", { class: "sit" }, key(colEst(x)), CORTO[x] || x))), el("th", { class: "num" }, "Total"), el("th", { class: "num", title: "Mediana de días hasta el cierre" }, "Med. (d)"))),
    el("tbody", {}, esp.map((e) => el("tr", { class: "clic", tabindex: "0", onclick: () => irDetalle({ tsr: e.k, sit: "" }), onkeydown: (ev) => ev.key === "Enter" && irDetalle({ tsr: e.k, sit: "" }) },
      el("td", { style: "white-space:nowrap" }, e.k), ESTADOS.map((x) => el("td", { class: "heat", style: `background:${seq(e.c.est[x])};color:${tinta(e.c.est[x])}` }, e.c.est[x] ? fmt(e.c.est[x]) : "")),
      el("td", { class: "num" }, fmt(e.c.total)), el("td", { class: "num" }, fmt1(e.med)))))));

  const docs = new Map();
  for (const r of rows) if (r.sit !== "C") { const k = r.docCorto || r.doc || "(sin documento)"; const d = docs.get(k) || docs.set(k, { est: {}, nc: 0, doc: r.doc }).get(k); d.est[r.estado] = (d.est[r.estado] || 0) + 1; d.nc++; }
  const top = [...docs.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.nc - a.nc).slice(0, 15);
  grafico("chDocs", {
    type: "bar",
    data: { labels: top.map((d) => d.k), datasets: estadosAbiertos().map((e) => barDs(e, top.map((d) => d.est[e] || 0), colEst(e), { borderWidth: 2, borderRadius: 0 })) },
    options: baseOpts({
      indexAxis: "y", interaction: { mode: "index", intersect: false, axis: "y" },
      scales: { x: { stacked: true, beginAtZero: true, grid: { color: css("--grid") }, ticks: { color: css("--ink-2"), precision: 0 } }, y: { stacked: true, grid: { display: false }, ticks: { color: css("--ink-2"), autoSkip: false, font: { size: 11 } } } },
      onClick: (_e, items, chart) => { const i = items.length ? items[0].index : null; if (i != null) irDetalle({ doc: chart.data.labels[i] }); },
      onHover: (e, items) => { e.native.target.style.cursor = items.length ? "pointer" : "default"; },
      plugins: Object.assign(baseOpts().plugins, { tooltip: Object.assign(baseOpts().plugins.tooltip, { callbacks: { title: (it) => top[it[0].dataIndex].doc || it[0].label, footer: (it) => `No cerradas: ${fmt(top[it[0].dataIndex].nc)} · clic → Detalle` } }), etiquetas: { mostrar: true } }),
    }),
    plugins: [etiquetas],
  });

  const pts = esp.filter((e) => e.c.total >= 10 && e.med != null);
  const maxNc = Math.max(1, ...pts.map((e) => e.c.NC));
  grafico("chScatter", {
    type: "bubble",
    data: { datasets: [{ label: "Especialidad", data: pts.map((e) => ({ x: e.c.total, y: e.med, r: 4 + 14 * Math.sqrt(e.c.NC / maxNc), k: e.k, nc: e.c.NC })),
      backgroundColor: css("--accent") + "55", borderColor: css("--accent"), borderWidth: 2, hoverBorderWidth: 3 }] },
    options: baseOpts({
      interaction: { mode: "nearest", intersect: false },
      scales: { x: { title: { display: true, text: "Incidencias", color: css("--ink-2") }, grid: { color: css("--grid") }, ticks: { color: css("--ink-2") }, beginAtZero: true },
        y: { title: { display: true, text: "Mediana de días hasta el cierre", color: css("--ink-2") }, grid: { color: css("--grid") }, ticks: { color: css("--ink-2") }, beginAtZero: true } },
      onClick: (_e, items) => { if (items.length) irDetalle({ tsr: pts[items[0].index].k, sit: "" }); },
      plugins: Object.assign(baseOpts().plugins, { legend: { display: false },
        tooltip: Object.assign(baseOpts().plugins.tooltip, { callbacks: { title: (it) => it[0].raw.k, label: (it) => ` ${fmt(it.raw.x)} incidencias · mediana ${fmt1(it.raw.y)} d · ${fmt(it.raw.nc)} no cerradas` } }) }),
    }),
  });
}

/* ---------- 5 Detalle ---------- */
const POR_PAGINA = 50;
function filasDetalle(rows) {
  const q = state.q.trim().toLowerCase();
  return rows.filter((r) =>
    (!state.doc || r.docCorto === state.doc || r.doc === state.doc) && (!state.tsr || (r.tsr || "(sin tipo)") === state.tsr) &&
    (!state.sit || (state.sit === "NC" ? r.sit !== "C" : ["P", "R", "C"].includes(state.sit) ? r.sit === state.sit : r.estado === state.sit)) && (!q || r.texto.includes(q)))
    .sort((a, b) => (b.edad ?? -1) - (a.edad ?? -1) || b.n - a.n);
}
function renderDetalle(rows) {
  $("buscar").value = state.q;
  $("fSit").value = state.sit;
  const chips = [];
  if (state.doc) chips.push(["Documento", state.doc, "doc"]);
  if (state.tsr) chips.push(["Tipo", state.tsr, "tsr"]);
  const docRow = state.doc ? DATA.find((r) => (r.docCorto === state.doc || r.doc === state.doc) && r.dl != null) : null;
  llenar("chipsDetalle", chips.map(([l, v, k]) => el("span", { class: "chip" }, `${l}: ${v}`,
    k === "doc" && docRow ? enlaceAcc(urlDocumento(docRow, false), "abrir en ACC", "Abrir el documento en ACC") : null, el("button", { type: "button", "aria-label": `Quitar filtro ${l}`, onclick: () => { state[k] = ""; state.page = 0; render(); } }, "×"))));
  const fs = filasDetalle(rows);
  const pags = Math.max(1, Math.ceil(fs.length / POR_PAGINA));
  state.page = Math.min(state.page, pags - 1);
  const vista = fs.slice(state.page * POR_PAGINA, (state.page + 1) * POR_PAGINA);
  $("cuentaDetalle").textContent = `${fmt(fs.length)} incidencias · ordenadas por antigüedad (las no cerradas primero).`;
  llenar("tablaDetalle", el("table", {},
    el("thead", {}, el("tr", {}, ["ID", "Título", "Descripción", "Estado", "Revisor", "Documento", "Creado por", "Creado el", "Antig. (d)", "Comentarios"].map((t, i) => el("th", { class: i === 8 ? "num" : null }, t)))),
    el("tbody", {}, vista.map((r) => el("tr", {},
      el("td", {}, enlaceAcc(urlIncidencia(r), r.id, "Abrir la incidencia en ACC")), el("td", {}, r.titulo), el("td", { class: "desc" }, r.desc || "–"), el("td", {}, chipEstado(r)),
      el("td", {}, r.rev), el("td", {}, enlaceAcc(urlDocumento(r), r.docCorto || r.doc || "–", (r.doc || "") + " · abrir en ACC con la marca de la incidencia")), el("td", {}, r.creador || "–"), el("td", {}, fecha(r.dCre)),
      el("td", { class: "num" }, r.edad == null ? "–" : fmt1(r.edad)), el("td", { class: "coment" }, r.coment || ""))))));
  llenar("paginador",
    el("button", { type: "button", class: "boton", disabled: state.page === 0 ? "" : null, onclick: () => { state.page--; render(); } }, "‹ Anterior"),
    `Página ${state.page + 1} de ${pags}`,
    el("button", { type: "button", class: "boton", disabled: state.page >= pags - 1 ? "" : null, onclick: () => { state.page++; render(); } }, "Siguiente ›"));
}
function descargarCsv() {
  const fs = filasDetalle(filtrados());
  const cols = [["ID", "id"], ["Título", "titulo"], ["Estado", "estado"], ["Le toca a", (r) => ({ P: "Sinohydro", R: "Revisor", C: "–" })[r.sit]], ["Revisor", "rev"], ["Tipo", "tipo"], ["Documento", "doc"],
    ["Entregable", "entregable"], ["Tipo de revisión", "tipoRev"], ["Creado por", "creador"], ["Creado el", "creado"], ["Cerrado el", "cerrado"],
    ["Antigüedad (d)", (r) => (r.edad == null ? "" : r.edad.toFixed(1))], ["Causa raíz", "causa"], ["Criticidad", "crit"], ["Descripción", "desc"], ["Comentarios", "coment"],
    ["Enlace incidencia ACC", (r) => urlIncidencia(r)], ["Enlace documento ACC", (r) => urlDocumento(r)]];
  const esc = (v) => { const s = v == null ? "" : String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const txt = [cols.map((c) => c[0]).join(";"), ...fs.map((r) => cols.map(([, f]) => esc(typeof f === "function" ? f(r) : r[f])).join(";"))].join("\r\n");
  const a = el("a", { href: URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv;charset=utf-8" })), download: `incidencias_LI114_${META.corte.slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
}

/* ---------- 6 Calidad ---------- */
function renderCalidad(rows) {
  const campos = [["Fecha de vencimiento", (r) => r.venc], ["Criticidad", (r) => r.crit], ["Causa raíz", (r) => r.causa], ["Entregable", (r) => r.entregable]];
  const p = (rs, f) => (rs.length ? rs.filter(f).length / rs.length : null);
  llenar("tilesCalidad", campos.map(([l, f]) => { const v = p(rows, f); return tile(`% con ${l.toLowerCase()}`, pct(v), v < 0.5 ? "✕ insuficiente" : "✓ aceptable", null,
    `Porcentaje de incidencias que tienen el campo «${l}» lleno en ACC. Menos de 50 % se marca como insuficiente: las medidas que dependen de ese campo no son representativas.`); }));
  const revs = ["ANIN", "Supervisión"].filter((rv) => rows.some((r) => r.rev === rv));
  llenar("tablaCalidad", el("table", {},
    el("thead", {}, el("tr", {}, el("th", {}, "Campo"), revs.map((rv) => el("th", { class: "num" }, rv)))),
    el("tbody", {}, campos.map(([l, f]) => el("tr", {}, el("td", {}, l), revs.map((rv) => { const v = p(rows.filter((r) => r.rev === rv), f);
      return el("td", { class: "num" }, el("div", { class: "barra-celda" }, el("i", { style: `width:${Math.max(2, 90 * (v || 0))}px;background:var(--ink-3)` }), pct(v))); }))))));
}

/* ---------- navegación y render ---------- */
function opciones(id, campo, etiqueta) {
  const vals = [...new Set(DATA.map((r) => r[campo] || "(sin dato)"))].sort((a, b) => a.localeCompare(b, "es"));
  llenar(id, el("option", { value: "" }, etiqueta), vals.map((v) => el("option", { value: v }, v)));
}
function cambiarTab(t) { state.tab = t; render(); window.scrollTo({ top: 0 }); }
function render() {
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
  document.querySelectorAll(".pagina").forEach((p) => { p.hidden = p.id !== "p-" + state.tab; });
  $("fRev").value = state.rev; $("fEnt").value = state.ent; $("fTrv").value = state.trv; $("fFase").value = state.fase;
  const rows = filtrados();
  ({ resumen: renderResumen, tendencia: renderTendencia, antiguedad: renderAntiguedad, especialidad: renderEspecialidad, detalle: renderDetalle, calidad: renderCalidad }[state.tab] || renderResumen)(rows);
  escribirHash();
}

async function iniciar() {
  try {
    const [d, h] = await Promise.all([fetch("data/incidencias.json", { cache: "no-cache" }).then((r) => r.json()), fetch("data/historial.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : [])).catch(() => [])]);
    META = d.meta; HIST = h; CORTE = new Date(META.corte);
    DATA = preparar(d.incidencias);
    const extra = [...new Set(DATA.map((r) => r.estado))].filter((e) => e && !ESTADOS.includes(e)).sort();
    ESTADOS = [...ESTADOS.slice(0, -1), ...extra, "Cerrada"]; // un estado nuevo de ACC aparece igual, en gris
  } catch (e) {
    $("corte").textContent = "No se pudieron cargar los datos (data/incidencias.json). Si abriste el archivo localmente, usa un servidor: python -m http.server";
    return;
  }
  $("corte").textContent = `Corte ACC: ${fechaHora(CORTE)} (hora Lima) · ${fmt(META.filas)} incidencias`;
  $("archivo").textContent = META.archivo;
  Chart.defaults.font.family = "Segoe UI, system-ui, -apple-system, Roboto, sans-serif";
  llenar("fSit", el("option", { value: "" }, "Todos"), el("option", { value: "NC" }, "No cerradas"),
    el("optgroup", { label: "A quién le toca" }, el("option", { value: "P" }, "Sinohydro (Abierta, Pendiente, No aprobada)"), el("option", { value: "R" }, "Revisor (Borrador, Completada)")),
    el("optgroup", { label: "Estado en ACC" }, ESTADOS.map((e) => el("option", { value: e }, e))));
  opciones("fRev", "rev", "Todos"); opciones("fEnt", "entregable", "Todos"); opciones("fTrv", "tipoRev", "Todos"); opciones("fFase", "fase", "Todas");
  for (const [id, k] of [["fRev", "rev"], ["fEnt", "ent"], ["fTrv", "trv"], ["fFase", "fase"]]) $(id).addEventListener("change", (e) => { state[k] = e.target.value; state.page = 0; render(); });
  $("btnLimpiar").addEventListener("click", () => { Object.assign(state, { rev: "", ent: "", trv: "", fase: "", q: "", sit: "", doc: "", tsr: "", page: 0 }); render(); });
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => cambiarTab(b.dataset.tab)));
  let t; $("buscar").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; state.page = 0; render(); $("buscar").focus(); }, 250); });
  $("fSit").addEventListener("change", (e) => { state.sit = e.target.value; state.page = 0; render(); });
  $("btnCsv").addEventListener("click", descargarCsv);
  iniciarAyuda();
  $("btnTema").addEventListener("click", () => {
    const oscuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = oscuro ? "light" : "dark";
    try { localStorage.setItem("tema", document.documentElement.dataset.theme); } catch (_) { /* sin almacenamiento */ }
    render();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => render());
  window.addEventListener("hashchange", () => { leerHash(); render(); });
  leerHash();
  render();
}

try { const t = localStorage.getItem("tema"); if (t) document.documentElement.dataset.theme = t; } catch (_) { /* sin almacenamiento */ }
document.addEventListener("DOMContentLoaded", iniciar);
