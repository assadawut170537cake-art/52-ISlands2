// =================================================================
// 1_LineBot.gs (ด่านหน้ารับข้อความ Line, ChatOps, และลอจิกแชทบอท)
// =================================================================

function reply(tk, m) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getDynamicConfig('LINE_CHANNEL_ACCESS_TOKEN')
    },
    method: 'post',
    payload: JSON.stringify({ replyToken: tk, messages: [{ type: 'text', text: m }] })
  });
}

/**
 * ส่งข้อความพร้อมปุ่มเลือก (Quick Reply) ไปยัง LINE
 * @param {string} tk - Reply Token
 * @param {string} t - ข้อความที่จะส่ง
 * @param {Array<string>} b - อาร์เรย์ของปุ่ม (Label/Text)
 */
function replyWithButtons(tk, t, b) {
  try {
    const LINE_TOKEN = getDynamicConfig('LINE_CHANNEL_ACCESS_TOKEN');
    if (!LINE_TOKEN) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");

    const items = b.map(l => ({ 
      "type": "action", 
      "action": { "type": "postback", "label": l, "data": "#" + l } 
    }));

    const payload = { 
      replyToken: tk, 
      messages: [{ 
        "type": "text", 
        "text": t, 
        "quickReply": { "items": items } 
      }] 
    };

    const response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + LINE_TOKEN
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true // สำคัญ: เพื่อให้เราจัดการ Error เองได้โดยไม่หยุดการทำงาน
    });

    const code = response.getResponseCode();
    if (code !== 200) {
      console.error(`LINE API Error (${code}): ${response.getContentText()}`);
    }
  } catch (e) {
    console.error("replyWithButtons failed: " + e.message);
  }
}

