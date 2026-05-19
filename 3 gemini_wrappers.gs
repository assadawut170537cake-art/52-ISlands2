// =================================================================
// 3_GeminiWrappers.gs (ระบบ API เชื่อมสมองกล AI, แยกคีย์ Web/Line และระบบ Cache)
// =================================================================

/**
 * Fetch with retry/backoff. (ระบบพยายามเรียกซ้ำหาก Network มีปัญหา)
 */
function fetchWithRetry(url, options = {}, attempts = 3, backoffMs = 500) {
  options = options || {};
  if (!options.method) options.method = 'get';
  if (typeof options.muteHttpExceptions === 'undefined') options.muteHttpExceptions = true;

  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = UrlFetchApp.fetch(url, options);
      const code = res.getResponseCode();
      if (code >= 200 && code < 300) return res;
      if (code >= 400 && code < 500) {
        throw new Error("HTTP " + code + " " + res.getContentText());
      }
      lastErr = new Error("HTTP " + code + " " + res.getContentText());
    } catch (e) {
      lastErr = e;
      if (i === attempts - 1) throw e;
      Utilities.sleep(backoffMs * Math.pow(2, i));
    }
  }
  throw lastErr || new Error("fetchWithRetry failed");
}

/**
 * fetchGemini (ฟังก์ชันแกนกลางรับ-ส่งข้อมูลกับ AI)
 */
function fetchGemini(url, payload, isJson) {
  try {
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    const res = fetchWithRetry(url, options, 3, 400);
    if (!res) return null;
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      console.error("fetchGemini non-2xx: " + code + " -> " + res.getContentText());
      return null;
    }
    const textBody = res.getContentText();
    let json;
    try { json = JSON.parse(textBody); } catch (e) { console.error("fetchGemini parse error: " + e.message); return null; }

    const candidates = (json && json.candidates) ? json.candidates : null;
    if (!candidates || !candidates[0]) return null;
    const content = candidates[0].content || {};
    const parts = content.parts || [];
    let text = parts.map(p => (p && p.text) ? p.text : "").join("\n").trim();

    if (isJson) {
      // คลีน Backtick ออกเพื่อป้องกัน JSON พัง
      text = text.replace(new RegExp("\\x60\\x60\\x60(?:json)?", "gi"), "").replace(new RegExp("\\x60\\x60\\x60", "g"), "").trim();
      
      const firstBrace = text.indexOf('{');
      const firstBracket = text.indexOf('[');
      let startIdx = -1;
      if (firstBrace === -1 && firstBracket === -1) {
        try { return JSON.parse(text); } catch (e) { return null; }
      } else {
        if (firstBrace === -1) startIdx = firstBracket;
        else if (firstBracket === -1) startIdx = firstBrace;
        else startIdx = Math.min(firstBrace, firstBracket);
      }
      const candidate = text.substring(startIdx).trim();
      try {
        return JSON.parse(candidate);
      } catch (e) {
        const trimmed = candidate;
        let stack = [];
        let endPos = -1;
        for (let i = 0; i < trimmed.length; i++) {
          const ch = trimmed[i];
          if (ch === '{' || ch === '[') stack.push(ch);
          else if (ch === '}' || ch === ']') {
            if (stack.length === 0) { endPos = i; break; }
            const last = stack[stack.length - 1];
            if ((last === '{' && ch === '}') || (last === '[' && ch === ']')) stack.pop();
            if (stack.length === 0) { endPos = i; break; }
          }
        }
        if (endPos > -1) {
          const candidate2 = trimmed.substring(0, endPos + 1);
          try { return JSON.parse(candidate2); } catch (e2) { return null; }
        }
        return null;
      }
    }
    return text;
  } catch (e) {
    console.error("fetchGemini error: " + (e && e.message ? e.message : e));
    return null;
  }
}

