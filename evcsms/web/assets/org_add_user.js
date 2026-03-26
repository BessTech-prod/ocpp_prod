// /assets/org_add_user.js  (v3)
(function(){
  const API = {
    map:'/api/users/map',
    rfids:'/api/rfids',
    unassigned:'/api/users/unassigned',
    importTemplate:'/api/users/import/template.xlsx',
    importCsv:'/api/users/import/xlsx'
  };
  const NEW_TAG_VALUE = '__new__';
  const UNASSIGN_TAG_VALUE = '__unassign__';
  const NO_RFID_VALUE = '__none__';
  const USER_LIST_PREVIEW_COUNT = 5;

  const $  = (s)=>document.querySelector(s);
  const $$ = (s)=>document.querySelectorAll(s);
  const esc= (s)=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const normalizeTag = (v)=>String(v||'').trim().toUpperCase();

  let ME = null;
  let usersListExpanded = false;
  let unassignedListExpanded = false;

  function updateCompactListUi(summaryId, toggleId, total, visibleCount, noun, expanded){
    const summary = $(summaryId);
    const toggle = $(toggleId);
    if (summary) {
      if (!total) summary.textContent = `Inga ${noun} att visa.`;
      else summary.textContent = `Visar ${visibleCount} av ${total} ${noun}.`;
    }
    if (toggle) {
      const showToggle = total > USER_LIST_PREVIEW_COUNT;
      toggle.classList.toggle('d-none', !showToggle);
      toggle.textContent = expanded ? 'Visa färre' : 'Visa alla';
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
  }

  function alertBox(msg,kind='danger',t=4500){
    const el=$('#page-alerts'); if(!el) return;
    if(!msg){ el.innerHTML=''; return; }
    el.innerHTML=`<div class="alert alert-${kind}">${esc(msg)}</div>`;
    if(t>0) setTimeout(()=> el.innerHTML='', t);
  }

  function toast(msg,variant='success'){
    const host=$('#toast-stack'); if(!host) return;
    const id='t_'+Date.now();
    host.insertAdjacentHTML('beforeend', `
      <div id="${id}" class="toast align-items-center text-bg-${variant} border-0">
        <div class="d-flex">
          <div class="toast-body">${esc(msg)}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>`);
    try{ new bootstrap.Toast(document.getElementById(id),{delay:2200}).show(); }catch{}
  }

  async function postJSON(url, body){
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> '')}`);
    return r.json();
  }

  async function patchJSON(url, body){
    const r=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> '')}`);
    return r.json();
  }

  async function delJSON(url){
    const r=await fetch(url,{method:'DELETE'});
    if(!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> '')}`);
    return r.json();
  }

  async function fetchUsers(){ return UI.getJSON(API.map); }

  function normalizeRole(v){
    const s=String(v||'').toLowerCase();
    if(['org_admin','org admin','org-admin','organisations-admin','organisation admin'].includes(s)) return 'org_admin';
    return 'user';
  }

  function toggleManualTagInput(){
    const sel = $('#rfidTagSelect');
    const input = $('#rfidTag');
    if(!sel || !input) return;
    const isNew = sel.value === NEW_TAG_VALUE;
    if(isNew){
      input.disabled = false;
      input.required = true;
      return;
    }
    input.disabled = true;
    input.required = false;
    input.value = '';
  }

  function resolveSelectedTag(){
    const sel = $('#rfidTagSelect');
    if(!sel) return '';
    if(sel.value === UNASSIGN_TAG_VALUE) return UNASSIGN_TAG_VALUE;
    if(sel.value === NO_RFID_VALUE)      return NO_RFID_VALUE;
    if(sel.value === NEW_TAG_VALUE)      return normalizeTag($('#rfidTag')?.value || '');
    return normalizeTag(sel.value || '');
  }

  async function loadRfidOptions(orgId, currentTag=''){
    const sel = $('#rfidTagSelect');
    if(!sel) return;

    let items = [];
    try{
      const res = await UI.getJSON(`${API.rfids}?org_id=${encodeURIComponent(orgId)}&assigned=false`);
      items = Array.isArray(res?.items) ? res.items : [];
    }catch(e){
      console.warn('Kunde inte ladda RFID-lista', e);
    }

    const exists = !!currentTag && items.some((it)=>normalizeTag(it.tag)===normalizeTag(currentTag));
    sel.innerHTML = `<option value="">— Välj RFID —</option>` +
      (!currentTag ? `<option value="${NO_RFID_VALUE}">Ej tilldelad (utan RFID)</option>` : '') +
      `<option value="${NEW_TAG_VALUE}">Ny tagg...</option>` +
      items.map((it)=>`<option value="${esc(it.tag)}">${esc(it.alias || it.tag)} (${esc(it.tag)})</option>`).join('');

    if(currentTag){
      sel.innerHTML += `<option value="${UNASSIGN_TAG_VALUE}">Avregistrera RFID från användare</option>`;
    }

    if(currentTag && !exists){
      sel.innerHTML += `<option value="${esc(currentTag)}">${esc(currentTag)} (nuvarande)</option>`;
    }
    if(currentTag) sel.value = currentTag;
    toggleManualTagInput();
  }

  function renderList(map){
    const tbody=$('#users-table tbody'), foot=$('#listFootnote'); if(!tbody) return;
    const q=($('#filterInput')?.value||'').toLowerCase();
    const rows = Object.entries(map||{}).map(([tag,u])=>{
      const name = u?.name || [u?.first_name,u?.last_name].filter(Boolean).join(' ') || tag;
      const alias = u?.rfid_alias || tag;
      return { tag, alias, name, user: u };
    }).filter(r=> !q || r.name.toLowerCase().includes(q) || r.alias.toLowerCase().includes(q) || r.tag.toLowerCase().includes(q))
      .sort((a,b)=> a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    const visibleRows = usersListExpanded ? rows : rows.slice(0, USER_LIST_PREVIEW_COUNT);
    updateCompactListUi('#usersListSummary', '#btnToggleUsersList', rows.length, visibleRows.length, 'användare', usersListExpanded);
    if(!rows.length){ tbody.innerHTML=`<tr><td colspan="3" class="text-center text-muted">Inga användare.</td></tr>`; if(foot) foot.textContent=''; return; }
    tbody.innerHTML = visibleRows.map(r=>`
      <tr>
        <td>${esc(r.name)}</td>
        <td><code>${esc(r.alias)}</code></td>
        <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-edit="${esc(r.tag)}" type="button"><i class="bi bi-pencil"></i> Redigera</button> <button class="btn btn-sm btn-outline-danger" data-del="${esc(r.tag)}" type="button"><i class="bi bi-trash"></i> Ta bort</button></td>
      </tr>`).join('');
    if(foot) foot.textContent = '';

    $$('#users-table button[data-edit]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const tag=btn.getAttribute('data-edit'); if(!tag) return;
        const u = Object.entries(map||{}).find(([t])=> t===tag)?.[1];
        if(!u) return;

        $('#firstName').value = u.first_name || '';
        $('#lastName').value = u.last_name || '';
        $('#role').value = u.role || 'user';
        $('#email').value = u.email || '';
        $('#password').value = '';
        $('#editingTag').value = tag;
        await loadRfidOptions(ME?.org_id || '', tag);

        $('#btnSaveLabel').textContent = 'Uppdatera';
        $('#btnCancel').classList.remove('d-none');
        $('#add-user-form')?.scrollIntoView({behavior:'smooth'});
      });
    });

    $$('#users-table button[data-del]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const tag=btn.getAttribute('data-del'); if(!tag) return;
        if(!confirm(`Ta bort användare med RFID ${tag}?`)) return;
        try{ await delJSON(`${API.map}?tag=${encodeURIComponent(tag)}`); toast('Borttagen'); await refresh(); }
        catch(e){ alertBox(`Kunde inte ta bort: ${e.message}`); }
      });
    });
  }

  async function refresh(){
    try{
      const map = await fetchUsers();
      renderList(map);
      const umap = await UI.getJSON(API.unassigned);
      renderUnassignedList(umap);
    }catch(e){ alertBox(`Kunde inte läsa användare: ${e.message}`); }
  }

  function renderUnassignedList(map){
    const tbody=$('#unassigned-table tbody');
    const foot=$('#unassignedFootnote');
    const badge=$('#unassignedCount');
    if(!tbody) return;

    const rows=Object.entries(map||{}).map(([tag,u])=>{
      const name=u?.name || [u?.first_name,u?.last_name].filter(Boolean).join(' ') || tag;
      return { tag, name, email:u?.email||'', user:u };
    }).sort((a,b)=>a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    const visibleRows = unassignedListExpanded ? rows : rows.slice(0, USER_LIST_PREVIEW_COUNT);

    if(badge) badge.textContent = rows.length || '';
    updateCompactListUi('#unassignedListSummary', '#btnToggleUnassignedList', rows.length, visibleRows.length, 'inaktiva användare', unassignedListExpanded);
    if(!rows.length){
      tbody.innerHTML=`<tr><td colspan="3" class="text-center text-muted">Inga inaktiva användare.</td></tr>`;
      if(foot) foot.textContent=''; return;
    }

    tbody.innerHTML=visibleRows.map(r=>`
      <tr>
        <td>${esc(r.name)}</td>
        <td><small class="text-muted">${esc(r.email)}</small></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary" data-edit-u="${esc(r.tag)}" type="button"><i class="bi bi-pencil"></i> Redigera</button>
          <button class="btn btn-sm btn-outline-danger" data-del-u="${esc(r.tag)}" type="button"><i class="bi bi-trash"></i> Ta bort</button>
        </td>
      </tr>`).join('');
    if(foot) foot.textContent='';

    $$('#unassigned-table button[data-edit-u]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const tag=btn.getAttribute('data-edit-u'); if(!tag) return;
        const u=map[tag]; if(!u) return;
        $('#firstName').value  = u.first_name || '';
        $('#lastName').value   = u.last_name  || '';
        $('#role').value       = u.role       || 'user';
        $('#email').value      = u.email      || '';
        $('#password').value   = '';
        $('#editingTag').value = tag;
        await loadRfidOptions(ME?.org_id||'', '', true);
        $('#btnSaveLabel').textContent = 'Uppdatera';
        $('#btnCancel').classList.remove('d-none');
        $('#add-user-form')?.scrollIntoView({behavior:'smooth'});
      });
    });

    $$('#unassigned-table button[data-del-u]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const tag=btn.getAttribute('data-del-u'); if(!tag) return;
        if(!confirm(`Ta bort användare med RFID ${tag}?`)) return;
        try{ await delJSON(`${API.map}?tag=${encodeURIComponent(tag)}`); toast('Borttagen'); await refresh(); }
        catch(e){ alertBox(`Kunde inte ta bort: ${e.message}`); }
      });
    });
  }

  function renderImportResults(payload){
    const tbody = document.getElementById('csvImportResults');
    const summary = document.getElementById('csvImportSummary');
    if(!tbody || !summary) return;

    const s = payload?.summary || {};
    summary.textContent = `Rader: ${s.total_rows ?? 0} | Importerade: ${s.imported ?? 0} | Fel: ${s.failed ?? 0} | Hoppade över: ${s.skipped ?? 0}${payload?.dry_run ? ' (testkörning)' : ''}`;

    const rows = Array.isArray(payload?.results) ? payload.results : [];
    if(!rows.length){
      tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Inga rader i resultatet.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((r)=>{
      const status = String(r.status || 'ok');
      const badge = status === 'ok'
        ? '<span class="badge text-bg-success">OK</span>'
        : status === 'skipped'
          ? '<span class="badge text-bg-secondary">SKIP</span>'
          : '<span class="badge text-bg-danger">FEL</span>';
      const msg = r.message || [r.email, r.tag].filter(Boolean).join(' / ') || '-';
      return `<tr><td>${esc(r.line ?? '-')}</td><td>${badge}</td><td>${esc(msg)}</td></tr>`;
    }).join('');
  }

  async function downloadTemplate(){
    try{
      const r = await fetch(API.importTemplate, { cache: 'no-store' });
      if(!r.ok) throw new Error(`${API.importTemplate} -> ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'users_import_template.xlsx';
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
    }catch(e){
      alertBox(`Kunde inte ladda ner XLSX-mall: ${e.message || e}`);
    }
  }

  async function importUsersCsv(){
    const input = document.getElementById('csvImportFile');
    const dryRun = !!document.getElementById('csvImportDryRun')?.checked;
    const btn = document.getElementById('btnImportUsersCsv');
    const file = input?.files?.[0];
    if(!file){
      alertBox('Välj en XLSX-fil först.','warning');
      return;
    }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('dry_run', dryRun ? 'true' : 'false');

    try{
      if(btn) btn.disabled = true;
      const r = await fetch(API.importCsv, { method: 'POST', body: fd });
      const text = await r.text();
      let payload = {};
      try{ payload = JSON.parse(text || '{}'); }catch{ payload = {}; }
      if(!r.ok) throw new Error(text || `${API.importCsv} -> ${r.status}`);

      renderImportResults(payload);
      if(!dryRun && (payload?.summary?.imported || 0) > 0){
        await refresh();
      }
      toast(dryRun ? 'XLSX testkörning klar' : 'XLSX import klar', 'success');
      if(input) input.value = '';
    }catch(e){
      alertBox(`Kunde inte importera XLSX: ${e.message || e}`);
    }finally{
      if(btn) btn.disabled = false;
    }
  }

  function toggleUsersList(){
    usersListExpanded = !usersListExpanded;
    refresh();
  }

  function toggleUnassignedList(){
    unassignedListExpanded = !unassignedListExpanded;
    refresh();
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['org_admin'] }); if(!me) return;
    ME = me;
    $('#orgReadonly').textContent = me.org_name ? `${me.org_name} (${me.org_id||''})` : (me.org_id || '(okänd org)');
    await loadRfidOptions(me.org_id || '');

    $('#btnRefreshList')?.addEventListener('click', refresh);
    $('#filterInput')?.addEventListener('input', refresh);
    $('#btnToggleUsersList')?.addEventListener('click', toggleUsersList);
    $('#btnToggleUnassignedList')?.addEventListener('click', toggleUnassignedList);
    $('#rfidTagSelect')?.addEventListener('change', toggleManualTagInput);
    document.getElementById('btnDownloadUserTemplate')?.addEventListener('click', downloadTemplate);
    document.getElementById('btnImportUsersCsv')?.addEventListener('click', importUsersCsv);

    const form = $('#add-user-form');

    $('#btnCancel')?.addEventListener('click', ()=>{
      form.reset();
      form.classList.remove('was-validated');
      $('#editingTag').value = '';
      $('#btnSaveLabel').textContent = 'Lägg till';
      $('#btnCancel').classList.add('d-none');
      $('#rfidTagSelect').disabled = false;
      $('#rfidTag').disabled = false;
      loadRfidOptions(me.org_id || '');
    });

    $('#btnSaveUser')?.addEventListener('click', async (e)=>{
      e.preventDefault(); e.stopPropagation(); form.classList.add('was-validated');
      if(!form.checkValidity()) return;

      const isEditing = $('#editingTag').value !== '';
      const selectedTag = resolveSelectedTag();
      const oldTag = normalizeTag($('#editingTag')?.value || '');
      const payload = {
        tag: isEditing ? oldTag : (selectedTag === NO_RFID_VALUE ? '' : selectedTag),
        first_name: ($('#firstName')?.value||'').trim(),
        last_name:  ($('#lastName')?.value||'').trim(),
        name: `${($('#firstName')?.value||'').trim()} ${($('#lastName')?.value||'').trim()}`.trim(),
        email: ($('#email')?.value||'').trim().toLowerCase(),
        role: normalizeRole($('#role')?.value),
        org_id: me.org_id || '',
        password: ($('#password')?.value||undefined)
      };

      if(!payload.tag && selectedTag !== NO_RFID_VALUE){
        alertBox('Välj en befintlig RFID eller ange en ny tagg.','warning');
        return;
      }

      try{
        if (isEditing && selectedTag === UNASSIGN_TAG_VALUE){
          await delJSON(`${API.map}?tag=${encodeURIComponent(oldTag)}&revoke=false`);
        } else {
          if (isEditing && selectedTag && selectedTag !== oldTag){
            payload.tag = selectedTag;
            payload.old_tag = oldTag;
          }
          await postJSON(API.map, payload);
        }
        const action = isEditing ? 'uppdaterad' : 'sparad';
        toast(`Användaren "${payload.name}" ${action}`,'success');
        form.reset();
        form.classList.remove('was-validated');
        $('#editingTag').value = '';
        $('#btnSaveLabel').textContent = 'Lägg till';
        $('#btnCancel').classList.add('d-none');
        $('#rfidTagSelect').disabled = false;
        $('#rfidTag').disabled = false;
        await loadRfidOptions(me.org_id || '');
        await refresh();
      }
      catch(e){ alertBox(`Kunde inte spara: ${e.message}`); }
    });

    await refresh();
  });
})();
