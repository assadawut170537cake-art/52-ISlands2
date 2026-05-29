// =================================================================
// 2_WebApp.gs (ระบบ Web Dashboard และ Spreadsheet UI)
// =================================================================

/**
 * 🔗 API สำหรับให้ Web App ในอนาคตเรียกใช้ตั้งค่าระบบ
 */
function apiSaveConfigFromWeb(key, value) {
  return setDynamicConfig(key, value);
}

// =================================================================
// 🏛️ สร้างหน้าต่างห้องรับแขก (UI Layout แบบเดิม)
// =================================================================
function createDashboardMenu() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Main Menu") || ss.insertSheet("Main Menu");
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  protections.forEach(p => p.remove());

  sheet.clear();
  sheet.getDataRange().clearDataValidations(); 
  sheet.setHiddenGridlines(true);
  sheet.getRange(1, 1, 30, 15).setBackground("#F8FAFC"); 
  sheet.setTabColor("#0F172A");

  sheet.setColumnWidth(1, 40); sheet.setColumnWidth(2, 45); sheet.setColumnWidth(3, 170); sheet.setColumnWidth(4, 30); 
  sheet.setColumnWidth(5, 45); sheet.setColumnWidth(6, 170); sheet.setColumnWidth(7, 30); 
  sheet.setColumnWidth(8, 45); sheet.setColumnWidth(9, 170); sheet.setColumnWidth(10, 40); 

  sheet.getRange("B2:I4").merge().setBackground("#0F172A").setValue("🏢 SMART WORKSITE DASHBOARD").setFontColor("#FFFFFF").setFontSize(24).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true, true, true, true, false, false, "#0F172A", SpreadsheetApp.BorderStyle.SOLID_THICK);
  sheet.getRange("B5:I5").merge().setBackground("#1E293B").setValue("💡 กดติ๊กถูก ☑️ ที่กล่องด้านซ้าย เพื่อเปิดเอกสาร (คลิกเพียง 1 ครั้ง)").setFontColor("#38BDF8").setFontSize(11).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");

  let unprotectedRanges = [sheet.getRange("A1")];

  function createPillButton(row, colCheck, colText, icon, label, isHighlight = false) {
    const checkCell = sheet.getRange(row, colCheck); const textCell = sheet.getRange(row, colText);
    const bgColor = isHighlight ? "#E0F2FE" : "#FFFFFF"; const borderColor = isHighlight ? "#38BDF8" : "#CBD5E1"; const textColor = isHighlight ? "#0284C7" : "#334155";
    checkCell.insertCheckboxes().setBackground(bgColor).setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true, true, true, false, false, false, borderColor, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    textCell.setValue(`${icon}  ${label}`).setBackground(bgColor).setFontColor(textColor).setFontSize(12).setFontWeight(isHighlight ? "bold" : "normal").setHorizontalAlignment("left").setVerticalAlignment("middle").setBorder(true, false, true, true, false, false, borderColor, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    unprotectedRanges.push(checkCell);
  }

  sheet.getRange("B7:I7").merge().setValue("⚙️ ส่วนจัดการระบบ (System)").setFontWeight("bold").setFontColor("#64748B").setFontSize(11);
  createPillButton(9, 2, 3, GLOBAL_CONFIG.ICONS.SYSTEM.SUMMARY, "สรุปภาพรวมปี"); createPillButton(9, 5, 6, GLOBAL_CONFIG.ICONS.SYSTEM.DATA, "ฐานข้อมูล (Admin)");
  createPillButton(11, 2, 3, GLOBAL_CONFIG.ICONS.SYSTEM.GUIDE, "คู่มือการใช้งาน"); createPillButton(11, 5, 6, GLOBAL_CONFIG.ICONS.SYSTEM.FEEDBACK, "แจ้งปัญหา");

  sheet.getRange("B13:I13").merge().setValue("📅 คลังข้อมูลรายเดือน (Monthly Vault)").setFontWeight("bold").setFontColor("#64748B").setFontSize(11);
  const currentMonthIndex = new Date().getMonth(); const monthRows = [15, 17, 19, 21]; let mIndex = 0;
  for (let r = 0; r < 4; r++) {        
    for (let c = 0; c < 3; c++) {    
      if (mIndex >= 12) break;
      const isCurrent = (mIndex === currentMonthIndex);
      createPillButton(monthRows[r], 2+(c*3), 3+(c*3), GLOBAL_CONFIG.ICONS.MONTHS[mIndex], `${GLOBAL_CONFIG.MONTH_LIST[mIndex]} ${isCurrent?"(ปัจจุบัน)":""}`, isCurrent);
      mIndex++;
    }
  }

  sheet.setRowHeight(2, 45); sheet.setRowHeight(5, 30); [7, 13].forEach(r => sheet.setRowHeight(r, 35)); 
  [9, 11, 15, 17, 19, 21].forEach(r => sheet.setRowHeight(r, 45)); [8, 10, 12, 14, 16, 18, 20].forEach(r => sheet.setRowHeight(r, 12)); 

  const protection = sheet.protect().setDescription('Lock Dashboard UI'); 
  protection.setUnprotectedRanges(unprotectedRanges); 
  sheet.getRange("A1").activate();
}

