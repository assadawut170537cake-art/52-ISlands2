var CORE_DB = {
  START_ROW: 3,
  COL_NAME_CHECK: 4,
  COL_SITE: 6,
  COL_WORK: 7,
  COL_NORMAL_HR: 8,
  COL_OT_M_IN: 11,
  COL_OT_M_OUT: 12,
  COL_OT_N_IN: 13,
  COL_OT_N_OUT: 14,
  COL_OT_E_IN: 15,
  COL_OT_E_OUT: 16,
  COL_OT_TOTAL: 17,
  COL_ACCOM: 20
};

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
// ฟังก์ชันที่ 2: บันทึกรายงานประจำวันลงชีตรายวัน
// =====================================================================
function saveDailyReport(payload) {
  var lock = LockService.getScriptLock();
  try {
    // 🛡️ ป้องกัน Race Condition ด้วยการล็อกระบบ 30 วินาที (ปลอดภัยกว่า 10 วินาที)
    lock.waitLock(30000);

    var dateStr = payload.date; // ฟอร์แมต yyyy-mm-dd
    var site = payload.site;
    var normalHour = Number(payload.normalHour) || 0;
    var otTotal = Number(payload.otTotal) || 0;
    var employees = payload.employees;
    var isAdmin = payload.isAdmin === true; // สิทธิ์การบันทึกพิเศษ (ต้องแนบมาจากหน้าบ้าน)

    if (!employees || employees.length === 0) {
      return { success: false, message: "ไม่พบรายชื่อพนักงานที่เลือก" };
    }

    // 🚨 Server-Side Validation: ตรวจสอบและบล็อกการลงข้อมูลย้อนหลังเกิน 2 วัน
    var parts = dateStr.split('-');
    var targetDate = new Date(parts[0], parts[1] - 1, parts[2]);
    targetDate.setHours(0, 0, 0, 0);

    var todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    var diffDays = Math.ceil((todayDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

    // หากบันทึกย้อนหลังเกิน 2 วัน และไม่ใช่แอดมิน ให้ปฏิเสธการบันทึก
    if (diffDays > 2 && !isAdmin) {
      return {
        success: false,
        message: "ระบบแจ้งเตือน: ไม่อนุญาตให้บันทึกข้อมูลย้อนหลังเกิน 2 วัน (กรุณาให้ Admin เป็นผู้ดำเนินการ)"
      };
    }

    // แปลงวันที่ yyyy-mm-dd ให้เป็นฟอร์แมตภาษาไทย "วัน เดือน พ.ศ."
    var thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    var thaiFullDate = targetDate.getDate() + " " + thaiMonths[targetDate.getMonth()] + " " + (targetDate.getFullYear() + 543);

    // เปิดระบบจัดการในสเปรดชีตปัจจุบัน
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(thaiFullDate);

    // ตรวจสอบเชิงลึก: ถ้ายังไม่มีแผ่นงานของวันนั้นๆ ให้สร้างใหม่พร้อมหัวตาราง
    if (!sheet) {
      sheet = ss.insertSheet(thaiFullDate);
      sheet.appendRow(["วันที่บันทึก", "ไซต์งาน", "รหัส/ชื่อพนักงาน", "ชั่วโมงปกติ", "ชั่วโมง OT"]);
      // ตกแต่งหัวตารางพื้นฐาน
      sheet.getRange("A1:E1").setBackground("#f1f5f9").setFontWeight("bold").setHorizontalAlignment("center");
    }

    // Loop บันทึกข้อมูลพนักงานทุกคนที่เลือกแยกเป็นรายแถว
    for (var i = 0; i < employees.length; i++) {
      sheet.appendRow([dateStr, site, employees[i], normalHour, otTotal]);
    }

    return { success: true, message: "บันทึกข้อมูลเข้าชีต " + thaiFullDate + " สำเร็จ (" + employees.length + " คน)" };

  } catch (err) {
    return { success: false, message: "Backend Error: " + err.toString() };
  } finally {
    // เช็คก่อนปลดล็อกเสมอ เพื่อป้องกัน Error กรณี Lock หมดอายุไปแล้ว
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}
function doGet(e) {
  // โหลดหน้า index.html และตั้งค่า Viewport สำหรับมือถือ
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Smart Worksite System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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