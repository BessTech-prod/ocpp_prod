<!-- Spara som: web/assets/nav.js -->
<script>
// /assets/nav.js
(function(){
  async function getMe(){
    const r = await fetch('/api/auth/me', { cache: 'no-store' });
    if (!r.ok) throw new Error('401');
    return r.json();
  }
  async function goToDashboard(){
    try{
      const me = await getMe();
      const role = (me.role || '').toLowerCase();
      if (role === 'portal_admin' || role === 'admin') {
        window.location.href = '/portal/index.html';
      } else if (role === 'org_admin') {
        window.location.href = '/org/index.html';
      } else {
        window.location.href = '/user/index.html';
      }
    }catch{
      window.location.href = '/login.html';
    }
  }

  // Auto-bind på alla knappar/länkar med .js-go-dashboard
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.js-go-dashboard').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        goToDashboard();
      });
    });

    // Fallback: bind även #navDashboard om den finns
    const nav = document.getElementById('navDashboard');
    if (nav) {
      nav.addEventListener('click', (e) => {
        e.preventDefault();
        goToDashboard();
      });
    }
  });

  // Exponera globalt om man vill anropa manuellt
  window.__nav = { goToDashboard };
})();
</script>
