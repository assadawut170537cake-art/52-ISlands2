// =================================================================
// Config.gs (ศูนย์รวมการตั้งค่าหลักของระบบ)
// =================================================================

/**
 * ⚠️ แก้ไขจาก const เป็น var เพื่อให้ไฟล์อื่นในโปรเจกต์สามารถเรียกใช้งานได้ (Global Scope)
 */
var GLOBAL_CONFIG = {
  "LINE_CHANNEL_ACCESS_TOKEN": "Yk/bGA3NaIdbw0dT71oZXfSxgKSxTZXuz9ImKQZhKYhGYHMUww79Rrc6dAkqnRyGyUKRWwCoyi33wchRxo6rgdFdyy/wGTwrMotzLoOYQDVlC880rCPIIHmRaBGK6Wanh5Wtgq49kgkR7EwziwkTAwdB04t89/1O/w1cDnyilFU=",
  "GEMINI_API_KEY_LINE": "AIzaSyDnOFKdSpstDLXg6NQbxA7-mG6lMbR1-w4",
  "GEMINI_API_KEY_WEB": "AIzaSyBGisNqxlxD1OXSHloGUmYRMG7cCihwZn8",
  "MODEL_NAME": "gemini-2.5-flash",
  "ADMIN_LINE_IDS": "U19fc3f88a0ae90bfb047e362b60e2493",
  "SYSTEM_STATUS": "ON",
  "IS_TESTING": "FALSE",
  "BACKDATE_LIMIT": 2,
  "FUZZY_THRESHOLD": 0.90,
  "EXTERNAL_DATABASE_ID": "1SSbgN9lmObsAyrqjykFttqNbCVDd3yhUq47yT8Z_Agk",
  "DRIVE_FOLDER_ID": "1PTdHuQErX_ZxJPypS-xb4Gw3vcmuOvtJ",
  "DATABASE_SHEET_NAME": "รายชื่อพนักงาน",
  "LEAVE_SHEET_NAME": "ข้อมูลการลา",
  "PHOTO_LOG_NAME": "Photo_Log",
  "WORK_START_TIME": "08:00",
  "OT_MORNING_LIMIT": "08:00",
  "START_ROW": 3,
  "COL_NAME_CHECK": 4,
  "COL_SITE": 6,
  "COL_WORK": 7,
  "COL_NORMAL_HR": 8,
  "COL_OT_M_IN": 11, "COL_OT_M_OUT": 12,
  "COL_OT_N_IN": 13, "COL_OT_N_OUT": 14,
  "COL_OT_E_IN": 15, "COL_OT_E_OUT": 16,
  "COL_OT_TOTAL": 17,
  "COL_ACCOM": 20
};

// ฟังก์ชันเช็ค Admin ที่แม่นยำที่สุด
function isAdmin(userId) {
  if (!userId || typeof userId !== 'string') return false;
  var adminConfig = getDynamicConfig("ADMIN_LINE_IDS") || GLOBAL_CONFIG.ADMIN_LINE_IDS;EXTERNAL_DATABASE_ID
  return adminConfig.includes(userId);
}

/**
 * 📱 2. ระบบ Dynamic Config (Remote Settings)
 * ฟังก์ชันดึงค่าตั้งค่าที่รองรับการแก้ไขผ่าน ChatOps พร้อมระบบ Cache [9, 10]
 */
function getDynamicConfig(key) {
  try {
    const cache = CacheService.getScriptCache();
    const cachedValue = cache.get("CONFIG_" + key);
    
    // 1. ตรวจสอบใน Cache ก่อนเพื่อความรวดเร็ว
    if (cachedValue !== null) return cachedValue;

    // 2. หากไม่มีใน Cache ให้ดูใน Script Properties (ที่แก้ผ่าน ChatOps)
    const propValue = PropertiesService.getScriptProperties().getProperty(key);
    if (propValue !== null) {
      cache.put("CONFIG_" + key, propValue, 3600); // เก็บเข้า Cache 1 ชม.
      return propValue;
    }
  } catch (e) {
    Logger.log("⚠️ getDynamicConfig Warning: " + e.message);
  }

  // 3. หากไม่มีทั้งคู่ ให้ใช้ค่าเริ่มต้นจาก GLOBAL_CONFIG
  return GLOBAL_CONFIG[key] || "";
}

/**
 * ⚙️ 3. ฟังก์ชันบันทึกการตั้งค่าใหม่ (เรียกใช้โดย ChatOps ใน 1_LineBot) [11]
 */
function setDynamicConfig(key, value) {
  try {
    const props = PropertiesService.getScriptProperties();
    const cache = CacheService.getScriptCache();
    
    props.setProperty(key, value);
    cache.put("CONFIG_" + key, value, 3600); // อัปเดต Cache ทันที
    
    // บันทึกประวัติการแก้ไขเพื่อความปลอดภัย (DevOps Log) [12, 13]
    if (typeof logAuditTrail === "function") {
      logAuditTrail("ADMIN", "UPDATE_CONFIG", key, value, 1.0, "SUCCESS", "Updated via ChatOps");
    }
  } catch (e) {
    Logger.log("⚠️ setDynamicConfig Error: " + e.message);
  }
}