/**
 * 🚀 callGemini (AI แกะข้อความภาษาธรรมชาติ)
 * 🛠️ เพิ่ม useWebKey เพื่อแยกแยะว่าเรียกจาก Web หรือ Line
 */
function callGemini(content, systemInstruction, isJson, useWebKey = false) {
  const props = PropertiesService.getScriptProperties();
  const model = props.getProperty("MODEL_NAME") || "gemini-2.5-flash";
  
  // เลือกใช้ API Key ตามคำสั่งว่ามาจาก Web หรือ Line
  const apiKey = useWebKey 
    ? (props.getProperty("GEMINI_API_KEY_WEB") || props.getProperty("GEMINI_API_KEY_LINE"))
    : (props.getProperty("GEMINI_API_KEY_LINE") || props.getProperty("GEMINI_API_KEY_WEB"));

  if (!apiKey) {
    console.error("GEMINI_API_KEY not set");
    return null;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: content || "" }] }],
    systemInstruction: { parts: [{ text: systemInstruction || "" }] },
    generationConfig: { responseMimeType: isJson ? "application/json" : "text/plain" }
  };
  return fetchGemini(url, payload, !!isJson);
}

/**
 * 🖼️ callGeminiVision (AI อ่านรูปภาพและ OCR)
 * 🛠️ เพิ่ม useWebKey เพื่อแยกแยะว่าเรียกจาก Web หรือ Line
 */
function callGeminiVision(base64Str, systemInstruction, mimeType, useWebKey = false) {
  const props = PropertiesService.getScriptProperties();
  const model = props.getProperty("MODEL_NAME") || "gemini-2.5-flash";
  
  // เลือกใช้ API Key ตามคำสั่ง
  const apiKey = useWebKey 
    ? (props.getProperty("GEMINI_API_KEY_WEB") || props.getProperty("GEMINI_API_KEY_LINE"))
    : (props.getProperty("GEMINI_API_KEY_LINE") || props.getProperty("GEMINI_API_KEY_WEB"));

  if (!apiKey) {
    console.error("GEMINI_API_KEY not set");
    return null;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: systemInstruction || "" }, { inlineData: { mimeType: mimeType || "image/jpeg", data: base64Str } }] }],
    generationConfig: { responseMimeType: "application/json" }
  };
  return fetchGemini(url, payload, true);
}

function getDynamicGeminiModels() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get("GEMINI_DYNAMIC_MODELS");
    if (cached) return JSON.parse(cached);

    const props = PropertiesService.getScriptProperties();
    const apiKey = props.getProperty("GEMINI_API_KEY_WEB") || props.getProperty("GEMINI_API_KEY_LINE");
    if (!apiKey) return [];
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const res = fetchWithRetry(url, { method: "get", muteHttpExceptions: true }, 2, 300);
    if (!res) return [];
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      console.error("getDynamicGeminiModels non-2xx: " + code);
      return [];
    }
    const json = JSON.parse(res.getContentText());
    if (!json.models) return [];
    const models = json.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
      .map(m => ({ name: m.name, displayName: m.displayName || m.name }));
    cache.put("GEMINI_DYNAMIC_MODELS", JSON.stringify(models), 21600);
    return models;
  } catch (e) {
    console.error("getDynamicGeminiModels error: " + (e && e.message ? e.message : e));
    return [];
  }
}

/* -----------------------------------------------------------------
   ระบบ Cache เร่งความเร็วอ่าน/เขียน Spreadsheet
   ----------------------------------------------------------------- */
const BOT_PERF_CACHE = { spreadsheets: {}, sheets: {}, lastClear: Date.now() };

function clearBotPerfCacheIfStale() {
  try {
    const HOUR_MS = 60 * 60 * 1000;
    if (Date.now() - BOT_PERF_CACHE.lastClear > HOUR_MS) {
      BOT_PERF_CACHE.spreadsheets = {};
      BOT_PERF_CACHE.sheets = {};
      BOT_PERF_CACHE.lastClear = Date.now();
    }
  } catch (e) {}
}

