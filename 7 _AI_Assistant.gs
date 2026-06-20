// =================================================================
// 7_AIAssistant.gs (AI Assistant Subsystem, Dynamic Logic & DevOps)
// =================================================================

/**
 * 1. ฟังก์ชันประมวลผลคำสั่งผ่านการแชท (เวอร์ชันยกระดับความปลอดภัยและเสถียรภาพ)
 * ตอบสนองต่อการพิมพ์ข้อความทั่วไปที่ไม่ใช่แบบฟอร์มลงเวลาตายตัว
 */
function processUserChat(prompt, userId, replyToken) {
  try {
    // 1. เตรียม Config และสถานะ Admin
    var props = PropertiesService.getScriptProperties();
    var adminIds = (getDynamicConfig("ADMIN_LINE_IDS") || getDynamicConfig("ADMIN_LINE_ID") || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var isAdmin = userId && adminIds.indexOf(userId) !== -1;

    // 2. จัดการทางลัด Admin
    if (prompt.trim() === "กู้คืนระบบ" || prompt.toLowerCase() === "rollback") {
      var rollbackResult = rollbackLogic(userId, 1);
      return { success: rollbackResult.success, text: rollbackResult.success ? rollbackResult.message : rollbackResult.error };
    }

    // 3. ดึงข้อมูลที่จำเป็น (ย้ายมาไว้ข้างบนเพื่อความถูกต้อง)
    var validNames = typeof getValidNamesForAI === "function" ? getValidNamesForAI() : [];
    var currentLogic = getCurrentLogic();
    var dateToday = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");

    // 4. สร้าง System Instruction พร้อมคำสั่งบังคับ Format
    var baseInstruction = typeof getDynamicPrompt === "function" ? getDynamicPrompt('BOT') : "คุณคือ AI ผู้ช่วยประจำระบบ Smart Worksite System";
    
    var systemInstruction = `${baseInstruction}
    สถานะผู้ใช้: ${isAdmin ? "ADMIN" : "พนักงานทั่วไป"}
    รายชื่อพนักงาน: ${JSON.stringify(validNames)}
    กฎระบบปัจจุบัน: ${JSON.stringify(currentLogic)}

    หน้าที่การตอบกลับ:
    1. หากผู้ใช้แจ้งข้อมูลพนักงาน ให้สรุปผลในรูปแบบนี้เสมอ:
       ✅ ตรวจพบพนักงาน [X] คน
       📅 วันที่: ${dateToday}
       (เวลา: ...)
       ไซต์: ...
       [ที่พัก: ...]
       1. [ชื่อ]
       2. [ชื่อ]
       📌 โปรดพิมพ์รายละเอียดงานเพื่อบันทึกต่อได้เลยครับ
    
    2. หากผู้ใช้สั่ง "บันทึก" ให้แปลงเป็น JSON เท่านั้น:
       {"type":"SAVE", "payload": {"date":"YYYY-MM-DD", "default_site":"ชื่อไซต์", "time_start":"08.00", "time_end":"17.00", "employees":[{"firstname":"ชื่อ","task":"ลักษณะงาน"}]}}
       
    3. หากเป็นคำถามทั่วไป ตอบให้สุภาพ กระชับ เป็นกันเอง`;

    // 5. เรียกใช้ Gemini
    if (typeof callGemini !== "function") return { success: false, text: "⚠️ ไม่พบตัวซิงค์เชื่อมต่อโมเดลสารพัดประโยชน์ (callGemini)" };
    
    var aiRawText = callGemini(prompt, systemInstruction, false);
    if (!aiRawText) return { success: false, text: "⚠️ ไม่สามารถติดต่อสมอง AI ได้ในขณะนี้ครับ" };

    // 6. ประมวลผลผลลัพธ์
    var cleanJsonStr = aiRawText.replace(/```json/gi, "").replace(/```/g, "").trim();
    var data;
    try {
      data = JSON.parse(cleanJsonStr);
    } catch(e) {
      // ถ้าไม่ใช่ JSON แสดงว่า AI ตอบเป็นข้อความปกติ
      return { success: true, text: aiRawText };
    }

    // 7. Branch: SAVE
    if (data.type === "SAVE") {
      var entryDate = new Date(data.payload.date);
      var today = new Date(); today.setHours(0,0,0,0);
      var diffDays = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays > currentLogic.backdate_limit && !isAdmin) {
        logToBigQueryEnterprise(userId, "SAVE_DENIED", prompt + " | " + JSON.stringify(data.payload), "REJECT");
        return { success: false, text: `❌ ไม่สามารถลงข้อมูลย้อนหลังเกิน ${currentLogic.backdate_limit} วันครับ (จำกัดสิทธิ์ Admin)` };
      }
      
      if (typeof handleClockIn === "function") {
        var staffStr = data.payload.employees.map((e,i) => `${i+1}.${e.firstname} / ${e.task}`).join('\n');
        handleClockIn(`#${data.payload.date}\n${data.payload.default_site}\n${data.payload.time_start}-${data.payload.time_end}\n${staffStr}`, userId, replyToken);
      }
      return { success: true, text: null }; 
    }

    // 8. Branch: UPDATE_LOGIC
    if (data.type === "UPDATE_LOGIC") {
      if (!isAdmin) return { success: false, text: "🔒 สิทธิ์เปลี่ยนกฎระบบจำกัดเฉพาะ Admin ครับ" };
      var updateResult = updateLogic(JSON.stringify(data.new_logic), "Admin", "อัปเดตผ่านแชท");
      return { success: updateResult.success, text: updateResult.success ? updateResult.message : "⚠️ " + updateResult.error };
    }

    return { success: true, text: aiRawText };

  } catch (err) {
    var dbId = PropertiesService.getScriptProperties().getProperty("EXTERNAL_DATABASE_ID");
    if (typeof logErrorToSheet === "function") {
      logErrorToSheet(dbId, prompt, "AI_Assistant Error: " + err.message);
    }
    return { success: false, text: "🔴 เกิดข้อผิดพลาดในระบบสมองกล: " + err.message };
  }
}