/**
 * 📅 4. รายการ ID ไฟล์รายเดือน (ยึดตามระบบเดิม 12 เดือน) [14, 15]
 * ⚠️ แก้ไขจาก const เป็น var เช่นเดียวกัน เพื่อให้ฟังก์ชันการตรวจสอบวันที่จากไฟล์อื่นมองเห็น
 */
var MONTHLY_FILE_IDS = [
  "1gmS6ZYD4xeO2PP7gu15yvApLaKuFa5tPrmDe-PtMOBk", // 01 ม.ค.
  "1Uly9KQFnQ5pQyDn9pHGbgelCmXgDLO4DRM846Vsr7EM", // 02 ก.พ.
  "1wwwbwFyDyoyZOQ_kkfvyrshfpGgi6wCRaPAHU3yXKbE", // 03 มี.ค.
  "1L4cB7dWgkgejhMV84-RuW7LdDNT9vZwm5I06xa9vQEE", // 04 เม.ย.
  "1mc7eMzYDZqsUwKr8FZCEKClQZfqIybf6aZ-2mgkWGHI", // 05 พ.ค.
  "1kX-D_ehfo01rdj3WLLAvDxPO1IEy-XG5GLWe9i1CSo4", // 06 มิ.ย.
  "13GbWmUNrkLcJmo9gAnVSNnD_tH-PFaULH4I2C1DJEFE", // 07 ก.ค.
  "1mHSW_osT7LaXZPyU3KjU4i9801eJSibYyu3iHagK2I8", // 08 ส.ค.
  "1NoNXMDNvMdw5NIfS3QXIi57fCbpqu-iS-6bZQ8dyUBY", // 09 ก.ย.
  "14SDdBPxt-_muIvtHAx06b2Feh97Q-JkpaDvqlyei1ak", // 10 ต.ค.
  "1_DxUo7S7m1FwlPIyjHdetGONwdNwO9Ud54Xtmk4di1c", // 11 พ.ย.
  "1O5_8zTLQWZKuv647H65K-SHVyY3H2fDmwoWtZNUB7ZU"  // 12 ธ.ค.
];

function checkAdminStatus() {
  const myUserId = "U19fc3f88a0ae90bfb047e362b60e2493"; 
  const configRaw = getDynamicConfig("ADMIN_LINE_IDS") || getDynamicConfig("ADMIN_LINE_ID") || "";
  const adminIds = configRaw.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
  const isAdminStatus = adminIds.includes(myUserId);
  
  Logger.log("Admin IDs ในระบบ: " + JSON.stringify(adminIds));
  Logger.log("สถานะ User ของคุณ (" + myUserId + "): " + (isAdminStatus ? "✅ คุณคือ Admin" : "❌ คุณไม่ใช่ Admin"));
}

function fixAdminIdsProperties() {
  var cleanIds = "U19fc3f88a0ae90bfb047e362b60e2493,Uc0c4b4e9e5159a37b38fa5ac9c619c1e";
  PropertiesService.getScriptProperties().setProperty('ADMIN_LINE_IDS', cleanIds);
  
  var currentVal = PropertiesService.getScriptProperties().getProperty('ADMIN_LINE_IDS');
  Logger.log("ค่าที่บันทึกใหม่คือ: " + currentVal);
  
  if (currentVal === cleanIds) {
    Logger.log("✅ แก้ไขสำเร็จ! ค่าใน Properties สะอาดแล้ว");
  } else {
    Logger.log("❌ ยังมีปัญหา: " + currentVal);
  }
}

function debugConfigSource() {
  const adminIds = getDynamicConfig("ADMIN_LINE_IDS");
  Logger.log("ประเภทของค่าที่ดึงได้: " + typeof adminIds);
  Logger.log("ค่าที่ดึงได้จริง: " + adminIds);
  
  const allProps = PropertiesService.getScriptProperties().getProperties();
  for (var key in allProps) {
    if (key.includes("ADMIN")) {
      Logger.log("พบ Property ชื่อ: " + key + " | ค่าคือ: " + allProps[key]);
    }
  }
}

function forceCleanAdminIds() {
  const cleanIds = "U19fc3f88a0ae90bfb047e362b60e2493,Uc0c4b4e9e5159a37b38fa5ac9c619c1e";
  PropertiesService.getScriptProperties().setProperty('ADMIN_LINE_IDS', cleanIds);
  PropertiesService.getScriptProperties().setProperty('ADMIN_LINE_ID', cleanIds);
  
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config.gs'); 
    if (sheet) {
      const range = sheet.getDataRange();
      const values = range.getValues();
      for (let i = 0; i < values.length; i++) {
        for (let j = 0; j < values[i].length; j++) {
          if (typeof values[i][j] === 'string' && values[i][j].includes('U19fc3f88')) {
            sheet.getRange(i + 1, j + 1).setValue(cleanIds);
            Logger.log("✅ พบและแก้ไขค่าใน Sheet ที่ตำแหน่งแถว " + (i + 1) + " คอลัมน์ " + (j + 1));
          }
        }
      }
    } else {
      Logger.log("⚠️ ไม่พบชีตชื่อ 'Config.gs'");
    }
  } catch (e) {
    Logger.log("⚠️ forceCleanAdminIds Sheet Sync skipped: " + e.message);
  }
}