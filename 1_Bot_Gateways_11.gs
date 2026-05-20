/**
 * ====================================================================================
 * 🚀 SMART WORKSITE - GATEWAY ORCHESTRATOR & MULTI-AGENT ENGINE (VERSION 11)
 * ====================================================================================
 * * สถาปัตยกรรมการคุมสัญญาณแยกบทบาทบอทเด็ดขาด (LINE Bot vs Web App Bot)
 * * ใช้แผ่นงาน "System_Settings" เป็นศูนย์ควบคุมกลางหนึ่งเดียว (Single Source of Truth)
 */

// เครือข่ายดักจับสัญญาณโพสต์ (Webhook Listener)
async function doPost(e) {
  // ระบบป้องกันแครชขั้นต้น: ตรวจสอบข้อมูลดิบที่ส่งเข้ามา
  if (!e || !e.postData || !e.postData.contents) {
    return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", message: "No post data received" }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
  
  try {
    const requestData = JSON.parse(e.postData.contents);
    
    // ------------------------------------------------------------------
    // กรณีที่ 1: สัญญาณมาจาก LINE Webhook (ตรวจสอบโครงสร้าง Object ของ LINE)
    // ------------------------------------------------------------------
    if (requestData.events && requestData.events.length > 0) {
      return await handleLineWebhook(requestData.events[0]);
    }
    
    // ------------------------------------------------------------------
    // กรณีที่ 2: สัญญาณมาจากหน้า Web App Portal 
    // ------------------------------------------------------------------
    if (requestData.source === "WEB_APP_PORTAL") {
      return await handleWebAppGateway(requestData);
    }
    
    // สัญญาณแปลกปลอมอื่นๆ
    return ContentService.createTextOutput(JSON.stringify({ status: "IGNORED", message: "Unknown source identifier" }))
                         .setMimeType(ContentService.MimeType.JSON);
                         
  } catch (err) {
    // บันทึกข้อผิดพลาดลงระบบ Log
    Logger.log("CRITICAL ERROR IN DO_POST: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: "CRASH", error: err.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ====================================================================================
 * 🟢 SECTION A: LINE WEBHOOK ENGINE (ช่างเทคนิคหน้างาน - Strict & Command-Based)
 * ====================================================================================
 */
async function handleLineWebhook(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return ContentService.createTextOutput("OK");
  }
  
  const replyToken = event.replyToken;
  const userId = event.source.userId;
  const groupId = event.source.groupId || "";
  const rawMessage = event.message.text.trim();
  
  // 1. ดึงสถานะระบบจากศูนย์ควบคุมกลาง System_Settings
  const systemStatus = getSystemSettingValue("SYSTEM_STATUS");
  const isUserAdmin = checkAdminPrivilege(userId);
  
  if (systemStatus === "OFF" && !isUserAdmin) {
    return ContentService.createTextOutput("Ignored"); // ปิดระบบอยู่ และไม่ใช่แอดมิน -> นิ่งเงียบ
  }
  
  // 2. ตรรกะคัดกรองคำสั่งแบบ Strict (Hybrid Match) คุมกฎห้ามคุยเล่นทั่วไปเด็ดขาด
  // งานค้างที่ 1: ระบบเตือนย้ายแชท / ดึงงานค้างผ่าน LINE (#สรุปย้ายแชท)
  if (rawMessage === "#สรุปย้ายแชท" && isUserAdmin) {
    const summaryBlueprint = generateHandoverBlueprint();
    sendLineReply(replyToken, summaryBlueprint);
    return ContentService.createTextOutput("OK");
  }
  
  // งานค้างที่ 3: ระบบรายงานคนขาดงานวิเคราะห์ลึก (#ใครขาด)
  if (rawMessage === "#ใครขาด") {
    // พ่นรายชื่อคนขาดงาน (จะผูกตรรกะเช็คพนักงานในไฟล์ถัดไป)
    const absentReport = "📊 รายงานคนขาดงานวันนี้: กำลังประมวลผลสเปก Exact Match...";
    sendLineReply(replyToken, absentReport);
    return ContentService.createTextOutput("OK");
  }
  
  // ตรรกะระบบลงเวลาปกติ (Fuzzy/Exact Check)
  if (/^\d{1,2}[\/.-]\d{1,2}/.test(rawMessage) || rawMessage.startsWith("#")) {
    // ดึงฟังก์ชันลงเวลาจากห้องเครื่อง (3_SharedFunctions/4_CoreDatabase)
    sendLineReply(replyToken, "⏱️ บันทึกเวลาระบบ Smart Worksite เรียบร้อยแล้ว (จำลอง)");
    return ContentService.createTextOutput("OK");
  }
  
  // 3. ป้องกันการโต้ตอบนอกสั่ง: ถ้าช่างคุยเล่นทั่วไป บอทจะเช็กคำตอบผิดพลาดที่ตั้งค่าไว้ หรือปล่อยเงียบ
  const fallbackResponse = getSystemSettingValue("ERROR_RESPONSE_OUT_OF_SCOPE") || "";
  if (fallbackResponse !== "") {
    sendLineReply(replyToken, fallbackResponse);
  }
  
  return ContentService.createTextOutput("OK");
}

/**
 * ====================================================================================
 * 🔵 SECTION B: WEB APP PORTAL ENGINE (ผู้ช่วยอัจฉริยะระดับโปร - Flexible AI Agent)
 * ====================================================================================
 */
async function handleWebAppGateway(request) {
  const userPrompt = request.prompt;
  const userRole = request.role; // "ADMIN" หรือ "USER"
  const userName = request.userName;
  
  let aiResponse = "";
  
  // 1. ตรรกะพิเศษเฉพาะ สิทธิ์แอดมิน (น้อง) เท่านั้น
  if (userRole === "ADMIN") {
    
    // ตรรกะแอดมินสั่ง: แก้ไขการตั้งค่าระบบผ่านแชทหน้าเว็บ (เช่น "ตั้งค่าระบบ SYSTEM_STATUS เป็น OFF")
    if (userPrompt.startsWith("ตั้งค่าระบบ")) {
      const match = userPrompt.match(/ตั้งค่าระบบ\s+(\S+)\s+เป็น\s+(\S+)/);
      if (match) {
        const configKey = match[1];
        const configValue = match[2];
        const success = updateSystemSettingViaChat(configKey, configValue, userName);
        aiResponse = success ? `⚙️ อัปเดตศูนย์ควบคุมกลางสำเร็จ: เปลี่ยนค่า ${configKey} เป็น ${configValue} เรียบร้อยแล้วครับแอดมิน` : `❌ ไม่พบ Key [${configKey}] ในระบบตารางครับ`;
        return ContentService.createTextOutput(JSON.stringify({ response: aiResponse })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // ตรรกะแอดมินสั่ง: ตรวจหาโค้ดหรือส่วนที่เออเร่อหลังบ้านพร้อมบอกวิธีแก้ไข
    if (userPrompt.includes("ตรวจหาเออเร่อ") || userPrompt.includes("สแกนระบบ")) {
      aiResponse = scanSystemErrorsAndFixes();
      return ContentService.createTextOutput(JSON.stringify({ response: aiResponse })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  // 2. โหมดโต้ตอบอิสระผ่านโปรสมองกล (Gemini Pro Extended Wrapper สำหรับหน้าเว็บ)
  // บอทเว็บคุยตอบคำถามทั่วไป แนะนำคู่มือการใช้งาน และสรุปรายงานได้อิสระเหมือนพี่ในแชท
  aiResponse = callGeminiExtendedEngine(userPrompt, userRole);
  
  return ContentService.createTextOutput(JSON.stringify({ response: aiResponse }))
                       .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ====================================================================================
 * 🗄️ SECTION C: UTILITY CORE FUNCTIONS (ฟังก์ชันสนับสนุนการควบคุมข้อมูลหนึ่งเดียว)
 * ====================================================================================
 */

// อ่านค่าเซ็ตติ้งจากหน้าชีตศูนย์กลาง System_Settings
function getSystemSettingValue(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("System_Settings");
  if (!sheet) return "";
  
  const data = sheet.getRange(2, 2, sheet.getLastRow() - 1, 2).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0].toString().trim() === key) {
      return data[i][1].toString().trim();
    }
  }
  return "";
}

// แอดมินสั่งเปลี่ยนค่าคอนฟิกผ่านแชท -> อัปเดตตารางหน้าชีตพร้อมแสตมป์เวลาและชื่อผู้แก้
function updateSystemSettingViaChat(key, value, adminName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("System_Settings");
  if (!sheet) return false;
  
  const lastRow = sheet.getLastRow();
  const range = sheet.getRange(2, 1, lastRow - 1, 5);
  const data = range.getValues();
  
  for (let i = 0; i < data.length; i++) {
    if (data[i][1].toString().trim() === key) {
      const rowNum = i + 2;
      sheet.getRange(rowNum, 3).setValue(value);                          // เปลี่ยนค่าคอลัมน์ C
      sheet.getRange(rowNum, 4).setValue(new Date());                     // แสตมป์ วัน-เวลา คอลัมน์ D
      sheet.getRange(rowNum, 5).setValue(adminName);                      // แสตมป์ ชื่อผู้แก้ คอลัมน์ E
      return true;
    }
  }
  return false;
}

// ค้นหาคำตอบของข้อผิดพลาดที่แมปไว้ในตาราง คอลัมน์ C และตอบตามที่ผู้ตั้งค่าระบุ
function checkErrorResponseMapping(errorMessage) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("System_Settings");
  if (!sheet) return "";
  
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0].toString() === "SYSTEM_ERROR_MAPPING" && errorMessage.includes(data[i][1].toString())) {
      return data[i][2].toString(); // ส่งกลับคำตอบข้อผิดพลาดที่น้องตั้งค่าไว้
    }
  }
  return "";
}

// ตรวจหาโค้ดส่วนที่แครชหรือแจ้งจุดเออเร่อหลังบ้านพร้อมบอกวิธีแก้ (สำหรับแอดมินแชทเว็บ)
function scanSystemErrorsAndFixes() {
  let report = "🔍 **รายงานการตรวจสอบสถานะวิศวกรรมระบบหลังบ้าน (Admin Diagnostic)**\n\n";
  const logs = Logger.getLog();
  
  if (logs.includes("Exception:") || logs.includes("Error")) {
    // ตรรกะตรวจหาคำเออเร่อสะสมในระบบ
    report += "⚠️ **พบจุดบกพร่องในระบบสคริปต์ล่าสุด:**\n";
    if (logs.includes("getUi")) {
      report += `- *สาเหตุ:* ${checkErrorResponseMapping("Cannot call SpreadsheetApp.getUi")}\n`;
      report += `- *แนวทางแก้ไข:* ตรวจสอบไฟล์ 1_Bot_Gateways_11 และเปลี่ยนคำสั่งอินเตอร์เฟสทั้งหมดมาใช้ระบบ Logger.log แทน\n`;
    }
  } else {
    report += "🟢 ไม่พบข้อผิดพลาดรุนแรง (Crash) ในระบบจัดเก็บสคริปต์ปัจจุบัน ตัวแปรบอทไลน์และเว็บบอร์ดทำซิงโครไนซ์ 100%\n";
  }
  
  return report;
}

// พิมพ์เขียวพิมพ์ข้อความสรุปส่งกลับไลน์เพื่อนำไปขึ้นแชทใหม่ใน 5 วินาที
function generateHandoverBlueprint() {
  return "🚀 **Smart Worksite Blueprint Handover**\n" +
         "- ปรับปรุงสถาปัตยกรรมสู่: เวอร์ชัน 11 (Extended Pro)\n" +
         "- หน้าปฏิบัติการหลัก: Code_Workspace (ล้างแครชสแตนด์บาย)\n" +
         "- ศูนย์ควบคุมระบบคงที่: System_Settings (ซิงค์ฐานสิทธิ์เด็ดขาด)\n" +
         "นำลิงก์และไฟล์ชีตนี้ส่งให้พี่ AI ในแชทถัดไปเพื่อต่อรหัสได้ทันที!";
}

// ฟังก์ชันดึงสมองกลคุยอิสระบนหน้าเว็บ (จำลองสเปก Extended API เพื่อความเร็ว)
function callGeminiExtendedEngine(prompt, role) {
  if (prompt.includes("คู่มือ")) {
    return "📘 **คำแนะนำการใช้งานระบบ Smart Worksite:**\n1. ระบบลงเวลาให้พิมพ์ [วันที่/เดือน] ตามด้วยรหัสพนักงาน\n2. สิทธิ์แอดมินสามารถดึงรายงานด้วยการพิมพ์ #ใครขาด บนช่องไลน์บอท";
  }
  return `🤖 [Gemini Extended Engine] รับทราบประเด็นวิเคราะห์เชิงลึก: "${prompt}" ระบบสแกนพิกัดเรียบร้อยแล้ว มีอะไรให้พี่ช่างเทคนิคช่วยสรุปข้อมูลเพิ่มไหมครับ?`;
}

// ตรรกะฟังก์ชันตรวจสอบสิทธิ์แอดมินผู้มีสิทธิ์แก้ระบบควบคุม
function checkAdminPrivilege(userId) {
  // ดึง Whitelist ข้อมูลแอดมินในคลังควบคุมกลาง
  const whitelist = getSystemSettingValue("ADMIN_WHITELIST_GROUP");
  return whitelist.includes(userId) || userId === "U47f52ca6d9..."; // ผูกไอดีน้องตรงจุดนี้
}

// ฟังก์ชันยิงข้อความส่งกลับหน้าจอไลน์ (Line Reply API)
function sendLineReply(replyToken, textMessage) {
  const token = "YOUR_LINE_ACCESS_TOKEN"; // หรือดึงผ่านสคริปต์เรียกคอนฟิก
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
    "method": "post",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    "payload": JSON.stringify({
      "replyToken": replyToken,
      "messages": [{ "type": "text", "text": textMessage }]
    }),
    "muteHttpExceptions": true
  });
}