// ==========================================
// 2. ระบบตรรกะแบบแปรผัน และประวัติ 5 ชั้น (Dynamic Rules System)
// ==========================================

function updateLogic(newLogicJson, updatedBy, note) {
  updatedBy = updatedBy || "AI";
  note = note || "AI อัปเดตตรรกะใหม่ตามคำสั่ง";
  
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); 
    
    var parsed = JSON.parse(newLogicJson);
    if (!validateLogic(parsed)) throw new Error("ตรวจพบคีย์สิทธิ์ที่ไม่ได้รับอนุญาต หรือโครงสร้างประเภทข้อมูลผิดพลาด");

    var scriptProperties = PropertiesService.getScriptProperties();
    var currentLogic = getCurrentLogic();
    
    addLogicHistory(currentLogic, updatedBy, "update", note);
    
    var mergedLogic = {};
    for (var k in currentLogic) { mergedLogic[k] = currentLogic[k]; }
    for (var p in parsed) { mergedLogic[p] = parsed[p]; }
    
    scriptProperties.setProperty('DYNAMIC_SYSTEM_LOGIC', JSON.stringify(mergedLogic));
    logToBigQueryEnterprise(updatedBy, "MUTATE_LOGIC", "Update Execution Line | " + note, "SUCCESS");

    return { success: true, message: "✅ อัปเดตตรรกะระบบเรียบร้อยแล้วครับ" };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function validateLogic(parsed) {
  var allowedKeys = ["ot_rule", "backdate_limit", "allow_overtime_noon"];
  var incomingKeys = Object.keys(parsed);
  if (incomingKeys.length === 0) return false; 
  return incomingKeys.every(function(key) { return allowedKeys.indexOf(key) !== -1; });
}

function getCurrentLogic() {
  var scriptProperties = PropertiesService.getScriptProperties();
  var savedLogic = scriptProperties.getProperty('DYNAMIC_SYSTEM_LOGIC');
  if (savedLogic) return JSON.parse(savedLogic);
  
  return {
    ot_rule: "standard",
    backdate_limit: parseInt(scriptProperties.getProperty("BACKDATE_LIMIT_DAYS") || "2"),
    allow_overtime_noon: true
  };
}

function addLogicHistory(logicObj, updatedBy, action, note) {
  var props = PropertiesService.getScriptProperties();
  var history = props.getProperty('DYNAMIC_SYSTEM_LOGIC_HISTORY');
  history = history ? JSON.parse(history) : [];

  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  history.unshift({
    logic: logicObj,
    timestamp: timestamp,
    updatedBy: updatedBy,
    action: action,
    note: note
  });

  if (history.length > 5) history = history.slice(0, 5);
  props.setProperty('DYNAMIC_SYSTEM_LOGIC_HISTORY', JSON.stringify(history));
}

