// ============================================================
// VENTURE TRAILERS — app.js v3.0
// External JS file — CSP compliant for Geotab Drive
// ============================================================
var ADDIN_ID = "azXOKPvAnSnyIdUK2xZutWA";
var PARTS = ["Tail Light-R","Tail Light-L","Tail Light-Lens","Marker Light","Tag Bracket","Tongue Jack","Winch Stand","Rollers","Bunks","Fenders","Tires","Actuator","Frame Rails","Tongue"];
var bklt = "", SS = {};
var DRV = {name:"",userId:"",email:"",groupId:"",groupName:"",groups:[],vehicleId:"",vehicleName:"",plate:""};
var _api = null;

// ── Geotab lifecycle ──────────────────────────────────────
if (typeof geotab !== "undefined") {
  geotab.addin.ventureDelivery = function() {
    return {
      initialize: function(api, state, cb) {
        _api = api;
        if (api.mobile && api.mobile.exists && api.mobile.exists()) {
          api.mobile.user.get().then(function(drivers) {
            if (drivers && drivers.length) {
              var d = drivers[0];
              var info = {
                name: ((d.firstName||"")+" "+(d.lastName||"")).trim() || d.name || "",
                userId: d.id||"", email: d.name||"",
                groups: (d.companyGroups||[]).map(function(g){return g.id;}),
                groupId: (d.companyGroups&&d.companyGroups[0]) ? d.companyGroups[0].id : "",
                groupName: "",
                vehicleId: (state&&state.device) ? state.device : "",
                vehicleName: "", plate: ""
              };
              loadGroup(api, info, cb);
            } else { fallback(api, cb); }
          }).catch(function(){ fallback(api, cb); });
        } else { fallback(api, cb); }
      },
      focus: function(api) { _api = api; },
      blur: function() {}
    };
  };
}

function loadGroup(api, info, cb) {
  if (info.groupId) {
    api.call("Get", {typeName:"Group",search:{id:info.groupId}}, function(gs) {
      info.groupName = (gs&&gs[0]) ? (gs[0].name||"") : "";
      setDrv(info); cb();
    }, function(){ setDrv(info); cb(); });
  } else { setDrv(info); cb(); }
}

function fallback(api, cb) {
  api.getSession(function(sess) {
    if (!sess) { cb(); return; }
    api.call("Get", {typeName:"User",search:{userName:sess.userName}}, function(us) {
      if (!us||!us.length) { cb(); return; }
      var u = us[0];
      var fn = ((u.firstName||"")+" "+(u.lastName||"")).trim();
      if (!fn) {
        fn = (sess.userName||"").split("@")[0]
          .replace(/[._]/g," ")
          .replace(/\b\w/g, function(c){ return c.toUpperCase(); })
          .trim() || sess.userName;
      }
      var info = {
        name: fn, userId: u.id||"", email: u.name||sess.userName,
        groups: (u.companyGroups||[]).map(function(g){return g.id;}),
        groupId: (u.companyGroups&&u.companyGroups[0]) ? u.companyGroups[0].id : "",
        groupName: "", vehicleId: "", vehicleName: "", plate: ""
      };
      loadGroup(api, info, cb);
    }, function(e){ console.error("User error:",e); cb(); });
  });
}

function setDrv(info) {
  DRV.name=info.name||""; DRV.userId=info.userId||""; DRV.email=info.email||"";
  DRV.groupId=info.groupId||""; DRV.groupName=info.groupName||"";
  DRV.groups=info.groups||[]; DRV.vehicleId=info.vehicleId||"";
  DRV.vehicleName=info.vehicleName||""; DRV.plate=info.plate||"";
  if (info.vehicleId) {
    var db = document.getElementById("dbar");
    if(db) db.style.display = "flex";
    var init = info.name.split(" ").map(function(w){return w[0]||"";}).join("").toUpperCase().slice(0,2)||"D";
    var el;
    if((el=document.getElementById("dav"))) el.textContent = init;
    if((el=document.getElementById("dnm"))) el.textContent = info.name;
    if((el=document.getElementById("dmt"))) el.textContent = (info.email||"")+(info.vehicleName?" • "+info.vehicleName:"");
    if((el=document.getElementById("dgrp"))) el.textContent = "📍 "+(info.groupName||"No Group");
  }
  var g = function(id){ return document.getElementById(id); };
  if(g("ds-drv")) g("ds-drv").value = info.name||"";
  if(g("ds-grp")) g("ds-grp").value = info.groupName||"";
  if(g("ds-vid")) g("ds-vid").value = info.vehicleId||"";
  if(g("ds-vnm")) g("ds-vnm").value = info.vehicleName||"";
}

