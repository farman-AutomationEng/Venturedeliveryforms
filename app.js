// ============================================================
// VENTURE TRAILERS — app.js v6.0
// ARCHITECTURE: Admin creates forms → Driver fills & signs
// Driver sees pending forms list, opens, fills notes/sigs, submits
// ============================================================

var ADDIN_ID = "azXOKPvAnSnyIdUK2xZutWA";
var LICENSE_SERVER_URL = "https://script.google.com/a/macros/dynastync.com/s/AKfycbx2fyJ1auGqjYlrwGuegVdXvgxWCKLgZ2odY2I_CoT0gZGMc-fqmd7RtziWG7xlbewA/exec";
var _licenseValid = false;
var _api = null;
var _initialized = false;
var _currentFormId = null;
var _currentForm = null;
var _pendingForms = [];

var PARTS = ["Tail Light-R","Tail Light-L","Tail Light-Lens","Marker Light","Tag Bracket",
  "Tongue Jack","Winch Stand","Rollers","Bunks","Fenders","Tires","Actuator","Frame Rails","Tongue"];
var SS = {};
var DRV = {name:"",userId:"",email:"",groupId:"",groupName:"",groups:[],vehicleId:"",vehicleName:"",plate:""};

// ── Entry Point ──────────────────────────────────────────────
geotab.addin.ventureDelivery = function() {
  return {

    initialize: function(api, state, callback) {
      _api = api;
      // ✅ Call callback immediately — don't block UI on license check
      // License check happens in background during focus()
      callback();
    },

    focus: function(api, state) {
      _api = api;
      var app = document.getElementById("vt-app");
      if (app) app.style.display = "block";

      if (!_initialized) {
        _initialized = true;
        initUI();
      }

      // Show UI immediately, check license in background
      fetchDriver(api, function() {
        _currentFormId = null;
        _currentForm = null;
        showPendingScreen();
        fetchPendingForms();
      });

      // License check in background — don't block UI
      if (!_licenseValid) {
        checkLicense(api, function(result) {
          _licenseValid = result.allowed;
          if (!result.allowed) showLicenseError(result.reason || "Not licensed.");
        });
      }
    },

    blur: function(api, state) {
      var app = document.getElementById("vt-app");
      if (app) app.style.display = "none";
      _currentFormId = null;
      _currentForm = null;
    }
  };
};

// ── License check ─────────────────────────────────────────────
function checkLicense(api, callback) {
  api.getSession(function(sess) {
    if (!sess || !sess.database) {
      callback({allowed: true, warning: "No session — dev mode"});
      return;
    }
    var database = sess.database;
    api.call("Get", {typeName: "Device", search: {activeFrom: "1986-01-01T00:00:00Z"}}, function(devices) {
      var totalCount = (devices || []).length;
      api.call("Get", {typeName: "DeviceStatusInfo"}, function(dsi) {
        var dsiList = dsi || [];
        var onlineCount = 0;
        dsiList.forEach(function(item) {
          if (!item.device || !item.device.id) return;
          if (item.isDeviceCommunicating === true) onlineCount++;
        });
        sendLicenseRequest(database, onlineCount, totalCount, callback);
      }, function() { sendLicenseRequest(database, 0, totalCount, callback); });
    }, function() { sendLicenseRequest(database, 0, 0, callback); });
  });
}

function sendLicenseRequest(database, onlineDevices, totalDevices, callback) {
  var url = LICENSE_SERVER_URL
    + "?action=verify"
    + "&database=" + encodeURIComponent(database)
    + "&addinId=" + encodeURIComponent(ADDIN_ID)
    + "&deviceCount=" + (onlineDevices || 0)
    + "&totalDevices=" + (totalDevices || 0);
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.timeout = 10000;
  xhr.onload = function() {
    if (xhr.status === 200) {
      try { callback(JSON.parse(xhr.responseText)); }
      catch(e) { callback({allowed: true}); }
    } else { callback({allowed: true}); }
  };
  xhr.onerror = xhr.ontimeout = function() { callback({allowed: true}); };
  xhr.send();
}

