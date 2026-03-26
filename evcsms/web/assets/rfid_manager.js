(function(){
  const API = {
    me: '/api/auth/me',
    orgs: '/api/orgs',
    users: '/api/users/map',
    rfids: '/api/rfids',
    audit: '/api/rfids/audit',
    importTemplate: '/api/rfids/import/template.xlsx',
    importXlsx:     '/api/rfids/import/xlsx',
  };

  const RFID_PREVIEW_COUNT = 5;

  const state = {
    me: null,
    users: {},
    allUsers: {},
    orgs: {},
    items: [],
    listExpanded: false,
    auditItems: [],
    auditExpanded: false,
    editingTag: null,
  };

  const $ = (s) => document.querySelector(s);

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function parseBool(v){
    return String(v) === 'true';
  }

  function normalizeTag(tag){
    return String(tag || '').trim().toUpperCase();
  }

  function tagStatusBadge(active){
    return active ? '<span class="badge text-bg-success">Aktiv</span>' : '<span class="badge text-bg-secondary">Inaktiv</span>';
  }

  function usersForSelect(orgId){
    const rows = Object.values(state.users || {}).filter((u) => {
      if (!u?.email) return false;
      if (!orgId) return true;
      return (u.org_id || '') === orgId;
    });
    const byEmail = new Map();
    rows.forEach((u) => {
      const email = String(u.email || '').trim().toLowerCase();
      if (email && !byEmail.has(email)) byEmail.set(email, u);
    });
    const uniqueRows = Array.from(byEmail.values());
    uniqueRows.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
    return uniqueRows;
  }

  function fillUsersSelect(orgId, currentEmail = ''){
    const sel = $('#rfidUser');
    if (!sel) return;
    const rows = usersForSelect(orgId);

    // If there is a current user assigned but they are not in the list
    // (e.g. assigned to another RFID), inject them so the edit form shows them.
    const emailLower = (currentEmail || '').trim().toLowerCase();
    if (emailLower && !rows.some((u) => (u.email || '').toLowerCase() === emailLower)) {
      const ghost = Object.values(state.allUsers || {}).find(
        (u) => (u.email || '').toLowerCase() === emailLower
      );
      if (ghost) rows.unshift(ghost);
    }

    const unassignLabel = emailLower
      ? 'Avregistrera RFID från användare'
      : 'Ej tilldelad';

    sel.innerHTML = `<option value="">${esc(unassignLabel)}</option>` + rows
      .map((u) => `<option value="${esc(u.email)}">${esc(u.name || u.email)} (${esc(u.email)})</option>`)
      .join('');

    if (emailLower && rows.some((u) => (u.email || '').toLowerCase() === emailLower)) {
      sel.value = emailLower;
    }
  }

  function fillOrgSelect(){
    const orgSel = $('#rfidOrg');
    const filterOrg = $('#rfidFilterOrg');
    if (orgSel) {
      orgSel.innerHTML = Object.entries(state.orgs)
        .map(([id, o]) => `<option value="${esc(id)}">${esc(o?.name || id)} (${esc(id)})</option>`)
        .join('');
    }
    if (filterOrg) {
      filterOrg.innerHTML = '<option value="">Alla</option>' + Object.entries(state.orgs)
        .map(([id, o]) => `<option value="${esc(id)}">${esc(o?.name || id)} (${esc(id)})</option>`)
        .join('');
    }

    if ((state.me?.role || '').toLowerCase() === 'org_admin') {
      if (orgSel) orgSel.value = state.me.org_id || '';
      if (orgSel) orgSel.setAttribute('disabled', 'disabled');
    }

    fillUsersSelect(orgSel ? orgSel.value : state.me.org_id);
  }

  function renderTable(){
    const tbody = $('#rfid-table tbody');
    const toggleBtn = $('#btnToggleRfidList');
    const summary = $('#rfidListSummary');
    const foot = $('#rfidListFootnote');
    if (!tbody) return;

    const role = (state.me?.role || '').toLowerCase();
    const q = ($('#rfidFilter')?.value || '').trim().toLowerCase();
    const orgFilter = $('#rfidFilterOrg')?.value || '';

    let rows = (state.items || []).slice();
    if (orgFilter) rows = rows.filter((r) => (r.org_id || '') === orgFilter);
    if (q) {
      rows = rows.filter((r) => {
        const hay = `${r.alias || ''} ${r.tag || ''} ${r.user_email || ''} ${r.org_id || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }

    const total = rows.length;
    const expanded = !!state.listExpanded;
    const visibleRows = expanded ? rows : rows.slice(0, RFID_PREVIEW_COUNT);

    if (summary) {
      if (!total) summary.textContent = 'Ingen RFID att visa.';
      else summary.textContent = `Visar ${visibleRows.length} av ${total} RFID-taggar.`;
    }

    if (toggleBtn) {
      const showToggle = total > RFID_PREVIEW_COUNT;
      toggleBtn.classList.toggle('d-none', !showToggle);
      toggleBtn.textContent = expanded ? 'Visa färre' : 'Visa alla';
      toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    if (!visibleRows.length) {
      const colspan = role === 'org_admin' ? 5 : 6;
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted">Inga RFID-taggar.</td></tr>`;
      if (foot) foot.textContent = '';
      return;
    }

    if (role === 'org_admin') {
      tbody.innerHTML = visibleRows.map((r) => `
        <tr>
          <td>${esc(r.alias || r.tag)}</td>
          <td><code>${esc(r.tag)}</code></td>
          <td>${esc(r.user_email || '-')}</td>
          <td>${tagStatusBadge(!!r.active)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary" data-edit="${esc(r.tag)}" type="button">Redigera</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${esc(r.tag)}" type="button">Ta bort</button>
          </td>
        </tr>`).join('');
    } else {
      tbody.innerHTML = visibleRows.map((r) => `
        <tr>
          <td>${esc(r.alias || r.tag)}</td>
          <td><code>${esc(r.tag)}</code></td>
          <td>${esc(r.org_name || r.org_id || '')}</td>
          <td>${esc(r.user_email || '-')}</td>
          <td>${tagStatusBadge(!!r.active)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary" data-edit="${esc(r.tag)}" type="button">Redigera</button>
            <button class="btn btn-sm btn-outline-danger" data-del="${esc(r.tag)}" type="button">Ta bort</button>
          </td>
        </tr>`).join('');
    }

    if (foot) foot.textContent = '';

    document.querySelectorAll('#rfid-table [data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tag = btn.getAttribute('data-edit');
        startEdit(tag);
      });
    });

    document.querySelectorAll('#rfid-table [data-unassign]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tag = btn.getAttribute('data-unassign');
        if (!tag || !confirm(`Ta bort användartilldelning för tagg ${tag}?`)) return;
        try {
          await fetch(`${API.rfids}/${encodeURIComponent(tag)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_email: null }),
          }).then(async (r) => {
            if (!r.ok) throw new Error(await r.text());
            return r.json();
          });
          await refresh();
        } catch (e) {
          UI.alert(`Kunde inte avkoppla: ${e.message || e}`);
        }
      });
    });

    document.querySelectorAll('#rfid-table [data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tag = btn.getAttribute('data-del');
        if (!tag || !confirm(`Ta bort tagg ${tag}?`)) return;
        try {
          await UI.deleteJSON(`${API.rfids}/${encodeURIComponent(tag)}`);
          await refresh();
        } catch (e) {
          UI.alert(`Kunde inte ta bort: ${e.message || e}`);
        }
      });
    });
  }

  function startEdit(tag){
    const ntag = normalizeTag(tag);
    const row = (state.items || []).find((r) => normalizeTag(r.tag) === ntag);
    if (!row) return;
    state.editingTag = ntag;

    $('#rfidTag').value = ntag;
    $('#rfidTag').setAttribute('disabled', 'disabled');
    $('#rfidAlias').value = row.alias || '';
    if ($('#rfidOrg')) {
      $('#rfidOrg').value = row.org_id || '';
      fillUsersSelect($('#rfidOrg').value, row.user_email || '');
    } else {
      fillUsersSelect(state.me.org_id, row.user_email || '');
    }
    // value is already set inside fillUsersSelect when currentEmail provided
    $('#rfidActive').value = String(!!row.active);
    $('#rfidSubmitLabel').textContent = 'Spara ändringar';
    $('#btnCancelEdit').classList.remove('d-none');
  }

  function resetForm(){
    state.editingTag = null;
    $('#rfid-form')?.reset();
    $('#rfidTag')?.removeAttribute('disabled');
    $('#rfidSubmitLabel').textContent = 'Skapa RFID';
    $('#btnCancelEdit')?.classList.add('d-none');
    if ($('#rfidOrg')) {
      if ((state.me?.role || '').toLowerCase() === 'org_admin') {
        $('#rfidOrg').value = state.me.org_id || '';
      }
      fillUsersSelect($('#rfidOrg').value || state.me.org_id);
    } else {
      fillUsersSelect(state.me.org_id);
    }
    const sel = $('#rfidUser');
    if (sel) sel.value = '';
  }

  async function saveRfid(e){
    e.preventDefault();
    e.stopPropagation();

    const form = $('#rfid-form');
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;

    const role = (state.me?.role || '').toLowerCase();
    const tag = normalizeTag($('#rfidTag').value);
    const payload = {
      alias: ($('#rfidAlias')?.value || '').trim() || tag,
      user_email: ($('#rfidUser')?.value || '').trim() || null,
      active: parseBool($('#rfidActive')?.value || 'true'),
    };

    if (role !== 'org_admin') {
      payload.org_id = ($('#rfidOrg')?.value || '').trim();
    }

    try {
      if (state.editingTag) {
        await fetch(`${API.rfids}/${encodeURIComponent(state.editingTag)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(async (r) => {
          if (!r.ok) throw new Error(await r.text());
          return r.json();
        });
      } else {
        await UI.postJSON(API.rfids, {
          tag,
          alias: payload.alias,
          user_email: payload.user_email,
          active: payload.active,
          org_id: role === 'org_admin' ? state.me.org_id : payload.org_id,
        });
      }
      resetForm();
      await refresh();
    } catch (e2) {
      UI.alert(`Kunde inte spara RFID: ${e2.message || e2}`);
    }
  }

  function renderAudit(rows){
    const tbody = $('#rfid-audit-table tbody');
    const toggleBtn = $('#btnToggleRfidAudit');
    const summary = $('#rfidAuditSummary');
    if (!tbody) return;
    const allRows = Array.isArray(rows) ? rows : [];
    const total = allRows.length;
    const expanded = !!state.auditExpanded;
    const visibleRows = expanded ? allRows : allRows.slice(0, RFID_PREVIEW_COUNT);

    if (summary) {
      if (!total) summary.textContent = 'Ingen historik att visa.';
      else if (expanded) summary.textContent = `Visar alla ${total} händelser.`;
      else summary.textContent = `Visar ${visibleRows.length} av ${total} händelser.`;
    }

    if (toggleBtn) {
      const showToggle = total > RFID_PREVIEW_COUNT;
      toggleBtn.classList.toggle('d-none', !showToggle);
      toggleBtn.textContent = expanded ? 'Visa färre' : 'Visa alla';
      toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    if (!visibleRows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Ingen historik.</td></tr>';
      return;
    }

    tbody.innerHTML = visibleRows.map((r) => `
      <tr>
        <td>${esc(r.at || '')}</td>
        <td>${esc(r.actor_email || '')}</td>
        <td>${esc(r.action || '')}</td>
        <td><code>${esc(r.tag || '')}</code></td>
        <td><small>${esc(JSON.stringify(r.details || {}))}</small></td>
      </tr>`).join('');
  }

  async function refresh(){
    const role = (state.me?.role || '').toLowerCase();
    const qs = new URLSearchParams();
    if (role === 'org_admin') {
      qs.set('org_id', state.me.org_id || '');
    }
    const data = await UI.getJSON(`${API.rfids}?${qs.toString()}`);
    state.items = data.items || [];
    renderTable();

    const auditHost = $('#rfid-audit-table');
    if (auditHost) {
      const audit = await UI.getJSON(`${API.audit}?limit=1000`);
      state.auditItems = audit.items || [];
      renderAudit(state.auditItems);
    }
  }

  function toggleAuditExpanded(){
    state.auditExpanded = !state.auditExpanded;
    renderAudit(state.auditItems);
  }

  function toggleListExpanded(){
    state.listExpanded = !state.listExpanded;
    renderTable();
  }

  async function downloadRfidTemplate(){
    try{
      const r = await fetch(API.importTemplate, { cache: 'no-store' });
      if(!r.ok) throw new Error(`${API.importTemplate} -> ${r.status}`);
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'rfid_import_template.xlsx';
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
    }catch(e){
      UI.alert(`Kunde inte ladda ner XLSX-mall: ${e.message || e}`);
    }
  }

  function renderRfidImportResults(payload){
    const tbody   = document.getElementById('rfidImportResults');
    const summary = document.getElementById('rfidImportSummary');
    if(!tbody || !summary) return;

    const s = payload?.summary || {};
    summary.textContent = `Rader: ${s.total_rows ?? 0} | Importerade: ${s.imported ?? 0} | Fel: ${s.failed ?? 0} | Hoppade över: ${s.skipped ?? 0}${payload?.dry_run ? ' (testkörning)' : ''}`;

    const rows = Array.isArray(payload?.results) ? payload.results : [];
    if(!rows.length){
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Inga rader i resultatet.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((r)=>{
      const status = String(r.status || 'ok');
      const badge  = status === 'ok'
        ? '<span class="badge text-bg-success">OK</span>'
        : status === 'skipped'
          ? '<span class="badge text-bg-secondary">SKIP</span>'
          : '<span class="badge text-bg-danger">FEL</span>';
      return `<tr>
        <td>${esc(r.line ?? '-')}</td>
        <td>${badge}</td>
        <td><code style="word-break:break-all;">${esc(r.tag || '-')}</code></td>
        <td style="word-break:break-word;">${esc(r.message || '-')}</td>
      </tr>`;
    }).join('');
  }

  async function importRfidsXlsx(){
    const input  = document.getElementById('rfidImportFile');
    const dryRun = !!document.getElementById('rfidImportDryRun')?.checked;
    const btn    = document.getElementById('btnImportRfids');
    const file   = input?.files?.[0];
    if(!file){ UI.alert('Välj en XLSX-fil först.'); return; }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('dry_run', dryRun ? 'true' : 'false');

    try{
      if(btn) btn.disabled = true;
      const r    = await fetch(API.importXlsx, { method: 'POST', body: fd });
      const text = await r.text();
      let payload = {};
      try{ payload = JSON.parse(text || '{}'); }catch{ payload = {}; }
      if(!r.ok) throw new Error(text || `${API.importXlsx} -> ${r.status}`);

      renderRfidImportResults(payload);
      if(!dryRun && (payload?.summary?.imported || 0) > 0){
        await refresh();
      }
      const msg = dryRun ? 'XLSX testkörning klar' : 'XLSX-import klar';
      const kind = dryRun ? 'info' : 'success';
      const toastEl = document.querySelector('#toast-stack');
      if(toastEl){
        const id = 't_'+Date.now();
        toastEl.insertAdjacentHTML('beforeend',
          `<div id="${id}" class="toast align-items-center text-bg-${kind} border-0">
            <div class="d-flex"><div class="toast-body">${esc(msg)}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div>`);
        try{ new bootstrap.Toast(document.getElementById(id),{delay:2500}).show(); }catch{}
      }
      if(input) input.value = '';
    }catch(e){
      UI.alert(`Kunde inte importera XLSX: ${e.message || e}`);
    }finally{
      if(btn) btn.disabled = false;
    }
  }

  async function bootstrap(){
    state.me = await UI.initPage({ requiredRoles: ['org_admin', 'portal_admin', 'admin'] });
    if (!state.me) return;

    state.orgs = await UI.getJSON(API.orgs);

    const [allUsers, unassignedUsers] = await Promise.all([
      UI.getJSON(API.users).catch(() => ({})),
      UI.getJSON('/api/users/unassigned').catch(() => ({}))
    ]);
    state.allUsers = allUsers;
    // Only users without RFID should appear in "Tilldela användare".
    state.users = unassignedUsers;

    fillOrgSelect();
    resetForm();

    $('#rfidOrg')?.addEventListener('change', () => fillUsersSelect($('#rfidOrg').value));
    $('#rfidFilter')?.addEventListener('input', renderTable);
    $('#rfidFilterOrg')?.addEventListener('change', renderTable);
    $('#btnRefreshRfid')?.addEventListener('click', refresh);
    $('#btnCancelEdit')?.addEventListener('click', resetForm);
    $('#rfid-form')?.addEventListener('submit', saveRfid);
    $('#btnToggleRfidList')?.addEventListener('click', toggleListExpanded);
    $('#btnToggleRfidAudit')?.addEventListener('click', toggleAuditExpanded);

    document.getElementById('btnDownloadRfidTemplate')?.addEventListener('click', downloadRfidTemplate);
    document.getElementById('btnImportRfids')?.addEventListener('click', importRfidsXlsx);

    await refresh();
  }

  document.addEventListener('DOMContentLoaded', () => {
    bootstrap().catch((e) => UI.alert(`RFID-sidan kunde inte starta: ${e.message || e}`));
  });
})();
