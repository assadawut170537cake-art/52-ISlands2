/**
 * 🚀 ฟังก์ชันสำหรับกดรันเพื่อบันทึกคอนฟิก (เวอร์ชันแยก API Key LINE และ Web App)
 */
function INITIAL_SETUP_PROPERTIES() {
  const scriptProperties = PropertiesService.getScriptProperties();
  
  const myConfig = {
    // 🟢 [1] ระบบ LINE Bot
    "LINE_CHANNEL_ACCESS_TOKEN": "Vfk8m9cWkFJF10pDtp7jj8x4yn6ty8LybZBr1rGON44pCGb3G8s/RLYdpIQKNUdDyUKRWwCoyi33wchRxo6rgdFdyy/wGTwrMotzLoOYQDWn9pPOTyKMna0QWDIZgJPtYkrn4mk3biVCbCEW9x9A0QdB04t89/1O/w1cDnyilFU=",
    "GEMINI_API_KEY_LINE": "AIzaSyDnOFKdSpstDLXg6NQbxA7-mG6lMbR1-w4", // คีย์ตัวที่ 1 (ใช้ในไลน์บอท)
    "ADMIN_LINE_IDS": "Uc0c4b4e9e5159a37b38fa5ac9c619c1e,U19fc3f88a0ae90bfb047e362b60e2493",

    // 🔵 [2] ระบบ Web App (PWA)
    "GEMINI_API_KEY_WEB": "AIzaSyBGisNqxlxD1OXSHloGUmYRMG7cCihwZn8", // คีย์ตัวที่ 2 (ใช้บนเว็บแอป)
    "ADMIN_COLUMN": "26",

    // 🟡 [3] ข้อมูลฐานข้อมูลและตรรกะระบบส่วนกลาง (ใช้ร่วมกัน)
    "MODEL_NAME": "gemini-2.5-flash",
    "EXTERNAL_DATABASE_ID": "1SSbgN9lmObsAyrqjykFttqNbCVDd3yhUq47yT8Z_Agk",
    "DATABASE_SHEET_NAME": "รายชื่อพนักงาน",
    "SHEET_STAFF": "รายชื่อพนักงาน",
    "SHEET_DATA": "DATA",
    "LEAVE_SHEET_NAME": "ข้อมูลการลา",
    "PHOTO_LOG_NAME": "Photo_Log",
    "DRIVE_FOLDER_ID": "ใส่_ID_โฟลเดอร์_GOOGLE_DRIVE_ของคุณตรงนี้",
    "BACKDATE_LIMIT_DAYS": "2",
    "IS_TESTING": "FALSE", // แก้เป็น FALSE เมื่อใช้งานจริง
    "SYSTEM_STATUS": "ON"
  };

  try {
    scriptProperties.setProperties(myConfig);
    Logger.log("✅ [สำเร็จ] บันทึกข้อมูลแบบแยก 2 API Key ลงระบบหลังบ้านเรียบร้อยแล้วครับ!");
  } catch (e) {
    Logger.log("❌ [ล้มเหลว] เกิดข้อผิดพลาด: " + e.message);
  }
}