function showLicenseError(reason) {
  var app = document.getElementById("vt-app");
  if (app) app.style.display = "block";
  var lk = document.getElementById("lic-screen");
  if (!lk) {
    lk = document.createElement("div");
    lk.id = "lic-screen";
    lk.style.cssText = "padding:40px 24px;text-align:center;";
    lk.innerHTML =
      '<div style="font-size:48px;margin-bottom:16px">🔒</div>'
      + '<div style="font-size:18px;font-weight:700;color:#00263E;margin-bottom:10px">Access Restricted</div>'
      + '<div style="font-size:13px;color:#64748b;margin-bottom:24px;max-width:320px;margin-left:auto;margin-right:auto">' + reason + '</div>'
      + '<div style="font-size:13px;color:#374151">Contact <strong>Dynasty Communications</strong><br>'
      + '<a href="mailto:support@dynastync.com" style="color:#0078D4">support@dynastync.com</a></div>';
    var appDiv = document.getElementById("vt-app");
    if (appDiv) appDiv.insertBefore(lk, appDiv.firstChild);
  } else {
    lk.style.display = "block";
  }
  var ps = document.getElementById("pending-screen"); if (ps) ps.style.display = "none";
  var fa = document.getElementById("form-area"); if (fa) fa.style.display = "none";
}

// ── Driver info ───────────────────────────────────────────────
function fetchDriver(api, callback) {
  api.getSession(function(sess) {
    if (!sess || !sess.userName) { callback(); return; }
    fetchUserByName(api, sess.userName, callback);
  });
}

function fetchUserByName(api, userName, callback) {
  api.call("Get", {typeName:"User", search:{name:userName}}, function(us) {
    if (!us || !us.length) { callback(); return; }
    var u = null;
    var lower = userName.toLowerCase();
    for (var i = 0; i < us.length; i++) {
      if ((us[i].name||"").toLowerCase() === lower) { u = us[i]; break; }
    }
    if (!u) u = us[0];
    var fn = buildName((u.firstName||"").trim(), (u.lastName||"").trim(), u.name||userName);
    var info = {
      name: fn, userId: u.id||"", email: u.name||userName,
      groups: (u.companyGroups||[]).map(function(g){return g.id;}),
      groupId: (u.companyGroups&&u.companyGroups[0]) ? u.companyGroups[0].id : "",
      groupName: "", vehicleId: "", vehicleName: "", plate: ""
    };
    // Get group name
    if (info.groupId) {
      api.call("Get", {typeName:"Group", search:{id:info.groupId}}, function(gs) {
        info.groupName = (gs&&gs[0]) ? (gs[0].name||"") : "";
        fetchVehicle(api, info, callback);
      }, function() { fetchVehicle(api, info, callback); });
    } else {
      fetchVehicle(api, info, callback);
    }
  }, function(e) { console.error("User fetch error:", e); callback(); });
}

function fetchVehicle(api, info, callback) {
  api.call("Get", {typeName:"DeviceStatusInfo", search:{driverSearch:{id:info.userId}}},
    function(dsi) {
      if (dsi && dsi.length > 0 && dsi[0].device && dsi[0].device.id) {
        info.vehicleId   = dsi[0].device.id   || "";
        info.vehicleName = dsi[0].device.name || "";
      }
      setDrv(info);
      callback();
    },
    function() { setDrv(info); callback(); }
  );
}

