// Production config. Isi nilai Supabase sebelum deploy.
window.APP_CONFIG = {
  production: true,
  useSupabase: true,
  allowLocalFallback: false,

  // Wajib diisi dari Supabase Project Settings > API
  supabaseUrl: "https://tkvpvmrcjkgzjabyuvyv.supabase.co",
  supabaseAnonKey: "sb_publishable_d4NdH-SjhmvXf0ki64dTcA_LGVbfn6i",
   appUrl: "https://https://scoot.vandavicada66.workers.dev",

  // OCR checkout proof memakai Gemini via backend Cloudflare Pages Functions.
  // Jangan isi Gemini API key di frontend production.
  ocrProvider: "gemini",
  geminiProxyEndpoint: "/api/gemini-checkout-ocr",
  geminiReceiveProxyEndpoint: "/api/gemini-receive-ocr",
  geminiModel: "gemini-2.5-flash",
  geminiApiKey: "",
  allowBrowserGeminiInDemo: false,

  // WhatsApp auto report production.
  whatsappWebhookEndpoint: "/api/whatsapp-report",

  // Fallback OCR lama dimatikan di production.
  ocrEndpoint: "",
  enableBrowserOcr: false,
  ocrLanguage: "ind+eng"
};