/**
 * 🚀 ฟังก์ชัน onEdit ศูนย์กลางควบคุมระบบ Smart Worksite
 * ควบคุมเมนูการนำทาง, ระบบ DevOps Changelog และการตรวจสอบคำซ้ำ
 */
function onEdit(e) {
  // 1. Guard Clauses: ตรวจสอบความสมบูรณ์ของ Event Object ป้องกัน Race Condition และ Null Pointer
  if (!e || !e.range) return;
  
  var range = e.range;
  var sheet = range.getSheet();
  var sheetName = sheet.getName();
  var row = range.getRow();
  var col = range.getColumn();
  
  // ดึงค่าอย่างปลอดภัย รองรับทั้งการพิมพ์ปกติและการติ๊ก Checkbox
  var value = e.value;
  if (value === undefined) {
    value = range.getValue();
  }

  // ==========================================
  // 🎯 ตรรกะส่วนที่ 1: Main Menu Navigator
  // ==========================================
  if (sheetName === "Main Menu" && (value === "TRUE" || value === true)) {
    var targetUrl = "";
    
    // กลุ่มเมนูหลักแถวที่ 9 และ 11
    if (row === 9) {
      targetUrl = (col === 2) ? GLOBAL_CONFIG.URLS.SUMMARY : (col === 5 ? GLOBAL_CONFIG.URLS.DATA : "");
    } else if (row === 11) {
      targetUrl = (col === 2) ? GLOBAL_CONFIG.URLS.GUIDE : (col === 5 ? GLOBAL_CONFIG.URLS.FEEDBACK : "");
    } 
    // กลุ่มปุ่มกดเลือกคลังข้อมูลรายเดือน (แถว 15, 17, 19, 21)
    else if (row >= 15 && row <= 21 && row % 2 !== 0) {
      // ตรวจสอบให้แน่ใจว่ากดเฉพาะคอลัมน์ที่เป็นปุ่ม (B=2, E=5, H=8)
      if (col === 2 || col === 5 || col === 8) {
        var subIndex = (col === 2) ? 0 : (col === 5 ? 1 : 2);
        var monthIndex = (Math.floor((row - 15) / 2) * 3) + subIndex;
        
        // ป้องกันดัชนีเกินขอบเขตอาร์เรย์เดือน (0-11)
        if (GLOBAL_CONFIG && GLOBAL_CONFIG.URLS && GLOBAL_CONFIG.URLS.MONTHS && monthIndex < GLOBAL_CONFIG.URLS.MONTHS.length) {
          targetUrl = GLOBAL_CONFIG.URLS.MONTHS[monthIndex];
        }
      }
    }

    // หากพบ URL ปลายทาง ให้ดำเนินการเปิดลิงก์และล้างสถานะปุ่มกดทันที
    if (targetUrl) {
      SpreadsheetApp.getActiveSpreadsheet().toast("⏳ กำลังเปิดเอกสาร กรุณารอสักครู่...", "🚀 ระบบทำงาน", 3);
      range.uncheck(); // ล้างกล่องติ๊กเพื่อพร้อมใช้งานในครั้งถัดไป
      sheet.getRange("A1").activate(); // ย้ายโฟกัสเพื่อความสวยงามของ UI
      if (typeof openLinkInNewTab === "function") {
        openLinkInNewTab(targetUrl);
      }
      return; // จบการทำงานตัดวงจรเพื่อประสิทธิภาพสูงสุด
    }
  }

  // ==========================================
  // ⚙️ ตรรกะส่วนที่ 2: DevOps Engine (System_Changelog)
  // ==========================================
  if (sheetName === "System_Changelog" && col === 8 && row > 1) {
    if (value === "🟢 เสถียรแล้ว (Lock Code)") {
      if (typeof handleLockCode === "function") {
        handleLockCode(e);
      }
    } else if (value === "🧪 กำลังทดสอบ") {
      sheet.getRange(row, 7).clearContent();
      e.source.toast("🗑️ ล้างรหัสในคลังสำรองออกแล้ว", "DevOps Engine", 4);
    }
  }

  // ==========================================
  // 🎨 ตรรกะส่วนที่ 3: Workspace Utilities (Code_Workspace)
  // ==========================================
  if (sheetName === "Code_Workspace" && col <= 3 && range.getLastColumn() >= 3 && row > 1) {
    if (typeof highlightDuplicateFunctions === "function") {
      highlightDuplicateFunctions();
    }
  }
}

