// webhook_clockin.gs
// ส่วนรับ Webhook จาก LINE, คัดกรองสถานะ, คลีนข้อความผิด, คำนวณชั่วโมงทำงาน และบันทึกเวลาลงชีตแบบกลุ่ม (Batch)

const CORE = {
  START_ROW: 3,
  COL_NAME_CHECK: 4,
  COL_SITE: 6,
  COL_WORK: 7,
  COL_NORMAL_HR: 8,
  COL_OT_M_IN: 11, COL_OT_M_OUT: 12,
  COL_OT_N_IN: 13, COL_OT_N_OUT: 14,
  COL_OT_E_IN: 15, COL_OT_E_OUT: 16,
  COL_OT_TOTAL: 17,
  COL_ACCOM: 20
};
const SUGGESTION_TTL = 300; // วินาที (5 นาที)

function getSecret(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || "";
}

/** Webhook Entrypoint */
function doPost(e) {
  try {
    if (!e || !e.postData) return ContentService.createTextOutput("No Data").setMimeType(ContentService.MimeType.TEXT);
    const json = JSON.parse(e.postData.contents);
    const event = json.events && json.events[0];
    if (!event) return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);

    const { replyToken, source, message } = event;
    const userId = source && source.userId;
    const props = PropertiesService.getScriptProperties();
    const cache = CacheService.getScriptCache();
    const status = props.getProperty("SYSTEM_STATUS") || "ON";
    const adminIds = (props.getProperty("ADMIN_LINE_IDS") || "").split(",").map(s => s.trim()).filter(Boolean);
    const isAdmin = userId && adminIds.includes(userId);

    if (message && message.type === "image") {
      try { handleImageProcess(message.id, replyToken, userId); } catch (e) { console.error(e); }
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    if (!message || message.type !== "text") return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    const msg = message.text.trim();

    if (msg === "ขอไอดีแอดมิน") {
      reply(replyToken, "🔑 LINE User ID ของคุณคือ:\n" + userId);
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    if (msg === "#เปิดระบบ" && isAdmin) {
      props.setProperty("SYSTEM_STATUS", "ON");
      reply(replyToken, "🟢 เปิดระบบการรับรายงานแล้วครับ!");
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }
    if (msg === "#ปิดระบบ" && isAdmin) {
      props.setProperty("SYSTEM_STATUS", "OFF");
      reply(replyToken, "🔴 ปิดระบบเรียบร้อย (บอทจะหยุดรับงานชั่วคราว ยกเว้น Admin)");
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    if (status === "OFF" && !isAdmin) return ContentService.createTextOutput("Offline").setMimeType(ContentService.MimeType.TEXT);
    if (source && source.type === "user" && !isAdmin) {
      reply(replyToken, "⚠️ ขออภัยครับ บอทรับลงรายงานเฉพาะใน 'ไลน์กลุ่ม' เท่านั้นครับ 🙏");
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    const cacheKeys = [`PENDING_CLOCKIN_${userId}`, `PENDING_OT_CONFIRM_${userId}`, `PENDING_OT_DETAILS_${userId}`];
    if (msg.startsWith("#")) cacheKeys.forEach(k => cache.remove(k));

    if (["ยกเลิก", "ถ่ายใหม่", "ยกเลิกลงเวลา"].includes(msg)) {
      cacheKeys.forEach(k => cache.remove(k));
      reply(replyToken, "🛑 ยกเลิกกระบวนการลงเวลาปัจจุบันเรียบร้อยครับ!");
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    // --- ตรวจคำตอบจากผู้ใช้สำหรับ suggestion ที่รอการยืนยัน ---
    const pendingSuggestionsRaw = cache.get(`PENDING_SUGGESTIONS_${userId}`);
    if (pendingSuggestionsRaw && pendingSuggestionsRaw !== "CLEARED") {
      const pending = JSON.parse(pendingSuggestionsRaw);

      // ยอมรับทั้งหมด
      if (msg === "ยอมรับทั้งหมด") {
        pending.data.employees.forEach((emp, idx) => {
          if (emp.suggested_name) emp.firstname = emp.suggested_name;
        });
        
        // เช็คเผื่อมีคีย์ไซต์ถูกสวมไว้
        const siteSuggestion = pending.suggestions.find(s => s.type === "site");
        if (siteSuggestion) pending.data.default_site = siteSuggestion.suggestion;

        cache.remove(`PENDING_SUGGESTIONS_${userId}`);
        reply(replyToken, "✅ ยอมรับการแก้ไขทั้งหมดแล้ว กำลังดำเนินการบันทึกข้อมูลต่อครับ");
        
        pending.data.is_verified = true; // เปิดธงผ่านสิทธิ์ ป้องกันลูปตาย
        handleClockIn(pending.data.original_msg || "", userId, replyToken, pending.data);
        return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }

      // ปฏิเสธทั้งหมด
      if (msg === "ปฏิเสธทั้งหมด") {
        cache.remove(`PENDING_SUGGESTIONS_${userId}`);
        reply(replyToken, "❌ ปฏิเสธการแก้ไขทั้งหมดแล้ว ดำเนินการบันทึกตามข้อมูลต้นฉบับครับ");
        
        pending.data.is_verified = true; // เปิดธงผ่านสิทธิ์ ป้องกันลูปตาย
        handleClockIn(pending.data.original_msg || "", userId, replyToken, pending.data);
        return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }

      // เริ่มตรวจทีละคน
      if (msg === "ตรวจทีละคน") {
        pending.mode = "step";
        pending.answered = [];
        cache.put(`PENDING_SUGGESTIONS_${userId}`, JSON.stringify(pending), SUGGESTION_TTL);
        const first = pending.suggestions[0];
        const q = first.type === "site"
          ? `พบ ไซต์: "${first.original}" → แนะนำ "${first.suggestion}" (ความมั่นใจ ${Math.round(first.score*100)}%)\nต้องการเปลี่ยนหรือไม่?`
          : `พบ "${first.original}" → แนะนำ "${first.suggestion}" (ความมั่นใจ ${Math.round(first.score*100)}%)\nต้องการเปลี่ยนหรือไม่?`;
        replyWithButtons(replyToken, q, ["ยอมรับ", "ปฏิเสธ", "ยกเลิกทั้งหมด"]);
        return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }

      // โหมด step: รับคำตอบย่อยสำหรับแต่ละรายการ
      if (pending.mode === "step") {
        const nextIdx = pending.suggestions.findIndex((s, i) => !pending.answered.includes(i));
        if (nextIdx === -1) {
          cache.remove(`PENDING_SUGGESTIONS_${userId}`);
          reply(replyToken, "✅ ตรวจชื่อเสร็จสิ้น กำลังดำเนินการบันทึกข้อมูลต่อครับ");
          pending.data.is_verified = true;
          handleClockIn(pending.data.original_msg || "", userId, replyToken, pending.data);
          return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
        }
        
        const current = pending.suggestions[nextIdx];
        if (msg === "ยอมรับ") {
          if (current.type === "employee") {
            const emp = pending.data.employees[current.index];
            if (emp && emp.suggested_name) emp.firstname = emp.suggested_name;
          } else if (current.type === "site") {
            pending.data.default_site = current.suggestion;
          }
          pending.answered.push(nextIdx);
        } else if (msg === "ปฏิเสธ") {
          pending.answered.push(nextIdx);
        } else if (msg === "ยกเลิกทั้งหมด") {
          cache.remove(`PENDING_SUGGESTIONS_${userId}`);
          reply(replyToken, "ยกเลิกการยืนยันชื่อแล้วครับ");
          return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
        } else {
          const q2 = current.type === "site"
            ? `พบ ไซต์: "${current.original}" → "${current.suggestion}" (ความมั่นใจ ${Math.round(current.score*100)}%)\nต้องการเปลี่ยนหรือไม่?`
            : `พบ "${current.original}" → "${current.suggestion}" (ความมั่นใจ ${Math.round(current.score*100)}%)\nต้องการเปลี่ยนหรือไม่?`;
          replyWithButtons(replyToken, q2, ["ยอมรับ", "ปฏิเสธ", "ยกเลิกทั้งหมด"]);
          return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
        }

        const nextUnansweredIdx = pending.suggestions.findIndex((s, i) => !pending.answered.includes(i));
        if (nextUnansweredIdx !== -1) {
          pending.cache_index = nextUnansweredIdx;
          cache.put(`PENDING_SUGGESTIONS_${userId}`, JSON.stringify(pending), SUGGESTION_TTL);
          const nextUnanswered = pending.suggestions[nextUnansweredIdx];
          const q3 = nextUnanswered.type === "site"
            ? `พบ ไซต์: "${nextUnanswered.original}" → "${nextUnanswered.suggestion}" (ความมั่นใจ ${Math.round(nextUnanswered.score*100)}%)\nต้องการเปลี่ยนหรือไม่?`
            : `พบ "${nextUnanswered.original}" → "${nextUnanswered.suggestion}" (ความมั่นใจ ${Math.round(nextUnanswered.score*100)}%)\nต้องการเปลี่ยนหรือไม่?`;
          replyWithButtons(replyToken, q3, ["ยอมรับ", "ปฏิเสธ", "ยกเลิกทั้งหมด"]);
          return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
        } else {
          cache.remove(`PENDING_SUGGESTIONS_${userId}`);
          reply(replyToken, "✅ ตรวจชื่อเสร็จสิ้น กำลังดำเนินการบันทึกข้อมูลต่อครับ");
          pending.data.is_verified = true; // ปลดล็อกคิวเข้าชีต
          handleClockIn(pending.data.original_msg || "", userId, replyToken, pending.data);
          return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
        }
      }
    }

    const pendingOTDetails = cache.get(`PENDING_OT_DETAILS_${userId}`);
    if (pendingOTDetails && pendingOTDetails !== "CLEARED") {
      cache.remove(`PENDING_OT_DETAILS_${userId}`);
      const dataToProcess = JSON.parse(pendingOTDetails);
      finalizeClockInSaving(dataToProcess, userId, replyToken, dataToProcess.checkStatus, msg, dataToProcess.targetFileId);
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    const pendingOTConfirm = cache.get(`PENDING_OT_CONFIRM_${userId}`);
    if (pendingOTConfirm && pendingOTConfirm !== "CLEARED") {
      const dataToProcess = JSON.parse(pendingOTConfirm);
      if (msg === "ทำที่เดิม/งานเดิม") {
        cache.remove(`PENDING_OT_CONFIRM_${userId}`);
        finalizeClockInSaving(dataToProcess, userId, replyToken, dataToProcess.checkStatus, null, dataToProcess.targetFileId);
        return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      } else if (msg === "เปลี่ยนไซต์/เปลี่ยนงาน") {
        cache.remove(`PENDING_OT_CONFIRM_${userId}`);
        cache.put(`PENDING_OT_DETAILS_${userId}`, JSON.stringify(dataToProcess), 300);
        reply(replyToken, "กรุณาพิมพ์ ไซต์งาน / งานที่ทำโอที ครับพี่");
        return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }
    }

    const pendingClockIn12 = cache.get(`PENDING_CLOCKIN_${userId}`);
    if (pendingClockIn12 && pendingClockIn12 !== "CLEARED") {
      if (msg === "ยืนยันตามเวลาที่แจ้ง" || msg === "ลงเวลา 13.00 น.") {
        processPendingClockIn(msg, pendingClockIn12, userId, replyToken);
        return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }
    }

    if (!msg.startsWith("#")) {
      const aiResult = processUserChat(msg, userId, replyToken);
      if (aiResult && aiResult.text) reply(replyToken, aiResult.text);
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    const content = msg.substring(1).trim();
    if (content === "ยกเลิกรายการล่าสุด" || content === "ยกเลิกล่าสุด") {
      handleUndoLastAction(userId, replyToken);
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }
    if (content.startsWith("เช็ครายงาน")) {
      handleCheckReport(content, userId, replyToken);
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }
    if (/^(คู่มือ|วิธีใช้|help|คำสั่ง)/i.test(content)) {
      showHelpCommand(replyToken);
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }

    handleClockIn(msg, userId, replyToken);
    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    console.error(err);
    return ContentService.createTextOutput("Error").setMimeType(ContentService.MimeType.TEXT);
  }
}

/** ฟังก์ชันทำความสะอาดข้อความ ป้องกันช่างพิมพ์ฟอร์แมตผิด */
function cleanText(inputText) {
  let text = inputText;
  text = text.replace(/#(\d{2})\/(\d{2})\/(\d{4})/g, (m, d, mth, y) => `#${d}/${mth}/${y.slice(-2)}`);
  text = text.replace(/#(\d{1,2})-(\d{1,2})-(\d{2})/g, (m, d, mth, y) => `#${d}/${mth}/${y}`);
  text = text.replace(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/g, (m, h1, m1, h2, m2) => `${h1}.${m1}-${h2}.${m2}`);
  text = text.replace(/(\d{2}\.\d{2})\s*-\s*(\d{2}\.\d{2})/g, (m, t1, t2) => `${t1}-${t2}`);
  text = text.replace(/\bนส\b/g, "น.ส.").replace(/\bนางสาว\b/g, "น.ส.");
  text = text.replace(/\bMr\.\b/g, "นาย").replace(/\bMrs\.\b/g, "นาง");
  text = text.replace(/รื้อแบบ$/g, "รื้อแบบคาน").replace(/ทำคสล\./g, "ทำความสะอาด");
  text = text.replace(/พระราม\s+3/g, "พระราม3").replace(/\s{2,}/g, " ");
  return text;
}

function cleanSheetData() {
  const sheetId = getSecret("EXTERNAL_DATABASE_ID");
  if (!sheetId) return;
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName("DATA");
  if (!sheet) return;
  const range = sheet.getDataRange();
  const values = range.getValues();
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      if (typeof values[r][c] === "string") values[r][c] = cleanText(values[r][c]);
    }
  }
  range.setValues(values);
}

/** ระบบประมวลผลการบันทึกเวลาพร้อม Lock กันคิวชนกัน */
function handleClockIn(rawMsg, userId, token, preParsedData = null) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { reply(token, "⚠️ ระบบยุ่งอยู่ กรุณาส่งซ้ำครับ"); return; }
  try {
    const props = PropertiesService.getScriptProperties();
    const adminIds = (props.getProperty("ADMIN_LINE_IDS") || "").split(",").map(s => s.trim()).filter(Boolean);
    const isAdmin = adminIds.includes(userId);
    const cache = CacheService.getScriptCache();
    const pendingCodes = cache.get(`PENDING_IMG_CODES_${userId}`);
    const msg = cleanText(rawMsg);

    let data = preParsedData || parseComplexMessage(msg);
    if (!data || !data.date || !data.default_site) {
      data = processMessageWithAI(msg);
      if (data && typeof data === "object") {
        const countMatch = msg.match(/ทั้งหมด\s*(\d+)\s*คน/);
        if (countMatch) data.expected_count = parseInt(countMatch[1], 10);
        const otRegex = /(OT|โอที)\s*เที่ยง\s*(?:(\d{1,2}[.:]\d{2})\s*[-ถึง]\s*(\d{1,2}[.:]\d{2}))?/i;
        const matchOT = msg.match(otRegex);
        if (matchOT) {
          data.has_ot_noon = true;
          if (matchOT[2] && matchOT[3]) { data.ot_noon_in = matchOT[2].replace(':', '.'); data.ot_noon_out = matchOT[3].replace(':', '.'); }
        }
      }
    }

    if (pendingCodes && data) {
      const empList = getEmployeesByCodes(JSON.parse(pendingCodes));
      if (data.expected_count && data.expected_count > 0 && empList.length !== data.expected_count) {
        reply(token, `⚠️ จำนวนคนไม่ตรงกับรูปภาพ (${empList.length} vs ${data.expected_count}) กรุณาตรวจสอบ`);
        cache.remove(`PENDING_IMG_CODES_${userId}`);
        return;
      }
      if (empList.length > 0) {
        data.employees = empList.map(e => ({
          firstname: e.firstname, lastname: e.lastname,
          task: data.has_ot_noon ? "ทำงาน (OTเที่ยง)" : "ทำงาน",
          has_ot_noon: data.has_ot_noon || false,
          ot_noon_in: data.ot_noon_in || "12.00", ot_noon_out: data.ot_noon_out || "13.00",
          accom: data.default_Accom || ""
        }));
        cache.remove(`PENDING_IMG_CODES_${userId}`);
      }
    }

    if (!data || !data.date || !data.employees || data.employees.length === 0) {
      logErrorToSheet(getTargetFileIdByDate(null), msg, "❌ ข้อมูลไม่ครบถ้วน โครงสร้างขาดหาย");
      reply(token, "❌ ข้อมูลไม่ครบถ้วนครับ! กรุณาลงบันทึกเวลาตามตัวอย่างคู่มือ หรือ พิมพ์ #คู่มือ");
      return;
    }

    data.original_msg = msg;

    // === [เริ่ม] Suggestion mode (รันเฉพาะกรณีที่ธง is_verified ยังไม่เปิดเท่านั้น) ===
    if (!data.is_verified) {
      const CONFIDENCE_THRESHOLD = 0.82;
      const suggestions = [];

      // 1. ตรวจชื่อไซต์หลัก
      if (data.default_site) {
        const masterSites = getSites();
        const siteMatch = findBestMatch(data.default_site, masterSites);
        if (siteMatch && siteMatch.score >= 0.95) {
          data.default_site = siteMatch.match; // มั่นใจสูงมาก เปลี่ยนให้เลย
        } else if (siteMatch && siteMatch.score >= CONFIDENCE_THRESHOLD) {
          suggestions.push({ type: "site", original: data.default_site, suggestion: siteMatch.match, score: siteMatch.score });
        }
      }

      // 2. ตรวจชื่อพนักงาน
      if (data.employees && data.employees.length > 0) {
        const employeeResult = getEmployeeData();
        if (employeeResult && employeeResult.success && employeeResult.data) {
          const masterNames = employeeResult.data.map(emp => emp.name);

          data.employees.forEach((emp, idx) => {
            const currentName = emp.firstname || emp.name;
            if (currentName) {
              const nameMatch = findBestMatch(currentName, masterNames);
              // 🛠️ [แก้ไขใหม่] ถ้าความมั่นใจเต็มหรือเกือบเต็ม (สะกดถูกแล้ว) ให้ปล่อยผ่านหรือเปลี่ยนให้ทันที ไม่กักเข้าลูปพ่นปุ่ม
              if (nameMatch && nameMatch.score >= 0.98) {
                const matchedEmp = employeeResult.data.find(e => e.name === nameMatch.match);
                if (matchedEmp) emp.firstname = matchedEmp.name; 
              } else if (nameMatch && nameMatch.score >= CONFIDENCE_THRESHOLD) {
                const matchedEmp = employeeResult.data.find(e => e.name === nameMatch.match);
                if (matchedEmp) {
                  emp.suggested_name = matchedEmp.name;
                  emp.suggested_score = nameMatch.score;
                  emp.suggested_emp_id = matchedEmp.id || null;
                  suggestions.push({ type: "employee", index: idx, original: currentName, suggestion: matchedEmp.name, score: nameMatch.score });
                }
              }
            }
          });
        }
      }

      // ถ้ามีคิวต้องให้หัวหน้าตรวจสอบ ให้เด้งส่งปุ่มยืนยันและหยุดคิวเขียนชีตชั่วคราว
      if (suggestions.length > 0) {
        const pending = { data: data, suggestions: suggestions, timestamp: Date.now() };
        cache.put(`PENDING_SUGGESTIONS_${userId}`, JSON.stringify(pending), SUGGESTION_TTL);

        let summary = "พบการสะกดชื่อ/ไซต์ที่อาจต้องการแก้ไขโดยอัตโนมัติ:\n\n";
        suggestions.forEach(s => {
          if (s.type === "site") summary += `• ไซต์: "${s.original}" → แนะนำ: "${s.suggestion}" (${Math.round(s.score*100)}%)\n`;
          else summary += `• "${s.original}" → แนะนำ: "${s.suggestion}" (${Math.round(s.score*100)}%)\n`;
        });
        summary += `\nโปรดเลือก:\n- ยอมรับทั้งหมด\n- ตรวจทีละคน\n- ปฏิเสธทั้งหมด`;

        replyWithButtons(token, summary, ["ยอมรับทั้งหมด", "ตรวจทีละคน", "ปฏิเสธทั้งหมด"]);
        return; 
      }
    }
    // === [สิ้นสุด] Suggestion mode ===

    const check = checkDate(data.date);
    if (check.status === "BLOCK" && !isAdmin) {
      reply(token, `⛔ ${check.msg}\n(การบันทึกย้อนหลังเกิน 2 วัน ถูกจำกัดสิทธิ์เฉพาะแอดมินเท่านั้นครับ)`);
      return;
    }

    if (data.time_start) {
      const startTimeStr = data.time_start.toString();
      const startHour = parseInt(startTimeStr.split('.')[0]);
      if (startHour === 12) {
        data.checkStatus = check;
        data.targetFileId = getTargetFileIdByDate(data.date);
        cache.put(`PENDING_CLOCKIN_${userId}`, JSON.stringify(data), 300);
        replyWithButtons(token, `ลงข้อมูลตามเวลาเข้า (${startTimeStr} น.) หรือ 13.00 น.?`, ["ยืนยันตามเวลาที่แจ้ง", "ลงเวลา 13.00 น.", "ยกเลิกลงเวลา"]);
        return;
      }
    }

    checkOTAndProceed(data, userId, token, check, getTargetFileIdByDate(data.date));
  } finally { lock.releaseLock(); }
}

function checkOTAndProceed(dataToProcess, userId, token, check, targetFileId) {
  const toMins = (t) => { if (!t) return 0; const parts = t.toString().replace('.', ':').split(':'); return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0); };
  const sMins = toMins(dataToProcess.time_start);
  let eMins = toMins(dataToProcess.time_end);
  let hasOT = false;

  if (eMins > 0) {
    if (eMins < sMins) eMins += 24 * 60;
    let otMins = 0;
    if (sMins < 480) otMins += (Math.min(eMins, 480) - sMins);
    if (eMins > 1020) otMins += (eMins - Math.max(sMins, 1020));
    let hasNoonOt = false; let noonOtMins = 0;
    dataToProcess.employees.forEach(emp => {
      if (emp.has_ot_noon) {
        hasNoonOt = true;
        let nIn = toMins(emp.ot_noon_in || "12.00");
        let nOut = toMins(emp.ot_noon_out || "13.00");
        noonOtMins = Math.max(noonOtMins, nOut - nIn);
      }
    });
    if (hasNoonOt) otMins += noonOtMins;

    const nIn = Math.max(sMins, 480); const nOut = Math.min(eMins, 1020);
    let normMins = Math.max(0, nOut - nIn);
    if (nIn <= 720 && nOut >= 780) normMins -= 60;

    let gap = 480 - normMins;
    if (gap > 0 && otMins > 0) otMins -= Math.min(gap, otMins);
    if (otMins > 0) hasOT = true;
  }

  if (hasOT) {
    dataToProcess.checkStatus = check;
    dataToProcess.targetFileId = targetFileId || getTargetFileIdByDate(dataToProcess.date);
    CacheService.getScriptCache().put(`PENDING_OT_CONFIRM_${userId}`, JSON.stringify(dataToProcess), 300);
    const questionText = `ตรวจพบว่ามีข้อมูลการทำ OT\n\nโปรดยืนยันว่า... ทำ OT ที่ไซต์งานเดิม และ ลักษณะงานเดิม หรือไม่?`;
    replyWithButtons(token, questionText, ["ทำที่เดิม/งานเดิม", "เปลี่ยนไซต์/เปลี่ยนงาน", "ยกเลิกลงเวลา"]);
  } else {
    finalizeClockInSaving(dataToProcess, userId, token, check, null, targetFileId);
  }
}

function processPendingClockIn(answer, pendingDataStr, userId, token) {
  const cache = CacheService.getScriptCache();
  try {
    let dataToProcess = JSON.parse(pendingDataStr);
    if (answer === "ลงเวลา 13.00 น.") dataToProcess.time_start = "13.00";
    cache.put(`PENDING_CLOCKIN_${userId}`, "CLEARED", 1);
    checkOTAndProceed(dataToProcess, userId, token, dataToProcess.checkStatus, null);
  } catch (e) {
    cache.put(`PENDING_CLOCKIN_${userId}`, "CLEARED", 1);
    reply(token, "❌ ข้อมูลหมดอายุหรือเกิดข้อผิดพลาด กรุณาส่งรายการลงเวลามาใหม่อีกครั้งครับ");
  }
}

function finalizeClockInSaving(data, userId, token, check, customOt, targetId) {
  const props = PropertiesService.getScriptProperties();
  const isTesting = props.getProperty("IS_TESTING") === "TRUE";
  if (!data || !data.date) { reply(token, "❌ ข้อมูลสูญหายระหว่างทำรายการ กรุณาส่งข้อมูลเพื่อลงเวลาใหม่อีกครั้งครับ"); return; }
  if (!targetId) targetId = data.targetFileId || getTargetFileIdByDate(data.date);
  if (!targetId) { reply(token, "❌ ไม่พบลิงก์ไฟล์สำหรับเดือนนี้"); return; }

  const writeRes = writeToDailySheet(data, userId, targetId);
  let customOtSite = null; let customOtTask = null;

  if (customOt && writeRes.count > 0) {
    let parts = customOt.split('/');
    customOtSite = parts[0] ? parts[0].trim() : data.default_site;
    customOtTask = parts[1] ? parts[1].trim() : "ทำ OT";
    const ss = SpreadsheetApp.openById(targetId);
    const sheet = ss.getSheetByName(parseThaiDate(data.date));
    if (sheet) {
      const dbData = sheet.getRange(CORE.START_ROW, 4, sheet.getLastRow() - CORE.START_ROW + 1, 2).getValues();
      data.employees.forEach(emp => {
        const inputName = normalize(emp.firstname);
        for (let i = 0; i < dbData.length; i++) {
          if (normalize(dbData[i][0]) === inputName) {
            const targetRow = i + CORE.START_ROW;
            sheet.getRange(targetRow, 9).setValue(customOtSite);
            sheet.getRange(targetRow, 10).setValue(customOtTask);
            break;
          }
        }
      });
    }
  }

  let txt = check.status === "WARNING" ? `⚠️ ${check.msg}\n` : "";
  if (writeRes.errors.length > 0) txt += `⚠️ หาชื่อไม่พบ: ${writeRes.errors.join(', ')}\n`;
  if (txt !== "" || writeRes.count === 0) logErrorToSheet(targetId, data.original_msg, txt || "บันทึกไม่ได้");
  const testTag = isTesting ? "\n🧪 [โหมดทดสอบ - ข้อมูลจะถูกล้างเมื่อจบ]" : "";

  let timeStatus = "";
  if (!data.time_end || data.time_end === "") {
    timeStatus = `(ลงเวลาเข้า: ${data.time_start})`;
  } else {
    const toMins = (t) => { const parts = t.toString().replace('.', ':').split(':'); return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0); };
    const sMins = toMins(data.time_start); let eMins = toMins(data.time_end);
    if (eMins < sMins) eMins += 24 * 60;
    let otMins = 0; let normMins = 0;
    if (sMins < 480) otMins += (Math.min(eMins, 480) - sMins);
    const nIn = Math.max(sMins, 480); const nOut = Math.min(eMins, 1020);
    normMins = Math.max(0, nOut - nIn);
    if (nIn <= 720 && nOut >= 780) normMins -= 60;
    if (eMins > 1020) otMins += (eMins - Math.max(sMins, 1020));
    let hasNoonOt = false; let noonOtMins = 0;
    data.employees.forEach(emp => {
      if (emp.has_ot_noon) {
        hasNoonOt = true;
        let mIn = toMins(emp.ot_noon_in || "12.00");
        let mOut = toMins(emp.ot_noon_out || "13.00");
        noonOtMins = Math.max(noonOtMins, mOut - mIn);
      }
    });
    if (hasNoonOt) otMins += noonOtMins;

    let gap = 480 - normMins;
    if (gap > 0 && otMins > 0) {
        let fill = Math.min(gap, otMins);
        normMins += fill; otMins -= fill;
    }
    const normHr = parseFloat((normMins / 60).toFixed(2));
    const otHr = parseFloat((otMins / 60).toFixed(2));
    let otText = otHr > 0 ? ` | OT: ${otHr} ชม.` : "";
    timeStatus = `(เวลา: ${data.time_start}-${data.time_end} ➡️ ปกติ: ${normHr} ชม.${otText})`;
  }

  let displaySite = data.default_site;
  if (customOtSite) displaySite += `\n[ไซต์ OT: ${customOtSite} | งาน OT: ${customOtTask}]`;
  const accomText = data.default_Accom || (writeRes && writeRes.accom) || 'ไม่ได้ระบุ';
  const dateToShow = data.date ? `\n📅 วันที่: ${data.date}` : "";
  const statusText = (!writeRes || writeRes.count === 0) ? "❌ ไม่พบข้อมูลที่บันทึกได้" : `✅ บันทึกสำเร็จ ${writeRes.count} คน`;
  const warningFooter = "\n\n📌 โปรดตรวจเช็คความถูกต้อง หากผิดพลาดให้แจ้งแอดมินทันที";

  reply(token, `${statusText}${dateToShow}\n${timeStatus}\nไซต์: ${displaySite}\n[ที่พัก: ${accomText}]${testTag}${txt ? "\n" + txt : ""}${warningFooter}`);
}

/** บันทึกรายงานผลลง Spreadsheet แบบเทข้อมูลก้อนเดียว (Batch Write) */
function writeToDailySheet(data, userId, fileId) {
  try {
    const ss = SpreadsheetApp.openById(fileId);
    const sheetName = parseThaiDate(data.date);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { count: 0, errors: ["ไม่พบหน้าวันที่: " + sheetName] };

    const startRow = CORE.START_ROW;
    const lastRow = sheet.getLastRow();
    const numRows = Math.max(0, lastRow - startRow + 1);
    const dbData = numRows > 0 ? sheet.getRange(startRow, 4, numRows, 2).getValues() : [];
    let hasAnyName = dbData.some(r => r[0] && r[0].toString().trim() !== "");
    if (!hasAnyName) return { count: 0, errors: [`หน้าชีต "${sheetName}" ยังไม่มีรายชื่อช่างเลยครับ!`] };

    const fullCols = 20;
    const blockRange = sheet.getRange(startRow, 1, numRows, fullCols);
    const block = blockRange.getValues();
    let successCount = 0; let errors = []; let processedNames = []; let replyAccom = "ไม่ได้ระบุ";

    data.employees.forEach(emp => {
      const inputName = normalize(emp.firstname);
      let rowIndex = -1;
      for (let i = 0; i < dbData.length; i++) {
        if (normalize(dbData[i][0]) === inputName && normalize(dbData[i][0]) !== "") {
          if (emp.lastname && normalize(emp.lastname) !== normalize(dbData[i][1])) continue;
          rowIndex = i; break;
        }
      }
      if (rowIndex !== -1) {
        const r = rowIndex;
        block[r][CORE.COL_SITE - 1] = data.default_site;
        block[r][CORE.COL_WORK - 1] = emp.task;
        let empAccom = emp.accom;
        if (!empAccom || empAccom === "-" || empAccom === "เดิม") empAccom = block[r][CORE.COL_ACCOM - 1];
        else block[r][CORE.COL_ACCOM - 1] = empAccom;
        if (successCount === 0) replyAccom = empAccom || "ไม่ได้ระบุ";
        const otHrs = calculateAndTimeEntryFromValues(block, r, data.time_start, data.time_end, emp.has_ot_noon, emp.ot_noon_in, emp.ot_noon_out);
        if (otHrs > 0) { block[r][8] = data.default_site; block[r][9] = emp.task; } else { block[r][8] = ""; block[r][9] = ""; }
        successCount++; processedNames.push(inputName);
      } else { errors.push(emp.firstname); }
    });

    blockRange.setValues(block);
    if (userId && successCount > 0) {
      PropertiesService.getScriptProperties().setProperty(`LAST_ENTRY_${userId}`, JSON.stringify({ date: data.date, names: processedNames }));
    }
    return { count: successCount, errors: errors, accom: replyAccom };
  } catch (e) {
    console.error(e);
    return { count: 0, errors: [e.message], accom: null };
  }
}

function calculateAndTimeEntryFromValues(block, rowIndex, sT, eT, isN, nI, nO) {
  if (!eT || eT.toString().trim() === "") {
    block[rowIndex][CORE.COL_NORMAL_HR - 1] = "";
    for (let c = 0; c < 7; c++) block[rowIndex][CORE.COL_OT_M_IN - 1 + c] = "";
    return 0;
  }
  const toM = (t) => { const p = t.toString().split(/[.:]/); return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0); };
  const toF = (m) => { let h = Math.floor(m / 60) % 24; return (h < 10 ? "0" + h : h) + "." + (m % 60 < 10 ? "0" + m % 60 : m % 60); };
  const toHrs = (m) => parseFloat((m / 60).toFixed(2));

  const s = toM(sT); let e = toM(eT);
  if (e === 0) return 0;
  if (e < s) e += 1440;

  let otData = ["", "", "", "", "", "", ""];
  let otT = 0; let normHr = "";

  if (s < 480) { otData[0] = toF(s); otData[1] = "08.00"; otT += (480 - s); }
  const nIn = Math.max(s, 480); const nOut = Math.min(e, 1020);
  let nDur = Math.max(0, nOut - nIn);
  if (nIn <= 720 && nOut >= 780) nDur -= 60;

  if (isN) { otData[2] = nI || "12.00"; otData[3] = nO || "13.00"; otT += (toM(otData[3]) - toM(otData[2])); }
  if (e > 1020) { otData[4] = "17.00"; otData[5] = toF(e); otT += (e - 1020); }

  let gap = 480 - nDur;
  if (gap > 0 && otT > 0) {
      let fill = Math.min(gap, otT);
      nDur += fill; otT -= fill;
  }
  if (nDur > 0) normHr = toHrs(nDur);
  if (otT > 0) otData[6] = toHrs(otT);

  block[rowIndex][CORE.COL_NORMAL_HR - 1] = normHr || "";
  for (let i = 0; i < 7; i++) block[rowIndex][CORE.COL_OT_M_IN - 1 + i] = otData[i];
  return toHrs(otT);
}

/** ฟังก์ชันยิงข้อความขากลับหา LINE Bot */
function reply(token, text) {
  try {
    const LINE_TOKEN = getSecret("LINE_CHANNEL_ACCESS_TOKEN");
    const payload = { replyToken: token, messages: [{ type: "text", text }] };
    UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
      method: "post", headers: { "Authorization": "Bearer " + LINE_TOKEN }, contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
    });
  } catch (e) { console.error("reply error: " + e.message); }
}

/** ฟังก์ชันยิงปุ่มด่วนหาผู้ใช้ LINE */
function replyWithButtons(token, text, options) {
  try {
    const LINE_TOKEN = getSecret("LINE_CHANNEL_ACCESS_TOKEN");
    const actions = options.map(o => ({ type: "message", label: o, text: o }));
    const payload = { replyToken: token, messages: [{ type: "template", altText: text, template: { type: "buttons", text, actions } }] };
    UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
      method: "post", headers: { "Authorization": "Bearer " + LINE_TOKEN }, contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
    });
  } catch (e) { console.error("replyWithButtons error: " + e.message); }
}