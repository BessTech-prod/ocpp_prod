// /assets/org_add_user.js  (v2)
(function(){
  const API = { map:'/api/users/map' };

  const $  = (s)=>document.querySelector(s);
  const $$ = (s)=>document.querySelectorAll(s);
  const esc= (s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  function alertBox(msg,kind='danger',t=4500){
    const el=$('#page-alerts'); if(!el) return;
    if(!msg){ el.innerHTML=''; return; }
    el.innerHTML=`<div class="alert alert-${kind}">${esc(msg)}</div>`;
    if(t>0) setTimeout(()=> el.innerHTML='', t);
  }
  function toast(msg,variant='success'){
    const host=$('#toast-stack'); if(!host) return;
    const id='t_'+Date.now();
    host.insertAdjacentHTML('beforeend', `
      <div id="${id}" class="toast align-items-center text-bg-${variant} border-0">
        <div class="d-flex">
          <div class="toast-body">${esc(msg)}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>`);
    try{ new bootstrap.Toast(document.getElementById(id),{delay:2200}).show(); }catch{}
  }
  async function postJSON(url, body){
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> '')}`);
    return r.json();
  }
  async function delJSON(url){
    const r=await fetch(url,{method:'DELETE'});
    if(!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> '')}`);
    return r.json();
  }
  async function fetchUsers(){ return UI.getJSON(API.map); }

  function normalizeRole(v){
    const s=String(v||'').toLowerCase();
    if(['org_admin','org admin','org-admin','organisations-admin','organisation admin'].includes(s)) return 'org_admin';
    return 'user';
  }

  function renderList(map){
    const tbody=$('#users-table tbody'), foot=$('#listFootnote'); if(!tbody) return;
    const q=($('#filterInput')?.value||'').toLowerCase();
    const rows = Object.entries(map||{}).map(([tag,u])=>{
      const name = u?.name || [u?.first_name,u?.last_name].filter(Boolean).join(' ') || tag;
      return { tag, name };
    }).filter(r=> !q || r.name.toLowerCase().includes(q) || r.tag.toLowerCase().includes(q))
      .sort((a,b)=> a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    if(!rows.length){ tbody.innerHTML=`<tr><td colspan="3" class="text-center text-muted">Inga användare.</td></tr>`; if(foot) foot.textContent=''; return; }
    tbody.innerHTML = rows.map(r=>`
      <tr>
        <td>${esc(r.name)}</td>
        <td><code>${esc(r.tag)}</code></td>
        <td class="text-end"><button class="btn btn-sm btn-outline-danger" data-del="${esc(r.tag)}" type="button"><i class="bi bi-trash"></i> Ta bort</button></td>
      </tr>`).join('');
    if(foot) foot.textContent = `Visar ${rows.length} användare.`;
    $$('#users-table button[data-del]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const tag=btn.getAttribute('data-del'); if(!tag) return;
        if(!confirm(`Ta bort användare med RFID ${tag}?`)) return;
        try{ await delJSON(`${API.map}?tag=${encodeURIComponent(tag)}`); toast('Borttagen'); await refresh(); }
        catch(e){ alertBox(`Kunde inte ta bort: ${e.message}`); }
      });
    });
  }

  async function refresh(){
    try{ const map = await fetchUsers(); renderList(map); }
    catch(e){ alertBox(`Kunde inte läsa användare: ${e.message}`); }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['org_admin'] }); if(!me) return;
    $('#orgReadonly').textContent = me.org_name ? `${me.org_name} (${me.org_id||''})` : (me.org_id || '(okänd org)');

    $('#btnRefreshList')?.addEventListener('click', refresh);
    $('#filterInput')?.addEventListener('input', refresh);

    const form = $('#add-user-form');
    $('#btnSaveUser')?.addEventListener('click', async (e)=>{
      e.preventDefault(); e.stopPropagation(); form.classList.add('was-validated');
      if(!form.checkValidity()) return;

      const payload = {
        tag: ($('#rfidTag')?.value||'').trim(),
        first_name: ($('#firstName')?.value||'').trim(),
        last_name:  ($('#lastName')?.value||'').trim(),
        name: `${($('#firstName')?.value||'').trim()} ${($('#lastName')?.value||'').trim()}`.trim(),
        email: ($('#email')?.value||'').trim().toLowerCase(),
        role: normalizeRole($('#role')?.value),
        org_id: me.org_id || '',
        password: ($('#password')?.value||undefined)
      };

      try{ await postJSON(API.map, payload); toast(`Användaren "${payload.name}" sparades`,'success'); form.reset(); form.classList.remove('was-validated'); await refresh(); }
      catch(e){ alertBox(`Kunde inte spara: ${e.message}`); }
    });

    await refresh();
  });
})();
