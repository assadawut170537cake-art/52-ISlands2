// =================================================================
// 5_SupportMisc.gs (ฟังก์ชันสนับสนุน แจ้งเตือนแอดมิน และจัดการ Error)
// =================================================================

function getSecret(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || "";
}

function transcribeVoice(blob) {
  return "ระบบแปลงเสียงเป็นข้อความอยู่ระหว่างการพัฒนาครับ";
}

function notifyAdminOnError(subject, body) {
  try {
    const adminIds = (getDynamicConfig("ADMIN_LINE_IDS") || getDynamicConfig("ADMIN_LINE_ID") || "").split(",").map(s => s.trim()).filter(Boolean);
    const token = getSecret("LINE_CHANNEL_ACCESS_TOKEN");
    if (!token || adminIds.length === 0) return false;

    adminIds.forEach(id => {
      const payload = {
        to: id,
        messages: [{ type: "text", text: `⚠️ ${subject}\n\n${body}` }]
      };
      UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
        method: "post",
        headers: { "Authorization": "Bearer " + token },
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
    });
    return true;
  } catch (e) {
    console.error("notifyAdminOnError error: " + e.message);
    return false;
  }
}

function appendAutoMatchAudit(pending, action, appliedBy, appliedByRole) {
  try {
    const ssId = getSecret("EXTERNAL_DATABASE_ID");
    if (!ssId) return false;

    const ss = typeof getCachedSpreadsheet === 'function' ? getCachedSpreadsheet(ssId) : SpreadsheetApp.openById(ssId);
    let sheet = ss.getSheetByName("AUTO_MATCH_AUDIT");
    if (!sheet) {
      sheet = ss.insertSheet("AUTO_MATCH_AUDIT");
      sheet.getRange(1, 1, 1, 8).setValues([["timestamp", "userId", "type", "original", "suggestion", "score", "action", "action_by"]]);
      sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#D9EAD3");
      sheet.setFrozenRows(1);
    }
    const rows = [];
    const userId = (pending && pending.data && pending.data.userId) ? pending.data.userId : "unknown";
    const ts = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");

    (pending.suggestions || []).forEach(s => {
      const originalShort = (s.original || "").toString().slice(0, 80);
      const suggestionShort = (s.suggestion || "").toString().slice(0, 80);
      rows.push([ts, userId, s.type || "employee", originalShort, suggestionShort, s.score || "", action || "", appliedBy || appliedByRole || "system"]);
    });

    if (rows.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    return true;
  } catch (e) {
    console.error("appendAutoMatchAudit error: " + e.message);
    return false;
  }
}

function applySuggestionsForUser(targetUserId, appliedBy) {
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(`PENDING_SUGGESTIONS_${targetUserId}`);
    if (!raw || raw === "CLEARED") return { success: false, message: "ไม่มี suggestion รออยู่สำหรับผู้ใช้คนนี้" };
    const pending = JSON.parse(raw);

    (pending.suggestions || []).forEach(s => {
      if (s.type === "employee") {
        const emp = pending.data.employees && pending.data.employees[s.index];
        if (emp && emp.suggested_name) emp.firstname = emp.suggested_name;
      } else if (s.type === "site") {
        pending.data.default_site = s.suggestion;
      }
    });

    appendAutoMatchAudit(pending, "accepted_by_admin", appliedBy, "admin");
    cache.put(`PENDING_SUGGESTIONS_${targetUserId}`, "CLEARED", 1);
    return { success: true, message: "Applied suggestions successfully.", data: pending.data };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function clearPendingSuggestionsForUser(targetUserId, clearedBy) {
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(`PENDING_SUGGESTIONS_${targetUserId}`);
    if (!raw) return { success: false, message: "ไม่มี suggestion รออยู่" };

    const pending = JSON.parse(raw);
    appendAutoMatchAudit(pending, "cleared", clearedBy || "system");
    cache.put(`PENDING_SUGGESTIONS_${targetUserId}`, "CLEARED", 1);
    return { success: true, message: "Cleared" };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function getValidNamesForAI() {
  try {
    const ssId = getSecret("EXTERNAL_DATABASE_ID");
    const sheetName = getSecret("DATABASE_SHEET_NAME") || "รายชื่อพนักงาน";
    const sheet = typeof getCachedSheet === 'function' ? getCachedSheet(ssId, sheetName) : SpreadsheetApp.openById(ssId).getSheetByName(sheetName);
    const last = sheet.getLastRow();
    if (last < 2) return "";
    const data = sheet.getRange(2, 5, last - 1, 1).getValues();
    return data.map(r => r[0]).filter(n => n).join(", ");
  } catch (e) { return "ไม่สามารถดึงรายชื่อได้"; }
}

function callGeminiText(userText) {
  try {
    const model = getSecret("MODEL_NAME") || "gemini-2.5-flash";
    const apiKey = getSecret("GEMINI_API_KEY_WEB") || getSecret("GEMINI_API_KEY_LINE");
    if (!apiKey) return { success: false, text: "Error: API Key not found in system" };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ contents: [{ parts: [{ text: userText }] }] }),
      muteHttpExceptions: true
    });
    const json = JSON.parse(res.getContentText());
    if (json.candidates && json.candidates.length > 0) return { success: true, text: json.candidates[0].content.parts[0].text };
    return { success: false, text: "Error: no candidate" };
  } catch (e) { return { success: false, text: "Error: " + e.message }; }
}

function asyncLog(data) { console.log(data); }