// /assets/portal_index.js  (org_filter_1)
(function(){
  const POLL_MS = 5000;
  const API = {
    me:     '/api/auth/me',
    cps:    '/api/cps',
    status: '/api/status',
    orgs:   '/api/orgs',
    cpsMap: '/api/cps/map'
  };

  // ------- Helpers -------
  const $  = (s)=>document.querySelector(s);
  function showAlert(msg, kind='danger', t=5000){
    const el = $('#alerts'); if(!el) return;
    el.innerHTML = `<div class="alert alert-${kind}">${msg}</div>`;
    if(t>0) setTimeout(()=> el.innerHTML='', t);
  }
  function displayCpId(id){ try{ return String(id||'').split('/').pop()||String(id||''); }catch{ return String(id||''); } }

  function renderStatusCards(cps, statusData){
    const host = $('#cp-status-cards');
    if (!host) return;

    const counters = { charging: 0, available: 0, faulted: 0 };
    cps.forEach(cpId => {
      const cpStatus = statusData[cpId] || {};
      Object.entries(cpStatus).forEach(([connectorId, connector]) => {
        // Connector 0 is CP-level state and should not be shown as an outlet.
        const numId = Number(connectorId);
        if (!Number.isFinite(numId) || numId <= 0) return;
        const bucket = UI.normalizeChargerStatus(connector?.status);
        if (bucket in counters) counters[bucket] += 1;
      });
    });

    host.innerHTML = `
      <div class="col-6 col-lg-4"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">Lediga uttag</div><div class="h3 m-0">${counters.available}</div></div></div></div>
      <div class="col-6 col-lg-4"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">Laddar nu</div><div class="h3 m-0">${counters.charging}</div></div></div></div>
      <div class="col-6 col-lg-4"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">Uttag ur drift</div><div class="h3 m-0">${counters.faulted}</div></div></div></div>`;
  }

  // ------- Org-filter (endast portal_admin/admin) -------
  let ROLE = null;
  let CPS_ASSIGN = {}; // {cp_id -> {org_id, alias}}
      function cpMeta(cpId){
        const row = CPS_ASSIGN?.[cpId];
        if (row && typeof row === 'object') {
          return { org_id: row.org_id || '', alias: row.alias || cpId };
        }
        return { org_id: row || '', alias: cpId };
      }

  let LAST_CPS = [];   // snapshot från API
  let LAST_STATUS = {};

  async function initOrgFilterIfPortal(){
    const me = await UI.getJSON(API.me);
    ROLE = (me.role||'').toLowerCase();

    // Dölj filter om inte portal
    if(!(ROLE==='portal_admin'||ROLE==='admin')){
      const wrap=$('#orgFilterWrap'); if(wrap) wrap.style.display='none';
      const note=$('#legendNote'); if(note) note.style.display='none';
      return;
    }

    // Visa filter och fyll org-lista + mappning (för etiketter)
    const wrap=$('#orgFilterWrap'); if(wrap) wrap.style.display='';
    try{
      const [orgs, map] = await Promise.all([UI.getJSON(API.orgs), UI.getJSON(API.cpsMap)]);
      CPS_ASSIGN = map || {};
      const sel = $('#orgFilter');
      sel.innerHTML = `<option value="">Alla organisationer</option>` +
        Object.entries(orgs||{}).map(([id,o])=>`<option value="${id}">${(o?.name||id)} (${id})</option>`).join('');
      sel.addEventListener('change', renderSnapshot);
    }catch(e){
      console.warn('Kunde inte ladda orgs/cpsMap:', e);
    }
  }

  function setLastRefresh(){
    const ts = $('#last-refresh');
    if (ts) ts.textContent = 'Senast: ' + new Date().toLocaleTimeString();
  }

  function renderGrid(cps, statusData){
    const grid = $('#cp-grid'); grid.innerHTML='';
    if(!cps || !cps.length){
      grid.innerHTML = `<div class="col-12"><div class="alert alert-warning mb-0">Ingen laddare ansluten, kontakta din leverantör.</div></div>`;
      return;
    }

    // Klientfilter för portal
    let visible = cps.slice();
    const selectedOrg = ($('#orgFilter')?.value || '');
    if((ROLE==='portal_admin'||ROLE==='admin') && selectedOrg){
      visible = visible.filter(cp => (cpMeta(cp).org_id || '') === selectedOrg);
    }

    renderStatusCards(visible, statusData);

    if(!visible.length){
      grid.innerHTML = `<div class="col-12"><div class="alert alert-info mb-0">Inga laddare matchar valt filter.</div></div>`;
      return;
    }

    visible.forEach(cpId=>{
      const cpStat = statusData[cpId] || {};
      const meta = cpMeta(cpId);
      const c1 = cpStat[1];
      const c2 = cpStat[2];

      const col = document.createElement('div');
      col.className = 'col-12 col-md-6 col-lg-4';
      col.innerHTML = `
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <h5 class="card-title d-flex align-items-center gap-2">
              <i class="bi bi-ev-front"></i> ${meta.alias || displayCpId(cpId)}
              ${(ROLE==='portal_admin'||ROLE==='admin') && meta.org_id ? `<span class="badge text-bg-secondary ms-auto">${meta.org_id}</span>` : ''}
            </h5>
            <div class="small text-muted mb-2">ID: ${cpId}</div>
            <div class="mb-2">
              <strong>Uttag 1:</strong>
              <span class="${UI.statusClass(c1?.status)}">${UI.statusLabelSv(c1?.status)}</span>
            </div>
            <div>
              <strong>Uttag 2:</strong>
              <span class="${UI.statusClass(c2?.status)}">${UI.statusLabelSv(c2?.status)}</span>
            </div>
          </div>
        </div>`;
      grid.appendChild(col);
    });
  }

  function renderSnapshot(){
    renderGrid(LAST_CPS, LAST_STATUS);
  }

  // ------- Poll-loop -------
  let timer = null;
  async function tick(){
    try{
      const [cpsRes, statusRes] = await Promise.all([
        UI.getJSON(API.cps),
        UI.getJSON(API.status)
      ]);
      LAST_CPS = cpsRes?.connected || [];
      LAST_STATUS = statusRes || {};
      renderSnapshot();
      setLastRefresh();
    }catch(e){
      if(String(e).includes('401')){ if(timer){ clearInterval(timer); timer = null; } return; }
      showAlert(`Kunde inte läsa från API: ${e.message}`);
      console.error(e);
    }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['portal_admin','admin'] });
    if(!me) return;

    await initOrgFilterIfPortal();
    await tick();
    timer = setInterval(tick, POLL_MS);

    document.addEventListener('visibilitychange', ()=>{
      if (document.hidden) { if (timer) { clearInterval(timer); timer = null; } }
      else { if (!timer) { tick(); timer = setInterval(tick, POLL_MS); } }
    });
  });
})();
