// Default preferences. The scaffold rewrites `__prefsPrefix__` at build time.
pref("__prefsPrefix__.baseURL", "https://oneapi-comate.baidu-int.com/v1");
pref("__prefsPrefix__.apiKey", "");
pref("__prefsPrefix__.model", "glm-5.3-flash");
pref("__prefsPrefix__.autoAnnotate", false);
pref("__prefsPrefix__.annotationColor", "#5fb236");
pref("__prefsPrefix__.contextChars", 400);
pref("__prefsPrefix__.targetLang", "English");
pref(
  "__prefsPrefix__.systemPrompt",
  "You are a concise bilingual dictionary. The user selected a word or phrase while reading. Explain its meaning as used in the given context. Give: (1) the term, (2) a short definition, (3) the sense in this specific context. Keep it under 120 words. Answer in the target language specified by the user.",
);
