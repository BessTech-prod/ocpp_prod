// /assets/portal_cps.js  (v1)
(function(){
  const $  = (s)=>document.querySelector(s);
  const $$ = (s)=>document.querySelectorAll(s);
  const esc= (s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const API = { cps:'/api/cps', status:'/api/status', orgs:'/api/orgs', map:'/api/cps/map' };
  const state = { orgs: {}, lastMap: {} };

  function alertBox(msg,kind='danger',t=4500){
    const el=$('#page-alerts'); if(!el)return;
    if(!msg){ el.innerHTML=''; return; }
    el.innerHTML=`<div class="alert alert-${kind}">${esc(msg)}</div>`;
    if(t>0) setTimeout(()=>el.innerHTML='',t);
  }
  function toast(msg, variant='success'){
    const el=$('#toast-stack'); if(!el)return;
    const id='t_'+Date.now();
    el.insertAdjacentHTML('beforeend', `<div id="${id}" class="toast align-items-center text-bg-${variant} border-0">
      <div class="d-flex"><div class="toast-body">${esc(msg)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div>`);
    new bootstrap.Toast(document.getElementById(id),{delay:2200}).show();
  }
  async function getJSON(url){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok){ if(r.status===401){ window.location.href='/login'; } throw new Error(`${url} -> ${r.status}`);} return r.json(); }
  async function postJSON(url, body){ const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); if(!r.ok){ throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> '')}`);} return r.json(); }
  async function del(url){ const r=await fetch(url,{method:'DELETE'}); if(!r.ok){ throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> '')}`);} return r.json(); }

  function normalizeMap(raw){
    const out = {};
    Object.entries(raw || {}).forEach(([cp, entry]) => {
      if (entry && typeof entry === 'object') {
        out[cp] = {
          org_id: String(entry.org_id || 'default'),
          alias: String(entry.alias || cp),
        };
      } else {
        out[cp] = {
          org_id: String(entry || 'default'),
          alias: cp,
        };
      }
    });
    return out;
  }

  function unionCpList(cpsResp, statusResp){
    const set = new Set(cpsResp?.connected || []);
    Object.keys(statusResp || {}).forEach(k => set.add(k));
    return Array.from(set).sort((a,b)=> a.localeCompare(b));
  }

  function renderTable(map){
    const tbody = $('#cps-table tbody'); if(!tbody) return;
    const filter = $('#tableFilterOrg')?.value || '';
    
    let entries = Object.entries(map||{}).sort((a,b)=> a[0].localeCompare(b[0]));
    
    if (filter === '__unassigned__') {
      entries = entries.filter(([cp, meta]) => !meta.org_id || meta.org_id === 'default');
    } else if (filter) {
      entries = entries.filter(([cp, meta]) => meta.org_id === filter);
    }

    const rows = entries.map(([cp,meta])=>{
      const isUnassigned = !meta.org_id || meta.org_id === 'default';
      const orgDisplay = isUnassigned ? '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Ny</span>' : `<span class="fw-medium">${esc(state.orgs[meta.org_id]?.name || meta.org_id)}</span>`;
      return `
      <tr>
        <td><div class="fw-bold">${esc(meta.alias || cp)}</div></td>
        <td><code class="text-primary bg-light px-2 py-1 rounded small">${esc(cp)}</code></td>
        <td>${orgDisplay}</td>
        <td class="text-end">
          <div class="btn-group shadow-sm">
            <button class="btn btn-sm btn-white border" data-edit="${esc(cp)}" type="button"><i class="bi bi-pencil text-primary"></i></button>
            <button class="btn btn-sm btn-white border" data-unassign="${esc(cp)}" type="button"><i class="bi bi-trash text-danger"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');
    tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center text-muted">Inga laddare hittades för valt filter.</td></tr>`;

    // Handle edit buttons
    $$('#cps-table button[data-edit]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const cp=btn.getAttribute('data-edit');
        if(!cp) return;
        const meta = map?.[cp];
        if(!meta) return;
        // Populate form with current data
        $('#cpPick').value = cp;
        $('#cpAlias').value = meta.alias || cp;
        $('#orgPick').value = meta.org_id || 'default';
        $('#editingCp').value = cp;
        // Update form state for editing
        $('#btnAssignLabel').textContent = 'Uppdatera';
        $('#btnCancel').classList.remove('d-none');
        $('#cpPick').disabled = true;
        // Scroll to form
        $('#cpPick')?.scrollIntoView({behavior:'smooth'});
      });
    });

    $$('#cps-table button[data-unassign]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const cp=btn.getAttribute('data-unassign');
        if(!confirm(`Ta bort koppling för ${cp}?`)) return;
        try{ await del(`${API.map}?cp_id=${encodeURIComponent(cp)}`); toast('Koppling borttagen'); await refresh(); }
        catch(e){ alertBox(`Kunde inte ta bort: ${e.message}`); }
      });
    });
  }

  async function initFormLists(){
    const [cpsResp, stResp, orgs, mapRaw] = await Promise.all([
      getJSON(API.cps), getJSON(API.status), getJSON(API.orgs), getJSON(API.map).catch(() => ({}))
    ]);
    state.orgs = orgs;
    const cps = unionCpList(cpsResp, stResp);
    const map = normalizeMap(mapRaw);
    $('#cpPick').innerHTML  = `<option value="">-- Välj en laddare --</option>` + cps.map(cp => {
      const alias = map?.[cp]?.alias || cp;
      return `<option value="${esc(cp)}">${esc(alias)} (${esc(cp)})</option>`;
    }).join('');
    
    const orgOptions = Object.entries(orgs).map(([id, o]) => `<option value="${esc(id)}">${esc(o?.name||id)} (${esc(id)})</option>`).join('');
    $('#orgPick').innerHTML = `<option value="">-- Välj organisation --</option>` + orgOptions;
    
    const filterEl = $('#tableFilterOrg');
    if (filterEl) {
      filterEl.innerHTML = `<option value="">Alla organisationer</option>
                            <option value="__unassigned__">Nya laddare</option>` + orgOptions;
    }
  }

  async function refresh(){
    const [cpsResp, stResp, orgs, mapRaw] = await Promise.all([
      getJSON(API.cps), getJSON(API.status), getJSON(API.orgs), getJSON(API.map).catch(() => ({}))
    ]);
    const allCps = unionCpList(cpsResp, stResp);
    const map = normalizeMap(mapRaw);
    
    const fullMap = {};
    allCps.forEach(cp => {
      fullMap[cp] = map[cp] || { org_id: null, alias: cp };
    });
    
    state.lastMap = fullMap;
    renderTable(fullMap);
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['portal_admin','admin','installer'] }); if(!me) return;
    await initFormLists();
    await refresh();

    $('#tableFilterOrg')?.addEventListener('change', () => {
      renderTable(state.lastMap);
    });

    // Cancel button handler
    $('#btnCancel')?.addEventListener('click', ()=>{
      $('#cpPick').value = '';
      $('#cpAlias').value = '';
      $('#orgPick').value = '';
      $('#editingCp').value = '';
      $('#btnAssignLabel').textContent = 'Tilldela';
      $('#btnCancel').classList.add('d-none');
      $('#cpPick').disabled = false;
    });

    $('#btnAssign')?.addEventListener('click', async ()=>{
      const cp  = $('#cpPick')?.value || '';
      const alias = ($('#cpAlias')?.value || '').trim();
      const org = $('#orgPick')?.value || '';
      if(!cp || !org){ alertBox('Välj både laddare och organisation.','warning'); return; }
      const isEditing = $('#editingCp').value !== '';
      try{
        await postJSON(API.map, { cp_id: cp, org_id: org, alias });
        const action = isEditing ? 'uppdaterad' : 'tilldelad';
        toast(`Laddare ${action}.`);
        $('#cpPick').value = '';
        $('#cpAlias').value = '';
        $('#orgPick').value = '';
        $('#editingCp').value = '';
        $('#btnAssignLabel').textContent = 'Tilldela';
        $('#btnCancel').classList.add('d-none');
        $('#cpPick').disabled = false;
        await refresh();
      }
      catch(e){ alertBox(`Kunde inte tilldela: ${e.message}`); }
    });
  });
})();