// ── Tab switch ────────────────────────────────────────────
function swT(n) {
  var el = document.getElementById("succ");
  if(el) el.style.display = "none";
  for (var i=0; i<3; i++) {
    var tab = document.getElementById("t"+i);
    if(tab) tab.style.display = (i===n) ? "block" : "none";
    var btn = document.getElementById("tab"+i);
    if(btn) btn.className = "tab" + (i===n ? " active" : "");
  }
}

// ── DOM Ready ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function() {
  // Set today's date
  var td = new Date().toISOString().split("T")[0];
  var inputs = document.querySelectorAll('input[type="date"]');
  for(var i=0; i<inputs.length; i++) inputs[i].value = td;

  var badge = document.getElementById("dbadge");
  if(badge) badge.textContent = "📅 " + new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});

  // Build dynamic content
  buildPT();
  addIR(); addIR();
  for(var j=0; j<10; j++) addLR();

  // Attach tab events
  attachBtn("tab0", function(){ swT(0); });
  attachBtn("tab1", function(){ swT(1); });
  attachBtn("tab2", function(){ swT(2); });

  // Attach form events
  attachBtn("subbtn", subDelivery);
  attachBtn("btnSubInv", subInv);
  attachBtn("btnSubParts", subParts);
  attachBtn("btnNew", resetF);
  attachBtn("btnDraft", function(){});
  attachBtn("btnAddIR", addIR);
  attachBtn("btnAddLR", addLR);
  attachBtn("clr-driver", function(){ clrS("sig-driver"); });
  attachBtn("clr-consignee", function(){ clrS("sig-consignee"); });
  attachBtn("clr-lpd", function(){ clrS("sig-lpd"); });
  attachBtn("clr-lpr", function(){ clrS("sig-lpr"); });
  attachBtn("py", function(){ setBk("Y"); });
  attachBtn("pn", function(){ setBk("N"); });

  // Init signatures after layout settles
  setTimeout(function(){
    initSig("sig-driver");
    initSig("sig-consignee");
    initSig("sig-lpd");
    initSig("sig-lpr");
  }, 500);
});

// ── Attach click+touch to a button ───────────────────────
function attachBtn(id, fn) {
  var el = document.getElementById(id);
  if(!el) return;
  el.addEventListener("click", fn);
  el.addEventListener("touchend", function(e){
    e.preventDefault();
    fn(e);
  }, {passive: false});
}

// ── Parts table ───────────────────────────────────────────
function buildPT() {
  var tb = document.getElementById("ptb");
  if(!tb) return;
  tb.innerHTML = "";
  for(var i=0; i<PARTS.length; i++){
    var tr = document.createElement("tr");
    tr.innerHTML = '<td class="pt-name">'+PARTS[i]+'</td>'
      +'<td><input type="text" placeholder="Model"></td>'
      +'<td class="tc"><input type="checkbox" class="cbt"></td>'
      +'<td class="tc"><input type="checkbox" class="cbt"></td>'
      +'<td><input type="text" placeholder="Notes"></td>';
    tb.appendChild(tr);
  }
}

var irc = 0;
function addIR() {
  irc++;
  var id = "ir" + irc;
  var tr = document.createElement("tr");
  tr.id = id;
  tr.innerHTML = '<td><input type="text" class="ir-item"></td>'
    +'<td><input type="number" value="1" class="ir-qty"></td>'
    +'<td><input type="text" class="ir-desc"></td>'
    +'<td><input type="text" class="ir-price" id="irp1-'+id+'"></td>'
    +'<td><input type="text" class="ir-price" id="irp2-'+id+'"></td>'
    +'<td><button class="btn-rm" id="rm-'+id+'">✕</button></td>';
  document.getElementById("itb").appendChild(tr);
  document.getElementById("irp1-"+id).addEventListener("input", calcT);
  document.getElementById("irp2-"+id).addEventListener("input", calcT);
  attachBtn("rm-"+id, function(){ rmRow(id); calcT(); });
}

