/**
 * =================================================================
 * SMART WORKSITE SYSTEM - PERFECT HYBRID MASTER (V.12)
 * รวบรวมฟังก์ชัน: Webhook, LINE Bot, AI Gemini, OT Logic, และ Audit Log
 * สถานะ: ใช้งานจริง (Production Ready) / Synchronous Execution
 * =================================================================
 */


/**
 * 🚀 ฟังก์ชันหลักสำหรับรับ Webhook จาก LINE (Entry Point) [V12 Master Optimized]
 * หน้าที่: รับและคัดกรองข้อมูลเบื้องต้น ป้องกันข้อมูลชนกัน และส่งต่อให้ Router หลักอย่างลื่นไหล
 * @param {Object} e - Event Object จาก Google Apps Script (บรรจุ HTTP POST payload)
 * @returns {Object} TextOutput ส่งกลับไปยัง LINE Server ทันทีด้วยสถานะ 200 OK
 */
function doPost(e) {
  // 🛡️ 1. ดักสัญญาณ Webhook Verification จาก LINE
  if (e && e.postData && e.postData.contents) {
    try {
      const preCheckData = JSON.parse(e.postData.contents);
      if (preCheckData.events && (preCheckData.events.length === 0 || (preCheckData.events[0] && preCheckData.events[0].replyToken === "00000000000000000000000000000000"))) {
        return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
      }
    } catch (parseErr) {
      // ข้ามไป
    }
  }

  // 🔒 2. เริ่มระบบ LockService เพื่อป้องกันข้อมูลชนกัน
  const lock = LockService.getScriptLock();
  let globalReplyToken = null;

  try {
    lock.waitLock(30000); 

    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", message: "No data received" })).setMimeType(ContentService.MimeType.JSON);
    }

    const requestData = JSON.parse(e.postData.contents);

    // 🎯 ท่อที่ 1: สัญญาณจาก LINE Webhook
    if (requestData.events && requestData.events.length > 0) {
      const event = requestData.events[0];
      globalReplyToken = event.replyToken;

      // ป้องกัน Dummy Token หลุดรอด
      if (globalReplyToken === "00000000000000000000000000000000") {
        return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
      }

      // ⚡ ถอด Gatekeeper ใน doPost ออก ปล่อยให้ handleLineWebhook ทำหน้าที่คัดกรองอย่างละเอียดเอง
      if (typeof handleLineWebhook === "function") {
        handleLineWebhook(event);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // 🎯 ท่อที่ 2: สัญญาณจากหน้า Web App Portal
    if (requestData.source === "WEB_APP_PORTAL" || requestData.type === "SAVE") {
      if (typeof handleWebAppGateway === "function") {
        handleWebAppGateway(requestData);
        return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "IGNORED" })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    if (globalReplyToken && globalReplyToken !== "00000000000000000000000000000000" && typeof emergencyReply === "function") {
      try {
        emergencyReply(globalReplyToken, "🔴 ระบบภายในขัดข้อง: " + err.message);
      } catch (replyErr) {
        // ละเว้นหากส่งกลับไม่ได้
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ status: "success", error: err.message })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    // 🔓 3. ปลดล็อกทรัพยากร (ใส่ try-catch ป้องกันบั๊กซ้อนทับ)
    try {
      if (lock) lock.releaseLock();
    } catch (e) {
      console.error("Lock Release Error:", e.message);
    }
  }
}

/**
 * 🛠️ ฟังก์ชันจัดการ LINE Webhook พร้อมระบบ Cache State Machine
 * หน้าที่: คัดกรองสิทธิ์ ดักจับสถานะที่ค้างอยู่ และแยกแยะคำสั่งทั่วไป/Admin
 * @param {Object} event - Event Object ต้นฉบับจาก LINE
 */
function handleLineWebhook(event) {
  try {
    const replyToken = event.replyToken;
    const source = event.source;
    const message = event.message;
    const userId = source ? source.userId : null;
    const groupId = source ? source.groupId : null;

    // [PRE-GUARD]: อนุญาตให้คำสั่งขอ ID พื้นฐานทำงานได้แม้กลุ่มยังไม่ได้อยู่ใน Whitelist
    if (message && message.type === "text") {
      const msgTrimmed = message.text.trim();
      const cmdTrimmed = msgTrimmed.startsWith("#") ? msgTrimmed.substring(1).trim() : msgTrimmed;
      
      if (cmdTrimmed === "ขอไอดีแอดมิน") {
        emergencyReply(replyToken, "🔑 LINE User ID ของคุณคือ:\n" + userId);
        return;
      }

      if (/^(เช็คไอดีกลุ่ม|ไอดีกลุ่ม|groupid)$/i.test(cmdTrimmed)) {
        if (source.type === "group") {
          emergencyReply(replyToken, `🆔 **LINE Group ID ของกลุ่มนี้คือ:**\n\n\`${groupId}\`\n\n*(สามารถคัดลอกไปใช้ตั้งค่าในระบบสคริปต์ได้ทันที)*`);
        } else {
          emergencyReply(replyToken, "⚠️ คำสั่งนี้ใช้ได้เฉพาะการพิมพ์ภายใน 'ไลน์กลุ่ม' เท่านั้นครับ");
        }
        return;
      }
    }

    // [GUARD CLAUSE 1]: ตรวจสอบสิทธิ์กลุ่ม (Whitelist Group)
    if (source.type === "group" && typeof isAllowedGroup === "function" && !isAllowedGroup(groupId)) {
      if (typeof logAuditTrail === "function") {
        logAuditTrail(userId, "BLOCKED_GROUP", `Group ID: ${groupId} rejected.`, "REJECT", 1.0, "BLOCK", "บล็อกกลุ่มที่ไม่ได้รับอนุญาต");
      }
      return;
    }

    const isUserAdmin = verifyAdminRole(userId);
    const props = PropertiesService.getScriptProperties();
    const systemStatus = getDynamicConfig("SYSTEM_STATUS", "ON");

    // 📷 ประมวลผลกรณีเป็นรูปภาพ (อัปโหลดบัตรตอก)
    if (message && message.type === "image") {
      if (typeof logAuditTrail === "function") {
        logAuditTrail(userId, "IMAGE_ENTRY", "IMAGE_MESSAGE_ID_" + message.id, "IMAGE", 1.0, "SUBMIT_IMAGE", "พนักงานอัปโหลดรูปภาพบัตรตอก");
      }
      handleImageProcess(message.id, replyToken, userId);
      return;
    }

    if (!message || message.type !== "text") return;

    const msg = message.text.trim();

    // [GUARD CLAUSE 2]: ป้องกันช่างส่งรายงานทางแชทส่วนตัว (อนุญาตเฉพาะแอดมิน)
    if (source.type === "user" && !isUserAdmin) {
      emergencyReply(replyToken, "⚠️ ขออภัยครับ บอทรับลงรายงานเฉพาะใน 'ไลน์กลุ่ม' เท่านั้นครับ 🙏");
      return;
    }

    // ⚡ ดึงข้อมูลสถานะคงค้าง (State Machine) จากหน่วยความจำ Cache
    const cache = CacheService.getScriptCache();
    const pendingClockIn12 = cache.get(`PENDING_CLOCKIN_${userId}`);
    const pendingOTConfirm = cache.get(`PENDING_OT_CONFIRM_${userId}`);
    const pendingOTDetails = cache.get(`PENDING_OT_DETAILS_${userId}`);
    const pendingSuggestionsRaw = cache.get(`PENDING_SUGGESTIONS_${userId}`);

    // หากขึ้นต้นด้วย # แสดงว่าเริ่มคำสั่งใหม่ ให้เคลียร์สถานะเดิมทิ้งทั้งหมด
    if (msg.startsWith("#") && (pendingClockIn12 || pendingOTConfirm || pendingOTDetails || pendingSuggestionsRaw)) {
      cache.remove(`PENDING_CLOCKIN_${userId}`);
      cache.remove(`PENDING_OT_CONFIRM_${userId}`);
      cache.remove(`PENDING_OT_DETAILS_${userId}`);
      cache.remove(`PENDING_SUGGESTIONS_${userId}`);
      if (typeof logAuditTrail === "function") {
        logAuditTrail(userId, "STATE_CLEAR", msg, "CLEARED", 1.0, "CLEAR", "ผู้ใช้เคลียร์สถานะเก่าด้วยเครื่องหมาย #");
      }
    }

    // 🛑 ตรวจสอบการขอยกเลิกกระบวนการ
    if (msg === "ยกเลิก" || msg === "ถ่ายใหม่" || msg === "ยกเลิกลงเวลา") {
      cache.remove(`PENDING_CLOCKIN_${userId}`);
      cache.remove(`PENDING_OT_CONFIRM_${userId}`);
      cache.remove(`PENDING_OT_DETAILS_${userId}`);
      cache.remove(`PENDING_IMG_CODES_${userId}`);
      emergencyReply(replyToken, "🛑 ยกเลิกกระบวนการปัจจุบันเรียบร้อยครับ!");
      return;
    }

    // [STATE]: จัดการการยืนยันรายละเอียดไซต์งานโอที
    if (pendingOTDetails && pendingOTDetails !== "CLEARED" && !msg.startsWith("#")) {
      const dataToProcess = JSON.parse(pendingOTDetails);
      cache.remove(`PENDING_OT_DETAILS_${userId}`);
      if (typeof logAuditTrail === "function") {
        logAuditTrail(userId, "PROCESS_OT_DETAILS", msg, JSON.stringify(dataToProcess), 1.0, "ACCEPT_DETAILS", "ประมวลผลรายละเอียดไซต์งานโอที");
      }
      finalizeClockInSaving(dataToProcess, userId, replyToken, dataToProcess.checkStatus, msg, dataToProcess.targetFileId);
      return;
    }

    // [STATE]: จัดการการยืนยันทำโอที
    if (pendingOTConfirm && pendingOTConfirm !== "CLEARED" && !msg.startsWith("#")) {
      const dataToProcess = JSON.parse(pendingOTConfirm);
      if (msg === "ทำที่เดิม/งานเดิม") {
        cache.remove(`PENDING_OT_CONFIRM_${userId}`);
        if (typeof logAuditTrail === "function") logAuditTrail(userId, "PROCESS_OT_CONFIRM", msg, JSON.stringify(dataToProcess), 1.0, "SAME_SITE", "ยืนยันการทำโอทีที่เดิม");
        finalizeClockInSaving(dataToProcess, userId, replyToken, dataToProcess.checkStatus, null, dataToProcess.targetFileId);
        return;
      } else if (msg === "เปลี่ยนไซต์/เปลี่ยนงาน") {
        cache.remove(`PENDING_OT_CONFIRM_${userId}`);
        cache.put(`PENDING_OT_DETAILS_${userId}`, JSON.stringify(dataToProcess), 300);
        if (typeof logAuditTrail === "function") logAuditTrail(userId, "PROCESS_OT_CONFIRM", msg, JSON.stringify(dataToProcess), 1.0, "CHANGE_SITE", "ร้องขอเปลี่ยนไซต์ทำโอที");
        emergencyReply(replyToken, "กรุณาพิมพ์ ไซต์งาน / งานที่ทำโอที ครับ");
        return;
      }
    }

    // [STATE]: ยืนยันการลงเวลาบ่าย (12.00/13.00)
    if (pendingClockIn12 && pendingClockIn12 !== "CLEARED" && !msg.startsWith("#")) {
      if (msg === "ยืนยันตามเวลาที่แจ้ง" || msg === "ลงเวลา 13.00 น.") {
        processPendingClockIn(msg, pendingClockIn12, userId, replyToken);
        if (typeof logAuditTrail === "function") logAuditTrail(userId, "PROCESS_CLOCKIN_12", msg, pendingClockIn12, 1.0, "CONFIRM_12", "ยืนยันเวลาทำงานช่วงบ่าย");
        return;
      }
    }

    // ตัดเครื่องหมาย # ออกเพื่อสกัดเป็นคำสั่ง (Command Parsing)
    let commandText = msg;
    if (msg.startsWith("#")) {
      commandText = msg.substring(1).trim();
    }

    // --- 👑 หมวดคำสั่งผู้ดูแลระบบ (Admin Only) ---
    if (isUserAdmin) {
      if (commandText.startsWith("ตั้งค่า")) {
        const parts = commandText.replace("ตั้งค่า", "").trim().split("=");
        if (parts.length >= 2) {
          if (typeof setDynamicConfig === "function") setDynamicConfig(parts[0].trim(), parts.slice(1).join("=").trim());
          if (typeof logAuditTrail === "function") logAuditTrail(userId, "ADMIN_CONFIG", commandText, parts[0].trim(), 1.0, "SET_CONFIG", "แอดมินเปลี่ยนค่าระบบ");
          emergencyReply(replyToken, `⚙️ บันทึกการตั้งค่าสำเร็จ!\n[${parts[0].trim()}] => ${parts.slice(1).join("=").trim()}`);
        } else {
          emergencyReply(replyToken, `⚠️ ตัวอย่าง: ตั้งค่า FUZZY_THRESHOLD=0.85`);
        }
        return;
      }

      if (commandText === "รายงาน" || commandText === "สร้างรายงาน" || commandText === "report") {
        emergencyReply(replyToken, "⏳ กำลังประมวลผลดึงข้อมูลและสร้างรายงาน... รอสักครู่ครับ");
        if (typeof generateProjectReportAndNotify === "function") {
          const reportStatus = generateProjectReportAndNotify();
          if (typeof logAuditTrail === "function") logAuditTrail(userId, "ADMIN_REPORT", commandText, "GENERATE", 1.0, "REPORT", "แอดมินสั่งออกรายงานสรุปโครงการ");
          emergencyReply(replyToken, reportStatus);
        } else {
          emergencyReply(replyToken, "❌ ไม่พบระบบสร้างรายงาน (generateProjectReportAndNotify)");
        }
        return;
      }

      if (commandText.startsWith("กู้คืนระบบ") || commandText.startsWith("rollback")) {
        let step = 1;
        const parts = commandText.split(" ");
        if (parts.length > 1 && !isNaN(parseInt(parts[1], 10))) step = parseInt(parts[1], 10);
        if (typeof rollbackLogic === "function") {
          const rollbackRes = rollbackLogic(userId, step);
          if (typeof logAuditTrail === "function") logAuditTrail(userId, "ADMIN_ROLLBACK", commandText, "STEP_" + step, 1.0, "ROLLBACK", "แอดมินสั่งกู้คืนระบบย้อนหลัง");
          emergencyReply(replyToken, rollbackRes.success ? rollbackRes.message : rollbackRes.error);
        }
        return;
      }

      if (commandText === "เปิดระบบ") {
        if (typeof setDynamicConfig === "function") setDynamicConfig("SYSTEM_STATUS", "ON");
        else props.setProperty("SYSTEM_STATUS", "ON");
        if (typeof logAuditTrail === "function") logAuditTrail(userId, "SYSTEM_TOGGLE", msg, "ON", 1.0, "SYSTEM_ON", "เปิดระบบทำงาน");
        emergencyReply(replyToken, "🟢 เปิดระบบการรับรายงานแล้วครับ!");
        return;
      }

      if (commandText === "ปิดระบบ") {
        if (typeof setDynamicConfig === "function") setDynamicConfig("SYSTEM_STATUS", "OFF");
        else props.setProperty("SYSTEM_STATUS", "OFF");
        if (typeof logAuditTrail === "function") logAuditTrail(userId, "SYSTEM_TOGGLE", msg, "OFF", 1.0, "SYSTEM_OFF", "ปิดระบบทำงาน");
        emergencyReply(replyToken, "🔴 ปิดระบบเรียบร้อย (บอทจะหยุดรับงานชั่วคราว ยกเว้น Admin)");
        return;
      }

      if (commandText === "สรุปย้ายแชท") {
        const summaryBlueprint = typeof generateHandoverBlueprint === "function" ? generateHandoverBlueprint() : "Blueprint V12 Active";
        emergencyReply(replyToken, summaryBlueprint);
        return;
      }

      if (commandText === "ทดสอบระบบ" || commandText === "ปิดโหมดทดสอบ") {
        handleTestMode(commandText, replyToken);
        return;
      }
    }

    if (systemStatus === "OFF" && !isUserAdmin) return;

    // --- 👷 หมวดคำสั่งทั่วไป & ลงเวลาหน้างาน ---
    if (commandText === "ยกเลิกรายการล่าสุด" || commandText === "ยกเลิกล่าสุด") {
      if (typeof logAuditTrail === "function") logAuditTrail(userId, "USER_UNDO", msg, "UNDO_LAST", 1.0, "UNDO", "ผู้ใช้ขอยกเลิกรายการล่าสุด");
      handleUndoLastAction(userId, replyToken);
      return;
    }

    if (commandText.startsWith("ยกเลิก") && commandText.length > 10 && !commandText.includes("/")) {
      handleUndoFromText(commandText.replace("ยกเลิก", "").trim(), replyToken);
      return;
    }

    if (commandText.startsWith("ยกเลิก") && commandText.includes("/")) {
      const p = commandText.replace("ยกเลิก", "").trim().split(" ");
      if (p.length >= 2 && typeof undoLastEntry === "function") {
        emergencyReply(replyToken, undoLastEntry(p[0], p[1]));
      }
      return;
    }

    if (commandText.startsWith("เช็ครายงาน") || commandText.startsWith("เช็ค") || commandText.startsWith("ตรวจสอบ") || commandText.startsWith("/check")) {
      handleCheckReport(commandText, userId, replyToken);
      return;
    }

    if (/^(คู่มือ|วิธีใช้|help|คำสั่ง)/i.test(commandText)) {
      emergencyReply(replyToken, "📘 คู่มือคำสั่ง\n1️⃣ ส่งรูปบัตรตอก\n2️⃣ ตามด้วยข้อความ:\n#1/5/69\nสวนหลวง เข้า สวนหลวง\n08.00-17.00\nทั้งหมด 3 คน");
      return;
    }

    if (/^(ลา|ขอลา|เช็ค|ดูยอด|ใครขาด|สรุปยอด|ประกาศ:|ลบ|สถานะระบบ)/.test(commandText)) {
      if (commandText === "ใครขาด" && typeof handleCheckAbsent === "function") {
        const tzTodayStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");
        emergencyReply(replyToken, handleCheckAbsent(tzTodayStr));
        return;
      }
      handleCommands(commandText, replyToken, userId);
      return;
    }

    // 📝 ประมวลผลข้อความเพื่อบันทึกเวลาทำงาน
    // แปลงพ.ศ. เป็น ค.ศ. ก่อนส่งเข้า handleClockIn
    let convertedMessage = msg.replace(/(25\d{2})/g, function(match) {
      return (parseInt(match, 10) - 543).toString();
    });

    if (/^\d{1,2}[\/.-]\d{1,2}/.test(convertedMessage) || /^\#\d{1,2}[\/.-]\d{1,2}/.test(convertedMessage)) {
      if (typeof logAuditTrail === "function") {
        logAuditTrail(userId, "CLOCKIN_ENTRY", msg, "RAW_TEXT", 1.0, "SUBMIT", "พนักงานส่งข้อความบันทึกเวลารูปแบบข้อความทั่วไป");
      }
      handleClockIn(convertedMessage, userId, replyToken);
      return;
    }

    // สแกนจับชื่อพนักงานลอยเพื่ออำนวยความสะดวกในการตรวจสอบล่วงหน้า
    if (typeof extractEmployeesFromText === "function" && typeof formatResponse === "function") {
      const extractedEmployees = extractEmployeesFromText(convertedMessage);
      if (extractedEmployees.length > 0) {
        if (typeof logAuditTrail === "function") {
          logAuditTrail(userId, "NAME_MATCHED", msg, "AI_SCAN", 1.0, "SCAN", `พบ ${extractedEmployees.length} รายชื่อ`);
        }
        const mockInfo = { date: "วันนี้", time: "รอการบันทึกข้อมูล", site: "รอระบุ" };
        const replyMsg = formatResponse(extractedEmployees, mockInfo);
        emergencyReply(replyToken, replyMsg);
        return;
      }
    }

  } catch (err) {
    console.error("handleLineWebhook Error: " + err.message);
    throw err; // ส่งต่อให้ doPost ดักจับเพื่อคืนค่า Lock
  }
}

/**
 * 👷 Core Logic: จัดการถอดรหัสข้อความและบันทึกเวลาทำงานลงฐานข้อมูลประจำวัน
 * หน้าที่: ตรวจสอบความถูกต้องของข้อมูล (Regex & AI) และเชื่อมโยงเงื่อนไข OT
 * @param {String} msg - ข้อความที่ผู้ใช้งานส่งมา (อาจมีหรือไม่มี # นำหน้า)
 * @param {String} userId - รหัสประจำตัวผู้ใช้งาน
 * @param {String} token - รหัสสำหรับตอบกลับแชท
 */
function handleClockIn(msg, userId, token) {
  let data = null;
  let cache = null;
  let pendingCodes = null;

  try {
    const cleanedMsg = typeof cleanText === "function" ? cleanText(msg) : msg.trim();
    cache = CacheService.getScriptCache();
    pendingCodes = cache.get(`PENDING_IMG_CODES_${userId}`);

    // 1. ลองแกะโครงสร้างข้อความด้วย Regular Expression แมนนวลก่อนเพื่อประหยัดทรัพยากร
    if (typeof parseComplexMessage === "function") {
      data = parseComplexMessage(cleanedMsg);
    }

    // ตรวจจับกรณีช่างระบุ OT เที่ยงแต่ Regex จับไม่ได้
    const isOtNoonMissed = /(OT|โอที)\s*เที่ยง/i.test(cleanedMsg) && (!data || !data.employees || !data.employees.some(emp => emp.has_ot_noon));

    // 🧠 ระบบ Hybrid Fallback: ถ้า Regex อ่านไม่ออก หรือตกหล่น ให้โยนไปให้ AI ช่วยแกะ
    if (!data || !data.date || !data.default_site || isOtNoonMissed) {
      if (typeof processMessageWithAI === "function") {
        data = processMessageWithAI(cleanedMsg);
        if (data) {
          // ดึงข้อมูลจำนวนพนักงานทั้งหมดจากข้อความ
          const countMatch = cleanedMsg.match(/ทั้งหมด\s*(\d+)\s*คน/);
          if (countMatch) data.expected_count = parseInt(countMatch[1], 10);

          // ตรวจสอบ OT เที่ยงซ้ำเพื่อความแม่นยำ
          const matchOT = cleanedMsg.match(/(OT|โอที)\s*เที่ยง\s*(?:(\d{1,2}[.:]\d{2})\s*[-ถึง]\s*(\d{1,2}[.:]\d{2}))?/i);
          if (matchOT) {
            data.has_ot_noon = true;
            if (matchOT[2] && matchOT[3]) {
              data.ot_noon_in = matchOT[2].replace(':', '.');
              data.ot_noon_out = matchOT[3].replace(':', '.');
            }
          }
        }
      } else {
        console.error("AI Fallback function missing: processMessageWithAI");
      }
    }
  } catch (err) {
    if (typeof logErrorToSheet === "function") logErrorToSheet(null, msg, "Error parsing message: " + err.message);
    emergencyReply(token, "❌ ระบบไม่สามารถอ่านข้อความได้ กรุณาตรวจสอบรูปแบบตามคู่มือครับ");
    return;
  }

  // 3. จัดการข้อมูลกรณีส่งรูปภาพมาก่อนหน้า (จาก Cache)
  if (pendingCodes && data) {
    let empList = [];
    if (typeof getEmployeesByCodes === "function") {
      empList = getEmployeesByCodes(JSON.parse(pendingCodes));
    }
    
    // ตรวจสอบความถูกต้องของจำนวนคน
    if (data.expected_count && data.expected_count > 0 && empList.length !== data.expected_count) {
      emergencyReply(token, `⚠️ จำนวนพนักงานไม่ตรงกัน!\nคุณพิมพ์แจ้ง: "${data.expected_count} คน"\nระบบอ่านจากรูปได้: "${empList.length} คน"\n👉 รบกวนตรวจสอบและอัปโหลดรูปใหม่ครับ`);
      cache.remove(`PENDING_IMG_CODES_${userId}`);
      return;
    }

    if (empList.length > 0) {
      data.employees = empList.map(e => ({
        firstname: e.firstname,
        lastname: e.lastname,
        task: data.has_ot_noon ? "ทำงาน (OTเที่ยง)" : "ทำงาน",
        has_ot_noon: data.has_ot_noon || false,
        ot_noon_in: data.ot_noon_in || "12.00",
        ot_noon_out: data.ot_noon_out || "13.00",
        accom: data.default_Accom || ""
      }));
      cache.remove(`PENDING_IMG_CODES_${userId}`);
    }
  }

  // 4. ตรวจสอบความสมบูรณ์ของข้อมูลขั้นสุดท้าย
  if (!data || !data.date || !data.employees || data.employees.length === 0) {
    let targetFileId = typeof getTargetFileIdByDate === "function" ? getTargetFileIdByDate(null) : null;
    if (typeof logErrorToSheet === "function") {
      logErrorToSheet(targetFileId, msg, "❌ ไม่พบรายชื่อพนักงาน");
    }
    emergencyReply(token, "❌ ข้อมูลไม่ครบถ้วนครับ!\nหากต้องการลงเวลาโดยไม่พิมพ์ชื่อ โปรดส่ง 'รูปบัตรตอก' เข้ามาก่อนครับ");
    return;
  }

  data.original_msg = msg;

  // 5. สแกนตรวจสอบเงื่อนไขล็อกวันเวลาส่งย้อนหลัง (Validation)
  let check = { status: "OK", msg: "" };
  if (typeof checkDateLogic === "function") {
    check = checkDateLogic(data.date);
  } else {
    // Basic validation fallback
    const entryDateParts = data.date.split(/[\/\-.]/);
    if (entryDateParts.length >= 3) {
      let entryYear = parseInt(entryDateParts[2], 10);
      entryYear = entryYear < 100 ? 2000 + entryYear : entryYear;
      entryYear = entryYear > 2400 ? entryYear - 543 : entryYear;
      
      const entryDate = new Date(entryYear, parseInt(entryDateParts[1], 10) - 1, parseInt(entryDateParts[0], 10));
      entryDate.setHours(0, 0, 0, 0);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const diffDays = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
      const limit = parseInt(getDynamicConfig("BACKDATE_LIMIT_DAYS", "2"), 10);
      
      if (diffDays > limit) {
        check = { status: "BLOCK", msg: `ห้ามส่งข้อมูลย้อนหลัง ${limit} วันขึ้นไป` };
      } else if (diffDays > 0) {
        check = { status: "WARNING", msg: `ส่งข้อมูลย้อนหลัง ${diffDays} วัน` };
      }
    }
  }

  const isUserAdmin = verifyAdminRole(userId);

  // 6. เช็คการบล็อกวันที่ (Admin สามารถส่งย้อนหลังได้)
  if (check.status === "BLOCK" && !isUserAdmin) {
    emergencyReply(token, `⛔ บันทึกไม่ได้: ${check.msg}\n(การส่งรายงานเวลางานย้อนหลัง ถูกจำกัดสิทธิ์ให้แก้ไขได้เฉพาะแอดมินเท่านั้นครับ)`);
    return;
  }
  
  data.checkStatus = check;

  let targetFileId = null;
  if (typeof getTargetFileIdByDate === "function") {
    targetFileId = getTargetFileIdByDate(data.date);
  }

  // 7. สแกนตรวจสอบเวลาเข้างาน กรณีช่างเข้างานช่วงเวลาเที่ยงวัน (สลับกะ/ลงเวลาครึ่งวันหลัง)
  if (data.time_start) {
    const startTimeStr = data.time_start.toString();
    const startHour = parseInt(startTimeStr.split('.')[0], 10);
    if (startHour === 12) {
        data.targetFileId = targetFileId;
        cache.put(`PENDING_CLOCKIN_${userId}`, JSON.stringify(data), 300);
        replyWithButtons(token, `ลงข้อมูลตามเวลาเข้าจริง (${startTimeStr} น.) หรือต้องการปัดเป็นเวลา 13.00 น. ครับ?`, ["ยืนยันตามเวลาที่แจ้ง", "ลงเวลา 13.00 น.", "ยกเลิกลงเวลา"]);
        return;
    }
  }

  // 8. ส่งเข้าสู่ด่านตรวจสอบโอที (Overtime Mapping Control)
  if (typeof checkOTAndProceed === "function") {
    checkOTAndProceed(data, userId, token, check, targetFileId);
  } else {
    // หากไม่มีฟังก์ชันให้บันทึกตรงเลย
    finalizeClockInSaving(data, userId, token, check, null, targetFileId);
  }
}

/**
 * หน้าที่: ตรวจสอบเงื่อนไขการทำโอทีและส่งปุ่มยืนยัน หรือเข้าสู่ขั้นตอนบันทึกโดยตรง (Synchronous)
 * @param {Object} dataToProcess - ข้อมูลลงเวลา
 * @param {String} userId - รหัสผู้ใช้ LINE
 * @param {String} token - โทเคนสำหรับตอบกลับ
 * @param {Object} check - สถานะการตรวจสอบวันที่
 * @param {String|null} targetFileId - ไอดีไฟล์ Spreadsheet ปลายทาง
 */
function checkOTAndProceed(dataToProcess, userId, token, check, targetFileId) {
  try {
    const toMins = function(t) { 
      if (!t) return 0; 
      const parts = t.toString().replace('.', ':').split(':'); 
      return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0); 
    };
    
    const sMins = toMins(dataToProcess.time_start);
    let eMins = toMins(dataToProcess.time_end);
    let hasOT = false;

    if (eMins > 0) {
      if (eMins < sMins) eMins += 24 * 60; // ป้องกันกรณีเข้างานเย็น เลิกเช้าของอีกวัน
      let otMins = 0;
      
      // กะเช้าก่อน 08.00 น. (480 นาที)
      if (sMins < 480) {
        otMins += (Math.min(eMins, 480) - sMins);
      }
      // กะเย็นหลัง 17.00 น. (1020 นาที)
      if (eMins > 1020) {
        otMins += (eMins - Math.max(sMins, 1020));
      }

      // OT พักเที่ยง
      let hasNoonOt = false;
      let noonOtMins = 0;
      if (dataToProcess.employees && dataToProcess.employees.length > 0) {
        dataToProcess.employees.forEach(function(emp) {
          if (emp.has_ot_noon) {
            hasNoonOt = true;
            noonOtMins = Math.max(noonOtMins, toMins(emp.ot_noon_out || "13.00") - toMins(emp.ot_noon_in || "12.00"));
          }
        });
      }
      
      if (hasNoonOt) {
        otMins += noonOtMins;
      }
      
      // ฟังก์ชัน Pooling: หักเวลา OT ไปโปะเวลาปกติให้ครบ 8 ชม. (หากมีการตั้งค่า)
      const nIn = Math.max(sMins, 480); 
      const nOut = Math.min(eMins, 1020);
      let normMins = Math.max(0, nOut - nIn);
      if (nIn <= 720 && nOut >= 780) normMins -= 60; // หักพักเที่ยง 1 ชม.

      let gap = 480 - normMins; // ขาดอีกกี่นาทีถึงจะครบ 8 ชม. (480 นาที)
      if (gap > 0 && otMins > 0) {
        otMins -= Math.min(gap, otMins); // นำโอทีมาโปะให้
      }

      if (otMins > 0) {
        hasOT = true;
      }
    }

    if (hasOT) {
      dataToProcess.checkStatus = check;
      dataToProcess.targetFileId = targetFileId;
      
      const cache = CacheService.getScriptCache();
      cache.put(`PENDING_OT_CONFIRM_${userId}`, JSON.stringify(dataToProcess), 300);
      
      replyWithButtons(token, `ตรวจพบการทำ OT\n\nโปรดยืนยันว่า... ทำ OT ที่ไซต์งานเดิม และ ลักษณะงานเดิม หรือไม่?`, ["ทำที่เดิม/งานเดิม", "เปลี่ยนไซต์/เปลี่ยนงาน", "ยกเลิกลงเวลา"]);
    } else {
      finalizeClockInSaving(dataToProcess, userId, token, check, null, targetFileId);
    }
  } catch (err) {
    console.error("checkOTAndProceed Error: " + err.message);
    emergencyReply(token, "❌ ขัดข้องระหว่างตรวจสอบโอที กรุณาลองใหม่ครับ");
  }
}