function doPost(e) {
  if (!e || !e.postData) return ContentService.createTextOutput("No Data");
  
  try {
    var eventData = JSON.parse(e.postData.contents);
    var event = eventData.events[0];
    if (!event) return ContentService.createTextOutput("OK");
    
    var source = event.source;
    var groupId = source.groupId;
    
    // ตรวจสอบสิทธิ์ Group ID
    if (source.type === "group" && typeof isAllowedGroup === "function" && !isAllowedGroup(groupId)) {
      return ContentService.createTextOutput("OK");
    }

    if (event.type === "message" || event.type === "postback") {
      const lock = LockService.getScriptLock();
      let globalReplyToken = event.replyToken;
      
      try {
        // รอคิวเข้าถึงทรัพยากรสูงสุด 30 วินาที ป้องกัน Race Condition
        lock.waitLock(30000);
        
        const userId = source.userId;
        const adminId = typeof getDynamicConfig === "function" ? getDynamicConfig("ADMIN_LINE_IDS") : "";
        const adminList = (adminId || "").split(",").map(id => id.trim());
        const status = typeof getDynamicConfig === "function" ? getDynamicConfig("SYSTEM_STATUS") : "ON";
        const isUserAdmin = adminList.includes(userId) || (typeof isAdmin === "function" && isAdmin(userId));

        let msg = "";
        let isTextMsg = false;
        
        if (event.type === "postback") {
           msg = event.postback.data.trim();
           isTextMsg = true;
        } else if (event.message && event.message.type === "text") {
           msg = event.message.text.trim();
           isTextMsg = true;
        }

        if (isTextMsg) {
          
          // 🛡️ ป้องกันช่างส่งงานทางแชทส่วนตัว (อนุญาตเฉพาะ Admin)
          if (source.type === "user" && !isUserAdmin) {
            if (typeof reply === "function") reply(globalReplyToken, "⚠️ ขออภัยครับ บอทรับลงรายงานเฉพาะใน 'ไลน์กลุ่ม' เท่านั้นครับ 🙏");
            return ContentService.createTextOutput("OK");
          }

          // ⚡ เช็ค State คงค้างด้วย CacheService
          const cache = CacheService.getScriptCache();
          let pendingClockIn12 = cache.get(`PENDING_CLOCKIN_${userId}`);
          let pendingOTConfirm = cache.get(`PENDING_OT_CONFIRM_${userId}`);
          let pendingOTDetails = cache.get(`PENDING_OT_DETAILS_${userId}`);

          // 🛡️ Strict Text Filtering (Silent Ignore)
          const isPostback = event.type === "postback";
          const hasHash = msg.startsWith("#");
          const hasPendingState = !!(pendingClockIn12 || pendingOTConfirm || pendingOTDetails);
          
          if (!isPostback && !hasHash && !hasPendingState && !isUserAdmin) {
            // เงียบ (Silent Ignore) หากข้อความไม่เข้าเงื่อนไข
            return ContentService.createTextOutput("OK");
          }

          if (msg.startsWith("#") && (pendingClockIn12 || pendingOTConfirm || pendingOTDetails)) {
            cache.remove(`PENDING_CLOCKIN_${userId}`);
            cache.remove(`PENDING_OT_CONFIRM_${userId}`);
            cache.remove(`PENDING_OT_DETAILS_${userId}`);
            if (typeof logAuditTrail === "function") logAuditTrail(userId, "STATE_CLEAR", msg, "CLEARED", 1.0, "CLEAR", "ผู้ใช้เคลียร์สถานะเก่าด้วยเครื่องหมาย #");
            pendingClockIn12 = null; pendingOTConfirm = null; pendingOTDetails = null;
          }

          // 1. จัดการ State: ลงรายละเอียดไซต์งานโอที
          if (pendingOTDetails) {
            if (msg === "ยกเลิกลงเวลา") {
              cache.remove(`PENDING_OT_DETAILS_${userId}`);
              if (typeof reply === "function") reply(globalReplyToken, "❌ ยกเลิกเรียบร้อยครับ");
              return ContentService.createTextOutput("OK");
            }
            let dataToProcess = JSON.parse(pendingOTDetails);
            cache.remove(`PENDING_OT_DETAILS_${userId}`);
            if (typeof logAuditTrail === "function") logAuditTrail(userId, "PROCESS_OT_DETAILS", msg, JSON.stringify(dataToProcess), 1.0, "ACCEPT_DETAILS", "ประมวลผลรายละเอียดไซต์งานโอที");
            if (typeof finalizeClockInSaving === "function") finalizeClockInSaving(dataToProcess, userId, globalReplyToken, dataToProcess.checkStatus, msg);
            return ContentService.createTextOutput("OK");
          }

          // 2. จัดการ State: ยืนยันทำโอที
          if (pendingOTConfirm) {
            let dataToProcess = JSON.parse(pendingOTConfirm);
            if (msg === "ทำที่เดิม/งานเดิม") {
              cache.remove(`PENDING_OT_CONFIRM_${userId}`);
              if (typeof logAuditTrail === "function") logAuditTrail(userId, "PROCESS_OT_CONFIRM", msg, JSON.stringify(dataToProcess), 1.0, "SAME_SITE", "ยืนยันการทำโอทีที่เดิม");
              if (typeof finalizeClockInSaving === "function") finalizeClockInSaving(dataToProcess, userId, globalReplyToken, dataToProcess.checkStatus, null);
              return ContentService.createTextOutput("OK");
            }
            else if (msg === "เปลี่ยนไซต์/เปลี่ยนงาน") {
              cache.remove(`PENDING_OT_CONFIRM_${userId}`);
              cache.put(`PENDING_OT_DETAILS_${userId}`, JSON.stringify(dataToProcess), 300);
              if (typeof logAuditTrail === "function") logAuditTrail(userId, "PROCESS_OT_CONFIRM", msg, JSON.stringify(dataToProcess), 1.0, "CHANGE_SITE", "ร้องขอเปลี่ยนไซต์ทำโอที");
              if (typeof reply === "function") reply(globalReplyToken, "กรุณาพิมพ์ ไซต์งาน / งานที่ทำโอที ครับ");
              return ContentService.createTextOutput("OK");
            }
            else if (msg === "ยกเลิกลงเวลา") {
              cache.remove(`PENDING_OT_CONFIRM_${userId}`);
              if (typeof logAuditTrail === "function") logAuditTrail(userId, "PROCESS_OT_CONFIRM", msg, JSON.stringify(dataToProcess), 1.0, "REJECT", "ยกเลิกการลงเวลาช่วงโอที");
              if (typeof reply === "function") reply(globalReplyToken, "❌ ยกเลิกเรียบร้อยครับ");
              return ContentService.createTextOutput("OK");
            }
          }

          // 3. จัดการ State: ลงเวลาช่วงบ่าย (12.00/13.00)
          if (pendingClockIn12) {
            if (msg === "ยืนยันตามเวลาที่แจ้ง" || msg === "ลงเวลา 13.00 น.") {
              if (typeof processPendingClockIn === "function") processPendingClockIn(msg, pendingClockIn12, userId, globalReplyToken);
              if (typeof logAuditTrail === "function") logAuditTrail(userId, "PROCESS_CLOCKIN_12", msg, pendingClockIn12, 1.0, "CONFIRM_12", "ยืนยันเวลาทำงานช่วงบ่าย");
              return ContentService.createTextOutput("OK");
            }
            else if (msg === "ยกเลิกลงเวลา") {
              cache.remove(`PENDING_CLOCKIN_${userId}`);
              if (typeof logAuditTrail === "function") logAuditTrail(userId, "PROCESS_CLOCKIN_12", msg, pendingClockIn12, 1.0, "REJECT_12", "ยกเลิกการยืนยันเวลาช่วงบ่าย");
              if (typeof reply === "function") reply(globalReplyToken, "❌ ยกเลิกเรียบร้อยครับ");
              return ContentService.createTextOutput("OK");
            }
          }

          // 🚀 ประมวลผลคำสั่งพิเศษ
          let commandText = msg;
          if (msg.startsWith("#")) commandText = msg.substring(1).trim();

          // --- 👑 หมวดคำสั่ง Admin Only ---
          if (isUserAdmin) {
            if (commandText.startsWith("ตั้งค่า")) {
              const parts = commandText.replace("ตั้งค่า", "").trim().split("=");
              if (parts.length >= 2) {
                if (typeof setDynamicConfig === "function") setDynamicConfig(parts[0].trim(), parts.slice(1).join("=").trim());
                if (typeof logAuditTrail === "function") logAuditTrail(userId, "ADMIN_CONFIG", commandText, parts[0].trim(), 1.0, "SET_CONFIG", "แอดมินเปลี่ยนค่าระบบ");
                if (typeof reply === "function") reply(globalReplyToken, `⚙️ บันทึกการตั้งค่าสำเร็จ!\n[${parts[0].trim()}] => ${parts.slice(1).join("=").trim()}`);
              } else {
                if (typeof reply === "function") reply(globalReplyToken, `⚠️ ตัวอย่าง: ตั้งค่า FUZZY_THRESHOLD=0.85`);
              }
              return ContentService.createTextOutput("OK");
            }
            if (commandText === "รายงาน" || commandText === "สร้างรายงาน" || commandText === "report") {
              if (typeof reply === "function") reply(globalReplyToken, "⏳ กำลังประมวลผลดึงข้อมูลและสร้างรายงาน... รอสักครู่ครับ");
              if (typeof generateProjectReportAndNotify === "function") {
                const reportStatus = generateProjectReportAndNotify();
                if (typeof logAuditTrail === "function") logAuditTrail(userId, "ADMIN_REPORT", commandText, "GENERATE", 1.0, "REPORT", "แอดมินสั่งออกรายงานสรุปโครงการ");
                if (typeof reply === "function") reply(globalReplyToken, reportStatus);
              } else {
                if (typeof reply === "function") reply(globalReplyToken, "❌ ไม่พบระบบสร้างรายงาน (generateProjectReportAndNotify)");
              }
              return ContentService.createTextOutput("OK");
            }
            if (commandText.startsWith("กู้คืนระบบ") || commandText.startsWith("rollback")) {
              let step = 1;
              const parts = commandText.split(" ");
              if (parts.length > 1 && !isNaN(parseInt(parts[1]))) step = parseInt(parts[1]);
              if (typeof rollbackLogic === "function") {
                const rollbackRes = rollbackLogic(userId, step);
                if (typeof logAuditTrail === "function") logAuditTrail(userId, "ADMIN_ROLLBACK", commandText, "STEP_" + step, 1.0, "ROLLBACK", "แอดมินสั่งกู้คืนระบบย้อนหลัง");
                if (typeof reply === "function") reply(globalReplyToken, rollbackRes.success ? rollbackRes.message : rollbackRes.error);
              } else {
                if (typeof reply === "function") reply(globalReplyToken, "❌ ไม่พบระบบจัดการตรรกะ (rollbackLogic)");
              }
              return ContentService.createTextOutput("OK");
            }
            if (commandText === "เปิดระบบ") {
              if (typeof setDynamicConfig === "function") setDynamicConfig("SYSTEM_STATUS", "ON");
              if (typeof logAuditTrail === "function") logAuditTrail(userId, "SYSTEM_TOGGLE", msg, "ON", 1.0, "SYSTEM_ON", "เปิดระบบทำงาน");
              if (typeof reply === "function") reply(globalReplyToken, "🟢 เปิดระบบทำงานแล้ว");
              return ContentService.createTextOutput("OK");
            }
            if (commandText === "ปิดระบบ") {
              if (typeof setDynamicConfig === "function") setDynamicConfig("SYSTEM_STATUS", "OFF");
              if (typeof logAuditTrail === "function") logAuditTrail(userId, "SYSTEM_TOGGLE", msg, "OFF", 1.0, "SYSTEM_OFF", "ปิดระบบทำงาน");
              if (typeof reply === "function") reply(globalReplyToken, "🔴 ปิดรับการลงเวลาชั่วคราว");
              return ContentService.createTextOutput("OK");
            }
            if (commandText === "ทดสอบระบบ" || commandText === "ปิดโหมดทดสอบ") {
              if (typeof handleTestMode === "function") handleTestMode(commandText, globalReplyToken);
              return ContentService.createTextOutput("OK");
            }
          }

          if (status === "OFF" && !isUserAdmin) return ContentService.createTextOutput("Ignored");

          // --- 👷 หมวดคำสั่งทั่วไป & ลงเวลา ---
          if (commandText === "ยกเลิกรายการล่าสุด" || commandText === "ยกเลิกล่าสุด") {
            if (typeof logAuditTrail === "function") logAuditTrail(userId, "USER_UNDO", msg, "UNDO_LAST", 1.0, "UNDO", "ผู้ใช้ขอยกเลิกรายการล่าสุด");
            if (typeof handleUndoLastAction === "function") handleUndoLastAction(userId, globalReplyToken);
            return ContentService.createTextOutput("OK");
          }
          if (commandText.startsWith("ยกเลิก") && commandText.length > 10 && !commandText.includes("/")) {
            if (typeof handleUndoFromText === "function") handleUndoFromText(commandText.replace("ยกเลิก", "").trim(), globalReplyToken);
            return ContentService.createTextOutput("OK");
          }
          if (commandText.startsWith("ยกเลิก") && commandText.includes("/")) {
            const p = commandText.replace("ยกเลิก", "").trim().split(" ");
            if (p.length >= 2 && typeof undoLastEntry === "function" && typeof reply === "function") reply(globalReplyToken, undoLastEntry(p[0], p[1]));
            return ContentService.createTextOutput("OK");
          }
          if (commandText.startsWith("เช็ครายงาน")) {
            if (typeof handleCheckReport === "function") handleCheckReport(commandText, userId, globalReplyToken);
            return ContentService.createTextOutput("OK");
          }
          if (/^(คู่มือ|วิธีใช้|help|คำสั่ง)/i.test(commandText)) {
            if (typeof reply === "function") reply(globalReplyToken, "📘 คู่มือคำสั่ง\n1️⃣ ส่งรูปบัตรตอก\n2️⃣ ตามด้วยข้อความ:\n#1/5/69\nสวนหลวง เข้า สวนหลวง\n08.00-17.00\nทั้งหมด 3 คน");
            return ContentService.createTextOutput("OK");
          }
          if (/^(ลา|ขอลา|เช็ค|ดูยอด|ใครขาด|สรุปยอด|ประกาศ:|ลบ|สถานะระบบ)/.test(commandText)) {
            if (typeof handleCommands === "function") handleCommands(commandText, globalReplyToken, userId);
            return ContentService.createTextOutput("OK");
          }
          
          // ระบบดึงชื่อจากข้อความ 일반
          var extractedNames = extractEmployeesFromText(msg);
          
          if (/^\d{1,2}[\/.-]\d{1,2}/.test(commandText) || /^\#\d{1,2}[\/.-]\d{1,2}/.test(msg) || extractedNames.length > 0) {
            if (typeof logAuditTrail === "function") logAuditTrail(userId, "CLOCKIN_ENTRY", msg, "RAW_TEXT", 1.0, "SUBMIT", "พนักงานส่งข้อความบันทึกเวลารูปแบบข้อความทั่วไป");
            if (typeof handleClockIn === "function") handleClockIn(msg, userId, globalReplyToken);
            return ContentService.createTextOutput("OK");
          }
          
          return ContentService.createTextOutput("Ignored");
          
        } else if (event.message.type === "image") {
          if (typeof logAuditTrail === "function") logAuditTrail(userId, "IMAGE_ENTRY", "IMAGE_MESSAGE_ID_" + event.message.id, "IMAGE", 1.0, "SUBMIT_IMAGE", "พนักงานอัปโหลดรูปภาพบัตรตอก");
          if (typeof handleImageProcess === "function") handleImageProcess(event.message.id, globalReplyToken, userId);
        }
      } catch (err) {
        // 🛡️ [เกราะป้องกันระบบเงียบ] พิมพ์บอกรหัส Error ลงกลุ่มทันทีถ้าระบบค้าง
        if (typeof logAuditTrail === "function") logAuditTrail("SYSTEM_ERROR", "RUNTIME_EXCEPTION", e.postData.contents, "", 0.0, "ERROR", err.message);
        if (globalReplyToken && typeof reply === "function") {
          reply(globalReplyToken, "🔴 ระบบเกิดปัญหาภายใน: " + err.message + "\n(กรุณาแจ้งแอดมินให้ตรวจสอบโค้ดจุดนี้)");
        }
        return ContentService.createTextOutput("Error: " + err.message);
      } finally {
        // 🔓 สำคัญมาก: คืนสิทธิ์ Lock เสมอเมื่อจบการทำงาน
        lock.releaseLock();
      }
    }
    return ContentService.createTextOutput("OK");
  } catch (error) {
    return ContentService.createTextOutput("Critical Error: " + error.message);
  }
}

