// CONFIGURATION LLM - Clé API Google Gemini
// Utilise cette clé ou remplace par la tienne
var LLM_CONFIG = {
  geminiApiKey: 'AIzaSyAmBMaaXvgLoX8FOSlRjVltmxpiZ5VIvDs'
};

// Fallback: also check CONFIG if exists
if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.geminiApiKey) {
  LLM_CONFIG.geminiApiKey = CONFIG.geminiApiKey;
}