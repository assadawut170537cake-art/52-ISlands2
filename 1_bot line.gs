// =================================================================
// 1_LineBot.gs (ระบบรับคำสั่ง บันทึกไฮบริด และโหมดพ่น Error ละเอียด V.10)
// =================================================================

async function doPost(e) {
  let emergencyToken = "";
  try {
    if (!e || !e.postData) return ContentService.createTextOutput("No Data").setMimeType(ContentService.MimeType.TEXT);
    const json = JSON.parse(e.postData.contents);
    const event = json.events && json.events[0]; 
    if (!event) return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    
    const { replyToken, source, message } = event; 
    emergencyToken = replyToken; 
    const userId = source && source.userId;
    let msg = message && message.text ? message.text.trim() : ""; 

    if (message.type === "text" && msg) {
      // 🛑 กฎเหล็ก: ทุกข้อความ/คำสั่งที่บอทจะทำงาน ต้องมี # นำหน้าข้อความเสมอ
      if (!msg.startsWith("#")) {
         return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }

      // ลอกเครื่องหมาย # ออกเพื่อนำเนื้อหาไปประมวลผลต่อหลังบ้าน
      let content = msg.substring(1).trim(); 

      // 🔥 [Hotfix ตรรกะปี ค.ศ.] แปลงปี พ.ศ. 69 / 2569 ให้เป็น ค.ศ. 2026 ปัจจุบัน ป้องกันสมองกล AI ประมวลผลพลาด
      if (content.includes("/69")) {
        content = content.replace("/69", "/2026");
      } else if (content.includes("/2569")) {
        content = content.replace("/2569", "/2026");
      }

      // ⚡ ตรรกะตรวจจับคำสั่งระบบทั่วไป
      if (content === "เช็คไอดี") {
         emergencyReply(replyToken, `🆔 LINE User ID ของคุณคือ:\n${userId}`);
         return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }
      
      if (/^(ช่วยเหลือ|วิธีใช้|help|คำสั่ง)/i.test(content)) {
         emergencyReply(replyToken, "💡 วิธีใช้งานระบบ Smart Worksite:\n\n• ลงบันทึกเวลาปกติ (ต้องใส่ # นำหน้าเสมอ)\nเช่น: `#20/05/2026 พักแค้มป์ เข้า ไซต์A\n08.00-17.00\n1. สมชาย / งานเดินสายไฟ` \n\n• พิมพ์ `#เช็คไอดี` เพื่อดูรหัสประจำตัว");
         return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }

      // ⚡ [ระบบ Stateful] ดักจับคำตอบกรณีปุ่มกดค้างสถานะคอนฟัน (Quick Reply State)
      const cache = CacheService.getScriptCache();
      const pendingClockIn = cache.get(`PENDING_CLOCKIN_${userId}`);
      const pendingOTConfirm = cache.get(`PENDING_OT_CONFIRM_${userId}`);

      if (pendingClockIn && (content === "ยืนยันตามเวลาที่แจ้ง" || content === "ลงเวลา 13.00 น." || content === "ยกเลิกลงเวลา")) {
         if (typeof processPendingClockIn === "function") {
           await processPendingClockIn(content, pendingClockIn, userId, replyToken);
         } else {
           throw new Error("ไม่พบฟังก์ชัน processPendingClockIn ในระบบ (โปรดตรวจสอบไฟล์ประมวลผลเวลา)");
         }
         return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }

      if (pendingOTConfirm && (content === "ทำที่เดิม/งานเดิม" || content === "เปลี่ยนไซต์/เปลี่ยนงาน" || content === "ยกเลิกลงเวลา")) {
         if (content === "ยกเลิกลงเวลา") {
           cache.remove(`PENDING_OT_CONFIRM_${userId}`);
           emergencyReply(replyToken, "❌ ยกเลิกการบันทึกโอทีเรียบร้อยแล้วครับ");
         } else {
           // ดึงข้อมูลค้างสถานะส่งต่อให้ตรรกะปลายทางประมวลผลต่อ
           let dataToProcess = JSON.parse(pendingOTConfirm);
           cache.remove(`PENDING_OT_CONFIRM_${userId}`);
           await handleOTChoiceSelection(content, dataToProcess, userId, replyToken);
         }
         return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }

      // 🚀 ส่งเข้าสู่โหมดแกะข้อมูลลงเวลาแบบไฮบริด (Manual Regex ก่อน -> AI -> บันทึกข้อมูล)
      await handleClockInHybrid(content, userId, replyToken);
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }
    
    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    console.error(err);
    if (emergencyToken) {
      emergencyReply(emergencyToken, `🔴 บอทระบบ doPost แครชกลางคัน!\nสาเหตุ: ${err.message}\n\nพิกัดวิเคราะห์:\n${err.stack}`);
    }
    return ContentService.createTextOutput("Error").setMimeType(ContentService.MimeType.TEXT);
  }
}

