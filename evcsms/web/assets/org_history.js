// /assets/org_history.js  (v3) — Historik + XLSX-export
(function(){
  const API = { hist:'/api/users/history', umap:'/api/users/map', exportXlsx:'/api/users/history/export.xlsx' };
 const HISTORY_PREVIEW_COUNT = 5;

  const $ = (s)=>document.querySelector(s);
  const esc=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  function alertBox(msg,kind='danger',t=4500){
    const el=document.getElementById('page-alerts'); if(!el) return;
    if(!msg){ el.innerHTML=''; return; }
    el.innerHTML=`<div class="alert alert-${kind}">${esc(msg)}</div>`;
    if(t>0) setTimeout(()=> el.innerHTML='', t);
  }

  let ME=null, CURRENT_ROWS=[], historyListExpanded=false;

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

  async function fetchData(days, tag){
    const qs=new URLSearchParams(); if(days) qs.set('days', String(days)); if(tag) qs.set('tag', tag);
    const [hist, umap] = await Promise.all([
      UI.getJSON(`${API.hist}?${qs.toString()}`),
      UI.getJSON(API.umap)
    ]);
    return { hist, umap };
  }

  function render(hist, umap){
    const tbody = document.querySelector('#hist-table tbody');
    const foot  = document.getElementById('listFootnote');
    const summary = document.getElementById('historyListSummary');
    const items = Array.isArray(hist?.items) ? hist.items.slice() : [];
    items.sort((a,b)=> String(b.stop_time||'').localeCompare(String(a.stop_time||'')));

    const nameOf = (tag, provided) => {
      if (provided) return provided;
      const u=umap?.[tag];
      if(!u) return tag;
      return u.name || [u.first_name, u.last_name].filter(Boolean).join(' ') || tag;
    };

    CURRENT_ROWS = items.map(r=>({
      stop_time : r.stop_time||'',
      name      : nameOf(r.tag, r.name),
      tag       : r.tag||'',
      charge_box: r.charge_point? String(r.charge_point).split('/').pop() : '',
      connector : (r.connectorId??''),
      energy_kwh: (typeof r.energy_kwh==='number' ? r.energy_kwh : Number(r.energy_kwh||0))
    }));

    const visibleRows = historyListExpanded ? CURRENT_ROWS : CURRENT_ROWS.slice(0, HISTORY_PREVIEW_COUNT);
    updateHistoryCompactUi(CURRENT_ROWS.length, visibleRows.length, historyListExpanded);
    if (summary && CURRENT_ROWS.length) {
      summary.textContent = `Visar ${visibleRows.length} av ${CURRENT_ROWS.length} laddsessioner (senaste ${hist?.period_days ?? ''} dagar).`;
    }

    if(!CURRENT_ROWS.length){
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Ingen historik.</td></tr>`;
      if(foot) foot.textContent='';
      return;
    }

    tbody.innerHTML = visibleRows.map(r=>`
      <tr>
        <td>${esc(r.stop_time)}</td>
        <td>${esc(r.name)}</td>
        <td><code>${esc(r.tag)}</code></td>
        <td>${esc(r.charge_box)}</td>
        <td>${esc(String(r.connector))}</td>
        <td>${esc(r.energy_kwh.toLocaleString('sv-SE', { maximumFractionDigits: 3 }))}</td>
      </tr>`).join('');

    if(foot) foot.textContent = '';
  }

  async function exportXlsx(){
    if(!CURRENT_ROWS.length){ alertBox('Inget att exportera.','warning'); return; }
    try{
      const days = Number(document.getElementById('days')?.value || 30) || 30;
      const tag  = (document.getElementById('tagFilter')?.value || '').trim();
      const qs = new URLSearchParams({ days: String(days) });
      if(tag) qs.set('tag', tag);

      const r = await fetch(`${API.exportXlsx}?${qs.toString()}`, { cache:'no-store' });
      if(!r.ok) throw new Error(`${API.exportXlsx} -> ${r.status}`);

      const blob = await r.blob();
      const cd = r.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^";]+)"?/i);
      const fallback = `historik_${ME?.org_id||'org'}_${new Date().toISOString().slice(0,16).replace(/[-:T]/g,'')}.xlsx`;
      const filename = (m && m[1]) ? m[1] : fallback;

      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }catch(e){
      alertBox(`Kunde inte exportera XLSX: ${e.message || e}`);
    }
  }

  async function refresh(){
    try{
      const days = Number(document.getElementById('days')?.value || 30) || 30;
      const tag  = (document.getElementById('tagFilter')?.value || '').trim() || undefined;
      const { hist, umap } = await fetchData(days, tag);
      render(hist, umap);
    }catch(e){ alertBox(`Kunde inte läsa historik: ${e.message}`); }
  }

  function toggleHistoryList(){
    historyListExpanded = !historyListExpanded;
    const tbody = document.querySelector('#hist-table tbody');
    if (tbody) {
      // re-render based on already loaded dataset
      const foot = document.getElementById('listFootnote');
      const summary = document.getElementById('historyListSummary');
      const visibleRows = historyListExpanded ? CURRENT_ROWS : CURRENT_ROWS.slice(0, HISTORY_PREVIEW_COUNT);
      updateHistoryCompactUi(CURRENT_ROWS.length, visibleRows.length, historyListExpanded);
      if (summary && CURRENT_ROWS.length) {
        summary.textContent = `Visar ${visibleRows.length} av ${CURRENT_ROWS.length} laddsessioner (senaste ${document.getElementById('days')?.value || ''} dagar).`;
      }
      if(!CURRENT_ROWS.length){
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Ingen historik.</td></tr>`;
        if(foot) foot.textContent='';
        return;
      }
      tbody.innerHTML = visibleRows.map(r=>`
        <tr>
          <td>${esc(r.stop_time)}</td>
          <td>${esc(r.name)}</td>
          <td><code>${esc(r.tag)}</code></td>
          <td>${esc(r.charge_box)}</td>
          <td>${esc(String(r.connector))}</td>
          <td>${esc(r.energy_kwh.toLocaleString('sv-SE', { maximumFractionDigits: 3 }))}</td>
        </tr>`).join('');
      if(foot) foot.textContent = '';
    }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['org_admin'] }); if(!me) return;
    ME = me;
    document.getElementById('btnRefresh')?.addEventListener('click', refresh);
    document.getElementById('btnExportXlsx')?.addEventListener('click', exportXlsx);
    document.getElementById('btnToggleHistoryList')?.addEventListener('click', toggleHistoryList);
    document.getElementById('days')?.addEventListener('change', refresh);
    document.getElementById('tagFilter')?.addEventListener('keyup', (e)=>{ if(e.key==='Enter') refresh(); });
    await refresh();
  });
})();
