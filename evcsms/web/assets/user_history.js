// /assets/user_history.js  (v1)
// User charging history: fetches /api/users/history and renders session cards.
(function(){
  const $ = (s) => document.querySelector(s);
  const API = '/api/users/history';

  function alertBox(msg, kind='danger', t=4500){
    const el = $('#page-alerts');
    if (!el) return;
    if (!msg) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="alert alert-${kind}">${UI.esc(msg)}</div>`;
    if (t > 0) setTimeout(() => el.innerHTML = '', t);
  }

  function formatDate(iso){
    if (!iso) return '–';
    try {
      const d = new Date(iso.replace('Z', '+00:00'));
      return d.toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' })
           + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    } catch { return String(iso); }
  }

  function renderSessions(items){
    const host = $('#history-list');
    if (!host) return;

    if (!items || items.length === 0){
      host.innerHTML = '<div class="alert alert-info mb-0">Inga laddsessioner hittades.</div>';
      return;
    }

    host.innerHTML = items.map(s => `
      <div class="card mb-2 shadow-sm">
        <div class="card-body py-3">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h6 class="card-title mb-1">${UI.esc(s.charge_point_alias || s.charge_point || 'Okänd laddare')}</h6>
              <div class="text-muted small">${formatDate(s.stop_time)}</div>
            </div>
            <div class="text-end">
              <div class="fw-bold fs-5">${(s.energy_kwh ?? 0).toLocaleString('sv-SE', {maximumFractionDigits: 2})} <span class="small fw-normal text-muted">kWh</span></div>
              <span class="badge bg-secondary">Uttag ${UI.esc(String(s.connectorId || 1))}</span>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  async function refresh(){
    try {
      const days = Number($('#days')?.value || 30) || 30;
      const data = await UI.getJSON(`${API}?days=${days}`);
      renderSessions(data?.items || []);
    } catch(e) {
      alertBox(`Kunde inte hämta laddhistorik: ${e.message}`);
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const me = await UI.initPage({ requiredRoles: ['user'] });
    if (!me) return;

    $('#btnRefresh')?.addEventListener('click', refresh);
    $('#days')?.addEventListener('change', refresh);

    await refresh();
  });
})();