/**
 * หน้าที่: ประมวลผลสถานะยืนยันช่วงเวลาบ่ายที่ค้างในระบบคิว
 * @param {String} answer - คำตอบจากปุ่ม
 * @param {String} pendingDataStr - JSON ข้อมูลที่ค้างในคิว
 * @param {String} userId - ไอดีผู้ใช้งาน
 * @param {String} token - โทเคนตอบกลับ
 */
function processPendingClockIn(answer, pendingDataStr, userId, token) {
  const cache = CacheService.getScriptCache();
  try {
    let dataToProcess = JSON.parse(pendingDataStr);
    if (answer === "ลงเวลา 13.00 น.") dataToProcess.time_start = "13.00";
    cache.remove(`PENDING_CLOCKIN_${userId}`);
    checkOTAndProceed(dataToProcess, userId, token, dataToProcess.checkStatus, dataToProcess.targetFileId);
  } catch (e) {
    cache.remove(`PENDING_CLOCKIN_${userId}`);
    emergencyReply(token, "❌ ข้อมูลหมดอายุหรือเกิดข้อผิดพลาด กรุณาส่งรายการลงเวลามาใหม่อีกครั้งครับ");
  }
}

/**
 * หน้าที่: บันทึกข้อมูลที่สมบูรณ์แล้วลง Spreadsheet และจัดรูปแบบข้อความสรุปผลลัพธ์เพื่อส่งกลับ (Synchronous)
 * @param {Object} data - ข้อมูลพนักงาน การลงเวลา และสถานที่ทำงาน
 * @param {String} userId - รหัสผู้ส่ง
 * @param {String} token - รหัสสำหรับตอบกลับข้อความ
 * @param {Object} check - สถานะการตรวจสอบวันที่
 * @param {String|null} customOt - รายละเอียดไซต์งานหรือลักษณะงาน OT (หากมีการเปลี่ยนแปลง)
 * @param {String} targetId - รหัสเอกสารรายเดือนที่ต้องบันทึก
 */
