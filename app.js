/* Immaculate Home Solutions — app logic (public front + Angela's book). */
(function () {
  "use strict";
  var DB = window.IHS_DB;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /* ---------- dates (plain local calendar dates, America/Denver) ---------- */
  function key(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function parse(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function todayKey() { return key(new Date()); }
  function pretty(k, opts) { return parse(k).toLocaleDateString("en-US", opts || { weekday: "long", month: "long", day: "numeric", year: "numeric" }); }
  function time12(t) {
    if (!t) return "";
    var p = t.split(":"), h = +p[0], m = p[1] || "00", ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return h + ":" + m + " " + ap;
  }
  function holiday(k) {
    var d = parse(k), y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate(), dow = d.getDay();
    var fixed = { "1-1": "New Year's Day", "2-14": "Valentine's Day", "3-17": "St. Patrick's Day",
      "6-19": "Juneteenth", "7-4": "Independence Day", "10-31": "Halloween", "11-11": "Veterans Day",
      "12-24": "Christmas Eve", "12-25": "Christmas", "12-31": "New Year's Eve" };
    if (fixed[m + "-" + day]) return fixed[m + "-" + day];
    function nth(n, wd) { return dow === wd && Math.ceil(day / 7) === n; }
    function last(wd) { var nxt = new Date(y, d.getMonth(), day + 7); return dow === wd && nxt.getMonth() !== d.getMonth(); }
    if (m === 1 && nth(3, 1)) return "MLK Day";
    if (m === 2 && nth(3, 1)) return "Presidents Day";
    if (m === 5 && nth(2, 0)) return "Mother's Day";
    if (m === 5 && last(1)) return "Memorial Day";
    if (m === 6 && nth(3, 0)) return "Father's Day";
    if (m === 9 && nth(1, 1)) return "Labor Day";
    if (m === 11 && nth(4, 4)) return "Thanksgiving";
    return "";
  }

  /* ---------- router ---------- */
  var VIEWS = ["home", "terms", "privacy", "optout", "login", "book"];
  function show(view) {
    VIEWS.forEach(function (v) { var el = $('[data-view="' + v + '"]'); if (el) el.hidden = v !== view; });
    $$(".top-nav a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-nav") === view); });
    window.scrollTo(0, 0);
  }
  function route() {
    var h = (location.hash || "#home").slice(1);
    if (h === "book") { enterBook(); return; }
    show(VIEWS.indexOf(h) >= 0 ? h : "home");
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("[data-nav]") : null;
    if (a) { e.preventDefault(); location.hash = a.getAttribute("data-nav"); }
  });

  /* ---------- public front ---------- */
  var AVAIL = {
    accepting: ["Now accepting new referrals", "If someone Angela cleans for sent you, you are welcome to send a request below. Angela reviews every request personally and will confirm a time that fits — with travel and breathing room built in between homes."],
    limited: ["Limited spots", "Angela has a spot or two some weeks. Send a request and she will let you know personally whether she can fit you in."],
    full: ["Fully booked — waitlist only", "Angela is fully booked right now. You can still send a request to join the waitlist, and she will reach out herself if a spot opens."]
  };
  function renderPublic() {
    return DB.getPublicSettings().then(function (st) {
      var a = AVAIL[st.availability] || AVAIL.accepting;
      $("#availability-title").textContent = a[0];
      $("#availability-body").textContent = a[1];
      if (st.aboutHeading) $("#about-heading").textContent = st.aboutHeading;
      if (st.aboutBody) $("#about-body").textContent = st.aboutBody;
      var note = $("#site-note");
      if (st.siteNote) { note.textContent = st.siteNote; note.hidden = false; } else note.hidden = true;
    }).catch(function () { /* front still renders with defaults */ });
  }

  $("#req-clean-type").addEventListener("change", function (e) {
    var move = e.target.value === "move";
    $("#move-screenout").hidden = !move;
    $("#req-submit").disabled = move;
  });
  $("#request-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = new FormData(e.target), out = $("#req-result");
    var req = { name: f.get("name"), phone: f.get("phone"), email: f.get("email") || "",
      referredBy: f.get("referredBy"), cleanType: f.get("cleanType"), frequency: f.get("frequency"),
      preferredDays: f.get("preferredDays") || "", homeDetails: f.get("homeDetails") || "" };
    DB.submitRequest(req).then(function () {
      out.textContent = "Thank you — your request is with Angela. She reviews every request herself and will reach out from her own phone (307-214-2440) if she can fit you in. Nothing is booked until she confirms with you personally.";
      e.target.reset(); $("#move-screenout").hidden = true; $("#req-submit").disabled = false;
    }).catch(function (err) { out.textContent = "That didn't go through — please call Angela at 307-214-2440. (" + err.message + ")"; });
  });

  $("#optout-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = new FormData(e.target);
    var action = (e.submitter && e.submitter.value) || "out";
    DB.recordOptOut(String(f.get("contact")).trim(), f.get("channel"), action === "out")
      .then(function () {
        $("#optout-result").textContent = action === "out"
          ? "Done — you are opted out. It takes effect immediately."
          : "Done — you are opted back in.";
      })
      .catch(function (err) { $("#optout-result").textContent = "That didn't save — please tell Angela directly. (" + err.message + ")"; });
  });

  /* ---------- login ---------- */
  function enterBook() {
    if (DB.mode === "supabase" && !DB.isSignedIn()) { show("login"); $("#login-supabase").hidden = false; $("#login-local").hidden = true; return; }
    if (DB.mode === "local" && DB.localCodeIsSet() && !DB.localUnlocked()) {
      show("login"); $("#login-supabase").hidden = true; $("#login-local").hidden = false;
      $("#local-code-label").firstChild.textContent = "Your passcode";
      return;
    }
    openBook();
  }
  $("#magic-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = new FormData(e.target).get("email");
    DB.sendMagicLink(email).then(function () {
      $("#magic-result").textContent = "Check your email — your sign-in link is on its way. Tap it on this device and your book opens.";
    }).catch(function (err) { $("#magic-result").textContent = err.message; });
  });
  $("#local-code-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = new FormData(e.target).get("code");
    if (!DB.localCodeIsSet()) { openBook(); return; }
    DB.tryLocalCode(code).then(function (ok) {
      if (ok) openBook(); else $("#local-code-result").textContent = "That passcode didn't match — try again.";
    });
  });
  $("#lock-btn").addEventListener("click", function () {
    if (DB.mode === "supabase") DB.signOut();
    DB.lockLocal();
    location.hash = "home";
  });

  /* ---------- book shell ---------- */
  var state = { tab: "home", monthCursor: null, selectedDay: todayKey(), padCursor: null,
                jobs: [], clients: [], requests: [], drafts: [], settings: null, editingJob: null,
                editingClient: null, editingDraft: null };
  state.monthCursor = (function () { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
  state.padCursor = (function () { var d = new Date(); return addDays(d, -d.getDay()); })();

  function openBook() {
    show("book");
    $("#book-mode").textContent = DB.mode === "local" ? "Local test mode" : "Live";
    $("#mode-footer").textContent = DB.mode === "local"
      ? "TEST MODE — this copy keeps its data in this browser only. Do not share this test link publicly; the live Supabase version is the public-safe one."
      : "";
    $("#local-code-card").hidden = DB.mode !== "local";
    refreshBook();
  }
  function refreshBook() {
    return Promise.all([DB.listJobs(), DB.listClients(), DB.listRequests(), DB.listDrafts(), DB.getSettings()])
      .then(function (r) {
        state.jobs = r[0]; state.clients = r[1]; state.requests = r[2]; state.drafts = r[3]; state.settings = r[4];
        renderTab();
      })
      .catch(function (err) { alert("Your book didn't load: " + err.message); });
  }
  $$("#book-tabs button").forEach(function (b) {
    b.addEventListener("click", function () { state.tab = b.getAttribute("data-tab"); renderTab(); });
  });
  function renderTab() {
    $$("#book-tabs button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-tab") === state.tab); });
    $$("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== state.tab; });
    var pending = state.requests.filter(function (r) { return r.status === "pending"; }).length;
    var badge = $("#req-badge"); badge.hidden = !pending; badge.textContent = pending || "";
    ({ home: renderHome, month: renderMonth, pad: renderPad, brief: renderBrief,
       requests: renderRequests, clients: renderClients, drafts: renderDrafts,
       settings: renderSettings })[state.tab]();
  }
  function jobsOn(k) { return state.jobs.filter(function (j) { return j.date === k; }); }

  /* ---------- home panel ---------- */
  function renderHome() {
    var s = state.settings || {};
    var thisMonth = todayKey().slice(0, 7);
    var rows = [
      ["Month book — write and edit your jobs", state.jobs.some(function (j) { return j.date.indexOf(thisMonth) === 0; }) ? state.jobs.filter(function (j) { return j.date.indexOf(thisMonth) === 0; }).length + " jobs this month" : "Nothing written this month yet", "month"],
      ["Client book", state.clients.length + (state.clients.length === 1 ? " client" : " clients"), "clients"],
      ["Requests waiting", state.requests.filter(function (r) { return r.status === "pending"; }).length + " waiting", "requests"],
      ["Availability switch", ({ accepting: "Accepting referrals", limited: "Limited spots", full: "Fully booked" })[s.availability] || s.availability || "", "settings"],
      ["Edit my website words", s.aboutHeading ? "Set" : "Not set yet", "settings"]
    ];
    $("#home-checklist").innerHTML = rows.map(function (r) {
      return '<li data-goto="' + r[2] + '">' + esc(r[0]) + '<span class="state">' + esc(r[1]) + "</span></li>";
    }).join("");
    $$("#home-checklist li").forEach(function (li) {
      li.addEventListener("click", function () { state.tab = li.getAttribute("data-goto"); renderTab(); });
    });
    var t = jobsOn(todayKey());
    $("#home-today").innerHTML = t.length ? t.map(jobLine).join("") : '<p class="empty">Nothing in the book for today.</p>';
    bindJobLines($("#home-today"));
  }
  function jobLine(j) {
    return '<div class="job-line" data-job="' + j.id + '"><span>' + esc(time12(j.startTime)) + '</span>' +
      '<span class="hand">' + esc(j.clientName) + '</span><span class="meta">' + esc(j.cleanType || "regular") +
      (j.address ? " · " + esc(j.address) : "") + '</span>' +
      '<button class="btn small check" data-check="' + j.id + '">' + (j.status === "done" ? "✓ Done" : "Mark done") + "</button></div>";
  }
  function bindJobLines(root) {
    $$(".job-line", root).forEach(function (el) {
      el.addEventListener("click", function (e) {
        var id = +el.getAttribute("data-job");
        var job = state.jobs.find(function (j) { return j.id === id; });
        if (e.target.hasAttribute("data-check")) {
          e.stopPropagation();
          DB.saveJob({ id: id, status: job.status === "done" ? "scheduled" : "done" }).then(refreshBook);
          return;
        }
        state.tab = "month"; state.selectedDay = job.date;
        state.monthCursor = new Date(parse(job.date).getFullYear(), parse(job.date).getMonth(), 1);
        renderTab(); openJobForm(job);
      });
    });
  }

  /* ---------- month spread ---------- */
  function monthWeeks(cursor) {
    var first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    var start = addDays(first, -first.getDay());
    var weeks = [], d = start;
    for (var w = 0; w < 6; w++) { var row = []; for (var i = 0; i < 7; i++) { row.push(new Date(d)); d = addDays(d, 1); } weeks.push(row); }
    return weeks;
  }
  function cellHTML(d, cursor) {
    var k = key(d), inMonth = d.getMonth() === cursor.getMonth(), hol = holiday(k);
    var jobs = jobsOn(k).map(function (j) {
      return '<span class="job' + (j.status === "done" ? " done" : "") + '">' + esc(time12(j.startTime)) + " " + esc(j.clientName) + "</span>";
    }).join("");
    return '<div class="cell' + (inMonth ? "" : " out") + (k === todayKey() ? " today" : "") +
      (k === state.selectedDay ? " selected" : "") + '" data-day="' + k + '">' +
      '<span class="dnum">' + d.getDate() + "</span>" + (hol ? '<span class="holiday">' + esc(hol) + "</span>" : "") + jobs + "</div>";
  }
  function renderMonth() {
    var c = state.monthCursor;
    $("#month-title").textContent = c.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    $("#names-left").innerHTML = ["Sunday", "Monday", "Tuesday", "Wednesday"].map(function (n) { return "<span>" + n + "</span>"; }).join("");
    $("#names-right").innerHTML = ["Thursday", "Friday", "Saturday"].map(function (n) { return "<span>" + n + "</span>"; }).join("");
    var weeks = monthWeeks(c);
    $("#cells-left").innerHTML = weeks.map(function (w) {
      return '<div class="week-row">' + w.slice(0, 4).map(function (d) { return cellHTML(d, c); }).join("") + "</div>"; }).join("");
    $("#cells-right").innerHTML = weeks.map(function (w) {
      return '<div class="week-row">' + w.slice(4).map(function (d) { return cellHTML(d, c); }).join("") + "</div>"; }).join("");
    $$("#month-spread .cell").forEach(function (el) {
      el.addEventListener("click", function () {
        state.selectedDay = el.getAttribute("data-day"); renderMonth(); renderDayEditor();
      });
    });
    renderDayEditor();
  }
  $("#month-prev").addEventListener("click", function () { state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1); renderMonth(); });
  $("#month-next").addEventListener("click", function () { state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1); renderMonth(); });
  (function swipe() {
    var el = $("#month-spread"), x = null, y = null;
    el.addEventListener("touchstart", function (e) { x = e.touches[0].clientX; y = e.touches[0].clientY; }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (x === null) return;
      var dx = e.changedTouches[0].clientX - x, dy = e.changedTouches[0].clientY - y;
      if (Math.abs(dx) >= 64 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + (dx < 0 ? 1 : -1), 1);
        renderMonth();
      }
      x = null;
    }, { passive: true });
  })();

  /* ---------- day editor + job form ---------- */
  function renderDayEditor() {
    var k = state.selectedDay;
    $("#day-editor-title").textContent = pretty(k);
    var jobs = jobsOn(k);
    $("#day-jobs").innerHTML = jobs.length ? jobs.map(jobLine).join("") : '<p class="empty">Nothing written in for this day yet.</p>';
    bindJobLines($("#day-jobs"));
    $("#job-client-select").innerHTML = '<option value="">— just a name —</option>' + state.clients.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("");
    DB.listPadPhotos(k).then(function (photos) {
      $("#pad-photo-list").innerHTML = photos.map(function (p) {
        return '<img class="thumb" src="' + p.dataUrl + '" data-photo="' + p.id + '" alt="Pad page photo">';
      }).join("");
      $$("#pad-photo-list .thumb").forEach(function (img) {
        img.addEventListener("click", function () {
          if (confirm("Remove this pad photo?")) DB.deletePadPhoto(+img.getAttribute("data-photo")).then(renderDayEditor);
        });
      });
    }).catch(function () {});
  }
  $("#add-job-btn").addEventListener("click", function () { openJobForm(null); });
  function openJobForm(job) {
    state.editingJob = job;
    var f = $("#job-form"); f.hidden = false;
    $("#job-form-title").textContent = job ? "Edit this job" : "Write in a job";
    $("#job-delete").hidden = !job;
    f.reset();
    if (job) {
      ["clientName", "date", "startTime", "durationMins", "cleanType", "address", "tasks", "packList", "recurring", "status", "notes"]
        .forEach(function (n) { if (f.elements[n]) f.elements[n].value = job[n] == null ? "" : job[n]; });
      f.elements.clientId.value = job.clientId || "";
    } else { f.elements.date.value = state.selectedDay; f.elements.startTime.value = "09:00"; f.elements.durationMins.value = 120; }
    f.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  $("#job-cancel").addEventListener("click", function () { $("#job-form").hidden = true; });
  $("#job-delete").addEventListener("click", function () {
    if (state.editingJob && confirm("Erase this job from the book?"))
      DB.deleteJob(state.editingJob.id).then(function () { $("#job-form").hidden = true; refreshBook(); });
  });
  $("#job-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = new FormData(e.target);
    var job = { clientName: f.get("clientName"), clientId: f.get("clientId") ? +f.get("clientId") : null,
      date: f.get("date"), startTime: f.get("startTime"), durationMins: +f.get("durationMins") || 120,
      cleanType: f.get("cleanType"), address: f.get("address") || "", tasks: f.get("tasks") || "",
      packList: f.get("packList") || "", recurring: f.get("recurring"), status: f.get("status"),
      notes: f.get("notes") || "", sortOrder: state.editingJob ? state.editingJob.sortOrder : jobsOn(f.get("date")).length };
    if (state.editingJob) job.id = state.editingJob.id;
    state.selectedDay = job.date;
    DB.saveJob(job).then(function () { $("#job-form").hidden = true; refreshBook(); });
  });
  $("#pad-photo-input").addEventListener("change", function (e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1200, scale = Math.min(1, max / Math.max(img.width, img.height));
        var cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        DB.addPadPhoto(state.selectedDay, cv.toDataURL("image/jpeg", 0.82)).then(renderDayEditor)
          .catch(function (err) { alert("That photo didn't save: " + err.message); });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  });

  /* ---------- week pad ---------- */
  function renderPad() {
    var start = state.padCursor, end = addDays(start, 6);
    $("#pad-title").textContent = "Week of " + pretty(key(start), { month: "long", day: "numeric" }) + " – " + pretty(key(end), { month: "long", day: "numeric", year: "numeric" });
    var html = "";
    for (var i = 0; i < 7; i++) {
      var d = addDays(start, i), k = key(d), jobs = jobsOn(k);
      html += '<div class="pad-day"><h3>' + pretty(k, { weekday: "long", month: "short", day: "numeric" }) +
        (k === todayKey() ? " · today" : "") + "</h3>" +
        (jobs.length ? jobs.map(function (j) {
          return '<div class="job-line" data-job="' + j.id + '"><span>' + esc(time12(j.startTime)) + '</span><span class="hand">' +
            esc(j.clientName) + (j.tasks ? " — " + esc(j.tasks) : "") + '</span><span class="meta">' + esc(j.address || "") + "</span></div>";
        }).join("") : '<p class="dim">— nothing written —</p>') + "</div>";
    }
    $("#pad-days").innerHTML = html;
    $$("#pad-days .job-line").forEach(function (el) {
      el.addEventListener("click", function () {
        var job = state.jobs.find(function (j) { return j.id === +el.getAttribute("data-job"); });
        state.tab = "month"; state.selectedDay = job.date;
        state.monthCursor = new Date(parse(job.date).getFullYear(), parse(job.date).getMonth(), 1);
        renderTab(); openJobForm(job);
      });
    });
  }
  $("#pad-prev").addEventListener("click", function () { state.padCursor = addDays(state.padCursor, -7); renderPad(); });
  $("#pad-next").addEventListener("click", function () { state.padCursor = addDays(state.padCursor, 7); renderPad(); });

  /* ---------- night-before brief ---------- */
  function tomorrowKey() { return key(addDays(new Date(), 1)); }
  function renderBrief() {
    var tk = tomorrowKey(), jobs = jobsOn(tk);
    $("#brief-title").textContent = "Tomorrow — " + pretty(tk);
    $("#brief-jobs").innerHTML = jobs.length ? jobs.map(function (j, i) {
      return '<div class="item"><h4>' + (i + 1) + ". " + esc(time12(j.startTime)) + " — " + esc(j.clientName) + "</h4>" +
        "<p>" + esc(j.cleanType || "regular") + " clean" + (j.address ? " · " + esc(j.address) : "") + "</p>" +
        (j.tasks ? "<p>Tasks: " + esc(j.tasks) + "</p>" : "") +
        (j.packList ? "<p>Pack: " + esc(j.packList) + "</p>" : "") +
        (j.notes ? "<p>" + esc(j.notes) + "</p>" : "") + "</div>";
    }).join("") : '<p class="empty">No homes tomorrow — a clear day.</p>';
    var drafts = state.drafts.filter(function (d) { return d.forDate === tk; });
    $("#brief-drafts").innerHTML = drafts.length ? drafts.map(function (d) {
      return '<div class="item"><p>' + esc(d.body) + '</p><p class="dim small">To: ' + esc(d.clientName || "") + " · " + esc(d.status) + "</p></div>";
    }).join("") : '<p class="empty">No drafts written for tomorrow yet — write them in the Drafts tab.</p>';
  }
  $("#brief-approve-all").addEventListener("click", function () {
    DB.approveAllDraftsForDate(tomorrowKey()).then(refreshBook);
  });

  /* ---------- requests ---------- */
  function renderRequests() {
    var list = state.requests;
    $("#request-list").innerHTML = list.length ? list.map(function (r) {
      return '<div class="item"><h4>' + esc(r.name) + ' <span class="dim small">(' + esc(r.status) + ")</span></h4>" +
        "<p>" + esc(r.cleanType || "") + (r.frequency ? " · " + esc(r.frequency) : "") +
        (r.preferredDays ? " · prefers " + esc(r.preferredDays) : "") + "</p>" +
        "<p>Referred by: " + esc(r.referredBy || "—") + (r.phone ? " · " + esc(r.phone) : "") + (r.email ? " · " + esc(r.email) : "") + "</p>" +
        (r.homeDetails ? "<p>" + esc(r.homeDetails) + "</p>" : "") +
        (r.status === "pending" ? '<div class="actions"><button class="btn primary" data-approve="' + r.id + '">Approve — add to my client book</button>' +
          '<button class="btn" data-decline="' + r.id + '">Decline</button></div>' : "") + "</div>";
    }).join("") : '<p class="empty">No requests right now. When a referred visitor sends one from the front page, it lands here for you.</p>';
    $$("#request-list [data-approve]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = state.requests.find(function (x) { return x.id === +b.getAttribute("data-approve"); });
        DB.decideRequest(r, true).then(refreshBook);
      });
    });
    $$("#request-list [data-decline]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = state.requests.find(function (x) { return x.id === +b.getAttribute("data-decline"); });
        DB.decideRequest(r, false).then(refreshBook);
      });
    });
  }

  /* ---------- clients ---------- */
  function renderClients() {
    $("#client-list").innerHTML = state.clients.length ? state.clients.map(function (c) {
      return '<div class="item"><h4>' + esc(c.name) + "</h4><p>" +
        [c.address, c.phone, c.email].filter(Boolean).map(esc).join(" · ") + "</p>" +
        (c.notes ? "<p>" + esc(c.notes) + "</p>" : "") +
        '<div class="actions"><button class="btn small" data-edit-client="' + c.id + '">✎ Edit</button></div></div>';
    }).join("") : '<p class="empty">No clients in the book yet.</p>';
    $$("#client-list [data-edit-client]").forEach(function (b) {
      b.addEventListener("click", function () {
        openClientForm(state.clients.find(function (c) { return c.id === +b.getAttribute("data-edit-client"); }));
      });
    });
  }
  $("#add-client-btn").addEventListener("click", function () { openClientForm(null); });
  function openClientForm(c) {
    state.editingClient = c;
    var f = $("#client-form"); f.hidden = false; f.reset();
    $("#client-form-title").textContent = c ? "Edit client" : "Add a client";
    $("#client-delete").hidden = !c;
    if (c) ["name", "phone", "email", "address", "referredBy", "entryNotes", "pets", "preferences", "notes"]
      .forEach(function (n) { if (f.elements[n]) f.elements[n].value = c[n] || ""; });
  }
  $("#client-cancel").addEventListener("click", function () { $("#client-form").hidden = true; });
  $("#client-delete").addEventListener("click", function () {
    if (state.editingClient && confirm("Remove this client from the book?"))
      DB.deleteClient(state.editingClient.id).then(function () { $("#client-form").hidden = true; refreshBook(); });
  });
  $("#client-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = new FormData(e.target), c = {};
    ["name", "phone", "email", "address", "referredBy", "entryNotes", "pets", "preferences", "notes"]
      .forEach(function (n) { c[n] = f.get(n) || ""; });
    if (state.editingClient) c.id = state.editingClient.id;
    DB.saveClient(c).then(function () { $("#client-form").hidden = true; refreshBook(); });
  });

  /* ---------- drafts (hand-written only — nothing is generated or sent) ---------- */
  function renderDrafts() {
    $("#draft-list").innerHTML = state.drafts.length ? state.drafts.map(function (d) {
      return '<div class="item"><p class="dim small">' + esc(pretty(d.forDate, { weekday: "short", month: "short", day: "numeric" })) +
        " · " + esc(d.kind || "reminder") + " · " + esc(d.status) + "</p><p>" + esc(d.body) + "</p>" +
        "<p>To: " + esc(d.clientName || "") + (d.clientPhone ? " · " + esc(d.clientPhone) : "") + "</p>" +
        '<div class="actions"><button class="btn small" data-copy="' + d.id + '">Copy words</button>' +
        '<button class="btn small" data-dstatus="' + d.id + ':approved">Approve</button>' +
        '<button class="btn small" data-dstatus="' + d.id + ':sent">Mark sent (by me)</button>' +
        '<button class="btn small" data-dstatus="' + d.id + ':skipped">Skip</button>' +
        '<button class="btn small" data-edit-draft="' + d.id + '">✎ Edit</button></div></div>';
    }).join("") : '<p class="empty">No drafts yet. Write your first one below.</p>';
    $$("#draft-list [data-copy]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = state.drafts.find(function (x) { return x.id === +b.getAttribute("data-copy"); });
        if (navigator.clipboard) navigator.clipboard.writeText(d.body);
        b.textContent = "Copied — paste it into your text to " + (d.clientName || "them");
      });
    });
    $$("#draft-list [data-dstatus]").forEach(function (b) {
      b.addEventListener("click", function () {
        var parts = b.getAttribute("data-dstatus").split(":");
        DB.setDraftStatus(+parts[0], parts[1]).then(refreshBook);
      });
    });
    $$("#draft-list [data-edit-draft]").forEach(function (b) {
      b.addEventListener("click", function () {
        openDraftForm(state.drafts.find(function (x) { return x.id === +b.getAttribute("data-edit-draft"); }));
      });
    });
  }
  $("#add-draft-btn").addEventListener("click", function () { openDraftForm(null); });
  function openDraftForm(d) {
    state.editingDraft = d;
    var f = $("#draft-form"); f.hidden = false; f.reset();
    $("#draft-form-title").textContent = d ? "Edit draft" : "Write a draft";
    $("#draft-delete").hidden = !d;
    if (d) ["forDate", "clientName", "clientPhone", "kind", "body"].forEach(function (n) { f.elements[n].value = d[n] || ""; });
    else f.elements.forDate.value = tomorrowKey();
  }
  $("#draft-cancel").addEventListener("click", function () { $("#draft-form").hidden = true; });
  $("#draft-delete").addEventListener("click", function () {
    if (state.editingDraft) DB.deleteDraft(state.editingDraft.id).then(function () { $("#draft-form").hidden = true; refreshBook(); });
  });
  $("#draft-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = new FormData(e.target);
    var d = { forDate: f.get("forDate"), clientName: f.get("clientName") || "", clientPhone: f.get("clientPhone") || "",
              kind: f.get("kind"), body: f.get("body"), jobId: state.editingDraft ? state.editingDraft.jobId : null,
              status: state.editingDraft ? state.editingDraft.status : "draft" };
    if (state.editingDraft) d.id = state.editingDraft.id;
    DB.saveDraft(d).then(function () { $("#draft-form").hidden = true; refreshBook(); });
  });

  /* ---------- settings ---------- */
  function renderSettings() {
    var s = state.settings || {};
    $$('#availability-form input[name="availability"]').forEach(function (r) { r.checked = r.value === s.availability; });
    var wf = $("#website-form");
    wf.elements.aboutHeading.value = s.aboutHeading || "";
    wf.elements.aboutBody.value = s.aboutBody || "";
    wf.elements.siteNote.value = s.siteNote || "";
  }
  $("#availability-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = new FormData(e.target).get("availability");
    DB.updateSettings({ availability: v }).then(function () {
      $("#availability-result").textContent = "Saved — the front page now shows: " + (AVAIL[v] || [""])[0];
      renderPublic(); refreshBook();
    });
  });
  $("#website-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = new FormData(e.target);
    DB.updateSettings({ aboutHeading: f.get("aboutHeading"), aboutBody: f.get("aboutBody"), siteNote: f.get("siteNote") })
      .then(function () { $("#website-result").textContent = "Saved — your front page shows the new words now."; renderPublic(); refreshBook(); });
  });
  $("#set-code-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = new FormData(e.target).get("code");
    if (!code) return;
    DB.setLocalCode(code).then(function () { $("#set-code-result").textContent = "Passcode set on this device."; });
  });

  /* ---------- boot ---------- */
  $("#mode-footer").textContent = DB.mode === "local"
    ? "TEST MODE — this copy keeps its data in this browser only. Do not share this test link publicly; the live Supabase version is the public-safe one." : "";
  renderPublic();
  route();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
