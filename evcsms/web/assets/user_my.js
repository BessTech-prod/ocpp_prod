// /assets/user_my.js  (v2)
(function(){
  const $=(s)=>document.querySelector(s);
  function formatRole(role){
    const map = {
      user: 'Användare',
      org_admin: 'Organisationsadmin',
      portal_admin: 'Portaladmin',
      admin: 'Admin'
    };
    return map[String(role || '').toLowerCase()] || (role || '–');
  }
  function fillAccountInfo(me){
    const email = document.getElementById('account-email');
    const role = document.getElementById('account-role');
    const org = document.getElementById('account-org');
    if (email) email.textContent = me?.email || '–';
    if (role) role.textContent = formatRole(me?.role);
    if (org) org.textContent = me?.org_name || me?.org_id || 'Ingen organisation';
  }
  function alertBox(msg,kind='danger',t=4500){ const el=$('#page-alerts'); if(!el)return; if(!msg){el.innerHTML='';return;} el.innerHTML=`<div class="alert alert-${kind}">${msg}</div>`; if(t>0)setTimeout(()=>el.innerHTML='',t); }

  async function refresh(){
    try{
      const days = Number($('#days')?.value || 30) || 30;
      const s = await UI.getJSON(`/api/my/summary?days=${days}`);
      $('#stat-kwh').textContent      = (s.kwh??0).toLocaleString('sv-SE',{maximumFractionDigits:3});
      $('#stat-sessions').textContent = (s.sessions??0).toLocaleString('sv-SE');
      $('#stat-days').textContent     = (s.period_days??days).toString();
    }catch(e){ alertBox(`Kunde inte läsa min statistik: ${e.message}`); }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['user'] }); if(!me) return;
    const title=$('#title'); if(title) title.textContent=`Hej ${me.name||me.email}!`;
    fillAccountInfo(me);
    $('#btnRefresh')?.addEventListener('click', refresh);
    $('#days')?.addEventListener('change', refresh);
    // Dashboard-nav i menyn
    $('#navDashboardLink')?.addEventListener('click', (e)=>{ e.preventDefault(); UI.goToDashboard(); });
    await refresh();
  });
})();
