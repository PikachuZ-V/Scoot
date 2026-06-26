// Cloudflare Pages Function: /api/gemini-checkout-ocr
// Set environment variable GEMINI_API_KEY di Cloudflare Pages.
// Optional: GEMINI_MODEL=gemini-2.5-flash

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
  try {
    const env = context.env || {};
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return json({ error: "GEMINI_API_KEY belum diset di environment backend." }, 500);
    }

    const input = await context.request.json();
    const image = dataUrlToInlineData(input.image_base64 || "");
    if (!image.data) return json({ error: "image_base64 kosong atau tidak valid." }, 400);

    const model = env.GEMINI_MODEL || input.gemini_model || "gemini-2.5-flash";
    const apiBase = env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
    const url = `${apiBase}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const prompt = buildPrompt(input);
    const body = {
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { inline_data: image }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: checkoutSchema()
      }
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return json({ error: "Gemini API gagal", status: resp.status, details: data }, 502);
    }

    const text = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const joined = text.map((p) => p.text || "").join("\n").trim();
    let parsed;
    try { parsed = JSON.parse(joined); } catch (e) { parsed = { raw_text: joined }; }

    const breakdown = normalizeBreakdown(parsed, Number(input.fallback_subtotal || 0));
    return json({
      provider: "gemini",
      model,
      raw_text: parsed.raw_text || joined || "",
      confidence: Number(parsed.confidence || 0),
      notes: parsed.notes || "",
      breakdown
    });
  } catch (err) {
    return json({ error: err.message || String(err) }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function dataUrlToInlineData(dataUrl) {
  const str = String(dataUrl || "");
  const parts = str.split(",");
  const header = parts[0] || "";
  const data = parts.slice(1).join(",");
  const mime = (header.match(/data:([^;]+);base64/i) || [])[1] || "image/png";
  return { mime_type: mime, data };
}

function checkoutSchema() {
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

function buildPrompt(input) {
  const items = Array.isArray(input.request_items) ? input.request_items : [];
  const itemText = items.map((it) => `- ${it.name || "item"} x ${it.qty || 0}, estimasi ${it.estimated_price || 0}`).join("\n") || "-";
  return [
    "Kamu adalah OCR parser untuk screenshot mobile marketplace Indonesia seperti Shopee dan Tokopedia.",
    "Baca screenshot before checkout dan ekstrak breakdown biaya secara akurat.",
    `Marketplace yang dipilih admin: ${input.marketplace || "Marketplace"}.`,
    "Item request dari sistem:",
    itemText,
    `Fallback subtotal dari sistem: ${Number(input.fallback_subtotal || 0)}.`,
    "Balas hanya JSON valid sesuai schema, tanpa markdown.",
    "Semua angka dalam Rupiah sebagai number integer, tanpa simbol Rp/titik/koma.",
    "subtotal_items = total harga barang/item sebelum ongkir/asuransi/biaya layanan.",
    "shipping_cost = ongkir/ongkos kirim. Jika gratis ongkir, isi 0.",
    "insurance_selected = true jika asuransi/proteksi/perlindungan barang dipilih/dipakai. false jika tidak dipakai/tidak dipilih/tidak terlihat.",
    "insurance_cost = biaya asuransi/proteksi/perlindungan barang. Jika tidak dipakai/tidak terlihat, isi 0.",
    "delivery_estimate_text = teks estimasi pengiriman yang terlihat, misalnya 'Tiba 2-3 hari' atau 'Dapatkan tanggal 21-24 Apr'. Jika tidak terlihat, isi string kosong.",
    "delivery_estimate_days = jumlah hari estimasi pengiriman. Jika terlihat 2-3 hari, isi 3. Jika terlihat tanggal 21-24 Apr, isi 3. Jika tidak yakin/tidak terlihat, isi 0.",
    "service_fee = biaya layanan/admin/penanganan/lainnya. Jika tidak terlihat, isi 0.",
    "discount_amount = potongan/voucher/diskon sebagai angka positif. Jika tidak ada, isi 0.",
    "total_before_checkout = total yang harus dibayar sebelum checkout/CO.",
    "raw_text = teks penting dari screenshot untuk audit admin.",
    "confidence = 0 sampai 1. Turunkan jika gambar blur, terpotong, atau angka tidak jelas.",
    "notes = catatan singkat untuk admin jika ada angka yang perlu dicek ulang."
  ].join("\n");
}

function normalizeBreakdown(obj, fallbackSubtotal) {
  const b = {
    subtotal_items: numberOrZero(obj.subtotal_items),
    shipping_cost: numberOrZero(obj.shipping_cost),
    insurance_cost: numberOrZero(obj.insurance_cost),
    insurance_selected: obj.insurance_selected !== undefined ? !!obj.insurance_selected : numberOrZero(obj.insurance_cost) > 0,
    delivery_estimate_text: obj.delivery_estimate_text || "",
    delivery_estimate_days: numberOrZero(obj.delivery_estimate_days),
    service_fee: numberOrZero(obj.service_fee),
    discount_amount: numberOrZero(obj.discount_amount),
    total_before_checkout: numberOrZero(obj.total_before_checkout),
    raw_text: obj.raw_text || "",
    confidence: numberOrZero(obj.confidence),
    notes: obj.notes || ""
  };
  if (!b.subtotal_items && fallbackSubtotal) b.subtotal_items = fallbackSubtotal;
  if (!b.total_before_checkout) {
    b.total_before_checkout = b.subtotal_items + b.shipping_cost + (b.insurance_selected ? b.insurance_cost : 0) + b.service_fee - b.discount_amount;
  }
  return b;
}

function numberOrZero(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}
