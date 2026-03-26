// ============================================================
// VENTURE TRAILERS — app.js v5.1
// ✅ Follows official Geotab SDK sample pattern exactly
// ✅ License check with DeviceStatusInfo (online + total devices)
// ============================================================

var ADDIN_ID = "azXOKPvAnSnyIdUK2xZutWA";
var LICENSE_SERVER_URL = "https://script.google.com/a/macros/dynastync.com/s/AKfycbx2fyJ1auGqjYlrwGuegVdXvgxWCKLgZ2odY2I_CoT0gZGMc-fqmd7RtziWG7xlbewA/exec";
var _licenseValid = false;
var PARTS = ["Tail Light-R","Tail Light-L","Tail Light-Lens","Marker Light","Tag Bracket",
  "Tongue Jack","Winch Stand","Rollers","Bunks","Fenders","Tires","Actuator","Frame Rails","Tongue"];
var bklt = "", SS = {}, irc = 0, lrc = 0;
var DRV = {name:"",userId:"",email:"",groupId:"",groupName:"",groups:[],vehicleId:"",vehicleName:"",plate:""};
var _api = null, _initialized = false;

// ── Geotab Add-In Entry Point ─────────────────────────────
geotab.addin.ventureDelivery = function() {
  return {

    initialize: function(api, state, callback) {
      _api = api;
      checkLicense(api, function(result) {
        _licenseValid = result.allowed;
        if (!result.allowed) {
          showLicenseError(result.reason || "Not licensed.");
        }
        callback();
      });
    },

    focus: function(api, state) {
      _api = api;
      var app = document.getElementById("vt-app");
      if (app) app.style.display = "block";

      if (!_licenseValid) {
        var lk = document.getElementById("lic-screen");
        if (lk) lk.style.display = "block";
        var card = document.querySelector(".card");
        if (card) card.style.display = "none";
        return;
      }

      if (!_initialized) {
        _initialized = true;
        initUI();
      }
      fetchDriver(api);
    },

    blur: function(api, state) {
      var app = document.getElementById("vt-app");
      if (app) app.style.display = "none";
      resetF();
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

    // Step 1: Get total device count
    api.call("Get", {typeName: "Device", search: {activeFrom: "1986-01-01T00:00:00Z"}}, function(devices) {
      var totalCount = (devices || []).length;

      // Step 2: Get online devices via DeviceStatusInfo
      // Use isDeviceCommunicating — official Geotab boolean for real-time status
      api.call("Get", {typeName: "DeviceStatusInfo"}, function(dsi) {
        var dsiList = dsi || [];
        var onlineCount = 0;

        dsiList.forEach(function(item) {
          if (!item.device || !item.device.id) return;
          if (item.isDeviceCommunicating === true) {
            onlineCount++;
          }
        });

        console.log("[License] DB:", database, "| Total:", totalCount, "| DSI:", dsiList.length, "| Online:", onlineCount);
        sendLicenseRequest(database, onlineCount, totalCount, callback);

      }, function(err) {
        console.error("[License] DeviceStatusInfo error:", err);
        sendLicenseRequest(database, 0, totalCount, callback);
      });

    }, function(err) {
      console.error("[License] Device count error:", err);
      sendLicenseRequest(database, 0, 0, callback);
    });
  });
}