function finalizeClockInSaving(data, userId, token, check, customOt, targetId) {
  try {
    const props = PropertiesService.getScriptProperties();
    const isTesting = getDynamicConfig("IS_TESTING") === "TRUE";
    
    if (!data || !data.date) { 
      emergencyReply(token, "❌ ข้อมูลสูญหายระหว่างทำรายการ กรุณาส่งข้อมูลเพื่อลงเวลาใหม่อีกครั้งครับ"); 
      return; 
    }
    
    if (!targetId) {
      if (typeof getTargetFileIdByDate === "function") {
        targetId = getTargetFileIdByDate(data.date);
      }
    }
    
    if (!targetId) { 
      emergencyReply(token, "❌ ไม่พบไฟล์ Spreadsheet สำหรับเดือนนี้"); 
      return; 
    }

    let writeRes = { count: 0, errors: [], accom: "ไม่ได้ระบุ" };
    
    // 🚀 เรียกใช้งาน Batch Writer เพื่อความรวดเร็วและลดภาระ I/O
    if (typeof writeToDailySheetBatch === 'function') {
      writeRes = writeToDailySheetBatch(data, userId, targetId);
    } else if (typeof writeToDailySheet === 'function') {
      writeRes = writeToDailySheet(data, userId, targetId);
    }

    // --- ส่วนประมวลผล OT ที่ระบุใหม่ (Custom OT) ---
    let customOtSite = null; 
    let customOtTask = null;
    
    if (customOt && writeRes.count > 0) {
      const parts = customOt.split('/');
      customOtSite = parts[0] ? parts[0].trim() : data.default_site;
      customOtTask = parts[1] ? parts[1].trim() : "ทำ OT";

      try {
        const ss = typeof getCachedSpreadsheet === "function" ? getCachedSpreadsheet(targetId) : SpreadsheetApp.openById(targetId);
        let targetSheetName = data.date;
        if (typeof parseThaiDate === "function") {
          targetSheetName = parseThaiDate(data.date);
        }
        
        let sheet = ss.getSheetByName(targetSheetName);
        
        // Hotfix: ค้นหาชีตแบบทนทานต่อช่องว่างที่ผิดพลาด (Trim Spaces)
        if (!sheet) {
          const cleanTarget = targetSheetName.replace(/\s+/g, "");
          const sheets = ss.getSheets();
          for (let i = 0; i < sheets.length; i++) {
            if (sheets[i].getName().replace(/\s+/g, "") === cleanTarget) { 
              sheet = sheets[i]; 
              break; 
            }
          }
        }

        if (sheet) {
          const startRowConfig = parseInt(getDynamicConfig("START_ROW", "3"), 10);
          // ดึงเฉพาะคอลัมน์ D และ E (ชื่อ-นามสกุล)
          const dbData = sheet.getRange(startRowConfig, 4, Math.max(1, sheet.getLastRow() - startRowConfig + 1), 2).getValues();
          
          data.employees.forEach(function(emp) {
            const inputName = typeof normalize === 'function' ? normalize(emp.firstname) : emp.firstname;
            for (let i = 0; i < dbData.length; i++) {
              const dbName = typeof normalize === 'function' ? normalize(dbData[i][0]) : dbData[i][0];
              if (dbName === inputName) {
                const targetRow = i + startRowConfig;
                // อัปเดตคอลัมน์ 9 (OT Site) และ 10 (OT Task)
                sheet.getRange(targetRow, 9).setValue(customOtSite);
                sheet.getRange(targetRow, 10).setValue(customOtTask);
                break;
              }
            }
          });
        }
      } catch (e) { 
        console.error("Custom OT error: " + e.message); 
      }
    }

    // --- จัดเตรียมข้อความแจ้งเตือน (Warning & Errors) ---
    let txt = (check && check.status === "WARNING") ? `⚠️ ${check.msg}\n` : "";
    if (writeRes.errors && writeRes.errors.length > 0) {
      txt += `⚠️ หาชื่อไม่พบ: ${writeRes.errors.join(', ')}\n`;
    }
    
    if (txt !== "" || !writeRes || writeRes.count === 0) {
      if (typeof logErrorToSheet === "function") {
        logErrorToSheet(targetId, data.original_msg || "ไม่มีข้อความตั้งต้น", txt || "บันทึกไม่ได้ เนื่องจากไม่พบพนักงานในระบบ");
      }
    }

    // --- สร้างข้อความสรุปผลเพื่อส่งให้ผู้ใช้งาน ---
    const countValue = writeRes ? writeRes.count : 0;
    let timeStatus = "";
    if (!data.time_end || data.time_end === "") {
        timeStatus = `(ลงเวลาเข้า: ${data.time_start})`; 
    } else {
        const toMins = (t) => {
            if (!t) return 0;
            const parts = t.toString().replace('.', ':').split(':');
            return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
        };
        
        const sMins = toMins(data.time_start);
        let eMins = toMins(data.time_end);
        if (eMins < sMins) eMins += 24 * 60; 
        
        let otMins = 0; let normMins = 0;
        if (sMins < 480) otMins += (Math.min(eMins, 480) - sMins);
        
        const nIn = Math.max(sMins, 480); const nOut = Math.min(eMins, 1020);
        normMins = Math.max(0, nOut - nIn);
        if (nIn <= 720 && nOut >= 780) normMins -= 60; 
        if (eMins > 1020) otMins += (eMins - Math.max(sMins, 1020));
        
        let hasNoonOt = false; let noonOtMins = 0;
        if (data.employees) {
            data.employees.forEach(emp => {
                if (emp.has_ot_noon) {
                    hasNoonOt = true;
                    let mIn = toMins(emp.ot_noon_in || "12.00");
                    let mOut = toMins(emp.ot_noon_out || "13.00");
                    noonOtMins = Math.max(noonOtMins, mOut - mIn);
                }
            });
        }
        if (hasNoonOt) otMins += noonOtMins;
        
        const normHr = parseFloat((normMins / 60).toFixed(2));
        const otHr = parseFloat((otMins / 60).toFixed(2));
        
        let otText = otHr > 0 ? ` | OT: ${otHr} ชม.` : "";
        timeStatus = `(เวลา: ${data.time_start}-${data.time_end} ➡️ ปกติ: ${normHr} ชม.${otText})`;
    }
    
    let displaySite = data.default_site; 
    if (customOtSite) {
      displaySite += `\n[ไซต์ OT: ${customOtSite} | งาน OT: ${customOtTask}]`;
    }
    
    const accomText = data.default_Accom || (writeRes && writeRes.accom) || 'ไม่ได้ระบุ';
    const statusText = countValue === 0 ? "❌ ไม่พบข้อมูลที่บันทึกได้" : `✅ บันทึกสำเร็จ ${countValue} คน`;
    const dateToShow = data.date ? `\n📅 วันที่: ${data.date}` : "";
    const testTag = isTesting ? "\n🧪 [โหมดทดสอบ - ข้อมูลจะถูกล้างเมื่อจบ]" : "";
    const errorInfo = txt ? "\n" + txt : "";

    const finalMessage = `${statusText}${dateToShow}\n${timeStatus}\nไซต์: ${displaySite}\n[ที่พัก: ${accomText}]${testTag}${errorInfo}\n\n📌 โปรดตรวจเช็คความถูกต้อง หากผิดพลาดแจ้งแอดมินทันที`;
    
    emergencyReply(token, finalMessage);

  } catch (err) {
    console.error("finalizeClockInSaving Error: " + err.message);
    emergencyReply(token, "🔴 ข้อผิดพลาดขณะบันทึกข้อมูล กรุณาแจ้ง Admin ครับ\n\nรายละเอียด: " + err.message);
  }
}