async function doPost(e) {
  let emergencyToken = "";
  try {
    if (!e || !e.postData) return ContentService.createTextOutput("No Data").setMimeType(ContentService.MimeType.TEXT);
    const json = JSON.parse(e.postData.contents);
    const event = json.events && json.events[0]; 
    if (!event) return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    
    const { replyToken, source, message } = event; 
    emergencyToken = replyToken; 
    const userId = source && source.userId;
    let msg = message && message.text ? message.text.trim() : ""; 

    if (message.type === "text" && msg) {
      // 🛑 กฎเหล็ก: ทุกข้อความ/คำสั่งที่บอทจะทำงาน ต้องมี # นำหน้าข้อความเสมอ
      if (!msg.startsWith("#")) {
         return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }

      // ลอกเครื่องหมาย # ออกเพื่อนำเนื้อหาไปประมวลผลต่อหลังบ้าน
      let content = msg.substring(1).trim(); 
      let isAdmin = verifyAdminRole(userId);

      // 🔥 [Hotfix ตรรกะปี ค.ศ.] แปลงปี พ.ศ. 69 / 2569 ให้เป็น ค.ศ. 2026 ปัจจุบัน ป้องกันสมองกล AI ประมวลผลพลาด
      if (content.includes("/69")) {
        content = content.replace("/69", "/2026");
      } else if (content.includes("/2569")) {
        content = content.replace("/2569", "/2026");
      }

      // ⚡ ตรรกะตรวจจับคำสั่งระบบทั่วไป
      if (content === "เช็คไอดี") {
         emergencyReply(replyToken, `🆔 LINE User ID ของคุณคือ:\n${userId}`);
         return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }
      
      if (/^(ช่วยเหลือ|วิธีใช้|help|คำสั่ง)/i.test(content)) {
         emergencyReply(replyToken, "💡 วิธีใช้งานระบบ Smart Worksite:\n\n• ลงบันทึกเวลาปกติ (ต้องใส่ # นำหน้าเสมอ)\nเช่น: `#20/05/2026 พักแค้มป์ เข้า ไซต์A\n08.00-17.00\n1. สมชาย / งานเดินสายไฟ` \n\n• พิมพ์ `#เช็คไอดี` เพื่อดูรหัสประจำตัว");
         return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }

      // ⚡ [ระบบ Stateful] ดักจับคำตอบกรณีปุ่มกดค้างสถานะคอนฟัน (Quick Reply State)
      const cache = CacheService.getScriptCache();
      const pendingClockIn = cache.get(`PENDING_CLOCKIN_${userId}`);
      const pendingOTConfirm = cache.get(`PENDING_OT_CONFIRM_${userId}`);

      if (pendingClockIn && (content === "ยืนยันตามเวลาที่แจ้ง" || content === "ลงเวลา 13.00 น." || content === "ยกเลิกลงเวลา")) {
         if (typeof processPendingClockIn === "function") {
           await processPendingClockIn(content, pendingClockIn, userId, replyToken);
         } else {
           throw new Error("ไม่พบฟังก์ชัน processPendingClockIn ในระบบ (โปรดตรวจสอบไฟล์ประมวลผลเวลา)");
         }
         return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }

      if (pendingOTConfirm && (content === "ทำที่เดิม/งานเดิม" || content === "เปลี่ยนไซต์/เปลี่ยนงาน" || content === "ยกเลิกลงเวลา")) {
         if (content === "ยกเลิกลงเวลา") {
           cache.remove(`PENDING_OT_CONFIRM_${userId}`);
           emergencyReply(replyToken, "❌ ยกเลิกการบันทึกโอทีเรียบร้อยแล้วครับ");
         } else {
           // ดึงข้อมูลค้างสถานะส่งต่อให้ตรรกะปลายทางประมวลผลต่อ
           let dataToProcess = JSON.parse(pendingOTConfirm);
           cache.remove(`PENDING_OT_CONFIRM_${userId}`);
           await handleOTChoiceSelection(content, dataToProcess, userId, replyToken);
         }
         return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }

      // 🚀 ส่งเข้าสู่โหมดแกะข้อมูลลงเวลาแบบไฮบริด (Manual Regex ก่อน -> AI -> บันทึกข้อมูล)
      await handleClockInHybrid(content, userId, replyToken);
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }
    
    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    console.error(err);
    if (emergencyToken) {
      emergencyReply(emergencyToken, `🔴 บอทระบบ doPost แครชกลางคัน!\nสาเหตุ: ${err.message}\n\nพิกัดวิเคราะห์:\n${err.stack}`);
    }
    return ContentService.createTextOutput("Error").setMimeType(ContentService.MimeType.TEXT);
  }
}