function sendLicenseRequest(database, onlineDevices, totalDevices, callback) {
  var url = LICENSE_SERVER_URL +
    "?action=verify" +
    "&database="    + encodeURIComponent(database) +
    "&addinId="     + encodeURIComponent(ADDIN_ID) +
    "&deviceCount=" + (onlineDevices || 0) +
    "&totalDevices="+ (totalDevices  || 0);

  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.timeout = 10000;
  xhr.onload = function() {
    if (xhr.status === 200) {
      try { callback(JSON.parse(xhr.responseText)); }
      catch(e) { callback({allowed: true, warning: "License parse error — offline mode"}); }
    } else {
      callback({allowed: true, warning: "License server error — offline mode"});
    }
  };
  xhr.onerror   = function() { callback({allowed: true, warning: "License unreachable — offline mode"}); };
  xhr.ontimeout = function() { callback({allowed: true, warning: "License timeout — offline mode"}); };
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
      '<div style="font-size:48px;margin-bottom:16px">🔒</div>' +
      '<div style="font-size:18px;font-weight:700;color:#00263E;margin-bottom:10px">Access Restricted</div>' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:24px;max-width:320px;margin-left:auto;margin-right:auto" id="lic-reason">' + reason + '</div>' +
      '<div style="font-size:13px;color:#374151">Contact <strong>Dynasty Communications</strong><br>' +
      '<a href="mailto:support@dynastync.com" style="color:#0078D4">support@dynastync.com</a></div>';
    var appDiv = document.getElementById("vt-app");
    if (appDiv) appDiv.insertBefore(lk, appDiv.firstChild);
  } else {
    lk.style.display = "block";
    var reasonEl = document.getElementById("lic-reason");
    if (reasonEl) reasonEl.textContent = reason;
  }
  var card = document.querySelector(".card");
  if (card) card.style.display = "none";
}

// ── Load group name then finish init ─────────────────────
function loadGroupAndFinish(api, info, callback) {
  if (info.groupId) {
    api.call("Get", {typeName:"Group", search:{id:info.groupId}}, function(gs) {
      info.groupName = (gs&&gs[0]) ? (gs[0].name||"") : "";
      setDrv(info);
      callback();
    }, function() { setDrv(info); callback(); });
  } else {
    setDrv(info);
    callback();
  }
}

function looksLikeUsername(s) {
  return s && !/\s/.test(s) && s === s.toLowerCase() && s.length > 0;
}
function fmtUsername(s) {
  return s.replace(/[._]/g," ").replace(/\w/g,function(ch){return ch.toUpperCase();}).trim();
}
function buildName(rawFirst, rawLast, fallbackEmail) {
  var fn;
  if (rawFirst || rawLast) {
    fn = (looksLikeUsername(rawFirst) && !rawLast) ? fmtUsername(rawFirst) : (rawFirst+" "+rawLast).trim();
  }
  if (!fn) fn = fmtUsername((fallbackEmail||"").split("@")[0]) || fallbackEmail || "";
  return fn;
}

function fetchVehicleAndFinish(api, info, callback) {
  api.call("Get", {typeName:"DeviceStatusInfo", search:{driverSearch:{id:info.userId}}},
    function(dsi) {
      if (dsi && dsi.length > 0 && dsi[0].device && dsi[0].device.id) {
        info.vehicleId   = dsi[0].device.id   || "";
        info.vehicleName = dsi[0].device.name || "";
        api.call("Get", {typeName:"Device", search:{id:info.vehicleId}},
          function(devs) {
            if (devs && devs[0]) info.plate = devs[0].licensePlate || "";
            loadGroupAndFinish(api, info, callback);
          },
          function() { loadGroupAndFinish(api, info, callback); }
        );
      } else {
        loadGroupAndFinish(api, info, callback);
      }
    },
    function(e) { console.error("DeviceStatusInfo error:", e); loadGroupAndFinish(api, info, callback); }
  );
}

function fetchDriver(api) {
  api.getSession(function(sess) {
    if (!sess || !sess.userName) return;
    fetchUserByName(api, sess.userName, function(){});
  });
}

function fetchUserByName(api, userName, callback) {
  api.call("Get", {typeName:"User", search:{name:userName}}, function(us) {
    if (!us || !us.length) { callback(); return; }
    var u = null;
    var lowerTarget = userName.toLowerCase();
    for (var i = 0; i < us.length; i++) {
      if ((us[i].name||"").toLowerCase() === lowerTarget) { u = us[i]; break; }
    }
    if (!u) u = us[0];
    var fn = buildName((u.firstName||"").trim(), (u.lastName||"").trim(), u.name||userName);
    var info = {
      name: fn, userId: u.id||"", email: u.name||userName,
      groups: (u.companyGroups||[]).map(function(g){return g.id;}),
      groupId: (u.companyGroups&&u.companyGroups[0]) ? u.companyGroups[0].id : "",
      groupName: "", vehicleId: "", vehicleName: "", plate: ""
    };
    fetchVehicleAndFinish(api, info, callback);
  }, function(e) { console.error("User fetch error:", e); callback(); });
}

