/**
 * 🚀 ฟังก์ชันสำหรับกดรันเพื่อบันทึกคอนฟิก (เวอร์ชันเสถียรสูงสุด: แยก API Key และคลีน ID)
 * วิธีใช้: ตรวจสอบความถูกต้องแล้วกดเลือกฟังก์ชัน "INITIAL_SETUP_PROPERTIES" จากนั้นกดรัน (Run) 1 ครั้ง
 */
function INITIAL_SETUP_PROPERTIES() {
  const scriptProperties = PropertiesService.getScriptProperties();
  
  const myConfig = {
    // 🟢 [1] ระบบ LINE Bot
    "LINE_CHANNEL_ACCESS_TOKEN": "aCJiOsgUtbu2zPgCbasYDrD3i+xpKECn6df3EyjftMdpoIAQilk752gF5ENWe29TyUKRWwCoyi33wchRxo6rgdFdyy/wGTwrMotzLoOYQDXaEXXxb3l3fsgibktpr7Pj0ON5dlVYrQPbZM/HmLXLxgdB04t89/1O/w1cDnyilFU=",
    "GEMINI_API_KEY_LINE": "AIzaSyDnOFKdSpstDLXg6NQbxA7-mG6lMbR1-w4", // คีย์ฝั่งบอทไลน์สำหรับสแกนรูปภาพ
    "ADMIN_LINE_IDS": "Uc0c4b4e9e5159a37b38fa5ac9c619c1e",
    "ADMIN_LINE_ID": "U19fc3f88a0ae90bfb047e362b60e2493",


    // 🔵 [2] ระบบ Web App (PWA)
    "GEMINI_API_KEY_WEB": "AIzaSyBGisNqxlxD1OXSHloGUmYRMG7cCihwZn8", // คีย์ฝั่งเว็บแอปสำหรับแกะข้อความภาษาธรรมชาติ
    "ADMIN_COLUMN": "26",

    // 🟡 [3] ข้อมูลฐานข้อมูลและตรรกะระบบส่วนกลาง (ใช้ร่วมกัน)
    "MODEL_NAME": "gemini-2.5-flash",
    "EXTERNAL_DATABASE_ID": "1SSbgN9lmObsAyrqjykFttqNbCVDd3yhUq47yT8Z_Agk",
    "DATABASE_SHEET_NAME": "รายชื่อพนักงาน",
    "SHEET_STAFF": "รายชื่อพนักงาน",
    "SHEET_DATA": "DATA",
    "LEAVE_SHEET_NAME": "ข้อมูลการลา",
    "PHOTO_LOG_NAME": "Photo_Log",
    "DRIVE_FOLDER_ID": "1PTdHuQErX_ZxJPypS-xb4Gw3vcmuOvtJ", // ✨ จุดที่ 1: ตัด ?lfhs=2 ออกเกลี้ยงแล้วเพื่อป้องกันบั๊กอัปโหลดรูปพัง
    "BACKDATE_LIMIT_DAYS": "2",
    "IS_TESTING": "FALSE", 
    "SYSTEM_STATUS": "ON"
  };

  try {
    // บันทึกคอนฟิกหลักขึ้นระบบ
    scriptProperties.setProperties(myConfig);
    
    // ตั้งค่าโครงสร้างตรรกะระบบแบบแปรผัน (Dynamic System Logic) ฝังตัวเริ่มต้นไว้
    const defaultDynamicLogic = {
      "ot_rule": "standard",
      "backdate_limit": 2,
      "allow_overtime_noon": true
    };
    
    // ✨ จุดที่ 2: แก้ไขตัวสะกดผิดจาก JSON.stringif เป็น JSON.stringify เรียบร้อย
    if (!scriptProperties.getProperty('DYNAMIC_SYSTEM_LOGIC')) {
      scriptProperties.setProperty('DYNAMIC_SYSTEM_LOGIC', JSON.stringify(defaultDynamicLogic));
    }
    
    Logger.log("🎯 [สำเร็จ] บันทึกคอนฟิกระบบ Smart Worksite แบบแยก 2 API Key และคลีนไอดีเรียบร้อยแล้วครับพี่!");
  } catch (e) {
    Logger.log("❌ [ล้มเหลว] เกิดข้อผิดพลาดรุนแรง: " + e.message);
  }
}

/**
 * 👀 ฟังก์ชันสำหรับส่องดูค่าคอนฟิกปัจจุบันที่เปิดใช้อยู่ในระบบ
 * วิธีใช้: เลือกฟังก์ชันนี้แล้วกดรันเพื่อเช็คค่าหลังจากรันเซ็ตอัปเสร็จแล้ว
 */
function checkCurrentSystemProperties() {
  const allProps = PropertiesService.getScriptProperties().getProperties();
  Logger.log("=== ตรวจสอบค่าคอนฟิกระบบปัจจุบัน ===");
  for (let key in allProps) {
    if (key.includes("KEY") || key.includes("TOKEN")) {
      Logger.log(`${key}: ********** (ซ่อนรหัสผ่านไว้เพื่อความปลอดภัย)`);
    } else {
      Logger.log(`${key}: ${allProps[key]}`);
    }
  }
  Logger.log("=== สิ้นสุดการตรวจสอบ ===");
}