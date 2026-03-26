// /assets/portal_cps.js  (v1)
(function(){
  const $  = (s)=>document.querySelector(s);
  const $$ = (s)=>document.querySelectorAll(s);
  const esc= (s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const API = { cps:'/api/cps', status:'/api/status', orgs:'/api/orgs', map:'/api/cps/map' };

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
  async function getJSON(url){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok){ if(r.status===401){ window.location.href='/login.html'; } throw new Error(`${url} -> ${r.status}`);} return r.json(); }
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
    const rows = Object.entries(map||{}).sort((a,b)=> a[0].localeCompare(b[0])).map(([cp,meta])=>`
      <tr>
        <td>${esc(meta.alias || cp)}</td>
        <td><code>${esc(cp)}</code></td>
        <td><code>${esc(meta.org_id || 'default')}</code></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary" data-edit="${esc(cp)}" type="button"><i class="bi bi-pencil"></i> Redigera</button>
          <button class="btn btn-sm btn-outline-danger" data-unassign="${esc(cp)}" type="button"><i class="bi bi-trash"></i> Ta bort</button>
        </td>
      </tr>`).join('');
    tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center text-muted">Ingen mappning ännu.</td></tr>`;

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
    const cps = unionCpList(cpsResp, stResp);
    const map = normalizeMap(mapRaw);
    $('#cpPick').innerHTML  = cps.map(cp => {
      const alias = map?.[cp]?.alias || cp;
      return `<option value="${esc(cp)}">${esc(alias)} (${esc(cp)})</option>`;
    }).join('');
    $('#orgPick').innerHTML = Object.entries(orgs).map(([id, o]) => `<option value="${esc(id)}">${esc(o?.name||id)} (${esc(id)})</option>`).join('');
  }

  async function refresh(){
    const map = normalizeMap(await getJSON(API.map));
    renderTable(map);
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['portal_admin','admin'] }); if(!me) return;
    await initFormLists();
    await refresh();

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