function calcT() {
  var s=0, rows=document.querySelectorAll("#itb tr");
  for(var i=0; i<rows.length; i++){
    var t = rows[i].querySelector("td:nth-child(5) input");
    if(t) s += parseFloat(t.value)||0;
  }
  var sh = document.getElementById("ish");
  s += sh ? (parseFloat(sh.value)||0) : 0;
  var tot = document.getElementById("itot");
  if(tot) tot.textContent = "$" + s.toFixed(2);
}

var lrc = 0;
function addLR() {
  lrc++;
  var id = "lr" + lrc;
  var tr = document.createElement("tr");
  tr.id = id;
  tr.innerHTML = '<td><input type="text" class="lr-loc"></td>'
    +'<td><input type="text" class="lr-qty"></td>'
    +'<td><input type="text" class="lr-part" placeholder="Part"></td>'
    +'<td class="tc"><input type="checkbox" class="cbt"></td>'
    +'<td class="tc"><input type="checkbox" class="cbt"></td>'
    +'<td class="tc"><input type="checkbox" class="cbt"></td>'
    +'<td class="tc"><input type="checkbox" class="cbt"></td>'
    +'<td><button class="btn-rm" id="rm-'+id+'">✕</button></td>';
  document.getElementById("ltb").appendChild(tr);
  attachBtn("rm-"+id, function(){ rmRow(id); });
}

function rmRow(id) {
  var el = document.getElementById(id);
  if(el) el.parentNode.removeChild(el);
}

function setBk(v) {
  bklt = v;
  var py = document.getElementById("py");
  var pn = document.getElementById("pn");
  if(py) py.className = "pill" + (v==="Y" ? " gn" : "");
  if(pn) pn.className = "pill" + (v==="N" ? " rd" : "");
}

// ── Signature ─────────────────────────────────────────────
function initSig(id) {
  var c = document.getElementById(id);
  if(!c) return;
  var ctx = c.getContext("2d");
  SS[id] = {drawing:false, signed:false};

  c.style.touchAction = "none";
  c.style.webkitUserSelect = "none";
  c.style.userSelect = "none";
  if(c.parentElement) c.parentElement.style.touchAction = "none";

  function rsz() {
    var dpr = window.devicePixelRatio||1;
    var w = (c.parentElement.clientWidth||c.parentElement.offsetWidth||300);
    var h = 120;
    c.width = w*dpr; c.height = h*dpr;
    c.style.width = w+"px"; c.style.height = h+"px";
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr,dpr);
  }
  setTimeout(rsz, 100);
  window.addEventListener("resize", rsz);

  function xy(e) {
    var r = c.getBoundingClientRect();
    var s = e.touches ? e.touches[0] : e;
    return {x: s.clientX-r.left, y: s.clientY-r.top};
  }
  function start(e) {
    e.preventDefault(); e.stopPropagation();
    SS[id].drawing = true;
    var p = xy(e); ctx.beginPath(); ctx.moveTo(p.x,p.y);
  }
  function move(e) {
    e.preventDefault(); e.stopPropagation();
    if(!SS[id].drawing) return;
    var p = xy(e);
    ctx.lineWidth=2.5; ctx.lineCap="round"; ctx.lineJoin="round";
    ctx.strokeStyle="#1e293b";
    ctx.lineTo(p.x,p.y); ctx.stroke();
  }
  function end(e) {
    e.preventDefault(); e.stopPropagation();
    if(SS[id].drawing) mkS(id);
    SS[id].drawing = false;
  }
  c.addEventListener("mousedown", start);
  c.addEventListener("mousemove", move);
  c.addEventListener("mouseup", end);
  c.addEventListener("mouseleave", function(){ SS[id].drawing=false; });
  c.addEventListener("touchstart", start, {passive:false});
  c.addEventListener("touchmove", move, {passive:false});
  c.addEventListener("touchend", end, {passive:false});
  c.addEventListener("touchcancel", function(){ SS[id].drawing=false; }, {passive:false});
}

