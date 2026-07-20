// /assets/user_index.js  (v3)
// User-dashboard: visar CP-lista (filtrerad av backend per org/roll) + status.
// Inkluderar fjärrstart-popup när en laddare väntar på auktorisering (Preparing).
// Kräver /assets/ui-common.js (initPage, getJSON, postJSON, navbar, tema m.m.)
(function(){
  const POLL_MS = 5000;
  const CMD_POLL_MS = 1000;
  const CMD_POLL_MAX = 20;
  const API = {
    cps: '/api/cps',
    status: '/api/status',
    remoteStart: '/api/user/remote-start',
    remoteStartStatus: (id) => `/api/user/remote-start/${encodeURIComponent(id)}`
  };
  const $ = (s)=>document.querySelector(s);

  /* ── State tracking for preparing-detection ────────────────────── */
  let prevStatuses = {};           // { "cpId:connId": "normalized_status" }
  let activePopups = {};           // { "cpId:connId": HTMLElement }
  let pendingCommands = {};        // { "cpId:connId": command_id }
  let dismissedPopups = new Set(); // user-dismissed keys (reset when outlet leaves preparing)

  function statusKey(cpId, connId){ return cpId + ':' + connId; }

  function setDashboardHeading(me){
    const heading = $('.page-header h1');
    if (!heading) return;
    const orgName = String(me?.org_name || '').trim();
    const orgId = String(me?.org_id || '').trim();
    if (orgName || orgId) heading.textContent = orgName || orgId;
  }

  function displayCpId(id){
    try { return String(id||'').split('/').pop() || String(id||''); }
    catch { return String(id||''); }
  }

  /* ── Remote-start pop-up management ────────────────────────────── */
  function getPopupHost(){
    return document.getElementById('remote-start-popups');
  }

  function showPreparingPopup(cpId, connId, alias){
    const key = statusKey(cpId, connId);
    if (activePopups[key] || dismissedPopups.has(key)) return;

    const host = getPopupHost();
    if (!host) return;

    const div = document.createElement('div');
    div.className = 'alert alert-warning shadow-sm remote-start-popup d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2';
    div.setAttribute('role', 'alert');
    div.dataset.rsKey = key;
    div.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-ev-front fs-4"></i>
        <div>
          <strong>${alias}</strong> · Uttag ${connId}
          <div class="small text-muted">Kabel ansluten – väntar på auktorisering</div>
        </div>
      </div>
      <div class="d-flex gap-2 align-items-center">
        <button class="btn btn-success btn-sm btn-start-charge" type="button">
          <i class="bi bi-lightning-charge-fill me-1"></i>Starta laddning
        </button>
        <button class="btn btn-outline-secondary btn-sm btn-dismiss-rs" type="button" title="Stäng">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>`;

    div.querySelector('.btn-start-charge').addEventListener('click', ()=>{
      handleRemoteStart(cpId, connId, key, div);
    });
    div.querySelector('.btn-dismiss-rs').addEventListener('click', ()=>{
      dismissedPopups.add(key);
      removePopup(key);
    });

    host.appendChild(div);
    activePopups[key] = div;
  }

  function removePopup(key){
    const el = activePopups[key];
    if (el && el.parentNode) el.parentNode.removeChild(el);
    delete activePopups[key];
    delete pendingCommands[key];
  }

  function removeAllPopupsForNonPreparing(currentPreparing){
    Object.keys(activePopups).forEach(key => {
      if (!currentPreparing.has(key)){
        removePopup(key);
        dismissedPopups.delete(key);
      }
    });
  }

  function extractDetail(e){
    // postJSON throws Error("url -> status {json}"); try to extract "detail" from embedded JSON
    const raw = String(e?.message || '');
    const jsonStart = raw.indexOf('{');
    if (jsonStart >= 0) {
      try { const obj = JSON.parse(raw.slice(jsonStart)); if (obj.detail) return obj.detail; } catch {}
    }
    return null;
  }

  async function handleRemoteStart(cpId, connId, key, popupEl){
    const btn = popupEl.querySelector('.btn-start-charge');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Startar…';

    try {
      const res = await UI.postJSON(API.remoteStart, {
        cp_id: cpId,
        connector_id: Number(connId)
      });
      if (!res?.ok || !res?.command_id) throw new Error('Oväntat svar');

      pendingCommands[key] = res.command_id;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Väntar på laddare…';

      pollCommandResult(res.command_id, key, popupEl);
    } catch(e) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-lightning-charge-fill me-1"></i>Starta laddning';

      const msg = extractDetail(e) || 'Kunde inte starta laddning';
      showPopupError(popupEl, msg);
    }
  }

  function pollCommandResult(commandId, key, popupEl, attempt){
    attempt = attempt || 0;
    if (attempt >= CMD_POLL_MAX) {
      showPopupError(popupEl, 'Timeout – inget svar från laddaren');
      resetPopupButton(popupEl);
      return;
    }

    setTimeout(async ()=>{
      try {
        const res = await UI.getJSON(API.remoteStartStatus(commandId));
        if (res.status === 'queued') {
          pollCommandResult(commandId, key, popupEl, attempt + 1);
          return;
        }
        if (res.status === 'success') {
          showPopupSuccess(popupEl);
          setTimeout(()=> removePopup(key), 3000);
        } else {
          showPopupError(popupEl, 'Laddaren nekade fjärrstart');
          resetPopupButton(popupEl);
        }
      } catch(e) {
        showPopupError(popupEl, 'Kunde inte hämta status');
        resetPopupButton(popupEl);
      }
    }, CMD_POLL_MS);
  }

  function showPopupSuccess(popupEl){
    popupEl.classList.remove('alert-warning', 'alert-danger');
    popupEl.classList.add('alert-success', 'rs-success');
    const btn = popupEl.querySelector('.btn-start-charge');
    if (btn) btn.outerHTML = '<span class="text-success fw-bold"><i class="bi bi-check-circle-fill me-1"></i>Laddning startad!</span>';
    const dismiss = popupEl.querySelector('.btn-dismiss-rs');
    if (dismiss) dismiss.style.display = 'none';
  }

  function showPopupError(popupEl, msg){
    popupEl.classList.remove('alert-warning', 'alert-success');
    popupEl.classList.add('alert-danger', 'rs-error');
    let errEl = popupEl.querySelector('.rs-error-msg');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.className = 'rs-error-msg small text-danger w-100 mt-1';
      popupEl.appendChild(errEl);
    }
    errEl.textContent = msg;
  }

  function resetPopupButton(popupEl){
    const btn = popupEl.querySelector('.btn-start-charge');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-lightning-charge-fill me-1"></i>Försök igen';
    }
  }

  /* ── Status rendering (unchanged logic) ────────────────────────── */
  function renderStatusCards(cps, statusData){
    const host = $('#cp-status-cards');
    if (!host) return;

    const counters = { charging: 0, available: 0, faulted: 0 };
    cps.forEach(cpId => {
      const cpStatus = statusData[cpId] || {};
      Object.entries(cpStatus).forEach(([connectorId, connector]) => {
        const numId = Number(connectorId);
        if (!Number.isFinite(numId) || numId <= 0) return;
        const bucket = UI.normalizeChargerStatus(connector?.status);
        if (bucket in counters) counters[bucket] += 1;
      });
    });

    host.innerHTML = `
      <div class="col-4">
        <div class="card border-0 shadow-sm">
          <div class="card-body">
            <div class="d-flex align-items-center mb-1">
              <i class="bi bi-check-circle text-success me-2"></i>
              <div class="small text-muted font-weight-bold">LEDIGA UTTAG</div>
            </div>
            <div class="h2 m-0 font-weight-bold text-dark">${counters.available}</div>
          </div>
        </div>
      </div>
      <div class="col-4">
        <div class="card border-0 shadow-sm">
          <div class="card-body">
            <div class="d-flex align-items-center mb-1">
              <i class="bi bi-lightning-charge text-primary me-2"></i>
              <div class="small text-muted font-weight-bold">LADDAR NU</div>
            </div>
            <div class="h2 m-0 font-weight-bold text-dark">${counters.charging}</div>
          </div>
        </div>
      </div>
      <div class="col-4">
        <div class="card border-0 shadow-sm">
          <div class="card-body">
            <div class="d-flex align-items-center mb-1">
              <i class="bi bi-exclamation-triangle text-danger me-2"></i>
              <div class="small text-muted font-weight-bold">UR DRIFT</div>
            </div>
            <div class="h2 m-0 font-weight-bold text-dark">${counters.faulted}</div>
          </div>
        </div>
      </div>`;
  }

  function renderGrid(cps, statusMap, aliases){
    const grid = $('#cp-grid'); grid.innerHTML='';
    renderStatusCards(cps || [], statusMap || {});
    if(!cps || !cps.length){
      grid.innerHTML = `<div class="col-12"><div class="alert alert-warning mb-0">Ingen laddare ansluten ännu.</div></div>`;
      return;
    }
    cps.forEach(cpId=>{
      const cpStat = statusMap[cpId] || {};
      const alias = (aliases && aliases[cpId]) || displayCpId(cpId);
      const c1 = cpStat[1];
      const c2 = cpStat[2];
      const col = document.createElement('div');
      col.className = 'col-12 col-md-6 col-lg-4';
      col.innerHTML = `
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body d-flex flex-column">
            <h5 class="card-title d-flex align-items-center gap-2 mb-3">
              <div class="icon-box bg-light rounded p-2 d-flex align-items-center justify-content-center">
                <i class="bi bi-ev-front text-primary"></i>
              </div>
              <span class="ms-1">${alias}</span>
            </h5>
            <div class="d-flex flex-column gap-2">
              <div class="d-flex justify-content-between align-items-center p-2 rounded-2 bg-light bg-opacity-50">
                <span class="small fw-bold">Uttag 1</span>
                <span class="badge ${UI.statusClass(c1?.status)}">${UI.statusLabelSv(c1?.status)}</span>
              </div>
              <div class="d-flex justify-content-between align-items-center p-2 rounded-2 bg-light bg-opacity-50">
                <span class="small fw-bold">Uttag 2</span>
                <span class="badge ${UI.statusClass(c2?.status)}">${UI.statusLabelSv(c2?.status)}</span>
              </div>
            </div>
          </div>
        </div>`;
      grid.appendChild(col);
    });
  }

  /* ── Preparing-state detection ─────────────────────────────────── */
  function detectPreparingChanges(cps, statusMap, aliases){
    const currentPreparing = new Set();

    (cps || []).forEach(cpId => {
      const cpStat = statusMap[cpId] || {};
      const alias = (aliases && aliases[cpId]) || displayCpId(cpId);

      Object.entries(cpStat).forEach(([connId, connector]) => {
        const numId = Number(connId);
        if (!Number.isFinite(numId) || numId <= 0) return;

        const key = statusKey(cpId, connId);
        const current = UI.normalizeChargerStatus(connector?.status);
        const previous = prevStatuses[key];

        if (current === 'preparing') {
          currentPreparing.add(key);
          // Show popup if outlet just entered preparing (or was already preparing on first load)
          if (previous !== 'preparing') {
            dismissedPopups.delete(key);
            showPreparingPopup(cpId, connId, alias);
          } else if (!activePopups[key] && !dismissedPopups.has(key)) {
            showPreparingPopup(cpId, connId, alias);
          }
        }

        prevStatuses[key] = current;
      });
    });

    // Remove popups for outlets that are no longer preparing
    removeAllPopupsForNonPreparing(currentPreparing);
  }

  /* ── Poll loop ─────────────────────────────────────────────────── */
  let timer=null;
  async function tick(){
    try{
      const [cpsRes, statusRes] = await Promise.all([
        UI.getJSON(API.cps),
        UI.getJSON(API.status)
      ]);
      const cps = cpsRes?.connected || [];
      const statusMap = statusRes || {};
      const aliases = cpsRes?.aliases || {};

      renderGrid(cps, statusMap, aliases);
      detectPreparingChanges(cps, statusMap, aliases);

      const ts = $('#last-refresh');
      if(ts) ts.textContent = 'Uppdaterad ' + new Date().toLocaleTimeString('sv-SE');
    }catch(e){
      if(String(e).includes('401')){ if(timer){ clearInterval(timer); timer=null; } return; }
      console.error(e);
    }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    // Endast user
    const me = await UI.initPage({ requiredRoles:['user'] }); if(!me) return;

    setDashboardHeading(me);

    // Manual refresh button
    $('#btnManualRefresh')?.addEventListener('click', ()=>{ tick(); });

    // Start poll
    await tick();
    timer = setInterval(tick, POLL_MS);

    // Pausa/återuppta vid flikbyte
    document.addEventListener('visibilitychange', ()=>{
      if(document.hidden){ if(timer){ clearInterval(timer); timer=null; } }
      else { if(!timer){ tick(); timer=setInterval(tick,POLL_MS); } }
    });
  });
})();
