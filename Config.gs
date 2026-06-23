// =================================================================
// Config.gs (ศูนย์รวมการตั้งค่าหลักของระบบ)
// =================================================================

/**
 * ⚠️ แก้ไขจาก const เป็น var เพื่อให้ไฟล์อื่นในโปรเจกต์สามารถเรียกใช้งานได้ (Global Scope)
 */
var GLOBAL_CONFIG = {
  "LINE_CHANNEL_ACCESS_TOKEN": "Ob2i9KKspAAZQMNv1Hwe0w+u/ipyv/0P7xGfcYekxGLj8s3pLtK0/Vf5pZ5CdYW9yUKRWwCoyi33wchRxo6rgdFdyy/wGTwrMotzLoOYQDXIqtEvoG3KQ0ox94QlKEMGQAz6UBjkT56UF7ZbUUnBFAdB04t89/1O/w1cDnyilFU=",  // ⚠️ ดึงจาก Script Properties เท่านั้น (ห้ามฝังค่าจริงใน source code)
  "GEMINI_API_KEY_LINE": "",        // ⚠️ ดึงจาก Script Properties เท่านั้น
  "GEMINI_API_KEY_WEB": "",         // ⚠️ ดึงจาก Script Properties เท่านั้น
  "MODEL_NAME": "gemini-2.5-flash",
  "ADMIN_LINE_IDS": "U19fc3f88a0ae90bfb047e362b60e2493,Uc0c4b4e9e5159a37b38fa5ac9c619c1e",
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
  "COL_ACCOM": 20,
  "SHEET_WORKSPACE": "Code_Workspace",
  "SHEET_SETTINGS": "System_Settings",
  "SHEET_CHANGELOG": "System_Changelog",
  "COL_EMP_NAME": 4,
  "COL_EMP_ROLE": 5,
  "COL_EMP_AGE": 24,
  TEST_KEY: "นี่คือค่าจาก GLOBAL_CONFIG",
  "TOOL_PROMPTS": {
    "estimateMaterials": "คุณคือวิศวกรประเมินวัสดุก่อสร้างมืออาชีพ\nผู้ใช้จะอธิบายงาน ให้คุณประเมินวัสดุ เครื่องมือ และปริมาณที่ต้องใช้\nตอบเป็นรายการชัดเจน พร้อมระบุหน่วยและหมายเหตุ",
    "draftAccidentReport": "คุณคือผู้เชี่ยวชาญด้านความปลอดภัยในงานก่อสร้าง\nผู้ใช้จะเล่าเหตุการณ์ ให้คุณร่างรายงานอุบัติเหตุแบบมาตรฐาน OSHA ประกอบด้วย:\n1. สรุปเหตุการณ์  2. สาเหตุเบื้องต้น  3. ผู้บาดเจ็บ/ความเสียหาย\n4. มาตรการแก้ไขเร่งด่วน  5. การป้องกันในอนาคต",
    "draftSafetyTalk": "คุณคือผู้ฝึกอบรมความปลอดภัยหน้างานก่อสร้าง\nสร้างสคริปต์ Safety Talk สั้น (3-5 นาที) ที่เข้าใจง่าย\nใช้ภาษาพูดทั่วไป มีตัวอย่างจริงจากหน้างาน มีการถามตอบ",
    "generateWBS": "คุณคือผู้จัดการโครงการก่อสร้างมืออาชีพ\nแยกย่อยงานที่ผู้ใช้บอกออกเป็น Work Breakdown Structure (WBS)\nแสดงเป็นรายการลำดับชั้น มีกำหนดเวลาโดยประมาณและผู้รับผิดชอบ",
    "translateSiteCommand": "คุณคือล่ามแปลภาษาหน้างานก่อสร้าง\nแปลข้อความที่ผู้ใช้ให้มาเป็นภาษา {LANG} (Myanmar)\nพร้อมอ่านออกเสียงภาษาไทยให้ช่างที่พูดภาษาเป้าหมายได้",
    "analyzeWeatherPlan": "คุณคือที่ปรึกษาการบริหารโครงการก่อสร้างตามสภาพอากาศ\nวิเคราะห์สภาพอากาศที่ผู้ใช้แจ้ง แล้วแนะนำ:\n1. งานใดควรเร่ง/ชะลอ  2. ความเสี่ยงด้านความปลอดภัย\n3. การจัดการเครื่องจักร/วัสดุที่เหมาะสม"
  },
  "ADMIN_PROMPTS": {
    "summary": "คุณคือผู้ช่วยผู้จัดการโครงการก่อสร้าง\nสรุปผลลัพธ์การทำงานในช่วงเวลาที่ผู้ใช้ระบุ ประกอบด้วย:\nจำนวนชั่วโมงรวม, OT รวม, ไซต์งานหลัก, ประเด็นที่ต้องติดตาม\nเขียนเป็นรายงานสรุปผู้บริหาร (Executive Summary)",
    "hr": "คุณคือผู้เชี่ยวชาญ HR ในอุตสาหกรรมก่อสร้าง\nวิเคราะห์แนวโน้มการขาด/ลา/OT ที่ผู้ใช้แจ้ง\nเสนอแนะการวางแผนกำลังคนล่วงหน้าและมาตรการที่ควรดำเนินการ",
    "announce": "คุณคือผู้ช่วยสื่อสารองค์กรในบริษัทก่อสร้าง\nร่างประกาศสั่งงานและความปลอดภัยประจำวันที่มืออาชีพ\nภาษากระชับ ชัดเจน ครบถ้วน มีหัวข้อ Safety Moment ด้วยเสมอ"
  }
};