function setDrv(info) {
  DRV.name=info.name||""; DRV.userId=info.userId||""; DRV.email=info.email||"";
  DRV.groupId=info.groupId||""; DRV.groupName=info.groupName||"";
  DRV.groups=info.groups||[]; DRV.vehicleId=info.vehicleId||"";
  DRV.vehicleName=info.vehicleName||""; DRV.plate=info.plate||"";

  if (info.name) {
    var db = document.getElementById("dbar");
    if (db) db.style.display = "flex";
    var init = info.name.split(" ").map(function(w){return w[0]||"";}).join("").toUpperCase().slice(0,2)||"D";
    var el;
    if ((el=document.getElementById("dav"))) el.textContent = init;
    if ((el=document.getElementById("dnm"))) el.textContent = info.name;
    if ((el=document.getElementById("dmt"))) el.textContent = (info.email||"")+(info.vehicleName?" • "+info.vehicleName:"");
    if ((el=document.getElementById("dgrp"))) el.textContent = "📍 "+(info.groupName||"No Group");
  }

  if (info.vehicleId) {
    var drv_sec = document.getElementById("drv-section");
    if (drv_sec) drv_sec.style.display = "block";
    var g = function(id){ return document.getElementById(id); };
    if(g("ds-drv")) g("ds-drv").value = info.name||"";
    if(g("ds-grp")) g("ds-grp").value = info.groupName||"";
    if(g("ds-vid")) g("ds-vid").value = info.vehicleId||"";
    if(g("ds-vnm")) g("ds-vnm").value = info.vehicleName||"";
  }
}

// ── Initialize UI ─────────────────────────────────────────
function initUI() {
  var td = new Date().toISOString().split("T")[0];
  var inputs = document.querySelectorAll('input[type="date"]');
  for (var i=0; i<inputs.length; i++) inputs[i].value = td;

  var badge = document.getElementById("dbadge");
  if (badge) badge.textContent = "📅 "+new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});

  buildPT();
  addIR(); addIR();
  for (var j=0; j<10; j++) addLR();

  on("tab0", function(){ swT(0); });
  on("tab1", function(){ swT(1); });
  on("tab2", function(){ swT(2); });
  on("subbtn", subDelivery);
  on("btnSubInv", subInv);
  on("btnSubParts", subParts);
  on("btnNew", resetF);
  on("btnDraft", function(){});
  on("btnAddIR", addIR);
  on("btnAddLR", addLR);
  on("clr-driver", function(){ clrS("sig-driver"); });
  on("clr-consignee", function(){ clrS("sig-consignee"); });
  on("clr-lpd", function(){ clrS("sig-lpd"); });
  on("clr-lpr", function(){ clrS("sig-lpr"); });
  on("py", function(){ setBk("Y"); });
  on("pn", function(){ setBk("N"); });

  var ish = document.getElementById("ish");
  if (ish) ish.addEventListener("input", calcT);

  setTimeout(function(){
    initSig("sig-driver");
    initSig("sig-consignee");
    initSig("sig-lpd");
    initSig("sig-lpr");
  }, 300);

  initPayToggles();
}

function initPayToggles() {
  var divs = document.querySelectorAll(".ptog");
  for (var i=0; i<divs.length; i++) {
    (function(d) {
      function toggle() {
        if (d.classList.contains("active")) d.classList.remove("active");
        else d.classList.add("active");
      }
      d.addEventListener("touchend", function(e){ e.preventDefault(); toggle(); }, {passive:false});
      d.addEventListener("click", function(e){ if(!e._fromTouch) toggle(); });
    })(divs[i]);
  }
}

function on(id, fn) {
  var el = document.getElementById(id); if (!el) return;
  el.addEventListener("click", fn);
  el.addEventListener("touchend", function(e){ e.preventDefault(); fn(e); }, {passive:false});
}

function swT(n) {
  var succ = document.getElementById("succ");
  if (succ) succ.style.display = "none";
  for (var i=0; i<3; i++) {
    var el = document.getElementById("t"+i);
    if (el) el.style.display = (i===n) ? "block" : "none";
    var btn = document.getElementById("tab"+i);
    if (btn) btn.className = "tab" + (i===n ? " active" : "");
  }
}