function rollbackLogic(userId, step) {
  step = step || 1;
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    // ปรับเปลี่ยนการดึง Admin IDs ให้ใช้ getDynamicConfig ตามมาตรฐานที่สั่ง
    var adminIds = (getDynamicConfig("ADMIN_LINE_IDS") || getDynamicConfig("ADMIN_LINE_ID") || "").split(",").map(function(s) { return s.trim(); }).filter(Boolean);
    if (!userId || adminIds.indexOf(userId) === -1) return { success: false, error: "🔒 จำกัดสิทธิ์เฉพาะ Admin เท่านั้นครับ" };

    var props = PropertiesService.getScriptProperties();
    var history = props.getProperty('DYNAMIC_SYSTEM_LOGIC_HISTORY');
    history = history ? JSON.parse(history) : [];

    if (history.length < step) return { success: false, error: "❌ ไม่พบประวัติการแก้ไขย้อนหลังในหน่วยเก็บความจำระบบ" };

    var rollbackItem = history[step - 1];
    var currentLogic = getCurrentLogic();
    
    addLogicHistory(currentLogic, "Admin", "rollback", "บันทึกค่าก่อนย้อนระบบกลับ " + step + " ขั้น");
    props.setProperty('DYNAMIC_SYSTEM_LOGIC', JSON.stringify(rollbackItem.logic));
    logToBigQueryEnterprise(userId, "ROLLBACK_EXEC", "Rollback Triggered Step: " + step, "SUCCESS");

    return { success: true, message: `↩️ กู้คืนตรรกะระบบย้อนหลัง ${ step } ชั้นสำเร็จแล้วครับ` };
  } catch(e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 3. ระบบการสร้าง Audit Trail และเครื่องมือ DevOps
// ==========================================



function runDevOpsCliCommand(commandString) {
  var args = commandString.trim().split(" ");
  var rootCommand = args[0];
  var props = PropertiesService.getScriptProperties();
  
  if (rootCommand === "rollback") {
    var step = 1; var user = "SYSTEM";
    args.forEach(function(arg) {
      if (arg.indexOf("--step=") === 0) step = parseInt(arg.split("=")[1]) || 1;
      if (arg.indexOf("--user=") === 0) user = arg.split("=")[1];
    });
    var res = rollbackLogic(user, step);
    return JSON.stringify(res);
  }
  
  if (rootCommand === "system-scan") {
    var current = getCurrentLogic();
    var isLockHealthy = true;
    try {
      var lock = LockService.getScriptLock();
      if (lock.tryLock(50)) lock.releaseLock();
    } catch (e) { isLockHealthy = false; }
    
    return JSON.stringify({
      status: "PASS",
      timestamp: new Date().toISOString(),
      active_logic: current,
      concurrency_lock_operational: isLockHealthy
    });
  }
  
  return JSON.stringify({ status: "FAIL", error: "DevOps Integration Syntax Error" });
}

// ==========================================
// 4. Dynamic Prompt Manager (การจัดเก็บและดึงคำสั่ง AI)
// ==========================================

function getDynamicPrompt(role) {
  const props = PropertiesService.getScriptProperties();
  const key = role === 'WEB' ? 'SYSTEM_INSTRUCTION_WEB' : 'SYSTEM_INSTRUCTION_BOT';
  const savedPrompt = props.getProperty(key);
  if (savedPrompt && savedPrompt.trim() !== "") return savedPrompt;

  const validNames = typeof getValidNamesForAI === 'function' ? getValidNamesForAI() : "ไม่สามารถดึงรายชื่อได้";
  const currentLogic = typeof getCurrentLogic === 'function' ? getCurrentLogic() : { ot_rule: "standard", backdate_limit: 2, allow_overtime_noon: true };
  
  return `คุณคือ AI ผู้ช่วยประจำระบบ Smart Worksite System
  รายชื่อพนักงานในระบบปัจจุบัน: ${validNames}
  ตรรกะควบคุมระบบปัจจุบัน: ${JSON.stringify(currentLogic)}

  หน้าที่และวิธีการตอบกลับ:
  1. แนะนำการใช้งาน (Guide): หากผู้ใช้ถามวิธีใช้แอป ให้ตอบอธิบายสั้น กระชับ สุภาพ สไตล์พี่สอนน้อง เป็นข้อๆ 
  2. บันทึกงาน (Natural Language Input): หากผู้ใช้สั่งงานด้วยภาษาทั่วไป ให้แปลงเป็นโครงสร้าง JSON ตามที่ระบบกำหนด
  สรุปใจความสำคัญไว้บรรทัดแรกเสมอ ใช้ภาษาสุภาพ เป็นกันเอง`;
}

function setDynamicPrompt(role, promptText) {
  try {
    if (!promptText || promptText.trim() === "") throw new Error("เนื้อหาโปรมป์ห้ามว่างเปล่าครับ");
    if (promptText.length > 8500) throw new Error("ขนาดโปรมป์ยาวเกินขีดจำกัดความปลอดภัยของ Properties (9KB)");
    
    const props = PropertiesService.getScriptProperties();
    const key = role === 'WEB' ? 'SYSTEM_INSTRUCTION_WEB' : 'SYSTEM_INSTRUCTION_BOT';
    props.setProperty(key, promptText.trim());
    return { success: true, message: `🎯 อัปเดตคำสั่งสำหรับวิเคราะห์ชุดงานระบบ ${role} เรียบร้อยแล้วครับ` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getProjectSourceCode() {
  try {
    const scriptId = ScriptApp.getScriptId();
    const url = `https://script.googleapis.com/v1/projects/${scriptId}/content`;
    const options = {
      method: "get",
      headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    };
    
    const res = UrlFetchApp.fetch(url, options);
    if (res.getResponseCode() !== 200) {
      throw new Error(`Apps Script API ตอบกลับสถานะ: ${res.getResponseCode()} - ${res.getContentText()}`);
    }
    
    const json = JSON.parse(res.getContentText());
    if (!json.files || json.files.length === 0) return "ไม่พบไฟล์ซอร์สโค้ดในโปรเจกต์นี้ครับ";

    let combinedCode = "=== [START CODE ANALYSIS COMPLEX] ===\n";
    json.files.forEach(file => {
      combinedCode += `\n[ชื่อไฟล์: ${file.name}.${file.type.toLowerCase()}]\n`;
      combinedCode += file.source + "\n";
      combinedCode += "---------------------------------------\n";
    });
    combinedCode += "=== [END CODE ANALYSIS COMPLEX] ===";
    return combinedCode;
  } catch (e) {
    console.error("getProjectSourceCode Error: " + e.message);
    return `❌ ไม่สามารถอ่านโค้ดของโปรเจกต์ได้เนื่องจาก: ${e.message}`;
  }
}

/**
 * ฟังก์ชันสำหรับเรียกใช้งาน Gemini API
 * @param {string} prompt ข้อความที่ต้องการให้ AI ตอบ
 * @param {string} systemInstruction คำสั่งพื้นฐาน (System Prompt)
 * @param {boolean} isJson ต้องการผลลัพธ์เป็น JSON หรือไม่
 */
function callGemini(prompt, systemInstruction, isJson) {
  try {
    const apiKey = getDynamicConfig("GEMINI_API_KEY_WEB"); // ดึง API Key จาก config
    const model = getDynamicConfig("MODEL_NAME") || "gemini-1.5-flash"; // ใช้ model จาก config
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      "contents": [{
        "parts": [{ "text": systemInstruction + "\n\nUser: " + prompt }]
      }],
      "generationConfig": {
        "responseMimeType": isJson ? "application/json" : "text/plain"
      }
    };

    const options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };

    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    if (result.candidates && result.candidates[0].content.parts[0].text) {
      return result.candidates[0].content.parts[0].text;
    } else {
      console.error("Gemini Error:", result);
      return null;
    }
  } catch (e) {
    console.error("Call Gemini Exception: " + e.message);
    return null;
  }
}

async function callGeminiVision(base64Str, system, mimeType) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getDynamicConfig('MODEL_NAME')}:generateContent?key=${getDynamicConfig('GEMINI_API_KEY')}`;
  const payload = { contents: [{ parts: [{ text: "Extract worker codes." }, { inlineData: { mimeType: mimeType, data: base64Str } }] }], systemInstruction: { parts: [{ text: system }] }, generationConfig: { responseMimeType: "application/json" } };
  
  return withExponentialBackoff(() => {
    const options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };
    const res = UrlFetchApp.fetch(url, options);
    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
      const json = JSON.parse(res.getContentText());
      if (json.candidates && json.candidates[0].content) {
        let text = json.candidates[0].content.parts[0].text;
        return JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
      }
    }
    throw new Error("Gemini Vision request failed");
  });
}

async function processMessageWithAI(message) {
  const prompt = `คุณคือระบบประมวลผลข้อมูล (API) ห้ามอธิบายใดๆ แปลงข้อความเป็น JSON โครงสร้างดังนี้: 
  { "date": "DD/MM/YYYY", "default_site": "ชื่อไซต์", "default_Accom": "ที่พัก", "time_start": "08.00", "time_end": "17.00", "expected_count": 0, "has_ot_noon": false, "ot_noon_in": "", "ot_noon_out": "", "employees": [] } 
  ข้อความ: "${message}"`;
  return await callGemini(message, prompt, true);
}

// ⚠️ [CONSOLIDATED] checkIsAdmin() ถูกลบออก — ใช้ isAdmin() จาก Config.gs แทนเป็นแหล่งเดียว
// ป้องกันลอจิกตรวจสอบ Admin ทำงานไม่สอดคล้องกัน (ตัวนี้ใช้ ADMIN_LINE_ID แต่ตัวหลักใช้ ADMIN_LINE_IDS)

// =================================================================
// 📱 SOURCE HANDLERS (อัปเดตระบบ Hook)
// =================================================================
async function handleLineWebhook(json) {
  let globalReplyToken = null;
  try {
    const event = json.events[0];
    if (!event) return ContentService.createTextOutput("OK");

    const { replyToken, source, message } = event;
    globalReplyToken = replyToken; 
    const userId = source.userId;
    const groupId = source.groupId; // ดึง groupId
    
    // 🛡️ [GUARD CLAUSE]: ตรวจสอบ Group Whitelist
    if (source.type === "group" && !isAllowedGroup(groupId)) {
      logSystemEvent("BLOCKED_GROUP", "LINE_BOT", `Group ID: ${groupId} rejected.`);
      return ContentService.createTextOutput("OK"); // Silent Ignore
    }
    
    const adminId = (typeof getDynamicConfig === 'function' ? getDynamicConfig("ADMIN_LINE_ID") : "") || "";
    const adminList = adminId.split(",").map(id => id.trim());
    
    if (message && message.type === "text") {
      const msg = message.text.trim();

      const isUserAdmin = adminList.includes(userId) || (typeof isAdmin === "function" && isAdmin(userId));
      if (source.type === "user" && !isUserAdmin) {
        if (typeof reply === 'function') reply(replyToken, "⚠️ ขออภัยครับ บอทรับลงรายงานเฉพาะใน 'ไลน์กลุ่ม' เท่านั้นครับ 🙏");
        return ContentService.createTextOutput("OK");
      }

      const cache = CacheService.getScriptCache();
      const pendingClockIn12 = cache.get(`PENDING_CLOCKIN_${userId}`);
      const pendingOTConfirm = cache.get(`PENDING_OT_CONFIRM_${userId}`);
      const pendingOTDetails = cache.get(`PENDING_OT_DETAILS_${userId}`);

      if (msg.startsWith("#") && (pendingClockIn12 || pendingOTConfirm || pendingOTDetails)) {
        cache.removeAll([`PENDING_CLOCKIN_${userId}`, `PENDING_OT_CONFIRM_${userId}`, `PENDING_OT_DETAILS_${userId}`]);
        logSystemEvent("CACHE_CLEARED", "LINE_BOT", `Cleared pending states for: ${userId}`);
      }

      // 🤖 [HOOK]: ลอจิกแชทบอท LINE ทำงานต่อตรงนี้ (Flexible Name Matching)
      const extractedEmployees = extractEmployeesFromText(msg);
      if (extractedEmployees.length > 0) {
        logSystemEvent("NAME_MATCHED", "LINE_BOT", `Found ${extractedEmployees.length} emps from ${userId}`);
        
        // จำลองข้อมูลเบื้องต้น รอการเติมข้อมูลจาก Regex หรือ AI ต่อไป
        const mockInfo = { date: "วันนี้", time: "รอแก้ไข", site: "รอแก้ไข" };
        const replyMsg = formatResponse(extractedEmployees, mockInfo);
        
        if (typeof reply === 'function') reply(replyToken, replyMsg);
      }
    }
    return ContentService.createTextOutput("OK");

  } catch (err) {
    logSystemEvent("LINE_HANDLER_ERROR", "LINE_BOT", err.message);
    if (globalReplyToken && typeof reply === 'function') reply(globalReplyToken, "⚠️ ระบบขัดข้องชั่วคราว (Code: LINE_ERR)");
    return ContentService.createTextOutput("Error");
  }
}