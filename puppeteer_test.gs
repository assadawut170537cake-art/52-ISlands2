//const puppeteer = require('puppeteer'); (async () => { const browser = await puppeteer.launch(); const page = await browser.newPage(); page.on('console', msg => console.log('PAGE LOG:', msg.text())); page.on('pageerror', error => console.log('PAGE ERROR:', error.message)); page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText)); await page.goto('http://localhost:8080/index.html', {waitUntil: 'networkidle0'}); await browser.close(); })();
/**
 * คำอธิบาย: ฟังก์ชันสำหรับดึงข้อมูลเนื้อหา HTML จากหน้าเว็บเบื้องต้น (แทน Puppeteer)
 * @param {string} targetUrl - URL ของเว็บไซต์ที่ต้องการดึงข้อมูล
 * @returns {string|null} - ส่งคืนข้อความ HTML ของหน้าเว็บ หรือ null หากเกิดข้อผิดพลาด
 */
function fetchWebpageData(targetUrl) {
  try {
    // ตรวจสอบพารามิเตอร์อินพุท
    if (!targetUrl || typeof targetUrl !== 'string') {
      throw new Error("พารามิเตอร์ targetUrl ไม่ถูกต้อง หรือเป็นค่าว่าง");
    }

    Logger.log(`เริ่มต้นดึงข้อมูลจาก: ${targetUrl}`);
    
    // ตั้งค่า Header และ Option สำหรับการ Request
    const options = {
      'method': 'get',
      'muteHttpExceptions': true // ให้โปรแกรมทำงานต่อเพื่อเก็บ Error Code ได้
    };

    // ส่ง HTTP Request
    const response = UrlFetchApp.fetch(targetUrl, options);
    const responseCode = response.getResponseCode();

    // ตรวจสอบสถานะการตอบกลับ
    if (responseCode !== 200) {
      throw new Error(`ไม่สามารถเข้าถึงหน้าเว็บได้ (HTTP Status Code: ${responseCode})`);
    }

    // ดึงข้อมูล HTML
    const htmlContent = response.getContentText();
    Logger.log("ดึงข้อมูลเนื้อหาหน้าเว็บสำเร็จ");
    
    return htmlContent;

  } catch (error) {
    // ระบบ Error Handling
    Logger.log(`[❌ ข้อผิดพลาดใน fetchWebpageData]: ${error.message}`);
    Logger.log(`[Stack Trace]: ${error.stack}`);
    return null;
  }
}