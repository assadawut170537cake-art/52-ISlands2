// web_helpers.gs
// ฟังก์ชันแจกจ่ายงานฝั่ง GET (doGet) และงานดึงรายชื่อช่าง/ไซต์ สำหรับ PWA Frontend

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === "getModels") {
      const models = getDynamicGeminiModels();
      return ContentService.createTextOutput(JSON.stringify({ success: true, models })).setMimeType(ContentService.MimeType.JSON);
    }
    const page = e && e.parameter ? e.parameter.page : null;
    const userEmail = Session.getActiveUser().getEmail();
    const isAdminUser = checkIsAdmin(userEmail);

    if (page === 'manifest') return getManifest();
    if (page === 'ai-dashboard') return HtmlService.createTemplateFromFile("ai-dashboard").evaluate().setTitle("Smart Worksite AI Dashboard").addMetaTag("viewport", "width=device-width, initial-scale=1").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    if (page === 'manual') return HtmlService.createHtmlOutputFromFile('Interactive_Manual').setTitle('คู่มือ Smart Worksite').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1');

    const template = HtmlService.createTemplateFromFile("index");
    template.config = { isAdmin: isAdminUser, userEmail: userEmail, scriptUrl: ScriptApp.getService().getUrl(), backdateLimit: parseInt(getSecret("BACKDATE_LIMIT_DAYS") || "2") };
    return template.evaluate().setTitle("Smart Worksite System").addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: e.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getManifest() {
  const manifestObj = {
    name: "Smart Worksite", short_name: "SmartWork", start_url: ScriptApp.getService().getUrl(), display: "standalone", background_color: "#ffffff", theme_color: "#007bff",
    icons: [{ src: "https://i.ibb.co/N2w3P9pS/52.png", sizes: "512x512", type: "image/png" }]
  };
  return ContentService.createTextOutput(JSON.stringify(manifestObj)).setMimeType(ContentService.MimeType.JSON);
}

function getGroups() {
  const ssId = getSecret("EXTERNAL_DATABASE_ID");
  const sheet = getCachedSheet(ssId, getSecret("SHEET_STAFF") || "รายชื่อพนักงาน");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 10, lastRow - 1, 1).getValues();
  return [...new Set(data.flat().filter(String))];
}

function getSites() {
  const ssId = getSecret("EXTERNAL_DATABASE_ID");
  const sheet = getCachedSheet(ssId, getSecret("SHEET_DATA") || "DATA");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  return [...new Set(data.flat().filter(String))];
}

function getEmployees(groupName) {
  const ssId = getSecret("EXTERNAL_DATABASE_ID");
  const sheet = getCachedSheet(ssId, getSecret("SHEET_STAFF") || "รายชื่อพนักงาน");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const sm = { GROUP_COL: 10, FULLNAME_COL: 5, STATUS_COL: 11, EMP_ID_COL: 14, ACCOMMODATION_COL: 2 };
  const maxCol = Math.max(sm.GROUP_COL, sm.FULLNAME_COL, sm.STATUS_COL, sm.EMP_ID_COL, sm.ACCOMMODATION_COL);
  const data = sheet.getRange(2, 1, lastRow - 1, maxCol).getValues();
  return data.filter(row => (row[sm.STATUS_COL - 1] === 'ปกติ' || row[sm.STATUS_COL - 1] === 'ทำงาน') && row[sm.GROUP_COL - 1] === groupName).map(row => ({
    empId: row[sm.EMP_ID_COL - 1] || '-', fullName: row[sm.FULLNAME_COL - 1] || '-', currentAccom: row[sm.ACCOMMODATION_COL - 1] || '-'
  }));
}

function checkIsAdmin(email) {
  try {
    const ssId = getSecret("EXTERNAL_DATABASE_ID");
    const sheet = getCachedSheet(ssId, getSecret("SHEET_STAFF") || "รายชื่อพนักงาน");
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;
    const lowerEmail = (email || "").toLowerCase();
    const adminCol = parseInt(getSecret("ADMIN_COLUMN") || "26");
    const data = sheet.getRange(2, adminCol, lastRow - 1, 1).getValues();
    return data.some(row => (row[0] || "").toString().toLowerCase() === lowerEmail);
  } catch (e) { return false; }
}

