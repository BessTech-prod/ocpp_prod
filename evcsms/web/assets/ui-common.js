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
      window.location.href = "/login";
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
  UI.patchJSON = async function patchJSON(url, body) {
    const r = await fetch(url, { method:"PATCH", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body??{}) });
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

  /* ----------------------------- UTILS ------------------------------------- */
  UI.esc = function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
  };

  /* ----------------------------- NOTISER ----------------------------------- */
  UI.alert = function alertBox(msg, kind="danger", timeout=4500){
    const host = document.getElementById("page-alerts");
    if (!host) return;
    if (!msg) { host.innerHTML=""; return; }
    host.innerHTML = `<div class="alert alert-${kind}">${UI.esc(msg)}</div>`;
    if (timeout>0) setTimeout(()=> host.innerHTML="", timeout);
  };
  UI.toast = function toast(msg, variant="success"){
    const stack=document.getElementById("toast-stack"); if(!stack) return;
    const id="t_"+Date.now();
    stack.insertAdjacentHTML("beforeend", `
      <div id="${id}" class="toast align-items-center text-bg-${variant} border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body">${UI.esc(msg)}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>`);
    try { new bootstrap.Toast(document.getElementById(id), { delay: 2200 }).show(); } catch {}
  };

  /* ----------------------- LADDSTATUS (OCPP -> SV) ------------------------- */
  UI.normalizeChargerStatus = function normalizeChargerStatus(raw){
    const v = String(raw || '').trim().toLowerCase();
    if (!v) return 'no_data';
    if (v === 'charging' || v === 'occupied') return 'charging';
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
      if (role==="portal_admin" || role==="admin") window.location.href="/portal/index";
      else if (role==="installer")                 window.location.href="/installer/index";
      else if (role==="org_admin")                 window.location.href="/org/index";
      else                                         window.location.href="/user/index";
    }catch{ window.location.href="/login.html"; }
  };
  UI.requireRole = async function requireRole(allowedRoles){
    const me = await whoAmI();
    const role=(me.role||"").toLowerCase();
    const allowed=(allowedRoles||["user","org_admin","portal_admin","admin","installer"]).map(s=>s.toLowerCase());
    if (!allowed.includes(role)){
      if (role==="portal_admin" || role==="admin") window.location.href="/portal/index";
      else if (role==="installer")                 window.location.href="/installer/index";
      else if (role==="org_admin")                 window.location.href="/org/index";
      else                                         window.location.href="/user/index";
      return null;
    }
    return me;
  };

  /* ------------------------------ NAVBAR ----------------------------------- */
  UI.initNavbar = function initNavbar(me){
    if (document.body.classList.contains('modern-ui')) {
      UI.setupModernLayout(me);
    }
    const label=document.getElementById("me-display");
    if (label && me){
      label.textContent = me.name || me.email || "";
      label.classList.remove("d-none");
    }
    document.querySelectorAll("#btnLogout, #sidebarLogout").forEach(btn => {
      btn.addEventListener("click", async ()=>{
        try{ await fetch("/api/auth/logout",{method:"POST"}); }catch{}
        window.location.href="/login";
      });
    });
    document.querySelectorAll("#navDashboard, .js-go-dashboard").forEach(el=>{
      el.addEventListener("click", (e)=>{ e.preventDefault(); UI.goToDashboard(); });
    });
  };

  UI.setupModernLayout = function setupModernLayout(me) {
    if (document.querySelector('.modern-layout')) return;

    const originalNavbar = document.querySelector('.navbar');
    const originalMain = document.querySelector('main');
    const originalFooter = document.querySelector('footer');

    if (!originalMain) return;

    // Create layout containers
    const layout = document.createElement('div');
    layout.className = 'modern-layout';

    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';

    const mainContent = document.createElement('main');
    mainContent.className = 'main-content';

    const topHeader = document.createElement('header');
    topHeader.className = 'top-header';

    const contentBody = document.createElement('div');
    contentBody.className = 'content-body';

    // Build Sidebar
    const brand = originalNavbar ? originalNavbar.querySelector('.navbar-brand').cloneNode(true) : null;
    const sidebarBrand = document.createElement('div');
    sidebarBrand.className = 'sidebar-brand';
    if (brand) sidebarBrand.appendChild(brand);
    sidebar.appendChild(sidebarBrand);

    const nav = document.createElement('nav');
    nav.className = 'sidebar-nav';
    
    if (originalNavbar) {
      const navItems = originalNavbar.querySelectorAll('.nav-item');
      navItems.forEach(item => {
        if (item.classList.contains('d-none')) return;
        const link = item.querySelector('.nav-link');
        if (!link || link.classList.contains('d-none')) return;

        const sLink = link.cloneNode(true);
        // Preserve functional classes like js-go-dashboard
        const functionalClasses = Array.from(link.classList).filter(c => c.startsWith('js-'));
        sLink.className = 'sidebar-link';
        functionalClasses.forEach(c => sLink.classList.add(c));
        
        // Copy visibility attributes from the parent li if they exist
        ['data-visible-roles', 'data-visible-role'].forEach(attr => {
           if (item.hasAttribute(attr)) sLink.setAttribute(attr, item.getAttribute(attr));
        });

        // Preserve data attributes from the link itself
        Array.from(link.attributes).forEach(attr => {
          if (attr.name.startsWith('data-')) sLink.setAttribute(attr.name, attr.value);
        });

        // If it's a "dashboard" link, ensure it works correctly
        if (link.classList.contains('js-go-dashboard')) {
          sLink.addEventListener('click', (e) => {
            e.preventDefault();
            UI.goToDashboard();
          });
        }

        nav.appendChild(sLink);
      });
    }
    sidebar.appendChild(nav);

    const sidebarFooter = document.createElement('div');
    sidebarFooter.className = 'sidebar-footer';
    sidebarFooter.innerHTML = `
      <div class="sidebar-user mb-3">
        <div class="avatar bg-accent text-white rounded-circle d-flex align-items-center justify-content-center" style="width:32px; height:32px; background-color: var(--mi-accent);">
          <i class="bi bi-person"></i>
        </div>
        <div class="small text-truncate" style="max-width: 150px;">${UI.esc(me?.name || me?.email || 'Användare')}</div>
      </div>
      <button id="sidebarLogout" class="btn btn-sm btn-outline-light w-100 opacity-75"><i class="bi bi-box-arrow-right"></i> Logga ut</button>
    `;
    sidebar.appendChild(sidebarFooter);

    // Build Top Header
    const pageTitle = document.querySelector('.page-header h1')?.textContent || document.title;
    topHeader.innerHTML = `
      <button class="btn d-lg-none me-3" id="sidebarToggle"><i class="bi bi-list fs-4"></i></button>
      <h5 class="m-0 fw-bold text-dark d-none d-md-block">${UI.esc(pageTitle)}</h5>
      <div class="ms-auto d-flex align-items-center gap-3">
         <div id="me-display-sidebar" class="small text-muted d-none d-lg-block">${UI.esc(me?.email || '')}</div>
         <div class="form-check form-switch d-none d-sm-block">
            <input class="form-check-input" type="checkbox" id="themeToggleSidebar">
            <label class="form-check-label small text-muted" for="themeToggleSidebar"><i class="bi bi-moon-stars"></i></label>
         </div>
      </div>
    `;

    // Reconstruct DOM
    contentBody.appendChild(originalMain);
    if (originalFooter) contentBody.appendChild(originalFooter);

    mainContent.appendChild(topHeader);
    mainContent.appendChild(contentBody);

    layout.appendChild(sidebar);
    layout.appendChild(mainContent);

    document.body.prepend(layout);

    // Hide original navbar completely when modern layout is active
    if (originalNavbar) {
      originalNavbar.classList.add('d-none');
    }

    // Mobile Toggle Logic
    const toggle = document.getElementById('sidebarToggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('show');
      });
    }

    // Highlight active link in sidebar
    UI.highlightActiveSidebar();

    // Re-apply visibility rules to newly created sidebar elements
    UI.applyVisibilityByRole(me);

    // Init preloading and transitions
    UI.initPreloading();

    // Reveal layout
    setTimeout(() => {
      document.body.classList.add('layout-ready');
    }, 50);
  };

  UI.initPreloading = function initPreloading() {
    document.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('mouseenter', () => {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('javascript:') && href !== '#') {
          if (!document.querySelector(`link[rel="prefetch"][href="${href}"]`)) {
            const prefetch = document.createElement('link');
            prefetch.rel = 'prefetch';
            prefetch.href = href;
            document.head.appendChild(prefetch);
          }
        }
      }, { once: true });

      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('javascript:') && href !== '#' && !e.metaKey && !e.ctrlKey) {
          // Add a class to body to trigger exit animation if defined
          document.body.classList.add('modern-ui-leaving');
        }
      });
    });
  };

  UI.highlightActiveSidebar = function highlightActiveSidebar() {
    const current = normalizePath(window.location.pathname);
    const isDashboard = /\/(portal|org|user|installer)(\/index)?$/i.test(current);

    document.querySelectorAll('.sidebar-link').forEach(a => {
      const href = a.getAttribute('href');
      let active = false;
      
      if (isDashboard && a.classList.contains('js-go-dashboard')) {
        active = true;
      } else if (href && href !== '#' && !href.startsWith('javascript:')) {
        const target = normalizePath(href.split('?')[0].split('#')[0]);
        active = (target === current);
      }

      if (active) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      } else {
        a.classList.remove('active');
        a.removeAttribute('aria-current');
      }
    });
  };

  function normalizePath(path){
    if(!path) return "/";
    let p = path.replace(/^https?:\/\/[^/]+/i, "");
    if (!p.startsWith("/")) p = `/${p}`;
    p = p.replace(/^\/ui(?=\/)/, "");
    // Remove .html extension for more robust matching
    p = p.replace(/\.html$/i, "");
    if (p !== "/" && p.endsWith("/")) p = p.slice(0, -1);
    if (!p) return "/";
    return p;
  }

  UI.highlightActiveNav = function highlightActiveNav(){
    const current = normalizePath(window.location.pathname);
    const isDashboard = /\/(portal|org|user|installer)(\/index)?$/i.test(current);

    document.querySelectorAll(".navbar .nav-link, .nav-link-manual").forEach(a=>{
      const href = (a.getAttribute("href") || "").trim();
      let active = false;

      if (isDashboard && (a.classList.contains('js-go-dashboard') || a.id === 'navDashboard')) {
        active = true;
      } else if (href && href !== "#" && !href.startsWith("javascript:")) {
        const target = normalizePath(href.split("?")[0].split("#")[0]);
        active = (target === current);
      }

      if (active) {
        a.classList.add("active");
        a.setAttribute("aria-current", "page");
      } else {
        a.classList.remove("active");
        a.removeAttribute("aria-current");
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
      if (role==="installer")                       return a.getAttribute("data-route-installer") || a.getAttribute("data-route-portal");
      if (role==="org_admin")                       return a.getAttribute("data-route-org");
      return a.getAttribute("data-route-user");
    };
    document.querySelectorAll("a[data-route-portal], a[data-route-installer], a[data-route-org], a[data-route-user]").forEach(a=>{
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
  document.querySelectorAll('[data-visible-roles], [data-visible-role]').forEach(el => {
    const rolesStr = el.getAttribute('data-visible-roles') || el.getAttribute('data-visible-role') || '';
    const list = rolesStr
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
    const me = await UI.requireRole(opts?.requiredRoles || ['user','org_admin','portal_admin','admin','installer']);
    if (!me) return null;
    
    // Apply role-aware links and highlight before navbar/sidebar initialization
    // so that clones get the correct HREFs and active classes
    UI.applyRoleAwareLinks(me);
    UI.applyVisibilityByRole(me);
    UI.highlightActiveNav();
    
    UI.initNavbar(me);
    
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