/**
 * 🛠️ ฟังก์ชันตอบกลับไลน์แบบด่วน (พ่นข้อความธรรมดา) โหลด Token จากระบบด้วยตนเองเพื่อป้องกันปัญหา Global Token
 * @param {String} replyToken - รหัสตอบกลับจาก LINE
 * @param {String} msg - ข้อความที่ต้องการส่ง
 */
function emergencyReply(replyToken, msg) {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = getDynamicConfig('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token) {
      console.error("🚨 ทรัพยากรสูญหาย: ไม่พบ LINE_CHANNEL_ACCESS_TOKEN");
      return;
    }
    
    const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      'headers': {
        'Content-Type': 'application/json; charset=UTF-8',
        'Authorization': 'Bearer ' + token,
      },
      'method': 'post',
      'payload': JSON.stringify({
        'replyToken': replyToken,
        'messages': [{ 'type': 'text', 'text': msg }]
      }),
      'muteHttpExceptions': true
    });

    // ตรวจสอบผลการส่ง ถ้าไม่ใช่ 200 OK ให้พ่น Error ลงระบบ
    if (response.getResponseCode() !== 200) {
      console.error("🔴 LINE API Error: " + response.getContentText());
    }
  } catch(e) {
    console.error("emergencyReply fatal error:", e.message);
  }
}