function handleClockIn(msg, userId, token) {
  // 🚨 ถูกล็อกมาก่อนแล้วใน doPost(e) ไม่จำเป็นต้องล็อกซ้ำ ป้องกัน Deadlock
  try {
    let data;
    let cache;
    let pendingCodes;

    // 2. ประมวลผลข้อความเบื้องต้น
    try {
      data = parseComplexMessage(msg);
      cache = CacheService.getScriptCache();
      pendingCodes = cache.get(`PENDING_IMG_CODES_${userId}`);

      // 🧠 ระบบ Hybrid Fallback: ถ้า Regex อ่านไม่ออก ให้โยนไปให้ AI ช่วยแกะ
      const isOtNoonMissed = /(OT|โอที)\s*เที่ยง/i.test(msg) && (!data || !data.employees || !data.employees.some(emp => emp.has_ot_noon));
      
      if (!data || !data.date || !data.default_site || isOtNoonMissed) {
        // ตัด async/await ออก เพื่อให้รันใน GAS ได้อย่างถูกต้องและไม่เกิด Syntax Error
        data = processMessageWithAI(msg); 
        if (data) {
          const countMatch = msg.match(/ทั้งหมด\s*(\d+)\s*คน/);
          if (countMatch) data.expected_count = parseInt(countMatch[1], 10);
          
          const matchOT = msg.match(/(OT|โอที)\s*เที่ยง\s*(?:(\d{1,2}[.:]\d{2})\s*[-ถึง]\s*(\d{1,2}[.:]\d{2}))?/i);
          if (matchOT) {
            data.has_ot_noon = true;
            if (matchOT[2] && matchOT[3]) {
              data.ot_noon_in = matchOT[2].replace(':', '.');
              data.ot_noon_out = matchOT[3].replace(':', '.');
            }
          }
        }
      }
    } catch (err) {
      logErrorToSheet(null, msg, "Error parsing message: " + err.message);
      reply(token, "❌ ระบบไม่สามารถอ่านข้อความได้ กรุณาตรวจสอบรูปแบบครับ");
      return; 
    }

    // 3. จัดการข้อมูลกรณีส่งรูปภาพมาก่อนหน้า (จาก Cache)
    if (pendingCodes && data) {
      const empList = getEmployeesByCodes(JSON.parse(pendingCodes));
      if (data.expected_count && data.expected_count > 0 && empList.length !== data.expected_count) {
        reply(token, `⚠️ จำนวนพนักงานไม่ตรงกัน!\nคุณพิมพ์แจ้ง: "${data.expected_count} คน"\nระบบอ่านจากรูปได้: "${empList.length} คน"\n👉 รบกวนตรวจสอบและส่งรูปใหม่ครับ`);
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
      logErrorToSheet(getTargetFileIdByDate(null), msg, "❌ ไม่พบรายชื่อพนักงาน");
      reply(token, "❌ ข้อมูลไม่ครบครับ!\nหากต้องการลงเวลาโดยไม่พิมพ์ชื่อ โปรดส่ง 'รูปบัตรตอก' เข้ามาก่อนครับ");
      return;
    }

    data.original_msg = msg;
    const check = checkDate(data.date);
    
    // 5. ดึงลิสต์ Admin อย่างปลอดภัย (ป้องกัน Error หากไม่มีค่า)
    const adminIdStr = PropertiesService.getScriptProperties().getProperty("ADMIN_LINE_IDS") || "";
    const adminArray = adminIdStr.split(",").map(id => id.trim());
    const isUserAdmin = adminArray.includes(userId) || (typeof isAdmin === "function" && isAdmin(userId));

    // 6. เช็คการบล็อกวันที่ (Admin สามารถทะลุได้)
    if (check.status === "BLOCK" && !isUserAdmin) {
      reply(token, `⛔ ${check.msg}`);
      return; 
    }

    // 7. ดำเนินการบันทึกข้อมูลและตรวจสอบ OT (ลบ await ออกเพื่อให้เป็น Synchronous)
    checkOTAndProceed(data, userId, token, check, getTargetFileIdByDate(data.date));

    // 8. 🎯 ส่งข้อความยืนยันการบันทึกแบบแสดงรายชื่อ
    if (typeof formatResponse === "function") {
      const info = {
        date: data.date,
        time: (data.time_start && data.time_end) ? `${data.time_start}-${data.time_end}` : "ตามเวลาปกติ",
        site: data.default_site,
        // ใช้ Optional Chaining (?.) เพื่อป้องกัน Error หาก undefined
        accom: data.employees[0]?.accom || data.default_Accom || "ไม่ได้ระบุ"
      };
      
      const finalMsg = formatResponse(data.employees, info);
      reply(token, finalMsg);
    }

  } catch (err) {
    logErrorToSheet(null, msg, "Critical Error HandleClockIn: " + err.message);
    reply(token, "🔴 ระบบขัดข้อง กรุณาแจ้ง Admin ครับ");
  }
}

async function checkOTAndProceed(dataToProcess, userId, token, check, targetFileId) {
  const toMins = (t) => { if (!t) return 0; const parts = t.toString().replace('.', ':').split(':'); return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0); };
  const sMins = toMins(dataToProcess.time_start);
  let eMins = toMins(dataToProcess.time_end);
  let hasOT = false;

  if (eMins > 0) {
    if (eMins < sMins) eMins += 24 * 60;
    let otMins = 0;
    if (sMins < 480) otMins += (Math.min(eMins, 480) - sMins);
    if (eMins > 1020) otMins += (eMins - Math.max(sMins, 1020));

    let hasNoonOt = false;
    let noonOtMins = 0;
    dataToProcess.employees.forEach(emp => {
      if (emp.has_ot_noon) {
        hasNoonOt = true;
        noonOtMins = Math.max(noonOtMins, toMins(emp.ot_noon_out || "13.00") - toMins(emp.ot_noon_in || "12.00"));
      }
    });
    if (hasNoonOt) otMins += noonOtMins;
    if (otMins > 0) hasOT = true;
  }

  if (hasOT) {
    dataToProcess.checkStatus = check;
    CacheService.getScriptCache().put(`PENDING_OT_CONFIRM_${userId}`, JSON.stringify(dataToProcess), 300);
    replyWithButtons(token, `ตรวจพบการทำ OT\nโปรดยืนยันว่า... ทำ OT ที่ไซต์งานเดิม และ ลักษณะงานเดิม หรือไม่?`, ["ทำที่เดิม/งานเดิม", "เปลี่ยนไซต์/เปลี่ยนงาน", "ยกเลิกลงเวลา"]);
  } else {
    await finalizeClockInSaving(dataToProcess, userId, token, check, null, targetFileId);
  }
}

