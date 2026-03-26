// /assets/org_index.js  (v2)
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

  function displayCpId(x){
    try { return String(x||'').split('/').pop() || String(x||''); }
    catch { return String(x||''); }
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
      <div class="col-6 col-lg-4"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">Lediga uttag</div><div class="h3 m-0">${counters.available}</div></div></div></div>
      <div class="col-6 col-lg-4"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">Laddar nu</div><div class="h3 m-0">${counters.charging}</div></div></div></div>
      <div class="col-6 col-lg-4"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">Uttag ur drift</div><div class="h3 m-0">${counters.faulted}</div></div></div></div>`;
  }

  function render(cps, status, aliases){
    const grid = $('#cp-grid'); grid.innerHTML='';
    renderStatusCards(cps || [], status || {});
    if(!cps || !cps.length){
      grid.innerHTML = `<div class="col-12"><div class="alert alert-warning mb-0">Ingen laddare ansluten ännu.</div></div>`;
      return;
    }
    cps.forEach(id=>{
      const s=status[id]||{}, c1=s[1], c2=s[2];
      const alias = (aliases && aliases[id]) || displayCpId(id);
      const col=document.createElement('div');
      col.className='col-12 col-md-6 col-lg-4';
      col.innerHTML=`
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <h5 class="card-title d-flex align-items-center gap-2"><i class="bi bi-ev-front"></i> ${alias}</h5>
            <div class="small text-muted mb-2">ID: ${id}</div>
            <div class="mb-2"><strong>Uttag 1:</strong> <span class="${UI.statusClass(c1?.status)}">${UI.statusLabelSv(c1?.status)}</span></div>
            <div><strong>Uttag 2:</strong> <span class="${UI.statusClass(c2?.status)}">${UI.statusLabelSv(c2?.status)}</span></div>
          </div>
        </div>`;
      grid.appendChild(col);
    });
  }

  let timer=null;
  async function tick(){
    try{
      const [cps,status] = await Promise.all([UI.getJSON(API.cps), UI.getJSON(API.status)]);
      render(cps.connected, status, cps.aliases || {});
      const ts=$('#last-refresh'); if(ts) ts.textContent='Senast: '+new Date().toLocaleTimeString();
    }catch(e){
      if(String(e).includes('401')){ if(timer){ clearInterval(timer); timer=null; } return; }
      console.error(e);
    }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['org_admin'] }); if(!me) return;
    setDashboardHeading(me);
    await tick();
    timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', ()=>{
      if(document.hidden){ if(timer){ clearInterval(timer); timer=null; } }
      else { if(!timer){ tick(); timer=setInterval(tick,POLL_MS); } }
    });
  });
})();
