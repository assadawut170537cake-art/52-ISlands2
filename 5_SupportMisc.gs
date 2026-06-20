// =================================================================
// 5_SupportMisc.gs (ฟังก์ชันสนับสนุน แจ้งเตือนแอดมิน และจัดการ Error)
// =================================================================

function logErrorToSheet(fileId, originalMsg, errorMsg) {
  let targetId = fileId;
  if (!targetId) {
    targetId = (typeof getDynamicConfig === 'function') ? getDynamicConfig("EXTERNAL_DATABASE_ID") : null;
  }
  if (!targetId) return;
  try {
    const ss = SpreadsheetApp.openById(targetId);
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



function asyncLog(data) { console.log(data); }

// =================================================================
// 🔍 DATA HANDLER & FLEXIBLE NAME MATCHING
// =================================================================
function getEmployeeDataFromSheet() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("EMPLOYEE_DATA");
  if (cached) return JSON.parse(cached);
  
  const empData = [];
  try {
    // ใช้วิธี DevOps Guard: ดึง ID ไฟล์ DATA จาก Config (ใส่ Fallback ป้องกันระบบล่ม)
    const fileId = (typeof getDynamicConfig === 'function' ? getDynamicConfig("DATA_FILE_ID") : null) 
                   || "1SSbgN9lmObsAyrqjykFttqNbCVDd3yhUq47yT8Z_Agk"; 
    
    const ss = SpreadsheetApp.openById(fileId);
    const sheet = ss.getSheetByName("รายชื่อพนักงาน");
    
    if (sheet) {
      // ดึง A2:K เพื่อให้ครอบคลุมคอลัมน์ Name (C), Full_Name (E), Residence (J), Status (K)
      const data = sheet.getRange("A2:K").getValues(); 
      data.forEach(row => {
        const shortName = row[2] ? row[2].toString().trim() : ""; // คอลัมน์ C (Index 2)
        const fullName = row[4] ? row[4].toString().trim() : "";  // คอลัมน์ E (Index 4)
        const residence = row[9] ? row[9].toString().trim() : "ไม่ระบุ"; // คอลัมน์ J (Index 9)
        const status = row[10] ? row[10].toString().trim() : "";  // คอลัมน์ K (Index 10)
        
        if (shortName && (status === "ปกติ" || status === "ทำงาน" || status === "")) {
          empData.push({ shortName: shortName, fullName: fullName, accom: residence });
        }
      });
    }
  } catch(e) { logSystemEvent("ERROR", "getEmployeeDataFromSheet", e.message); }
  
  if (empData.length > 0) cache.put("EMPLOYEE_DATA", JSON.stringify(empData), 3600);
  return empData;
}

function extractEmployeesFromText(messageText) {
  if (!messageText) return [];
  
  // ใช้ฟังก์ชันแบบ Object (getEmployeeDataFromSheet) เป็นหลักเพื่อรองรับ Fuzzy และ Regex
  if (typeof getEmployeeDataFromSheet === "function") {
    const activeEmployees = getEmployeeDataFromSheet();
    const foundEmployees = [];
    
    activeEmployees.forEach(emp => {
      // 1. เช็คจาก Full Name ก่อน
      if (emp.fullName && messageText.includes(emp.fullName)) {
        foundEmployees.push(emp);
      } else {
        // 2. เช็ค Short Name โดยใช้ Word Boundary ป้องกันการจับคู่ชื่อสั้นที่ซ้อนอยู่ในคำอื่น
        if (emp.shortName) {
          const regex = new RegExp("(?:^|\\s)" + emp.shortName + "(?:\\s|$)", "i");
          if (regex.test(messageText)) {
            foundEmployees.push(emp);
          }
        }
      }
    });
    // ตัดรายชื่อที่ซ้ำกันออก (Unique Array)
    return [...new Set(foundEmployees)];
  } 
  // Fallback กรณีไม่มี Object Data Sheet
  else if (typeof getEmployeeListFromSheet === "function") {
    var activeEmployeesList = getEmployeeListFromSheet();
    var foundEmployeesList = [];
    for (var i = 0; i < activeEmployeesList.length; i++) {
      var empName = activeEmployeesList[i];
      if (messageText.indexOf(empName) !== -1) {
        foundEmployeesList.push(empName);
      }
    }
    return [...new Set(foundEmployeesList)];
  }
  return [];
}

function formatResponse(staffList, info) {
  const count = staffList ? staffList.length : 0;
  const dateStr = info.date || "วันนี้";
  const timeStr = info.time || "รอแก้ไข";
  const siteStr = info.site || "รอแก้ไข";

  let accomStr = info.accom;

  // ตรวจสอบข้อมูลที่พัก: หากไม่มีการส่งค่ามา ให้ไปค้นหาจากฐานข้อมูลรายบุคคล
  if (!accomStr && count > 0) {
    const firstStaff = staffList[0];
    
    // ดึงชื่อมาตรวจสอบ (รองรับทั้ง Object และ String)
    let staffName = "";
    if (typeof firstStaff === 'object') {
       staffName = firstStaff.fullName || firstStaff.shortName || `${firstStaff.firstname || ""} ${firstStaff.lastname || ""}`.trim();
    } else {
       staffName = firstStaff;
    }

    // กรณีมีข้อมูลอยู่ใน Object อยู่แล้ว
    if (typeof firstStaff === 'object' && firstStaff.accom) {
       accomStr = firstStaff.accom;
    } 
    // กรณีต้องไปสืบค้นจาก Database ภายนอก (คอลัมน์ J)
    else if (typeof getAccommodationByStaff === "function" && staffName) {
      const dbAccom = getAccommodationByStaff(staffName);
      if (dbAccom) accomStr = dbAccom;
    }
  }
  
  // หากในฐานข้อมูลไม่มีระบุไว้ ให้ใช้ค่าเริ่มต้น
  accomStr = accomStr || "รอแก้ไข";

  let msg = `✅ ตรวจพบพนักงาน ${count} คน\n`;
  msg += `📅 วันที่: ${dateStr}\n`;
  msg += `(เวลา: ${timeStr})\n`;
  msg += `ไซต์: ${siteStr}\n`;
  msg += `[ที่พัก: ${accomStr}]\n`;

  if (count > 0) {
    staffList.forEach((staff, index) => {
      let name = "";
      if (typeof staff === 'object') {
        name = staff.fullName || staff.shortName || `${staff.firstname || ""} ${staff.lastname || ""}`.trim();
      } else {
        name = staff;
      }
      msg += `${index + 1}. ${name}\n`;
    });
  } else {
    msg += `(ไม่พบรายชื่อในรายการ)\n`;
  }
  msg += `\n📌 สามารถก็อปปี้ข้อความนี้แล้ว เติมส่วนที่ขาดส่งกลับมาได้เลยครับ`;
  return msg;
}