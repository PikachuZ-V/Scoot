// Cloudflare Pages Function: /api/gemini-receive-ocr
// OCR penerimaan barang orderan: baca no pesanan, item, qty, lalu return JSON.
// Set environment variable GEMINI_API_KEY di Cloudflare Pages.

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
    if (!apiKey) return json({ error: "GEMINI_API_KEY belum diset." }, 500);
    const input = await context.request.json();
    const orderImage = dataUrlToInlineData(input.order_image_base64 || "");
    const goodsImages = (input.goods_image_base64_list || []).map(dataUrlToInlineData).filter(x => x.data).slice(0, 3);
    if (!orderImage.data && !goodsImages.length) return json({ error: "Upload minimal SS pesanan atau foto barang." }, 400);
    const model = env.GEMINI_MODEL || input.gemini_model || "gemini-2.5-flash";
    const apiBase = env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
    const url = `${apiBase}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const parts = [{ text: buildPrompt(input) }];
    if (orderImage.data) parts.push({ inline_data: orderImage });
    goodsImages.forEach(img => parts.push({ inline_data: img }));
    const body = {
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: receiveSchema() }
    };
    const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return json({ error: "Gemini API gagal", status: resp.status, details: data }, 502);
    const joined = (((data.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || "").join("\n").trim() || "";
    let parsed;
    try { parsed = JSON.parse(joined); } catch { parsed = { raw_text: joined, received_items: [] }; }
    return json({ provider: "gemini", model, ...parsed });
  } catch (err) {
    return json({ error: err.message || String(err) }, 500);
  }
}

function dataUrlToInlineData(dataUrl) {
  const str = String(dataUrl || "");
  const m = str.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return { mime_type: "image/png", data: "" };
  return { mime_type: m[1], data: m[2] };
}

function buildPrompt(input) {
  const items = (input.expected_items || []).map(i => `- ${i.name} x ${i.qty}`).join("\n") || "-";
  return [
    "Kamu adalah OCR parser untuk bukti pesanan barang sparepart dari Shopee/Tokopedia dan foto barang diterima.",
    "Baca nomor pesanan, nama barang, variasi, dan qty. Cocokkan dengan item request sistem.",
    "Item request sistem:\n" + items,
    "Balas hanya JSON valid sesuai schema, tanpa markdown.",
    "order_number = nomor pesanan/order/invoice/trx jika terlihat.",
    "received_items = barang yang terbaca dengan qty. Jika qty tidak jelas isi estimasi dan beri notes.",
    "confidence = 0 sampai 1. Turunkan jika gambar blur/terpotong."
  ].join("\n");
}

function receiveSchema() {
  return {
    type: "OBJECT",
    properties: {
      order_number: { type: "STRING" },
      marketplace: { type: "STRING" },
      received_items: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, qty: { type: "NUMBER" }, variant: { type: "STRING" }, notes: { type: "STRING" } }, required: ["name", "qty"] } },
      raw_text: { type: "STRING" },
      confidence: { type: "NUMBER" },
      notes: { type: "STRING" }
    },
    required: ["order_number", "received_items", "raw_text", "confidence"]
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
