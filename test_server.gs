//const express = require('express'); const app = express(); app.use(express.static('.')); app.listen(8080, () => console.log('Server running on 8080'));
/**
 * คำอธิบาย: ฟังก์ชันสำหรับรับ Request รูปแบบ GET (ใช้รับ-ส่งข้อมูลแทนการตั้ง Server แบบ Node.js)
 * @param {Object} e - พารามิเตอร์ Event object ที่ได้จาก HTTP GET Request
 * @returns {TextOutput} - ส่งคืนผลลัพธ์ในรูปแบบ JSON TextOutput
 */
function doGet(e) {
  try {
    // 1. ตรวจสอบพารามิเตอร์เบื้องต้น
    if (!e) {
      throw new Error("ไม่มีพารามิเตอร์ e (Event Object) ส่งเข้ามา");
    }

    Logger.log("เริ่มต้นทำงาน: ได้รับ GET Request");
    
    // 2. จำลองการประมวลผลข้อมูล (ปรับเปลี่ยนได้ตามความต้องการ)
    const responsePayload = {
      status: "success",
      message: "เชื่อมต่อ Web App API สำเร็จ",
      receivedData: e.parameter,
      timestamp: new Date()
    };

    Logger.log("ประมวลผลสำเร็จ กำลังส่งข้อมูลกลับ...");

    // 3. แปลงอ็อบเจกต์เป็น JSON และตั้งค่า MimeType เป็น JSON
    return ContentService.createTextOutput(JSON.stringify(responsePayload))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // 4. ระบบ Error Handling จัดการข้อผิดพลาดและส่งกลับเป็น JSON
    Logger.log(`[❌ ข้อผิดพลาดใน doGet]: ${error.message}`);
    Logger.log(`[Stack Trace]: ${error.stack}`);
    
    const errorPayload = {
      status: "error",
      message: error.message
    };
    
    return ContentService.createTextOutput(JSON.stringify(errorPayload))
      .setMimeType(ContentService.MimeType.JSON);
  }
}