function setDrv(info) {
  DRV.name=info.name||""; DRV.userId=info.userId||""; DRV.email=info.email||"";
  DRV.groupId=info.groupId||""; DRV.groupName=info.groupName||"";
  DRV.groups=info.groups||[]; DRV.vehicleId=info.vehicleId||"";
  DRV.vehicleName=info.vehicleName||""; DRV.plate=info.plate||"";

  // Update pending screen driver label
  var lbl = document.getElementById("pl-driver-label");
  if (lbl && DRV.name) lbl.textContent = DRV.name + (DRV.groupName ? " • " + DRV.groupName : "");

  // Show driver bar
  if (DRV.name) {
    var db = document.getElementById("dbar");
    if (db) db.style.display = "flex";
    var init = DRV.name.split(" ").map(function(w){return w[0]||"";}).join("").toUpperCase().slice(0,2)||"D";
    var el;
    if ((el=document.getElementById("dav"))) el.textContent = init;
    if ((el=document.getElementById("dnm"))) el.textContent = DRV.name;
    if ((el=document.getElementById("dmt"))) el.textContent = DRV.email + (DRV.vehicleName?" • "+DRV.vehicleName:"");
    if ((el=document.getElementById("dgrp"))) el.textContent = "📍 "+(DRV.groupName||"No Group");
  }
}

function buildName(rawFirst, rawLast, fallbackEmail) {
  var fn;
  if (rawFirst || rawLast) {
    fn = (rawFirst+" "+rawLast).trim();
  }
  if (!fn) fn = (fallbackEmail||"").split("@")[0].replace(/[._]/g," ").replace(/\b\w/g,function(c){return c.toUpperCase();}).trim() || fallbackEmail || "";
  return fn;
}

// ── Pending Forms ─────────────────────────────────────────────
function fetchPendingForms() {
  showPendingLoading(true);
  var listEl = document.getElementById("pl-list");
  var emptyEl = document.getElementById("pl-empty");
  if (listEl) listEl.innerHTML = "";
  if (emptyEl) emptyEl.style.display = "none";

  if (!_api) { showPendingLoading(false); renderPendingList([]); return; }

  _api.call("Get", {typeName:"AddInData", search:{addInId:ADDIN_ID}},
    function(records) {
      showPendingLoading(false);
      var pending = (records || []).filter(function(r) {
        try {
          var d = typeof r.details === "string" ? JSON.parse(r.details) : r.details;
          if (!d || d.status !== "Pending") return false;

          // Match by assigned driver ID
          if (d.assignedDriverId && DRV.userId && d.assignedDriverId === DRV.userId) return true;

          // Match by assigned group ID
          if (d.assignedGroupId && DRV.groups && DRV.groups.length &&
              DRV.groups.indexOf(d.assignedGroupId) >= 0) return true;

          // Dev/test mode — no driver loaded — show all pending
          if (!DRV.userId && !d.assignedDriverId) return true;

          return false;
        } catch(e) { return false; }
      });

      _pendingForms = pending.map(function(r) {
        var d = typeof r.details === "string" ? JSON.parse(r.details) : r.details;
        d.id = r.id;
        return {id: r.id, details: d};
      });

      renderPendingList(_pendingForms);
    },
    function(err) {
      showPendingLoading(false);
      renderPendingList([]);
      console.error("Fetch pending forms error:", err);
    }
  );
}