function saveWorkData(payload) {
  try {
    const { date, site, detail, otSite, staff } = payload;
    const fileId = getTargetFileIdByDateWeb(date);
    const sheetName = getThaiDateName(date);
    const sheet = getCachedSheet(fileId, sheetName);
    if (!sheet) return { success: false, error: "ไม่พบแผ่นงานวันที่ " + sheetName };

    const lastRow = sheet.getLastRow();
    const data = lastRow > 0 ? sheet.getRange(1, 1, lastRow, 20).getValues() : [];
    const map = { START_ROW: 5, SITE_COL: 6, JOB_COL: 7, WORK_HRS_COL: 8, OT_SITE_COL: 9, OT_AFTER_START: 15, OT_AFTER_END: 16, OT_NOON_OUT: 13, OT_NOON_IN: 14 };
    const updates = {}; let savedCount = 0;
    const prefixRegex = /^(นาย|นางสาว|น\.ส\.|นาง|Mr\.|Ms\.)/i;

    staff.forEach(emp => {
      const cleanWebName = (emp.name || "").replace(/\s+/g, '').replace(prefixRegex, '');
      for (let i = map.START_ROW - 1; i < data.length; i++) {
        const sheetFirstName = (data[i][3] || "").toString().replace(/\s+/g, '');
        if (sheetFirstName && cleanWebName.includes(sheetFirstName)) {
          const row = i + 1;
          const [tInHr, tInMin] = (emp.tin || "08:00").split(':').map(Number);
          const [tOutHr, tOutMin] = (emp.tout || "17:00").split(':').map(Number);
          let inMins = tInHr * 60 + tInMin; let outMins = tOutHr * 60 + tOutMin;
          if (outMins < inMins) outMins += 1440;
          let totalMins = outMins - inMins;
          if (totalMins >= 300) totalMins -= 60;
          const totalHrs = totalMins / 60;
          const normalHrs = Math.max(0, totalHrs <= 8 ? totalHrs : 8);

          if (!updates[row]) updates[row] = {};
          updates[row][map.SITE_COL] = site;
          updates[row][map.JOB_COL] = detail ? detail.replace(/\s*\(?OTเที่ยง|โอทีเที่ยง\)?\s*/gi, "").trim() : "-";
          updates[row][map.WORK_HRS_COL] = normalHrs;

          if (totalHrs > 8) {
            const otStartMins = inMins + 480 + (totalMins + 60 >= 300 ? 60 : 0);
            const otHr = Math.floor(otStartMins / 60); const otMin = otStartMins % 60;
            updates[row][map.OT_SITE_COL] = otSite || site;
            updates[row][map.OT_AFTER_START] = `${otHr.toString().padStart(2, '0')}:${otMin.toString().padStart(2, '0')}`;
            updates[row][map.OT_AFTER_END] = emp.tout;
          }
          if (/(OTเที่ยง|โอทีเที่ยง)/i.test(detail || "")) { updates[row][map.OT_NOON_OUT] = "12:00"; updates[row][map.OT_NOON_IN] = "13:00"; }
          savedCount++; break;
        }
      }
    });

    if (Object.keys(updates).length === 0) return { success: false, error: "หารายชื่อพนักงานในแผ่นงานชีตไม่เจอ โปรดตรวจสอบรายชื่อ" };
    const range = sheet.getRange(1, 1, lastRow, 20);
    const values = range.getValues();
    Object.entries(updates).forEach(([rowStr, cols]) => {
      const row = parseInt(rowStr, 10) - 1;
      Object.entries(cols).forEach(([colStr, val]) => { values[row][parseInt(colStr, 10) - 1] = val; });
    });
    range.setValues(values);
    return { success: true, message: `บันทึกข้อมูลเรียบร้อยแล้ว (${savedCount} คน)` };
  } catch (e) { return { success: false, error: e.message }; }
}

/* -----------------------------------------------------------------
   ระบบสแกนรูปบัตรตอกฝั่ง Web (OCR Wrapper)
   ----------------------------------------------------------------- */
function processOCRImage(base64Image) {
  try {
    const prompt = "สกัดรหัสพนักงานที่มี 5 หลัก (เช่น 52xxx) ออกมาจากภาพนี้ ส่งกลับมาเป็นตัวเลขคั่นด้วย comma ห้ามมีข้อความอื่น";
    
    // 🛠️ จุดที่ต้องแก้: เติม , true ไว้หลัง "image/jpeg" แบบนี้ครับน้อง
    const res = callGeminiVision(base64Image.split(',')[1], prompt, "image/jpeg", true);
    
    if (!res) return { success: false, error: "AI ไม่สามารถอ่านข้อมูลได้ หรือภาพไม่ชัดเจน" };
    
    if (Array.isArray(res)) return { success: true, ids: res.flat().map(String).filter(s => /\d{5}/.test(s)) };
    if (typeof res === "object" && res.codes) return { success: true, ids: res.codes.map(String) };
    if (typeof res === "string") return { success: true, ids: (res.match(/\d{5}/g) || []) };
    
    return { success: false, error: "AI ตอบกลับในรูปแบบที่ไม่คาดคิด กรุณาลองใหม่" };
  } catch (e) { return { success: false, error: e.message }; }
}

function uploadImageToDrive(base64Data, filename) {
  try {
    const FOLDER_ID = getSecret("DRIVE_FOLDER_ID");
    if (!FOLDER_ID) throw new Error("DRIVE_FOLDER_ID not set");
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const contentType = base64Data.substring(5, base64Data.indexOf(';'));
    const bytes = Utilities.base64Decode(base64Data.substr(base64Data.indexOf('base64,') + 7));
    const file = folder.createFile(Utilities.newBlob(bytes, contentType, filename));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (error) { return "Error: " + error.toString(); }
}

function getEmployeeData() {
  try {
    const ss = SpreadsheetApp.openById(getSecret("EXTERNAL_DATABASE_ID"));
    const sheet = ss.getSheetByName(getSecret("SHEET_STAFF") || "รายชื่อพนักงาน");
    const data = sheet.getDataRange().getValues();
    const activeStaff = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[10] === "ทำงาน" || row[10] === "ปกติ") activeStaff.push({ id: String(row[13]), name: row[4], group: row[9], pos: row[5] });
    }
    return { success: true, data: activeStaff };
  } catch (e) { return { success: false, error: e.message }; }
}

function saveAttendance(payload) {
  try {
    const ss = SpreadsheetApp.openById(getSecret("EXTERNAL_DATABASE_ID"));
    let sheet = ss.getSheetByName("บันทึกเวลา") || ss.insertSheet("บันทึกเวลา");
    const rows = payload.records.map(r => [new Date(), r.id, r.name, r.group, r.pos, r.date, r.timeIn, r.timeOut, r.site, r.remarks]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

function getAppUrl() { return ScriptApp.getService().getUrl(); }