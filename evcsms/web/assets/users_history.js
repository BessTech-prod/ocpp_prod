// /assets/users_history.js  (v2)
(function(){
  const API = { hist:'/api/users/history', umap:'/api/users/map', orgs:'/api/orgs' };
  const HISTORY_PREVIEW_COUNT = 5;
  const $=(s)=>document.querySelector(s), $$=(s)=>document.querySelectorAll(s);
  const esc=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function alertBox(msg,kind='danger',t=4500){ const el=document.getElementById('page-alerts'); if(!el)return; if(!msg){el.innerHTML='';return;} el.innerHTML=`<div class="alert alert-${kind}">${esc(msg)}</div>`; if(t>0)setTimeout(()=>el.innerHTML='',t); }
  let LAST_RENDER_ROWS = [];
  let LAST_ROLE = '';
  let LAST_PERIOD_DAYS = '';
  let historyListExpanded = false;

  function updateHistoryCompactUi(total, visibleCount, expanded){
    const summary = document.getElementById('historyListSummary');
    const toggle = document.getElementById('btnToggleHistoryList');
    if (summary) {
      if (!total) summary.textContent = 'Ingen historik att visa.';
      else summary.textContent = '';
    }
    if (toggle) {
      const showToggle = total > HISTORY_PREVIEW_COUNT;
      toggle.classList.toggle('d-none', !showToggle);
      toggle.textContent = expanded ? 'Visa färre' : 'Visa alla';
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
  }

  function drawHistoryRows(rows, role){
    const tbody=$('#hist-table tbody');
    const foot=$('#listFootnote');
    const summary=$('#historyListSummary');
    const visibleRows = historyListExpanded ? rows : rows.slice(0, HISTORY_PREVIEW_COUNT);
    updateHistoryCompactUi(rows.length, visibleRows.length, historyListExpanded);
    if (summary && rows.length) {
      summary.textContent = `Visar ${visibleRows.length} av ${rows.length} laddsessioner (senaste ${LAST_PERIOD_DAYS} dagar).`;
    }
    if(!rows.length){
      tbody.innerHTML=`<tr><td colspan="${role==='portal_admin'||role==='admin'?7:6}" class="text-center text-muted">Ingen historik.</td></tr>`;
      if(foot) foot.textContent='';
      return;
    }
    tbody.innerHTML=visibleRows.map(r=>{
      const orgCell = (role==='portal_admin'||role==='admin'||role==='org_admin') ? `<td><code>${esc(r.org||'')}</code></td>` : '';
      return `<tr>
        <td>${esc(r.stop_time||'')}</td><td>${esc(r.name||'')}</td><td><code>${esc(r.tag||'')}</code></td>
        <td>${esc(r.cp||'')}</td><td>${esc(String(r.connectorId??''))}</td>
        <td>${esc(Number(r.energy_kwh??0).toLocaleString('sv-SE',{maximumFractionDigits:3}))}</td>
        ${orgCell}
      </tr>`;
    }).join('');
    if(foot) foot.textContent='';
  }

  async function initOrgFilter(role){
    const wrap=$('#orgFilterWrap'), sel=$('#orgFilter'), thOrg=$('#thOrg');
    if(role==='portal_admin'||role==='admin'){
      if(wrap) wrap.style.display=''; if(thOrg) thOrg.style.display='';
      try{ const orgs=await UI.getJSON(API.orgs); sel.innerHTML=`<option value="">Alla organisationer</option>` + Object.entries(orgs).map(([id,o])=>`<option value="${esc(id)}">${esc(o?.name||id)} (${esc(id)})</option>`).join(''); sel.addEventListener('change', refresh); }
      catch(e){ console.warn('Org-filter kunde inte laddas', e.message); }
      // tagFilterWrap visas redan i HTML
      $('#tagFilterWrap')?.style.setProperty('display','');
    } else if (role==='org_admin'){
      if(wrap) wrap.style.display='none';
      if(thOrg) thOrg.style.display='';
      $('#tagFilterWrap')?.style.setProperty('display','none');
    } else { // user
      if(wrap) wrap.style.display='none';
      if(thOrg) thOrg.style.display='none';
      $('#tagFilterWrap')?.style.setProperty('display','none');
    }
  }

  async function fetchData(days, tag){
    const qs=new URLSearchParams(); if(days) qs.set('days', String(days)); if(tag) qs.set('tag', tag);
    const [hist, umap]=await Promise.all([UI.getJSON(`${API.hist}?${qs.toString()}`), UI.getJSON(API.umap)]);
    return { hist, umap };
  }

  function render(hist, umap, role){
    const orgFilter=$('#orgFilter')?.value||'';
    const rows=Array.isArray(hist?.items)?hist.items.slice():[];
    const tagOrg={}; Object.entries(umap||{}).forEach(([t,u])=> tagOrg[t]=u?.org_id||'');
    let filtered=rows;
    if((role==='portal_admin'||role==='admin') && orgFilter){ filtered=rows.filter(r=>(tagOrg[r.tag]||'')===orgFilter); }
    filtered.sort((a,b)=> String(b.stop_time||'').localeCompare(String(a.stop_time||'')));
    LAST_ROLE = role;
    LAST_PERIOD_DAYS = String(hist?.period_days ?? '');
    LAST_RENDER_ROWS = filtered.map(r=>{
      const nm=r.name || (umap?.[r.tag]?.name || [umap?.[r.tag]?.first_name, umap?.[r.tag]?.last_name].filter(Boolean).join(' ') || r.tag);
      const cp=r.charge_point?String(r.charge_point).split('/').pop():'';
      return {
        stop_time: r.stop_time||'',
        name: nm,
        tag: r.tag||'',
        cp,
        connectorId: r.connectorId,
        energy_kwh: r.energy_kwh??0,
        org: tagOrg[r.tag]||''
      };
    });
    drawHistoryRows(LAST_RENDER_ROWS, role);
  }

  async function refresh(){
    try{
      const me = await UI.getJSON('/api/auth/me');
      const role=(me.role||'').toLowerCase();
      const days=Number(document.getElementById('days')?.value||30)||30;
      const tag=(document.getElementById('tagFilter')?.value||'').trim()||undefined;
      const {hist,umap}=await fetchData(days, tag);
      render(hist, umap, role);
    }catch(e){ alertBox(`Kunde inte läsa historik: ${e.message}`); }
  }

  function toggleHistoryList(){
    historyListExpanded = !historyListExpanded;
    drawHistoryRows(LAST_RENDER_ROWS, LAST_ROLE);
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['org_admin','portal_admin','admin'] }); if(!me) return;
    await initOrgFilter((me.role||'').toLowerCase());
    document.getElementById('btnRefresh')?.addEventListener('click', refresh);
    document.getElementById('btnToggleHistoryList')?.addEventListener('click', toggleHistoryList);
    document.getElementById('days')?.addEventListener('change', refresh);
    await refresh();
  });
})();
