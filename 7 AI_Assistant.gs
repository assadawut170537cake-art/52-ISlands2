// =================================================================
// 7_AIAssistant.gs (AI Assistant Subsystem, Dynamic Logic & DevOps)
// =================================================================

/**
 * 1. ฟังก์ชันประมวลผลคำสั่งผ่านการแชท (เวอร์ชันยกระดับความปลอดภัยและเสถียรภาพ)
 * ตอบสนองต่อการพิมพ์ข้อความทั่วไปที่ไม่ใช่แบบฟอร์มลงเวลาตายตัว
 */
function processUserChat(prompt, userId, replyToken) {
  try {
    var props = PropertiesService.getScriptProperties();
    var adminIds = (props.getProperty('ADMIN_LINE_IDS') || props.getProperty('ADMIN_LINE_ID') || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var isAdmin = userId && adminIds.indexOf(userId) !== -1;

    // ทางลัดด่วน: คำสั่งกู้คืนระบบของแอดมิน (ไม่ต้องส่งไปถาม AI)
    if (prompt.trim() === "กู้คืนระบบ" || prompt.toLowerCase() === "rollback") {
      var rollbackResult = rollbackLogic(userId, 1);
      return { success: rollbackResult.success, text: rollbackResult.success ? rollbackResult.message : rollbackResult.error };
    }

    var validNames = typeof getValidNamesForAI === "function" ? getValidNamesForAI() : "";
    var currentLogic = getCurrentLogic();

    // เรียกใช้ Dynamic Prompt ที่เตรียมไว้ หรือใช้ Default
    var systemInstruction = typeof getDynamicPrompt === "function" 
      ? getDynamicPrompt('BOT') 
      : `คุณคือ AI ผู้ช่วยประจำระบบ Smart Worksite System\n
         รายชื่อพนักงานในระบบปัจจุบัน: ${validNames}\n
         ตรรกะควบคุมระบบปัจจุบัน: ${JSON.stringify(currentLogic)}\n\n
         หน้าที่และวิธีการตอบกลับ:\n
         1. แนะนำการใช้งาน (Guide): หากผู้ใช้ถามวิธีใช้แอป ให้ตอบอธิบายสั้น กระชับ สุภาพ สไตล์พี่สอนน้อง เป็นข้อๆ\n
         2. บันทึกงาน (Natural Language Input): หากผู้ใช้สั่งงานด้วยภาษาทั่วไป ให้แปลงเป็นโครงสร้าง JSON นี้เท่านั้น:\n
            {"type":"SAVE", "payload": {"date":"YYYY-MM-DD", "default_site":"ชื่อไซต์", "time_start":"08.00", "time_end":"17.00", "employees":[{"firstname":"ชื่อพนักงาน","task":"ลักษณะงาน"}]}}\n
            *กฎล็อกย้อนหลัง:* ตรรกะปัจจุบันยอมให้บันทึกย้อนหลังได้ ${currentLogic.backdate_limit} วัน (สถานะผู้ใช้ปัจจุบันคือ Admin: ${isAdmin})\n
         3. อัปเดตตรรกะระบบ: หากแอดมินสั่งปรับเปลี่ยนกฎเกณฑ์ ให้ตอบกลับเป็น JSON นี้เท่านั้น:\n
            {"type":"UPDATE_LOGIC", "new_logic": {"backdate_limit": 3}} \n
            *กฎเหล็ก:* จำกัดสิทธิ์เฉพาะ Admin เท่านั้น\n\n
         สรุปใจความสำคัญไว้บรรทัดแรกเสมอ ใช้ภาษาสุภาพ เป็นกันเอง`;

    if (typeof callGemini !== "function") return { success: false, text: "⚠️ ไม่พบตัวซิงค์เชื่อมต่อโมเดลสารพัดประโยชน์ (callGemini)" };
    
    // เรียกใช้งาน AI
    var aiRawText = callGemini(prompt, systemInstruction, false, false);
    if (!aiRawText) return { success: false, text: "⚠️ ไม่สามารถติดต่อสมอง AI ได้ในขณะนี้ครับ" };

    // คลีนนิ่งโครงสร้าง Markdown Block
    var cleanJsonStr = aiRawText.replace(new RegExp("\\x60\\x60\\x60(?:json)?", "gi"), "").replace(new RegExp("\\x60\\x60\\x60", "g"), "").trim();
    var data;
    try {
      data = JSON.parse(cleanJsonStr);
    } catch(e) {
      // หากไม่ใช่ JSON แปลว่า AI ตอบกลับมาเป็นข้อความปกติ
      return { success: true, text: aiRawText };
    }

    // --- แยกเส้นทางการทำงานตามคำสั่งที่ AI วิเคราะห์ได้ ---
    if (data.type === "SAVE") {
      var today = new Date(); today.setHours(0,0,0,0);
      var entryDate = new Date(data.payload.date); entryDate.setHours(0,0,0,0);
      var diffDays = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
      var allowedDays = currentLogic.backdate_limit;
      
      if (diffDays > allowedDays && !isAdmin) {
        logAuditTrail(userId, "SAVE_DENIED", prompt, JSON.stringify(data.payload), 0.0, "REJECT", "Gating blocked via Chat input branch");
        return { success: false, text: `❌ ไม่สามารถลงข้อมูลย้อนหลังเกิน ${ allowedDays } วันได้ครับ(จำกัดสิทธิ์เฉพาะ Admin)` };
      }
      
      // ส่งต่อให้กระบวนการหลักจัดการ
    if (typeof handleClockInHybrid === "function") {
      handleClockInHybrid(prompt, userId, replyToken, data.payload);
      }else {
        throw new Error("ระบบไม่พร้อมทำงาน (ขาดฟังก์ชัน handleClockIn)");
      }
      return { success: true, text: null }; 
    }

    if (data.type === "UPDATE_LOGIC") {
      if (!isAdmin) return { success: false, text: "🔒 ขออภัยครับ สิทธิ์การเปลี่ยนกฎระบบจำกัดเฉพาะ Admin ครับ" };
      var updateResult = updateLogic(JSON.stringify(data.new_logic), "Admin", "อัปเดตระบบผ่านแชท");
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
    logAuditTrail(updatedBy, "MUTATE_LOGIC", "Update Execution Line", JSON.stringify(mergedLogic), 1.0, "CLEAR", note);

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
    var props = PropertiesService.getScriptProperties();
    var adminIds = (props.getProperty('ADMIN_LINE_IDS') || props.getProperty('ADMIN_LINE_ID') || "").split(",").map(function(s) { return s.trim(); }).filter(Boolean);
    if (!userId || adminIds.indexOf(userId) === -1) return { success: false, error: "🔒 จำกัดสิทธิ์เฉพาะ Admin เท่านั้นครับ" };

    var history = props.getProperty('DYNAMIC_SYSTEM_LOGIC_HISTORY');
    history = history ? JSON.parse(history) : [];

    if (history.length < step) return { success: false, error: "❌ ไม่พบประวัติการแก้ไขย้อนหลังในหน่วยเก็บความจำระบบ" };

    var rollbackItem = history[step - 1];
    var currentLogic = getCurrentLogic();
    
    addLogicHistory(currentLogic, "Admin", "rollback", "บันทึกค่าก่อนย้อนระบบกลับ " + step + " ขั้น");
    props.setProperty('DYNAMIC_SYSTEM_LOGIC', JSON.stringify(rollbackItem.logic));
    logAuditTrail(userId, "ROLLBACK_EXEC", "Rollback Triggered Step: " + step, JSON.stringify(rollbackItem.logic), 1.0, "CLEAR", "Success");

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

function logAuditTrail(userId, actionType, inputRaw, machineStructured, confidence, userAction, executionMessage) {
  try {
    var dbId = PropertiesService.getScriptProperties().getProperty("EXTERNAL_DATABASE_ID");
    if (!dbId) return;
    var ss = typeof getCachedSpreadsheet === 'function' ? getCachedSpreadsheet(dbId) : SpreadsheetApp.openById(dbId);
    var sheet = ss.getSheetByName("Audit_Log") || ss.insertSheet("Audit_Log");
    
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["วัน-เวลา", "LINE User ID", "ประเภทเหตุการณ์", "ข้อความอินพุตดิบ", "โครงสร้างข้อมูลระดับเครื่อง", "คะแนนความมั่นใจ", "การดำเนินการของยูสเซอร์", "บันทึกข้อความจากเซิร์ฟเวอร์"]);
      sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#cfe2ff").setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    }
    
    sheet.appendRow([
      Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm:ss"),
      userId || "SYSTEM",
      actionType,
      inputRaw || "",
      machineStructured || "",
      confidence || 0.0,
      userAction || "",
      executionMessage || ""
    ]);
  } catch (err) {
    console.error("Critical Failure in Log Audit Trail Pipeline: " + err.message);
  }
}

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
// =================================================================
// system_control.gs (ฟังก์ชันกลางสำหรับ LINE Bot และ Web App ปรับเปลี่ยนค่าระบบ)
// =================================================================

/**
 * 1. ฟังก์ชันปรับเกณฑ์คะแนนความแม่นยำ (Fuzzy Threshold)
 * มีการทำ Validation Logic ป้องกันตัวเลขรวน
 */
function updateSystemThreshold(newThreshold, updatedBy) {
  const score = parseFloat(newThreshold);
  
  // Validation Logic: เกณฑ์คะแนนต้องอยู่ระหว่าง 0.50 ถึง 0.95 เท่านั้น
  if (isNaN(score) || score < 0.50 || score > 0.95) {
    return { success: false, message: "⚠️ ปรับไม่สำเร็จ: เกณฑ์คะแนนต้องเป็นตัวเลขระหว่าง 0.50 ถึง 0.95 ครับ" };
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperty("FUZZY_MATCH_THRESHOLD", score.toFixed(2));

  // หากมีฟังก์ชันบันทึกประวัติการแก้ไขระบบย้อนหลัง (เหมือนใน AI_Assistant.js ของพี่) สามารถบันทึกได้ตรงนี้
  if (typeof addLogicHistory === 'function') {
    addLogicHistory({ DYNAMIC_THRESHOLD: score }, updatedBy, "update_threshold", `ปรับเกณฑ์ความแม่นยำเป็น ${score * 100}%`);
  }

  return { success: true, message: `⚙️ ปรับเกณฑ์ความแม่นยำเป็น ${(score * 100).toFixed(0)}% เรียบร้อยโดยคุณ ${updatedBy} ครับ` };
}

/**
 * 2. ฟังก์ชันเพิ่ม/ลด คำศัพท์ในคลังข้อมูลหลัก (Reference Words)
 * อ้างอิงจากฐานข้อมูล Google Sheets หน้า "DATA" (คอลัมน์ C ไซท์งานที่ทำ)
 */
function manageReferenceWord(action, word, updatedBy) {
  if (!word || word.trim() === "") return { success: false, message: "⚠️ กรุณาระบุคำหลักที่ต้องการจัดการครับ" };
  
  try {
    const targetWord = word.trim();
    const ssId = PropertiesService.getScriptProperties().getProperty("EXTERNAL_DATABASE_ID");
    if (!ssId) return { success: false, message: "❌ ไม่พบ KEY ฐานข้อมูลกลาง (EXTERNAL_DATABASE_ID)" };
    
    const ss = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheetByName("DATA");
    if (!sheet) return { success: false, message: "❌ ไม่พบหน้าชีตชื่อ 'DATA' ในระบบ" };

    // คอลัมน์ C (ดึงรายการไซต์งานเดิมมาตรวจสอบ)
    const lastRow = sheet.getLastRow();
    const range = sheet.getRange(2, 3, lastRow > 1 ? lastRow - 1 : 1, 1);
    const values = range.getValues().map(r => r[0].toString().trim());

    if (action === "add") {
      // ตรวจสอบคำซ้ำก่อนเพิ่ม (Validation)
      if (values.includes(targetWord)) {
        return { success: false, message: `⚠️ คำว่า "${targetWord}" มีอยู่ในคลังไซต์งานเดิมอยู่แล้วครับ` };
      }
      sheet.appendRow(["", "", targetWord]); // คอลัมน์ C คือตำแหน่งที่ 3 (เว้น A, B ไว้ตามโครงสร้างชีต DATA ของพี่)
      return { success: true, message: `✅ เพิ่มคำหลัก "${targetWord}" ลงในฐานข้อมูลไซต์งานเรียบร้อยครับ` };
    } 
    
    if (action === "delete") {
      const index = values.indexOf(targetWord);
      if (index === -1) {
        return { success: false, message: `⚠️ ไม่พบคำหลัก "${targetWord}" ในคลังฐานข้อมูลครับ` };
      }
      // ลบแถวที่พบคำนั้นออก (บวก 2 เพราะเริ่มเก็บที่แถว 2)
      sheet.deleteRow(index + 2);
      return { success: true, message: `🗑️ ลบคำหลัก "${targetWord}" ออกจากฐานข้อมูลเรียบร้อยครับ` };
    }

    return { success: false, message: "⚠️ คำสั่งไม่ถูกต้อง (รองรับเฉพาะ add หรือ delete)" };
  } catch (e) {
    return { success: false, message: `❌ เกิดข้อผิดพลาดทางเทคนิค: ${e.message}` };
  }
}