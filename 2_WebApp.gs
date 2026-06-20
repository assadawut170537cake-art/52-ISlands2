// ⚠️ [CONSOLIDATED] CORE_DB ถูกรวมไปไว้ที่ 4_CoreDatabase.gs เป็นแหล่งเดียว (Single Source of Truth)
// ป้องกัน var ประกาศซ้ำที่ทำให้ค่าคอลัมน์ผิดเพี้ยนได้

// =================================================================
// 2_WebApp.gs (ระบบ Web Dashboard และ Spreadsheet UI)
// =================================================================

/**
 * 🔗 API สำหรับให้ Web App ในอนาคตเรียกใช้ตั้งค่าระบบ
 */
function apiSaveConfigFromWeb(key, value) {
  return setDynamicConfig(key, value);
}
// =====================================================================
// ฟังก์ชันที่ 1: ดึงข้อมูลพนักงาน
// =====================================================================
function getEmployeeData() {
  try {
    // 1. ค้นหาไฟล์ด้วยชื่อในระบบ Google Drive
    var files = DriveApp.getFilesByName('ไฟล์ DATA');
    if (!files.hasNext()) {
      return []; // หากไม่พบไฟล์ จะส่งอาเรย์ว่างกลับไปป้องกันระบบล่ม
    }

    var file = files.next();
    var ss = SpreadsheetApp.open(file);

    // 🎯 กำหนดให้ค้นหาจากชีต 'รายชื่อพนักงาน' เป็นหลักก่อน (หากไม่พบถึงจะดึงชีตแรก)
    var sheet = ss.getSheetByName('รายชื่อพนักงาน') || ss.getSheets()[0];
    var values = sheet.getDataRange().getValues();
    var employeeList = [];

    // 2. เริ่มทำงานที่แถว 2 (i = 1) เพื่อข้ามหัวตารางข้อมูล
    for (var i = 1; i < values.length; i++) {
      var row = values[i];

      // ตรวจสอบ Null Check พื้นฐานและทำความสะอาด String เพื่อความแม่นยำของรหัส
      if (row[13] && String(row[13]).trim() !== "") {
        employeeList.push({
          A: row[0], // ลำดับ
          B: row[1], // คำนำหน้า
          C: row[2], // ชื่อจริง
          D: row[3], // นามสกุล
          E: row[4], // ชื่อ-นามสกุลเต็ม
          J: row[9], // กลุ่มที่พักพนักงาน
          K: row[10], // สถานะทำงานปัจจุบัน
          N: String(row[13]).trim() // รหัสพนักงานประจำตัว
        });
      }
    }
    return employeeList;

  } catch (error) {
    Logger.log("Error ในฟังก์ชัน getEmployeeData: " + error.toString());
    return [];
  }
}
// =====================================================================
// ฟังก์ชันที่ 2: บันทึกรายงานประจำวันลงชีตรายวัน (ไฟล์ประจำเดือน)
// ⚠️ แก้ไขแล้ว: ใช้ openById + MONTHLY_FILE_IDS แทน getActiveSpreadsheet()
//    เพราะ Web App ไม่มี "active spreadsheet" ทำให้ไม่เคยบันทึกลงชีตจริงได้
// =====================================================================
function saveDailyReport(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    var dateStr = payload.date; // ฟอร์แมต yyyy-mm-dd
    var site = payload.site;
    var normalHour = Number(payload.normalHour) || 0;
    var otTotal = Number(payload.otTotal) || 0;
    var employees = payload.employees;
    var isAdmin = payload.isAdmin === true;

    if (!employees || employees.length === 0) {
      return { success: false, message: "ไม่พบรายชื่อพนักงานที่เลือก" };
    }

    // 🚨 Server-Side Validation: ตรวจสอบวันที่ย้อนหลัง
    var parts = dateStr.split('-');
    var targetDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    targetDate.setHours(0, 0, 0, 0);

    var todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    var diffDays = Math.ceil((todayDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
    var backdateLimit = parseInt(getDynamicConfig("BACKDATE_LIMIT") || "2");

    if (diffDays > backdateLimit && !isAdmin) {
      return {
        success: false,
        message: "ระบบแจ้งเตือน: ไม่อนุญาตให้บันทึกข้อมูลย้อนหลังเกิน " + backdateLimit + " วัน (กรุณาให้ Admin เป็นผู้ดำเนินการ)"
      };
    }

    // 🎯 ดึง File ID ของไฟล์เดือนที่ต้องการจาก MONTHLY_FILE_IDS
    var monthIndex = targetDate.getMonth(); // 0-11
    var targetFileId = "";
    
    if (typeof MONTHLY_FILE_IDS !== 'undefined' && MONTHLY_FILE_IDS[monthIndex]) {
      targetFileId = MONTHLY_FILE_IDS[monthIndex];
    } else if (typeof getTargetFileIdByDateOptimized === 'function') {
      // Fallback: ใช้ฟังก์ชัน getTargetFileIdByDateOptimized จาก SharedFunctions
      var ddmmyyyy = targetDate.getDate() + "/" + (targetDate.getMonth() + 1) + "/" + targetDate.getFullYear();
      targetFileId = getTargetFileIdByDateOptimized(ddmmyyyy);
    }
    
    if (!targetFileId) {
      return { success: false, message: "ไม่พบไฟล์ Google Sheets สำหรับเดือนนี้ (เดือนที่ " + (monthIndex + 1) + ")" };
    }

    // 📂 เปิดไฟล์ด้วย openById (ทำงานได้ทั้งใน Web App และ Spreadsheet context)
    var ss = SpreadsheetApp.openById(targetFileId);

    // แปลงวันที่เป็นชื่อแท็บภาษาไทย "วัน เดือน พ.ศ."
    var thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    var thaiFullDate = targetDate.getDate() + " " + thaiMonths[targetDate.getMonth()] + " " + (targetDate.getFullYear() + 543);

    // 🔍 ค้นหาแท็บชีตแบบ Tolerant (รองรับช่องว่างต่าง)
    var sheet = ss.getSheetByName(thaiFullDate);
    if (!sheet) {
      var allSheets = ss.getSheets();
      var cleanTarget = thaiFullDate.replace(/\s+/g, "");
      for (var s = 0; s < allSheets.length; s++) {
        if (allSheets[s].getName().replace(/\s+/g, "") === cleanTarget) {
          sheet = allSheets[s];
          break;
        }
      }
    }

    if (!sheet) {
      return { success: false, message: "ไม่พบแท็บชีตวันที่: " + thaiFullDate + " ในไฟล์เดือนที่ " + (monthIndex + 1) + " (กรุณาสร้างแท็บวันที่ในไฟล์ก่อน)" };
    }

    // ✅ บันทึกข้อมูลพนักงานลงแถวใหม่ในชีต
    for (var i = 0; i < employees.length; i++) {
      sheet.appendRow([dateStr, site, employees[i], normalHour, otTotal]);
    }

    // 📝 บันทึก Audit Trail
    if (typeof logToCloud === "function") {
      logToCloud("WEB_APP", "INFO", "SAVE_DAILY_REPORT SUCCESS: " + site + " | " + employees.length + " คน", { user: Session.getActiveUser().getEmail() || "WEB_USER", Date: thaiFullDate });
    }

    return { success: true, message: "บันทึกข้อมูลเข้าชีต " + thaiFullDate + " สำเร็จ (" + employees.length + " คน)" };

  } catch (err) {
    // บันทึก Error ลง Audit
    if (typeof logToCloud === "function") {
      logToCloud("WEB_APP", "ERROR", "SAVE_DAILY_REPORT ERROR: " + err.toString(), { payload: JSON.stringify(payload).substring(0, 500) });
    }
    return { success: false, message: "Backend Error: " + err.toString() };
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}
function doGet(e) {
  // ============================================================
  // MAIN ROUTER
  // ============================================================
  try {
    // 1. เรียกใช้งาน Router หลักจาก WebApp_GeminiTools.gs
    if (typeof handleGeminiWebTool === 'function') {
      return handleGeminiWebTool(e);
    }
    
    // 2. Fallback กรณีหาฟังก์ชันไม่เจอ
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('Smart Worksite System')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    if (typeof logToCloud === 'function') {
      logToCloud("System_WebApp", "ERROR", "Main Router doGet Error: " + err.message, { event: e });
    }
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('Smart Worksite System (Error Recovery)');
  }
}
function fetchGoogleChatSpaces() {
  try {
    // ต้องเปิด Advanced Google Services: Google Chat API ในโปรเจกต์ด้วย
    const token = ScriptApp.getOAuthToken();
    const url = 'https://chat.googleapis.com/v1/spaces';

    const options = {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    return { spaces: result.spaces || [] };
  } catch (err) {
    console.error("Error fetching spaces: " + err);
    // ส่งค่า Mock กลับไปกรณีเกิด Error เพื่อให้ UI ทำงานต่อได้
    return { spaces: [{ name: 'spaces/1', displayName: 'Project Alpha (Mock)' }] };
  }
}

function sendGoogleChatMessage(spaceName, text) {
  try {
    const token = ScriptApp.getOAuthToken();
    const url = `https://chat.googleapis.com/v1/${spaceName}/messages`;

    const payload = { text: text };

    const options = {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    if (result.error) {
      throw new Error(result.error.message);
    }

    return { success: true };
  }
  catch (err) {
    throw new Error("Failed to send message: " + err.message);
  }
}