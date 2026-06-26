window.APP_CONFIG = {
  useSupabase: true,
  supabaseUrl: "https://PROJECT_ID.supabase.co",
  supabaseAnonKey: "ISI_SUPABASE_ANON_OR_PUBLISHABLE_KEY",

  ocrProvider: "gemini",
  geminiProxyEndpoint: "/api/gemini-checkout-ocr",
  geminiReceiveProxyEndpoint: "/api/gemini-receive-ocr",
  geminiModel: "gemini-2.5-flash",
  geminiApiKey: "",
  geminiApiBase: "https://generativelanguage.googleapis.com/v1beta",
  allowBrowserGeminiInDemo: false,

  whatsappWebhookEndpoint: "/api/whatsapp-report",

  ocrEndpoint: "",
  enableBrowserOcr: false,
  ocrLanguage: "ind+eng",
  tesseractCdn: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"
};
