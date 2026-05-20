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

function replyWithButtons(tk, t, b) {
  const items = b.map(l => ({ "type": "action", "action": { "type": "message", "label": l, "text": l } }));
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + getDynamicConfig('LINE_CHANNEL_ACCESS_TOKEN')
    },
    payload: JSON.stringify({ replyToken: tk, messages: [{ "type": "text", "text": t, "quickReply": { "items": items } }] })
  });
}

async function doPost(e) {
  let globalReplyToken = null;
  try {
    if (!e || !e.postData) return ContentService.createTextOutput("No Data");
    const json = JSON.parse(e.postData.contents);
    const event = json.events[0];
    if (!event) return ContentService.createTextOutput("OK");

    const { replyToken, source, message } = event;
    globalReplyToken = replyToken; // เก็บไว้ใช้ในกรณีเกิด Error ด้านล่าง
    const userId = source.userId;
    
    const adminId = getDynamicConfig("ADMIN_LINE_ID");
    const adminList = (adminId || "").split(",").map(id => id.trim());
    const status = getDynamicConfig("SYSTEM_STATUS");
    
    if (message.type === "text") {
      const msg = message.text.trim();

      // 🛡️ ป้องกันช่างส่งงานทางแชทส่วนตัว (อนุญาตเฉพาะ Admin)
      const isUserAdmin = adminList.includes(userId) || isAdmin(userId);
      if (source.type === "user" && !isUserAdmin) {
        reply(replyToken, "⚠️ ขออภัยครับ บอทรับลงรายงานเฉพาะใน 'ไลน์กลุ่ม' เท่านั้นครับ 🙏");
        return ContentService.createTextOutput("OK");
      }

      // ⚡ เช็ค State คงค้าง
      const cache = CacheService.getScriptCache();
      let pendingClockIn12 = cache.get(`PENDING_CLOCKIN_${userId}`);
      let pendingOTConfirm = cache.get(`PENDING_OT_CONFIRM_${userId}`);
      let pendingOTDetails = cache.get(`PENDING_OT_DETAILS_${userId}`);

      if (msg.startsWith("#") && (pendingClockIn12 || pendingOTConfirm || pendingOTDetails)) {
        cache.remove(`PENDING_CLOCKIN_${userId}`);
        cache.remove(`PENDING_OT_CONFIRM_${userId}`);
        cache.remove(`PENDING_OT_DETAILS_${userId}`);
        pendingClockIn12 = null; pendingOTConfirm = null; pendingOTDetails = null;
      }

      if (pendingOTDetails) {
        if (msg === "ยกเลิกลงเวลา") {
          cache.remove(`PENDING_OT_DETAILS_${userId}`);
          reply(replyToken, "❌ ยกเลิกเรียบร้อยครับ");
          return ContentService.createTextOutput("OK");
        }
        let dataToProcess = JSON.parse(pendingOTDetails);
        cache.remove(`PENDING_OT_DETAILS_${userId}`);
        await finalizeClockInSaving(dataToProcess, userId, replyToken, dataToProcess.checkStatus, msg);
        return ContentService.createTextOutput("OK");
      }

      if (pendingOTConfirm) {
        let dataToProcess = JSON.parse(pendingOTConfirm);
        if (msg === "ทำที่เดิม/งานเดิม") {
          cache.remove(`PENDING_OT_CONFIRM_${userId}`);
          await finalizeClockInSaving(dataToProcess, userId, replyToken, dataToProcess.checkStatus, null);
          return ContentService.createTextOutput("OK");
        }
        else if (msg === "เปลี่ยนไซต์/เปลี่ยนงาน") {
          cache.remove(`PENDING_OT_CONFIRM_${userId}`);
          cache.put(`PENDING_OT_DETAILS_${userId}`, JSON.stringify(dataToProcess), 300);
          reply(replyToken, "กรุณาพิมพ์ ไซต์งาน / งานที่ทำโอที ครับ");
          return ContentService.createTextOutput("OK");
        }
        else if (msg === "ยกเลิกลงเวลา") {
          cache.remove(`PENDING_OT_CONFIRM_${userId}`);
          reply(replyToken, "❌ ยกเลิกเรียบร้อยครับ");
          return ContentService.createTextOutput("OK");
        }
      }

      if (pendingClockIn12) {
        if (msg === "ยืนยันตามเวลาที่แจ้ง" || msg === "ลงเวลา 13.00 น.") {
          await processPendingClockIn(msg, pendingClockIn12, userId, replyToken);
          return ContentService.createTextOutput("OK");
        }
        else if (msg === "ยกเลิกลงเวลา") {
          cache.remove(`PENDING_CLOCKIN_${userId}`);
          reply(replyToken, "❌ ยกเลิกเรียบร้อยครับ");
          return ContentService.createTextOutput("OK");
        }
      }

      // 🚀 ประมวลผลคำสั่งพิเศษ & แยกแยะหมวดหมู่คำสั่ง
      let commandText = msg;
      if (msg.startsWith("#")) {
        commandText = msg.substring(1).trim();
      }

      // --- 👑 หมวดคำสั่ง Admin Only ---
      if (isUserAdmin) {
        if (commandText.startsWith("ตั้งค่า")) {
          const parts = commandText.replace("ตั้งค่า", "").trim().split("=");
          if (parts.length >= 2) {
            setDynamicConfig(parts[0].trim(), parts.slice(1).join("=").trim());
            reply(replyToken, `⚙️ บันทึกการตั้งค่าสำเร็จ!\n[${parts[0].trim()}] => ${parts.slice(1).join("=").trim()}`);
          } else {
            reply(replyToken, `⚠️ ตัวอย่าง: ตั้งค่า FUZZY_THRESHOLD=0.85`);
          }
          return ContentService.createTextOutput("OK");
        }

        if (commandText === "รายงาน" || commandText === "สร้างรายงาน" || commandText === "report") {
          reply(replyToken, "⏳ กำลังประมวลผลดึงข้อมูลและสร้างรายงาน... รอสักครู่ครับ");
          if (typeof generateProjectReportAndNotify === "function") {
            const reportStatus = generateProjectReportAndNotify();
            reply(replyToken, reportStatus);
          } else {
            reply(replyToken, "❌ ไม่พบระบบสร้างรายงาน (generateProjectReportAndNotify)");
          }
          return ContentService.createTextOutput("OK");
        }

        if (commandText.startsWith("กู้คืนระบบ") || commandText.startsWith("rollback")) {
          let step = 1;
          const parts = commandText.split(" ");
          if (parts.length > 1 && !isNaN(parseInt(parts[1]))) step = parseInt(parts[1]);

          if (typeof rollbackLogic === "function") {
            const rollbackRes = rollbackLogic(userId, step);
            reply(replyToken, rollbackRes.success ? rollbackRes.message : rollbackRes.error);
          } else {
            reply(replyToken, "❌ ไม่พบระบบจัดการตรรกะ (rollbackLogic)");
          }
          return ContentService.createTextOutput("OK");
        }

        if (commandText === "เปิดระบบ") { setDynamicConfig("SYSTEM_STATUS", "ON"); reply(replyToken, "🟢 เปิดระบบทำงานแล้ว"); return ContentService.createTextOutput("OK"); }
        if (commandText === "ปิดระบบ") { setDynamicConfig("SYSTEM_STATUS", "OFF"); reply(replyToken, "🔴 ปิดรับการลงเวลาชั่วคราว"); return ContentService.createTextOutput("OK"); }
        if (commandText === "ทดสอบระบบ" || commandText === "ปิดโหมดทดสอบ") { handleTestMode(commandText, replyToken); return ContentService.createTextOutput("OK"); }
      }

      if (status === "OFF" && !isUserAdmin) return ContentService.createTextOutput("Ignored");

      // --- 👷 หมวดคำสั่งทั่วไป & ลงเวลา ---
      if (commandText === "ยกเลิกรายการล่าสุด" || commandText === "ยกเลิกล่าสุด") {
        await handleUndoLastAction(userId, replyToken);
        return ContentService.createTextOutput("OK");
      }
      if (commandText.startsWith("ยกเลิก") && commandText.length > 10 && !commandText.includes("/")) {
        await handleUndoFromText(commandText.replace("ยกเลิก", "").trim(), replyToken);
        return ContentService.createTextOutput("OK");
      }
      if (commandText.startsWith("ยกเลิก") && commandText.includes("/")) {
        const p = commandText.replace("ยกเลิก", "").trim().split(" ");
        if (p.length >= 2) reply(replyToken, undoLastEntry(p[0], p[1]));
        return ContentService.createTextOutput("OK");
      }

      if (commandText.startsWith("เช็ครายงาน")) {
        await handleCheckReport(commandText, userId, replyToken);
        return ContentService.createTextOutput("OK");
      }
      if (/^(คู่มือ|วิธีใช้|help|คำสั่ง)/i.test(commandText)) {
        reply(replyToken, "📘 คู่มือคำสั่ง\n1️⃣ ส่งรูปบัตรตอก\n2️⃣ ตามด้วยข้อความ:\n#1/5/69\nสวนหลวง เข้า สวนหลวง\n08.00-17.00\nทั้งหมด 3 คน");
        return ContentService.createTextOutput("OK");
      }
      if (/^(ลา|ขอลา|เช็ค|ดูยอด|ใครขาด|สรุปยอด|ประกาศ:|ลบ|สถานะระบบ)/.test(commandText)) {
        await handleCommands(commandText, replyToken, userId);
        return ContentService.createTextOutput("OK");
      }

      if (/^\d{1,2}[\/.-]\d{1,2}/.test(commandText) || /^\#\d{1,2}[\/.-]\d{1,2}/.test(msg)) {
        await handleClockIn(msg, userId, replyToken);
        return ContentService.createTextOutput("OK");
      }

      return ContentService.createTextOutput("Ignored");

    } else if (message.type === "image") {
      await handleImageProcess(message.id, replyToken, userId);
    }
    return ContentService.createTextOutput("OK");
  } catch (err) {
    // 🛡️ [เกราะป้องกันระบบเงียบ] พิมพ์บอกรหัส Error ลงกลุ่มทันทีถ้าระบบค้าง
    if (globalReplyToken) {
      reply(globalReplyToken, "🔴 ระบบเกิดปัญหาภายใน: " + err.message + "\n(กรุณาแจ้งแอดมินให้ตรวจสอบโค้ดจุดนี้)");
    }
    return ContentService.createTextOutput("Error: " + err.message);
  }
}