function mkS(id) {
  SS[id].signed = true;
  var wrap = document.getElementById(id+"-wrap");
  if(wrap) wrap.className = "sw ok";
  var ok = document.getElementById(id+"-ok");
  if(ok) ok.style.display = "block";
  var ph = document.getElementById(id+"-ph");
  if(ph) ph.style.display = "none";
}

function clrS(id) {
  var c = document.getElementById(id);
  if(!c) return;
  var dpr = window.devicePixelRatio||1;
  c.getContext("2d").clearRect(0,0,c.width/dpr,c.height/dpr);
  SS[id] = {drawing:false, signed:false};
  var wrap = document.getElementById(id+"-wrap");
  if(wrap) wrap.className = "sw";
  var ok = document.getElementById(id+"-ok");
  if(ok) ok.style.display = "none";
  var ph = document.getElementById(id+"-ph");
  if(ph) ph.style.display = "block";
}

// ── Helpers ───────────────────────────────────────────────
function gv(id){ var e=document.getElementById(id); return e?(e.value||"").trim():""; }
function gc(id){ var e=document.getElementById(id); return e?!!e.checked:false; }

function validate(fields) {
  var ok = true;
  for(var i=0; i<fields.length; i++){
    var el = document.getElementById(fields[i]);
    if(!el) continue;
    if(!el.value.trim()){
      el.style.borderColor = "#DE350B";
      el.style.boxShadow = "0 0 0 3px rgba(222,53,11,.15)";
      el.style.background = "#FFF8F7";
      ok = false;
      (function(e){
        e.addEventListener("input", function f(){
          e.style.borderColor=""; e.style.boxShadow=""; e.style.background="";
          e.removeEventListener("input",f);
        });
      })(el);
    } else {
      el.style.borderColor=""; el.style.boxShadow=""; el.style.background="";
    }
  }
  if(!ok){
    var first = document.querySelector('[style*="DE350B"]');
    if(first) first.scrollIntoView({behavior:"smooth",block:"center"});
  }
  return ok;
}

// ── Collect delivery data ─────────────────────────────────
function collectD() {
  var parts=[],dmg=[],rows=document.querySelectorAll("#ptb tr");
  for(var i=0; i<rows.length; i++){
    var c=rows[i].querySelectorAll("td"); if(!c.length) continue;
    var pt=c[0].textContent.trim();
    var dm=c[2].querySelector("input")?c[2].querySelector("input").checked:false;
    var sh=c[3].querySelector("input")?c[3].querySelector("input").checked:false;
    if(dm) dmg.push(pt);
    parts.push({part:pt, model:c[1].querySelector("input")?c[1].querySelector("input").value:"", damaged:dm, shortShipped:sh, notes:c[4].querySelector("input")?c[4].querySelector("input").value:""});
  }
  var pt=[];
  if(gc("ck-cod"))pt.push("COD"); if(gc("ck-fp"))pt.push("Floor Plan");
  if(gc("ck-pt"))pt.push("Parts"); if(gc("ck-rv"))pt.push("Return to Vendor");
  if(gc("ck-wn"))pt.push("Warranty");
  return {
    formType:"delivery_sheet", invoiceNo:gv("ds-inv"), dealer:gv("ds-dlr"),
    dealerAddress:gv("ds-adr")+" "+gv("ds-cty"), dealerContact:gv("ds-cnt"),
    dealerPhone:gv("ds-ph"), dealerEmail:gv("ds-em"), date:gv("ds-dt"),
    codAmount:parseFloat(gv("ds-cod"))||0, paymentType:pt.join(", "),
    accepted:gc("ck-ac"), booklets:bklt, comments:gv("ds-cm"),
    driverSigned:SS["sig-driver"]?SS["sig-driver"].signed:false,
    consigneeSigned:SS["sig-consignee"]?SS["sig-consignee"].signed:false,
    damaged:dmg.length>0, damagedParts:dmg, parts:parts, status:"Submitted",
    driverName:DRV.name, driverUserId:DRV.userId, driverEmail:DRV.email,
    driverGroupId:DRV.groupId, driverGroupName:DRV.groupName, driverGroups:DRV.groups,
    vehicleId:DRV.vehicleId, vehicleName:DRV.vehicleName, vehicleLicensePlate:DRV.plate
  };
}

