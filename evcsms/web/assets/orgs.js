// /assets/orgs.js  (v3)
(function(){
  const API = { orgs:'/api/orgs' };
  const $=(s)=>document.querySelector(s), $$=(s)=>document.querySelectorAll(s);
  const esc=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function alertBox(msg,kind='danger',t=4000){ const el=document.getElementById('page-alerts'); if(!el)return; if(!msg){el.innerHTML='';return;} el.innerHTML=`<div class="alert alert-${kind}">${esc(msg)}</div>`; if(t>0)setTimeout(()=>el.innerHTML='',t); }
  function toast(msg, variant='success'){ const el=document.getElementById('toast-stack'); if(!el)return; const id='t_'+Date.now(); el.insertAdjacentHTML('beforeend', `<div id="${id}" class="toast align-items-center text-bg-${variant} border-0"><div class="d-flex"><div class="toast-body">${esc(msg)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div>`); new bootstrap.Toast(document.getElementById(id),{delay:2200}).show(); }
  async function getJSON(url){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok){ if(r.status===401) window.location.href='/login.html'; throw new Error(`${url} -> ${r.status}`);} return r.json(); }
  async function postJSON(url, body){ const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); if(!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> '')}`); return r.json(); }
  async function patchJSON(url, body){ const r=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); if(!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> '')}`); return r.json(); }
  async function del(url){ const r=await fetch(url,{method:'DELETE'}); if(!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(()=> '')}`); return r.json(); }

  function render(orgs){
    const tbody=document.querySelector('#orgs-table tbody'); if(!tbody) return;
    const rows=Object.entries(orgs||{}).map(([id,o])=>`
      <tr>
        <td><code>${esc(id)}</code></td>
        <td>
          <div class="input-group input-group-sm">
            <input class="form-control" value="${esc(o?.name||'')}" data-name="${esc(id)}">
            <button class="btn btn-outline-primary btn-save" data-id="${esc(id)}">Spara namn</button>
          </div>
        </td>
        <td class="text-end"><button class="btn btn-sm btn-outline-danger btn-del" data-id="${esc(id)}">Ta bort</button></td>
      </tr>`).join('');
    tbody.innerHTML=rows || `<tr><td colspan="3" class="text-center text-muted">Inga orgar.</td></tr>`;
    $$('.btn-save').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id=btn.getAttribute('data-id');
        const input=tbody.querySelector(`input[data-name="${CSS.escape(id)}"]`);
        try{ await patchJSON(`${API.orgs}/${encodeURIComponent(id)}`, { name: input.value.trim() }); toast('Namn uppdaterat'); await refresh(); }
        catch(e){ alertBox(`Kunde inte spara: ${e.message}`); }
      });
    });
    $$('.btn-del').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id=btn.getAttribute('data-id');
        if(!confirm(`Ta bort organisation "${id}"?\nObs: nekas om användare finns (utan force).`)) return;
        try{ await del(`${API.orgs}/${encodeURIComponent(id)}`); toast('Organisation borttagen'); await refresh(); }
        catch(e){ alertBox(`Kunde inte ta bort: ${e.message}`); }
      });
    });
  }
  async function refresh(){ try{ const orgs=await getJSON(API.orgs); render(orgs); }catch(e){ alertBox(`Kunde inte läsa orgar: ${e.message}`); } }

  document.addEventListener('DOMContentLoaded', async ()=>{
    const me = await UI.initPage({ requiredRoles:['portal_admin','admin'] }); if(!me) return;
    // Show modal on button click
    document.getElementById('btnShowCreateOrgModal')?.addEventListener('click', ()=>{
      const modal = new bootstrap.Modal(document.getElementById('createOrgModal'));
      document.getElementById('modalOrgId').value = '';
      document.getElementById('modalOrgName').value = '';
      modal.show();
    });
    // Handle create in modal
    document.getElementById('btnModalCreate')?.addEventListener('click', async ()=>{
      const id = document.getElementById('modalOrgId')?.value.trim();
      const name = document.getElementById('modalOrgName')?.value.trim();
      if(!id||!name){ alertBox('Fyll i org-id och namn.','warning'); return; }
      try {
        await postJSON(API.orgs, { org_id:id, name });
        toast('Organisation skapad');
        bootstrap.Modal.getOrCreateInstance(document.getElementById('createOrgModal')).hide();
        await refresh();
      } catch(e) {
        alertBox(`Kunde inte skapa: ${e.message}`);
      }
    });
    await refresh();
  });
})();
