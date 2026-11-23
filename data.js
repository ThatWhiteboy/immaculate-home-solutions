/* Immaculate Home Solutions — data layer.
 *
 * One small module, two modes:
 *  - LOCAL MODE  (config.js blank): state is seeded from seed-data.js and
 *    persisted to localStorage. Test/demo only — edits live in this browser.
 *  - SUPABASE MODE (config.js filled): Supabase Auth (email magic link) +
 *    Supabase REST (fetch, no SDK). Angela's session token gates every
 *    private table; anonymous visitors can only read the public settings
 *    view and insert requests / opt-outs.
 *
 * The app talks to this module in the export's camelCase field names;
 * Supabase column names (snake_case) are translated here and nowhere else.
 */
(function () {
  "use strict";
  var cfg = window.IHS_CONFIG || {};
  var MODE = (cfg.supabaseUrl && cfg.supabaseKey) ? "supabase" : "local";
  var SB = cfg.supabaseUrl ? cfg.supabaseUrl.replace(/\/$/, "") : "";
  var KEY = cfg.supabaseKey || "";
  var LS_STATE = "ihs-local-state-v1";
  var LS_SESSION = "ihs-sb-session-v1";
  var LS_LOCAL_CODE = "ihs-local-passcode-v1";

  /* ---------- field maps (camelCase <-> snake_case) ---------- */
  var MAP = {
    clients:  { referredBy: "referred_by", entryNotes: "entry_notes" },
    jobs:     { clientId: "client_id", clientName: "client_name", startTime: "start_time",
                durationMins: "duration_mins", cleanType: "clean_type", sortOrder: "sort_order",
                packList: "pack_list" },
    requests: { referredBy: "referred_by", cleanType: "clean_type",
                homeDetails: "home_details", preferredDays: "preferred_days" },
    drafts:   { jobId: "job_id", clientName: "client_name", clientPhone: "client_phone",
                forDate: "for_date", createdAt: "created_at" },
    optouts:  { optedOut: "opted_out", createdAt: "created_at" },
    padphotos:{ forDate: "for_date", dataUrl: "data_url", storagePath: "storage_path",
                createdAt: "created_at" }
  };
  var TABLE = { clients: "ihs_clients", jobs: "ihs_jobs", requests: "ihs_requests",
                drafts: "ihs_drafts", optouts: "ihs_optouts", padphotos: "ihs_pad_photos" };

  function toRow(coll, obj) {
    var m = MAP[coll] || {}, out = {}, k;
    for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[m[k] || k] = obj[k];
    return out;
  }
  function fromRow(coll, row) {
    var m = MAP[coll] || {}, rev = {}, k;
    for (k in m) rev[m[k]] = k;
    var out = {};
    for (k in row) if (Object.prototype.hasOwnProperty.call(row, k)) out[rev[k] || k] = row[k];
    return out;
  }

  /* ---------- local mode state ---------- */
  function localState() {
    try {
      var raw = localStorage.getItem(LS_STATE);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through to seed */ }
    var s = JSON.parse(JSON.stringify(window.IHS_SEED));
    s.padPhotos = [];
    localSave(s);
    return s;
  }
  function localSave(s) { try { localStorage.setItem(LS_STATE, JSON.stringify(s)); } catch (e) {} }
  function nextId(rows) { return rows.reduce(function (m, r) { return Math.max(m, r.id || 0); }, 0) + 1; }

  /* ---------- supabase helpers ---------- */
  function session() {
    try { return JSON.parse(localStorage.getItem(LS_SESSION) || "null"); } catch (e) { return null; }
  }
  function setSession(s) {
    if (s) localStorage.setItem(LS_SESSION, JSON.stringify(s));
    else localStorage.removeItem(LS_SESSION);
  }
  // Magic-link return: tokens arrive in the URL hash.
  (function captureHashSession() {
    if (MODE !== "supabase" || !location.hash) return;
    var p = new URLSearchParams(location.hash.slice(1));
    if (p.get("access_token")) {
      setSession({ access_token: p.get("access_token"), refresh_token: p.get("refresh_token"),
                   expires_at: Date.now() + (parseInt(p.get("expires_in") || "3600", 10) * 1000) });
      history.replaceState(null, "", location.pathname + location.search);
    }
  })();

  function sbFetch(path, opts) {
    opts = opts || {};
    var s = session();
    var headers = { "apikey": KEY, "Content-Type": "application/json" };
    headers["Authorization"] = "Bearer " + (s && s.access_token ? s.access_token : KEY);
    if (opts.prefer) headers["Prefer"] = opts.prefer;
    return fetch(SB + path, { method: opts.method || "GET", headers: headers,
                              body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error("Supabase " + r.status + ": " + t); });
        return r.status === 204 ? null : r.json().catch(function () { return null; });
      });
  }
  function rest(coll, qs) { return sbFetch("/rest/v1/" + TABLE[coll] + (qs || "")); }

  /* ---------- generic CRUD used by both modes ---------- */
  function list(coll, filter) {
    if (MODE === "local") {
      var rows = localState()[coll === "padphotos" ? "padPhotos" : coll].slice();
      if (filter) rows = rows.filter(filter);
      return Promise.resolve(rows);
    }
    var qs = "?select=*&order=id.asc";
    return rest(coll, qs).then(function (rows) {
      var out = rows.map(function (r) { return fromRow(coll, r); });
      return filter ? out.filter(filter) : out;
    });
  }
  function save(coll, obj) {
    if (MODE === "local") {
      var s = localState(), key = coll === "padphotos" ? "padPhotos" : coll, rows = s[key];
      if (obj.id) {
        var i = rows.findIndex(function (r) { return r.id === obj.id; });
        if (i >= 0) rows[i] = Object.assign({}, rows[i], obj);
      } else { obj.id = nextId(rows); rows.push(obj); }
      localSave(s);
      return Promise.resolve(obj);
    }
    var row = toRow(coll, obj); delete row.created_at;
    if (obj.id) {
      return sbFetch("/rest/v1/" + TABLE[coll] + "?id=eq." + obj.id,
        { method: "PATCH", prefer: "return=representation", body: row })
        .then(function (r) { return fromRow(coll, r[0]); });
    }
    delete row.id;
    return sbFetch("/rest/v1/" + TABLE[coll],
      { method: "POST", prefer: "return=representation", body: row })
      .then(function (r) { return fromRow(coll, r[0]); });
  }
  function remove(coll, id) {
    if (MODE === "local") {
      var s = localState(), key = coll === "padphotos" ? "padPhotos" : coll;
      s[key] = s[key].filter(function (r) { return r.id !== id; });
      localSave(s);
      return Promise.resolve();
    }
    return sbFetch("/rest/v1/" + TABLE[coll] + "?id=eq." + id, { method: "DELETE" });
  }

  /* ---------- public API ---------- */
  var DB = {
    mode: MODE,

    /* settings: one row/object {availability, aboutHeading, aboutBody, siteNote} */
    getPublicSettings: function () {
      if (MODE === "local") {
        var st = localState().settings;
        return Promise.resolve({ availability: st.availability, aboutHeading: st.aboutHeading,
                                 aboutBody: st.aboutBody, siteNote: st.siteNote });
      }
      return sbFetch("/rest/v1/ihs_public_settings?select=*")
        .then(function (rows) {
          var r = rows[0] || {};
          return { availability: r.availability || "accepting", aboutHeading: r.about_heading || "",
                   aboutBody: r.about_body || "", siteNote: r.site_note || "" };
        });
    },
    getSettings: function () {
      if (MODE === "local") return Promise.resolve(Object.assign({}, localState().settings));
      return sbFetch("/rest/v1/ihs_settings?select=*&id=eq.1").then(function (rows) {
        var r = rows[0] || {};
        return { availability: r.availability || "accepting", aboutHeading: r.about_heading || "",
                 aboutBody: r.about_body || "", siteNote: r.site_note || "" };
      });
    },
    updateSettings: function (patch) {
      if (MODE === "local") {
        var s = localState(); Object.assign(s.settings, patch); localSave(s);
        return Promise.resolve(s.settings);
      }
      var row = { availability: patch.availability, about_heading: patch.aboutHeading,
                  about_body: patch.aboutBody, site_note: patch.siteNote };
      Object.keys(row).forEach(function (k) { if (row[k] === undefined) delete row[k]; });
      return sbFetch("/rest/v1/ihs_settings?id=eq.1", { method: "PATCH", body: row });
    },

    listClients: function () { return list("clients").then(function (r) {
      return r.sort(function (a, b) { return a.name.localeCompare(b.name); }); }); },
    saveClient: function (c) { return save("clients", c); },
    deleteClient: function (id) { return remove("clients", id); },

    listJobs: function () { return list("jobs").then(function (r) {
      return r.sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 :
          (a.sortOrder - b.sortOrder) || String(a.startTime).localeCompare(String(b.startTime)); }); }); },
    saveJob: function (j) { return save("jobs", j); },
    deleteJob: function (id) { return remove("jobs", id); },

    listRequests: function () { return list("requests").then(function (r) {
      return r.sort(function (a, b) { return b.id - a.id; }); }); },
    submitRequest: function (req) { req.status = "pending"; return save("requests", req); },
    decideRequest: function (req, approve) {
      var self = this;
      var status = approve ? "approved" : "declined";
      if (!approve) return save("requests", { id: req.id, status: status });
      // Approving adds the person to Angela's client book (mirrors the Muse app).
      return self.saveClient({ name: req.name, phone: req.phone || "", email: req.email || "",
        address: "", referredBy: req.referredBy || "", entryNotes: "", notes: "",
        pets: "", preferences: "" })
        .then(function () { return save("requests", { id: req.id, status: status }); });
    },

    listDrafts: function () { return list("drafts").then(function (r) {
      return r.sort(function (a, b) { return b.id - a.id; }); }); },
    saveDraft: function (d) { if (!d.status) d.status = "draft"; return save("drafts", d); },
    deleteDraft: function (id) { return remove("drafts", id); },
    setDraftStatus: function (id, status) { return save("drafts", { id: id, status: status }); },
    approveAllDraftsForDate: function (date) {
      return this.listDrafts().then(function (rows) {
        var todo = rows.filter(function (d) { return d.forDate === date && d.status === "draft"; });
        return Promise.all(todo.map(function (d) { return save("drafts", { id: d.id, status: "approved" }); }));
      });
    },

    listOptOuts: function () { return list("optouts"); },
    recordOptOut: function (contact, channel, optedOut) {
      return save("optouts", { contact: contact, channel: channel, optedOut: optedOut,
                               createdAt: new Date().toISOString() });
    },

    listPadPhotos: function (date) {
      return list("padphotos", function (p) { return p.forDate === date; });
    },
    addPadPhoto: function (date, dataUrl) {
      return save("padphotos", { forDate: date, dataUrl: dataUrl, storagePath: "",
                                 createdAt: new Date().toISOString() });
    },
    deletePadPhoto: function (id) { return remove("padphotos", id); },

    /* ---------- auth ---------- */
    isSignedIn: function () {
      if (MODE === "local") return true; // local gate handled separately below
      var s = session();
      return !!(s && s.access_token && (!s.expires_at || s.expires_at > Date.now()));
    },
    sendMagicLink: function (email) {
      if (MODE === "local") return Promise.resolve();
      return fetch(SB + "/auth/v1/otp", { method: "POST",
        headers: { "apikey": KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, create_user: false,
          options: { emailRedirectTo: location.origin + location.pathname } }) })
        .then(function (r) { if (!r.ok) return r.text().then(function (t) {
          throw new Error("Sign-in link failed (" + r.status + "): " + t); }); });
    },
    signOut: function () { setSession(null); return Promise.resolve(); },

    /* Local-mode device passcode (quick unlock only; Supabase mode uses the
       real login above). Stored as a salted SHA-256 hash, never the code. */
    localCodeIsSet: function () { return !!localStorage.getItem(LS_LOCAL_CODE); },
    localUnlocked: function () { return sessionStorage.getItem("ihs-local-unlocked") === "1"; },
    setLocalCode: function (code) {
      var salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
      return sha256(salt + ":" + code).then(function (h) {
        localStorage.setItem(LS_LOCAL_CODE, salt + "$" + h);
        sessionStorage.setItem("ihs-local-unlocked", "1");
      });
    },
    tryLocalCode: function (code) {
      var stored = localStorage.getItem(LS_LOCAL_CODE);
      if (!stored) { sessionStorage.setItem("ihs-local-unlocked", "1"); return Promise.resolve(true); }
      var parts = stored.split("$");
      return sha256(parts[0] + ":" + code).then(function (h) {
        var ok = h === parts[1];
        if (ok) sessionStorage.setItem("ihs-local-unlocked", "1");
        return ok;
      });
    },
    lockLocal: function () { sessionStorage.removeItem("ihs-local-unlocked"); }
  };

  function sha256(text) {
    if (window.crypto && crypto.subtle) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
        .then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return ("0" + b.toString(16)).slice(-2); }).join("");
        });
    }
    // Non-secure-context fallback (plain hash; local quick-unlock only).
    var h = 0; for (var i = 0; i < text.length; i++) { h = ((h << 5) - h + text.charCodeAt(i)) | 0; }
    return Promise.resolve("x" + h);
  }

  window.IHS_DB = DB;
})();