function submitToAPI(data, onOk, onErr) {
  if(!_api){ onErr(new Error("Not connected to MyGeotab.")); return; }
  _api.call("Add",
    {typeName:"AddInData", entity:{addInId:ADDIN_ID, groups:[{id:"GroupCompanyId"}], details:data}},
    function(id){ onOk(id); },
    function(e){ onErr(new Error(e.message||JSON.stringify(e))); }
  );
}

function subDelivery() {
  if(!validate(["ds-dt","ds-inv","ds-dlr"])) return;
  var data = collectD();
  var btn = document.getElementById("subbtn");
  btn.textContent = "Submitting...";
  btn.disabled = true;
  submitToAPI(data,
    function(id){ btn.textContent="📤 Submit & Send to Dealer"; btn.disabled=false; showSucc(id); },
    function(e){ btn.textContent="📤 Submit & Send to Dealer"; btn.disabled=false; alert("Error: "+e.message); }
  );
}

function subInv() {
  var data={formType:"invoice",invoiceNo:gv("ino"),date:gv("id"),acctNo:gv("ia"),billTo:gv("ibt"),shipTo:gv("ist"),po:gv("ipo"),terms:gv("itr"),salesOrder:gv("iso"),shippingMethod:gv("ism"),dealer:gv("ibt").split("\n")[0],driverName:DRV.name,driverGroupName:DRV.groupName,driverUserId:DRV.userId,driverGroupId:DRV.groupId,status:"Submitted"};
  submitToAPI(data, function(id){showSucc(id);}, function(e){alert(e.message);});
}

function subParts() {
  var rows=[],trows=document.querySelectorAll("#ltb tr");
  for(var i=0;i<trows.length;i++){
    var c=trows[i].querySelectorAll("td"); if(!c.length) continue;
    var pt=c[2].querySelector("input")?c[2].querySelector("input").value:"";
    if(!pt) continue;
    var cbs=trows[i].querySelectorAll('input[type="checkbox"]');
    rows.push({location:c[0].querySelector("input")?c[0].querySelector("input").value:"",qty:c[1].querySelector("input")?c[1].querySelector("input").value:"",part:pt,pulled:cbs[0]?cbs[0].checked:false,loaded:cbs[1]?cbs[1].checked:false,nc:cbs[2]?cbs[2].checked:false,cod:cbs[3]?cbs[3].checked:false});
  }
  var data={formType:"loose_parts",salesOrder:gv("ls"),invoiceNo:gv("li"),pl:gv("lpl"),trk:gv("lt"),dealer:gv("ld"),date:gv("ldt"),comments:gv("lc"),driverSigned:SS["sig-lpd"]?SS["sig-lpd"].signed:false,receiverSigned:SS["sig-lpr"]?SS["sig-lpr"].signed:false,driverName:DRV.name,driverGroupName:DRV.groupName,driverUserId:DRV.userId,driverGroupId:DRV.groupId,vehicleId:DRV.vehicleId,vehicleName:DRV.vehicleName,parts:rows,status:"Submitted"};
  submitToAPI(data, function(id){showSucc(id);}, function(e){alert(e.message);});
}

function showSucc(id) {
  for(var i=0;i<3;i++){ var el=document.getElementById("t"+i); if(el) el.style.display="none"; }
  var rid = document.getElementById("riddisp");
  if(rid) rid.textContent = "MyGeotab ID: "+(id||"—");
  var succ = document.getElementById("succ");
  if(succ) succ.style.display = "block";
  window.scrollTo(0,0);
}

function resetF() {
  var succ = document.getElementById("succ");
  if(succ) succ.style.display = "none";
  swT(0);
  clrS("sig-driver"); clrS("sig-consignee");
  clrS("sig-lpd"); clrS("sig-lpr");
  bklt = "";
  var py=document.getElementById("py"); if(py) py.className="pill";
  var pn=document.getElementById("pn"); if(pn) pn.className="pill";
}

// ── Shipping input ────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function(){
  var ish = document.getElementById("ish");
  if(ish) ish.addEventListener("input", calcT);
});
