(function () {
  const { cfg, rpc, configured, esc, emblem, toast, copyText, sanitize, timeAgo } = window.GS;
  const $ = (id) => document.getElementById(id);
  const SS_KEY = "gs_admin_key";
  let adminKey = null;
  let buyers = [];
  let pendingDoc = null;

  const ERRORS = {
    admin_auth: "Admin password galat hai.",
    name_required: "Naam likhein.",
    bad_phone: "Phone number sahi likhein (03XX XXXXXXX).",
    exists: "Yeh phone number pehle se add hai. Neeche list mein dhoondein.",
    empty_doc: "File khali hai.",
    network: "Internet connection check karein.",
    server: "Server error.",
  };
  const errText = (r) => ERRORS[r.error] || r.detail || ERRORS.server;

  function ss(key, value) {
    try {
      if (value === undefined) return sessionStorage.getItem(key);
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch (e) {
      return null;
    }
  }

  async function admin(action, data) {
    const r = await rpc("gs_admin", { p_key: adminKey, p_action: action, p_data: data || {} });
    if (!r.ok && r.error === "admin_auth") logout("Session khatam. Dobara login karein.");
    return r;
  }

  // ---------- Login ----------
  function logout(message) {
    adminKey = null;
    ss(SS_KEY, null);
    $("screen-admin").classList.add("hidden");
    $("screen-login").classList.remove("hidden");
    const err = $("login-error");
    err.textContent = message || "";
    err.classList.toggle("hidden", !message);
  }

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = $("admin-pass").value;
    $("login-btn").disabled = true;
    const r = await rpc("gs_admin", { p_key: key, p_action: "ping", p_data: {} });
    $("login-btn").disabled = false;
    if (!r.ok) {
      $("login-error").textContent = errText(r);
      $("login-error").classList.remove("hidden");
      return;
    }
    adminKey = key;
    ss(SS_KEY, key);
    $("admin-pass").value = "";
    enter();
  });
  $("logout-btn").addEventListener("click", () => logout());

  function enter() {
    $("screen-login").classList.add("hidden");
    $("screen-admin").classList.remove("hidden");
    refresh();
  }

  // ---------- Data ----------
  async function refresh() {
    const [list, ev] = await Promise.all([admin("list"), admin("events")]);
    if (list.ok) {
      buyers = list.buyers || [];
      renderStats();
      renderBuyers();
      renderDocInfo(list.doc);
    } else if (list.error !== "admin_auth") {
      toast(errText(list));
    }
    if (ev.ok) renderEvents(ev.events || []);
  }
  $("refresh-btn").addEventListener("click", refresh);

  function renderStats() {
    $("st-total").textContent = buyers.length;
    $("st-opened").textContent = buyers.filter((b) => b.device_bound).length;
    $("st-attempts").textContent = buyers.reduce((n, b) => n + (b.other_device_attempts || 0), 0);
    $("st-blocked").textContent = buyers.filter((b) => b.status === "blocked").length;
  }

  function renderDocInfo(doc) {
    $("doc-warning").classList.toggle("hidden", !!doc);
    if (doc) {
      $("doc-info").innerHTML = `Abhi live: <b>${esc(doc.title)}</b> · ${Math.round(doc.size / 1024)} KB · update ${esc(timeAgo(doc.updated_at))}. Nayi file upload karne se yeh replace ho jayegi.`;
      if (!$("doc-title").value) $("doc-title").value = doc.title;
    }
  }

  function siteUrl() {
    return new URL("./", location.href).href;
  }
  function waNumber(phone) {
    const d = String(phone).replace(/\D/g, "");
    return d.startsWith("0") ? "92" + d.slice(1) : d;
  }
  function buyerMessage(b) {
    return [
      `Assalam o Alaikum ${b.name}! 🎖️`,
      `Aapki *PMA Initial Test MCQs Sheet* tayar hai.`,
      ``,
      `🔗 Link: ${siteUrl()}`,
      `📱 Phone: ${b.phone}`,
      `🔑 Code: *${b.code}*`,
      ``,
      `⚠️ Zaroori:`,
      `• Link ko Chrome (Android) ya Safari (iPhone) mein kholein.`,
      `• Sheet sirf usi phone par chalegi jis par aap pehli dafa kholenge.`,
      `• Code kisi ko na dein. Doosre phone par sheet nahi khulegi aur account block ho sakta hai.`,
      ``,
      `Shukriya, ${cfg.ACADEMY_NAME || "ISSB Green Academy"}`,
    ].join("\n");
  }
  function waLink(b) {
    return `https://wa.me/${waNumber(b.phone)}?text=${encodeURIComponent(buyerMessage(b))}`;
  }

  // ---------- Add buyer ----------
  $("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("add-btn").disabled = true;
    const r = await admin("add", { name: $("add-name").value, phone: $("add-phone").value, note: $("add-note").value });
    $("add-btn").disabled = false;
    if (!r.ok) {
      $("add-result").innerHTML = `<div class="notice error">${esc(errText(r))}</div>`;
      return;
    }
    const b = r.buyer;
    $("add-result").innerHTML = `
      <div class="result-box">
        <div class="hint" style="margin:0">${esc(b.name)} · ${esc(b.phone)} ka code:</div>
        <div class="code-big">${esc(b.code)}</div>
        <pre>${esc(buyerMessage(b))}</pre>
        <div class="btn-row">
          <a class="btn whatsapp" href="${esc(waLink(b))}" target="_blank" rel="noopener">WhatsApp par bhejein</a>
          <button class="btn ghost" type="button" id="copy-msg">Message copy karein</button>
        </div>
      </div>`;
    $("copy-msg").onclick = async () => {
      if (await copyText(buyerMessage(b))) toast("Message copy ho gaya");
    };
    $("add-form").reset();
    refresh();
  });

  // ---------- Buyers list ----------
  $("search").addEventListener("input", renderBuyers);

  function renderBuyers() {
    const q = $("search").value.trim().toLowerCase();
    const list = buyers.filter((b) => !q || [b.name, b.phone, b.code, b.note].join(" ").toLowerCase().includes(q));
    if (!list.length) {
      $("buyers").innerHTML = `<div class="empty">${buyers.length ? "Koi match nahi mila." : "Abhi koi buyer nahi. Upar se pehla buyer add karein."}</div>`;
      return;
    }
    $("buyers").innerHTML = list
      .map((b) => {
        const chips = [];
        chips.push(b.status === "blocked" ? `<span class="chip bad">Blocked</span>` : `<span class="chip ok">Active</span>`);
        chips.push(b.device_bound ? `<span class="chip">🔒 ${esc(b.device_label || "Device locked")}</span>` : `<span class="chip warn">Abhi khola nahi</span>`);
        if (b.other_device_attempts) chips.push(`<span class="chip bad">⚠️ ${b.other_device_attempts}× doosra phone</span>`);
        return `
        <div class="buyer ${b.other_device_attempts ? "flagged" : ""}" data-id="${esc(b.id)}">
          <div>
            <div class="name">${esc(b.name)}</div>
            <div class="meta">${esc(b.phone)} · Code: <span class="code">${esc(b.code)}</span></div>
            <div class="chips">${chips.join("")}</div>
          </div>
          <div class="meta">
            Last seen: ${esc(timeAgo(b.last_seen_at))}<br>
            Views: ${b.view_count || 0}${b.note ? `<br>Note: ${esc(b.note)}` : ""}
          </div>
          <div class="actions">
            <a class="btn whatsapp small" href="${esc(waLink(b))}" target="_blank" rel="noopener">Message</a>
            <button class="btn ghost small" data-act="reset_device" type="button">Device reset</button>
            <button class="btn ghost small" data-act="new_code" type="button">Naya code</button>
            ${b.status === "blocked"
              ? `<button class="btn ghost small" data-act="unblock" type="button">Unblock</button>`
              : `<button class="btn danger small" data-act="block" type="button">Block</button>`}
            <button class="btn danger small" data-act="delete" type="button">Delete</button>
          </div>
        </div>`;
      })
      .join("");
  }

  const CONFIRM = {
    reset_device: (b) => `${b.name} ka device reset karein? Woh agla jo phone use karega, sheet us se lock ho jayegi.`,
    new_code: (b) => `${b.name} ka naya code banayein? Purana code band ho jayega aur device bhi reset hoga.`,
    block: (b) => `${b.name} ko block karein? Sheet un ke liye band ho jayegi.`,
    unblock: (b) => `${b.name} ko unblock karein?`,
    delete: (b) => `${b.name} ko hamesha ke liye delete karein? Yeh wapas nahi hoga.`,
  };
  const DONE = {
    reset_device: "Device reset ho gaya",
    new_code: "Naya code ban gaya",
    block: "Block ho gaya",
    unblock: "Unblock ho gaya",
    delete: "Delete ho gaya",
  };

  $("buyers").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest(".buyer").getAttribute("data-id");
    const b = buyers.find((x) => x.id === id);
    const act = btn.getAttribute("data-act");
    if (!b || !confirm(CONFIRM[act](b))) return;
    btn.disabled = true;
    const r = await admin(act, { id });
    if (!r.ok) {
      btn.disabled = false;
      toast(errText(r));
      return;
    }
    toast(DONE[act]);
    if (act === "new_code") {
      b.code = r.code;
      if (confirm(`Naya code: ${r.code}\n\nWhatsApp par bhejna hai?`)) window.open(waLink(b), "_blank");
    }
    refresh();
  });

  // ---------- Events ----------
  const EVENT_TEXT = {
    added: "Buyer add hua",
    first_login: "Pehli dafa sheet kholi (device lock ho gaya)",
    login: "Login",
    same_phone_relogin: "Usi phone par dobara login (browser data saaf hua tha)",
    other_device_blocked: "⚠️ Doosre phone se kholne ki koshish, block kar di gayi",
    device_reset: "Device reset",
    new_code: "Naya code bana",
    blocked: "Block kiya gaya",
    unblocked: "Unblock kiya gaya",
  };
  function renderEvents(events) {
    if (!events.length) {
      $("events").innerHTML = `<div class="empty">Abhi koi activity nahi.</div>`;
      return;
    }
    $("events").innerHTML = events
      .map(
        (ev) => `
      <div class="event ${ev.kind === "other_device_blocked" ? "alert" : ""}">
        <span class="t">${esc(timeAgo(ev.created_at))}</span>
        <span><b>${esc(ev.name || "—")}</b> ${esc(ev.phone || "")} · ${esc(EVENT_TEXT[ev.kind] || ev.kind)}${ev.device_label ? ` · <span class="meta">${esc(ev.device_label)}</span>` : ""}</span>
      </div>`
      )
      .join("");
  }

  // ---------- Upload sheet ----------
  let mammothLoading = null;
  function loadMammoth() {
    if (window.mammoth) return Promise.resolve();
    if (!mammothLoading) {
      mammothLoading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "assets/vendor/mammoth.browser.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return mammothLoading;
  }

  $("doc-file").addEventListener("change", async () => {
    const file = $("doc-file").files[0];
    pendingDoc = null;
    $("doc-publish").disabled = true;
    $("doc-preview").classList.add("hidden");
    if (!file) return;
    $("doc-status").textContent = "File parh rahe hain…";
    try {
      let html;
      if (/\.docx$/i.test(file.name)) {
        await loadMammoth();
        const result = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        html = result.value;
      } else {
        const text = await file.text();
        const doc = new DOMParser().parseFromString(text, "text/html");
        const root = doc.querySelector("#sheet-content") || doc.body;
        html = root.innerHTML;
      }
      html = sanitize(html);
      if (html.replace(/<[^>]+>/g, "").trim().length < 20) throw new Error("empty");
      pendingDoc = html;
      $("doc-preview-inner").innerHTML = html;
      $("doc-preview").classList.remove("hidden");
      const count = $("doc-preview-inner").querySelectorAll(".mcq").length;
      $("doc-status").innerHTML = `✅ File tayar: ${Math.round(html.length / 1024)} KB${count ? ` · ${count} MCQs` : ""}. Neeche preview check karein, phir <b>Publish</b> dabayein.`;
      if (!$("doc-title").value) $("doc-title").value = file.name.replace(/\.(docx|html?)$/i, "");
      $("doc-publish").disabled = false;
    } catch (err) {
      $("doc-status").textContent = "❌ File nahi parhi ja saki. .docx ya .html file chunein.";
    }
  });

  $("doc-publish").addEventListener("click", async () => {
    if (!pendingDoc) return;
    $("doc-publish").disabled = true;
    $("doc-status").textContent = "Upload ho rahi hai…";
    const r = await admin("set_doc", { title: $("doc-title").value || "MCQs Sheet", html: pendingDoc });
    if (!r.ok) {
      $("doc-publish").disabled = false;
      $("doc-status").textContent = "❌ " + errText(r);
      return;
    }
    $("doc-status").textContent = "✅ Sheet publish ho gayi. Students ko ab nayi sheet nazar aayegi.";
    $("doc-file").value = "";
    pendingDoc = null;
    toast("Sheet publish ho gayi");
    refresh();
  });

  // ---------- Start ----------
  $("login-emblem").innerHTML = emblem(96);
  $("top-emblem").innerHTML = emblem(28);
  if (!configured()) {
    $("login-error").textContent = "Setup baqi hai: config.js mein Supabase URL aur key likhein.";
    $("login-error").classList.remove("hidden");
    $("login-btn").disabled = true;
  } else if (ss(SS_KEY)) {
    adminKey = ss(SS_KEY);
    admin("ping").then((r) => r.ok && enter());
  }
})();
