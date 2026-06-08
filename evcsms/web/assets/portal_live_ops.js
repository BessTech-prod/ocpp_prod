(function(){
  const POLL_MS = 5000;
  const API = {
    orgs: '/api/orgs',
    live: '/api/portal/live/chargers',
    status: '/api/status',
    cpsMap: '/api/cps/map',
    send: '/api/portal/ocpp/command',
    commandStatus: (id) => `/api/portal/ocpp/command/${encodeURIComponent(id)}`,
    presets: '/api/display-presets',
    presetDelete: (id) => `/api/display-presets/${encodeURIComponent(id)}`,
    presetImages: '/api/display-presets/images/'
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const state = {
    orgs: {},
    items: [],
    timer: null,
    pendingCommandId: null,
    statusTimer: null,
    presets: [],
  };

  const COMMAND_CONFIG = {
    reset: {
      label: 'Reset',
      versions: ['1.6', '2.0.1'],
      argLabel: 'Reset-typ',
      args16: ['Hard', 'Soft'],
      args201: ['Immediate', 'OnIdle'],
      showConnector: false,
    },
    change_availability: {
      label: 'Ändra tillgänglighet',
      versions: ['1.6'],
      argLabel: 'Tillgänglighet',
      args: ['Operative', 'Inoperative'],
      showConnector: true,
    },
    trigger_message: {
      label: 'TriggerMessage',
      versions: ['1.6'],
      argLabel: 'Meddelande',
      args: ['StatusNotification', 'Heartbeat', 'BootNotification', 'MeterValues', 'FirmwareStatusNotification', 'DiagnosticsStatusNotification'],
      showConnector: true,
    },
    clear_cache: {
      label: 'ClearCache',
      versions: ['1.6'],
      showConnector: false,
    },
    unlock_connector: {
      label: 'Lås up uttag',
      versions: ['1.6', '2.0.1'],
      showConnector: true,
    },
    remote_start_transaction: {
      label: 'Fjärrstart',
      versions: ['1.6', '2.0.1'],
      showConnector: true,
      showIdTag: true,
    },
    remote_stop_transaction: {
      label: 'Fjärrstop',
      versions: ['1.6', '2.0.1'],
      showConnector: true,
    },
    get_configuration: {
      label: 'Hämta konfiguration',
      versions: ['1.6', '2.0.1'],
      showConfigKeys: true,
    },
    set_variables: {
      label: 'Konfigurera',
      versions: ['2.0.1'],
      showSetVariables: true,
      showSetVarValue: true,
    },
    set_display_message: {
      label: 'Visa logotyp',
      versions: ['2.0.1'],
      showDisplayMessage: true,
    },
    get_base_report: {
      label: 'Hämta basrapport',
      versions: ['2.0.1'],
      argLabel: 'Rapport-bas',
      args: ['FullInventory', 'ConfigurationInventory', 'SummaryInventory'],
      showConnector: false,
    },
    get_report: {
      label: 'Hämta specifik rapport',
      versions: ['2.0.1'],
      showSetVariables: true,
      showSetVarValue: false,
    },
    get_log: {
      label: 'Hämta loggar',
      versions: ['2.0.1'],
      showGetLog: true,
    },
    update_firmware: {
      label: 'Uppdatera firmware',
      versions: ['2.0.1'],
      showUpdateFirmware: true,
    },
    customer_information: {
      label: 'Kundinformation',
      versions: ['2.0.1'],
      showIdTag: true,
    },
    clear_display_message: {
      label: 'Rensa displaymeddelande',
      versions: ['2.0.1'],
      showConnector: false,
    },
    get_transaction_status: {
      label: 'Transaktionsstatus',
      versions: ['2.0.1'],
      showConnector: false,
    },
  };

  const GET_CONFIGURATION_OPTIONS = [
    { value: '__all__', label: 'Alla nycklar' },
    { value: 'HeartbeatInterval', label: 'HeartbeatInterval' },
    { value: 'AuthorizeRemoteTxRequests', label: 'AuthorizeRemoteTxRequests' },
    { value: 'ConnectionTimeOut', label: 'ConnectionTimeOut' },
    { value: 'MeterValueSampleInterval', label: 'MeterValueSampleInterval' },
    { value: 'TransactionMessageRetryInterval', label: 'TransactionMessageRetryInterval' },
  ];

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function statusBadge(raw){
    const cls = UI.statusClass(raw);
    const label = UI.statusLabelSv(raw);
    return `<span class="${cls}">${esc(label)}</span>`;
  }

  async function fetchLiveFallback(orgId){
    const [statusMap, cpsMap] = await Promise.all([
      UI.getJSON(API.status),
      UI.getJSON(API.cpsMap).catch(() => ({})),
    ]);

    const items = Object.keys(statusMap || {}).sort().map((cpId) => ({
      cp_id: cpId,
      alias: (cpsMap && cpsMap[cpId] && typeof cpsMap[cpId] === 'object' ? cpsMap[cpId].alias : cpId) || cpId,
      org_id: (cpsMap && cpsMap[cpId] && typeof cpsMap[cpId] === 'object' ? cpsMap[cpId].org_id : cpsMap?.[cpId]) || 'default',
      ocpp_version: (cpsMap && cpsMap[cpId] && typeof cpsMap[cpId] === 'object' ? cpsMap[cpId].ocpp_version : null) || 'unknown',
      status: (statusMap && statusMap[cpId]) || {},
    }));

    return orgId ? items.filter((it) => (it.org_id || 'default') === orgId) : items;
  }

  async function fetchLive(){
    const orgId = ($('#orgFilter')?.value || '').trim();
    const query = orgId ? `?org_id=${encodeURIComponent(orgId)}` : '';
    const meta = $('#liveMeta');
    try {
      const res = await UI.getJSON(`${API.live}${query}`);
      state.items = res.items || [];
      renderTable();
      renderCpPick();
      if (meta) meta.textContent = `Senast uppdaterad: ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (msg.includes(`${API.live} -> 404`)) {
        try {
          state.items = await fetchLiveFallback(orgId);
          renderTable();
          renderCpPick();
          if (meta) meta.textContent = `Senast uppdaterad: ${new Date().toLocaleTimeString()} (kompatibilitetsläge)`;
          return;
        } catch (fallbackErr) {
          if (meta) meta.textContent = `Fel vid hämtning: ${fallbackErr.message || fallbackErr}`;
          return;
        }
      }
      if (meta) meta.textContent = `Fel vid hämtning: ${msg}`;
      // Do NOT rethrow — keep the polling timer alive even on transient errors
    }
  }

  function renderTable(){
    const tbody = $('#liveTable tbody');
    if (!tbody) return;

    if (!state.items.length){
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Inga anslutna laddare för valt filter.</td></tr>';
      return;
    }

    tbody.innerHTML = state.items.map((it)=>{
      const c1 = it.status?.[1]?.status;
      const c2 = it.status?.[2]?.status;
      const ts = it.status?.[1]?.timestamp || it.status?.[2]?.timestamp || '-';
      const orgName = state.orgs[it.org_id]?.name || it.org_id || 'default';
      return `<tr>
        <td>
          <div class="fw-bold">${esc(it.alias || it.cp_id)}</div>
          <div class="text-muted small">${esc(it.cp_id)}</div>
        </td>
        <td>
          <div class="fw-medium">${esc(orgName)}</div>
          <div class="text-muted small">${esc(it.org_id || 'default')}</div>
        </td>
        <td>${statusBadge(c1)}</td>
        <td>${statusBadge(c2)}</td>
        <td><div class="small text-muted">${esc(ts)}</div></td>
        <td class="text-end">
          <button class="btn btn-sm btn-white border shadow-sm" data-manage="${esc(it.cp_id)}">
            <i class="bi bi-gear text-primary me-1"></i> Hantera
          </button>
        </td>
      </tr>`;
    }).join('');

    $$('#liveTable button[data-manage]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cpId = btn.getAttribute('data-manage');
        const sel = $('#cpPick');
        if (sel) {
          sel.value = cpId;
          // Trigger change event to update command options if needed
          sel.dispatchEvent(new Event('change'));
          $('#cpPick').scrollIntoView({ behavior: 'smooth' });
          // Highlight the card
          const card = $('#cpPick').closest('.card');
          if (card) {
            card.classList.add('border-primary');
            setTimeout(() => card.classList.remove('border-primary'), 2000);
          }
        }
      });
    });
  }

  function renderCpPick(){
    const sel = $('#cpPick');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = state.items.map((it)=>{
      const ver = it.ocpp_version && it.ocpp_version !== 'unknown' ? ` [${it.ocpp_version}]` : '';
      return `<option value="${esc(it.cp_id)}">${esc(it.alias || it.cp_id)} (${esc(it.cp_id)})${esc(ver)}</option>`;
    }).join('');
    if (!state.items.length){
      sel.innerHTML = '<option value="">Ingen laddare tillgänglig</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    if (current && state.items.some((it)=>it.cp_id === current)) sel.value = current;
    buildCommandDropdown();
  }

  function findCp(cpId){
    return (state.items || []).find((it)=>it.cp_id === cpId) || null;
  }

  function cpDisplayName(cpId){
    const cp = findCp(cpId);
    if (!cp) return cpId || 'okänd laddare';
    return `${cp.alias || cp.cp_id} (${cp.cp_id})`;
  }

  function confirmDangerousCommand(command, cpId, payload){
    if (command === 'reset'){
      const resetType = payload?.type || 'Hard';
      const warning = resetType === 'Hard'
        ? 'Detta kan avbryta pågående laddning och starta om laddaren direkt.'
        : 'Detta startar om laddaren mjukt och kan påverka pågående sessioner.';
      return window.confirm(
        `Bekräfta ${resetType}-reset för ${cpDisplayName(cpId)}.\n\n${warning}\n\nVill du fortsätta?`
      );
    }

    return true;
  }

  function toggleField(id, visible){
    const el = $(id);
    if (!el) return;
    el.classList.toggle('d-none', !visible);
  }

  function getSelectedCpVersion(){
    const cpId = ($('#cpPick')?.value || '').trim();
    if (!cpId) return 'unknown';
    const item = state.items.find(it => it.cp_id === cpId);
    return item?.ocpp_version || 'unknown';
  }

  function buildCommandDropdown(){
    const sel = $('#commandPick');
    if (!sel) return;
    const version = getSelectedCpVersion();
    const current = sel.value;
    sel.innerHTML = '';

    for (const [cmd, cfg] of Object.entries(COMMAND_CONFIG)){
      if (version === 'unknown' || cfg.versions.includes(version)){
        const opt = document.createElement('option');
        opt.value = cmd;
        opt.textContent = cfg.label || cmd;
        sel.appendChild(opt);
      }
    }

    if (!sel.options.length){
      sel.innerHTML = '<option value="">Inga kommandon tillgängliga</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    if (current && [...sel.options].some(o => o.value === current)) sel.value = current;
    setCommandOptions();
  }

  function setCommandOptions(){
    const command = ($('#commandPick')?.value || '');
    if (!command) return;
    const cfg = COMMAND_CONFIG[command] || {};
    const version = getSelectedCpVersion();
    const arg = $('#commandArg');
    const argLabel = $('label[for="commandArg"]');

    // Resolve version-specific args for commands like reset
    let args = cfg.args || null;
    if (version === '1.6' && cfg.args16) args = cfg.args16;
    else if (version === '2.0.1' && cfg.args201) args = cfg.args201;
    else if (cfg.args16 && cfg.args201) args = cfg.args16.concat(cfg.args201); // unknown version: show all

    if (arg && args?.length){
      arg.innerHTML = args.map((v)=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    } else if (arg) {
      arg.innerHTML = '';
    }

    if (argLabel) argLabel.textContent = cfg.argLabel || 'Parameter';

    toggleField('#commandArgWrap', !!args?.length);
    toggleField('#connectorWrap', !!cfg.showConnector);
    toggleField('#idTagWrap', !!cfg.showIdTag);
    toggleField('#configKeyWrap', !!cfg.showConfigKeys);
    toggleField('#displayMessageWrap', !!cfg.showDisplayMessage);
    toggleField('#managePresetsWrap', !!cfg.showDisplayMessage);
    toggleField('#setVariablesWrap', !!cfg.showSetVariables);

    if (cfg.showDisplayMessage) fetchPresets();
    toggleField('#setVarValueWrap', !!cfg.showSetVarValue);
    toggleField('#getLogWrap', !!cfg.showGetLog);
    toggleField('#updateFirmwareWrap', !!cfg.showUpdateFirmware);

    const cfgSelect = $('#configKeySelect');
    if (cfgSelect && cfg.showConfigKeys) {
      const current = cfgSelect.value || '__all__';
      cfgSelect.innerHTML = GET_CONFIGURATION_OPTIONS
        .map((opt)=>`<option value="${esc(opt.value)}">${esc(opt.label)}</option>`)
        .join('');
      cfgSelect.value = GET_CONFIGURATION_OPTIONS.some((opt)=>opt.value === current) ? current : '__all__';
    }

    // Keep button slot fixed for consistent layout/UX.
  }

  async function pollCommandResult(commandId){
    if (state.statusTimer){ clearInterval(state.statusTimer); state.statusTimer = null; }

    const statusEl = $('#commandStatus');
    let attempts = 0;
    state.statusTimer = setInterval(async ()=>{
      attempts += 1;
      try {
        const data = await UI.getJSON(API.commandStatus(commandId));
        if (statusEl){
          statusEl.className = 'mt-2 fw-bold'; // Reset classes
          if (data.status === 'success') {
            statusEl.classList.add('text-success');
            const details = data.response ? ` → ${JSON.stringify(data.response)}` : '';
            statusEl.textContent = `✓ Kommando klart (${data.command}) kl ${new Date().toLocaleTimeString()}${details}`;
          }
          else if (data.status === 'failed') {
            statusEl.classList.add('text-danger');
            statusEl.textContent = `✗ Kommando misslyckades: ${data.error || 'okänt fel'}`;
          }
          else {
            statusEl.classList.add('text-primary');
            statusEl.textContent = `⏳ Kommando köat (${data.command})...`;
          }
        }
        if (data.status === 'success' || data.status === 'failed' || attempts >= 20){
          clearInterval(state.statusTimer);
          state.statusTimer = null;
        }
      } catch (err){
        if (attempts >= 20){
          clearInterval(state.statusTimer);
          state.statusTimer = null;
          if (statusEl) statusEl.textContent = 'Kunde inte läsa kommandoresultat.';
        }
      }
    }, 1000);
  }

  async function sendCommand(){
    const cpId = ($('#cpPick')?.value || '').trim();
    const command = ($('#commandPick')?.value || '').trim();
    const arg = ($('#commandArg')?.value || '').trim();
    const connectorValue = ($('#connectorId')?.value || '').trim();
    const idTag = ($('#idTagInput')?.value || '').trim().toUpperCase();
    const configKeyValue = ($('#configKeySelect')?.value || '__all__').trim();
    const btn = $('#btnSendCommand');
    const statusEl = $('#commandStatus');

    if (!cpId){
      UI.alert('Välj en laddare först.');
      return;
    }

    const payload = {};
    if (command === 'reset') {
      payload.type = arg || 'Hard';
    } else if (command === 'change_availability') {
      payload.type = arg || 'Operative';
      payload.connector_id = Number(connectorValue || '0');
    } else if (command === 'trigger_message') {
      payload.requested_message = arg || 'StatusNotification';
      if (connectorValue !== '') payload.connector_id = Number(connectorValue);
    } else if (command === 'unlock_connector') {
      payload.connector_id = Number(connectorValue || '1');
    } else if (command === 'remote_start_transaction') {
      if (!idTag) {
        UI.alert('Ange RFID / idTag för RemoteStartTransaction.');
        return;
      }
      payload.id_tag = idTag;
      if (connectorValue !== '') payload.connector_id = Number(connectorValue);
    } else if (command === 'remote_stop_transaction') {
      const connectorId = Number(connectorValue || '0');
      if (!Number.isFinite(connectorId) || connectorId < 1) {
        UI.alert('Välj ett giltigt uttag för RemoteStopTransaction.');
        return;
      }
      payload.connector_id = connectorId;
    } else if (command === 'get_configuration') {
      if (configKeyValue && configKeyValue !== '__all__') payload.key = configKeyValue;
    } else if (command === 'set_variables') {
      const comp = ($('#setVarComponent')?.value || '').trim();
      const variable = ($('#setVarVariable')?.value || '').trim();
      const val = ($('#setVarValue')?.value || '').trim();
      if (!comp || !variable || !val) {
        UI.alert('Fyll i komponent, variabel och värde.');
        return;
      }
      payload.variables = [{ component: comp, variable: variable, value: val }];
    } else if (command === 'get_report') {
      const comp = ($('#setVarComponent')?.value || '').trim();
      const variable = ($('#setVarVariable')?.value || '').trim();
      if (comp) {
        payload.variables = [{ component: comp, variable: variable }];
      }
    } else if (command === 'get_base_report') {
       payload.report_base = arg || 'FullInventory';
    } else if (command === 'get_log') {
       const url = ($('#getLogUrl')?.value || '').trim();
       if (!url) { UI.alert('Ange en URL för log-uppladdning.'); return; }
       payload.remote_location = url;
       payload.log_type = $('#getLogType')?.value || 'DiagnosticsLog';
    } else if (command === 'update_firmware') {
       const loc = ($('#fwLocation')?.value || '').trim();
       const date = ($('#fwRetrieveDate')?.value || '').trim();
       if (!loc || !date) { UI.alert('Ange både URL och datum.'); return; }
       payload.location = loc;
       payload.retrieve_date_time = date;
    } else if (command === 'customer_information') {
       if (idTag) payload.id_token = { idToken: idTag, type: 'ISO14443' };
    } else if (command === 'set_display_message') {
      const pick = ($('#presetPick')?.value || '').trim();
      let url = '';
      if (pick === '__custom__') {
        url = ($('#displayMessageUrl')?.value || '').trim();
      } else if (pick) {
        const preset = state.presets.find(p => p.id === pick);
        if (preset) url = window.location.origin + preset.image_url;
      }
      if (!url) {
        UI.alert('Välj en bildpreset eller ange en bild-URL.');
        return;
      }
      payload.url = url;
      payload.priority = $('#displayPriority')?.value || 'NormalCycle';
      const msgState = ($('#displayState')?.value || '').trim();
      if (msgState) payload.state = msgState;
    }

    if (!confirmDangerousCommand(command, cpId, payload)){
      if (statusEl) statusEl.textContent = 'Kommando avbrutet.';
      return;
    }

    try {
      if (btn) btn.disabled = true;
      if (statusEl) statusEl.textContent = 'Skickar kommando...';
      const res = await UI.postJSON(API.send, { cp_id: cpId, command, payload });
      state.pendingCommandId = res.command_id;
      if (statusEl) statusEl.textContent = `Kommando köat (${command})...`;
      await pollCommandResult(res.command_id);
    } catch (e){
      UI.alert(`Kunde inte skicka kommando: ${e.message || e}`);
      if (statusEl) statusEl.textContent = 'Kommando misslyckades.';
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function fetchPresets(){
    try {
      const res = await UI.getJSON(API.presets);
      state.presets = res.presets || [];
    } catch(e){
      state.presets = [];
    }
    renderPresetPick();
    renderPresetManager();
  }

  function renderPresetPick(){
    const sel = $('#presetPick');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Välj preset...</option>' +
      state.presets.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') +
      '<option value="__custom__">Egen URL...</option>';
    if (current && [...sel.options].some(o => o.value === current)) sel.value = current;
  }

  function renderPresetManager(){
    const container = $('#presetsList');
    if (!container) return;
    if (!state.presets.length){
      container.innerHTML = '<p class="text-muted small">Inga bildpresets uppladdade ännu.</p>';
      return;
    }
    container.innerHTML = '<div class="row g-2">' + state.presets.map(p => `
      <div class="col-6 col-md-3">
        <div class="card h-100">
          <img src="${esc(p.image_url)}" class="card-img-top" alt="${esc(p.name)}" style="max-height:120px;object-fit:contain;background:#f8f9fa;">
          <div class="card-body p-2">
            <div class="fw-bold small">${esc(p.name)}</div>
            <div class="text-muted" style="font-size:.7rem">${esc(p.created_by || '')} &middot; ${esc((p.created_at || '').slice(0,10))}</div>
            <button class="btn btn-sm btn-outline-danger mt-1 btn-delete-preset" data-id="${esc(p.id)}"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>
    `).join('') + '</div>';
  }

  async function uploadPreset(){
    const fileInput = $('#presetFile');
    const nameInput = $('#presetName');
    if (!fileInput?.files?.length){ UI.alert('Välj en bildfil.'); return; }
    const name = (nameInput?.value || '').trim();
    if (!name){ UI.alert('Ange ett presetnamn.'); return; }
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    fd.append('name', name);
    try {
      const resp = await fetch(API.presets, { method: 'POST', body: fd, credentials: 'same-origin' });
      if (!resp.ok){
        const err = await resp.json().catch(()=>({ detail: resp.statusText }));
        throw new Error(err.detail || resp.statusText);
      }
      fileInput.value = '';
      nameInput.value = '';
      await fetchPresets();
    } catch(e){
      UI.alert('Uppladdning misslyckades: ' + (e.message || e));
    }
  }

  async function deletePreset(id){
    if (!confirm('Ta bort denna bildpreset?')) return;
    try {
      const resp = await fetch(API.presetDelete(id), { method: 'DELETE', credentials: 'same-origin' });
      if (!resp.ok){
        const err = await resp.json().catch(()=>({ detail: resp.statusText }));
        throw new Error(err.detail || resp.statusText);
      }
      await fetchPresets();
    } catch(e){
      UI.alert('Kunde inte ta bort preset: ' + (e.message || e));
    }
  }

  async function bootstrap(){
    await UI.initPage({ requiredRoles: ['portal_admin','admin'] });
    state.orgs = await UI.getJSON(API.orgs);

    const orgFilter = $('#orgFilter');
    if (orgFilter){
      orgFilter.innerHTML = '<option value="">Alla organisationer</option>' +
        Object.entries(state.orgs).map(([id, data])=>`<option value="${esc(id)}">${esc(data?.name || id)} (${esc(id)})</option>`).join('');
      orgFilter.addEventListener('change', fetchLive);
    }

    $('#cpPick')?.addEventListener('change', buildCommandDropdown);
    $('#commandPick')?.addEventListener('change', setCommandOptions);
    $('#btnSendCommand')?.addEventListener('click', sendCommand);
    $('#btnUploadPreset')?.addEventListener('click', uploadPreset);
    $('#presetPick')?.addEventListener('change', function(){
      toggleField('#customUrlWrap', this.value === '__custom__');
    });
    $('#presetsList')?.addEventListener('click', (e)=>{
      const btn = e.target.closest('.btn-delete-preset');
      if (btn) deletePreset(btn.dataset.id);
    });

    buildCommandDropdown();

    // Start the timer first so the page keeps polling even if the first request fails
    state.timer = setInterval(fetchLive, POLL_MS);
    await fetchLive();

    // Check for CP parameter in URL for pre-selection
    const urlParams = new URLSearchParams(window.location.search);
    const preCp = urlParams.get('cp');
    if (preCp) {
       const sel = $('#cpPick');
       if (sel) {
         sel.value = preCp;
         sel.dispatchEvent(new Event('change'));
       }
    }

    document.addEventListener('visibilitychange', ()=>{
      if (document.hidden && state.timer){
        clearInterval(state.timer);
        state.timer = null;
      } else if (!document.hidden && !state.timer){
        fetchLive();
        state.timer = setInterval(fetchLive, POLL_MS);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    bootstrap().catch((e)=>{
      // Only real boot failures reach here (auth/role errors).
      // fetchLive errors are caught internally and shown in #liveMeta.
      const msg = e?.message || String(e);
      if (!msg.includes('redirect to login')) {
        UI.alert(`Fel vid start av livepanelen: ${msg}`);
      }
    });
  });
})();