function renderPendingList(forms) {
  var listEl = document.getElementById("pl-list");
  var emptyEl = document.getElementById("pl-empty");
  if (!listEl) return;

  if (!forms.length) {
    listEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  var typeLabels = {delivery_sheet:"Delivery", invoice:"Invoice", loose_parts:"Loose Parts"};
  var typeBgs    = {delivery_sheet:"#DBEAFE",  invoice:"#F1F5F9",  loose_parts:"#FEF9C3"};
  var typeColors = {delivery_sheet:"#1d4ed8",  invoice:"#374151",  loose_parts:"#CA8A04"};

  var html = "";
  forms.forEach(function(f) {
    var d = f.details;
    var tl = typeLabels[d.formType] || d.formType || "Form";
    var tbg = typeBgs[d.formType] || "#F1F5F9";
    var tc = typeColors[d.formType] || "#374151";
    html += '<div class="pl-item">'
      + '<div class="pl-item-left">'
      + '<div class="pl-inv">Invoice #' + esc(d.invoiceNo||"—") + '</div>'
      + '<div class="pl-dealer">' + esc(d.dealer||d.billTo||"—") + '</div>'
      + '<div class="pl-meta">'
      + '<span style="background:' + tbg + ';color:' + tc + ';padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">' + tl + '</span>'
      + '<span>' + esc(d.date||"") + '</span>'
      + '</div>'
      + '</div>'
      + '<button class="btn bp pl-open-btn" onclick="openForm(\'' + f.id + '\')">Open</button>'
      + '</div>';
  });
  listEl.innerHTML = html;
}

function showPendingLoading(show) {
  var el = document.getElementById("pl-loading");
  if (el) el.style.display = show ? "block" : "none";
}

function backToPending() {
  _currentFormId = null;
  _currentForm = null;
  showPendingScreen();
  fetchPendingForms();
}

function showPendingScreen() {
  var ps = document.getElementById("pending-screen"); if (ps) ps.style.display = "block";
  var fa = document.getElementById("form-area"); if (fa) fa.style.display = "none";
  var bb = document.getElementById("form-back-bar"); if (bb) bb.style.display = "none";
}

function showFormView(title) {
  var ps = document.getElementById("pending-screen"); if (ps) ps.style.display = "none";
  var fa = document.getElementById("form-area"); if (fa) fa.style.display = "block";
  var bb = document.getElementById("form-back-bar"); if (bb) bb.style.display = "flex";
  var bt = document.getElementById("form-bar-title"); if (bt) bt.textContent = title || "";
  window.scrollTo(0, 0);
}

// ── Open a pending form ───────────────────────────────────────
function openForm(recordId) {
  var found = null;
  for (var i = 0; i < _pendingForms.length; i++) {
    if (_pendingForms[i].id === recordId) { found = _pendingForms[i]; break; }
  }
  if (!found) return;

  _currentFormId = recordId;
  _currentForm = found.details;

  // Hide success screen
  var succ = document.getElementById("succ"); if (succ) succ.style.display = "none";

  var ft = _currentForm.formType;

  // Show/hide correct submit button per form type
  var subbtn    = document.getElementById("subbtn");
  var subparts  = document.getElementById("btnSubParts");
  if (subbtn)   subbtn.style.display   = (ft === "delivery_sheet") ? "block" : "none";
  if (subparts) subparts.style.display = (ft === "loose_parts")    ? "block" : "none";

  if (ft === "delivery_sheet") {
    populateDelivery(_currentForm);
    swT(0);
    showFormView("Invoice #" + (_currentForm.invoiceNo||"—") + " — Delivery");
  } else if (ft === "invoice") {
    populateInvoice(_currentForm);
    swT(1);
    showFormView("Invoice #" + (_currentForm.invoiceNo||"—") + " — Invoice (View Only)");
  } else if (ft === "loose_parts") {
    populateParts(_currentForm);
    swT(2);
    showFormView("Invoice #" + (_currentForm.invoiceNo||"—") + " — Parts");
  }

  // Init signatures
  setTimeout(function() {
    clrS("sig-driver"); clrS("sig-consignee");
    clrS("sig-lpd"); clrS("sig-lpr");
    initSig("sig-driver"); initSig("sig-consignee");
    initSig("sig-lpd"); initSig("sig-lpr");
  }, 300);
}

// ── Form population ───────────────────────────────────────────
function sv(id, val) {
  var el = document.getElementById(id); if (!el) return;
  el.value = (val !== undefined && val !== null) ? String(val) : "";
}

function populateDelivery(d) {
  sv("ds-dt",  d.date);
  sv("ds-inv", d.invoiceNo);
  sv("ds-dlr", d.dealer);
  sv("ds-adr", d.dealerAddress || "");
  sv("ds-cty", "");
  sv("ds-cnt", d.dealerContact);
  sv("ds-ph",  d.dealerPhone);
  sv("ds-em",  d.dealerEmail);
  sv("ds-cod", d.codAmount || "0");
  sv("ds-cm",  ""); // driver fills — editable

  // ✅ Make all non-driver fields readonly
  ["ds-dt","ds-inv","ds-dlr","ds-adr","ds-cty","ds-cnt","ds-ph","ds-em","ds-cod"].forEach(function(id){
    var el=document.getElementById(id); if(el) el.readOnly=true;
  });
  // Payment radios — readonly display only
  var radios = document.querySelectorAll('input[name="paytype"]');
  for(var i=0;i<radios.length;i++) radios[i].disabled=true;
  // Booklets pills — disable interaction
  var py=document.getElementById("py"); if(py) py.style.pointerEvents="none";
  var pn=document.getElementById("pn"); if(pn) pn.style.pointerEvents="none";
  // Accepted checkbox — disable
  var ckac=document.getElementById("ck-ac"); if(ckac) ckac.disabled=true;

  // Payment type
  var radios = document.querySelectorAll('input[name="paytype"]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].checked = (radios[i].value === d.paymentType);
  }

  // Booklets (readonly display)
  var bk = d.booklets || "";
  var py = document.getElementById("py"); if (py) py.className = "pill" + (bk==="Y"?" gn":"");
  var pn = document.getElementById("pn"); if (pn) pn.className = "pill" + (bk==="N"?" rd":"");

  // Accepted
  var ckac = document.getElementById("ck-ac");
  if (ckac) ckac.checked = !!d.accepted;

  // Parts table: admin parts, driver fills dmg/short/notes
  var parts = (d.parts && d.parts.length)
    ? d.parts
    : PARTS.map(function(p){ return {part:p, model:""}; });
  buildPartsFromData(parts);
}

function populateInvoice(d) {
  sv("id",  d.date);
  sv("ia",  d.acctNo);
  sv("ino", d.invoiceNo);
  // All fields are readonly in HTML
  sv("ibt", d.billTo);
  sv("ist", d.shipTo);
  sv("ipo", d.po);
  sv("itr", d.terms);
  sv("iso", d.salesOrder);
  sv("ism", d.shippingMethod);
  sv("ish", d.shipping);

  var itot = document.getElementById("itot");
  if (itot) itot.textContent = d.grandTotal || "$0.00";

  // Line items readonly
  var itb = document.getElementById("itb");
  if (itb) {
    itb.innerHTML = "";
    (d.lineItems || []).forEach(function(li) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td><input type="text" value="' + esc(li.item||"") + '" readonly></td>'
        + '<td><input type="number" value="' + esc(li.qty||"1") + '" readonly style="width:60px"></td>'
        + '<td><input type="text" value="' + esc(li.description||"") + '" readonly></td>'
        + '<td><input type="number" value="' + esc(li.unitPrice||"") + '" readonly></td>'
        + '<td><input type="text" value="' + esc(li.total||"") + '" readonly style="font-weight:700"></td>';
      itb.appendChild(tr);
    });
  }
}