function buildPT() {
  var tb = document.getElementById("ptb"); if (!tb) return;
  tb.innerHTML = "";
  for (var i=0; i<PARTS.length; i++) {
    var tr = document.createElement("tr");
    tr.innerHTML = '<td class="pt-name">'+PARTS[i]+'</td>'
      +'<td><input type="text" placeholder="Model"></td>'
      +'<td class="tc"><input type="checkbox" class="cbt"></td>'
      +'<td class="tc"><input type="checkbox" class="cbt"></td>'
      +'<td><input type="text" placeholder="Notes"></td>';
    tb.appendChild(tr);
  }
}

function addIR() {
  irc++;
  var id = "ir"+irc;
  var tr = document.createElement("tr"); tr.id = id;
  tr.innerHTML = '<td><input type="text" class="ir-item"></td>'
    +'<td><input type="number" value="1" min="1" class="ir-qty" id="qty-'+id+'"></td>'
    +'<td><input type="text" class="ir-desc"></td>'
    +'<td><input type="number" step="0.01" placeholder="0.00" class="ir-price" id="p1-'+id+'"></td>'
    +'<td><input type="text" class="ir-price" id="p2-'+id+'" readonly '
      +'style="background:#F9FAFB;color:#374151;font-weight:700;cursor:default"></td>'
    +'<td><button class="btn-rm" id="rm-'+id+'">✕</button></td>';
  var tb = document.getElementById("itb");
  if (tb) {
    tb.appendChild(tr);
    var qtyEl   = document.getElementById("qty-"+id);
    var priceEl = document.getElementById("p1-"+id);
    var totEl   = document.getElementById("p2-"+id);
    function recalcRow() {
      var qty   = parseFloat(qtyEl.value)   || 0;
      var price = parseFloat(priceEl.value) || 0;
      var rowTotal = qty * price;
      totEl.value = rowTotal > 0 ? rowTotal.toFixed(2) : "";
      calcT();
    }
    if (qtyEl)   qtyEl.addEventListener("input",  recalcRow);
    if (priceEl) priceEl.addEventListener("input", recalcRow);
    on("rm-"+id, function(){
      var r = document.getElementById(id);
      if (r) r.parentNode.removeChild(r);
      calcT();
    });
  }
}

function calcT() {
  var s = 0;
  var rows = document.querySelectorAll("#itb tr");
  for (var i=0; i<rows.length; i++) {
    var t = rows[i].querySelector("td:nth-child(5) input");
    if (t) s += parseFloat(t.value) || 0;
  }
  var ish = document.getElementById("ish");
  s += ish ? (parseFloat(ish.value) || 0) : 0;
  var tot = document.getElementById("itot");
  if (tot) tot.textContent = "$" + s.toFixed(2);
}

function addLR() {
  lrc++;
  var id = "lr"+lrc;
  var tr = document.createElement("tr"); tr.id = id;
  tr.innerHTML = '<td><input type="text" class="lr-loc"></td>'
    +'<td><input type="text" class="lr-qty"></td>'
    +'<td><input type="text" class="lr-part" placeholder="Part"></td>'
    +'<td class="tc"><input type="checkbox" class="cbt"></td>'
    +'<td class="tc"><input type="checkbox" class="cbt"></td>'
    +'<td class="tc"><input type="checkbox" class="cbt"></td>'
    +'<td class="tc"><input type="checkbox" class="cbt"></td>'
    +'<td><button class="btn-rm" id="rm-'+id+'">✕</button></td>';
  var tb = document.getElementById("ltb");
  if (tb) {
    tb.appendChild(tr);
    on("rm-"+id, function(){ var r=document.getElementById(id); if(r) r.parentNode.removeChild(r); });
  }
}

