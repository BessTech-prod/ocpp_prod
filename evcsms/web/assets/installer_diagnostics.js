(function(){
  const API = {
    orgs: '/api/orgs',
    diagnostics: '/api/diagnostics',
    diagDownload: (id) => `/api/diagnostics/${encodeURIComponent(id)}/download`,
    diagDelete: (id) => `/api/diagnostics/${encodeURIComponent(id)}`,
  };

  const $ = (s) => document.querySelector(s);

  const state = {
    orgs: {},
    diagnostics: [],
  };

  function esc(v){ const d = document.createElement('div'); d.textContent = v ?? ''; return d.innerHTML; }

  function statusBadge(status){
    const map = {
      'Pending': 'bg-warning text-dark',
      'Uploading': 'bg-info text-dark',
      'Uploaded': 'bg-success',
      'UploadFailure': 'bg-danger',
    };
    const cls = map[status] || 'bg-secondary';
    return `<span class="badge ${cls}">${esc(status || 'Okänd')}</span>`;
  }

  function formatSize(bytes){
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDate(iso){
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
    } catch(e){ return iso; }
  }

  async function fetchDiagnostics(){
    try {
      const res = await UI.getJSON(API.diagnostics);
      state.diagnostics = res.diagnostics || [];
    } catch(e){
      state.diagnostics = [];
    }
    renderDiagnostics();
  }

  function renderDiagnostics(){
    const container = $('#diagContainer');
    const emptyEl = $('#diagEmpty');
    if (!container) return;

    const filterOrg = ($('#orgFilter')?.value || '').trim();
    let items = state.diagnostics;
    if (filterOrg) {
      items = items.filter(d => d.org_id === filterOrg);
    }

    if (!items.length){
      container.innerHTML = '';
      if (emptyEl) {
        emptyEl.textContent = 'Inga diagnostikfiler hittades.';
        emptyEl.classList.remove('d-none');
        container.appendChild(emptyEl);
      } else {
        container.innerHTML = '<p class="text-muted">Inga diagnostikfiler hittades.</p>';
      }
      return;
    }

    const grouped = {};
    for (const d of items){
      const key = d.org_id || 'default';
      if (!grouped[key]) grouped[key] = { name: d.org_name || key, items: [] };
      grouped[key].items.push(d);
    }

    let html = '';
    for (const [orgId, group] of Object.entries(grouped)){
      html += `<div class="card border-0 shadow-sm mb-3">
        <div class="card-header bg-light">
          <h3 class="h6 mb-0"><i class="bi bi-building"></i> ${esc(group.name)} <span class="badge bg-secondary">${group.items.length}</span></h3>
        </div>
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="bg-light">
                <tr>
                  <th>Laddare</th>
                  <th>Filnamn</th>
                  <th>Storlek</th>
                  <th>Log-typ</th>
                  <th>Status</th>
                  <th>Begärd</th>
                  <th>Uppladdad</th>
                  <th>Begärd av</th>
                  <th class="text-end">Åtgärd</th>
                </tr>
              </thead>
              <tbody>`;
      for (const d of group.items){
        const hasFile = d.status === 'Uploaded' && d.filename;
        html += `<tr>
          <td><strong>${esc(d.alias)}</strong><br><small class="text-muted">${esc(d.cp_id)}</small></td>
          <td>${esc(d.filename || '—')}</td>
          <td>${formatSize(d.size_bytes)}</td>
          <td><small>${esc(d.log_type)}</small></td>
          <td>${statusBadge(d.status)}</td>
          <td><small>${formatDate(d.requested_at)}</small></td>
          <td><small>${formatDate(d.uploaded_at)}</small></td>
          <td><small>${esc(d.requested_by || '—')}</small></td>
          <td class="text-end">
            ${hasFile ? `<a href="${esc(API.diagDownload(d.id))}" class="btn btn-sm btn-outline-primary me-1" title="Ladda ner"><i class="bi bi-download"></i></a>` : ''}
            <button class="btn btn-sm btn-outline-danger btn-delete-diag" data-id="${esc(d.id)}" title="Ta bort"><i class="bi bi-trash"></i></button>
          </td>
        </tr>`;
      }
      html += `</tbody></table></div></div></div>`;
    }

    container.innerHTML = html;
  }

  async function deleteDiag(id){
    if (!confirm('Ta bort denna diagnostikpost och fil?')) return;
    try {
      const resp = await fetch(API.diagDelete(id), { method: 'DELETE', credentials: 'same-origin' });
      if (!resp.ok){
        const err = await resp.json().catch(()=>({ detail: resp.statusText }));
        throw new Error(err.detail || resp.statusText);
      }
      await fetchDiagnostics();
    } catch(e){
      UI.alert('Kunde inte ta bort: ' + (e.message || e));
    }
  }

  async function bootstrap(){
    await UI.initPage({ requiredRoles: ['portal_admin','admin','installer'] });

    try {
      state.orgs = await UI.getJSON(API.orgs);
    } catch(e){ state.orgs = {}; }

    const orgFilter = $('#orgFilter');
    if (orgFilter){
      orgFilter.innerHTML = '<option value="">Alla organisationer</option>' +
        Object.entries(state.orgs).map(([id, data])=>`<option value="${esc(id)}">${esc(data?.name || id)}</option>`).join('');
      orgFilter.addEventListener('change', renderDiagnostics);
    }

    $('#diagContainer')?.addEventListener('click', (e)=>{
      const btn = e.target.closest('.btn-delete-diag');
      if (btn) deleteDiag(btn.dataset.id);
    });

    await fetchDiagnostics();
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    bootstrap().catch((e)=>{
      const msg = e?.message || String(e);
      if (!msg.includes('redirect to login')) {
        UI.alert(`Fel vid start: ${msg}`);
      }
    });
  });
})();