function populateParts(d) {
  sv("ls",  d.salesOrder);
  sv("li",  d.invoiceNo);
  sv("lpl", d.pl);
  sv("lt",  d.trk);
  sv("ld",  d.dealer);
  sv("ldt", d.date);
  sv("lc",  ""); // driver fills

  var ltb = document.getElementById("ltb");
  if (ltb) {
    ltb.innerHTML = "";
    (d.parts || []).forEach(function(p) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td><input type="text" value="' + esc(p.location||"") + '" readonly></td>'
        + '<td><input type="text" value="' + esc(p.qty||"") + '" readonly></td>'
        + '<td><input type="text" value="' + esc(p.part||"") + '" readonly style="font-weight:600"></td>'
        + '<td class="tc"><input type="checkbox" class="cbt"' + (p.pulled?" checked":"") + '></td>'
        + '<td class="tc"><input type="checkbox" class="cbt"' + (p.loaded?" checked":"") + '></td>'
        + '<td class="tc"><input type="checkbox" class="cbt"' + (p.nc?" checked":"") + '></td>'
        + '<td class="tc"><input type="checkbox" class="cbt"' + (p.cod?" checked":"") + '></td>';
      ltb.appendChild(tr);
    });
  }
}

// ── Parts condition table (delivery form) ─────────────────────
function buildPartsFromData(parts) {
  var tb = document.getElementById("ptb"); if (!tb) return;
  tb.innerHTML = "";
  parts.forEach(function(p) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="pt-name">' + esc(p.part||"") + '</td>'
      + '<td><input type="text" value="' + esc(p.model||"") + '" readonly></td>'
      + '<td class="tc"><input type="checkbox" class="cbt"' + (p.damaged?" checked":"") + '></td>'
      + '<td class="tc"><input type="checkbox" class="cbt"' + (p.shortShipped?" checked":"") + '></td>'
      + '<td><input type="text" placeholder="Notes" value="' + esc(p.notes||"") + '"></td>';
    tb.appendChild(tr);
  });
}

