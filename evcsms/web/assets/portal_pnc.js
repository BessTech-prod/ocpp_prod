(function(){
  const API = {
    chargers: '/api/pnc/chargers',
    chargerPatch: (id) => `/api/pnc/chargers/${encodeURIComponent(id)}`,
    emaids: '/api/pnc/emaids',
    emaidPatch: (id) => `/api/pnc/emaids/${encodeURIComponent(id)}`,
    emaidDelete: (id) => `/api/pnc/emaids/${encodeURIComponent(id)}`,
    events: '/api/pnc/events',
    blockedEmaids: '/api/pnc/blocked_emaids',
    clearBlockedEmaids: '/api/pnc/blocked_emaids/clear',
    orgs: '/api/orgs',
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const state = {
    chargers: [],
    emaids: [],
    events: [],
    blockedEmaids: [],
    orgs: {},
    editingEmaid: null,
    eventTimer: null,
  };

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ── Data fetching ─────────────────────────────────────────────────

  async function fetchOrgs(){
    try {
      state.orgs = await UI.getJSON(API.orgs);
    } catch(e){ state.orgs = {}; }
    renderOrgSelect();
  }

  async function fetchChargers(){
    try {
      const res = await UI.getJSON(API.chargers);
      state.chargers = res.items || [];
    } catch(e){ state.chargers = []; }
    renderChargers();
  }

  async function fetchEmaids(){
    try {
      const res = await UI.getJSON(API.emaids);
      state.emaids = res.items || [];
    } catch(e){ state.emaids = []; }
    renderEmaids();
  }

  async function fetchEvents(){
    try {
      const res = await UI.getJSON(`${API.events}?limit=200`);
      state.events = res.items || [];
    } catch(e){ state.events = []; }
    renderEvents();
  }

  // ── Org select ────────────────────────────────────────────────────

  function renderOrgSelect(){
    const sel = $('#emaidOrg');
    if (!sel) return;
    sel.innerHTML = Object.entries(state.orgs)
      .map(([id, o]) => `<option value="${esc(id)}">${esc(o.name || id)}</option>`)
      .join('');
    if (!sel.value && sel.options.length) sel.selectedIndex = 0;
  }

  // ── Chargers table ────────────────────────────────────────────────

  function renderChargers(){
    const tbody = $('#chargersTable tbody');
    if (!tbody) return;
    if (!state.chargers.length){
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Inga laddare registrerade.</td></tr>';
      return;
    }
    tbody.innerHTML = state.chargers.map((c) => {
      const orgName = state.orgs[c.org_id]?.name || c.org_id || 'default';
      const checked = c.pnc_enabled ? 'checked' : '';
      const ts = c.updated_at ? new Date(c.updated_at).toLocaleString('sv-SE') : '–';
      return `<tr>
        <td>
          <div class="fw-bold">${esc(c.alias || c.cp_id)}</div>
          <div class="text-muted small">${esc(c.cp_id)}</div>
        </td>
        <td>${esc(orgName)}</td>
        <td>
          <div class="form-check form-switch">
            <input class="form-check-input pnc-toggle" type="checkbox" data-cpid="${esc(c.cp_id)}" ${checked}>
          </div>
        </td>
        <td class="small">${esc(ts)}</td>
        <td class="small text-muted">${esc(c.updated_by || '–')}</td>
      </tr>`;
    }).join('');
  }

  async function togglePnc(cpId, enabled){
    try {
      await UI.patchJSON(API.chargerPatch(cpId), { pnc_enabled: enabled });
      await fetchChargers();
    } catch(e){
      UI.alert('Kunde inte uppdatera PnC-status: ' + (e.message || e));
      await fetchChargers();
    }
  }

  // ── eMAID table ───────────────────────────────────────────────────

  function renderEmaids(){
    const tbody = $('#emaidsTable tbody');
    if (!tbody) return;
    if (!state.emaids.length){
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Inga eMAID i vitlistan.</td></tr>';
      return;
    }
    tbody.innerHTML = state.emaids.map((e) => {
      const orgName = state.orgs[e.org_id]?.name || e.org_id || 'default';
      const badge = e.active
        ? '<span class="badge bg-success">Aktiv</span>'
        : '<span class="badge bg-secondary">Inaktiv</span>';
      const ts = e.updated_at ? new Date(e.updated_at).toLocaleString('sv-SE') : '–';
      return `<tr>
        <td class="fw-bold font-monospace">${esc(e.emaid)}</td>
        <td>${esc(e.alias || '–')}</td>
        <td>${esc(orgName)}</td>
        <td>${badge}</td>
        <td class="small">${esc(ts)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary btn-edit-emaid" data-emaid="${esc(e.emaid)}" title="Redigera"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger btn-delete-emaid" data-emaid="${esc(e.emaid)}" title="Ta bort"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  }

  function startEditEmaid(emaid){
    const entry = state.emaids.find(e => e.emaid === emaid);
    if (!entry) return;
    state.editingEmaid = emaid;
    $('#emaidInput').value = entry.emaid;
    $('#emaidInput').disabled = true;
    $('#emaidAlias').value = entry.alias || '';
    if ($('#emaidOrg')) $('#emaidOrg').value = entry.org_id || 'default';
    $('#emaidActive').value = entry.active ? 'true' : 'false';
    $('#emaidSubmitLabel').textContent = 'Uppdatera';
    $('#btnCancelEmaid').classList.remove('d-none');
  }

  function cancelEditEmaid(){
    state.editingEmaid = null;
    $('#emaidInput').value = '';
    $('#emaidInput').disabled = false;
    $('#emaidAlias').value = '';
    $('#emaidActive').value = 'true';
    $('#emaidSubmitLabel').textContent = 'Lägg till';
    $('#btnCancelEmaid').classList.add('d-none');
  }

  async function saveEmaid(evt){
    evt.preventDefault();
    const emaid = ($('#emaidInput')?.value || '').trim().toUpperCase();
    const alias = ($('#emaidAlias')?.value || '').trim();
    const orgId = ($('#emaidOrg')?.value || 'default').trim();
    const active = $('#emaidActive')?.value === 'true';

    if (!emaid){
      UI.alert('Ange en eMAID.');
      return;
    }

    try {
      if (state.editingEmaid){
        await UI.patchJSON(API.emaidPatch(state.editingEmaid), { alias, active, org_id: orgId });
      } else {
        await UI.postJSON(API.emaids, { emaid, alias, active, org_id: orgId });
      }
      cancelEditEmaid();
      await fetchEmaids();
      await fetchBlockedEmaids();
    } catch(e){
      UI.alert('Kunde inte spara eMAID: ' + (e.message || e));
    }
  }

  async function deleteEmaid(emaid){
    if (!confirm(`Ta bort eMAID ${emaid} från vitlistan?`)) return;
    try {
      const resp = await fetch(API.emaidDelete(emaid), { method: 'DELETE', credentials: 'same-origin' });
      if (!resp.ok){
        const err = await resp.json().catch(()=>({detail: resp.statusText}));
        throw new Error(err.detail || resp.statusText);
      }
      await fetchEmaids();
    } catch(e){
      UI.alert('Kunde inte ta bort eMAID: ' + (e.message || e));
    }
  }

  // ── Blocked eMAIDs table ──────────────────────────────────────────

  async function fetchBlockedEmaids(){
    try {
      const res = await UI.getJSON(API.blockedEmaids);
      state.blockedEmaids = res.items || [];
    } catch(e){ state.blockedEmaids = []; }
    renderBlockedEmaids();
  }

  function renderBlockedEmaids(){
    const tbody = $('#blockedEmaidsTable tbody');
    if (!tbody) return;
    const rows = state.blockedEmaids || [];
    if (!rows.length){
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">Inga nekade eMAID-försök loggade.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((r) => {
      const ts = r.timestamp ? new Date(r.timestamp).toLocaleString('sv-SE') : '–';
      return `<tr>
        <td class="small">${esc(ts)}</td>
        <td class="font-monospace">${esc(r.emaid || '–')}</td>
        <td>${esc(r.cp_id || '–')}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-primary btn-whitelist-blocked" data-blocked-emaid="${esc(r.emaid)}" type="button">
            <i class="bi bi-plus-circle"></i> Vitlista
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  function whitelistBlocked(emaid){
    window.scrollTo({ top: 0, behavior: 'smooth' });
    cancelEditEmaid();
    $('#emaidInput').value = emaid;
    const formPanel = $('#emaid-form').closest('.content-panel');
    if (formPanel){
      formPanel.classList.add('highlight-pulse');
      setTimeout(() => formPanel.classList.remove('highlight-pulse'), 2000);
    }
    UI.alert(`Fyll i alias för ${emaid} och klicka "Lägg till" för att vitlista.`, 'info');
  }

  async function clearBlockedEmaids(){
    if (!confirm('Vill du rensa listan på alla nekade eMAID-försök?')) return;
    try {
      await UI.postJSON(API.clearBlockedEmaids, {});
      await fetchBlockedEmaids();
    } catch(e){
      UI.alert('Kunde inte rensa: ' + (e.message || e));
    }
  }

  // ── Events table ──────────────────────────────────────────────────

  function renderEvents(){
    const tbody = $('#eventsTable tbody');
    if (!tbody) return;
    if (!state.events.length){
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Inga PnC-händelser loggade ännu.</td></tr>';
      return;
    }
    tbody.innerHTML = state.events.map((ev) => {
      const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleString('sv-SE') : '–';
      const badge = ev.result === 'Accepted'
        ? '<span class="badge bg-success">Accepted</span>'
        : '<span class="badge bg-danger">Rejected</span>';
      return `<tr>
        <td class="small">${esc(ts)}</td>
        <td>${esc(ev.cp_id || '–')}</td>
        <td class="font-monospace small">${esc(ev.emaid || '–')}</td>
        <td>${esc(ev.alias || '–')}</td>
        <td>${badge}</td>
        <td class="small">${esc(ev.reason || '–')}</td>
      </tr>`;
    }).join('');
    const meta = $('#eventMeta');
    if (meta) meta.textContent = `Senast uppdaterad: ${new Date().toLocaleTimeString()} — Visar ${state.events.length} händelser.`;
  }

  // ── Event delegation ──────────────────────────────────────────────

  function setupListeners(){
    document.addEventListener('click', (e) => {
      const toggle = e.target.closest('.pnc-toggle');
      if (toggle){
        const cpId = toggle.dataset.cpid;
        togglePnc(cpId, toggle.checked);
        return;
      }
      const editBtn = e.target.closest('.btn-edit-emaid');
      if (editBtn){
        startEditEmaid(editBtn.dataset.emaid);
        return;
      }
      const deleteBtn = e.target.closest('.btn-delete-emaid');
      if (deleteBtn){
        deleteEmaid(deleteBtn.dataset.emaid);
        return;
      }
      const whitelistBtn = e.target.closest('.btn-whitelist-blocked');
      if (whitelistBtn){
        whitelistBlocked(whitelistBtn.dataset.blockedEmaid);
        return;
      }
    });

    const clearBtn = $('#btnClearBlockedEmaids');
    if (clearBtn) clearBtn.addEventListener('click', clearBlockedEmaids);

    const form = $('#emaid-form');
    if (form) form.addEventListener('submit', saveEmaid);

    const cancelBtn = $('#btnCancelEmaid');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelEditEmaid);
  }

  // ── Init ──────────────────────────────────────────────────────────

  async function init(){
    const me = await UI.initPage({ requiredRoles: ['portal_admin', 'admin', 'installer'] });
    if (!me) return;

    await fetchOrgs();
    await Promise.all([fetchChargers(), fetchEmaids(), fetchEvents(), fetchBlockedEmaids()]);
    setupListeners();
    state.eventTimer = setInterval(fetchEvents, 10000);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