function setBk(v) {
  bklt = v;
  var py = document.getElementById("py"); if (py) py.className="pill"+(v==="Y"?" gn":"");
  var pn = document.getElementById("pn"); if (pn) pn.className="pill"+(v==="N"?" rd":"");
}

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
    var h = sw <= 360 ? 120 : sw <= 480 ? 130 : sw <= 768 ? 150 : 160;
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
  function start(e) { e.preventDefault(); SS[id].drawing=true; var p=xy(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); }
  function move(e)  { e.preventDefault(); if(!SS[id].drawing)return; var p=xy(e); ctx.lineWidth=2.5; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.strokeStyle="#1e293b"; ctx.lineTo(p.x,p.y); ctx.stroke(); }
  function end(e)   { e.preventDefault(); if(SS[id].drawing) mkS(id); SS[id].drawing=false; }

  c.addEventListener("mousedown", start);
  c.addEventListener("mousemove", move);
  c.addEventListener("mouseup", end);
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
    small.width = 200; small.height = 60;
    var ctx = small.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 200, 60);
    ctx.drawImage(c, 0, 0, 200, 60);
    var dataUrl = small.toDataURL("image/jpeg", 0.3);
    if (dataUrl.length > 3500) {
      var tiny = document.createElement("canvas");
      tiny.width = 150; tiny.height = 45;
      var ctx2 = tiny.getContext("2d");
      ctx2.fillStyle = "#ffffff";
      ctx2.fillRect(0, 0, 150, 45);
      ctx2.drawImage(c, 0, 0, 150, 45);
      dataUrl = tiny.toDataURL("image/jpeg", 0.2);
    }
    return dataUrl;
  } catch(e) { return ""; }
}

function mkS(id) {
  SS[id].signed = true;
  var wrap=document.getElementById(id+"-wrap"); if(wrap) wrap.className="sw ok";
  var ok=document.getElementById(id+"-ok"); if(ok) ok.style.display="block";
  var ph=document.getElementById(id+"-ph"); if(ph) ph.style.display="none";
}
function clrS(id) {
  var c=document.getElementById(id); if(!c) return;
  var ctx = c.getContext("2d");
  var dpr = window.devicePixelRatio||1;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,c.width,c.height);
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr,dpr);
  SS[id]={drawing:false,signed:false};
  var wrap=document.getElementById(id+"-wrap"); if(wrap) wrap.className="sw";
  var ok=document.getElementById(id+"-ok"); if(ok) ok.style.display="none";
  var ph=document.getElementById(id+"-ph"); if(ph) ph.style.display="block";
}

function gv(id){ var e=document.getElementById(id); return e?(e.value||"").trim():""; }
function gc(id){
  var e=document.getElementById(id); if(!e) return false;
  if(e.classList && e.classList.contains("ptog")) return e.classList.contains("active");
  return !!e.checked;
}

function validate(fields) {
  var ok=true;
  for (var i=0; i<fields.length; i++) {
    var el=document.getElementById(fields[i]); if(!el) continue;
    if (!el.value.trim()) {
      el.style.borderColor="#DE350B"; el.style.boxShadow="0 0 0 3px rgba(222,53,11,.15)"; el.style.background="#FFF8F7";
      ok=false;
      (function(e){ e.addEventListener("input",function f(){ e.style.borderColor=""; e.style.boxShadow=""; e.style.background=""; e.removeEventListener("input",f); }); })(el);
    } else { el.style.borderColor=""; el.style.boxShadow=""; el.style.background=""; }
  }
  if (!ok) { var f=document.querySelector('[style*="DE350B"]'); if(f) f.scrollIntoView({behavior:"smooth",block:"center"}); }
  return ok;
}