function openLinkInNewTab(url) {
  const html = HtmlService.createHtmlOutput(`<html><body style="font-family: sans-serif; text-align: center; margin-top: 25px; color: #334155;"><h3 style="color: #1E3A8A;">กำลังเปิดเอกสาร...</h3><div class="loader" style="border: 4px solid #f3f3f3; border-top: 4px solid #38BDF8; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto;"></div><div id="fallback" style="display:none; margin-top:15px;"><small style="color:#DC2626;">เบราว์เซอร์บล็อกการเปิดอัตโนมัติ</small><br><br><a href="${url}" target="_blank" onclick="google.script.host.close()" style="padding: 10px 20px; background: #1E3A8A; color: white; text-decoration: none; border-radius: 6px; display: inline-block;">คลิกที่นี่เพื่อไปที่ไฟล์</a></div><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style><script>setTimeout(function() { var winRef = window.open('${url}', '_blank'); if (winRef) { google.script.host.close(); } else { document.getElementById('fallback').style.display = 'block'; document.querySelector('.loader').style.display = 'none'; } }, 500);</script></body></html>`).setWidth(320).setHeight(180);
  SpreadsheetApp.getUi().showModalDialog(html, '🚀 SMART WORKSITE DASHBOARD');
}

function createSupportSheets() { 
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetsToCreate = ["Summary", "Data", "Guide", "Feedback"];
  
  sheetsToCreate.forEach(name => {
    if (!ss.getSheetByName(name)) {
      let newSheet = ss.insertSheet(name);
      newSheet.getRange("A1").setValue(`ส่วนจัดเก็บข้อมูล: ${name}`).setFontWeight("bold");
    }
  });
  
  SpreadsheetApp.getActiveSpreadsheet().toast("สร้างชีตระบบสำเร็จแล้วครับ", "System", 3);
}

/**
 * 📥 รับข้อมูลจากหน้า Web App เพื่อบันทึกลงรายงานประจำวันรายเดือน
 * @param {Object} payload ข้อมูลการลงเวลาจาก Frontend
 */
