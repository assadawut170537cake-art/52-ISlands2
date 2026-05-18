// support_misc.gs
// ควบคุม Error Logs ป้องกันไฟล์หน่วง, โหมดสำรองข้อมูลทดสอบระบบ และคำสั่งถอนเวลาทำงานบุคคล (Undo)

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
    if (lastRow > 1000) logSheet.deleteRows(2, lastRow - 1000);
  } catch (e) { console.error("Log Error Failed: " + e.message); }
}

function handleTestMode(content, replyToken) {
  const props = PropertiesService.getScriptProperties();
  const targetFileId = getTargetFileIdByDate(null);
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

function handleCheckAbsent(date) { return `📊 รายงานคนขาดวันที่ ${date}:\nระบบกำลังอยู่ระหว่างการเชื่อมโยงฐานข้อมูลการลาครับ`; }
function transcribeVoice(blob) { return "สุ่มข้อมูลข้อความจากเสียง"; }

function getValidNamesForAI() {
  try {
    const ss = SpreadsheetApp.openById(getSecret("EXTERNAL_DATABASE_ID"));
    const sheet = ss.getSheetByName(getSecret("DATABASE_SHEET_NAME") || "รายชื่อพนักงาน");
    const last = sheet.getLastRow();
    if (last < 2) return "";
    const data = sheet.getRange(2, 5, last - 1, 1).getValues();
    return data.map(r => r[0]).filter(n => n).join(", ");
  } catch (e) { return "ไม่สามารถดึงรายชื่อได้"; }
}

function callGeminiText(userText) {
  try {
    const model = getSecret("MODEL_NAME") || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${getSecret("GEMINI_API_KEY")}`;
    const res = fetchWithRetry(url, { method: "post", contentType: "application/json", payload: JSON.stringify({ contents: [{ parts: [{ text: userText }] }] }), muteHttpExceptions: true }, 2, 300);
    const json = JSON.parse(res.getContentText());
    if (json.candidates && json.candidates.length > 0) return { success: true, text: json.candidates[0].content.parts[0].text };
    return { success: false, text: "Error: no candidate" };
  } catch (e) { return { success: false, text: "Error: " + e.message }; }
}

function undoLastEntry(name, dateStr) {
  try {
    const targetFileId = getTargetFileIdByDate(dateStr);
    if (!targetFileId) return "❌ ไม่พบไฟล์ของเดือนนี้";
    const ss = SpreadsheetApp.openById(targetFileId);
    const sheetName = parseThaiDate(dateStr);
    const s = ss.getSheetByName(sheetName);
    if (!s) return "❌ ไม่พบหน้าวันที่ " + sheetName;

    const startRow = (typeof CORE !== 'undefined') ? CORE.START_ROW : 3;
    const nameCol = (typeof CORE !== 'undefined') ? CORE.COL_NAME_CHECK : 4;
    const backup = s.getRange(1, 1, s.getLastRow(), s.getLastColumn()).getValues();
    const key = `UNDO_SNAPSHOT_${new Date().getTime()}`;

    try { PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(backup)); } catch (ce) { console.warn("Snapshot overflow skipped."); }

    const cleanName = normalize(name);
    const data = s.getRange(startRow, nameCol, s.getLastRow() - startRow + 1, 2).getValues();
    for (let i = 0; i < data.length; i++) {
      if (normalize((data[i][0] || "") + (data[i][1] || "")).includes(cleanName)) {
        s.getRange(i + startRow, 6, 1, 12).clearContent();
        return `🗑️ ล้างข้อมูล ${name} วันที่ ${sheetName} เรียบร้อย (snapshot key: ${key})`;
      }
    }
    return `⚠️ ไม่พบชื่อ ${name} ในวันที่ ${sheetName}`;
  } catch (e) { return `❌ Error: ${e.message}`; }
}

/**
 * ฟังก์ชันส่งข้อความกลับหา LINE (เปลี่ยนชื่อจาก replyLegacy เป็น reply เพื่อให้ตรงกับที่ doPost เรียกใช้)
 */
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

    // 🛠️ เปิดระบบส่อง Log ดูผลลัพธ์การตอบกลับจาก LINE Server
    Logger.log("LINE Response Code: " + response.getResponseCode());
    Logger.log("LINE Response Body: " + response.getContentText());

  } catch (e) { 
    console.error("reply error: " + e.message); 
  }
}
function asyncLog(data) { console.log(data); }