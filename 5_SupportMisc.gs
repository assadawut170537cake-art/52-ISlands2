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
    const adminIds = (getSecret("ADMIN_LINE_IDS") || getSecret("ADMIN_LINE_ID") || "").split(",").map(s => s.trim()).filter(Boolean);
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

function logErrorToSheet(fileId, originalMsg, errorMsg) {
  if (!fileId) return;
  try {
    const ss = SpreadsheetApp.openById(fileId);
    let logSheet = ss.getSheetByName("Error_Log") || ss.insertSheet("Error_Log");
    if (logSheet.getLastRow() === 0) {
      logSheet.appendRow(["วัน-เวลาที่แจ้ง", "ข้อความจากไลน์ (ต้นฉบับ)", "สาเหตุที่แจ้งเตือน", "สถานะการตรวจสอบ"]);
      logSheet.getRange("A1:D1").setFontWeight("bold").setBackground("#FFD966").setHorizontalAlignment("center");
      logSheet.setFrozenRows(1);
    }
    const timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
    logSheet.appendRow([timestamp, originalMsg, errorMsg, "รอตรวจสอบ ❌"]);
    const lastRow = logSheet.getLastRow();
    if (lastRow > 1000) logSheet.deleteRows(2, lastRow - 1000); // กันชีตเต็ม
  } catch (e) { console.error("Log Error Failed: " + e.message); }
}

function handleTestMode(content, replyToken) {
  const props = PropertiesService.getScriptProperties();
  const targetFileId = typeof getTargetFileIdByDate === 'function' ? getTargetFileIdByDate(null) : null;
  if (!targetFileId) { reply(replyToken, "ไม่พบไฟล์สำหรับโหมดทดสอบ"); return; }

  const ss = SpreadsheetApp.openById(targetFileId);
  const mName = (props.getProperty("MONTH_NAME") || Utilities.formatDate(new Date(), "GMT+7", "MMMM"));

  if (content === "ทดสอบระบบ") {
    props.setProperty("IS_TESTING", "TRUE");
    ["1-31 " + mName, "สรุป " + mName].forEach(sName => {
      let original = ss.getSheetByName(sName);
      if (original) {
        let backupName = "_BK_" + sName.replace(/\s/g, "");
        let oldBk = ss.getSheetByName(backupName);
        if (oldBk) ss.deleteSheet(oldBk);
        original.copyTo(ss).setName(backupName).hideSheet();
      }
    });
    reply(replyToken, "🧪 เปิดการทดสอบระบบเรียบร้อย! (ข้อมูลจะถูกสำรองไว้ชั่วคราว)");
  } else if (content === "ปิดโหมดทดสอบ") {
    props.setProperty("IS_TESTING", "FALSE");
    ["1-31 " + mName, "สรุป " + mName].forEach(sName => {
      let backupName = "_BK_" + sName.replace(/\s/g, "");
      let backup = ss.getSheetByName(backupName);
      let original = ss.getSheetByName(sName);
      if (backup && original) {
        const data = backup.getDataRange().getValues();
        original.clearContents();
        original.getRange(1, 1, data.length, data[0].length).setValues(data);
        ss.deleteSheet(backup);
      }
    });
    reply(replyToken, "🧹 ปิดโหมดทดสอบเรียบร้อย! (กู้คืนข้อมูลเดิมเรียบร้อยครับ)");
  }
}

function recordLeaveData(name, type, date) {
  try {
    const ss = SpreadsheetApp.openById(getSecret("EXTERNAL_DATABASE_ID"));
    const leaveSheetName = getSecret("LEAVE_SHEET_NAME") || "ข้อมูลการลา";
    const sheet = ss.getSheetByName(leaveSheetName) || ss.insertSheet(leaveSheetName);
    sheet.appendRow([new Date(), name, type, date]);
    return `✅ บันทึกการลาของ ${name} ประเภท ${type} วันที่ ${date} เรียบร้อยแล้ว`;
  } catch (e) { return `❌ เกิดข้อผิดพลาด: ${e.message}`; }
}

