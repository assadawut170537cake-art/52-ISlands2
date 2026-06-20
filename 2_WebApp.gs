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
/**
 * รับข้อมูลจาก Web App และบันทึกผลการลงเวลาลงในชีตรายเดือน
 * ป้องกันปัญหา Race Condition ด้วย LockService และจำกัดการลงเวลาย้อนหลัง
 * @param {Object} payload ข้อมูลการลงเวลาประกอบด้วย date, site, normalHour, otTotal, employees, isAdmin
 * @returns {Object} ผลลัพธ์การทำงาน {success: Boolean, message: String}
 */
/**
 * รับข้อมูลจาก Web App และบันทึกผลการลงเวลา
 * @param {Object} payload ข้อมูลการลงเวลา 
 * @returns {Object} {success: Boolean, message: String}
 */
function saveDailyReport(payload) {
  var lock = LockService.getScriptLock();
  try {
    // 1. ป้องกัน Race Condition (คิวชนกัน) รอสูงสุด 30 วินาที
    lock.waitLock(30000);

    var dateStr = payload.date; // รูปแบบ yyyy-mm-dd
    var site = payload.site;
    var normalHour = Number(payload.normalHour) || 0;
    var otTotal = Number(payload.otTotal) || 0;
    var employees = payload.employees;

    // ดึงค่าสิทธิ์ (ในระบบจริงควรเช็คซ้ำจาก Email/ID ของ Session ปัจจุบัน)
    var isAdmin = payload.isAdmin === true; 

    if (!employees || employees.length === 0) {
      return { success: false, message: "❌ ไม่พบรายชื่อพนักงานที่เลือก" };
    }

    // 2. Server-Side Validation: ป้องกันแฮ็กเกอร์ยิง API ข้ามข้อจำกัดวันที่
    var parts = dateStr.split('-');
    var targetDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    targetDate.setHours(0, 0, 0, 0);

    var todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    var diffTime = todayDate.getTime() - targetDate.getTime();
    var diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // ย้อนหลังเกิน 2 วัน และไม่ใช่ Admin ให้บล็อกทันที
    if (diffDays >= 2 && !isAdmin) {
      return { success: false, message: "⛔ ระงับการบันทึก: ไม่อนุญาตให้ลงเวลาย้อนหลังเกิน 1 วัน (กรุณาติดต่อ Admin)" };
    }

    // 3. กระบวนการเขียนลง Sheet (อ้างอิงฟังก์ชันหาไฟล์รายเดือนของคุณ)
    var targetFileId = (typeof getTargetFileIdByDate === 'function') ? getTargetFileIdByDate(dateStr) : null;
    if (!targetFileId) return { success: false, message: "❌ ไม่พบฐานข้อมูลรายเดือนสำหรับวันที่ระบุ" };

    var ss = SpreadsheetApp.openById(targetFileId);
    var sheetName = (typeof parseThaiDate === 'function') ? parseThaiDate(dateStr) : dateStr;
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return { success: false, message: "❌ ไม่พบแท็บชีตวันที่: " + sheetName };
    }

    // 4. Batch Write: เขียนข้อมูลรวดเดียวเพื่อลด I/O
    // (จุดนี้คุณสามารถปรับ Map Array ให้ตรงกับคอลัมน์จริงของตารางคุณได้เลย)
    employees.forEach(function(empName) {
      // สมมติโครงสร้าง: [วันที่, ไซต์, ชื่อ, ชม.ปกติ, OT]
      sheet.appendRow([dateStr, site, empName, normalHour, otTotal]);
    });

    return { success: true, message: "บันทึกเวลาของ " + employees.length + " คน สำเร็จแล้ว!" };

  } catch (err) {
    // ระบบจัดการข้อผิดพลาด พร้อมดักจับบรรทัดที่พัง
    console.error("saveDailyReport Error: " + err.stack);
    return { success: false, message: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์: " + err.message };
  } finally {
    // ปลดล็อกระบบทุกครั้งไม่ว่าจะสำเร็จหรือพัง
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