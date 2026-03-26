(function(){
  const POLL_MS = 5000;
  const API = {
    orgs: '/api/orgs',
    live: '/api/portal/live/chargers',
    status: '/api/status',
    cpsMap: '/api/cps/map',
    send: '/api/portal/ocpp/command',
    commandStatus: (id) => `/api/portal/ocpp/command/${encodeURIComponent(id)}`
  };

  const $ = (s) => document.querySelector(s);

  const state = {
    orgs: {},
    items: [],
    timer: null,
    pendingCommandId: null,
    statusTimer: null,
  };

  const COMMAND_CONFIG = {
    reset: {
      argLabel: 'Reset-typ',
      args: ['Hard', 'Soft'],
      showConnector: false,
    },
    change_availability: {
      argLabel: 'Tillgänglighet',
      args: ['Operative', 'Inoperative'],
      showConnector: true,
    },
    trigger_message: {
      argLabel: 'Meddelande',
      args: ['StatusNotification', 'Heartbeat', 'BootNotification', 'MeterValues', 'FirmwareStatusNotification', 'DiagnosticsStatusNotification'],
      showConnector: true,
    },
    clear_cache: {
      showConnector: false,
    },
    unlock_connector: {
      showConnector: true,
    },
    remote_start_transaction: {
      showConnector: true,
      showIdTag: true,
    },
    remote_stop_transaction: {
      showConnector: true,
    },
    get_configuration: {
      showConfigKeys: true,
    },
  };

  const GET_CONFIGURATION_OPTIONS = [
    { value: '__all__', label: 'Alla nycklar' },
    { value: 'HeartbeatInterval', label: 'HeartbeatInterval' },
    { value: 'AuthorizeRemoteTxRequests', label: 'AuthorizeRemoteTxRequests' },
    { value: 'ConnectionTimeOut', label: 'ConnectionTimeOut' },
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
        <td>${esc(it.alias || it.cp_id)} <span class="text-muted">(${esc(it.cp_id)})</span></td>
        <td>${esc(orgName)} <span class="text-muted">(${esc(it.org_id || 'default')})</span></td>
        <td>${statusBadge(c1)}</td>
        <td>${statusBadge(c2)}</td>
        <td>${esc(ts)}</td>
      </tr>`;
    }).join('');
  }

  function renderCpPick(){
    const sel = $('#cpPick');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = state.items.map((it)=>`<option value="${esc(it.cp_id)}">${esc(it.alias || it.cp_id)} (${esc(it.cp_id)})</option>`).join('');
    if (!state.items.length){
      sel.innerHTML = '<option value="">Ingen laddare tillgänglig</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    if (current && state.items.some((it)=>it.cp_id === current)) sel.value = current;
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

  function setCommandOptions(){
    const command = ($('#commandPick')?.value || 'reset');
    const cfg = COMMAND_CONFIG[command] || {};
    const arg = $('#commandArg');
    const argLabel = $('label[for="commandArg"]');
    if (arg && cfg.args?.length){
      arg.innerHTML = cfg.args.map((v)=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    } else if (arg) {
      arg.innerHTML = '';
    }

    if (argLabel) argLabel.textContent = cfg.argLabel || 'Parameter';

    toggleField('#commandArgWrap', !!cfg.args?.length);
    toggleField('#connectorWrap', !!cfg.showConnector);
    toggleField('#idTagWrap', !!cfg.showIdTag);
    toggleField('#configKeyWrap', !!cfg.showConfigKeys);

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
          if (data.status === 'success') {
            const details = data.response ? ` → ${JSON.stringify(data.response)}` : '';
            statusEl.textContent = `Kommando klart (${data.command}) kl ${new Date().toLocaleTimeString()}${details}`;
          }
          else if (data.status === 'failed') statusEl.textContent = `Kommando misslyckades: ${data.error || 'okänt fel'}`;
          else statusEl.textContent = `Kommando köat (${data.command})...`;
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

  async function bootstrap(){
    await UI.initPage({ requiredRoles: ['portal_admin','admin'] });
    state.orgs = await UI.getJSON(API.orgs);

    const orgFilter = $('#orgFilter');
    if (orgFilter){
      orgFilter.innerHTML = '<option value="">Alla organisationer</option>' +
        Object.entries(state.orgs).map(([id, data])=>`<option value="${esc(id)}">${esc(data?.name || id)} (${esc(id)})</option>`).join('');
      orgFilter.addEventListener('change', fetchLive);
    }

    $('#commandPick')?.addEventListener('change', setCommandOptions);
    $('#btnSendCommand')?.addEventListener('click', sendCommand);

    setCommandOptions();

    // Start the timer first so the page keeps polling even if the first request fails
    state.timer = setInterval(fetchLive, POLL_MS);
    await fetchLive();

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

