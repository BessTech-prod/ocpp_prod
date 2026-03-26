/* ============================================================================
 * ui-common.js  —  Roll- och auth-medvetna UI-hjälpare för hela portalen
 * Version: 2.0 (2026-03-15)
 * ============================================================================ */

(function () {
  "use strict";
  const UI = window.UI || {};

  /* ---------------------------------- TEMA --------------------------------- */
  const THEME_KEY = "ui-theme";
  function applyTheme(mode) {
    const root = document.documentElement;
    if (mode === "dark") root.classList.add("theme-dark");
    else root.classList.remove("theme-dark");
    try { localStorage.setItem(THEME_KEY, mode); } catch {}
  }
  UI.initTheme = function initTheme() {
    let saved = "light";
    try { saved = localStorage.getItem(THEME_KEY) || "light"; } catch {}
    applyTheme(saved);
    const t = document.getElementById("themeToggle");
    if (t) {
      t.checked = (saved === "dark");
      t.addEventListener("change", () => applyTheme(t.checked ? "dark" : "light"));
    }
  };

  /* ------------------------------- HTTP ------------------------------------ */
  async function handle401(r) {
    if (r.status === 401) {
      window.location.href = "/login.html";
      throw new Error("401 (redirect to login)");
    }
  }
  UI.getJSON = async function getJSON(url) {
    const r = await fetch(url, { cache:"no-store" });
    await handle401(r);
    if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> "")}`);
    return r.json();
  };
  UI.postJSON = async function postJSON(url, body) {
    const r = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body??{}) });
    await handle401(r);
    if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> "")}`);
    return r.json();
  };
  UI.deleteJSON = async function deleteJSON(url) {
    const r = await fetch(url, { method:"DELETE" });
    await handle401(r);
    if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> "")}`);
    return r.json();
  };

  /* ----------------------------- NOTISER ----------------------------------- */
  UI.alert = function alertBox(msg, kind="danger", timeout=4500){
    const host = document.getElementById("page-alerts");
    if (!host) return;
    if (!msg) { host.innerHTML=""; return; }
    const esc=(s)=> String(s ?? "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
    host.innerHTML = `<div class="alert alert-${kind}">${esc(msg)}</div>`;
    if (timeout>0) setTimeout(()=> host.innerHTML="", timeout);
  };
  UI.toast = function toast(msg, variant="success"){
    const stack=document.getElementById("toast-stack"); if(!stack) return;
    const esc=(s)=> String(s ?? "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
    const id="t_"+Date.now();
    stack.insertAdjacentHTML("beforeend", `
      <div id="${id}" class="toast align-items-center text-bg-${variant} border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body">${esc(msg)}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>`);
    try { new bootstrap.Toast(document.getElementById(id), { delay: 2200 }).show(); } catch {}
  };

  /* ----------------------- LADDSTATUS (OCPP -> SV) ------------------------- */
  UI.normalizeChargerStatus = function normalizeChargerStatus(raw){
    const v = String(raw || '').trim().toLowerCase();
    if (!v) return 'no_data';
    if (v === 'charging') return 'charging';
    if (v === 'available') return 'available';
    if (v === 'preparing') return 'preparing';
    if (v === 'finishing') return 'finishing';
    if (v === 'faulted') return 'faulted';
    if (v === 'unavailable') return 'unavailable';
    if (v === 'reserved') return 'reserved';
    if (v === 'suspendedev' || v === 'suspendedevse' || v === 'suspended') return 'suspended';
    return 'unknown';
  };

  UI.statusLabelSv = function statusLabelSv(raw){
    const k = UI.normalizeChargerStatus(raw);
    if (k === 'charging') return 'Laddar';
    if (k === 'available') return 'Ledig';
    if (k === 'preparing') return 'Förbereder';
    if (k === 'finishing') return 'Avslutar';
    if (k === 'faulted') return 'Ur drift';
    if (k === 'unavailable') return 'Otillgänglig';
    if (k === 'reserved') return 'Reserverad';
    if (k === 'suspended') return 'Pausad';
    if (k === 'no_data') return 'Ingen data';
    return 'Okänd';
  };

  UI.statusClass = function statusClass(raw){
    const k = UI.normalizeChargerStatus(raw);
    if (k === 'charging') return 'badge status-charging';
    if (k === 'available') return 'badge status-available';
    if (k === 'preparing' || k === 'finishing') return 'badge status-preparing';
    if (k === 'suspended') return 'badge status-suspended';
    if (k === 'faulted') return 'badge status-faulted';
    if (k === 'unavailable') return 'badge status-unavailable';
    return 'badge status-unknown';
  };

  /* ------------------------------ AUTH/ROLL -------------------------------- */
  async function whoAmI(){ return UI.getJSON("/api/auth/me"); }
  UI.goToDashboard = async function goToDashboard(){
    try{
      const me = await whoAmI();
      const role=(me.role||"").toLowerCase();
      if (role==="portal_admin" || role==="admin") window.location.href="/portal/index.html";
      else if (role==="org_admin")                 window.location.href="/org/index.html";
      else                                         window.location.href="/user/index.html";
    }catch{ window.location.href="/login.html"; }
  };
  UI.requireRole = async function requireRole(allowedRoles){
    const me = await whoAmI();
    const role=(me.role||"").toLowerCase();
    const allowed=(allowedRoles||["user","org_admin","portal_admin","admin"]).map(s=>s.toLowerCase());
    if (!allowed.includes(role)){
      if (role==="portal_admin" || role==="admin") window.location.href="/portal/index.html";
      else if (role==="org_admin")                 window.location.href="/org/index.html";
      else                                         window.location.href="/user/index.html";
      return null;
    }
    return me;
  };

  /* ------------------------------ NAVBAR ----------------------------------- */
  UI.initNavbar = function initNavbar(me){
    const label=document.getElementById("me-display");
    if (label){
      label.textContent = "";
      label.classList.add("d-none");
      label.setAttribute("aria-hidden", "true");
    }
    const btnOut=document.getElementById("btnLogout");
    if (btnOut){
      btnOut.addEventListener("click", async ()=>{
        try{ await fetch("/api/auth/logout",{method:"POST"}); }catch{}
        window.location.href="/login.html";
      });
    }
    document.querySelectorAll("#navDashboard, .js-go-dashboard").forEach(el=>{
      el.addEventListener("click", (e)=>{ e.preventDefault(); UI.goToDashboard(); });
    });
  };

  function normalizePath(path){
    if(!path) return "/";
    let p = path.replace(/^https?:\/\/[^/]+/i, "");
    if (!p.startsWith("/")) p = `/${p}`;
    p = p.replace(/^\/ui(?=\/)/, "");
    if (p !== "/" && p.endsWith("/")) p = p.slice(0, -1);
    return p;
  }

  UI.highlightActiveNav = function highlightActiveNav(){
    const current = normalizePath(window.location.pathname);

    document.querySelectorAll(".navbar .nav-link.active").forEach(a=>{
      a.classList.remove("active");
      a.removeAttribute("aria-current");
    });

    if (/\/(portal|org|user)\/index\.html$/i.test(current)) {
      document.querySelectorAll(".navbar .nav-link.js-go-dashboard, .navbar .nav-link#navDashboard").forEach(a=>{
        a.classList.add("active");
        a.setAttribute("aria-current", "page");
      });
      return;
    }

    document.querySelectorAll(".navbar .nav-link[href]").forEach(a=>{
      const href = (a.getAttribute("href") || "").trim();
      if (!href || href === "#" || href.startsWith("javascript:")) return;

      const target = normalizePath(href.split("?")[0].split("#")[0]);
      if (target === current) {
        a.classList.add("active");
        a.setAttribute("aria-current", "page");
      }
    });
  };
  // Säkring mot '#' i adressfältet på JS-styrda länkar:
document.querySelectorAll('#navDashboard, .js-go-dashboard').forEach(a => {
  // sätt ett "ofarligt" href om det saknas
  if (!a.getAttribute('href') || a.getAttribute('href') === '#') {
    a.setAttribute('href', 'javascript:void(0)');
  }
});

  /* ------------------------ ROLL-MEDVETNA LÄNKAR --------------------------- */
  UI.applyRoleAwareLinks = function applyRoleAwareLinks(me){
    const role=(me?.role||"").toLowerCase();
    const pick=(a)=>{
      if (role==="portal_admin" || role==="admin") return a.getAttribute("data-route-portal");
      if (role==="org_admin")                       return a.getAttribute("data-route-org");
      return a.getAttribute("data-route-user");
    };
    document.querySelectorAll("a[data-route-portal], a[data-route-org], a[data-route-user]").forEach(a=>{
      const target = pick(a);
      if (target) {
        a.setAttribute("href", target);
        // Add click handler to ensure navigation
        a.addEventListener("click", (e)=>{
          if (target) {
            e.preventDefault();
            window.location.href = target;
          }
        });
      }
    });
  };
/* Lägg in detta block någonstans ovanför UI.initPage */
UI.applyVisibilityByRole = function applyVisibilityByRole(me){
  const role = (me?.role || '').toLowerCase();
  document.querySelectorAll('[data-visible-roles]').forEach(el => {
    const list = (el.getAttribute('data-visible-roles') || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    // Visa om listan antingen innehåller min roll eller "any"
    const shouldShow = list.includes('any') || list.includes(role);
    // Döljer visuellt och från layout. Använd "d-none" för Bootstrap-kompatibilitet.
    el.classList.toggle('d-none', !shouldShow);
    // Extra säkerhet: aria-hidden för hjälpmedel
    if (!shouldShow) el.setAttribute('aria-hidden','true'); else el.removeAttribute('aria-hidden');
  });
};
  /* ------------------------------- INIT PAGE -------------------------------- */
UI.initPage = async function initPage(opts){
  try {
    UI.initTheme();
    const me = await UI.requireRole(opts?.requiredRoles || ['user','org_admin','portal_admin','admin']);
    if (!me) return null;
    UI.initNavbar(me);
    UI.applyRoleAwareLinks(me);
    UI.applyVisibilityByRole(me);
    UI.highlightActiveNav();
    return me;
  } finally {
    if (document.body) document.body.classList.add('app-ready');
  }
};

  document.addEventListener('DOMContentLoaded', ()=>{
    setTimeout(()=>{
      if (document.body && !document.body.classList.contains('app-ready')) {
        document.body.classList.add('app-ready');
      }
    }, 1800);
  });
  window.UI = UI;
})();