/**
 * 🛠️ ฟังก์ชันส่ง Quick Reply กลับหาผู้ใช้ (บังคับใส่เครื่องหมาย # นำหน้าอัตโนมัติเพื่อป้องกันตัวกรองบล็อก)
 * @param {String} replyToken - รหัสตอบกลับ
 * @param {String} text - ข้อความที่จะแสดง
 * @param {Array<String>} options - ตัวเลือกบนปุ่มกด
 */
function replyWithButtons(replyToken, text, options) {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = getDynamicConfig('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token) return;
    
    // เติมเครื่องหมาย # เข้าไปที่ค่า text ฝั่งส่งกลับ (ยกเว้นบางปุ่มที่มีความหมายเฉพาะ)
    const quickReplyItems = options.map(label => {
      const isSystemCommand = ["ยอมรับ", "ปฏิเสธ", "ยกเลิกทั้งหมด", "ถ่ายใหม่", "ยกเลิกลงเวลา"].includes(label);
      return {
        "type": "action",
        "action": { "type": "message", "label": label, "text": isSystemCommand ? label : `#${label}` }
      };
    });

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
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": "Bearer " + token 
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.error("replyWithButtons error:", e.message);
  }
}

/**
 * 🖼️ หน้าที่: ประมวลผลและสกัดข้อมูลรหัสพนักงานจากรูปบัตรตอก โดยเรียกใช้โครงข่ายประสาทเทียม Gemini Vision
 * @param {String} messageId - รหัสของรูปภาพที่ถูกอัปโหลดใน LINE
 * @param {String} replyToken - รหัสสำหรับตอบกลับข้อความ
 * @param {String} userId - รหัสประจำตัวผู้ใช้
 */