async function handleClockIn(msg, userId, token) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    reply(token, "⚠️ ระบบยุ่งอยู่ กรุณาส่งซ้ำครับ");
    return;
  }
  try {
    let data = parseComplexMessage(msg);
    const cache = CacheService.getScriptCache();
    const pendingCodes = cache.get(`PENDING_IMG_CODES_${userId}`);

    // 🧠 ระบบ Hybrid Fallback ถ้าแมนนวล Regex แกะไม่ออก โยนให้ AI
    const isOtNoonMissed = /(OT|โอที)\s*เที่ยง/i.test(msg) && (!data || !data.employees.some(emp => emp.has_ot_noon));
    if (!data || !data.date || !data.default_site || isOtNoonMissed) {
      data = await processMessageWithAI(msg);
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

    if (pendingCodes && data) {
      const empList = getEmployeesByCodes(JSON.parse(pendingCodes));
      if (data.expected_count && data.expected_count > 0 && empList.length !== data.expected_count) {
        reply(token, `⚠️ ความผิดปกติ!\nคุณพิมพ์แจ้ง "ทั้งหมด ${data.expected_count} คน"\nแต่ระบบดึงรหัสจากรูปได้ "${empList.length} คน"\n👉 รบกวนถ่ายรูปใหม่ครับ`);
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

    if (!data || !data.date || !data.employees || data.employees.length === 0) {
      logErrorToSheet(getTargetFileIdByDate(null), msg, "❌ ไม่พบรายชื่อพนักงาน");
      reply(token, "❌ ข้อมูลไม่ครบครับ!\nหากลงเวลาแบบไม่พิมพ์ชื่อ กรุณาส่ง 'รูปบัตรตอก' เข้ามาก่อนครับ");
      return;
    }

    data.original_msg = msg;
    const check = checkDate(data.date);
    
    // ดึงลิสต์ Admin เพื่อตรวจสอบการ Bypass วันที่
    const adminIdStr = getDynamicConfig("ADMIN_LINE_ID");
    const adminArray = (adminIdStr || "").split(",").map(id => id.trim());
    const isUserAdmin = adminArray.includes(userId) || isAdmin(userId);

    // ถ้าติด Block "และ" ไม่ใช่ Admin ถึงจะโดนเตะออก
    if (check.status === "BLOCK" && !isUserAdmin) {
      reply(token, `⛔ ${check.msg}`);
      return;
    }

    await checkOTAndProceed(data, userId, token, check, getTargetFileIdByDate(data.date));
  } finally {
    lock.releaseLock();
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

    let aiRes = await callGeminiVision(Utilities.base64Encode(blob.getBytes()), `JSON: { "codes": ["52011"] }`, "image/jpeg");
    if (!aiRes || !aiRes.codes) {
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

function isAdmin(userId) {
  // บังคับอ่านจาก GLOBAL_CONFIG เท่านั้น ไม่ผ่าน getDynamicConfig ที่อาจมี Cache เก่า
  return GLOBAL_CONFIG.ADMIN_LINE_IDS.includes(userId);
}