function collectD() {
  var parts=[],dmg=[],rows=document.querySelectorAll("#ptb tr");
  for (var i=0; i<rows.length; i++) {
    var c=rows[i].querySelectorAll("td"); if(!c.length) continue;
    var pt=c[0].textContent.trim();
    var dm=c[2].querySelector("input")?c[2].querySelector("input").checked:false;
    var sh=c[3].querySelector("input")?c[3].querySelector("input").checked:false;
    var mdl=c[1].querySelector("input")?c[1].querySelector("input").value:"";
    var nt=c[4].querySelector("input")?c[4].querySelector("input").value:"";
    if(dm) dmg.push(pt);
    if(dm || sh || mdl || nt){
      parts.push({part:pt, model:mdl, damaged:dm, shortShipped:sh, notes:nt});
    }
  }
  var ptEl = document.querySelector('input[name="paytype"]:checked');
  var pt = ptEl ? [ptEl.value] : ["COD"];
  return {
    formType:"delivery_sheet", invoiceNo:gv("ds-inv"), dealer:gv("ds-dlr"),
    dealerAddress:gv("ds-adr")+" "+gv("ds-cty"), dealerContact:gv("ds-cnt"),
    dealerPhone:gv("ds-ph"), dealerEmail:gv("ds-em"), date:gv("ds-dt"),
    codAmount:Math.round((parseFloat(gv("ds-cod"))||0)*100)/100, paymentType:pt.join(", "),
    accepted:gc("ck-ac"), booklets:bklt, comments:gv("ds-cm"),
    driverSigned:SS["sig-driver"]?SS["sig-driver"].signed:false,
    consigneeSigned:SS["sig-consignee"]?SS["sig-consignee"].signed:false,
    driverSignature: getSigBase64("sig-driver"),
    consigneeSignature: getSigBase64("sig-consignee"),
    damaged:dmg.length>0, damagedParts:dmg, parts:parts,
    status: DRV.vehicleId ? "Submitted" : "Test",
    driverName: DRV.vehicleId ? DRV.name : "",
    driverUserId: DRV.vehicleId ? DRV.userId : "",
    driverEmail: DRV.vehicleId ? DRV.email : "",
    driverGroupId: DRV.vehicleId ? DRV.groupId : "",
    driverGroupName: DRV.vehicleId ? DRV.groupName : "",
    driverGroups: DRV.vehicleId ? DRV.groups : [],
    vehicleId: DRV.vehicleId, vehicleName: DRV.vehicleName, vehicleLicensePlate: DRV.plate
  };
}

function submitToAPI(data, onOk, onErr) {
  if (!_api) { onErr(new Error("Not connected to MyGeotab.")); return; }

  // Build groups array from driver's actual groups
  // Fall back to GroupCompanyId if no groups available
  var grps = [];
  if (DRV.groups && DRV.groups.length > 0) {
    grps = DRV.groups.map(function(gid){ return {id: gid}; });
  } else if (DRV.groupId) {
    grps = [{id: DRV.groupId}];
  } else {
    grps = [{id: "GroupCompanyId"}];
  }

  _api.call("Add",
    {typeName:"AddInData", entity:{addInId:ADDIN_ID, groups:grps, details:data}},
    function(id){ onOk(id); },
    function(e){ onErr(new Error(e.message||JSON.stringify(e))); }
  );
}

function subDelivery() {
  if (!validate(["ds-dt","ds-inv","ds-dlr"])) return;
  var data=collectD(), btn=document.getElementById("subbtn");
  btn.textContent = "Submitting..."; btn.disabled = true;
  submitToAPI(data,
    function(id){ btn.textContent="📤 Submit & Send to Dealer"; btn.disabled=false; showSucc(id); },
    function(e){ btn.textContent="📤 Submit & Send to Dealer"; btn.disabled=false; alert("Error: "+e.message); }
  );
}

function subInv() {
  var lineItems = [];
  var rows = document.querySelectorAll("#itb tr");
  for (var i=0; i<rows.length; i++) {
    var c = rows[i].querySelectorAll("td"); if (!c.length) continue;
    var item  = c[0].querySelector("input") ? c[0].querySelector("input").value.trim() : "";
    var qty   = c[1].querySelector("input") ? c[1].querySelector("input").value.trim() : "";
    var desc  = c[2].querySelector("input") ? c[2].querySelector("input").value.trim() : "";
    var price = c[3].querySelector("input") ? c[3].querySelector("input").value.trim() : "";
    var total = c[4].querySelector("input") ? c[4].querySelector("input").value.trim() : "";
    if (item || desc) {
      lineItems.push({item:item, qty:qty||"1", description:desc, unitPrice:price, total:total});
    }
  }
  var shipping   = gv("ish");
  var grandTotal = document.getElementById("itot") ? document.getElementById("itot").textContent : "$0.00";
  var data = {
    formType:"invoice", invoiceNo:gv("ino"), date:gv("id"), acctNo:gv("ia"),
    billTo:gv("ibt"), shipTo:gv("ist"), po:gv("ipo"), terms:gv("itr"),
    salesOrder:gv("iso"), shippingMethod:gv("ism"),
    dealer:gv("ibt").split("\n")[0],
    lineItems:lineItems, shipping:shipping, grandTotal:grandTotal,
    driverName:DRV.name, driverGroupName:DRV.groupName,
    driverUserId:DRV.userId, driverGroupId:DRV.groupId,
    status:"Submitted"
  };
  submitToAPI(data, function(id){showSucc(id);}, function(e){alert(e.message);});
}