// ฟังก์ชันเช็ค Admin ที่แม่นยำที่สุด
function isAdmin(userId) {
  if (!userId || typeof userId !== 'string') return false;
  var adminConfig = getDynamicConfig("ADMIN_LINE_IDS") || GLOBAL_CONFIG.ADMIN_LINE_IDS;
  var adminList = adminConfig.split(",").map(function(s) { return s.trim(); });
  return adminList.indexOf(userId) !== -1;
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

//ใส่ไว้เพื่อเช็คว่า push มาจริงๆ
// ตัวแปรสำหรับเก็บ Cache ชั่วคราวป้องกันการเรียก Properties ซ้ำ
let _configCache = null; 

/**
 * ดึงค่าการตั้งค่าแบบ Dynamic (Properties > Config)
 * @param {String} key - ชื่อคีย์ที่ต้องการดึงค่า
 * @param {String} [defaultValue] - ค่าเริ่มต้นหากไม่พบ
 * @returns {String|null} ค่าที่ได้ หรือ null หากไม่พบ
 */
function getDynamicConfig(key, defaultValue) {
  try {
    // 1. โหลด Properties มาเก็บไว้ใน Cache (ทำแค่ครั้งแรก)
    if (!_configCache) {
      _configCache = PropertiesService.getScriptProperties().getProperties();
    }

    // 2. เช็คจาก Properties ก่อน (ให้สิทธิ์ Properties ทับค่าโค้ด)
    if (_configCache && _configCache[key] !== undefined && _configCache[key] !== "") {
      return _configCache[key];
    }

    // 3. ถ้าไม่มี ให้ดึงจาก GLOBAL_CONFIG ในไฟล์ Config
    if (typeof GLOBAL_CONFIG !== "undefined" && GLOBAL_CONFIG[key] !== undefined && GLOBAL_CONFIG[key] !== "") {
      return GLOBAL_CONFIG[key];
    }

    return defaultValue !== undefined ? defaultValue : null;
  } catch (err) {
    console.error("getDynamicConfig Error for key [" + key + "]: " + err.message);
    return defaultValue !== undefined ? defaultValue : null;
  }
}

/**
 * @description จัดการการเรียกใช้งาน API/Service แบบมีระบบ Retry และ Exponential Backoff เพื่อจัดการ Rate Limit
 * @param {Function} action - ฟังก์ชัน (Closure) ที่จะเรียกใช้งาน
 * @param {number} maxRetries - จำนวนครั้งที่พยายามสูงสุด (ค่าเริ่มต้น 3)
 * @returns {any} ผลลัพธ์จากการทำงานของฟังก์ชัน
 * @throws {Error} คืนค่า Error หากล้มเหลวครบตามจำนวนครั้งที่กำหนด
 */
function withExponentialBackoff(action, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return action();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      Utilities.sleep((Math.pow(2, i) * 1000) + Math.round(Math.random() * 1000));
    }
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
  const myUserId = "U19fc3f88a0ae90bfb047e362b60e2493,Uc0c4b4e9e5159a37b38fa5ac9c619c1e"; 
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

function runConfigTest() {
  var result = getDynamicConfig("TEST_KEY");
  console.log("ผลการดึงค่า TEST_KEY คือ: " + result);
}