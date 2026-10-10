(function () {
  const cfg = window.GS_CONFIG || {};
  const REST = cfg.REST_URL || String(cfg.SUPABASE_URL || "").replace(/\/+$/, "") + "/rest/v1";

  function configured() {
    if (cfg.REST_URL) return true;
    return (
      /^https:\/\/.+/.test(cfg.SUPABASE_URL || "") &&
      !/YOUR-PROJECT/.test(cfg.SUPABASE_URL) &&
      !!cfg.SUPABASE_KEY &&
      !/YOUR-/.test(cfg.SUPABASE_KEY)
    );
  }

  // Publishable aur legacy anon dono keys sirf "apikey" header mein jati hain
  async function rpc(fn, args) {
    let res;
    try {
      res = await fetch(`${REST}/rpc/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.SUPABASE_KEY || "" },
        body: JSON.stringify(args || {}),
      });
    } catch (e) {
      return { ok: false, error: "network" };
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {}
    if (!res.ok) {
      return { ok: false, error: "server", detail: (data && (data.message || data.hint)) || `HTTP ${res.status}` };
    }
    return data || { ok: false, error: "server" };
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function store(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {}
  }
  function load(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  // Academy ka shield logo (images wale design jaisa)
  function emblem(size) {
    const GOLD = "#E2BC5A";
    const star = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 40 : 17;
      star.push(`${(200 + r * Math.cos(a)).toFixed(1)},${(128 + r * Math.sin(a)).toFixed(1)}`);
    }
    let leaves = "";
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const deg = 98 + (84 * i) / 8;
        const a = (deg * Math.PI) / 180;
        const x = 200 + side * 205 * Math.sin(a);
        const y = 250 - 205 * Math.cos(a);
        for (const off of [-1, 1]) {
          const lx = x + off * 13 * Math.sin(a) * side;
          const ly = y - off * 13 * Math.cos(a);
          const rot = side * (deg - 90) + off * 32 * side;
          leaves += `<ellipse cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" rx="8" ry="20" fill="${GOLD}" transform="rotate(${rot.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})"/>`;
        }
      }
    }
    const id = "g" + Math.random().toString(36).slice(2, 8);
    return `<svg width="${size}" height="${Math.round(size * 1.12)}" viewBox="-30 0 460 515" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14684A"/><stop offset="1" stop-color="#07301F"/></linearGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3D987"/><stop offset=".5" stop-color="${GOLD}"/><stop offset="1" stop-color="#A8842E"/></linearGradient>
  </defs>
  <g>${leaves}</g>
  <path d="M200 22 L368 72 L368 250 C368 358 292 428 200 466 C108 428 32 358 32 250 L32 72 Z" fill="url(#${id}s)" stroke="url(#${id}g)" stroke-width="14" stroke-linejoin="round"/>
  <polygon points="${star.join(" ")}" fill="url(#${id}g)"/>
  <text x="200" y="292" text-anchor="middle" font-family="Oswald, 'DIN Condensed', Impact, sans-serif" font-weight="700" font-size="128" letter-spacing="4" fill="#F7EED6">ISSB</text>
  <line x1="110" y1="318" x2="290" y2="318" stroke="${GOLD}" stroke-width="3"/>
  <text x="200" y="362" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="30" letter-spacing="5" fill="${GOLD}">GREEN</text>
  <text x="200" y="398" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="23" letter-spacing="6" fill="#F7EED6">ACADEMY</text>
</svg>`;
  }

  function toast(msg, ms) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms || 2200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err) {}
      ta.remove();
      return ok;
    }
  }

  // Sheet ka HTML saaf karna (scripts, styles, events hata kar)
  function sanitize(html) {
    return window.DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true, svg: true },
      FORBID_TAGS: ["style", "script", "iframe", "form", "input", "button", "link", "meta"],
      FORBID_ATTR: ["style"],
      ADD_ATTR: ["data-ans"],
    });
  }

  function timeAgo(iso) {
    if (!iso) return "—";
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "abhi";
    if (s < 3600) return Math.floor(s / 60) + " min pehle";
    if (s < 86400) return Math.floor(s / 3600) + " ghante pehle";
    return Math.floor(s / 86400) + " din pehle";
  }

  window.GS = { cfg, rpc, configured, esc, store, load, emblem, toast, copyText, sanitize, timeAgo };
})();
