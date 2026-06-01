// /assets/user_index.js  (v2)
// User-dashboard: visar CP-lista (filtrerad av backend per org/roll) + status.
// Kräver /assets/ui-common.js (initPage, getJSON, navbar, tema m.m.)
(function(){
  const POLL_MS = 5000;
  const API = { cps:'/api/cps', status:'/api/status' };
  const $ = (s)=>document.querySelector(s);

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

  function renderStatusCards(cps, statusData){
    const host = $('#cp-status-cards');
    if (!host) return;

    const counters = { charging: 0, available: 0, faulted: 0 };
    cps.forEach(cpId => {
      const cpStatus = statusData[cpId] || {};
      Object.entries(cpStatus).forEach(([connectorId, connector]) => {
        // Connector 0 is CP-level state and should not be counted as an outlet.
        const numId = Number(connectorId);
        if (!Number.isFinite(numId) || numId <= 0) return;
        const bucket = UI.normalizeChargerStatus(connector?.status);
        if (bucket in counters) counters[bucket] += 1;
      });
    });

    host.innerHTML = `
      <div class="col-6 col-lg-4">
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
      <div class="col-6 col-lg-4">
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
      <div class="col-6 col-lg-4">
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
            <div class="small text-muted mb-3">ID: ${cpId}</div>
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

  let timer=null;
  async function tick(){
    try{
      const [cpsRes, statusRes] = await Promise.all([
        UI.getJSON(API.cps),
        UI.getJSON(API.status)
      ]);
      renderGrid(cpsRes?.connected || [], statusRes || {}, cpsRes?.aliases || {});
      const ts = $('#last-refresh'); if(ts) ts.textContent = 'Senast: ' + new Date().toLocaleTimeString();
    }catch(e){
      if(String(e).includes('401')){ if(timer){ clearInterval(timer); timer=null; } return; }
      console.error(e);
    }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    // Endast user
    const me = await UI.initPage({ requiredRoles:['user'] }); if(!me) return;

    setDashboardHeading(me);

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