async function handleClockInHybrid(content, userId, token) {
  const lock = LockService.getScriptLock();
  try { 
    lock.waitLock(30000); 
  } catch (e) { 
    emergencyReply(token, "⚠️ ระบบคิวเต็ม (Lock Timeout) มีผู้ใช้งานพร้อมกันจำนวนมาก กรุณาส่งรายงานซ้ำอีกครั้งครับ"); 
    return; 
  }
  
  try {
    const props = PropertiesService.getScriptProperties();
    let dataToProcess = null;
    let parsingMethod = "Manual (Regex)";
    let errorMessage = "";

    // ทำความสะอาดข้อความเพื่อจัดรูปแบบสัญลักษณ์ ป้องกันช่างพิมพ์ฟอร์แมตขีดแดชเพี้ยน
    const cleanedMsg = typeof cleanText === "function" ? cleanText(content) : content;

    // 1. ลองแกะโครงสร้างข้อความด้วย Regular Expression แดชบอร์ดแมนนวลก่อนเพื่อประหยัดโควตา AI
    if (typeof parseComplexMessage === "function") {
      dataToProcess = parseComplexMessage(cleanedMsg);
    } else {
      throw new Error("ไม่พบฟังก์ชัน parseComplexMessage ในโปรเจกต์ (โปรดสร้างไฟล์โมดูล Parser ตัวแกะแมนนวล)");
    }
    
    // ตรวจสอบความสมบูรณ์: หากแมนนวลแกะไม่สำเร็จ หรือตรวจพบคำว่าโอทีเที่ยงแต่โครงสร้างอาเรย์ไม่ยอมจับคู่ ให้โยนสิทธิ์ให้ AI ช่วยแกะต่อทันที
    const isOtNoonMissed = /(OT|โอที)\s*เที่ยง/i.test(cleanedMsg) && (!dataToProcess || !dataToProcess.employees.some(emp => emp.has_ot_noon));
    if (!dataToProcess || !dataToProcess.date || !dataToProcess.employees || dataToProcess.employees.length === 0 || isOtNoonMissed) {
        parsingMethod = "AI Fallback";
        if (typeof processMessageWithAIBot === "function") {
          dataToProcess = await processMessageWithAIBot(cleanedMsg); 
        } else {
          throw new Error("ระบบพยายามเรียกใช้งาน AI สมองกลฝั่งบอทไลน์ แต่หาฟังก์ชัน processMessageWithAIBot ไม่เจอ");
        }
    }

    // 2. ตรวจสอบขั้นสุดท้าย: หากส่งให้ AI แล้วโครงสร้างยังพังหรือสกัดข้อมูลออกมาไม่ได้ ให้พ่นรายงานละเอียดกลับไลน์
    if (!dataToProcess || !dataToProcess.date || !dataToProcess.employees || dataToProcess.employees.length === 0) {
       errorMessage = `❌ ระบบไฮบริดไม่สามารถสกัดข้อมูลจากข้อความได้ครับ\nวิธีประมวลผลล่าสุด: ${parsingMethod}\n\n💡 สาเหตุที่เป็นไปได้:\n1. พิมพ์รูปแบบโครงสร้างบรรทัดผิดเพี้ยนไปจากคู่มือมาก\n2. คีย์พารามิเตอร์ GEMINI_API_KEY_LINE หลังบ้านหมดอายุหรือกรอกผิดพิกัด`;
       
       const dbFileId = props.getProperty("EXTERNAL_DATABASE_ID");
       if (typeof logErrorToSheet === "function" && dbFileId) {
         logErrorToSheet(dbFileId, "#" + content, errorMessage);
       }
       emergencyReply(token, errorMessage);
       return;
    }

    dataToProcess.original_msg = "#" + content;

    // 3. สแกนตรวจสอบเงื่อนไขล็อกวันเวลาส่งย้อนหลัง (Validation เดียวกันกับหน้า Web App PWA)
    if (typeof checkDateLogic === "function") {
      const check = checkDateLogic(dataToProcess.date);
      const adminIds = (props.getProperty('ADMIN_LINE_IDS') || props.getProperty('ADMIN_LINE_ID') || "").split(",").map(id => id.trim());
      const isAdmin = adminIds.includes(userId);

      if (check.status === "BLOCK" && !isAdmin) {
        emergencyReply(token, `⛔ บันทึกไม่ได้: ${check.msg}\n(การส่งรายงานเวลางานย้อนหลัง ถูกจำกัดสิทธิ์ให้แก้ไขได้เฉพาะแอดมินเท่านั้นครับ)`);
        return;
      }
      dataToProcess.checkStatus = check;
    } else {
      throw new Error("ไม่พบฟังก์ชัน checkDateLogic สำหรับตรวจสอบความถูกต้องของเงื่อนไขล็อกวันย้อนหลัง");
    }

    // 4. สแกนตรวจสอบเวลาเข้างาน กรณีช่างเข้างานช่วงเวลาเที่ยงวัน (สลับกะ/ลงเวลาครึ่งวันหลัง)
    if (dataToProcess.time_start) {
      const startTimeStr = dataToProcess.time_start.toString();
      const startHour = parseInt(startTimeStr.split('.')[0], 10);
      if (startHour === 12) {
         dataToProcess.targetFileId = typeof getTargetFileIdByDate === "function" ? getTargetFileIdByDate(dataToProcess.date) : null;
         CacheService.getScriptCache().put(`PENDING_CLOCKIN_${userId}`, JSON.stringify(dataToProcess), 300);
         replyWithButtons(token, `ลงข้อมูลตามเวลาเข้าจริง (${startTimeStr} น.) หรือต้องการปัดเป็นเวลา 13.00 น. ครับ?`, ["ยืนยันตามเวลาที่แจ้ง", "ลงเวลา 13.00 น.", "ยกเลิกลงเวลา"]);
         return;
      }
    }

    // 5. ส่งเข้าสู่ด่านตรวจสอบโอที (Overtime Mapping Control)
    if (typeof checkOTAndProceed === "function") {
      const targetFileId = typeof getTargetFileIdByDate === "function" ? getTargetFileIdByDate(dataToProcess.date) : null;
      checkOTAndProceed(dataToProcess, userId, token, dataToProcess.checkStatus, targetFileId);
    } else {
      throw new Error("ไม่พบฟังก์ชัน checkOTAndProceed ในการประมวลผลตัดแยกชั่วโมงโอทีปกติและโอทีเย็น");
    }

  } catch (e) {
    emergencyReply(token, `🔴 เกิดข้อผิดพลาดร้ายแรงในระบบไฮบริดบอทไลน์:\nคำอธิบาย: ${e.message}\n\nตำแหน่งแถวค้างเทคนิค:\n${e.stack}`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 🛠️ ฟังก์ชันพ่นส่ง Quick Reply กลับหาผู้ใช้ โดยบังคับให้ปุ่มกดพ่วงเครื่องหมาย # นำหน้าเสมอเพื่อไม่ให้ติดบล็อกตัวกรอง
 */
function replyWithButtons(replyToken, text, options) {
  try {
    const token = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
    if (!token) return;
    
    // ยัดไส้เติมเครื่องหมาย # เข้าไปที่ค่าตัวอักษรฝั่งส่งกลับ (text) เพื่อให้ตอนผู้ใช้กดปุ่ม ตัวกรองดักจับ # บรรทัดแรกทำงานผ่านฉลุย
    const quickReplyItems = options.map(label => ({
      "type": "action",
      "action": { "type": "message", "label": label, "text": `#${label}` }
    }));

    const payload = {
      replyToken: replyToken,
      messages: [{
        "type": "text", 
        "text": text,
        "quickReply": { "items": quickReplyItems }
      }]
    };

    UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
      method: "post",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log("replyWithButtons error: " + e.message);
  }
}

/**
 * 🛠️ ฟังก์ชันตอบกลับไลน์ขุกเฉินสายตรง ดึง Token จากหลังบ้านโดยไม่ผ่านตัวแปรโกลบอล ป้องกันแครชซ้ำซ้อน
 */
function emergencyReply(replyToken, msg) {
  try {
    const token = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
    if (!token) return;
    
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      'headers': {
        'Content-Type': 'application/json; charset=UTF-8',
        'Authorization': 'Bearer ' + token,
      },
      'method': 'post',
      'payload': JSON.stringify({
        'replyToken': replyToken,
        'messages': [{ 'type': 'text', 'text': msg }]
      })
    });
  } catch(e) {
    Logger.log("emergencyReply fatal error: " + e.message);
  }
}

/**
 * ⚡ ตรรกะรองรับคำตอบเลือกปุ่มเคสโอทีเปลี่ยนไซต์งานแบบแปรผัน
 */
async function handleOTChoiceSelection(choice, dataToProcess, userId, token) {
  if (choice === "ทำที่เดิม/งานเดิม") {
    if (typeof finalizeClockInSaving === "function") {
      await finalizeClockInSaving(dataToProcess, userId, token, dataToProcess.checkStatus, null, dataToProcess.targetFileId);
    }
  } else if (choice === "เปลี่ยนไซต์/เปลี่ยนงาน") {
    // โยกย้ายพารามิเตอร์ค้างหน้างานไปผูกกับคลังสเตตัสข้อความถัดไป
    CacheService.getScriptCache().put(`PENDING_OT_DETAILS_${userId}`, JSON.stringify(dataToProcess), 300);
    emergencyReply(token, "🚧 กรุณาพิมพ์ระบุชื่อไซต์งาน และงวดงานใหม่ที่ช่างโยกย้ายไปทำโอทีครับ\n(⚠️ รูปแบบบังคับพิมพ์: `#ชื่อไซต์งานใหม่ / รายละเอียดงานโอทีที่ทำ`) ");
  }
}
function DEBUG_SYSTEM() {
  const props = PropertiesService.getScriptProperties();
  const fileId = props.getProperty("EXTERNAL_DATABASE_ID");
  
  Logger.log("1. ID ไฟล์ฐานข้อมูลที่บอทวิ่งไปหา: " + (fileId ? fileId : "ไม่มีค่า"));
  if (!fileId) return;
  
  try {
    const ss = SpreadsheetApp.openById(fileId);
    Logger.log("2. 🟢 บอทเชื่อมต่อสำเร็จ! ชื่อไฟล์นี้คือ: [" + ss.getName() + "]");
    
    const sheetNames = ss.getSheets().map(s => s.getName());
    Logger.log("3. 📄 รายชื่อแท็บทั้งหมดในไฟล์นี้มีแค่: \n" + sheetNames.join(" | "));
    
  } catch(e) {
    Logger.log("❌ พัง! เข้าไฟล์ไม่ได้: " + e.message);
  }
}