function handleCheckAbsent(date) {
  return `📊 รายงานคนขาดวันที่ ${date}:\nระบบกำลังอยู่ระหว่างการเชื่อมโยงฐานข้อมูลการลาครับ`;
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

function undoLastEntry(name, dateStr) {
  try {
    const targetFileId = typeof getTargetFileIdByDate === 'function' ? getTargetFileIdByDate(dateStr) : null;
    if (!targetFileId) return "❌ ไม่พบไฟล์ของเดือนนี้";
    const ss = SpreadsheetApp.openById(targetFileId);
    const sheetName = typeof parseThaiDate === 'function' ? parseThaiDate(dateStr) : dateStr;
    const s = ss.getSheetByName(sheetName);
    if (!s) return "❌ ไม่พบหน้าวันที่ " + sheetName;

    // 🛠️ ปรับพิกัดให้ใช้ CORE_DB หากมี หรือบังคับ 3 ถ้าไม่พบ
    const startRow = (typeof CORE_DB !== 'undefined') ? CORE_DB.START_ROW : 3;
    const nameCol = (typeof CORE_DB !== 'undefined') ? CORE_DB.COL_NAME_CHECK : 4;

    const backup = s.getRange(1, 1, s.getLastRow(), s.getLastColumn()).getValues();
    const key = `UNDO_SNAPSHOT_${new Date().getTime()}`;

    try { PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(backup)); }
    catch (ce) { console.warn("Snapshot overflow skipped."); }

    const cleanName = typeof normalize === 'function' ? normalize(name) : name;
    const data = s.getRange(startRow, nameCol, s.getLastRow() - startRow + 1, 2).getValues();

    for (let i = 0; i < data.length; i++) {
      const rowFullName = typeof normalize === 'function' ? normalize((data[i][0] || "") + (data[i][1] || "")) : ((data[i][0] || "") + (data[i][1] || ""));
      if (rowFullName.includes(cleanName)) {
        s.getRange(i + startRow, 6, 1, 12).clearContent(); // ลบข้อมูล คอลัมน์ไซต์(6) ถึง รวมโอที(17)
        return `🗑️ ล้างข้อมูล ${name} วันที่ ${sheetName} เรียบร้อย (snapshot key: ${key})`;
      }
    }
    return `⚠️ ไม่พบชื่อ ${name} ในวันที่ ${sheetName}`;
  } catch (e) { return `❌ Error: ${e.message}`; }
}

function reply(token, text) {
  try {
    const LINE_TOKEN = getSecret("LINE_CHANNEL_ACCESS_TOKEN");
    const payload = { replyToken: token, messages: [{ type: "text", text }] };
    const response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
      method: "post",
      headers: { "Authorization": "Bearer " + LINE_TOKEN },
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

  } catch (e) {
    console.error("reply error: " + e.message);
  }
}

function asyncLog(data) { console.log(data); }

// =================================================================
// 8_ReportIntegration.gs (ระบบออกรายงานอัตโนมัติ 4 Services Integration)
// =================================================================

/**
 * 🚀 ฟังก์ชันหลัก: รวบรวมข้อมูลจาก Sheets + AdminDirectory 
 * สร้างเอกสารรายงานลง Drive และแจ้งเตือนผ่าน Google Chat
 */