function handleImageProcess(messageId, replyToken, userId) {
  try {
    const token = getDynamicConfig('LINE_CHANNEL_ACCESS_TOKEN');
    
    if (!token) {
      emergencyReply(replyToken, "❌ ระบบไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN");
      return;
    }

    // ดาวน์โหลดรูประดับไบนารีจาก LINE
    const blob = UrlFetchApp.fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { "Authorization": "Bearer " + token },
      muteHttpExceptions: true
    }).getBlob();

    const base64Image = Utilities.base64Encode(blob.getBytes());
    
    // เรียกใช้งาน Vision API แบบ Synchronous
    let aiRes = null;
    if (typeof callGeminiVision === "function") {
      aiRes = callGeminiVision(base64Image, `วิเคราะห์ตัวเลขรหัสพนักงานในภาพ และส่งคืนเป็น JSON: { "codes": ["52011", "52012"] }`, "image/jpeg");
    }

    if (!aiRes || !aiRes.codes || aiRes.codes.length === 0) {
      emergencyReply(replyToken, "❌ AI มองไม่เห็นรหัสพนักงานในภาพ หรือภาพอาจไม่ชัดเจนครับ โปรดถ่ายใหม่");
      return;
    }

    let emps = [];
    if (typeof getEmployeesByCodes === "function") {
      emps = getEmployeesByCodes(aiRes.codes);
    }

    if (emps.length === 0) {
      emergencyReply(replyToken, `⚠️ ตรวจพบรหัส [${aiRes.codes.join(", ")}] แต่ไม่พบในฐานข้อมูลระบบพนักงานปัจจุบันครับ`);
      return;
    }

    // พักข้อมูลรหัสพนักงานไว้ในแคช เพื่อรอให้พนักงานพิมพ์รายละเอียดสถานที่และเวลาตามมา
    const cache = CacheService.getScriptCache();
    cache.put(`PENDING_IMG_CODES_${userId}`, JSON.stringify(aiRes.codes), 600);

    const todayDate = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
    const replyMsg = `✅ ตรวจพบพนักงาน ${emps.length} คน\n📅 วันที่: ${todayDate}\n(เวลา: กำลังรอการแจ้งเวลา)\nไซต์: กำลังรอแจ้ง\n[ที่พัก: กำลังรอแจ้ง]\n\n📌 โปรดพิมพ์รายละเอียดงานเพื่อบันทึกต่อได้เลยครับ`;
    
    emergencyReply(replyToken, replyMsg);

  } catch (e) {
    console.error("handleImageProcess Error: " + e.message);
    emergencyReply(replyToken, "❌ Error การอ่านรูปภาพ: " + e.message + " กรุณาลองอัปโหลดใหม่อีกครั้ง");
  }
}