function subParts() {
  var rows=[],trows=document.querySelectorAll("#ltb tr");
  for(var i=0;i<trows.length;i++){
    var c=trows[i].querySelectorAll("td"); if(!c.length) continue;
    var pt=c[2].querySelector("input")?c[2].querySelector("input").value:""; if(!pt) continue;
    var cbs=trows[i].querySelectorAll('input[type="checkbox"]');
    rows.push({
      location:c[0].querySelector("input")?c[0].querySelector("input").value:"",
      qty:c[1].querySelector("input")?c[1].querySelector("input").value:"",
      part:pt,
      pulled:cbs[0]?cbs[0].checked:false,
      loaded:cbs[1]?cbs[1].checked:false,
      nc:cbs[2]?cbs[2].checked:false,
      cod:cbs[3]?cbs[3].checked:false
    });
  }
  var data={
    formType:"loose_parts", salesOrder:gv("ls"), invoiceNo:gv("li"),
    pl:gv("lpl"), trk:gv("lt"), dealer:gv("ld"), date:gv("ldt"), comments:gv("lc"),
    driverSigned:SS["sig-lpd"]?SS["sig-lpd"].signed:false,
    receiverSigned:SS["sig-lpr"]?SS["sig-lpr"].signed:false,
    driverSignature:getSigBase64("sig-lpd"),
    receiverSignature:getSigBase64("sig-lpr"),
    driverName:DRV.name, driverGroupName:DRV.groupName,
    driverUserId:DRV.userId, driverGroupId:DRV.groupId,
    vehicleId:DRV.vehicleId, vehicleName:DRV.vehicleName,
    parts:rows, status:"Submitted"
  };
  submitToAPI(data, function(id){showSucc(id);}, function(e){alert(e.message);});
}

function showSucc(id) {
  for(var i=0;i<3;i++){ var el=document.getElementById("t"+i); if(el) el.style.display="none"; }
  var rid=document.getElementById("riddisp"); if(rid) rid.textContent="MyGeotab ID: "+(id||"—");
  var succ=document.getElementById("succ"); if(succ) succ.style.display="block";
  window.scrollTo(0,0);
}

function resetF() {
  var succ=document.getElementById("succ"); if(succ) succ.style.display="none";
  swT(0);
  var allInputs = document.querySelectorAll("#t0 input, #t1 input, #t2 input");
  for (var i=0; i<allInputs.length; i++) {
    var inp = allInputs[i];
    if (inp.readOnly) continue;
    if (inp.type === "radio")    { inp.checked = (inp.value === "COD"); continue; }
    if (inp.type === "checkbox") { inp.checked = false; continue; }
    if (inp.type === "date")     { inp.value = new Date().toISOString().split("T")[0]; continue; }
    inp.value = "";
  }
  var allTA = document.querySelectorAll("#t0 textarea, #t1 textarea, #t2 textarea");
  for (var j=0; j<allTA.length; j++) allTA[j].value = "";
  var itot = document.getElementById("itot"); if(itot) itot.textContent = "$0.00";
  var itb = document.getElementById("itb"); if(itb) itb.innerHTML = "";
  var ltb = document.getElementById("ltb"); if(ltb) ltb.innerHTML = "";
  irc = 0; lrc = 0;
  addIR(); addIR();
  for (var k=0; k<10; k++) addLR();
  clrS("sig-driver"); clrS("sig-consignee");
  clrS("sig-lpd");    clrS("sig-lpr");
  bklt = "";
  var py=document.getElementById("py"); if(py) py.className="pill";
  var pn=document.getElementById("pn"); if(pn) pn.className="pill";
  buildPT();
  window.scrollTo(0, 0);
}
