// /assets/login.js  (role-aware redirect)
(function () {
  const API = { login: '/api/auth/login', me: '/api/auth/me' };
  const el = (id) => document.getElementById(id);

  function setAlert(msg, kind='danger'){
    const box = el('alerts'); if (!box) return;
    box.innerHTML = `<div class="alert alert-${kind}">${msg}</div>`;
  }
  async function postJSON(url, body){
    const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    if(!r.ok) throw new Error(`${url} -> ${r.status}`);
    return r.json();
  }
  async function getJSON(url){
    const r = await fetch(url, {cache:'no-store'});
    if(!r.ok) throw new Error(`${url} -> ${r.status}`);
    return r.json();
  }
  function goToRole(me){
    const role = (me.role || '').toLowerCase();
    if (role === 'portal_admin' || role === 'admin') window.location.href = '/portal/index.html';
    else if (role === 'org_admin') window.location.href = '/org/index.html';
    else window.location.href = '/user/index.html';
  }

  function setSubmitting(isSubmitting){
    const btn = el('btnLogin');
    const spinner = el('login-spinner');
    const label = btn?.querySelector('.login-label');
    if (!btn || !spinner) return;
    btn.disabled = !!isSubmitting;
    spinner.classList.toggle('d-none', !isSubmitting);
    if (label) label.textContent = isSubmitting ? 'Loggar in...' : 'Logga in';
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (document.body) document.body.classList.add('app-ready');

    // redan inloggad?
    try { const me = await getJSON(API.me); goToRole(me); return; } catch(_) {}

    const form = el('login-form'), email = el('email'), pw = el('password');
    if(!form||!email||!pw) return;

    form.addEventListener('submit', async (e)=>{
      e.preventDefault(); e.stopPropagation(); form.classList.add('was-validated');
      if(!form.checkValidity()) return;
      try{
        setSubmitting(true);
        await postJSON(API.login, { email: email.value.trim(), password: pw.value });
        const me = await getJSON(API.me);
        goToRole(me);
      }catch(err){
        setAlert('Felaktig e‑post eller lösenord.');
        console.error(err);
      }finally{
        setSubmitting(false);
      }
    });
  });
})();