function saveDailyReport(payload) {
  var lock = LockService.getScriptLock();
  try {
    // ป้องกันการยิงข้อมูลซ้อนกันในเสี้ยววินาที (Race Condition) ด้วยการล็อกระบบ 10 วินาที
    lock.waitLock(10000);
    
    var dateStr = payload.date; // ฟอร์แมต yyyy-mm-dd จาก <input type="date">
    var site = payload.site;
    var normalHour = Number(payload.normalHour) || 0;
    var otTotal = Number(payload.otTotal) || 0;
    var employees = payload.employees; // Array รายชื่อเต็มของพนักงาน
    
    if (!employees || employees.length === 0) {
      return { success: false, message: "ไม่พบรายชื่อพนักงานที่เลือก" };
    }
    
    // แปลงวันที่ yyyy-mm-dd ให้เป็นฟอร์แมตภาษาไทย "วัน เดือน พ.ศ." สำหรับชื่อชีตรายวัน
    var dateParts = dateStr.split('-');
    var dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    var thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    var thaiFullDate = dateObj.getDate() + " " + thaiMonths[dateObj.getMonth()] + " " + (dateObj.getFullYear() + 543);
    
    // เปิดระบบจัดการในสเปรดชีตปัจจุบัน
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(thaiFullDate);
    
    // ตรวจสอบเชิงลึก: ถ้ายังไม่มีแผ่นงานของวันนั้นๆ ให้สร้างใหม่พร้อมหัวตารางทันที
    if (!sheet) {
      sheet = ss.insertSheet(thaiFullDate);
      sheet.appendRow(["วันที่บันทึก", "ไซต์งาน", "รหัส/ชื่อพนักงาน", "ชั่วโมงปกติ", "ชั่วโมง OT"]);
      
      // ตกแต่งหัวตารางพื้นฐานให้เป็นระเบียบผ่านสคริปต์
      sheet.getRange("A1:E1").setBackground("#f1f5f9").setFontWeight("bold").setHorizontalAlignment("center");
    }
    
    // Loop บันทึกข้อมูลพนักงานทุกคนที่เลือกแยกเป็นรายแถวเพื่อนำไปทำ Dashboard สะดวก
    for (var i = 0; i < employees.length; i++) {
      sheet.appendRow([
        dateStr,
        site,
        employees[i],
        normalHour,
        otTotal
      ]);
    }
    
    // คืนค่ากลับไปแจ้งหน้าบ้านว่าทำรายการสำเร็จ
    return { success: true, message: "บันทึกข้อมูลเข้าชีต " + thaiFullDate + " สำเร็จ (" + employees.length + " คน)" };
    
  } catch (err) {
    return { success: false, message: "Backend Error: " + err.toString() };
  } finally {
    lock.releaseLock(); // ปลดล็อกระบบทุกกรณี
  }
}
/**
 * 🔄 ดึงข้อมูลพนักงานจริงจากสเปรดชีต "ไฟล์ DATA" มาส่งต่อให้หน้า Web App
 * @return {Array} รายการพนักงานทุกคนพร้อมรายละเอียดกลุ่มและสถานะ
 */
function getEmployeeData() {
  try {
    // 1. ค้นหาไฟล์ด้วยชื่อในระบบ Google Drive ของคุณ
    var files = DriveApp.getFilesByName('ไฟล์ DATA');
    if (!files.hasNext()) {
      return []; // หากไม่พบไฟล์ จะส่งอาเรย์ว่างกลับไปป้องกันระบบล่ม
    }
    
    var file = files.next();
    var ss = SpreadsheetApp.open(file);
    var sheet = ss.getSheets()[0]; // เลือกแผ่นงานแรกในไฟล์เป็นฐานข้อมูลหลัก
    var values = sheet.getDataRange().getValues();
    
    var employeeList = [];
    
    // 2. เริ่มทำงานที่แถว 2 (i = 1) เพื่อข้ามหัวตารางข้อมูล
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      
      // ตรวจสอบ Null Check พื้นฐานเพื่อให้มั่นใจว่าแถวนั้นมีรหัสพนักงานอยู่จริง
      if (row[13]) { 
        employeeList.push({
          A: row[0],   // ลำดับ (คอลัมน์ A)
          B: row[1],   // คำนำหน้า (คอลัมน์ B)
          C: row[2],   // ชื่อจริง (คอลัมน์ C)
          D: row[3],   // นามสกุล (คอลัมน์ D)
          E: row[4],   // ชื่อ-นามสกุลเต็ม (คอลัมน์ E)
          J: row[9],   // กลุ่มที่พักพนักงาน (คอลัมน์ J)
          K: row[10],  // สถานะทำงานปัจจุบัน เช่น "ปกติ" / "ลาออก" (คอลัมน์ K)
          N: String(row[13]) // รหัสพนักงานประจำตัว (คอลัมน์ N)
        });
      }
    }
    return employeeList;
    
  } catch (error) {
    // บันทึก Error ลงในระบบเพื่อสืบค้นย้อนหลังได้ง่าย
    Logger.log("Error ในฟังก์ชัน getEmployeeData: " + error.toString());
    return [];
  }
}