async function processPendingClockIn(answer, pendingDataStr, userId, token) {
  try {
    let dataToProcess = JSON.parse(pendingDataStr);
    if (answer === "ลงเวลา 13.00 น.") dataToProcess.time_start = "13.00";
    CacheService.getScriptCache().remove(`PENDING_CLOCKIN_${userId}`);
    await checkOTAndProceed(dataToProcess, userId, token, dataToProcess.checkStatus, null);
  } catch (e) {
    CacheService.getScriptCache().remove(`PENDING_CLOCKIN_${userId}`);
    reply(token, "❌ ข้อมูลหมดอายุครับ");
  }
}

async function finalizeClockInSaving(data, userId, token, check, customOt, targetId) {
  const isTesting = PropertiesService.getScriptProperties().getProperty("IS_TESTING") === "TRUE";
  if (!targetId) targetId = getTargetFileIdByDate(data.date);
  if (!targetId) { reply(token, "❌ ไม่พบไฟล์สำหรับเดือนนี้"); return; }

  // 🚀 เรียกใช้ writeToDailySheetBatch (เซฟแบบกลุ่มที่เสถียรที่สุด)
  const writeRes = typeof writeToDailySheetBatch === 'function'
    ? writeToDailySheetBatch(data, userId, targetId)
    : writeToDailySheet(data, userId, targetId); 

  let customOtSite = null; let customOtTask = null;
  if (customOt && writeRes.count > 0) {
    let parts = customOt.split('/');
    customOtSite = parts[0] ? parts[0].trim() : data.default_site;
    customOtTask = parts[1] ? parts[1].trim() : "ทำ OT";

    try {
      const ss = SpreadsheetApp.openById(targetId);
      const targetSheetName = parseThaiDate(data.date);
      let sheet = ss.getSheetByName(targetSheetName);
      
      // Hotfix ค้นหาชีตแบบทนทานช่องว่าง
      if (!sheet) {
        const cleanTarget = targetSheetName.replace(/\s+/g, "");
        const sheets = ss.getSheets();
        for (let i = 0; i < sheets.length; i++) {
          if (sheets[i].getName().replace(/\s+/g, "") === cleanTarget) { sheet = sheets[i]; break; }
        }
      }

      if (sheet) {
        // 🛠️ แปลงค่า START_ROW ให้เป็น Number เสมอกันบั๊กคำนวณแถวเพี้ยน
        const startRow = parseInt(getDynamicConfig("START_ROW"), 10) || 3;
        const dbData = sheet.getRange(startRow, 4, Math.max(1, sheet.getLastRow() - startRow + 1), 2).getValues();
        
        data.employees.forEach(emp => {
          const inputName = typeof normalize === 'function' ? normalize(emp.firstname) : emp.firstname;
          for (let i = 0; i < dbData.length; i++) {
            if (normalize(dbData[i][0]) === inputName) {
              // 🛠️ แก้ไขลอจิก i + startRow ป้องกันการเกิดข้อความต่อกัน (เช่น แถว 13 แทนที่จะเป็นแถว 4)
              sheet.getRange(i + startRow, 9).setValue(customOtSite);
              sheet.getRange(i + startRow, 10).setValue(customOtTask);
              break;
            }
          }
        });
      }
    } catch (e) { console.error("Custom OT error: " + e.message); }
  }

  let txt = "";
  if (writeRes.errors && writeRes.errors.length > 0) txt += `⚠️ หาชื่อไม่พบ: ${writeRes.errors.join(', ')}\n`;
  if (txt !== "" || writeRes.count === 0) logErrorToSheet(targetId, data.original_msg, txt || "บันทึกไม่ได้");

  let timeStatus = (!data.time_end || data.time_end === "") ? `(ลงเวลาเข้า: ${data.time_start})` : `(เวลา: ${data.time_start}-${data.time_end})`;
  let displaySite = data.default_site; if (customOtSite) displaySite += `\n[ไซต์ OT: ${customOtSite} | งาน OT: ${customOtTask}]`;
  const accomText = data.default_Accom || writeRes.accom || 'ไม่ได้ระบุ';

  reply(token, `${writeRes.count === 0 ? "❌ ไม่พบข้อมูล" : `✅ บันทึกสำเร็จ ${writeRes.count} คน`}${data.date ? `\n📅 วันที่: ${data.date}` : ""}\n${timeStatus}\nไซต์: ${displaySite}\n[ที่พัก: ${accomText}]${isTesting ? "\n🧪 [โหมดทดสอบ]" : ""}${txt ? "\n" + txt : ""}\n\n📌 โปรดตรวจเช็คความถูกต้อง หากผิดพลาดแจ้งแอดมินทันที`);
}

