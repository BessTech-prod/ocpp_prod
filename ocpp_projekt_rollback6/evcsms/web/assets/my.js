// /assets/my.js  (v3)
(function(){
  const API = { my:'/api/my/summary' };
  const $=(s)=>document.querySelector(s);
  function alertBox(msg,kind='danger',t=4500){ const el=document.getElementById('page-alerts'); if(!el)return; if(!msg){el.innerHTML='';return;} el.innerHTML=`<div class="alert alert-${kind}">${msg}</div>`; if(t>0)setTimeout(()=>el.innerHTML='',t); }

  async function refresh(){
    try{
      const days=Number(document.getElementById('days')?.value||30)||30;
      const s=await UI.getJSON(`${API.my}?days=${days}`);
      document.getElementById('stat-kwh').textContent=(s.kwh??0).toLocaleString('sv-SE',{maximumFractionDigits:3});
      document.getElementById('stat-sessions').textContent=(s.sessions??0).toLocaleString('sv-SE');
      document.getElementById('stat-days').textContent=(s.period_days??days).toString();
    }catch(e){ alertBox(`Kunde inte läsa min statistik: ${e.message}`); }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['user','org_admin','portal_admin','admin'] }); if(!me) return;
    const title=document.getElementById('title'); if(title) title.textContent=`Hej ${me.name||me.email}!`;
    document.getElementById('btnRefresh')?.addEventListener('click', refresh);
    document.getElementById('days')?.addEventListener('change', refresh);
    await refresh();
  });
})();
