/**
 * ====================================================================================
 * ⚙️ SMART WORKSITE - SETTINGS SERVER (HYBRID UI CONTROLLER)
 * ====================================================================================
 * ไฟล์: 12_ConfigServer.js
 * ทำหน้าที่เชื่อมโยงระหว่าง Sidebar UI (Settings.html) กับระบบจัดเก็บข้อมูลต่างๆ
 */

const SETTINGS_SHEET_NAME = "ตั้งค่า";
const CACHE_EXPIRATION = 900; // 15 นาที

/**
 * @description เปิดหน้าต่าง Sidebar สำหรับจัดการการตั้งค่า
 * @param {void}
 * @returns {void}
 */
function openSettingsSidebar() {
  try {
    const html = HtmlService.createHtmlOutputFromFile('Settings')
        .setTitle('ตั้งค่าระบบ (Settings)')
        .setWidth(300);
    SpreadsheetApp.getUi().showSidebar(html);
  } catch (error) {
    console.error("Error in openSettingsSidebar:", error.message);
    SpreadsheetApp.getUi().alert("เกิดข้อผิดพลาดในการเปิดหน้าต่างการตั้งค่า: " + error.message);
  }
}

/**
 * @description ดึงข้อมูลการตั้งค่าปัจจุบันเพื่อนำไปแสดงผลบน Sidebar UI
 * @param {void}
 * @returns {Object} ข้อมูลที่ประกอบด้วย lineToken, geminiKey, siteName, wageRate
 */
function getSettingsData() {
  try {
    const props = PropertiesService.getScriptProperties();
    let data = {
      lineToken: props.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || "",
      geminiKey: props.getProperty('GEMINI_API_KEY_LINE') || "" // อิงตามคีย์ใน Config.js
    };

    // ดึงข้อมูล Business จาก Cache หรือ Sheet
    const cache = CacheService.getScriptCache();
    const cachedSite = cache.get("CONFIG_DEFAULT_SITE");
    const cachedWage = cache.get("CONFIG_WAGE_RATE");

    if (cachedSite && cachedWage) {
      data.siteName = cachedSite;
      data.wageRate = cachedWage;
    } else {
      // ดึงจาก Sheet "ตั้งค่า"
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
      if (sheet) {
        const lastRow = Math.max(sheet.getLastRow(), 1);
        const values = sheet.getRange(1, 1, lastRow, 2).getValues();
        for (let i = 0; i < values.length; i++) {
          if (values[i][0] === "DEFAULT_SITE") data.siteName = values[i][1];
          if (values[i][0] === "WAGE_RATE") data.wageRate = values[i][1];
        }
      }
    }
    return data;
  } catch (error) {
    console.error("Error in getSettingsData:", error.message);
    return {};
  }
}

/**
 * @description บันทึกข้อมูลความลับลงใน PropertiesService เท่านั้น
 * @param {Object} payload ข้อมูล {lineToken, geminiKey} จาก UI
 * @returns {boolean} สถานะความสำเร็จ
 */
function saveSecretSettings(payload) {
  try {
    if (!payload) throw new Error("ไม่มีข้อมูลให้บันทึก");
    
    const props = PropertiesService.getScriptProperties();
    if (payload.lineToken !== undefined) {
      props.setProperty('LINE_CHANNEL_ACCESS_TOKEN', payload.lineToken);
    }
    if (payload.geminiKey !== undefined) {
      props.setProperty('GEMINI_API_KEY_LINE', payload.geminiKey);
      props.setProperty('GEMINI_API_KEY_WEB', payload.geminiKey);
    }
    
    // บันทึก Audit Log (ถ้ามีฟังก์ชันนี้)
    if (typeof logAuditTrail === "function") {
      logAuditTrail("ADMIN", "UPDATE_SECRETS", "Sidebar UI", "Properties Updated", 1.0, "SUCCESS", "Updated Secrets via Sidebar");
    }
    
    return true;
  } catch (error) {
    console.error("Error in saveSecretSettings:", error.message);
    throw new Error(error.message); // โยน Error กลับไปยัง FailureHandler
  }
}

/**
 * @description บันทึกข้อมูลธุรกิจลงใน Sheet "ตั้งค่า" พร้อมอัปเดต CacheService
 * @param {Object} payload ข้อมูล {siteName, wageRate} จาก UI
 * @returns {boolean} สถานะความสำเร็จ
 */
function saveBusinessSettings(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockErr) {
    console.error("[CRITICAL] saveBusinessSettings ไม่สามารถขอ Lock ได้: " + lockErr.message);
    throw new Error("ระบบไม่ว่าง กรุณาลองใหม่ (Lock Timeout)");
  }

  try {
    if (!payload) throw new Error("ไม่มีข้อมูลให้บันทึก");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    
    // ถ้ายังไม่มี Sheet ให้สร้างใหม่
    if (!sheet) {
      sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
      sheet.appendRow(["คีย์ (Key)", "ค่า (Value)"]);
      sheet.getRange("A1:B1").setFontWeight("bold").setBackground("#1E3A8A").setFontColor("#FFFFFF");
      sheet.setColumnWidth(1, 200);
      sheet.setColumnWidth(2, 300);
    }

    // ฟังก์ชันช่วยบันทึกค่าลงแถว
    const updateOrAddRow = (key, value) => {
      const lastRow = Math.max(sheet.getLastRow(), 1);
      const data = sheet.getRange(1, 1, lastRow, 1).getValues();
      for (let i = 0; i < data.length; i++) {
        if (data[i][0] === key) {
          sheet.getRange(i + 1, 2).setValue(value);
          return;
        }
      }
      sheet.appendRow([key, value]);
    };

    if (payload.siteName !== undefined) {
      updateOrAddRow("DEFAULT_SITE", payload.siteName);
      CacheService.getScriptCache().put("CONFIG_DEFAULT_SITE", payload.siteName, CACHE_EXPIRATION);
    }
    
    if (payload.wageRate !== undefined) {
      updateOrAddRow("WAGE_RATE", payload.wageRate);
      CacheService.getScriptCache().put("CONFIG_WAGE_RATE", payload.wageRate, CACHE_EXPIRATION);
    }
    
    // บันทึก Audit Log (ถ้ามีฟังก์ชันนี้)
    if (typeof logAuditTrail === "function") {
      logAuditTrail("ADMIN", "UPDATE_BUSINESS", "Sidebar UI", "Sheet Updated", 1.0, "SUCCESS", "Updated Business Settings via Sidebar");
    }

    return true;
  } catch (error) {
    console.error("Error in saveBusinessSettings:", error.message);
    throw new Error(error.message); // โยน Error กลับไปยัง FailureHandler
  } finally {
    lock.releaseLock();
  }
}