// ── Collect driver edits only ─────────────────────────────────
function collectDriverEdits() {
  var ft = _currentForm ? _currentForm.formType : "";

  if (ft === "delivery_sheet") {
    var parts = [], dmg = [];
    var rows = document.querySelectorAll("#ptb tr");
    var partsSource = (_currentForm.parts && _currentForm.parts.length)
      ? _currentForm.parts
      : PARTS.map(function(p){ return {part:p, model:""}; });

    for (var i = 0; i < rows.length; i++) {
      var c = rows[i].querySelectorAll("td"); if (!c.length) continue;
      var src = partsSource[i] || {};
      var dm = c[2].querySelector("input") ? c[2].querySelector("input").checked : false;
      var sh = c[3].querySelector("input") ? c[3].querySelector("input").checked : false;
      var nt = c[4].querySelector("input") ? c[4].querySelector("input").value : "";
      if (dm) dmg.push(src.part || "");
      parts.push({part: src.part||"", model: src.model||"", damaged: dm, shortShipped: sh, notes: nt});
    }
    return {
      comments: gv("ds-cm"),
      parts: parts,
      damaged: dmg.length > 0,
      damagedParts: dmg,
      shortShipped: parts.some(function(p){ return p.shortShipped; }),
      driverSigned: SS["sig-driver"] ? SS["sig-driver"].signed : false,
      consigneeSigned: SS["sig-consignee"] ? SS["sig-consignee"].signed : false,
      driverSignature: getSigBase64("sig-driver"),
      consigneeSignature: getSigBase64("sig-consignee"),
      // Preserve original COD and payment from admin form
      codAmount: _currentForm.codAmount,
      paymentType: _currentForm.paymentType
    };
  } else if (ft === "invoice") {
    return {}; // nothing editable
  } else if (ft === "loose_parts") {
    var partsRows = [];
    var ltbRows = document.querySelectorAll("#ltb tr");
    var pd = _currentForm.parts || [];
    for (var j = 0; j < ltbRows.length; j++) {
      var orig = pd[j] || {};
      var cbs = ltbRows[j].querySelectorAll('input[type="checkbox"]');
      partsRows.push({
        location: orig.location||"", qty: orig.qty||"", part: orig.part||"",
        pulled: cbs[0] ? cbs[0].checked : false,
        loaded: cbs[1] ? cbs[1].checked : false,
        nc:     cbs[2] ? cbs[2].checked : false,
        cod:    cbs[3] ? cbs[3].checked : false
      });
    }
    return {
      comments: gv("lc"),
      parts: partsRows,
      driverSigned:   SS["sig-lpd"] ? SS["sig-lpd"].signed : false,
      receiverSigned: SS["sig-lpr"] ? SS["sig-lpr"].signed : false,
      driverSignature:   getSigBase64("sig-lpd"),
      receiverSignature: getSigBase64("sig-lpr")
    };
  }
  return {};
}

