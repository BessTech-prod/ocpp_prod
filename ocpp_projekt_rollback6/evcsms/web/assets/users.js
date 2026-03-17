// /assets/users.js  (v2)
(function(){
  const API = { users:'/api/users/map', orgs:'/api/orgs' };
  const $=(s)=>document.querySelector(s), $$=(s)=>document.querySelectorAll(s);
  const esc=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function alertBox(msg,kind='danger',t=4500){ const el=document.getElementById('page-alerts'); if(!el)return; if(!msg){el.innerHTML='';return;} el.innerHTML=`<div class="alert alert-${kind}">${esc(msg)}</div>`; if(t>0)setTimeout(()=>el.innerHTML='',t); }
  async function deleteJSON(url){ const r=await fetch(url,{method:'DELETE'}); if(!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> '')}`); return r.json(); }

  async function initOrgFilter(role){
    const wrap=document.getElementById('orgFilterWrap'), sel=document.getElementById('orgFilter'), th=document.getElementById('thOrg');
    if(role==='portal_admin'||role==='admin'){
      if(wrap) wrap.style.display=''; if(th) th.style.display='';
      try{ const orgs=await UI.getJSON(API.orgs); sel.innerHTML=`<option value="">Alla organisationer</option>` + Object.entries(orgs).map(([id,o])=>`<option value="${esc(id)}">${esc(o?.name||id)} (${esc(id)})</option>`).join(''); sel.addEventListener('change', refresh); }
      catch(e){ console.warn('orgFilter kunde inte laddas', e.message); }
    } else {
      if(wrap) wrap.style.display='none';
      // vill du gömma org-kolumn för org_admin? Avkommentera nästa rad:
      // if(th) th.style.display='none';
    }
  }

  async function fetchUsers(){ return UI.getJSON(API.users); }

  function render(map, role){
    const tbody=document.querySelector('#users-table tbody'), foot=document.getElementById('listFootnote');
    const filter=(document.getElementById('filterInput')?.value||'').toLowerCase();
    const orgFilter=(document.getElementById('orgFilter')?.value||'');
    let rows=Object.entries(map||{}).map(([tag,u])=>{
      const name=u?.name || [u?.first_name,u?.last_name].filter(Boolean).join(' ') || tag;
      const org=u?.org_id||'';
      return { tag, name, org };
    });
    if((role==='portal_admin'||role==='admin') && orgFilter){ rows=rows.filter(r=>r.org===orgFilter); }
    if(filter){ rows=rows.filter(r=> r.name.toLowerCase().includes(filter) || r.tag.toLowerCase().includes(filter) || r.org.toLowerCase().includes(filter) ); }
    rows.sort((a,b)=>a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    if(!rows.length){ tbody.innerHTML=`<tr><td colspan="4" class="text-center text-muted">Inga användare.</td></tr>`; if(foot) foot.textContent=''; return; }
    const allowDelete=(role==='portal_admin'||role==='admin'||role==='org_admin');
    tbody.innerHTML=rows.map(r=>`
      <tr>
        <td>${esc(r.name)}</td>
        <td><code>${esc(r.tag)}</code></td>
        <td>${r.org?`<code>${esc(r.org)}</code>`:''}</td>
        <td class="text-end">${allowDelete?`<button class="btn btn-sm btn-outline-danger" data-del="${esc(r.tag)}" type="button"><i class="bi bi-trash"></i> Ta bort</button>`:''}</td>
      </tr>`).join('');
    if(foot) foot.textContent=`Visar ${rows.length} användare.`;
    if(allowDelete){
      $$('#users-table button[data-del]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const tag=btn.getAttribute('data-del'); if(!tag) return;
          if(!confirm(`Ta bort användare med RFID ${tag}?`)) return;
          try{ await deleteJSON(`/api/users/map?tag=${encodeURIComponent(tag)}`); await refresh(); }
          catch(e){ alertBox(`Kunde inte ta bort: ${e.message}`); }
        });
      });
    }
  }

  async function refresh(){
    const me = await UI.getJSON('/api/auth/me'); // för att veta roll här
    const map=await fetchUsers();
    render(map, (me.role||'').toLowerCase());
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['org_admin','portal_admin','admin'] }); if(!me) return;
    await initOrgFilter((me.role||'').toLowerCase());
    document.getElementById('btnRefresh')?.addEventListener('click', refresh);
    document.getElementById('filterInput')?.addEventListener('input', refresh);
    await refresh();
  });
})();
