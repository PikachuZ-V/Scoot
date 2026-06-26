(function () {
  "use strict";

  var STORAGE_KEY = "rental_motor_system_v16_production";
  var state = null;
  var activePage = "dashboard";
  var scanTargetInputId = null;
  var scanner = null;
  var selectedMedia = [];
  var selectedSelfTakeMedia = [];
  var pendingOwnerRequestId = null;
  var checkoutProofPreview = null;
  var activeMonitorTab = "ready";
  var pendingReceiveRequestId = null;
  var receiveGoodsMedia = [];
  var receiveOrderScreenshot = null;
  var cfg = window.APP_CONFIG || {};
  var supabaseClient = null;
  var currentSession = null;
  var currentProfile = null;
  var cloudSaveTimer = null;
  var hasBoundAuthEvents = false;
  var userAccessRows = [];

  var titles = {
    dashboard: ["Dashboard", "Ringkasan request, stok, dan pekerjaan motor sesuai role user."],
    monitor: ["Monitor Motor", "Pantau motor ready, maintenance, dan ongoing maintenance."],
    motor_transfer: ["Pengiriman / Retur Motor", "Admin mencatat pengiriman motor ready dan retur motor maintenance antar lokasi."],
    mechanic_request: ["Request Mekanik", "Input kerusakan motor, upload foto/video, dan request sparepart."],
    mechanic_status: ["Status Request", "Pantau request aktif milik mekanik yang sedang login."],
    mechanic_ongoing: ["Ongoing Maintenance", "Motor yang sedang dalam proses service setelah stock keluar."],
    mechanic_done: ["Selesai Maintenance", "Daftar motor yang sudah selesai dimaintenance oleh mekanik."],
    mechanic_history: ["History Service", "Riwayat semua service dan request dari mekanik."],
    admin: ["Approval Admin", "Review request mekanik, siapkan stok, atau ajukan order ke owner."],
    warehouse: ["Gudang / Stock", "Review ambil mandiri, stock masuk, dan history movement."],
    owner: ["Approval Owner", "Approve, reject, atau minta revisi order sparepart sebelum pembelian."],
    overview: ["Overview Keseluruhan", "Pantauan read-only semua request, motor service, dan status barang untuk owner."],
    spareparts: ["Master Data & Barcode", "Master sparepart, barcode barang, lokasi simpan, dan data motor."],
    reports: ["Laporan", "Rekap stok, motor, request, dan pemakaian sparepart."],
    users: ["User Management", "Owner mendaftarkan Gmail/email user dan menentukan role akses."]
  };

  var statusLabel = {
    submitted_by_mechanic: "Request Baru",
    reviewed_by_admin: "Direview Admin",
    waiting_owner_approval: "Menunggu Owner",
    owner_approved: "Disetujui Owner",
    owner_rejected: "Ditolak Owner",
    purchase_pending: "Menunggu Pembelian",
    purchased: "Sudah Dibeli",
    received_by_warehouse: "Diterima Gudang",
    stock_out_ready: "Siap Stock Keluar",
    stock_out_generated: "Stock Keluar Dibuat",
    self_take_waiting_review: "Ambil Mandiri - Review Admin",
    self_take_rejected: "Ambil Mandiri Ditolak",
    ongoing_maintenance: "Ongoing Maintenance",
    completed: "Selesai",
    revision_needed: "Butuh Revisi",
    cancelled: "Dibatalkan"
  };

  var rolePages = {
    admin: ["dashboard", "monitor", "motor_transfer", "admin", "warehouse", "spareparts"],
    owner: ["dashboard", "monitor", "motor_transfer", "owner", "overview", "reports", "users"],
    mekanik: ["dashboard", "monitor", "mechanic_request", "mechanic_status", "mechanic_ongoing", "mechanic_done", "mechanic_history"]
  };

  function $(id) { return document.getElementById(id); }
  function esc(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }
  function todayYmd() {
    var d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  }
  function todayDashed() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function todayIso() { return new Date().toISOString(); }
  function formatDateTime(iso) {
    if (!iso) return "-";
    try { return new Date(iso).toLocaleString("id-ID"); } catch (e) { return iso; }
  }
  function seq(prefix, collection, field) {
    var ymd = todayYmd();
    var max = 0;
    collection.forEach(function (row) {
      var code = row[field] || "";
      if (code.indexOf(prefix + "-" + ymd + "-") === 0) {
        var num = Number(code.split("-").pop());
        if (!isNaN(num) && num > max) max = num;
      }
    });
    return prefix + "-" + ymd + "-" + String(max + 1).padStart(4, "0");
  }
  function nextSparepartCode() {
    var max = 0;
    state.spareparts.forEach(function (p) {
      var m = String(p.sparepart_code || "").match(/^SP-(\d{4,})$/);
      if (m) max = Math.max(max, Number(m[1]));
    });
    return "SP-" + String(max + 1).padStart(4, "0");
  }
  function currentRole() {
    if (currentProfile && currentProfile.role) return currentProfile.role;
    var select = $("roleSelect");
    return select ? select.value || "viewer" : "viewer";
  }
  function currentUserName() {
    if (currentProfile && currentProfile.full_name) return currentProfile.full_name;
    if (currentSession && currentSession.user && currentSession.user.email) return currentSession.user.email;
    return "User";
  }
  function currentUserEmail() {
    return currentSession && currentSession.user ? currentSession.user.email || "" : "";
  }
  function setSyncStatus(text, cls) {
    var el = $("syncStatus");
    if (!el) return;
    el.textContent = text;
    el.className = "sync-pill" + (cls ? " " + cls : "");
  }

  function defaultData() {
    return {
      motors: [
        { id: "motor_079", motor_code: "079", barcode_value: "079", plate_number: "DK 0000 XX", type: "Beat", color: "Hitam", outlet: "Canggu", status: "ready" },
        { id: "motor_109", motor_code: "109", barcode_value: "109", plate_number: "DK 0001 XX", type: "Scoopy", color: "Merah", outlet: "Canggu", status: "maintenance" },
        { id: "motor_123", motor_code: "123", barcode_value: "123", plate_number: "DK 0002 XX", type: "Vario", color: "Biru", outlet: "Karawaci", status: "ready" }
      ],
      spareparts: [
        { id: "sp_1", sparepart_code: "SP-0001", barcode_value: "SP-0001", name: "Kampas Rem Belakang", unit: "pcs", stock: 4, minimum_stock: 2, room: "Gudang Sparepart 1", rack: "Rak 1 / Box Rem", default_purchase_link: "" },
        { id: "sp_2", sparepart_code: "SP-0002", barcode_value: "SP-0002", name: "Kampas Rem Depan", unit: "pcs", stock: 1, minimum_stock: 2, room: "Gudang Sparepart 1", rack: "Rak 1 / Box Rem", default_purchase_link: "" },
        { id: "sp_3", sparepart_code: "SP-0003", barcode_value: "SP-0003", name: "Ban Belakang 90/90", unit: "pcs", stock: 0, minimum_stock: 1, room: "Gudang Sparepart 1", rack: "Rak 2 / Area Ban", default_purchase_link: "https://shopee.co.id/" },
        { id: "sp_4", sparepart_code: "SP-0004", barcode_value: "SP-0004", name: "Aki Motor", unit: "pcs", stock: 2, minimum_stock: 1, room: "Gudang Sparepart 1", rack: "Lemari Aki", default_purchase_link: "" }
      ],
      damage_reports: [],
      part_requests: [],
      request_items: [],
      owner_approvals: [],
      stock_movements: [],
      whatsapp_logs: [],
      whatsapp_settings: { enabled: true, group_name: "Group Laporan Maintenance" },
      motor_transfers: []
    };
  }

  function migrateData(data) {
    data = data || defaultData();
    data.motors = data.motors || [];
    data.spareparts = data.spareparts || [];
    data.damage_reports = data.damage_reports || [];
    data.part_requests = data.part_requests || [];
    data.request_items = data.request_items || [];
    data.owner_approvals = data.owner_approvals || [];
    data.stock_movements = data.stock_movements || [];
    data.whatsapp_logs = data.whatsapp_logs || [];
    data.whatsapp_settings = data.whatsapp_settings || { enabled: true, group_name: "Group Laporan Maintenance" };
    data.motor_transfers = data.motor_transfers || [];
    data.motor_transfers.forEach(function (t) {
      t.items = t.items || [];
      t.created_at = t.created_at || t.transfer_date || todayIso();
      t.transfer_code = t.transfer_code || seq("TRF", data.motor_transfers, "transfer_code");
    });
    data.owner_approvals.forEach(function (a) {
      a.marketplace = a.marketplace || "";
      a.checkout_screenshot = a.checkout_screenshot || null;
      a.checkout_breakdown = a.checkout_breakdown || { subtotal_items: Number(a.total_estimated_amount || 0), shipping_cost: 0, insurance_cost: 0, insurance_selected: false, delivery_estimate_text: "", delivery_estimate_days: 0, service_fee: 0, discount_amount: 0, total_before_checkout: Number(a.total_estimated_amount || 0) };
      a.checkout_breakdown.insurance_selected = a.checkout_breakdown.insurance_selected !== undefined ? !!a.checkout_breakdown.insurance_selected : Number(a.checkout_breakdown.insurance_cost || 0) > 0;
      a.checkout_breakdown.delivery_estimate_text = a.checkout_breakdown.delivery_estimate_text || "";
      a.checkout_breakdown.delivery_estimate_days = Number(a.checkout_breakdown.delivery_estimate_days || 0);
      a.ocr_status = a.ocr_status || "manual";
      a.ocr_text = a.ocr_text || "";
      a.admin_checkout_note = a.admin_checkout_note || "";
      a.received_goods_media = a.received_goods_media || [];
      a.received_order_screenshot = a.received_order_screenshot || null;
      a.received_order_number = a.received_order_number || "";
      a.received_ocr_text = a.received_ocr_text || "";
      a.received_match_status = a.received_match_status || "";
      a.received_match_summary = a.received_match_summary || "";
      a.received_admin_note = a.received_admin_note || "";
      a.received_by_admin = a.received_by_admin || "";
      a.received_at = a.received_at || null;
    });
    data.spareparts.forEach(function (p, idx) {
      if (!p.sparepart_code || !/^SP-\d{4,}$/.test(p.sparepart_code)) {
        p.sparepart_code = "SP-" + String(idx + 1).padStart(4, "0");
      }
      p.barcode_value = p.barcode_value || p.sparepart_code;
      delete p.group_id;
    });
    data.damage_reports.forEach(function (r) {
      r.media_items = r.media_items || [];
      if (r.media_links && r.media_links.length) {
        r.media_links.forEach(function (link) {
          r.media_items.push({ id: uid("media"), media_type: "link", file_name: link, file_url: link, note: "Link lama", drive_folder_path: r.drive_folder_path || "" });
        });
        delete r.media_links;
      }
    });
    return data;
  }

  function loadLocal() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      var old12 = localStorage.getItem("rental_motor_system_v12");
      if (old12) {
        try { return migrateData(JSON.parse(old12)); } catch (e) { return defaultData(); }
      }
      var old11 = localStorage.getItem("rental_motor_system_v11");
      if (old11) {
        try { return migrateData(JSON.parse(old11)); } catch (e) { return defaultData(); }
      }
      var old10 = localStorage.getItem("rental_motor_system_v10");
      if (old10) {
        try { return migrateData(JSON.parse(old10)); } catch (e) { return defaultData(); }
      }
      var old6 = localStorage.getItem("rental_motor_system_v6");
      if (old6) {
        try { return migrateData(JSON.parse(old6)); } catch (e) { return defaultData(); }
      }
      var old5 = localStorage.getItem("rental_motor_system_v4");
      if (old5) {
        try { return migrateData(JSON.parse(old5)); } catch (e) { return defaultData(); }
      }
      var old3 = localStorage.getItem("rental_motor_system_v3");
      if (old3) {
        try { return migrateData(JSON.parse(old3)); } catch (e) { return defaultData(); }
      }
      var old2 = localStorage.getItem("rental_motor_system_v2");
      if (old2) {
        try { return migrateData(JSON.parse(old2)); } catch (e) { return defaultData(); }
      }
      var old = localStorage.getItem("rental_motor_system_v1");
      if (old) {
        try { return migrateData(JSON.parse(old)); } catch (e) { return defaultData(); }
      }
      return defaultData();
    }
    try { return migrateData(JSON.parse(raw)); } catch (e) { return defaultData(); }
  }
  function saveLocal() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function save() {
    if (cfg.useSupabase && supabaseClient && currentSession) {
      scheduleCloudSave();
      return;
    }
    if (cfg.allowLocalFallback) saveLocal();
  }
  function scheduleCloudSave() {
    if (!state || !supabaseClient) return;
    setSyncStatus("Menyimpan...", "saving");
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(function () { saveCloudState(); }, 450);
  }
  async function saveCloudState() {
    if (!supabaseClient || !currentSession || !state) return;
    try {
      var payload = {
        id: "main",
        data: state,
        updated_at: new Date().toISOString(),
        updated_by: currentSession.user.id
      };
      var res = await supabaseClient.from("app_state").upsert(payload, { onConflict: "id" });
      if (res.error) throw res.error;
      setSyncStatus("Tersimpan di Supabase", "ok");
    } catch (err) {
      console.error(err);
      setSyncStatus("Gagal simpan: " + (err.message || err), "error");
    }
  }
  async function loadCloudState() {
    if (!supabaseClient || !currentSession) return defaultData();
    setSyncStatus("Mengambil data...", "saving");
    var res = await supabaseClient.from("app_state").select("data").eq("id", "main").maybeSingle();
    if (res.error) throw res.error;
    if (res.data && res.data.data) {
      setSyncStatus("Data Supabase aktif", "ok");
      return migrateData(res.data.data);
    }
    var fresh = migrateData(defaultData());
    await supabaseClient.from("app_state").upsert({ id: "main", data: fresh, updated_at: new Date().toISOString(), updated_by: currentSession.user.id }, { onConflict: "id" });
    setSyncStatus("Data awal dibuat", "ok");
    return fresh;
  }
  async function reloadCloudData() {
    try {
      state = await loadCloudState();
      renderAll();
      setSyncStatus("Data direfresh", "ok");
    } catch (err) {
      alert("Gagal refresh data: " + (err.message || err));
      setSyncStatus("Refresh gagal", "error");
    }
  }

  function findMotorByCode(code) {
    code = String(code || "").trim();
    return state.motors.find(function (m) { return m.motor_code === code || m.barcode_value === code; });
  }
  function findSparepartByCode(code) {
    code = String(code || "").trim().toUpperCase();
    return state.spareparts.find(function (p) {
      return String(p.sparepart_code || "").toUpperCase() === code || String(p.barcode_value || "").toUpperCase() === code;
    });
  }
  function getItemsForRequest(requestId) {
    return state.request_items.filter(function (i) { return i.request_id === requestId; });
  }
  function requestTotalEstimate(requestId) {
    return getItemsForRequest(requestId).reduce(function (sum, item) {
      return sum + (Number(item.estimated_price || 0) * Number(item.qty_requested || 0));
    }, 0);
  }
  function needOwnerApproval(requestId) {
    var req = state.part_requests.find(function (r) { return r.id === requestId; });
    if ((req && req.stock_out_code) || hasStockOutMovement(requestId)) return false;
    return getItemsForRequest(requestId).some(function (i) {
      var nowStock = currentStockForItem(i);
      return i.stock_status === "stock_empty" && nowStock < Number(i.qty_requested || 0);
    });
  }

  function currentStockForItem(item) {
    var p = state.spareparts.find(function (part) { return part.id === item.sparepart_id; });
    return p ? Number(p.stock || 0) : Number(item.stock_snapshot || 0);
  }

  function latestApprovalForRequest(requestId) {
    var rows = state.owner_approvals.filter(function (a) { return a.request_id === requestId; });
    return rows.length ? rows[rows.length - 1] : null;
  }

  function hasStockOutMovement(requestId) {
    return state.stock_movements.some(function (m) { return m.request_id === requestId && m.movement_type === "stock_out"; });
  }

  function existingStockOutCode(requestId) {
    var m = state.stock_movements.find(function (row) { return row.request_id === requestId && row.movement_type === "stock_out"; });
    return m ? m.movement_code : "";
  }

  function matchesAdminFilter(r, filter) {
    if (!filter || filter === "all") return true;
    var groups = {
      new: ["submitted_by_mechanic", "reviewed_by_admin"],
      owner: ["waiting_owner_approval", "owner_approved", "owner_rejected"],
      warehouse: ["purchase_pending", "received_by_warehouse", "stock_out_ready", "stock_out_generated", "self_take_waiting_review", "ongoing_maintenance"],
      done_revision: ["completed", "ongoing_maintenance", "revision_needed", "cancelled"]
    };
    return (groups[filter] || [filter]).indexOf(r.status) >= 0;
  }

  function setPage(page) {
    activePage = page;
    document.querySelectorAll(".page").forEach(function (el) { el.classList.remove("active"); });
    if ($(page)) $(page).classList.add("active");
    document.querySelectorAll(".nav button").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-page") === page);
    });
    $("pageTitle").textContent = (titles[page] || [page, ""])[0];
    $("pageSubtitle").textContent = (titles[page] || [page, ""])[1];
    closeMobileMenu();
    renderAll();
  }

  function applyRoleView() {
    var role = currentRole();
    var allowed = rolePages[role] || rolePages.admin;
    document.querySelectorAll(".nav button").forEach(function (btn) {
      var page = btn.getAttribute("data-page");
      btn.style.display = allowed.indexOf(page) >= 0 ? "block" : "none";
    });
    if (allowed.indexOf(activePage) < 0) setPage("dashboard");
    renderAll();
  }

  function renderAll() {
    if (!state) return;
    renderDashboard();
    renderMotorMonitor();
    renderMotorTransfers();
    renderWhatsAppLogs();
    renderAdmin();
    renderOwner();
    renderSpareparts();
    renderMotors();
    renderMovements();
    renderSelfTakeReviews();
    renderWarehouseMetrics();
    renderOwnerOverview();
    renderReports();
    renderOperationalOverview();
    renderMechanicHistory();
    renderUserAccess();
    updateSparepartCodePreview();
  }

  function tagForStatus(status) {
    var cls = "gray";
    if (["submitted_by_mechanic", "reviewed_by_admin", "waiting_owner_approval", "purchase_pending", "revision_needed", "self_take_waiting_review"].indexOf(status) >= 0) cls = "yellow";
    if (["owner_approved", "received_by_warehouse", "stock_out_ready", "stock_out_generated", "ongoing_maintenance", "completed"].indexOf(status) >= 0) cls = "green";
    if (["owner_rejected", "self_take_rejected", "cancelled"].indexOf(status) >= 0) cls = "red";
    return '<span class="tag ' + cls + '">' + esc(statusLabel[status] || status) + '</span>';
  }

  function formatRupiah(num) {
    return "Rp " + Number(num || 0).toLocaleString("id-ID");
  }

  function renderMediaGallery(items, label) {
    items = items || [];
    if (!items.length) return "";
    var html = '<div class="media-summary media-gallery-wrap"><b>' + esc(label || "Preview Foto/Video") + '</b><div class="media-gallery">';
    html += items.map(function (m) {
      var src = m.preview_url || m.file_url || "";
      var rawTitle = m.file_name || (m.media_type === "video" ? "Video" : "Foto");
      var title = esc(rawTitle);
      var noteRaw = m.note || m.media_note || "Belum ada keterangan detail.";
      var note = esc(noteRaw);
      var preview = "";
      var dataAttrs = ' data-preview-src="' + esc(src) + '" data-preview-type="' + esc(m.media_type || "photo") + '" data-preview-title="' + title + '" data-preview-note="' + note + '"';
      if (m.media_type === "video" && src) preview = '<video class="media-open" src="' + esc(src) + '" controls muted playsinline' + dataAttrs + '></video>';
      else if (m.media_type === "photo" && src) preview = '<img class="media-open" src="' + esc(src) + '" alt="' + title + '"' + dataAttrs + '>';
      else if (src) preview = '<a class="media-link-preview" target="_blank" href="' + esc(src) + '">Buka Link</a>';
      else preview = '<div class="media-file-placeholder">File</div>';
      return '<div class="media-tile">' + preview + '<button type="button" class="open-preview-btn media-open"' + dataAttrs + '>Buka Preview</button><div class="media-tile-body"><b>' + title + '</b><span>' + note + '</span></div></div>';
    }).join("");
    html += '</div></div>';
    return html;
  }

  function openMediaPreviewFromElement(el) {
    if (!el) return;
    var src = el.getAttribute("data-preview-src") || el.getAttribute("src") || "";
    if (!src) return;
    var type = el.getAttribute("data-preview-type") || (String(src).match(/\.(mp4|webm|mov)(\?|$)/i) ? "video" : "photo");
    var title = el.getAttribute("data-preview-title") || "Preview File";
    var note = el.getAttribute("data-preview-note") || "";
    var body = $("mediaPreviewBody");
    if (!body) return;
    if ($("mediaPreviewTitle")) $("mediaPreviewTitle").textContent = title;
    if (type === "video") body.innerHTML = '<video src="' + esc(src) + '" controls autoplay playsinline></video>';
    else body.innerHTML = '<img src="' + esc(src) + '" alt="' + esc(title) + '">';
    if ($("mediaPreviewNote")) $("mediaPreviewNote").textContent = note;
    if ($("mediaPreviewDialog")) $("mediaPreviewDialog").showModal();
  }

  function closeMediaPreview() {
    if ($("mediaPreviewDialog")) $("mediaPreviewDialog").close();
    if ($("mediaPreviewBody")) $("mediaPreviewBody").innerHTML = "";
  }


  function activeRequestsForMotor(motorId) {
    return state.part_requests.filter(function (r) {
      return r.motor_id === motorId && ["completed", "cancelled", "owner_rejected", "self_take_rejected"].indexOf(r.status) < 0;
    });
  }

  function latestRequestForMotor(motorId) {
    var rows = state.part_requests.filter(function (r) { return r.motor_id === motorId; });
    rows.sort(function (a, b) { return String(b.created_at || "").localeCompare(String(a.created_at || "")); });
    return rows[0] || null;
  }

  function latestCompletedRequestForMotor(motorId) {
    var rows = state.part_requests.filter(function (r) { return r.motor_id === motorId && r.status === "completed"; });
    rows.sort(function (a, b) { return String(b.completed_at || b.updated_at || b.created_at || "").localeCompare(String(a.completed_at || a.updated_at || a.created_at || "")); });
    return rows[0] || null;
  }

  function computedMotorStatus(motor) {
    var active = activeRequestsForMotor(motor.id);
    if (active.some(function (r) { return r.status === "ongoing_maintenance"; })) return "ongoing_maintenance";
    if (active.length) return "maintenance";
    if (["maintenance", "return_maintenance", "retur_maintenance"].indexOf(motor.status) >= 0) return "maintenance";
    if (motor.status === "ongoing_maintenance") return "ongoing_maintenance";
    return "ready";
  }

  function motorStatusText(status) {
    return status === "ongoing_maintenance" ? "Ongoing Maintenance" : (status === "maintenance" ? "Maintenance" : "Ready");
  }

  function motorStatusClass(status) {
    return status === "ready" ? "green" : (status === "ongoing_maintenance" ? "yellow" : "red");
  }

  function requestNeedSummary(r) {
    if (!r) return "-";
    var items = getItemsForRequest(r.id);
    return items.length ? items.map(function (item) { return item.sparepart_name + " x" + item.qty_requested; }).join(", ") : "Tidak ada sparepart.";
  }

  function renderMotorMonitor() {
    if (!$('motorMonitorList')) return;
    var q = ($('monitorSearch') && $('monitorSearch').value || '').toLowerCase();
    var statuses = ["ready", "maintenance", "ongoing_maintenance"];
    var summary = statuses.map(function (st) {
      var rows = state.motors.filter(function (m) { return computedMotorStatus(m) === st; });
      return '<div class="status-section motor-status-summary ' + esc(st) + '"><div class="status-count">' + rows.length + '</div><h3>' + esc(motorStatusText(st)) + '</h3><div class="muted">' + (st === 'ready' ? 'Motor siap jalan' : (st === 'maintenance' ? 'Butuh barang / review / stock' : 'Sedang dikerjakan mekanik')) + '</div></div>';
    }).join('');
    $('motorMonitorSummary').innerHTML = summary;

    var rows = state.motors.filter(function (motor) {
      var st = computedMotorStatus(motor);
      if (st !== activeMonitorTab) return false;
      var latest = latestRequestForMotor(motor.id) || {};
      var completed = latestCompletedRequestForMotor(motor.id) || {};
      var report = state.damage_reports.find(function (d) { return d.id === (latest.report_id || completed.report_id); }) || {};
      var hay = [motor.motor_code, motor.plate_number, motor.type, motor.color, motor.outlet, st, report.damage_notes, requestNeedSummary(latest)].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    $('motorMonitorList').innerHTML = rows.length ? rows.map(function (motor) {
      var st = computedMotorStatus(motor);
      var latest = latestRequestForMotor(motor.id);
      var completed = latestCompletedRequestForMotor(motor.id);
      var useReq = st === 'ready' ? completed : latest;
      var report = useReq ? (state.damage_reports.find(function (d) { return d.id === useReq.report_id; }) || {}) : {};
      var fromDate = st === 'ongoing_maintenance' && useReq ? formatDateTime(useReq.service_started_at || useReq.created_at) : (useReq ? formatDateTime(useReq.created_at) : '-');
      var readyDate = completed ? (completed.maintenance_done_date || formatDateTime(completed.completed_at)) : '-';
      return '<div class="motor-status-card">' +
        '<div class="motor-status-top"><div><div class="motor-code">Motor ' + esc(motor.motor_code || '-') + '</div><div class="card-sub">' + esc(motor.type || '-') + ' · ' + esc(motor.color || '-') + ' · ' + esc(motor.outlet || '-') + '</div></div>' +
        '<span class="tag ' + motorStatusClass(st) + '">' + esc(motorStatusText(st)) + '</span></div>' +
        '<div class="motor-info-grid"><span>Plat</span><b>' + esc(motor.plate_number || '-') + '</b><span>' + (st === 'ready' ? 'Tanggal ready' : 'Dari') + '</span><b>' + esc(st === 'ready' ? readyDate : fromDate) + '</b><span>Kerusakan</span><b>' + esc(report.damage_notes || '-') + '</b><span>Kebutuhan</span><b>' + esc(requestNeedSummary(useReq)) + '</b></div>' +
        '<div class="card-actions"><button class="secondary" data-motor-detail="' + esc(motor.id) + '">Lihat Detail Motor</button>' + (currentRole() === 'admin' && st === 'ready' ? '<button class="ghost danger-lite" data-quick-return-motor="' + esc(motor.id) + '">Retur Maintenance</button>' : '') + '</div>' +
        '</div>';
    }).join('') : '<div class="muted">Tidak ada motor untuk status ini.</div>';
  }

  function setMonitorTab(tab) {
    activeMonitorTab = tab || 'ready';
    document.querySelectorAll('[data-monitor-tab]').forEach(function (btn) {
      var active = btn.getAttribute('data-monitor-tab') === activeMonitorTab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    renderMotorMonitor();
  }

  function openMotorDetail(motorId) {
    var motor = state.motors.find(function (m) { return m.id === motorId; });
    if (!motor) return;
    var st = computedMotorStatus(motor);
    var activeRows = activeRequestsForMotor(motor.id).slice().sort(function (a,b) { return String(b.created_at||'').localeCompare(String(a.created_at||'')); });
    var doneRows = state.part_requests.filter(function (r) { return r.motor_id === motor.id && r.status === 'completed'; }).sort(function (a,b) { return String(b.completed_at||b.created_at||'').localeCompare(String(a.completed_at||a.created_at||'')); });
    var latest = st === 'ready' ? (doneRows[0] || latestRequestForMotor(motor.id)) : (activeRows[0] || latestRequestForMotor(motor.id));
    var transferRows = getTransferItemsForMotor(motor.id);
    var report = latest ? (state.damage_reports.find(function (d) { return d.id === latest.report_id; }) || {}) : {};
    if ($('motorDetailTitle')) $('motorDetailTitle').textContent = 'Detail Motor ' + (motor.motor_code || '-');
    var activeHtml = activeRows.length ? activeRows.map(function (r) { return requestCardHtml(r, true, false); }).join('') : '<div class="muted">Tidak ada maintenance aktif.</div>';
    var doneHtml = doneRows.length ? doneRows.slice(0, 5).map(function (r) { return requestCardHtml(r, true, false); }).join('') : '<div class="muted">Belum ada history ready/service selesai.</div>';
    var body = '<div class="detail-hero"><div><h3>Motor ' + esc(motor.motor_code || '-') + ' · ' + esc(motor.type || '-') + '</h3><p>' + esc(motor.plate_number || '-') + ' · ' + esc(motor.color || '-') + ' · ' + esc(motor.outlet || '-') + '</p></div><span class="tag ' + motorStatusClass(st) + '">' + esc(motorStatusText(st)) + '</span></div>' +
      '<div class="detail-grid">' +
      '<div class="detail-box"><span>Kenapa maintenance</span><b>' + esc(report.damage_notes || (st === 'ready' ? 'Motor dalam kondisi ready.' : '-')) + '</b></div>' +
      '<div class="detail-box"><span>Dari kapan</span><b>' + esc(latest ? formatDateTime(st === 'ongoing_maintenance' ? (latest.service_started_at || latest.created_at) : latest.created_at) : '-') + '</b></div>' +
      '<div class="detail-box"><span>Butuh apa saja</span><b>' + esc(requestNeedSummary(latest)) + '</b></div>' +
      '<div class="detail-box"><span>Tanggal ready terakhir</span><b>' + esc(doneRows[0] ? (doneRows[0].maintenance_done_date || formatDateTime(doneRows[0].completed_at)) : '-') + '</b></div>' +
      '</div>' +
      '<h3>Maintenance Aktif</h3><div class="card-list">' + activeHtml + '</div>' +
      '<h3>History Ready / Service Selesai</h3><div class="card-list">' + doneHtml + '</div>' +
      '<h3>History Pengiriman / Retur</h3><div class="card-list">' + (transferRows.length ? transferRows.map(transferItemCardHtml).join('') : '<div class="muted">Belum ada pengiriman/retur untuk motor ini.</div>') + '</div>'; 
    if ($('motorDetailBody')) $('motorDetailBody').innerHTML = body;
    if ($('motorDetailDialog')) $('motorDetailDialog').showModal();
  }

  function closeMotorDetail() {
    if ($('motorDetailDialog')) $('motorDetailDialog').close();
  }


  function parseMotorCodes(text) {
    return String(text || '')
      .split(/[\n,;]+/)
      .map(function (x) { return x.trim(); })
      .filter(Boolean);
  }
  function findMotorByCode(code) {
    var key = String(code || '').trim().toLowerCase();
    return state.motors.find(function (m) { return String(m.motor_code || '').toLowerCase() === key || String(m.barcode_value || '').toLowerCase() === key; }) || null;
  }
  function latestServiceDateForMotor(motorId) {
    var done = latestCompletedRequestForMotor(motorId);
    if (done) return done.maintenance_done_date || (done.completed_at ? String(done.completed_at).slice(0,10) : '');
    var items = getTransferItemsForMotor(motorId).filter(function (x) { return x.item.direction === 'return_maintenance' && x.item.last_service_date; });
    return items[0] ? items[0].item.last_service_date : '';
  }
  function getTransferItemsForMotor(motorId) {
    var rows = [];
    (state.motor_transfers || []).forEach(function (t) {
      (t.items || []).forEach(function (it) {
        if (it.motor_id === motorId) rows.push({ transfer: t, item: it });
      });
    });
    rows.sort(function (a,b) { return String(b.transfer.transfer_date || b.transfer.created_at || '').localeCompare(String(a.transfer.transfer_date || a.transfer.created_at || '')); });
    return rows;
  }
  function transferItemCardHtml(row) {
    var t = row.transfer || {};
    var it = row.item || {};
    var motor = state.motors.find(function (m) { return m.id === it.motor_id; }) || {};
    var dirLabel = it.direction === 'send_ready' ? 'Dikirim Ready' : 'Retur Maintenance';
    var tagCls = it.direction === 'send_ready' ? 'green' : 'red';
    return '<div class="mini-transfer-card"><div><b>Motor ' + esc(motor.motor_code || it.motor_code || '-') + '</b> <span class="tag ' + tagCls + '">' + esc(dirLabel) + '</span></div>' +
      '<div class="card-sub">' + esc(t.transfer_code || '-') + ' · ' + esc(t.transfer_date || '-') + ' · ' + esc(it.from_location || t.from_location || '-') + ' → ' + esc(it.to_location || t.to_location || '-') + '</div>' +
      '<div class="card-sub">Service terakhir: <b>' + esc(it.last_service_date || latestServiceDateForMotor(it.motor_id) || '-') + '</b></div>' +
      (it.note ? '<div class="muted">' + esc(it.note) + '</div>' : '') + '</div>';
  }
  function renderMotorTransfers() {
    if (!$('transferList')) return;
    var role = currentRole();
    var form = $('motorTransferForm');
    if (form) form.style.display = role === 'admin' ? 'block' : 'none';
    if ($('transferAdminName') && !$('transferAdminName').value) $('transferAdminName').value = currentUserName();
    if ($('transferDate') && !$('transferDate').value) $('transferDate').value = todayDashed();
    var q = ($('transferSearch') && $('transferSearch').value || '').toLowerCase();
    var transfers = (state.motor_transfers || []).slice().sort(function (a,b) { return String(b.created_at || b.transfer_date || '').localeCompare(String(a.created_at || a.transfer_date || '')); });
    var totalSent = 0, totalReturned = 0;
    transfers.forEach(function (t) { (t.items || []).forEach(function (it) { if (it.direction === 'send_ready') totalSent++; else totalReturned++; }); });
    if ($('transferSummary')) $('transferSummary').innerHTML =
      '<div class="status-section"><div class="status-count">' + transfers.length + '</div><h3>Total Dokumen</h3><div class="muted">Pengiriman/retur tercatat</div></div>' +
      '<div class="status-section"><div class="status-count">' + totalSent + '</div><h3>Motor Ready Dikirim</h3><div class="muted">Dari HQ ke outlet</div></div>' +
      '<div class="status-section"><div class="status-count">' + totalReturned + '</div><h3>Motor Retur Maintenance</h3><div class="muted">Dari outlet ke HQ</div></div>';
    var filtered = transfers.filter(function (t) {
      var hay = [t.transfer_code, t.transfer_date, t.from_location, t.to_location, t.admin_name, t.note].join(' ');
      (t.items || []).forEach(function (it) { var m = state.motors.find(function (x) { return x.id === it.motor_id; }) || {}; hay += ' ' + [it.motor_code, m.motor_code, m.plate_number, it.direction, it.note].join(' '); });
      return hay.toLowerCase().indexOf(q) >= 0;
    });
    $('transferList').innerHTML = filtered.length ? filtered.map(function (t) {
      var sent = (t.items || []).filter(function (it) { return it.direction === 'send_ready'; });
      var ret = (t.items || []).filter(function (it) { return it.direction === 'return_maintenance'; });
      return '<div class="card transfer-card"><div class="card-head"><div><div class="card-title">' + esc(t.transfer_code || '-') + '</div><div class="card-sub">' + esc(t.transfer_date || '-') + ' · ' + esc(t.from_location || '-') + ' → ' + esc(t.to_location || '-') + ' · Admin: ' + esc(t.admin_name || '-') + '</div></div><span class="tag gray">' + sent.length + ' kirim · ' + ret.length + ' retur</span></div>' +
        '<details class="detail-dropdown"><summary><span><b>Motor Ready Dikirim</b><small>' + sent.length + ' motor</small></span><span class="chevron">⌄</span></summary><div class="detail-dropdown-body">' + (sent.length ? sent.map(function (it) { return transferItemCardHtml({ transfer: t, item: it }); }).join('') : '<div class="muted">Tidak ada motor ready dikirim.</div>') + '</div></details>' +
        '<details class="detail-dropdown"><summary><span><b>Motor Retur Maintenance</b><small>' + ret.length + ' motor</small></span><span class="chevron">⌄</span></summary><div class="detail-dropdown-body">' + (ret.length ? ret.map(function (it) { return transferItemCardHtml({ transfer: t, item: it }); }).join('') : '<div class="muted">Tidak ada motor retur.</div>') + '</div></details>' +
        (t.note ? '<div class="card-sub"><b>Catatan:</b> ' + esc(t.note) + '</div>' : '') + '</div>';
    }).join('') : '<div class="muted">Belum ada data pengiriman/retur motor.</div>';
  }
  function createMotorTransfer(e) {
    e.preventDefault();
    var transferDate = $('transferDate').value || todayDashed();
    var from = $('transferFrom').value.trim() || 'HQ';
    var to = $('transferTo').value.trim() || 'Canggu';
    var adminName = $('transferAdminName').value.trim() || currentUserName();
    var note = $('transferNote').value.trim();
    var lastService = $('transferLastServiceDate').value || '';
    var sendCodes = parseMotorCodes($('transferSendCodes').value);
    var returnCodes = parseMotorCodes($('transferReturnCodes').value);
    if (!sendCodes.length && !returnCodes.length) return alert('Isi minimal 1 motor ready dikirim atau 1 motor retur maintenance.');
    var missing = [];
    var items = [];
    sendCodes.forEach(function (code) {
      var motor = findMotorByCode(code);
      if (!motor) { missing.push(code); return; }
      motor.outlet = to;
      motor.status = 'ready';
      motor.last_dispatch_date = transferDate;
      motor.last_dispatch_to = to;
      items.push({ id: uid('trfi'), direction: 'send_ready', motor_id: motor.id, motor_code: motor.motor_code, from_location: from, to_location: to, last_service_date: latestServiceDateForMotor(motor.id), note: 'Motor ready dikirim ke ' + to });
    });
    returnCodes.forEach(function (code) {
      var motor = findMotorByCode(code);
      if (!motor) { missing.push(code); return; }
      motor.outlet = to;
      motor.status = 'maintenance';
      motor.return_from_location = from;
      motor.return_to_location = to;
      motor.return_date = transferDate;
      motor.return_note = note || 'Retur dari outlet untuk maintenance.';
      motor.last_service_date = lastService || motor.last_service_date || latestServiceDateForMotor(motor.id);
      items.push({ id: uid('trfi'), direction: 'return_maintenance', motor_id: motor.id, motor_code: motor.motor_code, from_location: from, to_location: to, last_service_date: motor.last_service_date || '', note: note || 'Retur dari outlet untuk maintenance.' });
    });
    if (!items.length) return alert('Tidak ada nomor motor yang cocok. Cek ulang input.');
    var transfer = { id: uid('trf'), transfer_code: seq('TRF', state.motor_transfers || [], 'transfer_code'), transfer_date: transferDate, from_location: from, to_location: to, admin_name: adminName, note: note, items: items, created_at: todayIso(), created_by: currentUserName() };
    state.motor_transfers.unshift(transfer);
    save();
    renderAll();
    $('transferSendCodes').value = '';
    $('transferReturnCodes').value = '';
    $('transferNote').value = '';
    if (missing.length) alert('Tersimpan, tapi nomor ini tidak ditemukan: ' + missing.join(', '));
    else alert('Pengiriman/retur motor tersimpan.');
  }
  function quickReturnMotor(motorId) {
    var motor = state.motors.find(function (m) { return m.id === motorId; });
    if (!motor) return;
    var from = motor.outlet || 'Outlet';
    var to = prompt('Motor retur ke lokasi mana?', 'HQ');
    if (!to) return;
    var note = prompt('Keterangan returan / alasan maintenance:', 'Retur dari ' + from + ' untuk maintenance.');
    var lastService = prompt('Tanggal service terakhir (opsional, format YYYY-MM-DD):', motor.last_service_date || latestServiceDateForMotor(motor.id) || '');
    motor.status = 'maintenance';
    motor.outlet = to;
    motor.return_from_location = from;
    motor.return_to_location = to;
    motor.return_date = todayDashed();
    motor.return_note = note || '';
    motor.last_service_date = lastService || motor.last_service_date || '';
    var transfer = { id: uid('trf'), transfer_code: seq('TRF', state.motor_transfers || [], 'transfer_code'), transfer_date: todayDashed(), from_location: from, to_location: to, admin_name: currentUserName(), note: note || 'Retur cepat dari monitor motor.', items: [{ id: uid('trfi'), direction: 'return_maintenance', motor_id: motor.id, motor_code: motor.motor_code, from_location: from, to_location: to, last_service_date: motor.last_service_date || '', note: note || '' }], created_at: todayIso(), created_by: currentUserName() };
    state.motor_transfers.unshift(transfer);
    save();
    renderAll();
    alert('Motor ' + motor.motor_code + ' sudah diubah ke Maintenance dan retur tercatat.');
  }

  function composeWhatsAppMessage(eventType, r) {
    var motor = state.motors.find(function (m) { return m.id === r.motor_id; }) || {};
    var report = state.damage_reports.find(function (d) { return d.id === r.report_id; }) || {};
    var items = getItemsForRequest(r.id).map(function (item) {
      return '- ' + item.sparepart_name + ' x' + item.qty_requested + ' | stok saat request: ' + item.stock_snapshot + (item.recommended_purchase_link ? ' | link: ' + item.recommended_purchase_link : '');
    }).join('\n') || '-';
    if (eventType === 'motor_ready') {
      return '*MOTOR READY / SELESAI MAINTENANCE*\n' +
        'Motor: ' + (motor.motor_code || '-') + ' - ' + (motor.type || '-') + ' ' + (motor.color || '') + '\n' +
        'Mekanik: ' + (r.completed_by_mechanic || r.mechanic_name || '-') + '\n' +
        'Tanggal selesai: ' + (r.maintenance_done_date || todayDashed()) + '\n' +
        'Kerusakan awal: ' + (report.damage_notes || '-') + '\n' +
        'Sparepart dipakai:\n' + items + '\n' +
        'Kode stock keluar: ' + (r.stock_out_code || '-') + '\n' +
        'Catatan ready: ' + (r.ready_note || '-') + '\n' +
        'Folder/preview file: ' + (report.drive_folder_path || '-');
    }
    return '*REQUEST SPAREPART MEKANIK*\n' +
      'Request: ' + (r.request_code || '-') + '\n' +
      'Motor: ' + (motor.motor_code || '-') + ' - ' + (motor.type || '-') + ' ' + (motor.color || '') + '\n' +
      'Mekanik: ' + (r.mechanic_name || report.mechanic_name || '-') + '\n' +
      'Kategori: ' + (report.damage_category || '-') + '\n' +
      'Catatan kerusakan: ' + (report.damage_notes || '-') + '\n' +
      'Sparepart diminta:\n' + items + '\n' +
      'Foto/video: ' + ((report.media_items || []).length) + ' file\n' +
      'Folder/preview file: ' + (report.drive_folder_path || '-') + '\n' +
      'Status: menunggu review admin.';
  }

  function sendWhatsAppNotification(eventType, r) {
    if (!state.whatsapp_settings) state.whatsapp_settings = { enabled: true, group_name: 'Group Laporan Maintenance' };
    if (state.whatsapp_settings.enabled === false) return;
    var message = composeWhatsAppMessage(eventType, r);
    var log = {
      id: uid('wa'),
      event_type: eventType,
      target_group: state.whatsapp_settings.group_name || 'Group Laporan Maintenance',
      message: message,
      request_id: r.id,
      status: 'demo_saved',
      created_at: todayIso()
    };
    state.whatsapp_logs.unshift(log);
    state.whatsapp_logs = state.whatsapp_logs.slice(0, 100);
    var cfg = window.APP_CONFIG || {};
    if (cfg.whatsappWebhookEndpoint) {
      log.status = 'queued_to_webhook';
      fetch(cfg.whatsappWebhookEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: eventType, group_name: log.target_group, message: message, request_code: r.request_code })
      }).then(function (resp) {
        log.status = resp.ok ? 'sent_to_webhook' : 'webhook_failed_' + resp.status;
        save();
        renderWhatsAppLogs();
      }).catch(function () {
        log.status = 'webhook_failed';
        save();
        renderWhatsAppLogs();
      });
    }
  }

  function renderWhatsAppLogs() {
    if (!$('waLogList')) return;
    var rows = (state.whatsapp_logs || []).slice(0, 5);
    if ($('waAutoStatus')) $('waAutoStatus').textContent = state.whatsapp_settings && state.whatsapp_settings.enabled === false ? 'Auto OFF' : 'Auto ON';
    $('waLogList').innerHTML = rows.length ? rows.map(function (log) {
      return '<div class="wa-log-card"><div class="wa-log-head"><b>' + esc(log.event_type === 'motor_ready' ? 'Motor Ready' : 'Request Barang') + '</b><span class="tag gray">' + esc(formatDateTime(log.created_at)) + '</span><span class="tag ' + (String(log.status).indexOf('failed') >= 0 ? 'red' : 'green') + '">' + esc(log.status) + '</span></div><pre>' + esc(log.message) + '</pre><div class="card-actions"><button class="ghost" data-copy-wa="' + esc(log.id) + '">Copy Pesan</button></div></div>';
    }).join('') : '<div class="muted">Belum ada auto report WhatsApp. Saat mekanik membuat request atau menyelesaikan motor, pesan akan masuk log ini.</div>';
  }

  function copyWhatsAppLog(id) {
    var log = (state.whatsapp_logs || []).find(function (x) { return x.id === id; });
    if (!log) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(log.message).then(function () { alert('Pesan WhatsApp disalin.'); }).catch(function () { alert(log.message); });
    } else {
      alert(log.message);
    }
  }


  function checkoutBreakdownHtml(a) {
    if (!a) return "";
    var b = a.checkout_breakdown || {};
    var shot = a.checkout_screenshot ? renderMediaGallery([a.checkout_screenshot], "Bukti SS Before Checkout") : '<div class="muted small-pad">Belum ada screenshot checkout.</div>';
    return '<div class="checkout-proof-box">' +
      '<div class="proof-head"><b>Breakdown before checkout</b><span class="tag gray">' + esc(a.marketplace || "Marketplace") + '</span><span class="tag ' + (a.ocr_status === "ocr_draft" ? "yellow" : "green") + '">' + esc(a.ocr_status === "ocr_draft" ? "OCR draft + validasi admin" : "Manual/validasi") + '</span></div>' +
      '<div class="proof-grid">' +
      '<span>Subtotal barang</span><b>' + formatRupiah(b.subtotal_items) + '</b>' +
      '<span>Ongkir</span><b>' + formatRupiah(b.shipping_cost) + '</b>' +
      '<span>Asuransi dipakai?</span><b>' + (b.insurance_selected ? 'Ya' : 'Tidak') + '</b>' +
      '<span>Asuransi barang</span><b>' + formatRupiah(b.insurance_cost) + '</b>' +
      '<span>Estimasi pengiriman</span><b>' + esc(b.delivery_estimate_text || '-') + '</b>' +
      '<span>Estimasi hari</span><b>' + (Number(b.delivery_estimate_days || 0) ? esc(b.delivery_estimate_days) + ' hari' : '-') + '</b>' +
      '<span>Biaya layanan/lainnya</span><b>' + formatRupiah(b.service_fee) + '</b>' +
      '<span>Diskon/voucher</span><b>- ' + formatRupiah(b.discount_amount) + '</b>' +
      '<span>Total sebelum CO</span><b>' + formatRupiah(b.total_before_checkout) + '</b>' +
      '</div>' +
      (a.admin_checkout_note ? '<div class="card-sub">Catatan admin: ' + esc(a.admin_checkout_note) + '</div>' : '') +
      shot +
      (a.ocr_text ? '<details class="ocr-details"><summary>Raw OCR / draft bacaan</summary><pre>' + esc(a.ocr_text) + '</pre></details>' : '') +
      '</div>';
  }

  function receiveProofHtml(a) {
    if (!a || (!a.received_order_screenshot && !(a.received_goods_media || []).length && !a.received_order_number)) return "";
    var goods = (a.received_goods_media || []).length ? renderMediaGallery(a.received_goods_media || [], "Foto/Video Barang Diterima") : '<div class="muted small-pad">Belum ada foto barang diterima.</div>';
    var orderShot = a.received_order_screenshot ? renderMediaGallery([a.received_order_screenshot], "SS Halaman Pesanan Marketplace") : '<div class="muted small-pad">Belum ada SS halaman pesanan.</div>';
    var cls = a.received_match_status === "match" ? "green" : (a.received_match_status === "mismatch" ? "red" : "yellow");
    var label = a.received_match_status === "match" ? "Cocok" : (a.received_match_status === "mismatch" ? "Tidak Cocok" : "Perlu Cek Manual");
    return '<div class="checkout-proof-box receive-proof-box">' +
      '<div class="proof-head"><b>Bukti Barang Orderan Tiba</b><span class="tag gray">No Pesanan: ' + esc(a.received_order_number || '-') + '</span><span class="tag ' + cls + '">' + esc(label) + '</span></div>' +
      '<div class="proof-grid">' +
      '<span>Diterima oleh</span><b>' + esc(a.received_by_admin || '-') + '</b>' +
      '<span>Tanggal diterima</span><b>' + esc(a.received_at ? formatDateTime(a.received_at) : '-') + '</b>' +
      '<span>Status cocok</span><b>' + esc(label) + '</b>' +
      '<span>Catatan admin</span><b>' + esc(a.received_admin_note || '-') + '</b>' +
      '</div>' +
      (a.received_match_summary ? '<div class="card-sub"><b>Ringkasan cocokkan:</b><br>' + esc(a.received_match_summary).replace(/\n/g, '<br>') + '</div>' : '') +
      orderShot + goods +
      (a.received_ocr_text ? '<details class="ocr-details"><summary>Raw OCR pesanan / hasil pembacaan</summary><pre>' + esc(a.received_ocr_text) + '</pre></details>' : '') +
      '</div>';
  }


  function collapsibleDetailHtml(title, content, badge, open) {
    if (!content) return "";
    return '<details class="detail-dropdown"' + (open ? ' open' : '') + '>' +
      '<summary><span><b>' + esc(title) + '</b>' + (badge ? '<small>' + esc(badge) + '</small>' : '') + '</span><span class="chevron">⌄</span></summary>' +
      '<div class="detail-dropdown-body">' + content + '</div>' +
      '</details>';
  }

  function requestCardHtml(r, withMedia, compact, collapseDetails) {
    var motor = state.motors.find(function (m) { return m.id === r.motor_id; }) || {};
    var report = state.damage_reports.find(function (d) { return d.id === r.report_id; }) || {};
    var approval = latestApprovalForRequest(r.id);
    var items = getItemsForRequest(r.id);
    var itemHtml = items.map(function (item) {
      var nowStock = currentStockForItem(item);
      var enoughNow = nowStock >= Number(item.qty_requested || 0);
      var stockClass = enoughNow ? "green" : "red";
      var link = item.recommended_purchase_link ? ' · <a href="' + esc(item.recommended_purchase_link) + '" target="_blank">Link beli</a>' : "";
      return '<div><span class="tag ' + stockClass + '">' + esc(item.sparepart_name) + ' · Qty ' + esc(item.qty_requested) + ' · Stok sekarang ' + esc(nowStock) + '</span><span class="tag gray">Saat request ' + esc(item.stock_snapshot) + '</span>' + link + '</div>';
    }).join("");
    var mediaHtml = (withMedia && report.media_items && report.media_items.length && !compact) ? renderMediaGallery(report.media_items, "Preview Foto/Video Kerusakan") : "";
    var folderHtml = (report.drive_folder_path && !compact) ? '<div class="drive-path">Simulasi folder GDrive: ' + esc(report.drive_folder_path) + '</div>' : "";
    var peopleHtml = '<div class="people-row">' +
      '<span>Mekanik: <b>' + esc(r.mechanic_name || report.mechanic_name || "-") + '</b></span>' +
      (r.admin_review_by ? '<span>Review admin: <b>' + esc(r.admin_review_by) + '</b></span>' : '') +
      (r.admin_ready_by ? '<span>Admin siap/stock: <b>' + esc(r.admin_ready_by) + '</b></span>' : '') +
      (r.admin_stock_out_by ? '<span>Generate SK: <b>' + esc(r.admin_stock_out_by) + '</b></span>' : '') +
      '</div>';
    var ownerNote = approval && (approval.owner_note || approval.owner_recommended_link) ? '<div class="card-sub owner-note">' + (approval.owner_note ? 'Catatan owner: ' + esc(approval.owner_note) : '') + (approval.owner_recommended_link ? '<br>Rekomendasi link owner: <a target="_blank" href="' + esc(approval.owner_recommended_link) + '">' + esc(approval.owner_recommended_link) + '</a>' : '') + '</div>' : "";
    var completionHtml = "";
    if (r.status === "completed" && (r.maintenance_done_date || (r.ready_media_items && r.ready_media_items.length))) {
      completionHtml = '<div class="completion-box"><b>Selesai service:</b> ' + esc(r.maintenance_done_date || formatDateTime(r.completed_at)) +
        (r.ready_media_items && r.ready_media_items.length && !compact ? renderMediaGallery(r.ready_media_items, "Preview Foto/Video Motor Ready") : '') + '</div>';
    }
    if (r.status === "ongoing_maintenance") {
      completionHtml += '<div class="card-sub">Mulai service: <b>' + esc(formatDateTime(r.service_started_at)) + '</b></div>';
    }
    var detailHtml = folderHtml + mediaHtml +
      (r.admin_note ? '<div class="card-sub">Catatan admin: ' + esc(r.admin_note) + '</div>' : "") +
      ownerNote +
      (approval && !compact ? checkoutBreakdownHtml(approval) : "") +
      (approval && !compact ? receiveProofHtml(approval) : "") +
      completionHtml +
      (r.cancel_note ? '<div class="card-sub red-text">Alasan batal: ' + esc(r.cancel_note) + '</div>' : "");
    var detailButton = '<div class="card-actions"><button type="button" class="ghost" data-motor-detail="' + esc(motor.id || '') + '">Lihat Detail Motor</button></div>';
    var detailSection = collapseDetails && !compact ? collapsibleDetailHtml('Detail request, bukti, dan OCR', detailHtml + detailButton, 'klik untuk buka', false) : (detailHtml + detailButton);
    return '<div class="card' + (compact ? ' compact-card' : '') + '">' +
      '<div class="card-head"><div><div class="card-title">Motor ' + esc(motor.motor_code || "-") + ' · ' + esc(motor.type || "-") + '</div>' +
      '<div class="card-sub">' + esc(motor.outlet || "-") + ' · Report: ' + esc(report.report_code || "-") + ' · ' + esc(formatDateTime(r.created_at)) + '</div></div>' +
      '<div>' + tagForStatus(r.status) + '</div></div>' +
      peopleHtml +
      '<div class="muted">Kerusakan: ' + esc(report.damage_category || "-") + ' — ' + esc(report.damage_notes || "-") + '</div>' +
      '<div style="margin-top:8px">' + itemHtml + '</div>' +
      (r.stock_out_code ? '<div class="card-sub">Kode stock keluar: <b>' + esc(r.stock_out_code) + '</b> <span class="tag green">Tidak perlu generate ulang</span></div>' : "") +
      detailSection +
      '</div>';
  }

  function purchaseTotalSpend() {
    var seen = {};
    return state.owner_approvals.reduce(function (sum, a) {
      var r = state.part_requests.find(function (x) { return x.id === a.request_id; });
      if (!r || ["cancelled", "owner_rejected"].indexOf(r.status) >= 0) return sum;
      if (["owner_approved", "purchase_pending", "received_by_warehouse", "stock_out_ready", "stock_out_generated", "ongoing_maintenance", "completed"].indexOf(r.status) < 0) return sum;
      if (seen[a.request_id]) return sum;
      seen[a.request_id] = true;
      var b = a.checkout_breakdown || {};
      return sum + Number(b.total_before_checkout || a.total_estimated_amount || 0);
    }, 0);
  }

  function purchaseFrequency() {
    var seen = {};
    state.owner_approvals.forEach(function (a) {
      var r = state.part_requests.find(function (x) { return x.id === a.request_id; });
      if (!r || ["cancelled", "owner_rejected"].indexOf(r.status) >= 0) return;
      if (["owner_approved", "purchase_pending", "received_by_warehouse", "stock_out_ready", "stock_out_generated", "ongoing_maintenance", "completed"].indexOf(r.status) >= 0) seen[a.request_id] = true;
    });
    return Object.keys(seen).length;
  }

  function fastMovingParts(limit) {
    var map = {};
    state.stock_movements.forEach(function (m) {
      if (m.movement_type === "stock_out" || m.movement_type === "self_take_out") {
        var key = m.sparepart_name || m.sparepart_code || "-";
        map[key] = (map[key] || 0) + Number(m.qty || 0);
      }
    });
    return Object.keys(map).sort(function (a,b) { return map[b] - map[a]; }).slice(0, limit || 5).map(function (name) { return { name: name, qty: map[name] }; });
  }

  function renderOperationalOverview() {
    var box = $("adminOwnerOverviewPanel");
    if (!box) return;
    var role = currentRole();
    if (role !== "admin" && role !== "owner") {
      box.innerHTML = "";
      return;
    }
    var total = state.motors.length;
    var ready = state.motors.filter(function (m) { return computedMotorStatus(m) === "ready"; }).length;
    var maintenance = state.motors.filter(function (m) { return computedMotorStatus(m) === "maintenance"; }).length;
    var ongoing = state.motors.filter(function (m) { return computedMotorStatus(m) === "ongoing_maintenance"; }).length;
    var fast = fastMovingParts(4);
    var fastHtml = fast.length ? fast.map(function (p) { return '<div class="mini-row"><b>' + esc(p.name) + '</b><span>' + esc(p.qty) + ' keluar</span></div>'; }).join("") : '<div class="muted">Belum ada stock keluar.</div>';
    box.innerHTML = '<div class="panel modern-section overview-kpi-panel">' +
      '<div class="panel-head"><div><h2>Overview Operasional ' + (role === 'owner' ? 'Owner' : 'Admin') + '</h2><p class="muted mini-desc">Ringkasan motor, pembelian, dan fast moving stock.</p></div></div>' +
      '<div class="overview-kpi-grid">' +
      '<div class="metric soft"><span>Total Motor</span><strong>' + total + '</strong></div>' +
      '<div class="metric soft"><span>Ready</span><strong>' + ready + '</strong></div>' +
      '<div class="metric soft"><span>Maintenance</span><strong>' + maintenance + '</strong></div>' +
      '<div class="metric soft"><span>Ongoing</span><strong>' + ongoing + '</strong></div>' +
      '<div class="metric soft wide"><span>Total Pengeluaran Pembelian</span><strong>' + formatRupiah(purchaseTotalSpend()) + '</strong><small>' + purchaseFrequency() + 'x pembelian/order approved</small></div>' +
      '<div class="metric soft wide"><span>Fast Moving Stock</span><div class="fast-list">' + fastHtml + '</div></div>' +
      '</div></div>';
  }

  function renderDashboard() {
    var role = currentRole();
    var newReq = state.part_requests.filter(function (r) { return r.status === "submitted_by_mechanic"; }).length;
    var ownerReq = state.part_requests.filter(function (r) { return r.status === "waiting_owner_approval"; }).length;
    var emptyStock = state.spareparts.filter(function (p) { return Number(p.stock) <= 0; }).length;
    var today = new Date().toISOString().slice(0, 10);
    var stockOutToday = state.stock_movements.filter(function (m) {
      return m.created_at && m.created_at.slice(0, 10) === today && (m.movement_type === "stock_out" || m.movement_type === "self_take_out");
    }).length;
    $("mRequestNew").textContent = newReq;
    $("mOwner").textContent = ownerReq;
    $("mEmptyStock").textContent = emptyStock;
    $("mStockOutToday").textContent = stockOutToday;

    var hint = {
      admin: "Dashboard Admin: approval dipisah dari gudang. Section gudang ada menu sendiri untuk stock keluar/masuk dan movement.",
      owner: "Dashboard Owner: read-only untuk memantau request baru, menunggu barang, motor sudah service, dan approval order.",
      mekanik: "Dashboard Mekanik: request, status, selesai maintenance, dan history service dipisah di menu masing-masing."
    }[role] || "Dashboard";
    $("dashboardRoleHint").textContent = hint;

    var allRows = state.part_requests.slice().reverse().filter(function (r) {
      if (role === "mekanik" && r.mechanic_name !== currentUserName()) return false;
      if (role === "owner" && ["submitted_by_mechanic", "reviewed_by_admin", "waiting_owner_approval", "owner_approved", "owner_rejected", "purchase_pending", "received_by_warehouse", "stock_out_ready", "stock_out_generated", "self_take_waiting_review", "ongoing_maintenance", "revision_needed", "completed"].indexOf(r.status) < 0) return false;
      return true;
    });
    var sections;
    if (role === "owner") {
      sections = [
        { title: "Request Baru", statuses: ["submitted_by_mechanic", "reviewed_by_admin", "self_take_waiting_review"] },
        { title: "Menunggu Barang", statuses: ["waiting_owner_approval", "owner_approved", "purchase_pending", "received_by_warehouse"] },
        { title: "Ongoing Maintenance", statuses: ["stock_out_generated", "ongoing_maintenance"] },
        { title: "Sudah Service", statuses: ["completed"] }
      ];
    } else if (role === "mekanik") {
      sections = [
        { title: "1. Request Aktif", statuses: ["submitted_by_mechanic", "reviewed_by_admin", "waiting_owner_approval", "owner_approved", "purchase_pending", "received_by_warehouse", "stock_out_ready", "stock_out_generated", "self_take_waiting_review", "revision_needed"] },
        { title: "2. Menunggu Admin / Owner", statuses: ["submitted_by_mechanic", "reviewed_by_admin", "waiting_owner_approval", "self_take_waiting_review"] },
        { title: "3. Ongoing Maintenance", statuses: ["stock_out_generated", "ongoing_maintenance"] },
        { title: "4. Selesai Maintenance", statuses: ["completed"] }
      ];
    } else {
      sections = [
        { title: "1. Perlu Admin", statuses: ["submitted_by_mechanic", "reviewed_by_admin", "self_take_waiting_review"] },
        { title: "2. Owner / Pembelian", statuses: ["waiting_owner_approval", "owner_approved", "purchase_pending"] },
        { title: "3. Gudang & Ongoing", statuses: ["received_by_warehouse", "stock_out_ready", "stock_out_generated", "ongoing_maintenance"] },
        { title: "4. Selesai / Revisi", statuses: ["completed", "revision_needed", "owner_rejected", "cancelled"] }
      ];
    }
    $("dashboardStatusSections").innerHTML = sections.map(function (sec) {
      var secRows = allRows.filter(function (r) { return sec.statuses.indexOf(r.status) >= 0; });
      var preview = secRows.slice(0, 3).map(function (r) {
        var motor = state.motors.find(function (m) { return m.id === r.motor_id; }) || {};
        return '<div class="mini-row"><b>Motor ' + esc(motor.motor_code || "-") + '</b><span>' + esc(statusLabel[r.status] || r.status) + '</span></div>';
      }).join("") || '<div class="muted">Tidak ada data.</div>';
      return '<div class="status-section"><div class="status-count">' + secRows.length + '</div><h3>' + esc(sec.title) + '</h3>' + preview + '</div>';
    }).join("");

    var q = ($("dashboardSearch").value || "").toLowerCase();
    var rows = allRows.filter(function (r) {
      var motor = state.motors.find(function (m) { return m.id === r.motor_id; }) || {};
      var items = getItemsForRequest(r.id).map(function (i) { return i.sparepart_name; }).join(" ");
      var report = state.damage_reports.find(function (d) { return d.id === r.report_id; }) || {};
      return (motor.motor_code + " " + items + " " + r.status + " " + report.damage_notes + " " + (r.mechanic_name || "")).toLowerCase().indexOf(q) >= 0;
    });
    $("dashboardListTitle").textContent = role === "mekanik" ? "Status & History Service Saya" : "Request Per Motor";
    $("dashboardList").innerHTML = rows.length ? rows.map(function (r) { return requestCardHtml(r, true); }).join("") : '<div class="muted">Belum ada data untuk dashboard role ini.</div>';
  }

  function refreshSparepartDatalist() {
    var old = $("sparepartOptions");
    if (old) old.parentNode.removeChild(old);
    var list = document.createElement("datalist");
    list.id = "sparepartOptions";
    list.innerHTML = state.spareparts.map(function (p) { return '<option value="' + esc(p.name) + '"></option>'; }).join("");
    document.body.appendChild(list);
  }

  function addRequestItemRow() {
    var wrap = document.createElement("div");
    wrap.className = "item-row";
    wrap.innerHTML = '<div class="item-grid">' +
      '<div><input class="part-name-input" list="sparepartOptions" placeholder="Ketik nama sparepart..." required></div>' +
      '<div><input class="part-qty-input" type="number" min="1" value="1" required></div>' +
      '</div>' +
      '<div class="item-meta muted">Stok dan lokasi akan muncul otomatis.</div>' +
      '<label>Link rekomendasi pembelian / Shopee</label>' +
      '<input class="part-link-input" placeholder="Isi kalau stok kosong / ada rekomendasi lain">' +
      '<label>Estimasi harga</label>' +
      '<input class="part-price-input" type="number" min="0" placeholder="Opsional">' +
      '<button type="button" class="danger remove-item-btn">Hapus item</button>';
    $("requestItems").appendChild(wrap);
    refreshSparepartDatalist();
    wrap.querySelector(".part-name-input").addEventListener("input", function () { updatePartMeta(wrap); });
    wrap.querySelector(".remove-item-btn").addEventListener("click", function () { wrap.parentNode.removeChild(wrap); });
  }

  function updatePartMeta(row) {
    var name = row.querySelector(".part-name-input").value.trim().toLowerCase();
    var part = state.spareparts.find(function (p) { return p.name.toLowerCase() === name; });
    var meta = row.querySelector(".item-meta");
    var linkInput = row.querySelector(".part-link-input");
    if (!part) {
      meta.innerHTML = '<span class="tag yellow">Sparepart baru / belum ada master</span> Admin perlu validasi master barang.';
      return;
    }
    var stockTag = Number(part.stock) > 0 ? '<span class="tag green">Stok: ' + esc(part.stock) + '</span>' : '<span class="tag red">Stok kosong</span>';
    meta.innerHTML = stockTag + ' <span class="tag gray">Barcode: ' + esc(part.sparepart_code) + '</span> <span class="tag gray">' + esc(part.room || "-") + ' · ' + esc(part.rack || "-") + '</span>';
    if (Number(part.stock) <= 0 && part.default_purchase_link && !linkInput.value) linkInput.value = part.default_purchase_link;
  }

  function updateMotorLookup() {
    var motor = findMotorByCode($("reportMotorCode").value);
    $("motorLookup").innerHTML = motor ?
      '<span class="tag green">Motor ditemukan</span> <b>' + esc(motor.motor_code) + '</b> · ' + esc(motor.type || "-") + ' · ' + esc(motor.color || "-") + ' · ' + esc(motor.outlet || "-") :
      '<span class="tag yellow">Belum ditemukan</span> Tambahkan motor di master jika ini motor baru.';
    var code = ($("reportMotorCode").value || "-").trim() || "-";
    $("driveFolderHint").innerHTML = 'Folder otomatis nanti: <b>Rental Motor Reports / Motor ' + esc(code) + ' / ' + todayDashed() + ' - RPT...</b>';
  }

  function handleMediaFiles() {
    var files = Array.prototype.slice.call($("mediaUpload").files || []);
    selectedMedia = files.map(function (file) {
      return {
        temp_id: uid("media"),
        file: file,
        preview_url: URL.createObjectURL(file),
        file_name: file.name,
        media_type: file.type.indexOf("video/") === 0 ? "video" : "photo",
        size: file.size,
        note: ""
      };
    });
    renderSelectedMedia();
  }

  function renderSelectedMedia() {
    var wrap = $("mediaPreviewList");
    if (!selectedMedia.length) {
      wrap.innerHTML = '<div class="muted small-pad">Belum ada file dipilih.</div>';
      return;
    }
    wrap.innerHTML = selectedMedia.map(function (m, idx) {
      var dataAttrs = ' data-preview-src="' + esc(m.preview_url) + '" data-preview-type="' + esc(m.media_type || "photo") + '" data-preview-title="' + esc(m.file_name || "Preview") + '" data-preview-note="' + esc(m.note || "") + '"';
      var preview = m.media_type === "video" ?
        '<video class="media-open" src="' + esc(m.preview_url) + '" controls muted playsinline' + dataAttrs + '></video>' :
        '<img class="media-open" src="' + esc(m.preview_url) + '" alt="preview"' + dataAttrs + '>';
      return '<div class="media-card" data-media-index="' + idx + '">' + preview +
        '<div class="media-info"><b>' + esc(m.file_name) + '</b><small>' + esc(m.media_type) + ' · ' + Math.round((m.size || 0) / 1024) + ' KB</small>' +
        '<label>Jelaskan rusak bagian apa dan kenapa</label>' +
        '<textarea class="media-note" rows="2" placeholder="Contoh: Kampas rem belakang sudah tipis, perlu diganti.">' + esc(m.note || "") + '</textarea></div></div>';
    }).join("");
  }

  function collectSelectedMediaNotes() {
    document.querySelectorAll("#mediaPreviewList .media-card").forEach(function (card) {
      var idx = Number(card.getAttribute("data-media-index"));
      if (selectedMedia[idx]) selectedMedia[idx].note = card.querySelector(".media-note").value.trim();
    });
  }


  function setMechanicTab(tab) {
    var isSelf = tab === "selftake";
    if ($("mechanicRequestTab")) $("mechanicRequestTab").classList.toggle("active", !isSelf);
    if ($("mechanicSelfTakeTab")) $("mechanicSelfTakeTab").classList.toggle("active", isSelf);
    document.querySelectorAll("[data-mechanic-tab]").forEach(function (btn) {
      var active = btn.getAttribute("data-mechanic-tab") === tab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function handleSelfTakeMediaFiles(e) {
    selectedSelfTakeMedia.forEach(function (m) { if (m.preview_url) URL.revokeObjectURL(m.preview_url); });
    selectedSelfTakeMedia = Array.prototype.slice.call(e.target.files || []).map(function (file) {
      return {
        file_name: file.name,
        preview_url: URL.createObjectURL(file),
        media_type: file.type.indexOf("video/") === 0 ? "video" : "photo",
        size: file.size,
        note: "Bukti ambil sparepart"
      };
    });
    renderSelfTakeMedia();
  }

  function renderSelfTakeMedia() {
    var wrap = $("selfTakeMediaPreviewList");
    if (!wrap) return;
    if (!selectedSelfTakeMedia.length) {
      wrap.innerHTML = '<div class="muted small-pad">Belum ada bukti dipilih.</div>';
      return;
    }
    wrap.innerHTML = selectedSelfTakeMedia.map(function (m, idx) {
      var dataAttrs = ' data-preview-src="' + esc(m.preview_url) + '" data-preview-type="' + esc(m.media_type || "photo") + '" data-preview-title="' + esc(m.file_name || "Preview") + '" data-preview-note="' + esc(m.note || "") + '"';
      var preview = m.media_type === "video" ?
        '<video class="media-open" src="' + esc(m.preview_url) + '" controls muted playsinline' + dataAttrs + '></video>' :
        '<img class="media-open" src="' + esc(m.preview_url) + '" alt="preview"' + dataAttrs + '>';
      return '<div class="media-card" data-self-media-index="' + idx + '">' + preview +
        '<div class="media-info"><b>' + esc(m.file_name) + '</b><small>' + esc(m.media_type) + ' · ' + Math.round((m.size || 0) / 1024) + ' KB</small>' +
        '<label>Keterangan bukti</label>' +
        '<textarea class="self-media-note" rows="2" placeholder="Contoh: Foto kampas rem yang diambil dari gudang.">' + esc(m.note || "") + '</textarea></div></div>';
    }).join("");
  }

  function collectSelfTakeMediaNotes() {
    document.querySelectorAll("#selfTakeMediaPreviewList .media-card").forEach(function (card) {
      var idx = Number(card.getAttribute("data-self-media-index"));
      if (selectedSelfTakeMedia[idx]) selectedSelfTakeMedia[idx].note = card.querySelector(".self-media-note").value.trim();
    });
  }

  function updateSelfTakePartLookup() {
    if (!$("selfTakePartCode")) return;
    var part = findSparepartByCode($("selfTakePartCode").value);
    $("selfTakePartLookup").innerHTML = part ?
      '<span class="tag green">Sparepart ditemukan</span> <b>' + esc(part.name) + '</b> · Stok ' + esc(part.stock) + ' · ' + esc(part.room || "-") + ' · ' + esc(part.rack || "-") :
      '<span class="tag yellow">Belum ditemukan</span> Scan / ketik barcode sparepart.';
  }

  function createSelfTakeRequest(e) {
    e.preventDefault();
    var motor = findMotorByCode($("selfTakeMotorCode").value);
    if (!motor) return alert("Motor tidak ditemukan di master.");
    var part = findSparepartByCode($("selfTakePartCode").value);
    if (!part) return alert("Sparepart tidak ditemukan dari barcode/kode.");
    var qty = Number($("selfTakeQty").value || 0);
    if (qty <= 0) return alert("Qty wajib lebih dari 0.");
    if (Number(part.stock || 0) < qty) return alert("Stok tidak cukup. Stok saat ini: " + part.stock);

    collectSelfTakeMediaNotes();
    var reportCode = seq("RPT", state.damage_reports, "report_code");
    var skCode = seq("SK", state.stock_movements, "movement_code");
    var driveFolder = "Rental Motor Reports/Motor " + motor.motor_code + "/" + todayDashed() + " - " + reportCode;
    var mediaItems = selectedSelfTakeMedia.map(function (m) {
      return { id: uid("media"), media_type: m.media_type, file_name: m.file_name, file_size: m.size, preview_url: m.preview_url, file_url: "", drive_folder_path: driveFolder, note: m.note, created_at: todayIso() };
    });
    ($("selfTakeExtraLinks").value || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (link) {
      mediaItems.push({ id: uid("media"), media_type: "link", file_name: link, file_size: 0, file_url: link, drive_folder_path: driveFolder, note: "Link bukti tambahan ambil mandiri", created_at: todayIso() });
    });
    var mechanicName = ($("selfTakeMechanicName").value || currentUserName()).trim();
    var report = { id: uid("report"), report_code: reportCode, motor_id: motor.id, mechanic_name: mechanicName, damage_category: "Ambil Stock Cepat", damage_notes: ($("selfTakeNotes").value || "Ambil sparepart mandiri").trim(), media_items: mediaItems, drive_folder_path: driveFolder, status: "self_take_waiting_review", created_at: todayIso() };
    var request = { id: uid("req"), request_code: seq("REQ", state.part_requests, "request_code"), report_id: report.id, motor_id: motor.id, mechanic_name: mechanicName, status: "self_take_waiting_review", admin_review_by: "", admin_ready_by: "", admin_stock_out_by: "", owner_note: "", admin_note: "Menunggu admin crosscheck bukti ambil mandiri.", cancel_note: "", previous_status: "", stock_out_code: skCode, service_started_at: "", maintenance_done_date: "", ready_media_items: [], created_at: todayIso(), updated_at: todayIso() };
    var item = { id: uid("item"), request_id: request.id, sparepart_id: part.id, sparepart_code: part.sparepart_code, sparepart_name: part.name, qty_requested: qty, qty_approved: qty, stock_snapshot: Number(part.stock || 0), stock_status: "stock_available", recommended_purchase_link: part.default_purchase_link || "", estimated_price: 0, status: "self_take_waiting_review", current_stock: Number(part.stock || 0) - qty };

    part.stock = Number(part.stock || 0) - qty;
    motor.status = "maintenance";
    state.damage_reports.push(report);
    state.part_requests.push(request);
    state.request_items.push(item);
    state.stock_movements.push({ id: uid("mov"), movement_code: skCode, movement_type: "self_take_out", sparepart_id: part.id, sparepart_code: part.sparepart_code, sparepart_name: part.name, qty: qty, motor_id: motor.id, request_id: request.id, mechanic_name: mechanicName, status: "waiting_verification", notes: $("selfTakeNotes").value || "Mekanik ambil sendiri", media_items: mediaItems, created_at: todayIso() });
    sendWhatsAppNotification("request_created", request);
    save();
    alert("Ambil mandiri berhasil dibuat: " + skCode + "\nMasuk ke review admin/gudang untuk crosscheck.");
    e.target.reset();
    if ($("selfTakeMechanicName")) $("selfTakeMechanicName").value = mechanicName;
    $("selfTakeQty").value = 1;
    selectedSelfTakeMedia = [];
    renderSelfTakeMedia();
    updateSelfTakePartLookup();
    renderAll();
    setPage("mechanic_status");
  }

  function createMechanicRequest(e) {
    e.preventDefault();
    var motor = findMotorByCode($("reportMotorCode").value);
    if (!motor) return alert("No motor belum ada di master. Tambahkan motor dulu.");
    var rows = Array.prototype.slice.call($("requestItems").querySelectorAll(".item-row"));
    if (!rows.length) return alert("Tambahkan minimal 1 sparepart.");

    collectSelectedMediaNotes();
    var reportCode = seq("RPT", state.damage_reports, "report_code");
    var driveFolder = "Rental Motor Reports/Motor " + motor.motor_code + "/" + todayDashed() + " - " + reportCode;
    var mediaItems = selectedMedia.map(function (m) {
      return {
        id: uid("media"),
        media_type: m.media_type,
        file_name: m.file_name,
        file_size: m.size,
        preview_url: m.preview_url,
        file_url: "",
        drive_folder_path: driveFolder,
        note: m.note,
        created_at: todayIso()
      };
    });
    ($("mediaExtraLinks").value || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (link) {
      mediaItems.push({ id: uid("media"), media_type: "link", file_name: link, file_size: 0, file_url: link, drive_folder_path: driveFolder, note: "Link tambahan dari mekanik", created_at: todayIso() });
    });

    var report = {
      id: uid("report"),
      report_code: reportCode,
      motor_id: motor.id,
      mechanic_name: ($("mechanicName").value || currentUserName()).trim(),
      damage_category: $("damageCategory").value,
      damage_notes: $("damageNotes").value.trim(),
      media_items: mediaItems,
      drive_folder_path: driveFolder,
      status: "submitted_by_mechanic",
      created_at: todayIso()
    };
    var request = {
      id: uid("req"),
      request_code: seq("REQ", state.part_requests, "request_code"),
      report_id: report.id,
      motor_id: motor.id,
      mechanic_name: ($("mechanicName").value || currentUserName()).trim(),
      status: "submitted_by_mechanic",
      admin_review_by: "",
      admin_ready_by: "",
      admin_stock_out_by: "",
      owner_note: "",
      admin_note: "",
      cancel_note: "",
      previous_status: "",
      stock_out_code: "",
      created_at: todayIso(),
      updated_at: todayIso()
    };

    var requestItems = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var name = row.querySelector(".part-name-input").value.trim();
      var qty = Number(row.querySelector(".part-qty-input").value || 1);
      var part = state.spareparts.find(function (p) { return p.name.toLowerCase() === name.toLowerCase(); });
      if (!name || qty <= 0) return alert("Nama sparepart dan qty wajib diisi.");
      requestItems.push({
        id: uid("item"),
        request_id: request.id,
        sparepart_id: part ? part.id : null,
        sparepart_code: part ? part.sparepart_code : "MANUAL",
        sparepart_name: name,
        qty_requested: qty,
        qty_approved: 0,
        stock_snapshot: part ? Number(part.stock || 0) : 0,
        stock_status: part && Number(part.stock || 0) >= qty ? "stock_available" : "stock_empty",
        recommended_purchase_link: row.querySelector(".part-link-input").value.trim() || (part ? part.default_purchase_link : ""),
        estimated_price: Number(row.querySelector(".part-price-input").value || 0),
        status: "submitted_by_mechanic"
      });
    }
    state.damage_reports.push(report);
    state.part_requests.push(request);
    state.request_items = state.request_items.concat(requestItems);
    motor.status = "maintenance";
    sendWhatsAppNotification("request_created", request);
    save();
    e.target.reset();
    if ($("mechanicName")) $("mechanicName").value = currentUserName();
    selectedMedia = [];
    $("mediaPreviewList").innerHTML = "";
    $("requestItems").innerHTML = "";
    addRequestItemRow();
    updateMotorLookup();
    alert("Request berhasil dibuat: " + request.request_code + "\nFolder GDrive simulasi: " + driveFolder);
    setPage("mechanic_status");
  }

  function mechanicCardWithActions(r, mode) {
    var html = requestCardHtml(r, true, true);
    var actions = '<div class="card-actions">';
    if (mode === "open" && r.status === "stock_out_generated") {
      actions += '<button class="secondary" data-mechanic-action="start_service" data-id="' + esc(r.id) + '">Mulai Proses Service</button>';
    }
    if (mode === "ongoing") {
      actions += '<button class="secondary" data-mechanic-action="finish_service" data-id="' + esc(r.id) + '">Selesai Maintenance + Foto Ready</button>';
    }
    actions += '</div>';
    return html.replace(/<\/div>$/, actions + '</div>');
  }

  function renderMechanicHistory() {
    var mech = ($("mechanicName") && $("mechanicName").value) || ($("selfTakeMechanicName") && $("selfTakeMechanicName").value) || currentUserName();
    var rows = state.part_requests.slice().reverse().filter(function (r) { return r.mechanic_name === mech; });
    var openRows = rows.filter(function (r) { return ["ongoing_maintenance", "completed", "cancelled"].indexOf(r.status) < 0; });
    var ongoingRows = rows.filter(function (r) { return r.status === "ongoing_maintenance"; });
    var doneRows = rows.filter(function (r) { return r.status === "completed"; });
    if ($("mechanicOpenCount")) $("mechanicOpenCount").textContent = openRows.length + " aktif";
    if ($("mechanicOngoingCount")) $("mechanicOngoingCount").textContent = ongoingRows.length + " proses";
    if ($("mechanicDoneCount")) $("mechanicDoneCount").textContent = doneRows.length + " selesai";
    if ($("mechanicHistoryCount")) $("mechanicHistoryCount").textContent = rows.length + " report";
    if ($("mechanicOpenList")) $("mechanicOpenList").innerHTML = openRows.length ? openRows.map(function (r) { return mechanicCardWithActions(r, "open"); }).join("") : '<div class="muted">Belum ada request aktif.</div>';
    if ($("mechanicOngoingList")) $("mechanicOngoingList").innerHTML = ongoingRows.length ? ongoingRows.map(function (r) { return mechanicCardWithActions(r, "ongoing"); }).join("") : '<div class="muted">Belum ada motor yang sedang dikerjakan.</div>';
    if ($("mechanicCompletedList")) $("mechanicCompletedList").innerHTML = doneRows.length ? doneRows.map(function (r) { return requestCardHtml(r, true, true); }).join("") : '<div class="muted">Belum ada maintenance selesai.</div>';
    if ($("mechanicHistoryList")) $("mechanicHistoryList").innerHTML = rows.length ? rows.map(function (r) { return requestCardHtml(r, true, true); }).join("") : '<div class="muted">Belum ada history service.</div>';
  }

  function handleMechanicAction(action, id) {
    var r = state.part_requests.find(function (x) { return x.id === id; });
    if (!r) return;
    if (action === "start_service") {
      r.status = "ongoing_maintenance";
      r.service_started_at = todayIso();
      r.service_by_mechanic = r.mechanic_name || currentUserName();
      var motor = state.motors.find(function (m) { return m.id === r.motor_id; });
      if (motor) motor.status = "ongoing_maintenance";
      var report = state.damage_reports.find(function (d) { return d.id === r.report_id; });
      if (report) report.status = "ongoing_maintenance";
      save();
      renderAll();
      setPage("mechanic_ongoing");
      return;
    }
    if (action === "finish_service") {
      var doneDate = prompt("Tanggal selesai service (YYYY-MM-DD):", todayDashed());
      if (doneDate === null) return;
      var note = prompt("Catatan selesai service / kondisi motor ready:", "Motor sudah selesai maintenance dan ready.") || "Motor sudah selesai maintenance dan ready.";
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,video/*";
      input.multiple = true;
      input.onchange = function () {
        var files = Array.prototype.slice.call(input.files || []);
        var media = files.map(function (file) {
          return { id: uid("ready"), media_type: file.type.indexOf("video/") === 0 ? "video" : "photo", file_name: file.name, file_size: file.size, preview_url: URL.createObjectURL(file), file_url: "", note: note, created_at: todayIso() };
        });
        r.status = "completed";
        r.completed_at = todayIso();
        r.completed_by_mechanic = r.mechanic_name || currentUserName();
        r.maintenance_done_date = doneDate || todayDashed();
        r.ready_media_items = media;
        r.ready_note = note;
        var motor = state.motors.find(function (m) { return m.id === r.motor_id; });
        if (motor) motor.status = "ready";
        var report = state.damage_reports.find(function (d) { return d.id === r.report_id; });
        if (report) { report.status = "completed"; report.completed_at = todayIso(); }
        sendWhatsAppNotification("motor_ready", r);
        save();
        renderAll();
        setPage("mechanic_done");
      };
      input.click();
    }
  }

  function exportCompletedCsv() {
    var rows = [["Tanggal Selesai", "No Motor", "Plat", "Tipe", "Mekanik", "Request Code", "Kerusakan", "Sparepart", "Qty", "Kode Stock Keluar", "Catatan Ready"]];
    state.part_requests.filter(function (r) { return r.status === "completed"; }).forEach(function (r) {
      var motor = state.motors.find(function (m) { return m.id === r.motor_id; }) || {};
      var report = state.damage_reports.find(function (d) { return d.id === r.report_id; }) || {};
      getItemsForRequest(r.id).forEach(function (item) {
        rows.push([r.maintenance_done_date || (r.completed_at || "").slice(0, 10), motor.motor_code || "", motor.plate_number || "", motor.type || "", r.mechanic_name || "", r.request_code || "", report.damage_notes || "", item.sparepart_name || "", item.qty_requested || "", r.stock_out_code || "", r.ready_note || ""]);
      });
    });
    var csv = rows.map(function (row) { return row.map(function (cell) { return '"' + String(cell == null ? "" : cell).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "export-selesai-maintenance-" + todayYmd() + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function renderAdmin() {
    var filter = $("adminStatusFilter").value || "all";
    var rows = state.part_requests.slice().reverse().filter(function (r) { return matchesAdminFilter(r, filter); });
    if (!rows.length) {
      $("adminRequestList").innerHTML = '<div class="muted">Tidak ada request untuk filter ini.</div>';
      return;
    }
    $("adminRequestList").innerHTML = rows.map(function (r) {
      var base = requestCardHtml(r, true, false, true);
      var needOwner = needOwnerApproval(r.id);
      var actions = '<div class="card-actions">';
      if (r.status === "submitted_by_mechanic") {
        actions += '<button class="secondary" data-admin-action="review" data-id="' + esc(r.id) + '">Review</button>';
        actions += '<button class="secondary" data-admin-action="ready" data-id="' + esc(r.id) + '">Siapkan Stock</button>';
        actions += '<button class="danger" data-admin-action="cancel" data-id="' + esc(r.id) + '">Batalkan</button>';
      } else if (r.status === "reviewed_by_admin") {
        if (needOwner) actions += '<button class="secondary" data-admin-action="owner" data-id="' + esc(r.id) + '">Ajukan Owner + Bukti CO</button>';
        if (!needOwner) actions += '<button class="secondary" data-admin-action="ready" data-id="' + esc(r.id) + '">Set Siap Stock Keluar</button>';
        actions += '<button class="ghost" data-admin-action="edit_links" data-id="' + esc(r.id) + '">Edit Link/Qty</button>';
        actions += '<button class="ghost" data-admin-action="revision" data-id="' + esc(r.id) + '">Minta Revisi</button>';
        actions += '<button class="danger" data-admin-action="cancel" data-id="' + esc(r.id) + '">Batalkan</button>';
      } else if (r.status === "waiting_owner_approval") {
        actions += '<button class="secondary" data-admin-action="owner" data-id="' + esc(r.id) + '">Update Bukti CO</button>';
        actions += '<button class="ghost" data-admin-action="edit_links" data-id="' + esc(r.id) + '">Edit Link Rekomendasi</button>';
        actions += '<button class="ghost" data-admin-action="revision" data-id="' + esc(r.id) + '">Minta Revisi</button>';
        actions += '<button class="danger" data-admin-action="cancel" data-id="' + esc(r.id) + '">Batalkan</button>';
      } else if (r.status === "owner_approved") {
        actions += '<button class="secondary" data-admin-action="purchase" data-id="' + esc(r.id) + '">Tandai Pembelian Diproses</button>';
        actions += '<button class="secondary" data-admin-action="received" data-id="' + esc(r.id) + '">Barang Diterima + Bukti/OCR</button>';
        actions += '<button class="danger" data-admin-action="cancel" data-id="' + esc(r.id) + '">Batalkan</button>';
      } else if (r.status === "purchase_pending") {
        actions += '<button class="secondary" data-admin-action="received" data-id="' + esc(r.id) + '">Barang Diterima + Bukti/OCR</button>';
        actions += '<button class="danger" data-admin-action="cancel" data-id="' + esc(r.id) + '">Batalkan</button>';
      } else if (r.status === "received_by_warehouse") {
        actions += '<button class="secondary" data-admin-action="ready" data-id="' + esc(r.id) + '">Set Siap Stock Keluar</button>';
      } else if (r.status === "stock_out_ready") {
        if (r.stock_out_code) actions += '<button class="secondary" data-admin-action="stockout" data-id="' + esc(r.id) + '">Tampilkan Kode Stock Keluar</button>';
        else actions += '<button class="secondary" data-admin-action="stockout" data-id="' + esc(r.id) + '">Generate Stock Keluar</button>';
        actions += '<button class="ghost" data-admin-action="revision" data-id="' + esc(r.id) + '">Minta Revisi</button>';
      } else if (r.status === "stock_out_generated") {
        actions += '<span class="tag green">Menunggu mekanik mulai proses service</span>';
        actions += '<button class="ghost" data-admin-action="reopen" data-id="' + esc(r.id) + '">Buka Lagi</button>';
      } else if (r.status === "ongoing_maintenance") {
        actions += '<span class="tag green">Sedang dikerjakan mekanik</span>';
      } else if (r.status === "self_take_waiting_review") {
        actions += '<span class="tag yellow">Review di menu Gudang / Stock</span>';
      } else if (r.status === "owner_rejected") {
        actions += '<button class="ghost" data-admin-action="edit_links" data-id="' + esc(r.id) + '">Edit Link sesuai Owner</button>';
        actions += '<button class="secondary" data-admin-action="owner" data-id="' + esc(r.id) + '">Ajukan Owner Ulang + Bukti CO</button>';
        actions += '<button class="danger" data-admin-action="cancel" data-id="' + esc(r.id) + '">Batalkan</button>';
      } else if (r.status === "revision_needed") {
        actions += '<button class="ghost" data-admin-action="edit_links" data-id="' + esc(r.id) + '">Edit Link/Qty Revisi</button>';
        if (needOwner) actions += '<button class="secondary" data-admin-action="owner" data-id="' + esc(r.id) + '">Ajukan Owner Ulang + Bukti CO</button>';
        else actions += '<button class="secondary" data-admin-action="resubmit" data-id="' + esc(r.id) + '">Kirim Ulang ke Review</button>';
        actions += '<button class="danger" data-admin-action="cancel" data-id="' + esc(r.id) + '">Batalkan</button>';
      } else if (r.status === "cancelled") {
        actions += '<button class="secondary" data-admin-action="restore" data-id="' + esc(r.id) + '">Pulihkan Request</button>';
      } else if (r.status === "completed") {
        actions += '<button class="ghost" data-admin-action="reopen" data-id="' + esc(r.id) + '">Buka Lagi</button>';
      }
      actions += '</div>';
      return base.replace(/<\/div>$/, actions + '</div>');
    }).join("");
  }

  function editPurchaseLinks(r) {
    var items = getItemsForRequest(r.id);
    items.forEach(function (item) {
      var defaultLink = item.owner_recommended_link || item.recommended_purchase_link || "";
      var newLink = prompt("Edit link pembelian untuk " + item.sparepart_name + ":", defaultLink);
      if (newLink !== null) item.recommended_purchase_link = newLink.trim();
      var newPrice = prompt("Edit estimasi harga untuk " + item.sparepart_name + ":", item.estimated_price || "");
      if (newPrice !== null && newPrice !== "") item.estimated_price = Number(newPrice || 0);
    });
    r.admin_note = prompt("Catatan admin setelah revisi link/qty:", r.admin_note || "Link rekomendasi sudah direvisi sesuai masukan owner.") || r.admin_note || "Link rekomendasi sudah direvisi.";
    r.updated_at = todayIso();
  }

  function checkoutNumber(id) {
    var el = $(id);
    if (!el) return 0;
    return Number(String(el.value || "0").replace(/[^0-9.-]/g, "")) || 0;
  }

  function isCheckoutInsuranceSelected() {
    var el = $("checkoutInsuranceEnabled");
    return !el || el.value !== "no";
  }

  function handleCheckoutInsuranceToggle() {
    var input = $("checkoutInsurance");
    if (!input) return;
    if (!isCheckoutInsuranceSelected()) {
      input.value = 0;
      input.disabled = true;
    } else {
      input.disabled = false;
    }
    calculateCheckoutTotal();
  }

  function calculateCheckoutTotal() {
    var subtotal = checkoutNumber("checkoutSubtotal");
    var shipping = checkoutNumber("checkoutShipping");
    var insurance = isCheckoutInsuranceSelected() ? checkoutNumber("checkoutInsurance") : 0;
    var service = checkoutNumber("checkoutServiceFee");
    var discount = checkoutNumber("checkoutDiscount");
    var total = subtotal + shipping + insurance + service - discount;
    if ($("checkoutInsurance") && !isCheckoutInsuranceSelected()) $("checkoutInsurance").value = 0;
    if ($("checkoutTotal")) $("checkoutTotal").value = total;
    if ($("checkoutTotalPreview")) $("checkoutTotalPreview").textContent = formatRupiah(total);
    return total;
  }

  function fillCheckoutFromApproval(a) {
    var b = (a && a.checkout_breakdown) || {};
    if ($("checkoutMarketplace")) $("checkoutMarketplace").value = a && a.marketplace ? a.marketplace : "Shopee";
    if ($("checkoutSubtotal")) $("checkoutSubtotal").value = Number(b.subtotal_items || 0);
    if ($("checkoutShipping")) $("checkoutShipping").value = Number(b.shipping_cost || 0);
    if ($("checkoutInsuranceEnabled")) $("checkoutInsuranceEnabled").value = (b.insurance_selected || Number(b.insurance_cost || 0) > 0) ? "yes" : "no";
    if ($("checkoutInsurance")) $("checkoutInsurance").value = Number(b.insurance_cost || 0);
    if ($("checkoutDeliveryEstimate")) $("checkoutDeliveryEstimate").value = b.delivery_estimate_text || "";
    if ($("checkoutDeliveryDays")) $("checkoutDeliveryDays").value = Number(b.delivery_estimate_days || 0);
    handleCheckoutInsuranceToggle();
    if ($("checkoutServiceFee")) $("checkoutServiceFee").value = Number(b.service_fee || 0);
    if ($("checkoutDiscount")) $("checkoutDiscount").value = Number(b.discount_amount || 0);
    if ($("checkoutNote")) $("checkoutNote").value = a && a.admin_checkout_note ? a.admin_checkout_note : "";
    if ($("checkoutOcrText")) $("checkoutOcrText").value = a && a.ocr_text ? a.ocr_text : "";
    checkoutProofPreview = a && a.checkout_screenshot ? a.checkout_screenshot : null;
    renderCheckoutUploadPreview();
    calculateCheckoutTotal();
  }

  function openCheckoutDialog(r) {
    pendingOwnerRequestId = r.id;
    var existing = latestApprovalForRequest(r.id);
    var title = $("checkoutDialogTitle");
    if (title) title.textContent = "Bukti Before Checkout - " + r.request_code;
    var subtotal = requestTotalEstimate(r.id);
    var defaultApproval = {
      marketplace: "Shopee",
      checkout_breakdown: { subtotal_items: subtotal, shipping_cost: 0, insurance_cost: 0, insurance_selected: false, delivery_estimate_text: "", delivery_estimate_days: 0, service_fee: 0, discount_amount: 0, total_before_checkout: subtotal },
      admin_checkout_note: "",
      ocr_text: ""
    };
    fillCheckoutFromApproval(existing || defaultApproval);
    var itemList = getItemsForRequest(r.id).map(function (item) {
      return '<div class="mini-row"><b>' + esc(item.sparepart_name) + ' x ' + esc(item.qty_requested) + '</b><span>' + formatRupiah(Number(item.estimated_price || 0) * Number(item.qty_requested || 0)) + '</span></div>';
    }).join("");
    if ($("checkoutItemList")) $("checkoutItemList").innerHTML = itemList || '<div class="muted">Belum ada item.</div>';
    if ($("checkoutDialog")) $("checkoutDialog").showModal();
  }

  function renderCheckoutUploadPreview() {
    var wrap = $("checkoutProofPreview");
    if (!wrap) return;
    if (!checkoutProofPreview) {
      wrap.innerHTML = '<div class="muted small-pad">Belum ada screenshot before checkout.</div>';
      return;
    }
    wrap.innerHTML = renderMediaGallery([checkoutProofPreview], "Preview Bukti Checkout");
  }

  function handleCheckoutProofFile(e) {
    var file = (e.target.files || [])[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      checkoutProofPreview = {
        id: uid("checkout_ss"),
        media_type: file.type.indexOf("video/") === 0 ? "video" : "photo",
        file_name: file.name,
        file_size: file.size,
        preview_url: ev.target.result,
        file_url: "",
        note: "Screenshot before checkout marketplace",
        created_at: todayIso()
      };
      renderCheckoutUploadPreview();
      if ($("checkoutOcrText")) $("checkoutOcrText").value = "";
    };
    reader.readAsDataURL(file);
  }

  var DEMO_GEMINI_KEY_STORAGE = "rental_motor_demo_gemini_api_key";

  function getAppConfig() {
    var cfg = Object.assign({}, window.APP_CONFIG || {});
    var demoKey = "";
    try {
      demoKey = sessionStorage.getItem(DEMO_GEMINI_KEY_STORAGE) || localStorage.getItem(DEMO_GEMINI_KEY_STORAGE) || "";
    } catch (e) { demoKey = ""; }
    if (demoKey && cfg.allowBrowserGeminiInDemo !== false) {
      cfg.geminiApiKey = demoKey;
      cfg.forceBrowserGemini = true;
    }
    return cfg;
  }

  function updateGeminiDemoStatus() {
    var input = $("demoGeminiApiKey");
    var status = $("geminiDemoStatus");
    if (!input && !status) return;
    var key = "";
    try { key = sessionStorage.getItem(DEMO_GEMINI_KEY_STORAGE) || localStorage.getItem(DEMO_GEMINI_KEY_STORAGE) || ""; } catch (e) { key = ""; }
    if (input && key) input.value = key;
    if (status) {
      status.textContent = key ? "Gemini demo key aktif untuk browser ini." : "Gemini demo key belum disimpan.";
      status.className = key ? "card-sub success-text" : "card-sub";
    }
  }

  function saveDemoGeminiApiKey() {
    var input = $("demoGeminiApiKey");
    if (!input) return;
    var key = input.value.trim();
    try {
      if (key) {
        sessionStorage.setItem(DEMO_GEMINI_KEY_STORAGE, key);
        localStorage.setItem(DEMO_GEMINI_KEY_STORAGE, key);
      } else {
        sessionStorage.removeItem(DEMO_GEMINI_KEY_STORAGE);
        localStorage.removeItem(DEMO_GEMINI_KEY_STORAGE);
      }
    } catch (e) {}
    updateGeminiDemoStatus();
    alert(key ? "Konfigurasi OCR disimpan." : "Gemini API Key demo dikosongkan.");
  }

  function setOcrButtonBusy(isBusy, text) {
    var btn = $("runOcrBtn");
    if (!btn) return;
    btn.disabled = !!isBusy;
    btn.textContent = text || (isBusy ? "Membaca Gemini OCR..." : "Gemini OCR & Isi Kolom");
  }

  function loadScriptOnce(src, globalName) {
    return new Promise(function (resolve, reject) {
      if (globalName && window[globalName]) return resolve(window[globalName]);
      var existing = document.querySelector('script[data-dynamic-src="' + src + '"]');
      if (existing) {
        existing.addEventListener("load", function () { resolve(globalName ? window[globalName] : true); });
        existing.addEventListener("error", reject);
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.setAttribute("data-dynamic-src", src);
      script.onload = function () { resolve(globalName ? window[globalName] : true); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function normalizeOcrText(text) {
    return String(text || "")
      .replace(/\r/g, "\n")
      .replace(/[|]/g, " ")
      .replace(/Ongkir\s*Gratis/gi, "Gratis Ongkir")
      .replace(/Rp\s*/gi, "Rp ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseRupiahNumber(raw) {
    if (!raw) return null;
    var s = String(raw).replace(/rp/ig, "").replace(/[^0-9.,-]/g, "");
    if (!s) return null;
    // Indonesian marketplace usually uses dot as thousand separator, comma as decimal.
    if (s.indexOf(",") >= 0 && s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(/,/g, ".");
    } else {
      s = s.replace(/[.,]/g, "");
    }
    var n = Math.round(Number(s));
    return isNaN(n) ? null : n;
  }

  function findCurrencyNearLabel(text, labels, opts) {
    opts = opts || {};
    var t = normalizeOcrText(text);
    var currency = "(?:Rp\\s*)?([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,}|[0-9]+)";
    for (var i = 0; i < labels.length; i++) {
      var label = labels[i];
      var re = new RegExp(label + "[^0-9Rr]{0,45}" + currency, "i");
      var m = t.match(re);
      if (m) return parseRupiahNumber(m[1]);
      var reBefore = new RegExp(currency + "[^A-Za-z]{0,18}" + label, "i");
      var b = t.match(reBefore);
      if (b) return parseRupiahNumber(b[1]);
    }
    if (opts.zeroWhenContains) {
      for (var z = 0; z < opts.zeroWhenContains.length; z++) {
        if (new RegExp(opts.zeroWhenContains[z], "i").test(t)) return 0;
      }
    }
    return null;
  }

  function allCurrencyNumbers(text) {
    var t = normalizeOcrText(text);
    var nums = [];
    var re = /Rp\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,}|[0-9]+)/gi;
    var m;
    while ((m = re.exec(t)) !== null) {
      var n = parseRupiahNumber(m[1]);
      if (n !== null && n > 0) nums.push(n);
    }
    // Fallback for OCR that drops Rp but still captures prices like 77.589.
    if (!nums.length) {
      var re2 = /\b([0-9]{1,3}(?:[.,][0-9]{3})+)\b/g;
      while ((m = re2.exec(t)) !== null) {
        var n2 = parseRupiahNumber(m[1]);
        if (n2 !== null && n2 > 1000) nums.push(n2);
      }
    }
    return nums;
  }

  function extractDeliveryEstimateFromText(text) {
    var t = normalizeOcrText(text);
    var estimateText = "";
    var days = 0;
    var patterns = [
      /(estimasi\s*(?:pengiriman|tiba|sampai)[^A-Za-z0-9]{0,20}[^.]{0,80})/i,
      /(dapatkan\s*tanggal[^.]{0,60})/i,
      /(tiba\s*(?:tanggal)?[^.]{0,60})/i,
      /(diterima[^.]{0,60})/i,
      /(sampai[^.]{0,60})/i,
      /([0-9]{1,2}\s*-\s*[0-9]{1,2}\s*(?:hari|Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Ags|Sep|Okt|Nov|Des)?)/i
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = t.match(patterns[i]);
      if (m) { estimateText = (m[1] || m[0] || "").trim(); break; }
    }
    var dayRange = t.match(/([0-9]{1,2})\s*-\s*([0-9]{1,2})\s*hari/i);
    if (dayRange) days = Math.max(Number(dayRange[1] || 0), Number(dayRange[2] || 0));
    var singleDay = !days && t.match(/([0-9]{1,2})\s*hari/i);
    if (singleDay) days = Number(singleDay[1] || 0);
    var dateRange = !days && t.match(/([0-9]{1,2})\s*-\s*([0-9]{1,2})\s*(Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Ags|Sep|Okt|Nov|Des)/i);
    if (dateRange) days = Math.max(0, Number(dateRange[2] || 0) - Number(dateRange[1] || 0));
    return { text: estimateText, days: days };
  }

  function extractCheckoutBreakdownFromText(text, fallbackSubtotal) {
    var t = normalizeOcrText(text);
    var subtotal = findCurrencyNearLabel(t, ["subtotal(?: barang)?", "total harga barang", "harga barang", "total barang", "total belanja", "produk"]);
    var shipping = findCurrencyNearLabel(t, ["ongkir", "ongkos kirim", "biaya pengiriman", "pengiriman"], { zeroWhenContains: ["gratis\\s*ongkir", "free\\s*shipping", "ongkir\\s*rp\\s*0"] });
    var insurance = findCurrencyNearLabel(t, ["asuransi(?: barang)?", "proteksi(?: barang)?", "perlindungan"]);
    var service = findCurrencyNearLabel(t, ["biaya layanan", "biaya jasa aplikasi", "biaya admin", "biaya penanganan", "biaya lainnya"]);
    var discount = findCurrencyNearLabel(t, ["diskon", "voucher", "potongan", "promo"]);
    var total = findCurrencyNearLabel(t, ["total sebelum co", "total sebelum checkout", "total pembayaran", "total pesanan", "total tagihan", "total"]);
    var nums = allCurrencyNumbers(t);
    if (subtotal === null && nums.length) subtotal = nums[0];
    if (shipping === null) shipping = /gratis\s*ongkir|free\s*shipping/i.test(t) ? 0 : 0;
    if (insurance === null) insurance = 0;
    if (service === null) service = 0;
    if (discount === null) discount = 0;
    if (subtotal === null) subtotal = Number(fallbackSubtotal || 0);
    if (total === null || total < subtotal) total = subtotal + shipping + insurance + service - discount;
    var delivery = extractDeliveryEstimateFromText(t);
    var insuranceSelected = Number(insurance || 0) > 0 && !/(tanpa\s*asuransi|tidak\s*pakai\s*asuransi|asuransi\s*tidak\s*dipilih|proteksi\s*tidak\s*dipilih)/i.test(t);
    return {
      subtotal_items: Math.max(0, Number(subtotal || 0)),
      shipping_cost: Math.max(0, Number(shipping || 0)),
      insurance_cost: insuranceSelected ? Math.max(0, Number(insurance || 0)) : 0,
      insurance_selected: insuranceSelected,
      delivery_estimate_text: delivery.text,
      delivery_estimate_days: delivery.days,
      service_fee: Math.max(0, Number(service || 0)),
      discount_amount: Math.max(0, Number(discount || 0)),
      total_before_checkout: Math.max(0, Number(total || 0)),
      raw_text: text || ""
    };
  }

  function applyCheckoutBreakdown(breakdown, rawText, sourceLabel) {
    if ($("checkoutSubtotal")) $("checkoutSubtotal").value = Number(breakdown.subtotal_items || 0);
    if ($("checkoutShipping")) $("checkoutShipping").value = Number(breakdown.shipping_cost || 0);
    var insuranceSelected = breakdown.insurance_selected !== undefined ? !!breakdown.insurance_selected : Number(breakdown.insurance_cost || 0) > 0;
    if ($("checkoutInsuranceEnabled")) $("checkoutInsuranceEnabled").value = insuranceSelected ? "yes" : "no";
    if ($("checkoutInsurance")) $("checkoutInsurance").value = insuranceSelected ? Number(breakdown.insurance_cost || 0) : 0;
    if ($("checkoutDeliveryEstimate")) $("checkoutDeliveryEstimate").value = breakdown.delivery_estimate_text || "";
    if ($("checkoutDeliveryDays")) $("checkoutDeliveryDays").value = Number(breakdown.delivery_estimate_days || 0);
    handleCheckoutInsuranceToggle();
    if ($("checkoutServiceFee")) $("checkoutServiceFee").value = Number(breakdown.service_fee || 0);
    if ($("checkoutDiscount")) $("checkoutDiscount").value = Number(breakdown.discount_amount || 0);
    if ($("checkoutOcrText")) {
      $("checkoutOcrText").value = (sourceLabel || "OCR") + " berhasil membaca draft breakdown:\n" +
        "Subtotal barang: " + formatRupiah(breakdown.subtotal_items) + "\n" +
        "Ongkir: " + formatRupiah(breakdown.shipping_cost) + "\n" +
        "Asuransi dipakai: " + (breakdown.insurance_selected ? "Ya" : "Tidak") + "\n" +
        "Asuransi barang: " + formatRupiah(breakdown.insurance_cost) + "\n" +
        "Estimasi pengiriman: " + (breakdown.delivery_estimate_text || "-") + "\n" +
        "Estimasi hari: " + (breakdown.delivery_estimate_days ? breakdown.delivery_estimate_days + " hari" : "-") + "\n" +
        "Biaya layanan/lainnya: " + formatRupiah(breakdown.service_fee) + "\n" +
        "Diskon/voucher: " + formatRupiah(breakdown.discount_amount) + "\n" +
        "Total sebelum CO: " + formatRupiah(breakdown.total_before_checkout) + "\n\n" +
        "Raw OCR:\n" + (rawText || "-") + "\n\n" +
        "Catatan: admin tetap wajib validasi angka sebelum dikirim ke owner.";
    }
    calculateCheckoutTotal();
  }

  function demoOcrTextFromRequest() {
    var subtotal = requestTotalEstimate(pendingOwnerRequestId);
    var items = getItemsForRequest(pendingOwnerRequestId);
    // Demo dibuat menyerupai SS mobile marketplace agar parser langsung mengisi kolom.
    var itemLine = items.map(function (item) { return item.sparepart_name + " x" + item.qty_requested; }).join(", ") || "Item sparepart";
    return "Shopee before checkout " + itemLine + " Subtotal Barang Rp " + subtotal.toLocaleString("id-ID") + " Gratis Ongkir Asuransi Barang Rp 0 tidak dipilih Estimasi Pengiriman tiba 2-3 hari Biaya Layanan Rp 2.000 Diskon Voucher Rp 0 Total Pembayaran Rp " + (subtotal + 2000).toLocaleString("id-ID");
  }

  function dataUrlToGeminiInlineData(dataUrl) {
    var parts = String(dataUrl || "").split(",");
    var header = parts[0] || "";
    var data = parts.slice(1).join(",");
    var mimeMatch = header.match(/data:([^;]+);base64/i);
    return {
      mime_type: mimeMatch ? mimeMatch[1] : "image/png",
      data: data
    };
  }

  function geminiCheckoutSchema() {
    return {
      type: "OBJECT",
      properties: {
        raw_text: { type: "STRING" },
        marketplace: { type: "STRING" },
        subtotal_items: { type: "NUMBER" },
        shipping_cost: { type: "NUMBER" },
        insurance_cost: { type: "NUMBER" },
        insurance_selected: { type: "BOOLEAN" },
        delivery_estimate_text: { type: "STRING" },
        delivery_estimate_days: { type: "NUMBER" },
        service_fee: { type: "NUMBER" },
        discount_amount: { type: "NUMBER" },
        total_before_checkout: { type: "NUMBER" },
        confidence: { type: "NUMBER" },
        notes: { type: "STRING" }
      },
      required: ["raw_text", "subtotal_items", "shipping_cost", "insurance_cost", "insurance_selected", "delivery_estimate_text", "delivery_estimate_days", "service_fee", "discount_amount", "total_before_checkout", "confidence"]
    };
  }

  function geminiCheckoutPrompt() {
    var marketplace = $("checkoutMarketplace") ? $("checkoutMarketplace").value : "Marketplace";
    var fallbackSubtotal = requestTotalEstimate(pendingOwnerRequestId);
    var items = getItemsForRequest(pendingOwnerRequestId).map(function (item) {
      return "- " + item.sparepart_name + " x " + item.qty_requested + " estimasi " + formatRupiah(Number(item.estimated_price || 0) * Number(item.qty_requested || 0));
    }).join("\n");
    return [
      "Kamu adalah OCR parser untuk screenshot mobile marketplace Indonesia seperti Shopee dan Tokopedia.",
      "Baca screenshot before checkout dan ekstrak breakdown biaya secara akurat.",
      "Marketplace yang dipilih admin: " + marketplace + ".",
      "Item request dari sistem:\n" + (items || "-"),
      "Fallback subtotal dari request sistem: " + fallbackSubtotal + ".",
      "Aturan output:",
      "1. Balas hanya JSON valid sesuai schema, tanpa markdown.",
      "2. Semua angka dalam Rupiah sebagai number integer, tanpa titik/koma/simbol Rp.",
      "3. subtotal_items = total harga barang/item sebelum ongkir/asuransi/biaya layanan.",
      "4. shipping_cost = ongkir/ongkos kirim. Jika tertulis gratis ongkir, isi 0.",
      "5. insurance_selected = true jika asuransi/proteksi/perlindungan barang dipilih/dipakai. false jika tidak dipakai/tidak dipilih/tidak terlihat.",
      "6. insurance_cost = biaya asuransi/proteksi/perlindungan barang. Jika tidak dipakai/tidak terlihat, isi 0.",
      "7. delivery_estimate_text = teks estimasi pengiriman yang terlihat, misalnya 'Tiba 2-3 hari' atau 'Dapatkan tanggal 21-24 Apr'. Jika tidak terlihat, isi string kosong.",
      "8. delivery_estimate_days = jumlah hari estimasi pengiriman. Jika terlihat 2-3 hari, isi 3. Jika terlihat tanggal 21-24 Apr, isi 3. Jika tidak yakin/tidak terlihat, isi 0.",
      "9. service_fee = biaya layanan/admin/penanganan/lainnya. Jika tidak terlihat, isi 0.",
      "10. discount_amount = potongan/voucher/diskon sebagai angka positif. Jika tidak ada, isi 0.",
      "11. total_before_checkout = total yang harus dibayar sebelum checkout/CO.",
      "12. raw_text = teks penting yang kamu baca dari screenshot, ringkas tapi cukup untuk audit admin.",
      "13. confidence = 0 sampai 1. Turunkan confidence jika gambar terpotong/blur/angka tidak jelas.",
      "14. notes = catatan singkat jika ada angka/estimasi pengiriman yang perlu dicek admin."
    ].join("\n");
  }

  function normalizeGeminiOcrPayload(payload) {
    var obj = payload || {};
    if (obj.breakdown) obj = Object.assign({}, obj.breakdown, { raw_text: obj.raw_text || obj.text || obj.breakdown.raw_text || "" });
    if (typeof obj === "string") {
      try { obj = JSON.parse(obj); } catch (e) { obj = { raw_text: obj }; }
    }
    var raw = obj.raw_text || obj.text || obj.raw || "";
    var breakdown = {
      subtotal_items: Number(obj.subtotal_items || 0),
      shipping_cost: Number(obj.shipping_cost || 0),
      insurance_cost: Number(obj.insurance_cost || 0),
      insurance_selected: obj.insurance_selected !== undefined ? !!obj.insurance_selected : Number(obj.insurance_cost || 0) > 0,
      delivery_estimate_text: obj.delivery_estimate_text || "",
      delivery_estimate_days: Number(obj.delivery_estimate_days || 0),
      service_fee: Number(obj.service_fee || 0),
      discount_amount: Number(obj.discount_amount || 0),
      total_before_checkout: Number(obj.total_before_checkout || 0),
      raw_text: raw,
      confidence: obj.confidence,
      notes: obj.notes || ""
    };
    if (!breakdown.total_before_checkout) {
      breakdown.total_before_checkout = breakdown.subtotal_items + breakdown.shipping_cost + (breakdown.insurance_selected ? breakdown.insurance_cost : 0) + breakdown.service_fee - breakdown.discount_amount;
    }
    return { raw_text: raw, breakdown: breakdown, provider: obj.provider || "gemini", confidence: obj.confidence, notes: obj.notes };
  }

  async function runGeminiProxyCheckoutOcr(config) {
    var endpoint = config.geminiProxyEndpoint || config.ocrEndpoint;
    var resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "gemini",
        marketplace: $("checkoutMarketplace") ? $("checkoutMarketplace").value : "",
        file_name: checkoutProofPreview.file_name,
        image_base64: checkoutProofPreview.preview_url,
        fallback_subtotal: requestTotalEstimate(pendingOwnerRequestId),
        request_items: getItemsForRequest(pendingOwnerRequestId).map(function (item) {
          return {
            name: item.sparepart_name,
            qty: Number(item.qty_requested || 0),
            estimated_price: Number(item.estimated_price || 0)
          };
        })
      })
    });
    if (!resp.ok) throw new Error("Gemini OCR endpoint gagal: " + resp.status);
    return normalizeGeminiOcrPayload(await resp.json());
  }

  async function runGeminiDirectCheckoutOcr(config) {
    if (!config.geminiApiKey) throw new Error("Gemini API key belum diisi. Pakai geminiProxyEndpoint untuk production.");
    var model = config.geminiModel || "gemini-2.5-flash";
    var inline = dataUrlToGeminiInlineData(checkoutProofPreview.preview_url);
    var url = (config.geminiApiBase || "https://generativelanguage.googleapis.com/v1beta") + "/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(config.geminiApiKey);
    var body = {
      contents: [{
        role: "user",
        parts: [
          { text: geminiCheckoutPrompt() },
          { inline_data: inline }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: geminiCheckoutSchema()
      }
    };
    var resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error("Gemini API gagal: " + resp.status);
    var data = await resp.json();
    var text = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    text = text.map(function (p) { return p.text || ""; }).join("\n").trim();
    var obj;
    try { obj = JSON.parse(text); } catch (e) { obj = { raw_text: text }; }
    return normalizeGeminiOcrPayload(obj);
  }

  async function runGeminiCheckoutOcr(config) {
    // Demo lokal: jika user isi Gemini API Key di dialog, pakai direct browser call dulu.
    // Catatan: ini hanya untuk demo/dev karena API key terlihat di browser.
    if (config.forceBrowserGemini && config.geminiApiKey) {
      return runGeminiDirectCheckoutOcr(config);
    }
    // Production recommended: Cloudflare/Vercel serverless proxy with GEMINI_API_KEY in environment.
    if (config.geminiProxyEndpoint || (config.ocrProvider === "gemini" && config.ocrEndpoint)) {
      return runGeminiProxyCheckoutOcr(config);
    }
    // Development only: direct browser API key from config.js. Do not use in production.
    if (config.geminiApiKey) {
      return runGeminiDirectCheckoutOcr(config);
    }
    throw new Error("Gemini OCR belum dikonfigurasi. Aktifkan backend /api/gemini-checkout-ocr dan environment GEMINI_API_KEY.");
  }

  async function runBackendCheckoutOcr(config) {
    var resp = await fetch(config.ocrEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: $("checkoutMarketplace") ? $("checkoutMarketplace").value : "",
        file_name: checkoutProofPreview.file_name,
        image_base64: checkoutProofPreview.preview_url,
        fallback_subtotal: requestTotalEstimate(pendingOwnerRequestId)
      })
    });
    if (!resp.ok) throw new Error("OCR endpoint gagal: " + resp.status);
    return resp.json();
  }

  async function runBrowserTesseractOcr(config) {
    var cdn = config.tesseractCdn || "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    await loadScriptOnce(cdn, "Tesseract");
    if (!window.Tesseract || !window.Tesseract.recognize) throw new Error("Tesseract.js tidak tersedia");
    var lang = config.ocrLanguage || "ind+eng";
    var result = await window.Tesseract.recognize(checkoutProofPreview.preview_url, lang);
    return { raw_text: result && result.data ? result.data.text : "" };
  }

  async function runCheckoutOcr() {
    if (!pendingOwnerRequestId) return;
    if (!checkoutProofPreview) {
      alert("Upload screenshot before checkout dulu, lalu jalankan OCR.");
      return;
    }
    var config = getAppConfig();
    if ((config.ocrProvider === "gemini" || config.geminiProxyEndpoint || config.geminiApiKey) && !config.geminiProxyEndpoint && !config.geminiApiKey) {
      alert("Gemini OCR belum aktif. Isi geminiProxyEndpoint dan GEMINI_API_KEY di backend/serverless.");
      return;
    }
    setOcrButtonBusy(true, "Gemini OCR membaca gambar...");
    try {
      var payload = null;
      var sourceLabel = "OCR";
      if (config.ocrProvider === "gemini" || config.geminiProxyEndpoint || config.geminiApiKey) {
        payload = await runGeminiCheckoutOcr(config);
        sourceLabel = "Gemini OCR" + (payload.confidence !== undefined ? " (confidence " + Math.round(Number(payload.confidence || 0) * 100) + "%)" : "");
      } else if (config.ocrEndpoint) {
        payload = await runBackendCheckoutOcr(config);
        sourceLabel = "OCR Backend";
      } else if (config.enableBrowserOcr) {
        payload = await runBrowserTesseractOcr(config);
        sourceLabel = "OCR Browser";
      } else {
        if (config.production) throw new Error("OCR production belum dikonfigurasi.");
        payload = { raw_text: demoOcrTextFromRequest() };
        sourceLabel = "OCR Fallback";
      }

      var fallbackSubtotal = requestTotalEstimate(pendingOwnerRequestId);
      var breakdown = payload.breakdown || extractCheckoutBreakdownFromText(payload.raw_text || payload.text || "", fallbackSubtotal);
      applyCheckoutBreakdown(breakdown, payload.raw_text || payload.text || "", sourceLabel);
      if ($("checkoutNote") && !$("checkoutNote").value) {
        $("checkoutNote").value = "Breakdown otomatis terbaca dari SS marketplace dan sudah siap divalidasi admin sebelum dikirim ke owner.";
      }
    } catch (err) {
      console.error(err);
      if (config.production) {
        alert("OCR belum berhasil membaca otomatis. Silakan cek koneksi backend Gemini atau isi breakdown manual dari screenshot.");
        return;
      }
      alert("OCR belum berhasil membaca otomatis. Sistem memakai fallback parser, lalu admin bisa koreksi manual.");
      var fallback = extractCheckoutBreakdownFromText(demoOcrTextFromRequest(), requestTotalEstimate(pendingOwnerRequestId));
      applyCheckoutBreakdown(fallback, demoOcrTextFromRequest(), "OCR Fallback");
    } finally {
      setOcrButtonBusy(false, "Gemini OCR & Isi Kolom");
    }
  }

  function submitOwnerApprovalWithProof() {
    if (!pendingOwnerRequestId) return;
    var r = state.part_requests.find(function (x) { return x.id === pendingOwnerRequestId; });
    if (!r) return;
    if (!checkoutProofPreview) {
      if (!confirm("Belum ada upload screenshot before checkout. Tetap ajukan ke owner tanpa SS?")) return;
    }
    var subtotal = checkoutNumber("checkoutSubtotal");
    var shipping = checkoutNumber("checkoutShipping");
    var insuranceSelected = isCheckoutInsuranceSelected();
    var insurance = insuranceSelected ? checkoutNumber("checkoutInsurance") : 0;
    var service = checkoutNumber("checkoutServiceFee");
    var discount = checkoutNumber("checkoutDiscount");
    var total = subtotal + shipping + insurance + service - discount;
    var breakdown = {
      subtotal_items: subtotal,
      shipping_cost: shipping,
      insurance_selected: insuranceSelected,
      insurance_cost: insurance,
      delivery_estimate_text: ($("checkoutDeliveryEstimate") ? $("checkoutDeliveryEstimate").value : "") || "",
      delivery_estimate_days: Number(($("checkoutDeliveryDays") ? $("checkoutDeliveryDays").value : 0) || 0),
      service_fee: service,
      discount_amount: discount,
      total_before_checkout: total
    };
    r.status = "waiting_owner_approval";
    r.admin_owner_submit_by = currentUserName();
    r.admin_owner_submit_at = todayIso();
    r.updated_at = todayIso();
    var existing = state.owner_approvals.find(function (a) { return a.request_id === r.id && ["waiting_owner_approval", "revision_needed", "owner_rejected"].indexOf(a.status) >= 0; });
    if (!existing) {
      existing = {
        id: uid("approval"),
        approval_code: seq("APR", state.owner_approvals, "approval_code"),
        request_id: r.id,
        requested_by_admin: currentUserName(),
        status: "waiting_owner_approval",
        owner_note: "",
        created_at: todayIso(),
        approved_at: null
      };
      state.owner_approvals.push(existing);
    }
    existing.requested_by_admin = currentUserName();
    existing.status = "waiting_owner_approval";
    existing.total_estimated_amount = total;
    existing.marketplace = $("checkoutMarketplace").value || "";
    existing.checkout_breakdown = breakdown;
    existing.checkout_screenshot = checkoutProofPreview;
    existing.admin_checkout_note = $("checkoutNote").value || "";
    existing.ocr_text = $("checkoutOcrText").value || "";
    existing.ocr_status = existing.ocr_text ? "ocr_draft" : "manual";
    existing.created_at = todayIso();
    existing.approved_at = null;
    save();
    if ($("checkoutDialog")) $("checkoutDialog").close();
    pendingOwnerRequestId = null;
    checkoutProofPreview = null;
    renderAll();
    alert("Pengajuan owner berhasil dibuat lengkap dengan breakdown before checkout.");
  }

  function renderReceiveProofPreviews() {
    if ($("receiveGoodsPreview")) $("receiveGoodsPreview").innerHTML = renderMediaGallery(receiveGoodsMedia, "Preview Barang Diterima");
    if ($("receiveOrderPreview")) $("receiveOrderPreview").innerHTML = receiveOrderScreenshot ? renderMediaGallery([receiveOrderScreenshot], "Preview SS Pesanan") : "";
  }

  function handleReceiveGoodsFiles() {
    var files = Array.prototype.slice.call($("receiveGoodsFile").files || []);
    receiveGoodsMedia = [];
    if (!files.length) { renderReceiveProofPreviews(); return; }
    var pending = files.length;
    files.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function (ev) {
        receiveGoodsMedia.push({ id: uid("received_goods"), media_type: file.type.indexOf("video/") === 0 ? "video" : "photo", file_name: file.name, file_size: file.size, preview_url: ev.target.result, file_url: "", note: "Bukti foto/video barang orderan tiba", created_at: todayIso() });
        pending -= 1;
        if (pending <= 0) renderReceiveProofPreviews();
      };
      reader.readAsDataURL(file);
    });
  }

  function handleReceiveOrderFile() {
    var file = ($("receiveOrderFile").files || [])[0];
    if (!file) { receiveOrderScreenshot = null; renderReceiveProofPreviews(); return; }
    var reader = new FileReader();
    reader.onload = function (ev) {
      receiveOrderScreenshot = { id: uid("received_order"), media_type: "photo", file_name: file.name, file_size: file.size, preview_url: ev.target.result, file_url: "", note: "SS halaman pesanan marketplace", created_at: todayIso() };
      renderReceiveProofPreviews();
    };
    reader.readAsDataURL(file);
  }

  function openReceiveDialog(r) {
    pendingReceiveRequestId = r.id;
    var a = latestApprovalForRequest(r.id);
    if (!a) {
      a = { id: uid("approval"), approval_code: seq("APR", state.owner_approvals, "approval_code"), request_id: r.id, status: "owner_approved", created_at: todayIso() };
      state.owner_approvals.push(a);
    }
    receiveGoodsMedia = (a.received_goods_media || []).slice();
    receiveOrderScreenshot = a.received_order_screenshot || null;
    if ($("receiveDialogTitle")) $("receiveDialogTitle").textContent = "Bukti Barang Tiba - " + (r.request_code || "-");
    var expectedHtml = getItemsForRequest(r.id).map(function (item) {
      return '<div class="mini-row"><b>' + esc(item.sparepart_name) + '</b><span>Qty order ' + esc(item.qty_requested) + '</span></div>';
    }).join("") || '<div class="muted">Tidak ada item request.</div>';
    if ($("receiveExpectedItems")) $("receiveExpectedItems").innerHTML = expectedHtml;
    if ($("receiveOrderNumber")) $("receiveOrderNumber").value = a.received_order_number || "";
    if ($("receiveMatchStatus")) $("receiveMatchStatus").value = a.received_match_status || "partial";
    if ($("receiveMatchSummary")) $("receiveMatchSummary").value = a.received_match_summary || "";
    if ($("receiveAdminNote")) $("receiveAdminNote").value = a.received_admin_note || "";
    if ($("receiveOcrText")) $("receiveOcrText").value = a.received_ocr_text || "";
    renderReceiveProofPreviews();
    if ($("receiveDialog")) $("receiveDialog").showModal();
  }

  function receiveOcrSchema() {
    return {
      type: "OBJECT",
      properties: {
        order_number: { type: "STRING" },
        marketplace: { type: "STRING" },
        received_items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { name: { type: "STRING" }, qty: { type: "NUMBER" }, variant: { type: "STRING" }, notes: { type: "STRING" } },
            required: ["name", "qty"]
          }
        },
        raw_text: { type: "STRING" },
        confidence: { type: "NUMBER" },
        notes: { type: "STRING" }
      },
      required: ["order_number", "received_items", "raw_text", "confidence"]
    };
  }

  function receiveOcrPrompt(r) {
    var items = getItemsForRequest(r.id).map(function (item) { return "- " + item.sparepart_name + " x " + item.qty_requested; }).join("\n");
    return [
      "Kamu adalah OCR parser untuk bukti pesanan barang sparepart dari Shopee/Tokopedia dan foto barang diterima.",
      "Tugas utama: baca nomor pesanan, nama barang, variasi, dan qty yang terlihat. Cocokkan secara semantik dengan daftar item request dari sistem.",
      "Item request sistem:\n" + (items || "-"),
      "Aturan output:",
      "1. Balas hanya JSON valid sesuai schema, tanpa markdown.",
      "2. order_number = nomor pesanan/order number/invoice/trx yang terlihat di screenshot pesanan. Jika tidak terlihat isi string kosong.",
      "3. received_items = daftar barang yang terbaca dari screenshot/foto beserta qty. Jika qty tidak jelas isi 1 dan beri notes.",
      "4. raw_text = teks penting yang terbaca untuk audit admin.",
      "5. confidence = 0 sampai 1. Turunkan jika gambar blur/terpotong atau item sulit dicocokkan.",
      "6. notes = catatan singkat jika perlu dicek manual."
    ].join("\n");
  }

  function demoReceiveOcrPayload(r) {
    var items = getItemsForRequest(r.id).map(function (item) { return { name: item.sparepart_name, qty: Number(item.qty_requested || 0), variant: "", notes: "Demo terbaca dari item request" }; });
    return { order_number: "TEST-ORDER-" + todayYmd() + "-001", marketplace: "Shopee/Tokopedia", received_items: items, raw_text: "Fallback OCR: nomor pesanan TEST-ORDER-" + todayYmd() + "-001. Barang terbaca: " + items.map(function (i) { return i.name + " x" + i.qty; }).join(", "), confidence: 0.92, notes: "Fallback mode. Admin tetap validasi foto barang fisik." };
  }

  function compareReceivedItems(payload, r) {
    payload = payload || {};
    var received = payload.received_items || [];
    var lines = [];
    var allMatch = true;
    var partial = false;
    getItemsForRequest(r.id).forEach(function (item) {
      var expectedName = String(item.sparepart_name || "").toLowerCase();
      var expectedQty = Number(item.qty_requested || 0);
      var found = received.find(function (it) {
        var n = String(it.name || "").toLowerCase();
        return n && (expectedName.indexOf(n) >= 0 || n.indexOf(expectedName) >= 0 || expectedName.split(/\s+/).some(function (w) { return w.length > 3 && n.indexOf(w) >= 0; }));
      });
      if (found && Number(found.qty || 0) >= expectedQty) {
        lines.push("COCOK: " + item.sparepart_name + " order " + expectedQty + ", terbaca " + Number(found.qty || 0) + " (" + (found.name || "-") + ")");
      } else if (found) {
        allMatch = false; partial = true;
        lines.push("QTY KURANG/CEK: " + item.sparepart_name + " order " + expectedQty + ", terbaca " + Number(found.qty || 0) + " (" + (found.name || "-") + ")");
      } else {
        allMatch = false;
        lines.push("BELUM TERBACA: " + item.sparepart_name + " order " + expectedQty + ". Perlu cek manual dari foto/SS.");
      }
    });
    var status = allMatch ? "match" : (partial ? "partial" : "mismatch");
    return { status: status, summary: lines.join("\n") };
  }

  async function runReceiveOcr() {
    if (!pendingReceiveRequestId) return;
    var r = state.part_requests.find(function (x) { return x.id === pendingReceiveRequestId; });
    if (!r) return;
    if (!receiveOrderScreenshot && !receiveGoodsMedia.length) {
      alert("Upload minimal SS halaman pesanan atau foto barang diterima dulu.");
      return;
    }
    var btn = $("runReceiveOcrBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Gemini membaca pesanan..."; }
    try {
      var config = getAppConfig();
      var payload;
      if (config.geminiReceiveProxyEndpoint) {
        var respProxy = await fetch(config.geminiReceiveProxyEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_image_base64: receiveOrderScreenshot ? receiveOrderScreenshot.preview_url : "",
            goods_image_base64_list: receiveGoodsMedia.filter(function (m) { return m.media_type === "photo"; }).slice(0, 3).map(function (m) { return m.preview_url; }),
            expected_items: getItemsForRequest(r.id).map(function (item) { return { name: item.sparepart_name, qty: Number(item.qty_requested || 0) }; })
          })
        });
        if (!respProxy.ok) throw new Error("Gemini receive OCR endpoint gagal: " + respProxy.status);
        payload = await respProxy.json();
      } else if ((config.forceBrowserGemini && config.geminiApiKey) || config.geminiApiKey) {
        var model = config.geminiModel || "gemini-2.5-flash";
        var url = (config.geminiApiBase || "https://generativelanguage.googleapis.com/v1beta") + "/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(config.geminiApiKey);
        var parts = [{ text: receiveOcrPrompt(r) }];
        if (receiveOrderScreenshot && receiveOrderScreenshot.preview_url) parts.push({ inline_data: dataUrlToGeminiInlineData(receiveOrderScreenshot.preview_url) });
        receiveGoodsMedia.slice(0, 3).forEach(function (m) { if (m.preview_url && m.media_type === "photo") parts.push({ inline_data: dataUrlToGeminiInlineData(m.preview_url) }); });
        var resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: parts }], generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: receiveOcrSchema() } }) });
        if (!resp.ok) throw new Error("Gemini API gagal: " + resp.status);
        var data = await resp.json();
        var text = ((((data.candidates || [])[0] || {}).content || {}).parts || []).map(function (p) { return p.text || ""; }).join("\n").trim();
        try { payload = JSON.parse(text); } catch (e) { payload = { raw_text: text, received_items: [] }; }
      } else {
        if (config.production) throw new Error("Gemini receive OCR production belum dikonfigurasi.");
        payload = demoReceiveOcrPayload(r);
      }
      var cmp = compareReceivedItems(payload, r);
      if ($("receiveOrderNumber")) $("receiveOrderNumber").value = payload.order_number || "";
      if ($("receiveMatchStatus")) $("receiveMatchStatus").value = cmp.status;
      if ($("receiveMatchSummary")) $("receiveMatchSummary").value = cmp.summary;
      if ($("receiveOcrText")) $("receiveOcrText").value = "Gemini OCR Pesanan" + (payload.confidence !== undefined ? " (confidence " + Math.round(Number(payload.confidence || 0) * 100) + "%)" : "") + "\nNo pesanan: " + (payload.order_number || "-") + "\n\nBarang terbaca:\n" + (payload.received_items || []).map(function (i) { return "- " + (i.name || "-") + " x" + (i.qty || 0) + (i.variant ? " | " + i.variant : ""); }).join("\n") + "\n\nHasil cocokkan:\n" + cmp.summary + "\n\nRaw OCR:\n" + (payload.raw_text || "-") + "\n\nCatatan: " + (payload.notes || "Admin tetap validasi sebelum stok masuk gudang.");
      if ($("receiveAdminNote") && !$("receiveAdminNote").value) $("receiveAdminNote").value = cmp.status === "match" ? "Barang diterima sesuai order dan qty, siap masuk gudang." : "Perlu cek manual karena OCR tidak sepenuhnya cocok.";
    } catch (err) {
      console.error(err);
      alert("OCR pesanan belum berhasil. Sistem memakai pembanding demo, silakan koreksi manual.");
      var fallback = demoReceiveOcrPayload(r);
      var cmp2 = compareReceivedItems(fallback, r);
      if ($("receiveOrderNumber")) $("receiveOrderNumber").value = fallback.order_number;
      if ($("receiveMatchStatus")) $("receiveMatchStatus").value = cmp2.status;
      if ($("receiveMatchSummary")) $("receiveMatchSummary").value = cmp2.summary;
      if ($("receiveOcrText")) $("receiveOcrText").value = fallback.raw_text + "\n\n" + cmp2.summary;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Gemini OCR Pesanan & Cocokkan Qty"; }
    }
  }

  function submitReceiveProof() {
    if (!pendingReceiveRequestId) return;
    var r = state.part_requests.find(function (x) { return x.id === pendingReceiveRequestId; });
    if (!r) return;
    var a = latestApprovalForRequest(r.id);
    if (!a) return;
    a.received_goods_media = receiveGoodsMedia.slice();
    a.received_order_screenshot = receiveOrderScreenshot;
    a.received_order_number = ($("receiveOrderNumber") ? $("receiveOrderNumber").value : "") || "";
    a.received_match_status = ($("receiveMatchStatus") ? $("receiveMatchStatus").value : "partial") || "partial";
    a.received_match_summary = ($("receiveMatchSummary") ? $("receiveMatchSummary").value : "") || "";
    a.received_admin_note = ($("receiveAdminNote") ? $("receiveAdminNote").value : "") || "";
    a.received_ocr_text = ($("receiveOcrText") ? $("receiveOcrText").value : "") || "";
    a.received_by_admin = currentUserName();
    a.received_at = todayIso();
    if (a.received_match_status !== "match" && !confirm("Status penerimaan belum cocok penuh. Tetap terima gudang dan update stok?")) return;
    r.admin_received_by = currentUserName();
    receiveWarehouse(r);
    save();
    if ($("receiveDialog")) $("receiveDialog").close();
    pendingReceiveRequestId = null;
    receiveGoodsMedia = [];
    receiveOrderScreenshot = null;
    renderAll();
    alert("Bukti penerimaan tersimpan, stok masuk sudah diupdate, dan request masuk status Diterima Gudang.");
  }

  function handleAdminAction(action, id) {
    var r = state.part_requests.find(function (x) { return x.id === id; });
    if (!r) return;
    if (action === "owner") {
      openCheckoutDialog(r);
      return;
    }
    r.updated_at = todayIso();
    if (action === "review") {
      r.status = "reviewed_by_admin";
      r.admin_review_by = currentUserName();
      r.admin_review_at = todayIso();
      r.admin_note = prompt("Catatan review admin (opsional):", r.admin_note || "") || r.admin_note || "";
    }
    if (action === "edit_links") {
      editPurchaseLinks(r);
    }
    if (action === "ready") {
      if (r.stock_out_code) {
        r.status = "stock_out_generated";
        alert("Stock keluar sudah pernah digenerate: " + r.stock_out_code + "\nTidak perlu generate ulang dan stok tidak dikurangi dua kali.");
      } else {
        if (needOwnerApproval(r.id)) {
          if (!confirm("Ada stok kosong/kurang. Biasanya harus ajukan ke owner dulu. Tetap set siap stock keluar?")) return;
        }
        r.status = "stock_out_ready";
        r.admin_ready_by = currentUserName();
        r.admin_ready_at = todayIso();
      }
    }
    if (action === "purchase") { r.status = "purchase_pending"; r.admin_purchase_by = currentUserName(); }
    if (action === "received") { openReceiveDialog(r); return; }
    if (action === "stockout") generateStockOutFromRequest(r);
    if (action === "complete") {
      r.status = "completed";
      r.completed_by_admin = currentUserName();
      var report = state.damage_reports.find(function (d) { return d.id === r.report_id; });
      if (report) { report.status = "completed"; report.completed_at = todayIso(); }
    }
    if (action === "revision") {
      r.previous_status = r.status;
      r.status = "revision_needed";
      r.admin_note = prompt("Catatan revisi untuk mekanik/admin:", r.admin_note || "") || "Butuh revisi data.";
    }
    if (action === "resubmit") {
      r.status = r.stock_out_code ? "stock_out_generated" : (r.previous_status && r.previous_status !== "revision_needed" ? r.previous_status : "reviewed_by_admin");
    }
    if (action === "reopen") r.status = r.stock_out_code ? "stock_out_generated" : "reviewed_by_admin";
    if (action === "cancel") {
      if (r.stock_out_code && !confirm("Request ini sudah punya stock keluar " + r.stock_out_code + ". Membatalkan tidak otomatis mengembalikan stok jika stock keluar sudah dibuat. Lanjut batalkan?")) return;
      var reason = prompt("Alasan pembatalan:", r.cancel_note || "");
      if (reason === null) return;
      r.previous_status = r.status;
      r.cancel_note = reason || "Dibatalkan admin.";
      r.status = "cancelled";
    }
    if (action === "restore") {
      r.status = r.stock_out_code ? "stock_out_generated" : (r.previous_status && r.previous_status !== "cancelled" ? r.previous_status : "submitted_by_mechanic");
      r.cancel_note = "";
    }
    save();
    renderAll();
  }


  function receiveWarehouse(r) {
    r.status = "received_by_warehouse";
    getItemsForRequest(r.id).forEach(function (item) {
      var p = state.spareparts.find(function (part) { return part.id === item.sparepart_id; });
      var current = p ? Number(p.stock || 0) : 0;
      var needQty = Math.max(0, Number(item.qty_requested || 0) - current);
      if (p && needQty > 0) {
        p.stock = Number(p.stock || 0) + needQty;
        state.stock_movements.push({
          id: uid("mov"),
          movement_code: seq("SM", state.stock_movements, "movement_code"),
          movement_type: "stock_in",
          sparepart_id: p.id,
          sparepart_code: p.sparepart_code,
          sparepart_name: p.name,
          qty: needQty,
          motor_id: r.motor_id,
          request_id: r.id,
          status: "verified",
          notes: "Stock masuk dari pembelian owner approved untuk " + r.request_code,
          created_at: todayIso()
        });
      }
      if (p) {
        item.stock_status = Number(p.stock || 0) >= Number(item.qty_requested || 0) ? "stock_available" : "stock_empty";
        item.current_stock = Number(p.stock || 0);
        item.status = "received_by_warehouse";
      }
    });
  }

  function generateStockOutFromRequest(r) {
    if (r.stock_out_code) {
      r.status = "stock_out_generated";
      alert("Stock keluar sudah pernah dibuat: " + r.stock_out_code + "\nStok tidak dikurangi ulang.");
      return;
    }
    var existingMovement = state.stock_movements.find(function (m) { return m.request_id === r.id && m.movement_type === "stock_out"; });
    if (existingMovement) {
      r.stock_out_code = existingMovement.movement_code;
      r.status = "stock_out_generated";
      alert("Stock keluar sudah ditemukan: " + r.stock_out_code + "\nStok tidak dikurangi ulang.");
      return;
    }
    var items = getItemsForRequest(r.id);
    var shortage = [];
    items.forEach(function (item) {
      var p = state.spareparts.find(function (part) { return part.id === item.sparepart_id; });
      if (!p) shortage.push(item.sparepart_name + " belum ada master");
      else if (Number(p.stock || 0) < Number(item.qty_requested || 0)) shortage.push(p.name + " stok " + p.stock + ", butuh " + item.qty_requested);
    });
    if (shortage.length) {
      alert("Stock keluar tidak bisa dibuat karena stok kurang:\n- " + shortage.join("\n- "));
      return;
    }
    var skCode = seq("SK", state.stock_movements, "movement_code");
    items.forEach(function (item) {
      var p = state.spareparts.find(function (part) { return part.id === item.sparepart_id; });
      if (!p) return;
      p.stock = Number(p.stock || 0) - Number(item.qty_requested || 0);
      item.qty_approved = item.qty_requested;
      item.status = "stock_out_generated";
      item.current_stock = Number(p.stock || 0);
      state.stock_movements.push({
        id: uid("mov"),
        movement_code: skCode,
        movement_type: "stock_out",
        sparepart_id: p.id,
        sparepart_code: p.sparepart_code,
        sparepart_name: p.name,
        qty: Number(item.qty_requested || 0),
        motor_id: r.motor_id,
        request_id: r.id,
        status: "verified",
        notes: "Stock keluar dari request " + r.request_code,
        created_at: todayIso()
      });
    });
    r.stock_out_code = skCode;
    var motor = state.motors.find(function (m) { return m.id === r.motor_id; });
    if (motor) motor.status = "maintenance";
    r.admin_stock_out_by = currentUserName();
    r.admin_stock_out_at = todayIso();
    r.status = "stock_out_generated";
    alert("Stock keluar berhasil dibuat: " + skCode);
  }

  function renderOwner() {
    var q = ($("ownerSearch").value || "").toLowerCase();
    var rows = state.owner_approvals.slice().reverse().filter(function (a) {
      var r = state.part_requests.find(function (x) { return x.id === a.request_id; }) || {};
      var motor = state.motors.find(function (m) { return m.id === r.motor_id; }) || {};
      var items = getItemsForRequest(r.id).map(function (i) { return i.sparepart_name; }).join(" ");
      return (motor.motor_code + " " + items + " " + a.status).toLowerCase().indexOf(q) >= 0;
    });
    if (!rows.length) {
      $("ownerApprovalList").innerHTML = '<div class="muted">Belum ada approval owner.</div>';
      return;
    }
    $("ownerApprovalList").innerHTML = rows.map(function (a) {
      var r = state.part_requests.find(function (x) { return x.id === a.request_id; }) || {};
      var motor = state.motors.find(function (m) { return m.id === r.motor_id; }) || {};
      var report = state.damage_reports.find(function (d) { return d.id === r.report_id; }) || {};
      var items = getItemsForRequest(r.id);
      var itemHtml = items.map(function (item) {
        return '<div><span class="tag yellow">' + esc(item.sparepart_name) + ' · Qty ' + esc(item.qty_requested) + ' · Stok saat request ' + esc(item.stock_snapshot) + '</span> ' + (item.recommended_purchase_link ? '<a target="_blank" href="' + esc(item.recommended_purchase_link) + '">Link beli</a>' : '') + '</div>';
      }).join("");
      var actions = "";
      if (a.status === "waiting_owner_approval") {
        actions = '<div class="card-actions"><button class="secondary" data-owner-action="approve" data-id="' + esc(a.id) + '">Approve Order</button><button class="ghost" data-owner-action="revise" data-id="' + esc(a.id) + '">Minta Revisi</button><button class="danger" data-owner-action="reject" data-id="' + esc(a.id) + '">Reject</button></div>';
      }
      var ownerDetailHtml =
        (report.drive_folder_path ? '<div class="drive-path">Folder GDrive: ' + esc(report.drive_folder_path) + '</div>' : "") +
        ((report.media_items && report.media_items.length) ? renderMediaGallery(report.media_items, "Preview Foto/Video Kerusakan") : "") +
        checkoutBreakdownHtml(a) +
        receiveProofHtml(a) +
        (a.owner_note ? '<div class="card-sub">Catatan owner: ' + esc(a.owner_note) + '</div>' : "") +
        (a.owner_recommended_link ? '<div class="card-sub">Rekomendasi link owner: <a target="_blank" href="' + esc(a.owner_recommended_link) + '">' + esc(a.owner_recommended_link) + '</a></div>' : "");
      return '<div class="card"><div class="card-head"><div>' +
        '<div class="card-title">' + esc(a.approval_code) + ' · Motor ' + esc(motor.motor_code || "-") + '</div>' +
        '<div class="card-sub">' + esc(report.damage_category || "-") + ' — ' + esc(report.damage_notes || "-") + '</div></div>' +
        '<div>' + tagForStatus(a.status) + '</div></div>' +
        itemHtml +
        '<div class="card-sub">Total before checkout: <b>' + formatRupiah(a.total_estimated_amount || 0) + '</b></div>' +
        collapsibleDetailHtml('Detail request, bukti checkout, dan penerimaan', ownerDetailHtml, 'klik untuk buka', false) +
        actions + '</div>';
    }).join("");
  }

  function handleOwnerAction(action, approvalId) {
    var a = state.owner_approvals.find(function (x) { return x.id === approvalId; });
    if (!a) return;
    var r = state.part_requests.find(function (x) { return x.id === a.request_id; });
    var notePrompt = action === "approve" ? "Catatan approval owner (opsional):" : (action === "revise" ? "Catatan revisi owner:" : "Alasan reject wajib diisi:");
    var note = prompt(notePrompt, "") || "";
    if (action === "revise") {
      var recommended = prompt("Link rekomendasi owner (opsional, bisa dikosongkan):", a.owner_recommended_link || "") || "";
      a.owner_recommended_link = recommended.trim();
      if (recommended.trim() && r) {
        getItemsForRequest(r.id).forEach(function (item) { item.owner_recommended_link = recommended.trim(); });
      }
    }
    if (action === "reject" && !note.trim()) return alert("Alasan reject wajib diisi.");
    a.owner_note = note;
    a.approved_at = todayIso();
    if (action === "approve") {
      a.status = "owner_approved";
      if (r) r.status = "owner_approved";
    } else if (action === "revise") {
      a.status = "revision_needed";
      if (r) { r.status = "revision_needed"; r.admin_note = note || "Owner meminta revisi."; }
    } else {
      a.status = "owner_rejected";
      if (r) { r.status = "owner_rejected"; r.admin_note = note; }
    }
    save();
    renderAll();
  }

  function setMasterTab(tab) {
    var isMotor = tab === "motor";
    var spTab = $("masterSparepartTab");
    var motorTab = $("masterMotorTab");
    if (spTab) spTab.classList.toggle("active", !isMotor);
    if (motorTab) motorTab.classList.toggle("active", isMotor);
    document.querySelectorAll("[data-master-tab]").forEach(function (btn) {
      var active = btn.getAttribute("data-master-tab") === tab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (tab === "sparepart") renderSpareparts();
    if (tab === "motor") renderMotors();
  }

  function renderSpareparts() {
    var q = ($("sparepartSearch").value || "").toLowerCase();
    var rows = state.spareparts.filter(function (p) {
      return (p.name + " " + p.sparepart_code + " " + p.room + " " + p.rack).toLowerCase().indexOf(q) >= 0;
    });
    var html = '<table class="master-table"><thead><tr><th>Barcode</th><th>Nama</th><th>Stok</th><th>Lokasi</th><th>Link</th><th>Aksi</th></tr></thead><tbody>';
    rows.forEach(function (p) {
      var stockCls = Number(p.stock) <= 0 ? "red" : (Number(p.stock) <= Number(p.minimum_stock) ? "yellow" : "green");
      html += '<tr>' +
        '<td data-label="Barcode"><div class="barcode-box">' + code39Svg(p.sparepart_code, 190, 70) + '</div><br><small>' + esc(p.sparepart_code) + '</small></td>' +
        '<td data-label="Nama"><b>' + esc(p.name) + '</b><br><small>' + esc(p.unit) + '</small></td>' +
        '<td data-label="Stok"><span class="tag ' + stockCls + '">' + esc(p.stock) + '</span><br><small>Min: ' + esc(p.minimum_stock) + '</small></td>' +
        '<td data-label="Lokasi">' + esc(p.room || "-") + '<br><small>' + esc(p.rack || "-") + '</small></td>' +
        '<td data-label="Link">' + (p.default_purchase_link ? '<a target="_blank" href="' + esc(p.default_purchase_link) + '">Shopee</a>' : '<span class="muted">-</span>') + '</td>' +
        '<td data-label="Aksi"><button class="ghost" data-edit-part="' + esc(p.id) + '">Edit</button> <button class="secondary" data-print-part="' + esc(p.id) + '">Print Label</button></td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    $("sparepartList").innerHTML = rows.length ? html : '<div class="muted">Belum ada sparepart.</div>';
  }

  function updateSparepartCodePreview() {
    if (!$("sparepartCodePreview")) return;
    var editId = $("sparepartEditId").value;
    var p = state.spareparts.find(function (x) { return x.id === editId; });
    $("sparepartCodePreview").textContent = p ? "Edit kode: " + p.sparepart_code : "Kode baru: " + nextSparepartCode();
  }

  function editSparepart(id) {
    var p = state.spareparts.find(function (x) { return x.id === id; });
    if (!p) return;
    $("sparepartEditId").value = p.id;
    $("sparepartName").value = p.name;
    $("sparepartUnit").value = p.unit;
    $("sparepartStock").value = p.stock;
    $("sparepartMinStock").value = p.minimum_stock;
    $("sparepartRoom").value = p.room || "";
    $("sparepartRack").value = p.rack || "";
    $("sparepartLink").value = p.default_purchase_link || "";
    updateSparepartCodePreview();
    setPage("spareparts");
    setMasterTab("sparepart");
  }

  function printPartLabel(id) {
    var p = state.spareparts.find(function (x) { return x.id === id; });
    if (!p) return;
    var w = window.open("", "_blank", "width=480,height=640");
    w.document.write('<html><head><title>Label ' + esc(p.sparepart_code) + '</title><style>body{font-family:Arial;padding:20px}.label{border:1px solid #111;padding:14px;width:340px}.name{font-size:18px;font-weight:bold}.meta{margin:6px 0;font-size:13px}</style></head><body>');
    w.document.write('<div class="label"><div class="name">' + esc(p.name) + '</div><div class="meta">Barcode: ' + esc(p.sparepart_code) + '</div><div class="meta">Ruangan: ' + esc(p.room || "-") + '</div><div class="meta">Rak/Box: ' + esc(p.rack || "-") + '</div>' + code39Svg(p.sparepart_code, 300, 90) + '</div>');
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  }

  function saveSparepart(e) {
    e.preventDefault();
    var editId = $("sparepartEditId").value;
    var data = {
      name: $("sparepartName").value.trim(),
      unit: $("sparepartUnit").value.trim() || "pcs",
      stock: Number($("sparepartStock").value || 0),
      minimum_stock: Number($("sparepartMinStock").value || 0),
      room: $("sparepartRoom").value.trim(),
      rack: $("sparepartRack").value.trim(),
      default_purchase_link: $("sparepartLink").value.trim()
    };
    if (!data.name) return alert("Nama sparepart wajib diisi.");
    if (editId) {
      var p = state.spareparts.find(function (x) { return x.id === editId; });
      var oldStock = Number(p.stock || 0);
      Object.assign(p, data);
      if (oldStock !== data.stock) {
        state.stock_movements.push({ id: uid("mov"), movement_code: seq("ADJ", state.stock_movements, "movement_code"), movement_type: data.stock >= oldStock ? "adjustment_plus" : "adjustment_minus", sparepart_id: p.id, sparepart_code: p.sparepart_code, sparepart_name: p.name, qty: Math.abs(data.stock - oldStock), motor_id: null, status: "verified", notes: "Update stok manual dari master sparepart", created_at: todayIso() });
      }
    } else {
      var code = nextSparepartCode();
      state.spareparts.push(Object.assign({ id: uid("sp"), sparepart_code: code, barcode_value: code }, data));
    }
    save();
    e.target.reset();
    $("sparepartEditId").value = "";
    $("sparepartUnit").value = "pcs";
    $("sparepartStock").value = 0;
    $("sparepartMinStock").value = 1;
    updateSparepartCodePreview();
    renderAll();
  }

  function renderMotors() {
    var q = ($("motorSearch").value || "").toLowerCase();
    var rows = state.motors.filter(function (m) { return (m.motor_code + " " + m.plate_number + " " + m.type + " " + m.color + " " + m.outlet).toLowerCase().indexOf(q) >= 0; });
    var html = '<table class="master-table"><thead><tr><th>No Motor</th><th>Plat</th><th>Tipe</th><th>Warna</th><th>Outlet</th><th>Status</th><th>Aksi</th></tr></thead><tbody>';
    rows.forEach(function (m) {
      html += '<tr><td data-label="No Motor"><b>' + esc(m.motor_code) + '</b></td><td data-label="Plat">' + esc(m.plate_number || "-") + '</td><td data-label="Tipe">' + esc(m.type || "-") + '</td><td data-label="Warna">' + esc(m.color || "-") + '</td><td data-label="Outlet">' + esc(m.outlet || "-") + '</td><td data-label="Status"><span class="tag gray">' + esc(m.status || "-") + '</span></td><td data-label="Aksi"><button class="ghost" data-edit-motor="' + esc(m.id) + '">Edit</button></td></tr>';
    });
    html += '</tbody></table>';
    $("motorList").innerHTML = rows.length ? html : '<div class="muted">Belum ada motor.</div>';
  }

  function editMotor(id) {
    var m = state.motors.find(function (x) { return x.id === id; });
    if (!m) return;
    if ($("motorEditId")) $("motorEditId").value = m.id;
    $("motorCode").value = m.motor_code || "";
    $("plateNumber").value = m.plate_number || "";
    $("motorType").value = m.type || "";
    $("motorColor").value = m.color || "";
    $("motorOutlet").value = m.outlet || "";
    setPage("spareparts");
    setMasterTab("motor");
  }

  function saveMotor(e) {
    e.preventDefault();
    var code = $("motorCode").value.trim();
    if (!code) return alert("No motor wajib diisi.");
    var editId = $("motorEditId") ? $("motorEditId").value : "";
    var existing = editId ? state.motors.find(function (x) { return x.id === editId; }) : findMotorByCode(code);
    var duplicate = state.motors.find(function (x) { return x.motor_code === code && x.id !== editId; });
    if (duplicate) return alert("No motor ini sudah ada di master: " + code);
    var data = { motor_code: code, barcode_value: code, plate_number: $("plateNumber").value.trim(), type: $("motorType").value.trim(), color: $("motorColor").value.trim(), outlet: $("motorOutlet").value.trim(), status: "active" };
    if (existing) Object.assign(existing, data);
    else state.motors.push(Object.assign({ id: uid("motor") }, data));
    save();
    e.target.reset();
    if ($("motorEditId")) $("motorEditId").value = "";
    renderAll();
    setMasterTab("motor");
  }

  function updateStockPartLookup() {
    var part = findSparepartByCode($("stockPartCode").value);
    $("stockPartLookup").innerHTML = part ?
      '<span class="tag green">Sparepart ditemukan</span> <b>' + esc(part.name) + '</b> · Stok ' + esc(part.stock) + ' · ' + esc(part.room || "-") + ' · ' + esc(part.rack || "-") :
      '<span class="tag yellow">Belum ditemukan</span> Scan / ketik kode barcode sparepart.';
  }

  function createStockOut(e) {
    e.preventDefault();
    var motor = findMotorByCode($("stockMotorCode").value);
    if (!motor) return alert("Motor tidak ditemukan.");
    var part = findSparepartByCode($("stockPartCode").value);
    if (!part) return alert("Sparepart tidak ditemukan dari barcode/kode.");
    var qty = Number($("stockOutQty").value || 0);
    if (qty <= 0) return alert("Qty wajib lebih dari 0.");
    if (Number(part.stock || 0) < qty) return alert("Stok tidak cukup. Stok saat ini: " + part.stock);
    part.stock = Number(part.stock || 0) - qty;
    var type = $("stockOutType").value;
    var movement = {
      id: uid("mov"),
      movement_code: seq("SK", state.stock_movements, "movement_code"),
      movement_type: type,
      sparepart_id: part.id,
      sparepart_code: part.sparepart_code,
      sparepart_name: part.name,
      qty: qty,
      motor_id: motor.id,
      status: type === "self_take_out" ? "waiting_verification" : "verified",
      notes: $("stockOutNotes").value,
      created_at: todayIso()
    };
    state.stock_movements.push(movement);
    save();
    alert("Stock keluar berhasil dibuat: " + movement.movement_code);
    e.target.reset();
    $("stockOutQty").value = 1;
    $("stockPartLookup").textContent = "Data sparepart akan muncul di sini.";
    renderAll();
  }

  function createStockIn(e) {
    e.preventDefault();
    var part = findSparepartByCode($("stockInPartCode").value);
    if (!part) return alert("Sparepart tidak ditemukan dari barcode/kode.");
    var qty = Number($("stockInQty").value || 0);
    if (qty <= 0) return alert("Qty masuk wajib lebih dari 0.");
    part.stock = Number(part.stock || 0) + qty;
    var movement = {
      id: uid("mov"),
      movement_code: seq("SM", state.stock_movements, "movement_code"),
      movement_type: "stock_in",
      sparepart_id: part.id,
      sparepart_code: part.sparepart_code,
      sparepart_name: part.name,
      qty: qty,
      motor_id: null,
      status: "verified",
      notes: $("stockInNotes").value || "Stock masuk manual",
      created_at: todayIso()
    };
    state.stock_movements.push(movement);
    save();
    alert("Stock masuk berhasil disimpan: " + movement.movement_code);
    e.target.reset();
    $("stockInQty").value = 1;
    renderAll();
  }

  function renderMovements() {
    if (!$("movementList")) return;
    var q = ($("movementSearch") && $("movementSearch").value || "").toLowerCase();
    var rows = state.stock_movements.slice().reverse().filter(function (m) {
      var motor = state.motors.find(function (x) { return x.id === m.motor_id; }) || {};
      return ((m.movement_code || "") + " " + (m.movement_type || "") + " " + (m.sparepart_name || "") + " " + (m.sparepart_code || "") + " " + (motor.motor_code || "") + " " + (m.notes || "")).toLowerCase().indexOf(q) >= 0;
    });
    var html = '<table><thead><tr><th>Kode</th><th>Tipe</th><th>Sparepart</th><th>Qty</th><th>Motor</th><th>Status</th><th>Waktu</th></tr></thead><tbody>';
    rows.forEach(function (m) {
      var motor = state.motors.find(function (x) { return x.id === m.motor_id; }) || {};
      var cls = m.movement_type === "stock_in" ? "green" : (m.status === "waiting_verification" ? "yellow" : "gray");
      html += '<tr><td><b>' + esc(m.movement_code) + '</b></td><td>' + esc(m.movement_type) + '</td><td>' + esc(m.sparepart_name) + '<br><small>' + esc(m.sparepart_code) + '</small></td><td>' + esc(m.qty) + '</td><td>' + esc(motor.motor_code || "-") + '</td><td><span class="tag ' + cls + '">' + esc(m.status) + '</span></td><td>' + esc(formatDateTime(m.created_at)) + '</td></tr>';
    });
    html += '</tbody></table>';
    $("movementList").innerHTML = rows.length ? html : '<div class="muted">Belum ada movement.</div>';
  }


  function renderSelfTakeReviews() {
    if (!$("selfTakeReviewList")) return;
    var rows = state.stock_movements.slice().reverse().filter(function (m) { return m.movement_type === "self_take_out" && m.status === "waiting_verification"; });
    if (!rows.length) {
      $("selfTakeReviewList").innerHTML = '<div class="muted">Tidak ada ambil mandiri yang perlu direview.</div>';
      return;
    }
    $("selfTakeReviewList").innerHTML = rows.map(function (m) {
      var motor = state.motors.find(function (x) { return x.id === m.motor_id; }) || {};
      var mediaHtml = (m.media_items || []).map(function (media) {
        var name = media.file_url ? '<a target="_blank" href="' + esc(media.file_url) + '">' + esc(media.file_name || "Bukti") + '</a>' : esc(media.file_name || "Bukti");
        return '<div class="media-line">' + name + '<br><span>' + esc(media.note || "Bukti ambil") + '</span></div>';
      }).join("");
      return '<div class="card"><div class="card-head"><div><div class="card-title">' + esc(m.movement_code) + ' · Motor ' + esc(motor.motor_code || "-") + '</div>' +
        '<div class="card-sub">Mekanik: ' + esc(m.mechanic_name || "-") + ' · ' + esc(formatDateTime(m.created_at)) + '</div></div><span class="tag yellow">Perlu crosscheck</span></div>' +
        '<div><span class="tag gray">' + esc(m.sparepart_name) + ' · Qty ' + esc(m.qty) + '</span></div>' +
        '<div class="card-sub">Catatan: ' + esc(m.notes || "-") + '</div>' +
        (mediaHtml ? '<div class="media-summary"><b>Bukti ambil:</b>' + mediaHtml + '</div>' : '') +
        '<div class="card-actions"><button class="secondary" data-selftake-review="verify" data-id="' + esc(m.id) + '">Verifikasi Benar</button><button class="danger" data-selftake-review="reject" data-id="' + esc(m.id) + '">Tolak & Kembalikan Stok</button></div></div>';
    }).join("");
  }

  function handleSelfTakeReviewAction(action, movementId) {
    var m = state.stock_movements.find(function (x) { return x.id === movementId; });
    if (!m) return;
    var r = state.part_requests.find(function (x) { return x.id === m.request_id; });
    if (action === "verify") {
      m.status = "verified";
      m.verified_by = currentUserName();
      m.verified_at = todayIso();
      if (r) {
        var motor = state.motors.find(function (mt) { return mt.id === r.motor_id; });
        if (motor) motor.status = "maintenance";
        r.status = "stock_out_generated";
        r.stock_out_code = m.movement_code;
        r.admin_stock_out_by = currentUserName();
        r.admin_stock_out_at = todayIso();
        r.admin_note = "Ambil mandiri sudah diverifikasi admin.";
      }
      alert("Ambil mandiri sudah diverifikasi: " + m.movement_code);
    }
    if (action === "reject") {
      var reason = prompt("Alasan ditolak:", "Barang yang diambil tidak sesuai / bukti kurang jelas.");
      if (reason === null) return;
      m.status = "rejected";
      m.verified_by = currentUserName();
      m.verified_at = todayIso();
      m.notes = (m.notes || "") + " | Ditolak: " + reason;
      var part = state.spareparts.find(function (p) { return p.id === m.sparepart_id; });
      if (part) part.stock = Number(part.stock || 0) + Number(m.qty || 0);
      if (r) {
        r.status = "revision_needed";
        r.previous_status = "self_take_waiting_review";
        r.admin_note = "Ambil mandiri ditolak: " + reason;
        r.stock_out_code = "";
      }
      alert("Ambil mandiri ditolak dan stok dikembalikan oleh sistem.");
    }
    save();
    renderAll();
  }

  function renderWarehouseMetrics() {
    if (!$("wStockOutToday")) return;
    var today = new Date().toISOString().slice(0, 10);
    var stockOutToday = state.stock_movements.filter(function (m) { return m.created_at && m.created_at.slice(0, 10) === today && (m.movement_type === "stock_out" || m.movement_type === "self_take_out"); }).length;
    var low = state.spareparts.filter(function (p) { return Number(p.stock || 0) <= Number(p.minimum_stock || 0); }).length;
    var pending = state.stock_movements.filter(function (m) { return m.movement_type === "self_take_out" && m.status === "waiting_verification"; }).length;
    $("wStockOutToday").textContent = stockOutToday;
    $("wLowStock").textContent = low;
    if ($("wSelfTakePending")) $("wSelfTakePending").textContent = pending;
  }

  function renderOwnerOverview() {
    if (!$('overviewList')) return;
    var q = ($('overviewSearch') && $('overviewSearch').value || '').toLowerCase();
    var rows = state.part_requests.slice().reverse().filter(function (r) {
      var motor = state.motors.find(function (m) { return m.id === r.motor_id; }) || {};
      var report = state.damage_reports.find(function (d) { return d.id === r.report_id; }) || {};
      var items = getItemsForRequest(r.id).map(function (i) { return i.sparepart_name; }).join(' ');
      return (motor.motor_code + ' ' + items + ' ' + r.status + ' ' + report.damage_notes + ' ' + (r.mechanic_name || '')).toLowerCase().indexOf(q) >= 0;
    });
    var summary = [
      { title: 'Request Baru', statuses: ['submitted_by_mechanic', 'reviewed_by_admin', 'self_take_waiting_review'] },
      { title: 'Menunggu Barang', statuses: ['waiting_owner_approval', 'owner_approved', 'purchase_pending', 'received_by_warehouse'] },
      { title: 'Ongoing Maintenance', statuses: ['stock_out_generated', 'ongoing_maintenance'] },
      { title: 'Sudah Service', statuses: ['completed'] }
    ];
    $('overviewSummary').innerHTML = summary.map(function (sec) {
      var count = state.part_requests.filter(function (r) { return sec.statuses.indexOf(r.status) >= 0; }).length;
      return '<div class="status-section"><div class="status-count">' + count + '</div><h3>' + esc(sec.title) + '</h3></div>';
    }).join('');
    $('overviewList').innerHTML = rows.length ? rows.map(function (r) { return requestCardHtml(r, true, true); }).join('') : '<div class="muted">Belum ada data overview.</div>';
  }

  function renderReports() {
    var totalMotor = state.motors.length;
    var readyMotor = state.motors.filter(function (m) { return computedMotorStatus(m) === "ready"; }).length;
    var maintenanceMotor = state.motors.filter(function (m) { return computedMotorStatus(m) === "maintenance"; }).length;
    var ongoingMotor = state.motors.filter(function (m) { return computedMotorStatus(m) === "ongoing_maintenance"; }).length;
    var totalRequest = state.part_requests.length;
    var requestBaru = state.part_requests.filter(function (r) { return r.status === "submitted_by_mechanic" || r.status === "reviewed_by_admin"; }).length;
    var menungguBarang = state.part_requests.filter(function (r) { return ["waiting_owner_approval", "owner_approved", "purchase_pending", "received_by_warehouse"].indexOf(r.status) >= 0; }).length;
    var selesai = state.part_requests.filter(function (r) { return r.status === "completed"; }).length;
    var purchaseSpend = purchaseTotalSpend();
    var purchaseCount = purchaseFrequency();
    var avgPurchase = purchaseCount ? Math.round(purchaseSpend / purchaseCount) : 0;

    var topParts = fastMovingParts(10);
    var topHtml = topParts.length ? topParts.map(function (p) { return '<div class="mini-row"><b>' + esc(p.name) + '</b><span>' + esc(p.qty) + ' keluar</span></div>'; }).join("") : '<span class="muted">Belum ada stock keluar.</span>';
    var lowStock = state.spareparts.filter(function (p) { return Number(p.stock) <= Number(p.minimum_stock); }).map(function (p) { return '<div><span class="tag ' + (Number(p.stock) <= 0 ? 'red' : 'yellow') + '">' + esc(p.name) + ' · stok ' + esc(p.stock) + ' / min ' + esc(p.minimum_stock) + '</span></div>'; }).join("") || '<span class="muted">Tidak ada stok menipis.</span>';
    var recentPurchases = state.owner_approvals.slice().reverse().filter(function (a) {
      var r = state.part_requests.find(function (x) { return x.id === a.request_id; });
      return r && ["owner_approved", "purchase_pending", "received_by_warehouse", "stock_out_ready", "stock_out_generated", "ongoing_maintenance", "completed"].indexOf(r.status) >= 0;
    }).slice(0, 5).map(function (a) {
      var r = state.part_requests.find(function (x) { return x.id === a.request_id; }) || {};
      var motor = state.motors.find(function (m) { return m.id === r.motor_id; }) || {};
      var b = a.checkout_breakdown || {};
      return '<div class="mini-row"><b>' + esc(a.approval_code || '-') + ' · Motor ' + esc(motor.motor_code || '-') + '</b><span>' + formatRupiah(b.total_before_checkout || a.total_estimated_amount || 0) + '</span></div>';
    }).join("") || '<div class="muted">Belum ada pembelian approved.</div>';

    $("reportSummary").innerHTML =
      '<div class="report-card accent"><h3>Total Motor</h3><strong>' + totalMotor + '</strong><p>Ready ' + readyMotor + ' · Maintenance ' + maintenanceMotor + ' · Ongoing ' + ongoingMotor + '</p></div>' +
      '<div class="report-card"><h3>Motor Ready</h3><strong>' + readyMotor + '</strong><p>Siap dipakai / sudah selesai service.</p></div>' +
      '<div class="report-card"><h3>Motor Maintenance</h3><strong>' + maintenanceMotor + '</strong><p>Request barang, menunggu owner/barang, atau siap stock keluar.</p></div>' +
      '<div class="report-card"><h3>Ongoing Maintenance</h3><strong>' + ongoingMotor + '</strong><p>Sedang dikerjakan mekanik.</p></div>' +
      '<div class="report-card accent"><h3>Total Pengeluaran Sparepart</h3><strong>' + formatRupiah(purchaseSpend) + '</strong><p>' + purchaseCount + 'x pembelian · rata-rata ' + formatRupiah(avgPurchase) + '</p></div>' +
      '<div class="report-card"><h3>Total Request</h3><strong>' + totalRequest + '</strong><p>Baru ' + requestBaru + ' · Menunggu barang ' + menungguBarang + ' · Selesai ' + selesai + '</p></div>' +
      '<div class="report-card"><h3>Fast Moving Stock</h3>' + topHtml + '</div>' +
      '<div class="report-card"><h3>Stok Habis / Menipis</h3>' + lowStock + '</div>' +
      '<div class="report-card wide-report"><h3>Pembelian Terakhir</h3>' + recentPurchases + '</div>';
  }

  function code39Svg(text, width, height) {
    text = (text || "").toUpperCase().replace(/[^0-9A-Z\-\. \$\/\+%]/g, "-");
    var map = {
      "0":"101001101101", "1":"110100101011", "2":"101100101011", "3":"110110010101",
      "4":"101001101011", "5":"110100110101", "6":"101100110101", "7":"101001011011",
      "8":"110100101101", "9":"101100101101", "A":"110101001011", "B":"101101001011",
      "C":"110110100101", "D":"101011001011", "E":"110101100101", "F":"101101100101",
      "G":"101010011011", "H":"110101001101", "I":"101101001101", "J":"101011001101",
      "K":"110101010011", "L":"101101010011", "M":"110110101001", "N":"101011010011",
      "O":"110101101001", "P":"101101101001", "Q":"101010110011", "R":"110101011001",
      "S":"101101011001", "T":"101011011001", "U":"110010101011", "V":"100110101011",
      "W":"110011010101", "X":"100101101011", "Y":"110010110101", "Z":"100110110101",
      "-":"100101011011", ".":"110010101101", " ":"100110101101", "$":"100100100101",
      "/":"100100101001", "+":"100101001001", "%":"101001001001", "*":"100101101101"
    };
    var full = "*" + text + "*";
    var pattern = "";
    for (var i = 0; i < full.length; i++) pattern += (map[full[i]] || map["-"]) + "0";
    var barWidth = Math.max(1, Math.floor(width / pattern.length));
    var realWidth = barWidth * pattern.length;
    var bars = "";
    var x = 0;
    for (var j = 0; j < pattern.length; j++) {
      if (pattern[j] === "1") bars += '<rect x="' + x + '" y="0" width="' + barWidth + '" height="' + (height - 20) + '" fill="#111"/>';
      x += barWidth;
    }
    return '<svg class="barcode-svg" width="' + realWidth + '" height="' + height + '" viewBox="0 0 ' + realWidth + ' ' + height + '" xmlns="http://www.w3.org/2000/svg">' + bars + '<text x="' + (realWidth / 2) + '" y="' + (height - 4) + '" text-anchor="middle">' + esc(text) + '</text></svg>';
  }

  function startScan(inputId) {
    scanTargetInputId = inputId;
    var dialog = $("scanDialog");
    dialog.showModal();
    if (!window.Html5Qrcode) {
      $("reader").innerHTML = '<div class="notice">Scanner kamera tidak tersedia. Ketik manual kode di field.</div>';
      return;
    }
    $("reader").innerHTML = "";
    scanner = new Html5Qrcode("reader");
    scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, function (decodedText) {
      if (scanTargetInputId && $(scanTargetInputId)) {
        $(scanTargetInputId).value = decodedText;
        $(scanTargetInputId).dispatchEvent(new Event("input"));
      }
      stopScan();
    }).catch(function () {
      $("reader").innerHTML = '<div class="notice">Kamera tidak bisa dibuka. Pastikan halaman menggunakan HTTPS dan izin kamera aktif. Bisa ketik manual.</div>';
    });
  }
  function stopScan() {
    var dialog = $("scanDialog");
    if (scanner) scanner.stop().catch(function () {}).finally(function () { scanner = null; });
    if (dialog.open) dialog.close();
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "rental-motor-backup-" + todayYmd() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }


  function downloadCsvTemplate(type) {
    var rows;
    var filename;
    if (type === "sparepart") {
      filename = "template_master_sparepart.csv";
      rows = [
        ["nama_sparepart", "satuan", "stok_awal", "minimum_stock", "ruangan", "rak_box_posisi", "link_shopee_default"],
        ["Kampas Rem Belakang", "pcs", "10", "2", "Gudang Sparepart 1", "Rak 1 / Box Rem", "https://shopee.co.id/..."]
      ];
    } else {
      filename = "template_master_motor.csv";
      rows = [
        ["no_motor", "plat_nomor", "tipe_motor", "warna", "outlet", "status"],
        ["079", "DK 0000 XX", "Beat", "Hitam", "Canggu", "ready"]
      ];
    }
    var csv = rows.map(function (row) { return row.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      var n = text[i + 1];
      if (c === '"' && inQuotes && n === '"') { cell += '"'; i++; continue; }
      if (c === '"') { inQuotes = !inQuotes; continue; }
      if (c === ',' && !inQuotes) { row.push(cell); cell = ""; continue; }
      if ((c === '\n' || c === '\r') && !inQuotes) {
        if (c === '\r' && n === '\n') i++;
        row.push(cell);
        if (row.some(function (v) { return String(v).trim() !== ""; })) rows.push(row);
        row = [];
        cell = "";
        continue;
      }
      cell += c;
    }
    row.push(cell);
    if (row.some(function (v) { return String(v).trim() !== ""; })) rows.push(row);
    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows || rows.length < 2) return [];
    var headers = rows[0].map(function (h) { return String(h || "").trim().toLowerCase(); });
    return rows.slice(1).map(function (row) {
      var obj = {};
      headers.forEach(function (h, idx) { obj[h] = row[idx] == null ? "" : String(row[idx]).trim(); });
      return obj;
    }).filter(function (obj) { return Object.keys(obj).some(function (k) { return obj[k]; }); });
  }

  function importMasterRows(rows, type) {
    var objs = rowsToObjects(rows);
    var added = 0;
    var updated = 0;
    if (type === "sparepart") {
      objs.forEach(function (o) {
        var name = o.nama_sparepart || o.name || o.sparepart || o.nama || "";
        if (!name) return;
        var existing = state.spareparts.find(function (p) { return p.name.toLowerCase() === name.toLowerCase(); });
        var data = {
          name: name,
          unit: o.satuan || o.unit || "pcs",
          stock: Number(o.stok_awal || o.stock || o.stok || 0),
          minimum_stock: Number(o.minimum_stock || o.min_stock || o.min || 0),
          room: o.ruangan || o.room || "",
          rack: o.rak_box_posisi || o.rak || o.rack || o.posisi || "",
          default_purchase_link: o.link_shopee_default || o.link || o.link_shopee || ""
        };
        if (existing) { Object.assign(existing, data); updated++; }
        else { var code = nextSparepartCode(); state.spareparts.push(Object.assign({ id: uid("sp"), sparepart_code: code, barcode_value: code }, data)); added++; }
      });
      refreshSparepartDatalist();
      setMasterTab("sparepart");
    } else {
      objs.forEach(function (o) {
        var code = o.no_motor || o.motor_code || o.kode_motor || o.barcode_motor || "";
        if (!code) return;
        var existing = findMotorByCode(code);
        var data = { motor_code: code, barcode_value: code, plate_number: o.plat_nomor || o.plate_number || "", type: o.tipe_motor || o.type || "", color: o.warna || o.color || "", outlet: o.outlet || "", status: o.status || "active" };
        if (existing) { Object.assign(existing, data); updated++; }
        else { state.motors.push(Object.assign({ id: uid("motor") }, data)); added++; }
      });
      setMasterTab("motor");
    }
    save();
    renderAll();
    alert("Import selesai. Tambah: " + added + " | Update: " + updated);
  }

  function importMasterFile(e, type) {
    var file = (e.target.files || [])[0];
    if (!file) return;
    var ext = file.name.split('.').pop().toLowerCase();
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        if (ext === "xlsx" || ext === "xls") {
          if (!window.XLSX) return alert("Library XLSX belum termuat. Pakai CSV atau pastikan koneksi internet aktif.");
          var wb = window.XLSX.read(ev.target.result, { type: "array" });
          var wanted = type === "motor" ? "Master Motor" : "Master Sparepart";
          var first = wb.SheetNames.indexOf(wanted) >= 0 ? wanted : wb.SheetNames[0];
          var rows = window.XLSX.utils.sheet_to_json(wb.Sheets[first], { header: 1, defval: "" });
          importMasterRows(rows, type);
        } else {
          importMasterRows(parseCsv(ev.target.result), type);
        }
      } catch (err) {
        alert("Import gagal: " + err.message);
      }
      e.target.value = "";
    };
    if (ext === "xlsx" || ext === "xls") reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  }


  async function loadUserAccessRows() {
    userAccessRows = [];
    if (!supabaseClient || currentRole() !== "owner") return;
    try {
      var allowed = await supabaseClient.from("allowed_users").select("*").order("created_at", { ascending: false });
      if (allowed.error) throw allowed.error;
      userAccessRows = allowed.data || [];
    } catch (err) {
      console.warn("Gagal load allowed_users", err);
      userAccessRows = [];
    }
  }

  function clearUserAccessForm() {
    if ($("userAccessEditEmail")) $("userAccessEditEmail").value = "";
    if ($("userAccessName")) $("userAccessName").value = "";
    if ($("userAccessEmail")) { $("userAccessEmail").value = ""; $("userAccessEmail").disabled = false; }
    if ($("userAccessRole")) $("userAccessRole").value = "mekanik";
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  async function saveUserAccess(e) {
    e.preventDefault();
    if (!supabaseClient || currentRole() !== "owner") return alert("Hanya Owner yang bisa mengelola user.");
    var email = normalizeEmail($("userAccessEmail").value);
    var fullName = String($("userAccessName").value || "").trim();
    var role = $("userAccessRole").value;
    if (!email || !fullName || ["owner", "admin", "mekanik"].indexOf(role) < 0) return alert("Nama, email, dan role wajib valid.");
    var payload = { email: email, full_name: fullName, role: role, active: true, updated_at: todayIso() };
    var res = await supabaseClient.from("allowed_users").upsert(payload, { onConflict: "email" }).select("*").single();
    if (res.error) return alert("Gagal menyimpan user: " + res.error.message);
    await activateExistingProfile(email, fullName, role, true);
    clearUserAccessForm();
    await loadUserAccessRows();
    renderUserAccess();
    alert("User terdaftar. User bisa login dengan Gmail/email yang sama: " + email);
  }

  async function activateExistingProfile(email, fullName, role, active) {
    try {
      var existing = await supabaseClient.from("profiles").select("id,email").ilike("email", email).maybeSingle();
      if (!existing.error && existing.data) {
        await supabaseClient.from("profiles").update({ full_name: fullName, role: role, active: !!active, email: email, updated_at: todayIso() }).eq("id", existing.data.id);
      }
    } catch (err) {
      console.warn("Sinkron profile existing gagal", err);
    }
  }

  function renderUserAccess() {
    var wrap = $("userAccessList");
    if (!wrap) return;
    if (currentRole() !== "owner") { wrap.innerHTML = '<div class="empty">Menu ini hanya untuk Owner.</div>'; return; }
    var q = normalizeEmail($("userAccessSearch") ? $("userAccessSearch").value : "");
    var rows = (userAccessRows || []).filter(function (u) {
      var hay = [u.email, u.full_name, u.role, u.active ? "aktif" : "nonaktif"].join(" ").toLowerCase();
      return !q || hay.indexOf(q) >= 0;
    });
    if (!rows.length) { wrap.innerHTML = '<div class="empty">Belum ada user terdaftar. Tambahkan Gmail/email user di form kiri.</div>'; return; }
    wrap.innerHTML = rows.map(function (u) {
      var active = u.active !== false;
      return '<div class="user-access-card">' +
        '<div><strong>' + esc(u.full_name || "-") + '</strong><div class="card-sub">' + esc(u.email || "-") + '</div></div>' +
        '<div class="user-role-stack"><span class="tag ' + (active ? 'green' : 'red') + '">' + (active ? 'Aktif' : 'Nonaktif') + '</span><span class="tag gray">' + esc(String(u.role || "-").toUpperCase()) + '</span></div>' +
        '<div class="row-actions"><button type="button" class="ghost" data-edit-user="' + esc(u.email) + '">Edit</button><button type="button" class="secondary" data-toggle-user="' + esc(u.email) + '">' + (active ? 'Nonaktifkan' : 'Aktifkan') + '</button><button type="button" class="danger" data-delete-user="' + esc(u.email) + '">Hapus</button></div>' +
      '</div>';
    }).join("");
  }

  function editUserAccess(email) {
    var u = (userAccessRows || []).find(function (row) { return normalizeEmail(row.email) === normalizeEmail(email); });
    if (!u) return;
    $("userAccessEditEmail").value = u.email || "";
    $("userAccessName").value = u.full_name || "";
    $("userAccessEmail").value = u.email || "";
    $("userAccessEmail").disabled = true;
    $("userAccessRole").value = u.role || "mekanik";
    $("userAccessName").focus();
  }

  async function toggleUserAccess(email) {
    if (!supabaseClient || currentRole() !== "owner") return;
    var u = (userAccessRows || []).find(function (row) { return normalizeEmail(row.email) === normalizeEmail(email); });
    if (!u) return;
    var next = !(u.active !== false);
    var res = await supabaseClient.from("allowed_users").update({ active: next, updated_at: todayIso() }).eq("email", normalizeEmail(email));
    if (res.error) return alert("Gagal update akses: " + res.error.message);
    await activateExistingProfile(normalizeEmail(email), u.full_name || email, u.role || "mekanik", next);
    await loadUserAccessRows();
    renderUserAccess();
  }

  async function deleteUserAccess(email) {
    if (!supabaseClient || currentRole() !== "owner") return;
    if (!confirm("Hapus akses email ini? User tidak akan bisa masuk sistem lagi.")) return;
    var u = (userAccessRows || []).find(function (row) { return normalizeEmail(row.email) === normalizeEmail(email); });
    var res = await supabaseClient.from("allowed_users").delete().eq("email", normalizeEmail(email));
    if (res.error) return alert("Gagal hapus akses: " + res.error.message);
    if (u) await activateExistingProfile(normalizeEmail(email), u.full_name || email, u.role || "viewer", false);
    await loadUserAccessRows();
    renderUserAccess();
  }


  function showAuth(message, type) {
    var auth = $("authScreen");
    var app = $("appShell");
    if (auth) auth.style.display = "grid";
    if (app) app.classList.add("auth-hidden");
    if (message) showAuthAlert(message, type || "info");
  }
  function showAppShell() {
    var auth = $("authScreen");
    var app = $("appShell");
    if (auth) auth.style.display = "none";
    if (app) app.classList.remove("auth-hidden");
  }
  function showAuthAlert(message, type) {
    var el = $("authAlert");
    if (!el) return;
    el.textContent = message || "";
    el.className = "auth-alert " + (type || "info");
  }
  function isSupabaseConfigured() {
    return !!(cfg.useSupabase && cfg.supabaseUrl && cfg.supabaseAnonKey && cfg.supabaseUrl.indexOf("PROJECT_ID") < 0 && cfg.supabaseAnonKey.indexOf("ISI_") < 0 && window.supabase);
  }
  function bindAuthEvents() {
    if (hasBoundAuthEvents) return;
    hasBoundAuthEvents = true;
    if ($("loginForm")) $("loginForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!supabaseClient) return showAuthAlert("Supabase belum dikonfigurasi.", "error");
      var email = $("loginEmail").value.trim();
      var password = $("loginPassword").value;
      showAuthAlert("Login diproses...", "info");
      var res = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
      if (res.error) return showAuthAlert(res.error.message, "error");
      location.reload();
    });
    if ($("forgotPasswordBtn")) $("forgotPasswordBtn").addEventListener("click", async function () {
      if (!supabaseClient) return showAuthAlert("Supabase belum dikonfigurasi.", "error");
      var email = $("loginEmail").value.trim();
      if (!email) return showAuthAlert("Isi email dulu untuk reset password.", "error");
      var res = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (res.error) return showAuthAlert(res.error.message, "error");
      showAuthAlert("Link reset password dikirim jika email terdaftar.", "ok");
    });
    if ($("googleLoginBtn")) $("googleLoginBtn").addEventListener("click", async function () {
      if (!supabaseClient) return showAuthAlert("Supabase belum dikonfigurasi.", "error");
      var res = await supabaseClient.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
      if (res.error) showAuthAlert(res.error.message, "error");
    });
  }
  async function initAuth() {
    bindAuthEvents();
    if (!cfg.useSupabase) {
      if (!cfg.allowLocalFallback) {
        showAuth("Production mode but useSupabase=false. Isi config.js dengan Supabase URL dan anon key.", "error");
        return false;
      }
      currentProfile = { full_name: "Admin Local", role: "admin", active: true };
      showAppShell();
      updateAccountUi();
      return true;
    }
    if (!isSupabaseConfigured()) {
      showAuth("Supabase belum siap. Edit config.js: supabaseUrl dan supabaseAnonKey harus diisi, lalu deploy ulang.", "error");
      return false;
    }
    supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    var sessionRes = await supabaseClient.auth.getSession();
    currentSession = sessionRes.data && sessionRes.data.session;
    if (!currentSession) {
      showAuth("Silakan login. Email/Gmail harus sudah didaftarkan oleh Owner.", "info");
      return false;
    }
    await loadCurrentProfile();
    if (!currentProfile || !currentProfile.active || currentProfile.role === "viewer") {
      showAuth("Email ini belum didaftarkan Owner atau aksesnya sedang nonaktif. Hubungi Owner agar Gmail/email didaftarkan di User Management.", "error");
      return false;
    }
    showAppShell();
    updateAccountUi();
    return true;
  }
  async function loadCurrentProfile() {
    var user = currentSession.user;
    var res = await supabaseClient.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (res.error) throw res.error;
    if (!res.data) {
      var fallbackName = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || (user.email || "User").split("@")[0];
      var insert = await supabaseClient.from("profiles").insert({ id: user.id, full_name: fallbackName, email: user.email || "", role: "viewer", active: false }).select("*").single();
      if (insert.error) throw insert.error;
      currentProfile = insert.data;
    } else {
      currentProfile = res.data;
    }
  }
  function updateAccountUi() {
    var name = currentUserName();
    if ($("accountName")) $("accountName").textContent = name;
    if ($("accountEmail")) $("accountEmail").textContent = currentUserEmail();
    if ($("accountRole")) $("accountRole").textContent = (currentRole() || "-").toUpperCase();
    if ($("storageMode")) $("storageMode").textContent = cfg.useSupabase ? "Production Supabase" : "Local fallback";
    if ($("roleSelect")) $("roleSelect").value = currentRole();
    if ($("mechanicName") && currentRole() === "mekanik") $("mechanicName").value = name;
    if ($("selfTakeMechanicName") && currentRole() === "mekanik") $("selfTakeMechanicName").value = name;
  }
  async function logout() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    currentSession = null;
    currentProfile = null;
    location.reload();
  }

  function openMobileMenu() { document.body.classList.add("sidebar-open"); }
  function closeMobileMenu() { document.body.classList.remove("sidebar-open"); }

  function bindEvents() {
    document.querySelectorAll(".nav button").forEach(function (btn) {
      btn.addEventListener("click", function () { setPage(btn.getAttribute("data-page")); });
    });
    if ($("roleSelect")) $("roleSelect").addEventListener("change", applyRoleView);
    $("menuToggle").addEventListener("click", openMobileMenu);
    $("mobileBackdrop").addEventListener("click", closeMobileMenu);
    $("addRequestItemBtn").addEventListener("click", addRequestItemRow);
    $("mechanicForm").addEventListener("submit", createMechanicRequest);
    if ($("stockOutForm")) $("stockOutForm").addEventListener("submit", createStockOut);
    if ($("mechanicSelfTakeForm")) $("mechanicSelfTakeForm").addEventListener("submit", createSelfTakeRequest);
    if ($("stockInForm")) $("stockInForm").addEventListener("submit", createStockIn);
    $("sparepartForm").addEventListener("submit", saveSparepart);
    $("motorForm").addEventListener("submit", saveMotor);
    $("reportMotorCode").addEventListener("input", updateMotorLookup);
    $("mediaUpload").addEventListener("change", handleMediaFiles);
    if ($("selfTakeMediaUpload")) $("selfTakeMediaUpload").addEventListener("change", handleSelfTakeMediaFiles);
    if ($("stockPartCode")) $("stockPartCode").addEventListener("input", updateStockPartLookup);
    if ($("selfTakePartCode")) $("selfTakePartCode").addEventListener("input", updateSelfTakePartLookup);
    $("dashboardSearch").addEventListener("input", renderDashboard);
    $("adminStatusFilter").addEventListener("change", renderAdmin);
    if ($("movementSearch")) $("movementSearch").addEventListener("input", renderMovements);
    $("ownerSearch").addEventListener("input", renderOwner);
    if ($("overviewSearch")) $("overviewSearch").addEventListener("input", renderOwnerOverview);
    if ($("monitorSearch")) $("monitorSearch").addEventListener("input", renderMotorMonitor);
    if ($("motorTransferForm")) $("motorTransferForm").addEventListener("submit", createMotorTransfer);
    if ($("transferSearch")) $("transferSearch").addEventListener("input", renderMotorTransfers);
    $("sparepartSearch").addEventListener("input", renderSpareparts);
    $("motorSearch").addEventListener("input", renderMotors);
    if ($("userAccessForm")) $("userAccessForm").addEventListener("submit", saveUserAccess);
    if ($("userAccessSearch")) $("userAccessSearch").addEventListener("input", renderUserAccess);
    if ($("clearUserAccessForm")) $("clearUserAccessForm").addEventListener("click", clearUserAccessForm);
    document.querySelectorAll("[data-master-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () { setMasterTab(btn.getAttribute("data-master-tab")); });
    });
    document.querySelectorAll("[data-mechanic-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () { setMechanicTab(btn.getAttribute("data-mechanic-tab")); });
    });
    document.querySelectorAll("[data-monitor-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () { setMonitorTab(btn.getAttribute("data-monitor-tab")); });
    });
    if ($("exportCompletedCsvBtn")) $("exportCompletedCsvBtn").addEventListener("click", exportCompletedCsv);
    if ($("downloadSparepartTemplateBtn")) $("downloadSparepartTemplateBtn").addEventListener("click", function () { downloadCsvTemplate("sparepart"); });
    if ($("downloadMotorTemplateBtn")) $("downloadMotorTemplateBtn").addEventListener("click", function () { downloadCsvTemplate("motor"); });
    if ($("sparepartImportFile")) $("sparepartImportFile").addEventListener("change", function (e) { importMasterFile(e, "sparepart"); });
    if ($("motorImportFile")) $("motorImportFile").addEventListener("change", function (e) { importMasterFile(e, "motor"); });
    if ($("checkoutProofFile")) $("checkoutProofFile").addEventListener("change", handleCheckoutProofFile);
    if ($("checkoutInsuranceEnabled")) $("checkoutInsuranceEnabled").addEventListener("change", handleCheckoutInsuranceToggle);
    ["checkoutSubtotal", "checkoutShipping", "checkoutInsurance", "checkoutServiceFee", "checkoutDiscount"].forEach(function (id) { if ($(id)) $(id).addEventListener("input", calculateCheckoutTotal); });
    if ($("runOcrBtn")) $("runOcrBtn").addEventListener("click", runCheckoutOcr);
    if ($("saveDemoGeminiKeyBtn")) $("saveDemoGeminiKeyBtn").addEventListener("click", saveDemoGeminiApiKey);
    if ($("demoGeminiApiKey")) $("demoGeminiApiKey").addEventListener("input", function () {
      var status = $("geminiDemoStatus");
      if (status) status.textContent = "Mode production memakai backend Gemini.";
    });
    updateGeminiDemoStatus();
    if ($("checkoutProofForm")) $("checkoutProofForm").addEventListener("submit", function (e) { e.preventDefault(); submitOwnerApprovalWithProof(); });
    if ($("closeCheckoutBtn")) $("closeCheckoutBtn").addEventListener("click", function () { if ($("checkoutDialog")) $("checkoutDialog").close(); });
    if ($("cancelCheckoutBtn")) $("cancelCheckoutBtn").addEventListener("click", function () { if ($("checkoutDialog")) $("checkoutDialog").close(); });
    if ($("receiveGoodsFile")) $("receiveGoodsFile").addEventListener("change", handleReceiveGoodsFiles);
    if ($("receiveOrderFile")) $("receiveOrderFile").addEventListener("change", handleReceiveOrderFile);
    if ($("runReceiveOcrBtn")) $("runReceiveOcrBtn").addEventListener("click", runReceiveOcr);
    if ($("receiveProofForm")) $("receiveProofForm").addEventListener("submit", function (e) { e.preventDefault(); submitReceiveProof(); });
    if ($("closeReceiveBtn")) $("closeReceiveBtn").addEventListener("click", function () { if ($("receiveDialog")) $("receiveDialog").close(); });
    if ($("cancelReceiveBtn")) $("cancelReceiveBtn").addEventListener("click", function () { if ($("receiveDialog")) $("receiveDialog").close(); });
    if ($("closeMediaPreviewBtn")) $("closeMediaPreviewBtn").addEventListener("click", closeMediaPreview);
    if ($("closeMotorDetailBtn")) $("closeMotorDetailBtn").addEventListener("click", closeMotorDetail);
    if ($("exportJsonBtn")) $("exportJsonBtn").addEventListener("click", exportJson);
    if ($("manualSyncBtn")) $("manualSyncBtn").addEventListener("click", reloadCloudData);
    if ($("logoutBtn")) $("logoutBtn").addEventListener("click", logout);
    document.body.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".media-open")) {
        e.preventDefault();
        openMediaPreviewFromElement(e.target.closest(".media-open"));
        return;
      }
      var scanTarget = e.target.getAttribute("data-scan-target");
      if (scanTarget) startScan(scanTarget);
      var adminAction = e.target.getAttribute("data-admin-action");
      if (adminAction) handleAdminAction(adminAction, e.target.getAttribute("data-id"));
      var ownerAction = e.target.getAttribute("data-owner-action");
      if (ownerAction) handleOwnerAction(ownerAction, e.target.getAttribute("data-id"));
      var mechanicAction = e.target.getAttribute("data-mechanic-action");
      if (mechanicAction) handleMechanicAction(mechanicAction, e.target.getAttribute("data-id"));
      var selfTakeReview = e.target.getAttribute("data-selftake-review");
      if (selfTakeReview) handleSelfTakeReviewAction(selfTakeReview, e.target.getAttribute("data-id"));
      var motorDetailId = e.target.getAttribute("data-motor-detail");
      if (motorDetailId) openMotorDetail(motorDetailId);
      var copyWaId = e.target.getAttribute("data-copy-wa");
      if (copyWaId) copyWhatsAppLog(copyWaId);
      var quickReturnId = e.target.getAttribute("data-quick-return-motor");
      if (quickReturnId) quickReturnMotor(quickReturnId);
      var editPart = e.target.getAttribute("data-edit-part");
      if (editPart) editSparepart(editPart);
      var printPart = e.target.getAttribute("data-print-part");
      if (printPart) printPartLabel(printPart);
      var editMotorId = e.target.getAttribute("data-edit-motor");
      if (editMotorId) editMotor(editMotorId);
      var editUserEmail = e.target.getAttribute("data-edit-user");
      if (editUserEmail) editUserAccess(editUserEmail);
      var toggleUserEmail = e.target.getAttribute("data-toggle-user");
      if (toggleUserEmail) toggleUserAccess(toggleUserEmail);
      var deleteUserEmail = e.target.getAttribute("data-delete-user");
      if (deleteUserEmail) deleteUserAccess(deleteUserEmail);
    });
    $("closeScanBtn").addEventListener("click", stopScan);
  }

  async function init() {
    try {
      var ok = await initAuth();
      if (!ok) return;
      if (cfg.useSupabase) state = await loadCloudState();
      else state = loadLocal();
      await loadUserAccessRows();
      bindEvents();
      addRequestItemRow();
      renderSelectedMedia();
      renderSelfTakeMedia();
      updateMotorLookup();
      updateSelfTakePartLookup();
      setMasterTab("sparepart");
      setMechanicTab("request");
      setMonitorTab("ready");
      updateAccountUi();
      applyRoleView();
    } catch (err) {
      console.error(err);
      showAuth("Gagal memulai aplikasi: " + (err.message || err), "error");
    }
  }

  init();
})();
