/**
 * ตรวจสอบสิทธิ์ของกลุ่มตรวจสอบข้อความ
 * หน้าที่การทำงาน: ดึงข้อมูลรายการไอดีกลุ่มที่ได้รับอนุญาต (Whitelist) จาก Cache ประสิทธิภาพสูง 
 * หากไม่พบข้อมูลในหน่วยความจำชั่วคราว จะโหลดข้อมูลจากโครงสร้างสคริปต์พร็อพเพอร์ตี้หรือตารางแผ่นงานควบคุม "ตั้งค่า"
 * * @return {Array<string>} รายการอาเรย์ของข้อความไอดีกลุ่มที่ผ่านเกณฑ์อนุญาตเข้าใช้งานระบบ
 */
function getSavedGroupWhitelist() {
  try {
    const cache = CacheService.getScriptCache();
    const cachedWhitelist = cache.get("GROUP_WHITELIST");

    // ส่งคืนข้อมูลทันทีหากมีการทำแคชข้อมูลเอาไว้ก่อนหน้าเพื่อความเร็วสูงสุด
    if (cachedWhitelist) {
      return JSON.parse(cachedWhitelist);
    }

    let whitelist = [];
    const properties = PropertiesService.getScriptProperties();
    const whitelistString = properties.getProperty("ALLOWED_GROUP_IDS");

    if (whitelistString) {
      whitelist = whitelistString.split(",").map(function (id) { 
        return id.trim(); 
      });
    } else {
      // ตรวจสอบและดึงข้อมูลสำรองจากแผ่นงานหากไม่ได้กำหนดค่าไว้ในส่วนคุณสมบัติหลัก
      try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ตั้งค่า");
        if (sheet) {
          const data = sheet.getRange("A2:A").getValues();
          whitelist = data.map(function (row) { 
            return row[0] ? row[0].toString().trim() : ""; 
          }).filter(function (id) { 
            return id !== ""; 
          });
        }
      } catch (sheetError) {
        console.error("เกิดข้อผิดพลาดในการเชื่อมโยงข้อมูลจากตารางแผ่นงานตั้งค่า: " + sheetError.toString());
      }
    }

    // ทำการจัดเก็บข้อมูลเข้าสู่หน่วยความจำแคชเพื่อรองรับการทำงานในรอบวินาทีถัดไป (กำหนดเวลา 1 ชั่วโมง)
    if (whitelist.length > 0) {
      cache.put("GROUP_WHITELIST", JSON.stringify(whitelist), 3600);
    }

    return whitelist;

  } catch (globalCacheError) {
    console.error("เกิดข้อผิดพลาดร้ายแรงภายในฟังก์ชัน getSavedGroupWhitelist: " + globalCacheError.toString());
    return [];
  }
}

/**
 * บันทึกเหตุการณ์เชิงตรวจสอบของระบบ (Audit Log ระบบ)
 * @param {string} actionType - รูปแบบกิจกรรมหรือเหตุการณ์ที่เกิดขึ้น
 * @param {string} source - แหล่งที่มาหรือผู้ดำเนินการทางระบบ
 * @param {string} details - รายละเอียดเชิงลึกของเหตุการณ์
 */
function logSystemEvent(actionType, source, details) {
  try {
    // โครงสร้างฟังก์ชันสำหรับบันทึกประวัติการใช้งานลงตาราง Audit Logs เพื่อความปลอดภัยของระบบ
    console.log(`[Audit Log] กิจกรรม: ${actionType} | ดำเนินการโดย: ${source} | รายละเอียด: ${details}`);
  } catch (logError) {
    console.error("ไม่สามารถสร้างประวัติการตรวจสอบระบบได้: " + logError.toString());
  }
}