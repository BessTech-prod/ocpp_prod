// /assets/user_my.js  (v1)
(function(){
  const $=(s)=>document.querySelector(s);
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
    $('#btnRefresh')?.addEventListener('click', refresh);
    $('#days')?.addEventListener('change', refresh);
    // Dashboard-nav i menyn
    $('#navDashboardLink')?.addEventListener('click', (e)=>{ e.preventDefault(); UI.goToDashboard(); });
    await refresh();
  });
})();
