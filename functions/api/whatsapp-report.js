// Production placeholder untuk WhatsApp auto report.
// Deploy sebagai serverless function (Cloudflare Pages Functions/Vercel/etc).
// Simpan token/API key provider WhatsApp di environment, jangan di frontend.

export async function onRequestPost(context) {
  try {
    const payload = await context.request.json();
    const eventType = payload.event_type;
    const groupName = payload.group_name;
    const message = payload.message;

    if (!message) {
      return new Response(JSON.stringify({ ok: false, error: 'message wajib diisi' }), { status: 400 });
    }

    // TODO production:
    // 1. Ambil token dari environment, misal context.env.WHATSAPP_TOKEN.
    // 2. Mapping groupName ke group_id / recipient_id provider.
    // 3. Kirim message ke provider WhatsApp Business/WA gateway.
    // 4. Simpan status ke database whatsapp_logs.

    // Demo response agar frontend tidak error ketika endpoint sudah dihubungkan.
    return new Response(JSON.stringify({
      ok: true,
      mode: 'placeholder',
      event_type: eventType,
      group_name: groupName,
      message_length: String(message).length,
      note: 'Endpoint placeholder. Hubungkan ke provider WhatsApp di production.'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
