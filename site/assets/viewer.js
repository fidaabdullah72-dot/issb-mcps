(function () {
  const { cfg, rpc, configured, esc, store, load, emblem, copyText, toast, sanitize } = window.GS;
  const $ = (id) => document.getElementById(id);
  const LS_DEVICE = "gs_device_id";
  const LS_TOKEN = "gs_token";

  const MESSAGES = {
    wrong: "Phone number ya code galat hai. Dobara check karein.",
    too_many: "Bohot zyada ghalat koshishein ho gayi hain. 15 minute baad dobara try karein.",
    blocked: "Yeh account band kar diya gaya hai. Academy se WhatsApp par rabta karein.",
    other_device:
      "Yeh sheet pehle se kisi aur phone par khul chuki hai. Ek account sirf ek phone par chalta hai. Agar aap ne phone badla hai to academy ko WhatsApp karein.",
    session: "Dobara login karein.",
    no_doc: "Sheet abhi upload nahi hui. Thori dair baad dobara kholein.",
    network: "Internet connection nahi mil raha. Internet check karke dobara koshish karein.",
    server: "Server se jawab nahi aaya. Thori dair baad dobara koshish karein.",
    bad_request: "Browser mein masla hai. Chrome ya Safari mein kholein.",
  };

  const SCREENS = ["screen-loading", "screen-login", "screen-error", "screen-sheet"];
  function show(id) {
    SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id));
  }

  // ---------- Device identity ----------
  function randomId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  function deviceId() {
    let id = load(LS_DEVICE);
    if (!id || id.length < 16) {
      id = randomId();
      store(LS_DEVICE, id);
    }
    return id;
  }
  async function deviceFingerprint() {
    const parts = [
      navigator.userAgent,
      Math.min(screen.width, screen.height) + "x" + Math.max(screen.width, screen.height),
      window.devicePixelRatio || 1,
      (Intl.DateTimeFormat().resolvedOptions().timeZone || ""),
      navigator.language || "",
      navigator.hardwareConcurrency || "",
      navigator.platform || "",
    ].join("|");
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
      return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      return parts.slice(0, 250);
    }
  }
  function deviceLabel() {
    const ua = navigator.userAgent;
    const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iPhone/iPad" : /Windows/i.test(ua) ? "Windows" : /Mac OS X/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "Device";
    const browser = /FBAN|FBAV/i.test(ua) ? "Facebook app" : /Instagram/i.test(ua) ? "Instagram app" : /SamsungBrowser/i.test(ua) ? "Samsung Internet" : /EdgA?\/|Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/i.test(ua) ? "Opera" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox/i.test(ua) ? "Firefox" : /Safari/i.test(ua) ? "Safari" : "Browser";
    const m = ua.match(/Android [\d.]+; ([^;)]+)/);
    const model = m && m[1].trim() !== "K" ? " " + m[1].trim() : "";
    return `${os}${model} · ${browser}`;
  }
  function inAppBrowser() {
    return /FBAN|FBAV|Instagram|Snapchat|Line\/|; wv\)/i.test(navigator.userAgent);
  }

  // ---------- Login ----------
  function showLogin(message) {
    show("screen-login");
    const err = $("login-error");
    if (message) {
      err.textContent = message;
      err.classList.remove("hidden");
    } else {
      err.classList.add("hidden");
    }
  }

  function showError(message, retry) {
    $("error-text").textContent = message;
    $("retry-btn").onclick = retry || (() => location.reload());
    show("screen-error");
  }

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const phone = $("phone").value.trim();
    const code = $("code").value.trim().toUpperCase();
    if (phone.replace(/\D/g, "").length < 10 || code.length < 4) {
      showLogin("Phone number aur code dono sahi likhein.");
      return;
    }
    const btn = $("login-btn");
    btn.disabled = true;
    btn.textContent = "Check ho raha hai…";
    const r = await rpc("gs_login", {
      p_phone: phone,
      p_code: code,
      p_device_id: deviceId(),
      p_device_fp: await deviceFingerprint(),
      p_device_label: deviceLabel(),
    });
    btn.disabled = false;
    btn.textContent = "Sheet kholein";
    if (r.ok) {
      store(LS_TOKEN, r.token);
      openSheet(r.token);
    } else {
      showLogin(MESSAGES[r.error] || MESSAGES.server);
    }
  });

  // ---------- Sheet ----------
  async function openSheet(token) {
    show("screen-loading");
    const r = await rpc("gs_content", { p_token: token, p_device_id: deviceId() });
    if (r.ok) {
      renderSheet(r);
      show("screen-sheet");
      return;
    }
    if (r.error === "network" || r.error === "server" || r.error === "no_doc") {
      showError(MESSAGES[r.error], () => openSheet(token));
      return;
    }
    store(LS_TOKEN, null);
    showLogin(MESSAGES[r.error] || MESSAGES.session);
  }

  function renderSheet(r) {
    const sheet = $("sheet");
    sheet.innerHTML = sanitize(r.html);
    document.title = `${r.title} — ${cfg.ACADEMY_NAME || "ISSB Green Academy"}`;
    $("who").textContent = `${r.name} · ${r.phone}`;
    $("sheet-footer").textContent = `Yeh sheet sirf ${r.name} (${r.phone}) ke liye hai. Aage share karna mana hai.`;
    setWatermark(`${r.name} • ${r.phone}`);
    buildToc();
    setupPractice();
  }

  function setWatermark(text) {
    const t = esc(text);
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='230'>` +
      `<g transform='rotate(-28 180 115)' font-family='Arial, sans-serif' font-weight='700' text-anchor='middle'>` +
      `<text x='180' y='105' font-size='17' fill='rgba(14,77,55,0.17)'>${t}</text>` +
      `<text x='180' y='130' font-size='11' fill='rgba(14,77,55,0.14)'>ISSB GREEN ACADEMY</text>` +
      `</g></svg>`;
    $("watermark").style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  }

  function buildToc() {
    const panel = $("toc-panel");
    const heads = $("sheet").querySelectorAll("h2, h3");
    let html = "<h3>Sections</h3>";
    heads.forEach((h, i) => {
      if (!h.id) h.id = "sec-" + i;
      html += `<a href="#${h.id}" class="${h.tagName === "H3" ? "sub" : ""}">${esc(h.textContent)}</a>`;
    });
    panel.innerHTML = html;
    $("toc-btn").classList.toggle("hidden", heads.length === 0);
  }

  $("toc-btn").addEventListener("click", () => $("toc").classList.remove("hidden"));
  $("toc").addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a) {
      e.preventDefault();
      const target = document.getElementById(a.getAttribute("href").slice(1));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    $("toc").classList.add("hidden");
  });
  $("to-top").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  // ---------- Practice mode ----------
  let score = { right: 0, total: 0 };
  function setupPractice() {
    const has = $("sheet").querySelector(".mcq[data-ans]");
    $("practice-btn").classList.toggle("hidden", !has);
  }
  function resetPractice() {
    score = { right: 0, total: 0 };
    $("sheet").querySelectorAll(".mcq.answered").forEach((m) => m.classList.remove("answered"));
    $("sheet").querySelectorAll(".picked-wrong, .picked-right").forEach((li) => li.classList.remove("picked-wrong", "picked-right"));
    updateScore();
  }
  function updateScore() {
    const on = $("sheet").classList.contains("practice");
    $("scorebar").classList.toggle("hidden", !on);
    $("scorebar").textContent = score.total
      ? `Practice mode: ${score.right} / ${score.total} sahi (${Math.round((score.right / score.total) * 100)}%)`
      : "Practice mode: jawab chhupe hue hain. Kisi bhi option par tap karein.";
  }
  $("practice-btn").addEventListener("click", () => {
    const sheet = $("sheet");
    const on = !sheet.classList.contains("practice");
    sheet.classList.toggle("practice", on);
    $("practice-btn").classList.toggle("on", on);
    $("practice-btn").textContent = on ? "Answers dikhayein" : "Practice";
    resetPractice();
  });
  $("sheet").addEventListener("click", (e) => {
    const sheet = $("sheet");
    if (!sheet.classList.contains("practice")) return;
    const li = e.target.closest(".mcq[data-ans] ol.opts > li");
    if (!li) return;
    const mcq = li.closest(".mcq");
    if (mcq.classList.contains("answered")) return;
    const items = Array.from(li.parentElement.children);
    const picked = items.indexOf(li);
    const correct = parseInt(mcq.getAttribute("data-ans"), 10);
    mcq.classList.add("answered");
    li.classList.add(picked === correct ? "picked-right" : "picked-wrong");
    score.total += 1;
    if (picked === correct) score.right += 1;
    updateScore();
  });

  // ---------- Copy / print / screenshot rokna ----------
  const onSheet = () => !$("screen-sheet").classList.contains("hidden");
  ["copy", "cut", "contextmenu", "selectstart", "dragstart"].forEach((ev) =>
    document.addEventListener(ev, (e) => {
      if (onSheet()) e.preventDefault();
    })
  );
  document.addEventListener("keydown", (e) => {
    if (!onSheet()) return;
    const k = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ["c", "x", "s", "p", "a", "u"].includes(k)) {
      e.preventDefault();
      toast("Yeh sheet copy ya save nahi ho sakti.");
    }
    if (k === "printscreen") hideFor(1500);
  });
  document.addEventListener("keyup", (e) => {
    if (onSheet() && (e.key || "").toLowerCase() === "printscreen") {
      hideFor(1500);
      copyText(" ");
    }
  });
  window.addEventListener("beforeprint", () => hideFor(3000));

  let hideTimer = null;
  function setShield(on) {
    $("shield").classList.toggle("hidden", !on);
  }
  function hideFor(ms) {
    setShield(true);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setShield(false), ms);
  }
  document.addEventListener("visibilitychange", () => {
    if (!onSheet()) return;
    if (document.hidden) setShield(true);
    else setTimeout(() => setShield(false), 250);
  });
  window.addEventListener("blur", () => {
    if (onSheet()) setShield(true);
  });
  window.addEventListener("focus", () => setTimeout(() => setShield(false), 250));

  // ---------- Start ----------
  function init() {
    $("login-emblem").innerHTML = emblem(110);
    $("error-emblem").innerHTML = emblem(90);
    $("top-emblem").innerHTML = emblem(30);
    if (cfg.ACADEMY_NAME) $("academy-name").textContent = cfg.ACADEMY_NAME;
    if (cfg.SHEET_SUBTITLE) $("sheet-subtitle").textContent = cfg.SHEET_SUBTITLE;
    const wa = String(cfg.WHATSAPP_NUMBER || "").replace(/\D/g, "");
    // Placeholder (923000000000) ya khali number par Madad button chhupa rahe
    if (wa.length >= 11 && !/^923?0+$/.test(wa)) {
      $("help-link").href = `https://wa.me/${wa}?text=${encodeURIComponent("Assalam o Alaikum, MCQs sheet kholne mein madad chahiye.")}`;
    } else {
      $("help-link").classList.add("hidden");
    }
    if (inAppBrowser()) $("inapp-warning").classList.remove("hidden");
    $("copy-link").addEventListener("click", async () => {
      if (await copyText(location.href)) toast("Link copy ho gaya. Ab Chrome/Safari mein paste karein.");
    });

    if (!configured()) {
      showError("Setup baqi hai: config.js mein Supabase URL aur key likhein.");
      return;
    }
    deviceId();
    const token = load(LS_TOKEN);
    if (token) openSheet(token);
    else showLogin();
  }

  init();
})();
