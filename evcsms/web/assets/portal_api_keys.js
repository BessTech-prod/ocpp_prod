/* ============================================================================
 * portal_api_keys.js  —  Logic for managing external API keys
 * ============================================================================ */
(function () {
  "use strict";
  const UI = window.UI;

  const elements = {
    keyForm: document.getElementById("keyForm"),
    orgPick: document.getElementById("orgPick"),
    rateLimit: document.getElementById("rateLimit"),
    keysTable: document.getElementById("keysTable").querySelector("tbody"),
    newKeyAlert: document.getElementById("newKeyAlert"),
    rawKeyDisplay: document.getElementById("rawKeyDisplay"),
    btnCopyKey: document.getElementById("btnCopyKey"),
    btnConfirmRevoke: document.getElementById("btnConfirmRevoke"),
    revokeModal: new bootstrap.Modal(document.getElementById("revokeModal")),
    reviewModal: new bootstrap.Modal(document.getElementById("reviewModal")),
    specOrgId: document.getElementById("specOrgId"),
    specPrefix: document.getElementById("specPrefix"),
    specCreated: document.getElementById("specCreated"),
    specLastUsed: document.getElementById("specLastUsed"),
    specRateLimit: document.getElementById("specRateLimit"),
    specStatus: document.getElementById("specStatus"),
    btnPauseKey: document.getElementById("btnPauseKey"),
    btnReactivateKey: document.getElementById("btnReactivateKey"),
    btnRevokeInside: document.getElementById("btnRevokeInside"),
    urlChargers: document.getElementById("urlChargers"),
    btnCopyUrlChargers: document.getElementById("btnCopyUrlChargers"),
    urlEnergy: document.getElementById("urlEnergy"),
    btnCopyUrlEnergy: document.getElementById("btnCopyUrlEnergy"),
    periodSelect: document.getElementById("periodSelect"),
    ipWhitelist: document.getElementById("ipWhitelist"),
    specWhitelist: document.getElementById("specWhitelist"),
    newIpInput: document.getElementById("newIpInput"),
    btnAddIp: document.getElementById("btnAddIp"),
    whitelistBadges: document.getElementById("whitelistBadges"),
  };

  let pendingRevoke = null;
  let activeKeys = [];
  let currentReviewHash = null;

  async function init() {
    try {
      await UI.initPage({ requiredRoles: ['portal_admin', 'admin'] });

      const [orgs, keys] = await Promise.all([
        UI.getJSON("/api/orgs"),
        UI.getJSON("/api/admin/external/keys")
      ]);

      renderOrgs(orgs);
      activeKeys = keys;
      renderKeys(keys);
    } catch (err) {
      UI.alert("Kunde inte ladda data: " + err.message);
    }
  }

  function renderOrgs(orgs) {
    const sorted = Object.entries(orgs).sort((a, b) => a[1].name.localeCompare(b[1].name));
    elements.orgPick.innerHTML = '<option value="" disabled selected>Välj organisation...</option>' +
      sorted.map(([id, meta]) => `<option value="${id}">${UI.esc(meta.name)}</option>`).join("");
  }

  function renderKeys(keys) {
    if (!keys || keys.length === 0) {
      elements.keysTable.innerHTML = '<tr><td colspan="7" class="text-center py-3">Inga API-nycklar skapade än.</td></tr>';
      return;
    }

    elements.keysTable.innerHTML = keys.map(k => `
      <tr>
        <td><div class="fw-bold">${UI.esc(k.org_id)}</div></td>
        <td><code class="text-primary bg-light px-2 py-1 rounded small">${UI.esc(k.prefix)}</code></td>
        <td><div class="small text-muted">${k.created_at ? k.created_at.split('T')[0] : '-'}</div></td>
        <td><div class="small text-muted">${k.last_used ? k.last_used.replace('T', ' ').split('.')[0] : 'Aldrig'}</div></td>
        <td><span class="badge bg-light text-dark border">${k.rate_limit}</span></td>
        <td>
          <span class="badge ${k.active ? 'status-available' : 'status-suspended'}">
            ${k.active ? 'Aktiv' : 'Inaktiv'}
          </span>
        </td>
        <td class="text-end">
          <button class="btn btn-sm btn-white border shadow-sm btn-review" 
                  data-hash="${k.hash}">
            <i class="bi bi-pencil-square text-primary"></i>
          </button>
        </td>
      </tr>
    `).join("");

    elements.keysTable.querySelectorAll(".btn-review").forEach(btn => {
      btn.addEventListener("click", () => {
        showReview(btn.dataset.hash);
      });
    });
  }

  function showReview(hash) {
    const k = activeKeys.find(x => x.hash === hash);
    if (!k) return;
    currentReviewHash = hash;

    elements.specOrgId.textContent = k.org_id;
    elements.specPrefix.innerHTML = `<code>${UI.esc(k.prefix)}</code>`;
    elements.specCreated.textContent = k.created_at ? k.created_at.replace('T', ' ').split('.')[0] : '-';
    elements.specLastUsed.innerHTML = k.last_used 
      ? k.last_used.replace('T', ' ').split('.')[0] 
      : '<span class="text-muted">Aldrig</span>';
    elements.specRateLimit.textContent = k.rate_limit;
    elements.specStatus.innerHTML = k.active 
      ? '<span class="badge bg-success">Aktiv</span>' 
      : '<span class="badge bg-secondary">Pausad</span>';
    
    renderWhitelist(k.ip_whitelist || []);

    // Populate URLs
    const base = window.location.origin;
    const keyPlaceholder = k.prefix + "...";
    const encodedKey = encodeURIComponent(keyPlaceholder);
    elements.urlChargers.value = `${base}/api/v1/chargers?api_key=${encodedKey}`;
    
    const updateEnergyUrl = () => {
      const period = elements.periodSelect.value;
      elements.urlEnergy.value = `${base}/api/v1/energy?api_key=${encodedKey}&group_by=user&period=${period}`;
    };
    
    // Reset period select to default 1m
    elements.periodSelect.value = "1m";
    updateEnergyUrl();

    // Remove old listeners to avoid multiple attachments
    const newPeriodSelect = elements.periodSelect.cloneNode(true);
    elements.periodSelect.parentNode.replaceChild(newPeriodSelect, elements.periodSelect);
    elements.periodSelect = newPeriodSelect;
    
    elements.periodSelect.addEventListener("change", updateEnergyUrl);

    // Toggle buttons
    if (k.active) {
      elements.btnPauseKey.classList.remove("d-none");
      elements.btnReactivateKey.classList.add("d-none");
    } else {
      elements.btnPauseKey.classList.add("d-none");
      elements.btnReactivateKey.classList.remove("d-none");
    }

    elements.reviewModal.show();
  }

  function renderWhitelist(list) {
    elements.specWhitelist.textContent = list.length > 0 ? list.join(", ") : "Ingen begränsning (öppen)";
    elements.whitelistBadges.innerHTML = list.map((ip, idx) => `
      <span class="badge bg-info text-dark d-flex align-items-center gap-2">
        ${UI.esc(ip)}
        <i class="bi bi-x-circle-fill cursor-pointer" onclick="window.removeIpFromWhitelist(${idx})"></i>
      </span>
    `).join("");
    
    if (list.length === 0) {
        elements.whitelistBadges.innerHTML = '<span class="text-muted small">Inga IP-adresser tillagda.</span>';
    }
  }

  window.removeIpFromWhitelist = async function(idx) {
    const k = activeKeys.find(x => x.hash === currentReviewHash);
    if (!k) return;
    
    const newList = [...(k.ip_whitelist || [])];
    newList.splice(idx, 1);
    
    try {
      const res = await UI.postJSON("/api/admin/external/keys/whitelist", {
        org_id: k.org_id,
        key_hash: k.hash,
        ip_whitelist: newList
      });
      if (res.ok) {
        k.ip_whitelist = newList;
        renderWhitelist(newList);
        UI.toast("IP-vitlista uppdaterad");
      }
    } catch (err) {
      UI.alert("Kunde inte uppdatera vitlista: " + err.message);
    }
  };

  elements.btnAddIp.addEventListener("click", async () => {
    const ip = elements.newIpInput.value.trim();
    if (!ip) return;
    
    const k = activeKeys.find(x => x.hash === currentReviewHash);
    if (!k) return;
    
    const newList = [...(k.ip_whitelist || [])];
    if (newList.includes(ip)) {
        UI.alert("IP-adressen finns redan i listan.");
        return;
    }
    newList.push(ip);
    
    try {
      const res = await UI.postJSON("/api/admin/external/keys/whitelist", {
        org_id: k.org_id,
        key_hash: k.hash,
        ip_whitelist: newList
      });
      if (res.ok) {
        k.ip_whitelist = newList;
        renderWhitelist(newList);
        elements.newIpInput.value = "";
        UI.toast("IP tillagd i vitlistan");
      }
    } catch (err) {
      UI.alert("Kunde inte lägga till IP: " + err.message);
    }
  });

  async function setKeyStatus(active) {
    const k = activeKeys.find(x => x.hash === currentReviewHash);
    if (!k) return;

    try {
      const res = await UI.postJSON("/api/admin/external/keys/status", {
        org_id: k.org_id,
        key_hash: k.hash,
        active: active
      });
      if (res.ok) {
        elements.reviewModal.hide();
        UI.toast(active ? "Nyckeln är nu aktiv" : "Nyckeln har pausats", active ? "success" : "warning");
        const keys = await UI.getJSON("/api/admin/external/keys");
        activeKeys = keys;
        renderKeys(keys);
      }
    } catch (err) {
      UI.alert("Kunde inte uppdatera status: " + err.message);
    }
  }

  elements.btnPauseKey.addEventListener("click", () => setKeyStatus(false));
  elements.btnReactivateKey.addEventListener("click", () => setKeyStatus(true));
  elements.btnRevokeInside.addEventListener("click", () => {
    const k = activeKeys.find(x => x.hash === currentReviewHash);
    if (!k) return;
    pendingRevoke = { org_id: k.org_id, key_hash: k.hash };
    elements.reviewModal.hide();
    elements.revokeModal.show();
  });

  // Generate new key
  elements.keyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const org_id = elements.orgPick.value;
    const rate_limit = parseInt(elements.rateLimit.value);
    const ip_raw = elements.ipWhitelist.value.trim();
    const ip_whitelist = ip_raw ? ip_raw.split(",").map(x => x.trim()).filter(x => x) : null;

    try {
      const res = await UI.postJSON("/api/admin/external/keys/generate", { 
        org_id, 
        rate_limit,
        ip_whitelist
      });
      if (res.ok) {
        elements.rawKeyDisplay.value = res.raw_key;
        elements.newKeyAlert.classList.remove("d-none");
        UI.toast("API-nyckel skapad!");
        // Refresh table
        const keys = await UI.getJSON("/api/admin/external/keys");
        activeKeys = keys;
        renderKeys(keys);
      }
    } catch (err) {
      UI.alert("Kunde inte skapa nyckel: " + err.message);
    }
  });

  // Revoke key
  elements.btnConfirmRevoke.addEventListener("click", async () => {
    if (!pendingRevoke) return;
    try {
      const res = await UI.postJSON("/api/admin/external/keys/revoke", pendingRevoke);
      if (res.ok) {
        elements.revokeModal.hide();
        UI.toast("Nyckeln har tagits bort", "warning");
        const keys = await UI.getJSON("/api/admin/external/keys");
        activeKeys = keys;
        renderKeys(keys);
      }
    } catch (err) {
      UI.alert("Kunde inte ta bort nyckel: " + err.message);
    }
  });

  // Copy key
  elements.btnCopyKey.addEventListener("click", () => {
    elements.rawKeyDisplay.select();
    document.execCommand("copy");
    UI.toast("Kopierat till urklipp!");
  });

  // Copy URLs
  elements.btnCopyUrlChargers.addEventListener("click", () => {
    elements.urlChargers.select();
    document.execCommand("copy");
    UI.toast("API-URL (Laddare) kopierad!");
  });

  elements.btnCopyUrlEnergy.addEventListener("click", () => {
    elements.urlEnergy.select();
    document.execCommand("copy");
    UI.toast("API-URL (Energi) kopierad!");
  });

  init();
})();