async function handleImageProcess(mId, tk, uId) {
  try {
    const blob = UrlFetchApp.fetch(`https://api-data.line.me/v2/bot/message/${mId}/content`, {
      headers: { Authorization: "Bearer " + getDynamicConfig('LINE_CHANNEL_ACCESS_TOKEN') }
    }).getBlob();

    const prompt = `SYSTEM: You are a strict Image verifier. Is this image a timesheet (bille/slip) or a human face?
Return JSON: { "is_target": boolean, "confidence": number (0-100), "codes": ["52011", ...], "reason": "string" }`;

    let aiRes = await callGeminiVision(Utilities.base64Encode(blob.getBytes()), prompt, "image/jpeg");
    if (!aiRes) return;
    
    if (aiRes.is_target === false || aiRes.confidence < 80) {
      if (typeof logAuditTrail === "function") logAuditTrail(uId, "IMAGE_REJECT", "รูปภาพไม่ตรงเงื่อนไข", JSON.stringify(aiRes), 1.0, "REJECT", "Low confidence or not target");
      return; // Silent Ignore
    }

    if (!aiRes.codes || aiRes.codes.length === 0) {
      reply(tk, "❌ AI มองไม่เห็นรหัส");
      return;
    }

    const emps = getEmployeesByCodes(aiRes.codes);
    if (emps.length === 0) {
      reply(tk, `⚠️ พบรหัสแต่ไม่มีในฐานข้อมูล`);
      return;
    }

    CacheService.getScriptCache().put(`PENDING_IMG_CODES_${uId}`, JSON.stringify(aiRes.codes), 600);

    // ⚠️ แก้ไขตรงนี้: ปรับข้อความตอบกลับเมื่อส่งรูป ให้หน้าตาเหมือนบิลสลิปสรุปยอด
    const todayDate = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
    const replyMsg = `✅ ตรวจพบพนักงาน ${emps.length} คน\n📅 วันที่: ${todayDate}\n(เวลา: กำลังรอการแจ้งเวลา)\nไซต์: กำลังรอแจ้ง\n[ที่พัก: กำลังรอแจ้ง]\n\n📌 โปรดพิมพ์รายละเอียดงานเพื่อบันทึกต่อได้เลยครับ`;
    reply(tk, replyMsg);

  } catch (e) {
    reply(tk, "❌ Error: " + e.message);
  }
}