function generateProjectReportAndNotify() {
  try {
    const props = PropertiesService.getScriptProperties();
    
    // 1. [SHEETS] เชื่อมต่อฐานข้อมูลและดึงรายชื่อพนักงาน
    const dbId = props.getProperty("EXTERNAL_DATABASE_ID");
    if (!dbId) throw new Error("ไม่พบ EXTERNAL_DATABASE_ID ในระบบ");
    
    // ใช้ getCachedSheet จากระบบเดิมเพื่อความรวดเร็ว
    const employeeSheet = typeof getCachedSheet === 'function' 
      ? getCachedSheet(dbId, props.getProperty("SHEET_STAFF") || "รายชื่อพนักงาน") 
      : SpreadsheetApp.openById(dbId).getSheetByName(props.getProperty("SHEET_STAFF") || "รายชื่อพนักงาน");

    if (!employeeSheet) throw new Error("ไม่พบหน้าชีต 'รายชื่อพนักงาน'");

    const employeeData = employeeSheet.getDataRange().getValues();
    // นับเฉพาะพนักงานที่มีสถานะ "ทำงาน" หรือ "ปกติ" (คอลัมน์ K = 10)
    let activeEmployeesCount = 0;
    for (let i = 1; i < employeeData.length; i++) {
      if (employeeData[i][10] === "ทำงาน" || employeeData[i][10] === "ปกติ") {
        activeEmployeesCount++;
      }
    }
    
    // 2. [ADMIN DIRECTORY] เช็กข้อมูลอีเมลผู้ใช้งานและตำแหน่ง/แผนก
    const userEmail = Session.getActiveUser().getEmail();
    let userDetails = "ผู้ดูแลระบบ (Admin)";
    
    try {
      // ดึงข้อมูลจาก Google Workspace
      const userProfile = AdminDirectory.Users.get(userEmail);
      userDetails = userProfile.organizations ? userProfile.organizations[0].title : "พนักงาน";
    } catch (err) {
      Logger.log("Info: ไม่สามารถดึงข้อมูล AdminDirectory ได้ (อาจรันด้วยบัญชี Gmail ทั่วไป): " + err.message);
    }

    // 3. [DRIVE] สร้างและจัดเก็บไฟล์รายงาน
    const baseFolderId = props.getProperty("DRIVE_FOLDER_ID");
    let targetFolder;
    
    if (baseFolderId) {
      targetFolder = DriveApp.getFolderById(baseFolderId);
    } else {
      // ถ้าไม่ได้ตั้งค่า ID ไว้ ให้สร้างโฟลเดอร์ใหม่ที่ Root
      const folderName = "รายงานโปรเจค Attendance";
      const folders = DriveApp.getFoldersByName(folderName);
      targetFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    }
    
    const reportTitle = "สรุปยอดพนักงานปัจจุบัน_" + Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
    const doc = DocumentApp.create(reportTitle);
    const docFile = DriveApp.getFileById(doc.getId());
    
    // ย้ายไฟล์เข้าโฟลเดอร์เป้าหมาย
    targetFolder.addFile(docFile);
    DriveApp.getRootFolder().removeFile(docFile); 
    
    // เขียนเนื้อหาลงในเอกสาร
    const body = doc.getBody();
    body.appendParagraph("📊 สรุปรายงานระบบ Smart Worksite");
    body.appendParagraph("วันที่: " + Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss"));
    body.appendParagraph("ผู้ดำเนินการ: " + userEmail + " (" + userDetails + ")");
    body.appendParagraph("จำนวนพนักงานที่พร้อมปฏิบัติงาน: " + activeEmployeesCount + " คน");
    doc.saveAndClose();

    // 4. [CHAT] ส่งข้อความแจ้งเตือนพร้อมลิงก์ไฟล์
    // **ข้อควรจำ:** คุณต้องไปเพิ่ม 'GOOGLE_CHAT_WEBHOOK_URL' ในฟังก์ชัน INITIAL_SETUP_PROPERTIES หรือตั้งค่าผ่านหน้า Script Properties
    const chatWebhookUrl = props.getProperty("GOOGLE_CHAT_WEBHOOK_URL"); 
    
    if (chatWebhookUrl) {
      const payload = {
        "text": "📊 *อัปเดตรายงานสรุปผลพนักงาน*\n" +
                "👤 *ผู้สร้าง:* " + userEmail + "\n" +
                "👥 *พนักงานที่พร้อมทำงาน:* " + activeEmployeesCount + " คน\n" +
                "📁 *ดูเอกสารรายงาน:* " + docFile.getUrl()
      };
      
      const options = {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify(payload)
      };
      
      UrlFetchApp.fetch(chatWebhookUrl, options);
    } else {
      Logger.log("ไม่ได้ตั้งค่า GOOGLE_CHAT_WEBHOOK_URL จึงข้ามการส่งแจ้งเตือนเข้า Chat");
    }

    return "ออกรายงานและส่งแจ้งเตือนสำเร็จ ดูไฟล์ได้ที่: " + docFile.getUrl();

  } catch (error) {
    const errorMsg = "เกิดข้อผิดพลาด: " + error.toString();
    Logger.log(errorMsg);
    
    // ใช้ระบบแจ้งเตือนแอดมินเดิมของคุณถ้า Error
    if (typeof notifyAdminOnError === "function") {
      notifyAdminOnError("ระบบออกรายงานล้มเหลว", errorMsg);
    }
    return errorMsg;
  }
}