function getCachedSpreadsheet(ssId) {
  clearBotPerfCacheIfStale();
  if (!ssId) throw new Error("Spreadsheet ID required");
  if (!BOT_PERF_CACHE.spreadsheets[ssId]) {
    try {
      BOT_PERF_CACHE.spreadsheets[ssId] = SpreadsheetApp.openById(ssId);
    } catch (e) {
      console.error("getCachedSpreadsheet open error: " + e.message);
      throw e;
    }
  }
  return BOT_PERF_CACHE.spreadsheets[ssId];
}

function getCachedSheet(ssId, sheetName) {
  clearBotPerfCacheIfStale();
  const key = `${ssId}#${sheetName}`;
  if (!BOT_PERF_CACHE.sheets[key]) {
    try {
      const ss = getCachedSpreadsheet(ssId);
      const sh = ss.getSheetByName(sheetName);
      BOT_PERF_CACHE.sheets[key] = sh || null;
    } catch (e) {
      console.error("getCachedSheet error: " + e.message);
      BOT_PERF_CACHE.sheets[key] = null;
    }
  }
  return BOT_PERF_CACHE.sheets[key];
}

/* -----------------------------------------------------------------
   ฟังก์ชันช่วยเหลือพื้นฐาน
   ----------------------------------------------------------------- */
function normalize(t) {
  if (!t && t !== 0) return "";
  try {
    let s = t.toString().trim();
    s = s.replace(/^(นาย|นางสาว|นาง|น\.?ส\.?|ด\.?ช\.?|ด\.?ญ\.?)/i, "");
    s = s.replace(/\./g, "");
    s = s.replace(/\s+/g, "");
    return s;
  } catch (e) {
    return t.toString();
  }
}

function formatDateToShort(dateObj) {
  if (!dateObj) return dateObj;
  try {
    if (!(dateObj instanceof Date)) {
      const d = new Date(dateObj);
      if (isNaN(d.getTime())) return dateObj;
      dateObj = d;
    }
    const d = dateObj.getDate();
    const m = dateObj.getMonth() + 1;
    const y = dateObj.getFullYear().toString().slice(-2);
    return `${d}/${m}/${y}`;
  } catch (e) {
    return dateObj;
  }
}

/**
 * 🔍 ส่งโครงสร้างโค้ดทั้งโปรเจกต์พร้อมคำถามผู้ใช้ไปประมวลผลหา Bug
 */
function callGeminiWithCodeAnalysis(userQuestion) {
  try {
    const projectCode = typeof getProjectSourceCode === 'function' ? getProjectSourceCode() : "ไม่พบฟังก์ชันดึงโค้ด";
    if (projectCode.startsWith("❌")) return projectCode;
    
    const systemInstruction = "คุณคือวิศวกรซอฟต์แวร์ผู้เชี่ยวชาญระดับสถาปนิก หน้าที่ของคุณคือการอ่านซอร์สโค้ดก้อนใหญ่ของโปรเจกต์ ตรวจสอบจุดคำนวณเวลาทำงาน คอลัมน์ชีต และ Bug แล้วชี้เป้าบรรทัดที่มีปัญหาพร้อมให้แนวทางแก้ไขที่สอดรับกับฟังก์ชันเดิม 100%";
    const fullContent = `${projectCode}\n\n[คำสั่งจากผู้ใช้]: ${userQuestion}`;
    
    // บังคับใช้คีย์ Web เพราะเป็นการตรวจสอบผ่านหน้า Dashboard
    const response = callGemini(fullContent, systemInstruction, false, true);
    return response || "⚠️ ไม่สามารถประมวลผลคำตอบจากระบบวิเคราะห์โค้ดได้";
  } catch (e) {
    return `❌ เกิดข้อผิดพลาดในขั้นตอนวิเคราะห์ซอร์สโค้ด: ${e.message}`;
  }
}