async function handleUndoLastAction(userId, token) {
  const props = PropertiesService.getScriptProperties();
  const lastJson = props.getProperty(`LAST_ENTRY_${userId}`);
  if (!lastJson) {
    reply(token, "⚠️ ไม่พบรายการล่าสุด");
    return;
  }
  try {
    const last = JSON.parse(lastJson);
    reply(token, undoLastEntry(last.names[0], last.date));
    props.deleteProperty(`LAST_ENTRY_${userId}`);
  } catch (e) {
    reply(token, "❌ Undo Error");
  }
}

async function handleUndoFromText(text, token) {
  const dataToUndo = parseComplexMessage(text);
  if (!dataToUndo || !dataToUndo.date) {
    reply(token, "❌ ไม่พบวันที่");
    return;
  }
  try {
    reply(token, undoLastEntry(dataToUndo.employees[0].firstname, dataToUndo.date));
  } catch (e) {
    reply(token, "❌ Undo Error");
  }
}

async function handleCheckReport(content, userId, replyToken) {
  reply(replyToken, "ฟังก์ชันเช็ครายงานอยู่ระหว่างอัปเกรดฐานข้อมูลครับ");
}

async function handleCommands(msg, token, userId) {
  const raw = await callGemini(msg, `Analyze intent: LEAVE, BROADCAST, HELP, SYSTEM_STATUS. JSON {intent, data}`, true);
  if (!raw) return;

  switch (raw.intent) {
    case "LEAVE":
      reply(token, recordLeaveData(raw.data.name, raw.data.type, raw.data.date));
      break;
    case "SYSTEM_STATUS":
      reply(token, `⚙️ สถานะระบบ: ${getDynamicConfig("SYSTEM_STATUS")}`);
      break;
    default:
      reply(token, "⚠️ ไม่เข้าใจคำสั่ง");
  }
}

function handleTestMode(content, replyToken) {
  PropertiesService.getScriptProperties().setProperty("IS_TESTING", content === "ทดสอบระบบ" ? "TRUE" : "FALSE");
  reply(replyToken, content === "ทดสอบระบบ" ? "🧪 เปิดโหมดทดสอบแล้ว" : "🧹 ปิดโหมดทดสอบแล้ว");
}

// ⚠️ [CONSOLIDATED] isAdmin() ถูกรวมไปไว้ที่ Config.gs เป็นแหล่งเดียว (Single Source of Truth)
// ป้องกัน GAS "last wins" override ที่ทำให้ลอจิกตรวจสอบ Admin ทำงานผิดพลาด