// ── Submit driver form (Set existing record) ──────────────────
function submitDriverForm() {
  if (!_currentFormId || !_currentForm || !_api) {
    alert("No form selected.");
    return;
  }

  // Invoice is view-only — driver cannot submit
  if (_currentForm.formType === "invoice") {
    alert("Invoice is view-only. No submission needed.");
    return;
  }

  var btn = document.getElementById("subbtn") || document.getElementById("btnSubParts");
  if (btn) { btn.textContent = "Submitting..."; btn.disabled = true; }

  var edits = collectDriverEdits();
  var updated = Object.assign({}, _currentForm, edits, {
    status: "Submitted",
    driverName:      DRV.name,
    driverUserId:    DRV.userId,
    driverEmail:     DRV.email,
    driverGroupId:   DRV.groupId,
    driverGroupName: DRV.groupName,
    driverGroups:    DRV.groups,
    vehicleId:       DRV.vehicleId,
    vehicleName:     DRV.vehicleName,
    vehicleLicensePlate: DRV.plate,
    submittedAt: new Date().toISOString()
  });

  // Remove assignment fields from submitted record
  delete updated.assignedDriverId;
  delete updated.assignedGroupId;
  delete updated.id;

  var grps = [];
  if (DRV.groups && DRV.groups.length) grps = DRV.groups.map(function(g){ return {id:g}; });
  else if (DRV.groupId) grps = [{id: DRV.groupId}];
  else grps = [{id:"GroupCompanyId"}];

  var fid = _currentFormId;
  _api.call("Set", {
    typeName: "AddInData",
    entity: {id: fid, addInId: ADDIN_ID, groups: grps, details: updated}
  },
  function() {
    if (btn) { btn.textContent = "Submit"; btn.disabled = false; }
    // Remove from local pending list so it doesn't show again
    _pendingForms = _pendingForms.filter(function(f){ return f.id !== fid; });
    _currentFormId = null;
    _currentForm = null;
    showSucc();
  },
  function(e) {
    if (btn) { btn.textContent = "Submit"; btn.disabled = false; }
    alert("Error submitting: " + (e.message || JSON.stringify(e)));
  });
}

function showSucc() {
  for (var i = 0; i < 3; i++) {
    var el = document.getElementById("t"+i);
    if (el) el.style.display = "none";
  }
  var succ = document.getElementById("succ");
  if (succ) succ.style.display = "block";
  window.scrollTo(0, 0);
}

function backToList() {
  var succ = document.getElementById("succ");
  if (succ) succ.style.display = "none";
  showPendingScreen();
  fetchPendingForms();
}

// ── UI Init ───────────────────────────────────────────────────
function initUI() {
  var badge = document.getElementById("dbadge");
  if (badge) badge.textContent = "📅 " + new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});

  on("btnBackToList", backToList);
  on("btnNew",        backToList);
  on("subbtn",        submitDriverForm);
  on("btnSubParts",   submitDriverForm);
  on("clr-driver",    function(){ clrS("sig-driver"); });
  on("clr-consignee", function(){ clrS("sig-consignee"); });
  on("clr-lpd",       function(){ clrS("sig-lpd"); });
  on("clr-lpr",       function(){ clrS("sig-lpr"); });

  // Tab switching — only for display, actual form loaded by openForm()
  on("tab0", function(){ swT(0); });
  on("tab1", function(){ swT(1); });
  on("tab2", function(){ swT(2); });
}

// ── Tab switch ────────────────────────────────────────────────
function swT(n) {
  var succ = document.getElementById("succ");
  if (succ) succ.style.display = "none";
  for (var i = 0; i < 3; i++) {
    var el = document.getElementById("t"+i);
    if (el) el.style.display = (i===n) ? "block" : "none";
    var btn = document.getElementById("tab"+i);
    if (btn) btn.className = "tab" + (i===n ? " active" : "");
  }
}

// ── Event helper ─────────────────────────────────────────────
function on(id, fn) {
  var el = document.getElementById(id); if (!el) return;
  el.addEventListener("click", fn);
  el.addEventListener("touchend", function(e){ e.preventDefault(); fn(e); }, {passive:false});
}

