// gemini_wrappers.gs
// ระบบจัดคิวลองใหม่ (Retry), ตัวเชื่อมต่อโมเดลสารพัดประโยชน์ และระบบแคชความเร็วสูงระดับโปรเจกต์
// ปรับปรุง: เพิ่มความทนทานต่อข้อผิดพลาด, ปรับการแยกผลจาก Gemini, ปรับระบบแคชให้ปลอดภัยขึ้น

/**
 * Fetch with retry/backoff.
 * - url: string
 * - options: UrlFetchApp options object (method, payload, headers, contentType, muteHttpExceptions, etc.)
 * - attempts: จำนวนครั้งสูงสุด
 * - backoffMs: base backoff (จะเพิ่มเป็น exponential)
 */
function fetchWithRetry(url, options = {}, attempts = 3, backoffMs = 500) {
  // Ensure options is an object
  options = options || {};
  // Default to GET if not specified
  if (!options.method) options.method = 'get';
  // Ensure muteHttpExceptions true so we can inspect response codes
  if (typeof options.muteHttpExceptions === 'undefined') options.muteHttpExceptions = true;

  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = UrlFetchApp.fetch(url, options);
      const code = res.getResponseCode();
      // Success
      if (code >= 200 && code < 300) return res;
      // Client error (4xx) — ไม่ retry เพราะมักเป็นปัญหาของ request
      if (code >= 400 && code < 500) {
        throw new Error("HTTP " + code + " " + res.getContentText());
      }
      // Server error (5xx) — จะ retry
      lastErr = new Error("HTTP " + code + " " + res.getContentText());
    } catch (e) {
      lastErr = e;
      // ถ้าเป็นครั้งสุดท้าย ให้ throw
      if (i === attempts - 1) throw e;
      // sleep แบบ exponential backoff
      Utilities.sleep(backoffMs * Math.pow(2, i));
    }
  }
  throw lastErr || new Error("fetchWithRetry failed");
}

/**
 * fetchGemini
 * - url: endpoint
 * - payload: object
 * - isJson: ถ้าคาดหวังผลเป็น JSON ให้พยายาม parse
 *
 * คืนค่า:
 * - ถ้า isJson === true และ parse สำเร็จ -> object
 * - ถ้า isJson === false -> text (string)
 * - ถ้าล้มเหลว -> null
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
    try { json = JSON.parse(textBody); } catch (e) { console.error("fetchGemini parse response error: " + e.message); return null; }

    // 안전하게 candidates/parts 접근
    const candidates = (json && json.candidates) ? json.candidates : null;
    if (!candidates || !candidates[0]) return null;
    const content = candidates[0].content || {};
    const parts = content.parts || [];
    // รวมข้อความจาก parts (ถ้ามีหลายส่วน)
    let text = parts.map(p => (p && p.text) ? p.text : "").join("\n").trim();

    if (isJson) {
      // ลบ code fence แบบยืดหยุ่น (```json ... ``` หรือ ``` ... ```)
      text = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      // บางครั้ง Gemini ใส่ข้อความนำ/ตาม ให้พยายามหา JSON substring ที่เป็น object/array
      const firstBrace = text.indexOf('{');
      const firstBracket = text.indexOf('[');
      let startIdx = -1;
      if (firstBrace === -1 && firstBracket === -1) {
        // ไม่มี JSON เลย
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
        // ถ้า parse ไม่ได้ ให้พยายามค้นหา block ที่เริ่มด้วย { หรือ [
        // หาจุดสิ้นสุดแบบคร่าว ๆ โดยนับวงเล็บ (simple brace matching)
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
 * callGemini
 * - content: prompt text
 * - systemInstruction: system-level instruction
 * - isJson: ถ้าต้องการผลเป็น JSON
 */
function callGemini(content, systemInstruction, isJson) {
  const model = getSecret("MODEL_NAME") || "gemini-2.5-flash";
  const apiKey = getSecret("GEMINI_API_KEY");
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
 * callGeminiVision
 * - base64Str: base64 image data (no data: prefix)
 * - systemInstruction: instruction
 * - mimeType: e.g., "image/jpeg"
 */
function callGeminiVision(base64Str, systemInstruction, mimeType) {
  const model = getSecret("MODEL_NAME") || "gemini-2.5-flash";
  const apiKey = getSecret("GEMINI_API_KEY");
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

/**
 * getDynamicGeminiModels
 * - ดึงรายการโมเดลที่รองรับ generateContent และ cache ไว้ 6 ชั่วโมง
 */
function getDynamicGeminiModels() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get("GEMINI_DYNAMIC_MODELS");
    if (cached) return JSON.parse(cached);

    const apiKey = getSecret("GEMINI_API_KEY");
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

/**
 * BOT_PERF_CACHE: in-memory cache for runtime (script instance)
 * - spreadsheets: cache Spreadsheet objects
 * - sheets: cache Sheet objects
 * - lastClear: timestamp for periodic clear
 */
const BOT_PERF_CACHE = { spreadsheets: {}, sheets: {}, lastClear: Date.now() };

/**
 * clear in-memory cache periodically to avoid stale references (every 1 hour)
 */
function clearBotPerfCacheIfStale() {
  try {
    const HOUR_MS = 60 * 60 * 1000;
    if (Date.now() - BOT_PERF_CACHE.lastClear > HOUR_MS) {
      BOT_PERF_CACHE.spreadsheets = {};
      BOT_PERF_CACHE.sheets = {};
      BOT_PERF_CACHE.lastClear = Date.now();
    }
  } catch (e) {
    // ignore
  }
}

/**
 * getCachedSpreadsheet
 * - เปิด Spreadsheet และเก็บในแคชหน่วยความจำ (ระวัง: object นี้ไม่ข้าม execution)
 */
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

/**
 * getCachedSheet
 * - คืนค่า Sheet object หรือ null ถ้าไม่พบ
 */
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

/**
 * normalize
 * - ลบคำนำหน้า, ลบช่องว่าง, trim
 * - คืนค่าสตริงที่สะอาด (ไม่ lowercase เพื่อรักษาการแมตช์ตามฐานข้อมูลเดิม)
 */
function normalize(t) {
  if (!t && t !== 0) return "";
  try {
    let s = t.toString().trim();
    // ลบคำนำหน้าไทย/อังกฤษที่พบบ่อย (ยืดหยุ่น)
    s = s.replace(/^(นาย|นางสาว|นาง|น\.?ส\.?|ด\.?ช\.?|ด\.?ญ\.?)/i, "");
    // ลบคำย่อแบบมีจุด เช่น "น.ส." หรือ "น.ส"
    s = s.replace(/\./g, "");
    // ลบช่องว่างทั้งหมด
    s = s.replace(/\s+/g, "");
    return s;
  } catch (e) {
    return t.toString();
  }
}

/**
 * formatDateToShort
 * - รับ Date หรือ string; คืนค่า "D/M/YY" (ไม่มี leading zero ตามเดิม)
 */
function formatDateToShort(dateObj) {
  if (!dateObj) return dateObj;
  try {
    if (!(dateObj instanceof Date)) {
      // พยายามแปลงเป็น Date
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