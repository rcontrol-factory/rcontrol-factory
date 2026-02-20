/* FILE: /app/js/engine/template_registry.js
   RControl Factory — template_registry.js — v1.1 (add timesheet-lite)
   - Mantém pwa-base
   - Adiciona template: timesheet-lite (timesheet semanal + histórico mensal + export PDF via print)
*/
(() => {
  "use strict";

  const TemplateRegistry = {
    _templates: {},

    add(id, tpl) {
      if (!id) return false;
      this._templates[id] = Object.assign({ id }, tpl || {});
      return true;
    },

    get(id) {
      return this._templates[id] || null;
    },

    list() {
      return Object.keys(this._templates).sort();
    }
  };

  // ✅ Template base mínimo (pwa-base)
  TemplateRegistry.add("pwa-base", {
    title: "PWA Base",
    files(spec) {
      const name = (spec && spec.name) ? String(spec.name) : "Meu App";
      const theme = (spec && spec.themeColor) ? String(spec.themeColor) : "#0b1020";
      return {
        "index.html": `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>${name}</title>
  <meta name="theme-color" content="${theme}" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <div id="app">
    <h1>${name}</h1>
    <p>App criado pela RCF.</p>
  </div>
  <script src="./app.js"></script>
</body>
</html>`,

        "styles.css": `:root{color-scheme:dark;}
body{margin:0;padding:18px;font-family:system-ui;background:#0b1020;color:#fff}
#app{max-width:900px;margin:0 auto}`,

        "app.js": `console.log("RCF child app: ${name}");`
      };
    }
  });

  // ✅ Template: Timesheet Lite (semana + mês + PDF via print)
  TemplateRegistry.add("timesheet-lite", {
    title: "Timesheet Lite (Horas + PDF)",
    files(spec) {
      const appName = (spec && spec.name) ? String(spec.name) : "Timesheet Lite";
      const theme = (spec && spec.themeColor) ? String(spec.themeColor) : "#0b1020";
      const owner = (spec && (spec.ownerName || spec.userName)) ? String(spec.ownerName || spec.userName) : "Usuário";

      return {
        "index.html": `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>${appName}</title>
  <meta name="theme-color" content="${theme}" />
  <link rel="manifest" href="./manifest.json" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <header class="top">
    <div class="brand">
      <div class="dot"></div>
      <div class="t">
        <div class="title">${appName}</div>
        <div class="sub">Horas semanais • histórico mensal • PDF</div>
      </div>
    </div>
    <button class="btn ghost" id="btnSettings" type="button">⚙️</button>
  </header>

  <main class="wrap">
    <section class="card">
      <div class="row">
        <div class="col">
          <div class="label">Usuário</div>
          <div class="big" id="who">—</div>
        </div>
        <div class="col right">
          <div class="label">Semana</div>
          <div class="row" style="justify-content:flex-end;gap:10px">
            <button class="btn ghost" id="btnPrevWeek" type="button">◀</button>
            <div class="big" id="weekLabel">—</div>
            <button class="btn ghost" id="btnNextWeek" type="button">▶</button>
          </div>
        </div>
      </div>

      <div class="hr"></div>

      <div class="row" style="gap:10px;flex-wrap:wrap">
        <div class="field">
          <div class="label">Data</div>
          <input id="inDate" type="date" />
        </div>
        <div class="field">
          <div class="label">Início</div>
          <input id="inStart" type="time" />
        </div>
        <div class="field">
          <div class="label">Fim</div>
          <input id="inEnd" type="time" />
        </div>
        <div class="field">
          <div class="label">Break (min)</div>
          <input id="inBreak" type="number" inputmode="numeric" min="0" step="5" placeholder="0" />
        </div>
        <div class="field" style="flex:1;min-width:220px">
          <div class="label">Nota/Serviço (opcional)</div>
          <input id="inNote" type="text" placeholder="ex: porta, pintura, limpeza..." />
        </div>
      </div>

      <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap">
        <button class="btn ok" id="btnAdd" type="button">+ Adicionar</button>
        <button class="btn ghost" id="btnClearWeek" type="button">Limpar semana</button>
        <div class="spacer"></div>
        <div class="pill" id="weekTotal">Total: 0.00h</div>
      </div>
    </section>

    <section class="card">
      <div class="row">
        <div class="big">Entradas da semana</div>
        <div class="spacer"></div>
        <button class="btn ghost" id="btnPDF" type="button">Gerar PDF</button>
      </div>
      <div class="hint">Dica iPhone: ao abrir o “PDF”, toque em compartilhar → imprimir → salvar PDF.</div>
      <div class="list" id="listWeek"></div>
    </section>

    <section class="card">
      <div class="row">
        <div class="big">Histórico mensal</div>
        <div class="spacer"></div>
        <select id="monthPick"></select>
      </div>
      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap">
        <div class="pill" id="monthTotal">Mês: 0.00h</div>
        <div class="pill" id="monthWeeks">Semanas: 0</div>
      </div>
      <div class="list" id="listMonth"></div>
    </section>

    <section class="card" id="settings" style="display:none">
      <div class="row">
        <div class="big">Configurações</div>
        <div class="spacer"></div>
        <button class="btn danger" id="btnCloseSettings" type="button">Fechar</button>
      </div>

      <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:10px">
        <div class="field" style="flex:1;min-width:220px">
          <div class="label">Nome do usuário (aparece no PDF)</div>
          <input id="cfgOwner" type="text" />
        </div>
        <div class="field" style="flex:1;min-width:220px">
          <div class="label">Empresa/Equipe (opcional)</div>
          <input id="cfgTeam" type="text" placeholder="ex: Santana Services" />
        </div>
      </div>

      <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:10px">
        <div class="field" style="flex:1;min-width:220px">
          <div class="label">Pagamento por hora (opcional)</div>
          <input id="cfgRate" type="number" inputmode="decimal" min="0" step="0.5" placeholder="ex: 35" />
        </div>
        <div class="field" style="flex:1;min-width:220px">
          <div class="label">Moeda</div>
          <select id="cfgCurrency">
            <option value="USD">USD</option>
            <option value="BRL">BRL</option>
          </select>
        </div>
      </div>

      <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap">
        <button class="btn ok" id="btnSaveCfg" type="button">Salvar</button>
        <button class="btn ghost" id="btnExportJSON" type="button">Exportar backup (JSON)</button>
        <button class="btn ghost" id="btnImportJSON" type="button">Importar backup</button>
        <button class="btn danger" id="btnNuke" type="button">Apagar tudo</button>
      </div>

      <pre class="mono small" id="out" style="margin-top:10px">Pronto.</pre>
    </section>
  </main>

  <script src="./app.js"></script>
</body>
</html>`,

        "styles.css": `:root{
  color-scheme:dark;
  --bg:#0b1020;
  --card:rgba(255,255,255,.06);
  --line:rgba(255,255,255,.12);
  --txt:#fff;
  --mut:rgba(255,255,255,.72);
  --ok:#1fbf6b;
  --danger:#d9534f;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--txt);font-family:system-ui,-apple-system,Segoe UI,Roboto}
.top{
  position:sticky;top:0;z-index:20;
  display:flex;align-items:center;gap:12px;
  padding:14px 14px 12px;
  background:linear-gradient(180deg, rgba(11,16,32,.98), rgba(11,16,32,.78));
  border-bottom:1px solid rgba(255,255,255,.08);
}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.dot{width:10px;height:10px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px rgba(31,191,107,.18)}
.title{font-weight:800;letter-spacing:.2px}
.sub{font-size:12px;color:var(--mut)}
.t{min-width:0}
.wrap{max-width:980px;margin:0 auto;padding:14px}
.card{
  background:var(--card);
  border:1px solid rgba(255,255,255,.10);
  border-radius:16px;
  padding:14px;
  margin:12px 0;
  backdrop-filter: blur(6px);
}
.row{display:flex;align-items:center;gap:12px}
.col{display:flex;flex-direction:column;gap:6px;min-width:0}
.right{text-align:right}
.spacer{flex:1}
.big{font-size:18px;font-weight:800}
.label{font-size:12px;color:var(--mut)}
.hint{font-size:12px;color:var(--mut);margin-top:6px}
.hr{height:1px;background:rgba(255,255,255,.10);margin:12px 0}
.field{display:flex;flex-direction:column;gap:6px;min-width:120px}
input,select{
  width:100%;
  padding:10px 12px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.14);
  background:rgba(0,0,0,.22);
  color:var(--txt);
  outline:none;
}
.btn{
  border:0;
  padding:10px 14px;
  border-radius:14px;
  background:rgba(255,255,255,.10);
  color:var(--txt);
  font-weight:700;
}
.btn.ok{background:rgba(31,191,107,.22);border:1px solid rgba(31,191,107,.35)}
.btn.danger{background:rgba(217,83,79,.20);border:1px solid rgba(217,83,79,.35)}
.btn.ghost{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}
.pill{
  padding:8px 12px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.14);
  background:rgba(0,0,0,.18);
  font-weight:800;
  white-space:nowrap;
}
.list{margin-top:10px;display:flex;flex-direction:column;gap:10px}
.item{
  border:1px solid rgba(255,255,255,.10);
  background:rgba(0,0,0,.18);
  border-radius:14px;
  padding:12px;
}
.item .topline{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.item .meta{font-size:12px;color:var(--mut);margin-top:6px}
.item .actions{display:flex;gap:10px;margin-top:10px;flex-wrap:wrap}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
.small{font-size:12px}
@media (max-width:520px){
  .wrap{padding:12px}
  .big{font-size:16px}
}`,

        "manifest.json": `{
  "name": "${appName}",
  "short_name": "Timesheet",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "${theme}",
  "theme_color": "${theme}",
  "icons": []
}`,

        "sw.js": `self.addEventListener("install", (e)=>{ self.skipWaiting(); });
self.addEventListener("activate", (e)=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e)=>{ /* offline-lite */ });`,

        "app.js": `/* Timesheet Lite — v1.0 (offline localStorage) */
(() => {
  "use strict";

  const LS = {
    cfg: "ts:cfg",
    weeks: "ts:weeks" // map { [weekKey]: { entries:[], updatedAt } }
  };

  const $ = (id) => document.getElementById(id);

  function safeParse(s, fb) { try { return JSON.parse(s); } catch { return fb; } }
  function safeStr(o) { try { return JSON.stringify(o); } catch { return "{}"; } }

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return yyyy + "-" + mm + "-" + dd;
  }

  function pad2(n){ return String(n).padStart(2,"0"); }

  function toMinutes(hhmm) {
    if (!hhmm) return null;
    const s = String(hhmm);
    const parts = s.split(":");
    if (parts.length < 2) return null;
    const h = Number(parts[0] || 0);
    const m = Number(parts[1] || 0);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h*60 + m;
  }

  function hoursBetween(start, end, breakMin) {
    const a = toMinutes(start);
    const b = toMinutes(end);
    if (a == null || b == null) return 0;
    let diff = b - a;
    if (diff < 0) diff = 0;
    diff -= (Number(breakMin) || 0);
    if (diff < 0) diff = 0;
    return diff / 60;
  }

  // ISO week helpers (Mon-Sun)
  function isoWeekKey(dateObj) {
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    const year = d.getUTCFullYear();
    return year + "-W" + pad2(weekNo);
  }

  function weekStartEnd(weekKey) {
    // weekKey: YYYY-W##
    const m = String(weekKey).match(/^(\\d{4})-W(\\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const week = Number(m[2]);
    // ISO week -> Monday
    const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const dow = simple.getUTCDay();
    const ISOweekStart = new Date(simple);
    if (dow <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    else ISOweekStart.setUTCDate(simple.getUTCDate() + (8 - dow));

    const start = new Date(ISOweekStart);
    const end = new Date(ISOweekStart);
    end.setUTCDate(start.getUTCDate() + 6);

    const fmt = (x) => x.getUTCFullYear() + "-" + pad2(x.getUTCMonth()+1) + "-" + pad2(x.getUTCDate());
    return { start: fmt(start), end: fmt(end) };
  }

  function loadCfg() {
    const fb = { ownerName: "${owner}", team: "", rate: "", currency: "USD" };
    return Object.assign(fb, safeParse(localStorage.getItem(LS.cfg) || "{}", {}));
  }

  function saveCfg(cfg) {
    try { localStorage.setItem(LS.cfg, safeStr(cfg)); } catch {}
  }

  function loadWeeks() {
    return safeParse(localStorage.getItem(LS.weeks) || "{}", {});
  }

  function saveWeeks(map) {
    try { localStorage.setItem(LS.weeks, safeStr(map || {})); } catch {}
  }

  function getWeek(weekKey) {
    const all = loadWeeks();
    const w = all[weekKey] || { entries: [], updatedAt: "" };
    return { all, week: w };
  }

  function setWeek(weekKey, weekObj, all) {
    const map = all || loadWeeks();
    map[weekKey] = weekObj;
    saveWeeks(map);
  }

  function weekTotalHours(entries) {
    return (entries || []).reduce((a, e) => a + (Number(e.hours) || 0), 0);
  }

  function moneyFmt(currency, n) {
    const v = Number(n) || 0;
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(v);
    } catch {
      return currency + " " + v.toFixed(2);
    }
  }

  // UI state
  let cfg = loadCfg();
  let currentWeek = isoWeekKey(new Date());

  function setOut(t) {
    const el = $("out");
    if (el) el.textContent = String(t ?? "");
  }

  function renderHeader() {
    $("who").textContent = cfg.ownerName || "—";
    const se = weekStartEnd(currentWeek);
    $("weekLabel").textContent = se ? (currentWeek + " • " + se.start + " → " + se.end) : currentWeek;
  }

  function renderWeek() {
    const { all, week } = getWeek(currentWeek);
    const list = $("listWeek");
    list.innerHTML = "";

    const entries = Array.isArray(week.entries) ? week.entries.slice() : [];
    // ordena por data + start
    entries.sort((a,b) => String(a.date||"").localeCompare(String(b.date||"")) || String(a.start||"").localeCompare(String(b.start||"")));

    const total = weekTotalHours(entries);
    $("weekTotal").textContent = "Total: " + total.toFixed(2) + "h";

    if (!entries.length) {
      list.innerHTML = '<div class="hint">Sem entradas nesta semana.</div>';
      return;
    }

    for (const e of entries) {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = \`
        <div class="topline">
          <div class="pill">\${e.date || "—"}</div>
          <div class="pill">\${(e.start||"--:--")} → \${(e.end||"--:--")}</div>
          <div class="pill">\${(Number(e.breakMin)||0)}min break</div>
          <div class="spacer"></div>
          <div class="pill"><b>\${(Number(e.hours)||0).toFixed(2)}h</b></div>
        </div>
        <div class="meta">\${e.note ? ("Nota: " + escapeHtml(e.note)) : ""}</div>
        <div class="actions">
          <button class="btn ghost" type="button" data-act="edit">Editar</button>
          <button class="btn danger" type="button" data-act="del">Apagar</button>
        </div>\`;

      div.querySelector('[data-act="del"]').addEventListener("click", () => {
        const ok = confirm("Apagar esta entrada?");
        if (!ok) return;
        const { all: a2, week: w2 } = getWeek(currentWeek);
        w2.entries = (w2.entries || []).filter(x => x.id !== e.id);
        w2.updatedAt = new Date().toISOString();
        setWeek(currentWeek, w2, a2);
        renderWeek();
        renderMonth();
      });

      div.querySelector('[data-act="edit"]').addEventListener("click", () => {
        $("inDate").value = e.date || "";
        $("inStart").value = e.start || "";
        $("inEnd").value = e.end || "";
        $("inBreak").value = String(Number(e.breakMin)||0);
        $("inNote").value = e.note || "";
        // marca id pra substituir no add
        $("btnAdd").setAttribute("data-edit-id", e.id);
        $("btnAdd").textContent = "Salvar edição";
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      list.appendChild(div);
    }
  }

  function monthOptions() {
    const now = new Date();
    const opts = [];
    for (let i=0;i<14;i++){
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const key = d.getFullYear() + "-" + pad2(d.getMonth()+1);
      const label = d.toLocaleDateString(undefined, { year:"numeric", month:"long" });
      opts.push({ key, label });
    }
    return opts;
  }

  function renderMonthPick() {
    const sel = $("monthPick");
    const opts = monthOptions();
    sel.innerHTML = "";
    for (const o of opts) {
      const opt = document.createElement("option");
      opt.value = o.key;
      opt.textContent = o.label;
      sel.appendChild(opt);
    }
    sel.value = opts[0].key;
  }

  function renderMonth() {
    const sel = $("monthPick");
    const monthKey = sel ? String(sel.value || "") : "";
    const list = $("listMonth");
    list.innerHTML = "";

    const all = loadWeeks();
    const keys = Object.keys(all || {});
    const rows = [];

    for (const wk of keys) {
      const se = weekStartEnd(wk);
      if (!se) continue;
      // week belongs to month if start OR end in that month
      const inMonth =
        String(se.start).slice(0,7) === monthKey ||
        String(se.end).slice(0,7) === monthKey;

      if (!inMonth) continue;

      const entries = (all[wk] && Array.isArray(all[wk].entries)) ? all[wk].entries : [];
      const totalH = weekTotalHours(entries);
      rows.push({ wk, se, totalH, count: entries.length });
    }

    rows.sort((a,b) => String(a.wk).localeCompare(String(b.wk)));

    const monthTotal = rows.reduce((a,r)=>a+(Number(r.totalH)||0),0);
    $("monthTotal").textContent = "Mês: " + monthTotal.toFixed(2) + "h";
    $("monthWeeks").textContent = "Semanas: " + rows.length;

    if (!rows.length) {
      list.innerHTML = '<div class="hint">Sem dados neste mês.</div>';
      return;
    }

    for (const r of rows) {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = \`
        <div class="topline">
          <div class="pill">\${r.wk}</div>
          <div class="pill">\${r.se.start} → \${r.se.end}</div>
          <div class="spacer"></div>
          <div class="pill"><b>\${r.totalH.toFixed(2)}h</b></div>
        </div>
        <div class="meta">Entradas: \${r.count}</div>\`;
      div.addEventListener("click", () => {
        currentWeek = r.wk;
        renderHeader();
        renderWeek();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      list.appendChild(div);
    }
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  }

  function addOrEdit() {
    const date = String($("inDate").value || "").trim();
    const start = String($("inStart").value || "").trim();
    const end = String($("inEnd").value || "").trim();
    const breakMin = Number($("inBreak").value || 0) || 0;
    const note = String($("inNote").value || "").trim();

    if (!date) { alert("Selecione a data."); return; }
    if (!start || !end) { alert("Preencha início e fim."); return; }

    const h = hoursBetween(start, end, breakMin);
    if (h <= 0) { alert("Horas inválidas (fim deve ser maior que início, e break não pode zerar tudo)."); return; }

    const { all, week } = getWeek(currentWeek);
    const arr = Array.isArray(week.entries) ? week.entries : [];

    const editId = $("btnAdd").getAttribute("data-edit-id") || "";

    if (editId) {
      const idx = arr.findIndex(x => x && x.id === editId);
      if (idx >= 0) {
        arr[idx] = Object.assign({}, arr[idx], { date, start, end, breakMin, note, hours: h });
      }
      $("btnAdd").removeAttribute("data-edit-id");
      $("btnAdd").textContent = "+ Adicionar";
    } else {
      arr.push({ id: "e_" + Date.now(), date, start, end, breakMin, note, hours: h });
    }

    week.entries = arr;
    week.updatedAt = new Date().toISOString();
    setWeek(currentWeek, week, all);

    // reset inputs (mantém data)
    $("inStart").value = "";
    $("inEnd").value = "";
    $("inBreak").value = "";
    $("inNote").value = "";

    renderWeek();
    renderMonth();
  }

  function clearWeek() {
    const ok = confirm("Limpar TODAS as entradas desta semana?");
    if (!ok) return;
    const { all, week } = getWeek(currentWeek);
    week.entries = [];
    week.updatedAt = new Date().toISOString();
    setWeek(currentWeek, week, all);
    renderWeek();
    renderMonth();
  }

  function shiftWeek(delta) {
    // delta in weeks
    const se = weekStartEnd(currentWeek);
    if (!se) return;
    const d = new Date(se.start + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + (delta * 7));
    currentWeek = isoWeekKey(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    renderHeader();
    renderWeek();
  }

  function showSettings(show) {
    $("settings").style.display = show ? "block" : "none";
    if (show) {
      $("cfgOwner").value = cfg.ownerName || "";
      $("cfgTeam").value = cfg.team || "";
      $("cfgRate").value = cfg.rate || "";
      $("cfgCurrency").value = cfg.currency || "USD";
      setOut("Pronto.");
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  }

  function saveSettings() {
    cfg.ownerName = String($("cfgOwner").value || "").trim() || cfg.ownerName;
    cfg.team = String($("cfgTeam").value || "").trim();
    cfg.rate = String($("cfgRate").value || "").trim();
    cfg.currency = String($("cfgCurrency").value || "USD");
    saveCfg(cfg);
    renderHeader();
    setOut("✅ Salvo.");
    alert("Salvo ✅");
  }

  function exportBackup() {
    const data = {
      kind: "timesheet-lite-backup",
      exportedAt: new Date().toISOString(),
      cfg: loadCfg(),
      weeks: loadWeeks()
    };
    const blob = new Blob([safeStr(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timesheet-backup.json";
    a.click();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 2000);
    setOut("✅ Backup exportado.");
  }

  function importBackup() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json,.json";
    inp.onchange = async () => {
      const f = inp.files && inp.files[0] ? inp.files[0] : null;
      if (!f) return;
      try {
        const txt = await f.text();
        const data = safeParse(txt, null);
        if (!data || data.kind !== "timesheet-lite-backup") throw new Error("Arquivo inválido");
        if (data.cfg) localStorage.setItem(LS.cfg, safeStr(data.cfg));
        if (data.weeks) localStorage.setItem(LS.weeks, safeStr(data.weeks));
        cfg = loadCfg();
        renderHeader();
        renderWeek();
        renderMonth();
        setOut("✅ Backup importado.");
        alert("Importado ✅");
      } catch (e) {
        alert("Falhou: " + (e?.message || e));
        setOut("❌ Import falhou.");
      }
    };
    inp.click();
  }

  function nukeAll() {
    const ok = confirm("APAGAR TUDO? (config + semanas)");
    if (!ok) return;
    try {
      localStorage.removeItem(LS.cfg);
      localStorage.removeItem(LS.weeks);
    } catch {}
    cfg = loadCfg();
    currentWeek = isoWeekKey(new Date());
    renderHeader();
    renderWeek();
    renderMonthPick();
    renderMonth();
    setOut("✅ Tudo apagado.");
  }

  function buildPrintableHTML(weekKey) {
    const { week } = getWeek(weekKey);
    const entries = Array.isArray(week.entries) ? week.entries.slice() : [];
    entries.sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")) || String(a.start||"").localeCompare(String(b.start||"")));

    const se = weekStartEnd(weekKey);
    const totalH = weekTotalHours(entries);

    const rate = Number(cfg.rate || 0) || 0;
    const amount = rate > 0 ? (totalH * rate) : 0;

    const rows = entries.map(e => \`
      <tr>
        <td>\${escapeHtml(e.date||"")}</td>
        <td>\${escapeHtml(e.start||"")}</td>
        <td>\${escapeHtml(e.end||"")}</td>
        <td style="text-align:right">\${Number(e.breakMin||0)}</td>
        <td style="text-align:right">\${(Number(e.hours||0)).toFixed(2)}</td>
        <td>\${escapeHtml(e.note||"")}</td>
      </tr>\`).join("");

    const title = (cfg.team ? cfg.team + " — " : "") + (cfg.ownerName || "Timesheet");
    return \`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>\${escapeHtml(title)} — \${escapeHtml(weekKey)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto;margin:24px;color:#111}
  h1{margin:0 0 6px 0;font-size:22px}
  .sub{color:#444;margin:0 0 14px 0}
  .meta{margin:0 0 10px 0}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #ddd;padding:8px;vertical-align:top}
  th{background:#f4f4f4;text-align:left}
  .tot{margin-top:12px;font-size:14px}
  .tot b{font-size:16px}
  .right{text-align:right}
  .hint{margin-top:14px;color:#666;font-size:12px}
</style>
</head>
<body>
  <h1>\${escapeHtml(title)}</h1>
  <p class="sub">Semana \${escapeHtml(weekKey)} • \${se ? (escapeHtml(se.start) + " → " + escapeHtml(se.end)) : ""}</p>
  <p class="meta"><b>Usuário:</b> \${escapeHtml(cfg.ownerName||"")} \${cfg.team ? (" • <b>Equipe:</b> " + escapeHtml(cfg.team)) : ""}</p>

  <table>
    <thead>
      <tr>
        <th>Data</th><th>Início</th><th>Fim</th><th class="right">Break (min)</th><th class="right">Horas</th><th>Nota</th>
      </tr>
    </thead>
    <tbody>\${rows || "<tr><td colspan='6'>Sem entradas</td></tr>"}</tbody>
  </table>

  <div class="tot">
    <div><b>Total:</b> \${totalH.toFixed(2)}h</div>
    \${rate>0 ? ("<div><b>Rate:</b> " + escapeHtml(String(rate)) + " " + escapeHtml(cfg.currency||"USD") + " • <b>Total:</b> " + escapeHtml(moneyFmt(cfg.currency||"USD", amount)) + "</div>") : ""}
  </div>

  <div class="hint">Dica: no iPhone, toque em compartilhar → imprimir → salvar como PDF.</div>

  <script>setTimeout(()=>{ try{ window.print(); }catch(e){} }, 350);</script>
</body>
</html>\`;
  }

  function exportPDF() {
    const html = buildPrintableHTML(currentWeek);
    const w = window.open("", "_blank");
    if (!w) { alert("Bloqueado pelo navegador. Tente novamente."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function initDefaults() {
    // defaults inputs
    $("inDate").value = todayISO();
    $("inBreak").value = "0";
  }

  function bind() {
    $("btnAdd").addEventListener("click", addOrEdit, { passive: true });
    $("btnClearWeek").addEventListener("click", clearWeek, { passive: true });
    $("btnPrevWeek").addEventListener("click", () => shiftWeek(-1), { passive: true });
    $("btnNextWeek").addEventListener("click", () => shiftWeek(1), { passive: true });
    $("btnPDF").addEventListener("click", exportPDF, { passive: true });

    $("btnSettings").addEventListener("click", () => showSettings(true), { passive: true });
    $("btnCloseSettings").addEventListener("click", () => showSettings(false), { passive: true });
    $("btnSaveCfg").addEventListener("click", saveSettings, { passive: true });
    $("btnExportJSON").addEventListener("click", exportBackup, { passive: true });
    $("btnImportJSON").addEventListener("click", importBackup, { passive: true });
    $("btnNuke").addEventListener("click", nukeAll, { passive: true });

    $("monthPick").addEventListener("change", renderMonth, { passive: true });
  }

  function boot() {
    cfg = loadCfg();
    renderMonthPick();
    renderHeader();
    initDefaults();
    bind();
    renderWeek();
    renderMonth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();`
      };
    }
  });

  window.RCF_TEMPLATE_REGISTRY = TemplateRegistry;
})();