// ── Signature pad ─────────────────────────────────────────────
function initSig(id) {
  var c = document.getElementById(id); if (!c) return;
  var ctx = c.getContext("2d");
  SS[id] = {drawing:false, signed:false};
  c.style.touchAction = "none";
  c.style.webkitUserSelect = "none";
  c.style.userSelect = "none";
  if (c.parentElement) c.parentElement.style.touchAction = "none";

  function rsz() {
    var dpr = window.devicePixelRatio||1;
    var w = c.parentElement.clientWidth||c.parentElement.offsetWidth||300;
    var sw = window.innerWidth||300;
    var h = sw<=360?120:sw<=480?130:sw<=768?150:160;
    c.width=w*dpr; c.height=h*dpr;
    c.style.width=w+"px"; c.style.height=h+"px";
    ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
  }
  setTimeout(rsz, 100);
  window.addEventListener("resize", rsz);

  function xy(e) {
    var r=c.getBoundingClientRect(), s=e.touches?e.touches[0]:e;
    return {x:s.clientX-r.left, y:s.clientY-r.top};
  }
  function start(e){ e.preventDefault(); SS[id].drawing=true; var p=xy(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); }
  function move(e) { e.preventDefault(); if(!SS[id].drawing)return; var p=xy(e); ctx.lineWidth=2.5; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.strokeStyle="#1e293b"; ctx.lineTo(p.x,p.y); ctx.stroke(); }
  function end(e)  { e.preventDefault(); if(SS[id].drawing) mkS(id); SS[id].drawing=false; }

  c.addEventListener("mousedown",  start);
  c.addEventListener("mousemove",  move);
  c.addEventListener("mouseup",    end);
  c.addEventListener("mouseleave", function(){ SS[id].drawing=false; });
  c.addEventListener("touchstart", start, {passive:false});
  c.addEventListener("touchmove",  move,  {passive:false});
  c.addEventListener("touchend",   end,   {passive:false});
  c.addEventListener("touchcancel",function(){ SS[id].drawing=false; }, {passive:false});
}

function getSigBase64(id) {
  var c = document.getElementById(id);
  if (!c || !SS[id] || !SS[id].signed) return "";
  try {
    var small = document.createElement("canvas");
    small.width=200; small.height=60;
    var ctx = small.getContext("2d");
    ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,200,60);
    ctx.drawImage(c,0,0,200,60);
    var dataUrl = small.toDataURL("image/jpeg", 0.3);
    if (dataUrl.length > 3500) {
      var tiny = document.createElement("canvas");
      tiny.width=150; tiny.height=45;
      var ctx2 = tiny.getContext("2d");
      ctx2.fillStyle="#ffffff"; ctx2.fillRect(0,0,150,45);
      ctx2.drawImage(c,0,0,150,45);
      dataUrl = tiny.toDataURL("image/jpeg", 0.2);
    }
    return dataUrl;
  } catch(e) { return ""; }
}

function mkS(id) {
  SS[id].signed = true;
  var wrap = document.getElementById(id+"-wrap"); if(wrap) wrap.className="sw ok";
  var ok = document.getElementById(id+"-ok"); if(ok) ok.style.display="flex";
  var ph = document.getElementById(id+"-ph"); if(ph) ph.style.display="none";
}

function clrS(id) {
  var c = document.getElementById(id); if(!c) return;
  var ctx = c.getContext("2d");
  var dpr = window.devicePixelRatio||1;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,c.width,c.height);
  ctx.scale(dpr,dpr);
  SS[id] = {drawing:false, signed:false};
  var wrap = document.getElementById(id+"-wrap"); if(wrap) wrap.className="sw";
  var ok = document.getElementById(id+"-ok"); if(ok) ok.style.display="none";
  var ph = document.getElementById(id+"-ph"); if(ph) ph.style.display="block";
}

// ── Helpers ───────────────────────────────────────────────────
function gv(id){ var e=document.getElementById(id); return e?(e.value||"").trim():""; }

function esc(s){
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
