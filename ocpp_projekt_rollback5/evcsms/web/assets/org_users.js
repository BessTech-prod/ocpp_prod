// /assets/org_users.js  (v1)
(function(){
  const API = { users:'/api/users/map' };

  const $  = (s)=>document.querySelector(s);
  const $$ = (s)=>document.querySelectorAll(s);
  const esc= (s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  function alertBox(msg,kind='danger',t=4500){
    const el=$('#page-alerts'); if(!el)return;
    if(!msg){ el.innerHTML=''; return; }
    el.innerHTML=`<div class="alert alert-${kind}">${esc(msg)}</div>`;
    if(t>0) setTimeout(()=> el.innerHTML='', t);
  }
  async function del(url){
    const r=await fetch(url,{method:'DELETE'});
    if(!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> '')}`);
    return r.json();
  }
  async function fetchUsers(){ return UI.getJSON(API.users); }

  function render(map){
    const tbody=$('#users-table tbody'), foot=$('#listFootnote'); if(!tbody) return;
    const q=($('#filterInput')?.value||'').toLowerCase();
    const rows=Object.entries(map||{}).map(([tag,u])=>{
      const name=u?.name || [u?.first_name,u?.last_name].filter(Boolean).join(' ') || tag;
      return { tag, name };
    }).filter(r=>!q||r.name.toLowerCase().includes(q)||r.tag.toLowerCase().includes(q))
      .sort((a,b)=>a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    if(!rows.length){ tbody.innerHTML=`<tr><td colspan="3" class="text-center text-muted">Inga användare.</td></tr>`; if(foot) foot.textContent=''; return; }
    tbody.innerHTML=rows.map(r=>`
      <tr>
        <td>${esc(r.name)}</td>
        <td><code>${esc(r.tag)}</code></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger" data-del="${esc(r.tag)}" type="button"><i class="bi bi-trash"></i> Ta bort</button>
        </td>
      </tr>`).join('');
    if(foot) foot.textContent=`Visar ${rows.length} användare.`;

    $$('#users-table button[data-del]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const tag=btn.getAttribute('data-del'); if(!tag) return;
        if(!confirm(`Ta bort användare med RFID ${tag}?`)) return;
        try{ await del(`/api/users/map?tag=${encodeURIComponent(tag)}`); await refresh(); }
        catch(e){ alertBox(`Kunde inte ta bort: ${e.message}`); }
      });
    });
  }

  async function refresh(){
    try{ const map = await fetchUsers(); render(map); }
    catch(e){ alertBox(`Kunde inte läsa användare: ${e.message}`); }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['org_admin'] }); if(!me) return;
    $('#btnRefresh')?.addEventListener('click', refresh);
    $('#filterInput')?.addEventListener('input', refresh);
    await refresh();
  });
})();
