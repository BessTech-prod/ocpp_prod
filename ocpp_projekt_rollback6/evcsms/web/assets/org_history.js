// /assets/org_history.js  (v2) — Historik + CSV-export
(function(){
  const API = { hist:'/api/users/history', umap:'/api/users/map' };

  const $ = (s)=>document.querySelector(s);
  const esc=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  function alertBox(msg,kind='danger',t=4500){
    const el=document.getElementById('page-alerts'); if(!el) return;
    if(!msg){ el.innerHTML=''; return; }
    el.innerHTML=`<div class="alert alert-${kind}">${esc(msg)}</div>`;
    if(t>0) setTimeout(()=> el.innerHTML='', t);
  }

  let ME=null, CURRENT_ROWS=[];

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

    if(!CURRENT_ROWS.length){
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Ingen historik.</td></tr>`;
      if(foot) foot.textContent='';
      return;
    }

    tbody.innerHTML = CURRENT_ROWS.map(r=>`
      <tr>
        <td>${esc(r.stop_time)}</td>
        <td>${esc(r.name)}</td>
        <td><code>${esc(r.tag)}</code></td>
        <td>${esc(r.charge_box)}</td>
        <td>${esc(String(r.connector))}</td>
        <td>${esc(r.energy_kwh.toLocaleString('sv-SE', { maximumFractionDigits: 3 }))}</td>
      </tr>`).join('');

    if(foot) foot.textContent = `Visar ${CURRENT_ROWS.length} laddsessioner (senaste ${hist?.period_days ?? ''} dagar).`;
  }

  function exportCsv(){
    if(!CURRENT_ROWS.length){ alertBox('Inget att exportera.','warning'); return; }
    const SEP=';';
    const escCsv = (v)=>{ const s=String(v??''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
    const lines=[['Sluttid','Namn','RFID','Laddare','Uttag','Energi (kWh)'].join(SEP)];
    CURRENT_ROWS.forEach(r=>{
      lines.push([r.stop_time, r.name, r.tag, r.charge_box, String(r.connector), r.energy_kwh.toLocaleString('sv-SE', { maximumFractionDigits: 3 })].map(escCsv).join(SEP));
    });
    const content = '\uFEFF'+lines.join('\r\n');
    const blob = new Blob([content], {type:'text/csv;charset=utf-8;'});
    const now=new Date(), pad=n=>String(n).padStart(2,'0');
    const ts=`${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`historik_${ME?.org_id||'org'}_${ts}.csv`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  async function refresh(){
    try{
      const days = Number(document.getElementById('days')?.value || 30) || 30;
      const tag  = (document.getElementById('tagFilter')?.value || '').trim() || undefined;
      const { hist, umap } = await fetchData(days, tag);
      render(hist, umap);
    }catch(e){ alertBox(`Kunde inte läsa historik: ${e.message}`); }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['org_admin'] }); if(!me) return;
    ME = me;
    document.getElementById('btnRefresh')?.addEventListener('click', refresh);
    document.getElementById('btnExportCsv')?.addEventListener('click', exportCsv);
    document.getElementById('days')?.addEventListener('change', refresh);
    document.getElementById('tagFilter')?.addEventListener('keyup', (e)=>{ if(e.key==='Enter') refresh(); });
    await refresh();
  });
})();
