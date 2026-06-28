// =================================================================
// 8_Workflow_Report.gs (รวมการทำรายงาน, ตรวจวันที่, และ Flow ยืนยัน)
// =================================================================

/**
 * 🚀 ฟังก์ชันหลัก: รวบรวมข้อมูลจาก Sheets + AdminDirectory 
 * สร้างเอกสารรายงานลง Drive และแจ้งเตือนผ่าน Google Chat
 */
function generateProjectReportAndNotify() {
  try {
    const props = PropertiesService.getScriptProperties();
    
    // 1. [SHEETS] เชื่อมต่อฐานข้อมูลและดึงรายชื่อพนักงาน
    const dbId = props.getProperty("EXTERNAL_DATABASE_ID");
    if (!dbId) throw new Error("ไม่พบ EXTERNAL_DATABASE_ID ในระบบ");
    
    const employeeSheet = typeof getCachedSheet === 'function' 
      ? getCachedSheet(dbId, props.getProperty("SHEET_STAFF") || "รายชื่อ") 
      : SpreadsheetApp.openById(dbId).getSheetByName(props.getProperty("SHEET_STAFF") || "รายชื่อ");

    if (!employeeSheet) throw new Error("ไม่พบหน้าชีตรายชื่อพนักงาน");

    const employeeData = employeeSheet.getDataRange().getValues();
    let activeEmployeesCount = 0;
    for (let i = 1; i < employeeData.length; i++) {
      if (employeeData[i][10] === "ทำงาน" || employeeData[i][10] === "ปกติ") {
        activeEmployeesCount++;
      }
    }
    
    // 2. [ADMIN DIRECTORY] เช็กข้อมูลอีเมลผู้ใช้งานและตำแหน่ง/แผนก
    const userEmail = Session.getActiveUser().getEmail();
    let userDetails = "ผู้ดูแลระบบ (Admin)";
    
    try {
      const userProfile = AdminDirectory.Users.get(userEmail);
      userDetails = userProfile.organizations ? userProfile.organizations[0].title : "พนักงาน";
    } catch (err) {
      Logger.log("Info: ไม่สามารถดึงข้อมูล AdminDirectory ได้ (อาจรันด้วยบัญชี Gmail ทั่วไป): " + err.message);
    }

    // 3. [DRIVE] สร้างและจัดเก็บไฟล์รายงาน
    const baseFolderId = props.getProperty("DRIVE_FOLDER_ID");
    let targetFolder;
    
    if (baseFolderId) {
      targetFolder = DriveApp.getFolderById(baseFolderId);
    } else {
      const folderName = "รายงานโปรเจค Attendance";
      const folders = DriveApp.getFoldersByName(folderName);
      targetFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    }
    
    const reportTitle = "สรุปยอดพนักงานปัจจุบัน_" + Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
    const doc = DocumentApp.create(reportTitle);
    const docFile = DriveApp.getFileById(doc.getId());
    
    targetFolder.addFile(docFile);
    DriveApp.getRootFolder().removeFile(docFile); 
    
    const body = doc.getBody();
    body.appendParagraph("📊 สรุปรายงานระบบ Smart Worksite");
    body.appendParagraph("วันที่: " + Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss"));
    body.appendParagraph("ผู้ดำเนินการ: " + userEmail + " (" + userDetails + ")");
    body.appendParagraph("จำนวนพนักงานที่พร้อมปฏิบัติงาน: " + activeEmployeesCount + " คน");
    doc.saveAndClose();

    // 4. [CHAT] ส่งข้อความแจ้งเตือนพร้อมลิงก์ไฟล์
    const chatWebhookUrl = props.getProperty("GOOGLE_CHAT_WEBHOOK_URL"); 
    
    if (chatWebhookUrl) {
      const payload = {
        "text": "📊 *อัปเดตรายงานสรุปผลพนักงาน*\n" +
                "👤 *ผู้สร้าง:* " + userEmail + "\n" +
                "👥 *พนักงานที่พร้อมทำงาน:* " + activeEmployeesCount + " คน\n" +
                "📁 *ดูเอกสารรายงาน:* " + docFile.getUrl()
      };
      const options = { "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload) };
      UrlFetchApp.fetch(chatWebhookUrl, options);
    }

    return "ออกรายงานและส่งแจ้งเตือนสำเร็จ ดูไฟล์ได้ที่: " + docFile.getUrl();

  } catch (error) {
    const errorMsg = "เกิดข้อผิดพลาด: " + error.toString();
    Logger.log(errorMsg);
    if (typeof notifyAdminOnError === "function") notifyAdminOnError("ระบบออกรายงานล้มเหลว", errorMsg);
    return errorMsg;
  }
}

/**
 * ฟังก์ชันทำความสะอาดข้อความ ปรับแต่งสัญลักษณ์ให้อยู่ในร่องในรอย
 */
function cleanText(text) {
  if (!text) return "";
  let cleaned = text.replace(/–/g, "-").replace(/—/g, "-").replace(/[\u200B-\u200D\uFEFF]/g, "");
  return cleaned.trim();
}
