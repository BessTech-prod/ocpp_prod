// /assets/org_index.js  (v2)
(function(){
  const API = { cps:'/api/cps', status:'/api/status' };

  const $ = (s)=>document.querySelector(s);

  function displayCpId(x){
    try { return String(x||'').split('/').pop() || String(x||''); }
    catch { return String(x||''); }
  }
  function statusClass(s){
    const v=(s||'').toLowerCase();
    if(v==='charging') return 'badge status-charging';
    if(v==='available') return 'badge status-available';
    if(v==='preparing'||v==='finishing') return 'badge status-preparing';
    if(v==='suspendedev'||v==='suspendedevse'||v==='suspended') return 'badge status-suspended';
    if(v==='faulted') return 'badge status-faulted';
    if(v==='unavailable') return 'badge status-unavailable';
    return 'badge status-unknown';
  }

  function render(cps, status){
    const grid = $('#cp-grid'); grid.innerHTML='';
    if(!cps || !cps.length){
      grid.innerHTML = `<div class="col-12"><div class="alert alert-warning mb-0">Ingen laddare ansluten ännu.</div></div>`;
      return;
    }
    cps.forEach(id=>{
      const s=status[id]||{}, c1=s[1], c2=s[2];
      const col=document.createElement('div');
      col.className='col-12 col-md-6 col-lg-4';
      col.innerHTML=`
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <h5 class="card-title d-flex align-items-center gap-2"><i class="bi bi-ev-front"></i> ${displayCpId(id)}</h5>
            <div class="mb-2"><strong>Uttag 1:</strong> <span class="${statusClass(c1?.status)}">${c1?.status||'Ingen data'}</span></div>
            <div><strong>Uttag 2:</strong> <span class="${statusClass(c2?.status)}">${c2?.status||'Ingen data'}</span></div>
          </div>
        </div>`;
      grid.appendChild(col);
    });
  }

  let timer=null;
  async function tick(){
    try{
      const [cps,status] = await Promise.all([UI.getJSON(API.cps), UI.getJSON(API.status)]);
      render(cps.connected, status);
      const ts=$('#last-refresh'); if(ts) ts.textContent='Senast: '+new Date().toLocaleTimeString();
    }catch(e){
      if(String(e).includes('401')){ if(timer){ clearInterval(timer); timer=null; } return; }
      console.error(e);
    }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['org_admin'] }); if(!me) return;
    await tick();
    timer = setInterval(tick, 2000);
    document.addEventListener('visibilitychange', ()=>{
      if(document.hidden){ if(timer){ clearInterval(timer); timer=null; } }
      else { if(!timer){ tick(); timer=setInterval(tick,2000); } }
    });
  });
})();