/**
 * 🛠️ ตรวจสอบสิทธิ์แอดมิน (Admin Verification) 
 * @param {String} userId - ไอดีที่ต้องการตรวจสอบ
 * @returns {Boolean} true หากเป็น Admin
 */
function verifyAdminRole(userId) {
  if (!userId) return false;
  
  const cachedAdmins = getDynamicConfig("ADMIN_LINE_IDS") || "";
  if (cachedAdmins.includes(userId)) return true;

  const adminIdsString = getDynamicConfig("ADMIN_LINE_IDS") || getDynamicConfig("ADMIN_ID_LIST") || "";
  const adminIds = adminIdsString.split(",").map(s => s.trim()).filter(Boolean);
  return adminIds.includes(userId);
}

// =================================================================
// ส่วนเสริมการจัดการคำสั่งทั่วไปและ ChatOps
// =================================================================

function handleUndoLastAction(userId, token) {
  const props = PropertiesService.getScriptProperties();
  const lastJson = getDynamicConfig(`LAST_ENTRY_${userId}`);
  if (!lastJson) {
    emergencyReply(token, "⚠️ ไม่พบรายการล่าสุดที่คุณทำการบันทึก");
    return;
  }
  try {
    const last = JSON.parse(lastJson);
    if (typeof undoLastEntry === "function" && last.names && last.names.length > 0) {
      emergencyReply(token, undoLastEntry(last.names[0], last.date));
    } else {
      emergencyReply(token, "❌ ไม่สามารถดึงข้อมูลรายการล่าสุดได้สมบูรณ์");
    }
    props.deleteProperty(`LAST_ENTRY_${userId}`);
  } catch (e) {
    emergencyReply(token, "❌ ขัดข้องระหว่างการยกเลิก: " + e.message);
  }
}

function handleUndoFromText(text, token) {
  let dataToUndo = null;
  if (typeof parseComplexMessage === "function") {
    dataToUndo = parseComplexMessage(text);
  }
  
  if (!dataToUndo || !dataToUndo.date) {
    emergencyReply(token, "❌ ไม่พบวันที่ หรือรูปแบบการพิมพ์เพื่อยกเลิกไม่ถูกต้อง");
    return;
  }
  
  try {
    if (typeof undoLastEntry === "function" && dataToUndo.employees && dataToUndo.employees.length > 0) {
      emergencyReply(token, undoLastEntry(dataToUndo.employees[0].firstname, dataToUndo.date));
    }
  } catch (e) {
    emergencyReply(token, "❌ ขัดข้องระหว่างการยกเลิก: " + e.message);
  }
}

function handleCheckReport(content, userId, replyToken) {
  if (typeof getDailyCheckInSummary !== "function") {
    emergencyReply(replyToken, "ฟังก์ชันเช็ครายงานไม่พร้อมทำงาน (Missing getDailyCheckInSummary)");
    return;
  }
  
  const dateStr = typeof parseThaiDate === 'function' ? parseThaiDate(new Date()) : new Date().toLocaleDateString('th-TH');
  const result = getDailyCheckInSummary(dateStr);
  
  if (result.error) {
    emergencyReply(replyToken, `❌ เกิดข้อผิดพลาด: ${result.error}`);
    return;
  }
  
  let msg = `📊 สรุปรายงานเช็คอินวันที่ ${result.dateStr}\n`;
  msg += `✅ เข้างานแล้ว: ${result.checkedIn.length} คน\n`;
  
  const maxDisplay = 30;
  const showCheckedIn = result.checkedIn.slice(0, maxDisplay);
  showCheckedIn.forEach(emp => {
    msg += ` - ${emp.name} (${emp.site})\n`;
  });
  if (result.checkedIn.length > maxDisplay) msg += `   ...และอีก ${result.checkedIn.length - maxDisplay} คน\n`;
  
  msg += `\n❌ ยังไม่เข้างาน/ขาด: ${result.absent.length} คน\n`;
  const showAbsent = result.absent.slice(0, maxDisplay);
  showAbsent.forEach(name => {
    msg += ` - ${name}\n`;
  });
  if (result.absent.length > maxDisplay) msg += `   ...และอีก ${result.absent.length - maxDisplay} คน`;
  
  emergencyReply(replyToken, msg.trim());
}

