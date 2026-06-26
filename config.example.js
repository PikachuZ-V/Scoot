// Copy file ini menjadi config.js lalu isi Supabase URL dan Anon Key.
// Kalau dikosongkan, aplikasi berjalan sebagai demo mode pakai localStorage browser.
window.APP_CONFIG = {
  useSupabase: false,
  supabaseUrl: "",
  supabaseAnonKey: "",

  // OCR checkout proof memakai Gemini.
  // REKOMENDASI PRODUCTION:
  // Simpan GEMINI_API_KEY di backend/serverless, jangan di frontend.
  ocrProvider: "gemini",
  geminiProxyEndpoint: "", // /api/gemini-checkout-ocr
  geminiReceiveProxyEndpoint: "", // /api/gemini-receive-ocr
  geminiModel: "gemini-2.5-flash",

  // DEV ONLY: boleh isi untuk tes lokal, tetapi jangan dipakai production
  // karena API key akan terlihat di browser.
  geminiApiKey: "",
  geminiApiBase: "https://generativelanguage.googleapis.com/v1beta",
  allowBrowserGeminiInDemo: true,

  // WhatsApp auto report production. Isi endpoint backend/WA gateway di sini.
  // Demo lokal akan menyimpan pesan ke log tanpa benar-benar mengirim ke grup.
  whatsappWebhookEndpoint: "",

  // Fallback lama bila Gemini belum aktif.
  ocrEndpoint: "",
  enableBrowserOcr: false,
  ocrLanguage: "ind+eng",
  tesseractCdn: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
};
