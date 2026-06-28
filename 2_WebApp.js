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
    var dbId = (typeof GLOBAL_CONFIG !== 'undefined' && GLOBAL_CONFIG.EXTERNAL_DATABASE_ID) ? GLOBAL_CONFIG.EXTERNAL_DATABASE_ID : '1SSbgN9lmObsAyrqjykFttqNbCVDd3yhUq47yT8Z_Agk';
    if (typeof getDynamicConfig === 'function') {
      var configDbId = getDynamicConfig("EMPLOYEE_SHEET_ID") || getDynamicConfig("EXTERNAL_DATABASE_ID");
      if (configDbId) dbId = configDbId;
    }
    
    var ss = SpreadsheetApp.openById(dbId);

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
    
    // ถ้าไม่มีข้อมูลเลย ให้ส่งข้อมูลแจ้งเตือน
    if (employeeList.length === 0) {
      employeeList.push({ A: 1, B: 'SYS', C: 'NoData', D: 'Found', E: 'SYS NoData Found in Sheet', J: 'System', K: 'ปกติ', N: 'ERROR-01' });
    }
    
    return employeeList;
  } catch(e) {
    console.error("getEmployeeData error:", e);
    // ส่ง Error กลับไปเป็นข้อมูลพนักงานเพื่อให้หน้าเว็บแสดงผลว่าพังเพราะอะไร
    return [{
      A: 1, B: 'ERR', C: 'Exception', D: '', E: 'ERR: ' + e.message, J: 'System', K: 'ปกติ', N: 'ERROR-02'
    }];
  }
}
// =====================================================================
// ฟังก์ชันที่ 2: บันทึกรายงานประจำวันลงชีตรายวัน (ไฟล์ประจำเดือน)
// ⚠️ แก้ไขแล้ว: ใช้ openById + MONTHLY_FILE_IDS แทน getActiveSpreadsheet()
//    เพราะ Web App ไม่มี "active spreadsheet" ทำให้ไม่เคยบันทึกลงชีตจริงได้
// =====================================================================
function doGet(e) {
  if (e && e.parameter && e.parameter.debug) {
    try {
      const monthIndex = new Date().getMonth();
      const targetFileId = getDynamicConfig("MONTHLY_FILE_IDS")[monthIndex];
      const ss = SpreadsheetApp.openById(targetFileId);
      const sheet = ss.getSheets()[0];
      const names = sheet.getRange(3, 4, 10, 1).getValues();
      return ContentService.createTextOutput("Top 10 names in Daily Sheet:\n" + JSON.stringify(names));
    } catch(err) {
      return ContentService.createTextOutput("Debug Error: " + err.message);
    }
  }
  // โหลดหน้า index.html และตั้งค่า Viewport สำหรับมือถือ
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Smart Worksite System')
    .setFaviconUrl('https://i.ibb.co/N3w3P9pS/52.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

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
      if (typeof logAuditTrail === "function") {
        logAuditTrail("WEB_APP", "SAVE_DAILY_REPORT_PAYLOAD_FAIL", JSON.stringify(payload).substring(0, 500), "", 0, "ERROR", "Payload missing employees");
      }
      return { success: false, message: "ไม่พบรายชื่อพนักงานที่เลือก: Keys=" + Object.keys(payload).join(",") };
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
    } else if (typeof getTargetFileIdByDate === 'function') {
      // Fallback: ใช้ฟังก์ชัน getTargetFileIdByDate จาก SharedFunctions
      var ddmmyyyy = targetDate.getDate() + "/" + (targetDate.getMonth() + 1) + "/" + targetDate.getFullYear();
      targetFileId = getTargetFileIdByDate(ddmmyyyy);
    }
    
    if (!targetFileId) {
      return { success: false, message: "ไม่พบไฟล์ Google Sheets สำหรับเดือนนี้ (เดือนที่ " + (monthIndex + 1) + ")" };
    }

    // 📂 เปิดไฟล์ด้วย openById (ทำงานได้ทั้งใน Web App และ Spreadsheet context)
    var ss = SpreadsheetApp.openById(targetFileId);

    // แปลงวันที่เป็นชื่อแท็บภาษาไทย "วัน เดือน พ.ศ."
    var thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    var thaiFullDate = targetDate.getDate() + " " + thaiMonths[targetDate.getMonth()] + " " + (targetDate.getFullYear() + 543);

    // 🚀 ส่งต่อให้ตัวประมวลผลส่วนกลาง (writeToDailySheetBatch) เพื่อให้เป็นมาตรฐานเดียวกัน
    var employeesData = [];
    for (var i = 0; i < employees.length; i++) {
      var workerName = String(employees[i]).trim();
      
      employeesData.push({
        firstname: workerName,
        task: payload.note || "",
        accom: "-", // ไม่ได้ส่งมาจาก WebApp ให้คงเดิม
        has_ot_noon: false,
        ot_noon_in: "",
        ot_noon_out: ""
      });
    }

    var dataToProcess = {
      date: thaiFullDate,
      default_site: site,
      time_start: payload.timeIn || "",
      time_end: payload.timeOut || "",
      employees: employeesData
    };

    if (typeof writeToDailySheetBatch === 'function') {
      var writeRes = writeToDailySheetBatch(dataToProcess, "WEB_APP_USER", targetFileId);
      
      if (writeRes.count > 0) {
        // 📝 บันทึก Audit Trail
        if (typeof logAuditTrail === "function") {
          logAuditTrail("WEB_APP", "SAVE_DAILY_REPORT", site + " | " + writeRes.count + " คน", Session.getActiveUser().getEmail() || "WEB_USER", 0, "SUCCESS", "Date: " + thaiFullDate);
        }
        return { success: true, message: "บันทึกข้อมูลเข้าชีต " + thaiFullDate + " สำเร็จ (" + writeRes.count + " คน)" };
      } else {
        return { success: false, message: "บันทึกไม่สำเร็จ: " + (writeRes.errors ? writeRes.errors.join(", ") : "ไม่พบรายชื่อในชีต") };
      }
    } else {
      return { success: false, message: "ระบบประมวลผลส่วนกลาง (writeToDailySheetBatch) ไม่พร้อมใช้งาน" };
    }

  } catch (err) {
    // บันทึก Error ลง Audit
    if (typeof logAuditTrail === "function") {
      logAuditTrail("WEB_APP", "SAVE_DAILY_REPORT", JSON.stringify(payload).substring(0, 500), "", 0, "ERROR", err.toString());
    }
    return { success: false, message: "Backend Error: " + err.toString() };
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
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

function getSystemSettings() {
  if (!isAdmin(Session.getActiveUser().getEmail())) return { success: false, message: 'Unauthorized' };
  var props = PropertiesService.getScriptProperties().getProperties();
  var result = {};
  var keys = ['SYSTEM_STATUS', 'BACKDATE_LIMIT', 'FUZZY_THRESHOLD', 'LINE_CHANNEL_ACCESS_TOKEN', 'GEMINI_API_KEY_LINE', 'ADMIN_LINE_IDS'];
  keys.forEach(function(k) {
    result[k] = props[k] !== undefined ? props[k] : GLOBAL_CONFIG[k];
  });
  return { success: true, settings: result };
}

function saveSystemSettings(newSettings) {
  if (!isAdmin(Session.getActiveUser().getEmail())) return { success: false, message: 'Unauthorized' };
  try {
    var props = PropertiesService.getScriptProperties();
    var cache = CacheService.getScriptCache();
    for (var key in newSettings) {
      props.setProperty(key, newSettings[key]);
      cache.put('CONFIG_' + key, newSettings[key], 3600);
    }
    if (typeof logAuditTrail === 'function') logAuditTrail('ADMIN', 'UPDATE_SETTINGS_UI', 'Bulk Update', JSON.stringify(newSettings), 1.0, 'SUCCESS', 'Updated via WebApp UI');
    return { success: true, message: 'บันทึกการตั้งค่าเรียบร้อยแล้ว' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}