function handleCommands(msg, token, userId) {
  let raw = null;
  if (typeof callGemini === "function") {
    raw = callGemini(msg, `Analyze intent: LEAVE, BROADCAST, HELP, SYSTEM_STATUS. Output pure JSON format {intent: "...", data: {...}}`, true);
  }
  
  if (!raw) {
    emergencyReply(token, "⚠️ ไม่สามารถติดต่อ AI วิเคราะห์คำสั่งได้ครับ");
    return;
  }

  switch (raw.intent) {
    case "LEAVE":
      if (typeof recordLeaveData === "function" && raw.data) {
        emergencyReply(token, recordLeaveData(raw.data.name, raw.data.type, raw.data.date));
      }
      break;
    case "SYSTEM_STATUS":
      const status = getDynamicConfig("SYSTEM_STATUS");
      emergencyReply(token, `⚙️ Status ระบบการจัดการปัจจุบัน: ${status || "ON"}`);
      break;
    default:
      emergencyReply(token, "⚠️ ระบบไม่เข้าใจคำสั่ง หรือคำสั่งอยู่นอกเหนือขอบเขตครับ");
  }
}

function handleTestMode(content, replyToken) {
  const props = PropertiesService.getScriptProperties();
  if (content === "ทดสอบระบบ") {
    props.setProperty("IS_TESTING", "TRUE");
    emergencyReply(replyToken, "🧪 เปิดโหมดทดสอบแล้ว (ข้อมูลจะถูกจัดเก็บโดยมีสัญลักษณ์ทดสอบกำกับ)");
  } else if (content === "ปิดโหมดทดสอบ") {
    props.setProperty("IS_TESTING", "FALSE");
    emergencyReply(replyToken, "🧹 ปิดโหมดทดสอบแล้ว");
  }
}

// =================================================================
// 🧠 GEMINI API WRAPPERS (AI Connections)
// =================================================================

/**
 * 🚀 ฟังก์ชันช่วยเหลือพื้นฐาน (Helper Utilities)
 */
function fetchWithRetry(url, options = {}, attempts = 3, backoffMs = 500) {
  options = options || {};
  if (!options.method) options.method = 'get';
  if (typeof options.muteHttpExceptions === 'undefined') options.muteHttpExceptions = true;

  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = UrlFetchApp.fetch(url, options);
      const code = res.getResponseCode();
      if (code >= 200 && code < 300) return res;
      if (code >= 400 && code < 500) {
        throw new Error("HTTP " + code + " " + res.getContentText());
      }
      lastErr = new Error("HTTP " + code + " " + res.getContentText());
    } catch (e) {
      lastErr = e;
      if (i === attempts - 1) throw e;
      Utilities.sleep(backoffMs * Math.pow(2, i));
    }
  }
  throw lastErr || new Error("fetchWithRetry failed");
}

function fetchGemini(url, payload, isJson) {
  try {
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const res = fetchWithRetry(url, options, 3, 400);
    if (!res) return null;
    
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      console.error("fetchGemini non-2xx: " + code + " -> " + res.getContentText());
      return null;
    }
    
    const textBody = res.getContentText();
    let json;
    try { json = JSON.parse(textBody); } catch (e) { console.error("fetchGemini parse error: " + e.message); return null; }

    const candidates = (json && json.candidates) ? json.candidates : null;
    if (!candidates || !candidates[0]) return null;
    const content = candidates[0].content || {};
    const parts = content.parts || [];
    let text = parts.map(p => (p && p.text) ? p.text : "").join("\n").trim();

    if (isJson) {
      // คลีน Backtick ออกเพื่อป้องกัน JSON Parsing พัง
      text = text.replace(new RegExp("\\x60\\x60\\x60(?:json)?", "gi"), "").replace(new RegExp("\\x60\\x60\\x60", "g"), "").trim();
      const startBrace = text.indexOf('{');
      const startBracket = text.indexOf('[');
      let startIdx = -1;
      
      if (startBrace === -1 && startBracket === -1) {
        try { return JSON.parse(text); } catch (e) { return null; }
      } else {
        if (startBrace === -1) startIdx = startBracket;
        else if (startBracket === -1) startIdx = startBrace;
        else startIdx = Math.min(startBrace, startBracket);
      }
      
      const candidateStr = text.substring(startIdx).trim();
      try {
        return JSON.parse(candidateStr);
      } catch (e) {
        return null; // Fallback หากโครงสร้าง JSON ไม่สมบูรณ์
      }
    }
    return text;
  } catch (e) {
    console.error("fetchGemini error: " + (e && e.message ? e.message : e));
    return null;
  }
}

function callGemini(content, systemInstruction, isJson, useWebKey = false) {
  const model = getDynamicConfig("MODEL_NAME", "gemini-2.5-flash"); // หรือ gemini-1.5-flash
  
  const apiKey = useWebKey 
    ? (getDynamicConfig("GEMINI_API_KEY_WEB") || getDynamicConfig("GEMINI_API_KEY_LINE"))
    : (getDynamicConfig("GEMINI_API_KEY_LINE") || getDynamicConfig("GEMINI_API_KEY_WEB"));

  if (!apiKey) {
    console.error("GEMINI_API_KEY not set");
    return null;
  }
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: content || "" }] }],
    systemInstruction: { parts: [{ text: systemInstruction || "" }] },
    generationConfig: { responseMimeType: isJson ? "application/json" : "text/plain" }
  };
  
  return fetchGemini(url, payload, !!isJson);
}




/**
 * บันทึกเหตุการณ์เชิงตรวจสอบของระบบ (Audit Log ระบบ)
 */
function logSystemEvent(actionType, source, details) {
  try {
    const timestamp = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss");
    console.log(`[${timestamp}] [AUDIT] ${actionType} | ${source} | ${details}`);
  } catch (e) {
    console.error("Log failed: " + e.message);
  }
}

/**
 * 1. ล้างข้อมูลข้อความ (ทำความสะอาดอักขระพิเศษ)
 */
function cleanText(text) {
  if (!text) return "";
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * 2. ตรวจสอบเงื่อนไขวันย้อนหลัง
 * คืนค่า status เป็น "OK", "WARNING", หรือ "BLOCK"
 */
function checkDateLogic(dateStr) {
  const parts = dateStr.split(/[\/\-.]/);
  if (parts.length < 3) return { status: "OK", msg: "" };

  let day = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  year = year < 100 ? 2000 + year : (year > 2400 ? year - 543 : year);

  const entryDate = new Date(year, month, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - entryDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  const limit = parseInt(getDynamicConfig("BACKDATE_LIMIT_DAYS", "2"), 10);
  
  if (diffDays > limit) {
    return { status: "BLOCK", msg: `ห้ามส่งข้อมูลย้อนหลังเกิน ${limit} วัน` };
  } else if (diffDays > 0) {
    return { status: "WARNING", msg: `ส่งข้อมูลย้อนหลัง ${diffDays} วัน` };
  }
  return { status: "OK", msg: "" };
}

/**
 * 3. Gateway สำหรับ Web App Portal
 * (กรณีส่งข้อมูลผ่านฟอร์มหน้าเว็บ)
 */
function handleWebAppGateway(requestData) {
  console.log("Processing Web App Data: ", JSON.stringify(requestData));
  // เขียนตรรกะการบันทึกข้อมูลจากหน้าเว็บลง Spreadsheet ที่นี่
  // ถ้ายังไม่มี ให้ใส่ return ไว้ก่อนเพื่อป้องกัน Error
  return { status: "success" };
}

/**
 * 4. Helper สำหรับ Verify Admin (ถ้ายังไม่มี)
 */
function verifyAdminRole(userId) {
  const adminIds = getDynamicConfig("ADMIN_LINE_ID", "");
  return adminIds.split(",").includes(userId) || (typeof isAdmin === "function" && isAdmin(userId));
}