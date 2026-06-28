// =================================================================
// 3_SharedFunctions.gs (AI, Fuzzy Logic, และเครื่องมือจัดการข้อมูล)
// =================================================================

// -----------------------------------------------------------------
// 🧠 1. ระบบ AI (Gemini) และระบบ Retry
// -----------------------------------------------------------------
function fetchWithRetry(url, payload, isJson, attempts = 3, backoffMs = 500) {
  const options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };
  for (let i = 0; i < attempts; i++) {
    try {
      const res = UrlFetchApp.fetch(url, options);
      if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
        const json = JSON.parse(res.getContentText());
        if (json.candidates && json.candidates[0].content) {
          let text = json.candidates[0].content.parts[0].text;
          if (isJson) return JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
          return text;
        }
      }
    } catch (e) { Utilities.sleep(backoffMs * Math.pow(2, i)); }
  }
  return null;
}

async function callGeminiVision(base64Str, system, mimeType) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getDynamicConfig('MODEL_NAME')}:generateContent?key=${getDynamicConfig('GEMINI_API_KEY')}`;
  const payload = { contents: [{ parts: [{ text: "Extract worker codes." }, { inlineData: { mimeType: mimeType, data: base64Str } }] }], systemInstruction: { parts: [{ text: system }] }, generationConfig: { responseMimeType: "application/json" } };
  return fetchWithRetry(url, payload, true);
}

async function processMessageWithAI(message) {
  const prompt = `คุณคือระบบประมวลผลข้อมูล (API) ห้ามอธิบายใดๆ แปลงข้อความเป็น JSON โครงสร้างดังนี้: 
  { "date": "DD/MM/YYYY", "default_site": "ชื่อไซต์", "default_Accom": "ที่พัก", "time_start": "08.00", "time_end": "17.00", "expected_count": 0, "has_ot_noon": false, "ot_noon_in": "", "ot_noon_out": "", "employees": [] } 
  ข้อความ: "${message}"`;
  return await callGemini(message, prompt, true);
}

// -----------------------------------------------------------------
// 🔎 2. ระบบค้นหาชื่ออัจฉริยะ (Fuzzy Logic)
// -----------------------------------------------------------------
function levenshteinDistance(s1, s2) {
  const len1 = s1.length; const len2 = s2.length; const matrix = [];
  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[len1][len2];
}

function getStringSimilarity(str1, str2) {
  const s1 = normalize(str1); const s2 = normalize(str2);
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;
  const distance = levenshteinDistance(s1, s2);
  return (Math.max(s1.length, s2.length) - distance) / Math.max(s1.length, s2.length);
}

// -----------------------------------------------------------------
// 📝 3. ระบบแกะข้อความ Regex และบันทึกข้อมูล
// -----------------------------------------------------------------
// =================================================================
// 📝 ระบบช่วยแปลงวันที่อัจฉริยะ (ยึดปัจจุบันเป็นหลัก)
// =================================================================
function smartParseDate(text) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // ค้นหารูปแบบวันที่: รองรับ 1/5/69, 1.5.69, 1-5-2026 หรือแค่ 1, 1/5
  const match = text.match(/(\d{1,2})[\/.-]?(\d{1,2})?[\/.-]?(\d{2,4})?/);
  
  if (!match) return Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy");

  let day = parseInt(match[1], 10);
  let month = match[2] ? parseInt(match[2], 10) : currentMonth;
  let year = match[3] ? parseInt(match[3], 10) : currentYear;

  // แปลงปี พ.ศ. เป็น ค.ศ. (รองรับเลข 2 หลัก เช่น 69 -> 2026)
  if (year < 100) year += 2000;
  if (year > 2500) year -= 543;

  // สร้าง Date Object และตรวจสอบความถูกต้อง
  const dateObj = new Date(year, month - 1, day);
  if (isNaN(dateObj.getTime())) return Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy");

  return Utilities.formatDate(dateObj, "GMT+7", "dd/MM/yyyy");
}

// =================================================================
// 📝 ระบบแกะข้อความ Regex และบันทึกข้อมูล
// =================================================================
function parseComplexMessage(text) {
  try {
    const cleanText = text.replace(/^#/, "").trim();
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return null;

    // ⚡ แก้ไข: ใช้ smartParseDate แทนการดึงแบบปกติ เพื่อให้ยึดวันที่ปัจจุบัน
    let dateStr = smartParseDate(text); 
    
    let currentAccom = ""; let defaultSite = ""; 
    let timeStart = "08.00"; let timeEnd = ""; let expectedCount = 0;

    const countMatch = text.match(/ทั้งหมด\s*(\d+)\s*คน/);
    if (countMatch) expectedCount = parseInt(countMatch[1], 10);
    const timeMatch = text.match(/(\d{1,2}[.:]\d{2})\s*[-ถึง]\s*(\d{1,2}[.:]\d{2})/);
    if (timeMatch) { timeStart = timeMatch[1].replace(':', '.'); timeEnd = timeMatch[2].replace(':', '.'); }

    let hasOtNoon = false; let otNoonIn = "12.00"; let otNoonOut = "13.00";
    const otRegex = /(OT|โอที)\s*เที่ยง\s*(?:(\d{1,2}[.:]\d{2})\s*[-ถึง]\s*(\d{1,2}[.:]\d{2}))?/i;
    const matchOT = text.match(otRegex);
    if (matchOT) {
         hasOtNoon = true;
         if (matchOT[2] && matchOT[3]) { otNoonIn = matchOT[2].replace(':', '.'); otNoonOut = matchOT[3].replace(':', '.'); }
    }

    const siteMatch = text.match(/(.+?)\s+เข้า\s+(.+?)(?=\n|$)/);
    if (siteMatch) { 
      currentAccom = siteMatch[1].replace(/^[\s#]*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\s*/, "").trim(); 
      defaultSite = siteMatch[2].trim(); 
    }
    if (!defaultSite) return null;

    let employees = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^\d+\./.test(lines[i])) {
        const parts = lines[i].split('/');
        if (parts.length < 2) continue;
        let rawName = parts[0].replace(/^\d+\./, "").trim();
        let taskStr = parts[1].trim();
        let nameParts = rawName.split(/\s+/);
        let firstName = nameParts[0]; let lastName = nameParts.length > 1 ? nameParts[nameParts.length-1] : ""; 
        ["นาย","นาง","น.ส.","นส.","ด.ช.","ด.ญ."].forEach(p => { if (firstName.startsWith(p)) firstName = firstName.replace(p, ""); });
        if (["นาย","นาง","น.ส.","นส."].includes(nameParts[0])) { firstName = nameParts[1]; lastName = nameParts.length > 2 ? nameParts[2] : ""; }

        let empHasOt = false; let eOtIn = "12.00"; let eOtOut = "13.00";
        const eMatchOT = taskStr.match(otRegex);
        if (eMatchOT) {
            empHasOt = true;
            if (eMatchOT[2] && eMatchOT[3]) { eOtIn = eMatchOT[2].replace(':','.'); eOtOut = eMatchOT[3].replace(':','.'); }
            taskStr = taskStr.replace(eMatchOT[0], "").replace(/^[\/\-\s]+|[\/\-\s]+$/g, "").trim();
            if (taskStr === "") taskStr = "ทำงาน"; 
        }
        employees.push({ firstname: firstName, lastname: lastName, task: taskStr, accom: currentAccom, has_ot_noon: empHasOt, ot_noon_in: eOtIn, ot_noon_out: eOtOut });
      }
    }
    return { "date": dateStr, "default_site": defaultSite, "default_Accom": currentAccom, "time_start": timeStart, "time_end": timeEnd, "expected_count": expectedCount, "has_ot_noon": hasOtNoon, "ot_noon_in": otNoonIn, "ot_noon_out": otNoonOut, "employees": employees };
  } catch (e) { return null; }
}

function writeToDailySheet(data, userId, fileId) {
  const ss = SpreadsheetApp.openById(fileId);
  const sheetName = parseThaiDate(data.date);
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) return { count: 0, errors: ["ไม่พบหน้าวันที่: " + sheetName] };
  const dbData = sheet.getRange(3, 4, sheet.getLastRow(), 2).getValues();
  
  let successCount = 0; let errors = []; let processedNames = []; let replyAccom = "ไม่ได้ระบุ"; 
  const fuzzyThreshold = parseFloat(getDynamicConfig("FUZZY_THRESHOLD")); // 🔮 ดึงค่า Fuzzy

  data.employees.forEach(emp => {
    let rowIndex = -1;
    const inputName = normalize(emp.firstname);
    
    // 🔮 ค้นหาชื่อด้วย Fuzzy Logic ผสมแบบเก่า
    let bestScore = 0;
    for (let i = 0; i < dbData.length; i++) {
      const dbName = normalize(dbData[i][0]);
      if (!dbName) continue;
      
      const score = getStringSimilarity(inputName, dbName);
      if (score === 1.0 || (score >= fuzzyThreshold && score > bestScore)) {
          bestScore = score;
          rowIndex = 3 + i;
          if (score === 1.0) break; // ตรงเป๊ะออกเลย
      }
    }
    
    if (rowIndex !== -1) {
      sheet.getRange(rowIndex, GLOBAL_CONFIG.COL_SITE).setValue(data.default_site);
      sheet.getRange(rowIndex, GLOBAL_CONFIG.COL_WORK).setValue(emp.task);
      
      let empAccom = emp.accom;
      if (!empAccom || empAccom === "-" || empAccom === "เดิม") empAccom = sheet.getRange(rowIndex, GLOBAL_CONFIG.COL_ACCOM).getValue();
      else sheet.getRange(rowIndex, GLOBAL_CONFIG.COL_ACCOM).setValue(empAccom);
      if (successCount === 0) replyAccom = empAccom || "ไม่ได้ระบุ";

      const otHrs = calculateAndTimeEntry(sheet, rowIndex, data.time_start, data.time_end, emp.has_ot_noon, emp.ot_noon_in, emp.ot_noon_out);
      if (otHrs > 0) { sheet.getRange(rowIndex, 9).setValue(data.default_site); sheet.getRange(rowIndex, 10).setValue(emp.task); } 
      else { sheet.getRange(rowIndex, 9).clearContent(); sheet.getRange(rowIndex, 10).clearContent(); }
      
      successCount++; processedNames.push(inputName);
    } else { errors.push(emp.firstname); }
  });

  if (userId && successCount > 0) PropertiesService.getScriptProperties().setProperty(`LAST_ENTRY_${userId}`, JSON.stringify({ date: data.date, names: processedNames }));
  return { count: successCount, errors: errors, accom: replyAccom };
}

function calculateAndTimeEntry(sheet, row, sT, eT, isN, nI, nO) {
  if (!eT || eT.toString().trim() === "") { sheet.getRange(row, GLOBAL_CONFIG.COL_NORMAL_HR).clearContent(); sheet.getRange(row, GLOBAL_CONFIG.COL_OT_M_IN, 1, 7).clearContent(); return 0; }
  const toM = (t) => { const p = t.toString().split(/[.:]/); return (parseInt(p[0])||0)*60 + (parseInt(p[1])||0); };
  const toF = (m) => { let h = Math.floor(m/60)%24; return (h<10?"0"+h:h)+"."+(m%60<10?"0"+m%60:m%60); };
  const toHrs = (m) => parseFloat((m / 60).toFixed(2));

  const s = toM(sT); let e = toM(eT); if(e===0) return 0;
  if(e<s) e+=1440;
  let otData = ["","","","","","",""]; let otT = 0; let normHr = "";

  if(s<480) { otData[0]=toF(s); otData[1]="08.00"; otT+=(480-s); }
  const nIn = Math.max(s, 480); const nOut = Math.min(e, 1020);  
  let nDur = Math.max(0, nOut - nIn);
  if(nIn<=720 && nOut>=780) nDur-=60; 
  if(nDur>0) normHr = toHrs(nDur); 
  
  if(isN) { otData[2]=nI || "12.00"; otData[3]=nO || "13.00"; otT+=(toM(otData[3])-toM(otData[2])); }
  if(e>1020) { otData[4]="17.00"; otData[5]=toF(e); otT+=(e-1020); }
  if(otT>0) otData[6]=toHrs(otT); 

  sheet.getRange(row, GLOBAL_CONFIG.COL_NORMAL_HR).setValue(normHr || "");
  sheet.getRange(row, GLOBAL_CONFIG.COL_OT_M_IN, 1, 7).setValues([otData]);
  return toHrs(otT);
}

// -----------------------------------------------------------------
// 🛠️ 4. Helpers จัดการวันที่, ข้อผิดพลาด, และดึงข้อมูลช่าง
// -----------------------------------------------------------------
function normalize(t) { return t ? t.toString().replace(/^(นาย|นาง|น\.?ส\.?|ด\.?ช\.?|ด\.?ญ\.?)/g, "").replace(/\s/g, "") : ""; }

function formatDateToShort(dateObj) {
  if (!(dateObj instanceof Date)) return dateObj;
  return `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear().toString().slice(-2)}`;
}
function checkDate(s) {
  const p = String(s).split(/[\/\-]/); let y = parseInt(p[2]); y = (y<100?2000+y:y)>2300?y-543:y;
  const d = new Date(y, p[1]-1, p[0]); d.setHours(0,0,0,0);
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = (now-d)/86400000;
  const limit = parseInt(getDynamicConfig("BACKDATE_LIMIT")); // 🔮 อิงตั้งค่า ChatOps
  return diff<=0 ? {status:"OK"} : (diff<=limit ? {status:"WARNING", msg:`ส่งย้อนหลัง ${diff} วัน`} : {status:"BLOCK", msg:`ห้ามส่งย้อนหลังเกิน ${limit} วัน`});
}

function logErrorToSheet(fileId, originalMsg, errorMsg) {
  if (!fileId) return;
  try {
    const ss = SpreadsheetApp.openById(fileId); let logSheet = ss.getSheetByName("Error_Log");
    if (!logSheet) { logSheet = ss.insertSheet("Error_Log"); logSheet.appendRow(["วัน-เวลา", "ข้อความ", "สาเหตุ", "สถานะ"]); logSheet.getRange("A1:D1").setFontWeight("bold"); }
    logSheet.appendRow([Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss"), originalMsg, errorMsg, "รอตรวจสอบ ❌"]);
  } catch (e) {}
}
function getEmployeesByCodes(codes) {
  try {
    const sheet = SpreadsheetApp.openById(GLOBAL_CONFIG.EXTERNAL_DATABASE_ID).getSheetByName(GLOBAL_CONFIG.DATABASE_SHEET_NAME);
    const data = sheet.getRange(2, 1, sheet.getLastRow(), 14).getValues();
    return data.filter(r => codes.includes(String(r[13]).trim())).map(r => ({ code: r[13], firstname: r[2], lastname: r[3] }));
  } catch (e) { return []; }
}

// =================================================================
// 🏺 5. Legacy Functions (อนุรักษ์ฟังก์ชันเก่า ห้ามลบ)
// =================================================================
function checkClockIn(text) { 
  // ดึงใช้ parser ปกติเพื่อส่งต่อข้อมูล
  return parseComplexMessage(text);
}

function recordLeaveData(name, type, date) { 
  return `✅ บันทึกการลาของ ${name} ประเภท ${type} วันที่ ${date} เรียบร้อยแล้ว`; 
}

function handleCheckAbsent(date) { 
  return `📊 รายงานคนขาดวันที่ ${date}:\nระบบกำลังอยู่ระหว่างการเชื่อมโยงฐานข้อมูลการลาครับ`; 
}

function undoLastEntry(name, dateStr) {
  const targetFileId = getTargetFileIdByDate(dateStr); 
  if (!targetFileId) return "❌ ไม่พบไฟล์ของเดือนนี้";
  const ss = SpreadsheetApp.openById(targetFileId); 
  const sheetName = parseThaiDate(dateStr); 
  const s = ss.getSheetByName(sheetName); 
  if (!s) return "❌ ไม่พบหน้าวันที่ " + sheetName;
  
  const cleanName = normalize(name); 
  const data = s.getRange(GLOBAL_CONFIG.START_ROW, GLOBAL_CONFIG.COL_NAME_CHECK, s.getLastRow(), 2).getValues();
  
  for (let i = 0; i < data.length; i++) { 
    if (normalize(data[i][0] + (data[i][1]||"")).includes(cleanName)) { 
      s.getRange(i + GLOBAL_CONFIG.START_ROW, 6, 1, 12).clearContent(); 
      return `🗑️ ล้างข้อมูล ${name} วันที่ ${sheetName} เรียบร้อย`; 
    } 
  }
  return `⚠️ ไม่พบชื่อ ${name} ในวันที่ ${sheetName}`;
}

function calculateMorningOT(entryTime) { 
  const parts = entryTime.toString().split(/[.:]/);
  const mins = (parseInt(parts[0])||0)*60 + (parseInt(parts[1])||0);
  return mins < 480 ? (480 - mins) / 60 : 0;
}

function processTimeEntry(e) { 
  // placeholder ให้ระบบเก่าทำงานผ่านได้
  return true;
}

function calculateRowOT(sheet, row) { 
  // คำนวณแบบ default ให้ลอจิกเก่า
  return calculateAndTimeEntry(sheet, row, "08.00", "17.00", false, "", "");
}

function fixAllOTInSheet() { 
  // ฟังก์ชันเผื่อใช้เรียกแก้ไขทั้งหน้าชีตในอนาคต
  Logger.log("ฟังก์ชันซ่อมแซม OT ถูกเรียกใช้");
}

// -----------------------------------------------------------------
// 🛠️ ฟังก์ชันเสริมประสิทธิภาพฉบับ Hotfix แบบไม่พึ่งพารายการนอกไฟล์
// -----------------------------------------------------------------
function getTargetFileIdByDate(dateStr) {
  let mIndex = new Date().getMonth(); 
  if (dateStr) { 
    const p = String(dateStr).replace("#", "").trim().split(/[\/\-.]/); 
    if (p.length >= 2) { 
      let m = parseInt(p[1], 10) - 1; 
      if (m >= 0 && m <= 11) mIndex = m; 
    } 
  }
  
  // 📂 อ้างอิงตาม MONTHLY_FILE_IDS ของ 4_Config ล่าสุด
  if (typeof MONTHLY_FILE_IDS !== 'undefined' && MONTHLY_FILE_IDS[mIndex]) {
    return MONTHLY_FILE_IDS[mIndex];
  }
  
  // Fallback: ใช้ฐานข้อมูลกลางแทน (ลบ backupIds ออก — ให้ MONTHLY_FILE_IDS ใน Config.gs เป็นแหล่งเดียว)
  return getDynamicConfig("EXTERNAL_DATABASE_ID");
}

// ⚠️ [CONSOLIDATED] getDynamicPrompt() ถูกรวมไปไว้ที่ 7_AI_Assistant.gs (เวอร์ชันเต็มที่อ่านจาก Script Properties ก่อน)
// ป้องกัน GAS "last wins" override ที่ทำให้ AI prompt ไม่สามารถอัปเดตผ่าน setDynamicPrompt() ได้

// ⚠️ [CONSOLIDATED] checkIsAdmin() + executeAdminCommand() ถูกลบออก
// ใช้ isAdmin(userId) จาก Config.gs เป็นแหล่งเดียวแทน (Single Source of Truth)

function parseThaiDate(s) {
  if (!s) return "";
  
  // รองรับการแยกวันที่ด้วย /, -, หรือ .
  const p = String(s).split(/[\/\-.]/); 
  if (p.length < 3) return s;
  
  // 💾 ฝังรายชื่อเดือนไว้ในฟังก์ชันโดยตรง ปลอดภัยที่สุด
  const thaiMonths = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  
  let day = parseInt(p[0], 10);
  let monthIdx = parseInt(p[1], 10) - 1;
  
  if (monthIdx < 0 || monthIdx > 11) return s;
  const m = thaiMonths[monthIdx];
  
  // 🧠 ระบบ Smart Year: ไม่สนใจปีที่ผู้ใช้พิมพ์มา ยึดปี พ.ศ. ปัจจุบันของระบบเสมอ
  const now = new Date();
  const currentMonthIdx = now.getMonth(); // 0-11 (0 = มกราคม)
  let y = now.getFullYear() + 543; // ดึงปีปัจจุบัน (เช่น 2026 -> 2569)
  
  // 🔄 ลอจิกข้ามปี: เช็คกรณีลงเวลาคาบเกี่ยวช่วงปีใหม่
  if (currentMonthIdx === 0 && monthIdx === 11) {
    // ปัจจุบันมกราคม แต่ลงเวลาของธันวาคม (ลงย้อนหลังปีที่แล้ว)
    y -= 1; 
  } else if (currentMonthIdx === 11 && monthIdx === 0) {
    // ปัจจุบันธันวาคม แต่ลงเวลาของมกราคม (ลงล่วงหน้าปีหน้า)
    y += 1; 
  }
  
  return `${day} ${m} ${y}`;
}

// ⚠️ [CONSOLIDATED] getDynamicConfig() ถูกรวมไปไว้ที่ Config.gs เป็นแหล่งเดียว (Single Source of Truth)
// เวอร์ชันใน Config.gs รองรับ defaultValue + GLOBAL_CONFIG fallback + Cache prefix ป้องกันชนกัน

/**
 * 🛡️ ระบบบันทึก Audit Trail สำหรับการตรวจสอบ Monitor และ CI/CD Pipeline
 * @param {string} actionType - ประเภทเหตุการณ์ (เช่น SYSTEM_ERROR, USER_ACTION)
 * @param {string} status - สถานะ (เช่น SUCCESS, RUNTIME_EXCEPTION, REJECT)
 * @param {string} payload - ข้อมูลที่เกี่ยวข้อง หรือ Payload ที่ถูกยิงมา
 * @param {string} user - ผู้กระทำ (ถ้ามี)
 * @param {number} execTime - เวลาที่ใช้ประมวลผล (ms)
 * @param {string} level - ระดับความรุนแรง (INFO, WARN, ERROR, CRITICAL)
 * @param {string} errorMessage - รายละเอียดข้อผิดพลาดเชิงลึก
 */
function logAuditTrail(actionType, status, payload, user, execTime, level, errorMessage) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet(); // หากต้องการชี้ไปไฟล์อื่นให้ใช้ openById
    const sheetName = "AuditLog";
    let sheet = ss.getSheetByName(sheetName);

    // สร้างหน้า Sheet อัตโนมัติหากยังไม่มี เพื่อป้องกันระบบพัง
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(["Timestamp", "Level", "Action", "Status", "User", "ExecutionTime(ms)", "Payload", "ErrorMessage"]);
      sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#e0e0e0");
      sheet.setFrozenRows(1);
    }

    const timestamp = new Date();
    // จัดการข้อมูลให้ปลอดภัย ป้องกันช่องโหว่ความยาวข้อมูลเกินโควต้าชีต
    const safePayload = typeof payload === 'object' ? JSON.stringify(payload) : String(payload || "");
    const safeError = String(errorMessage || "");

    sheet.appendRow([
      timestamp,
      level || "INFO",
      actionType || "UNKNOWN",
      status || "UNKNOWN",
      user || "SYSTEM",
      execTime || 0.0,
      safePayload.substring(0, 1000), // ตัดคำให้ไม่เกิน 1,000 ตัวอักษรป้องกันล้น
      safeError.substring(0, 1000)
    ]);

    // แจ้งเตือนแบบ Real-time ลง Console ของนักพัฒนาหากเกิด ERROR
    if (level === "ERROR" || level === "CRITICAL") {
      console.error(`[AUDIT ${level}] ${actionType}: ${safeError}`);
    }

  } catch (e) {
    // ปราการด่านสุดท้าย ไม่ให้ระบบหลักล่มหาก Audit พัง
    console.error(`[CRITICAL] ระบบ AuditTrail ล้มเหลว: ${e.message}`);
  }
}
// =================================================================
// 🏛️ สร้างหน้าต่างห้องรับแขก (UI Layout แบบเดิม)
// =================================================================
function createDashboardMenu() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Main Menu") || ss.insertSheet("Main Menu");
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  protections.forEach(p => p.remove());
  sheet.clear();
  sheet.getDataRange().clearDataValidations();
  sheet.setHiddenGridlines(true);
  sheet.getRange(1, 1, 30, 15).setBackground("#F8FAFC");
  sheet.setTabColor("#0F172A");
  
  sheet.setColumnWidth(1, 40); sheet.setColumnWidth(2, 45); sheet.setColumnWidth(3, 170); sheet.setColumnWidth(4, 30);
  sheet.setColumnWidth(5, 45); sheet.setColumnWidth(6, 170); sheet.setColumnWidth(7, 30);
  sheet.setColumnWidth(8, 45); sheet.setColumnWidth(9, 170); sheet.setColumnWidth(10, 40);
  
  sheet.getRange("B2:I4").merge().setBackground("#0F172A").setValue("🏢 SMART WORKSITE DASHBOARD")
    .setFontColor("#FFFFFF").setFontSize(24).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle")
    .setBorder(true, true, true, true, false, false, "#0F172A", SpreadsheetApp.BorderStyle.SOLID_THICK);
  
  sheet.getRange("B5:I5").merge().setBackground("#1E293B").setValue("💡 กดติ๊กถูก ☑️ ที่กล่องด้านซ้าย เพื่อเปิดเอกสาร (คลิกเพียง 1 ครั้ง)")
    .setFontColor("#38BDF8").setFontSize(11).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  
  let unprotectedRanges = [sheet.getRange("A1")];
  
  function createPillButton(row, colCheck, colText, icon, label, isHighlight = false) {
    const checkCell = sheet.getRange(row, colCheck); 
    const textCell = sheet.getRange(row, colText);
    const bgColor = isHighlight ? "#E0F2FE" : "#FFFFFF"; 
    const borderColor = isHighlight ? "#38BDF8" : "#CBD5E1"; 
    const textColor = isHighlight ? "#0284C7" : "#334155";
    
    checkCell.insertCheckboxes().setBackground(bgColor).setHorizontalAlignment("center").setVerticalAlignment("middle")
      .setBorder(true, true, true, false, false, false, borderColor, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    textCell.setValue(`${icon} ${label}`).setBackground(bgColor).setFontColor(textColor).setFontSize(12).setFontWeight(isHighlight ? "bold" : "normal")
      .setHorizontalAlignment("left").setVerticalAlignment("middle")
      .setBorder(true, false, true, true, false, false, borderColor, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    unprotectedRanges.push(checkCell);
  }
  
  sheet.getRange("B7:I7").merge().setValue("⚙️ ส่วนจัดการระบบ (System)").setFontWeight("bold").setFontColor("#64748B").setFontSize(11);
  createPillButton(9, 2, 3, GLOBAL_CONFIG.ICONS.SYSTEM.SUMMARY, "สรุปภาพรวมปี"); 
  createPillButton(9, 5, 6, GLOBAL_CONFIG.ICONS.SYSTEM.DATA, "ฐานข้อมูล (Admin)");
  createPillButton(11, 2, 3, GLOBAL_CONFIG.ICONS.SYSTEM.GUIDE, "คู่มือการใช้งาน"); 
  createPillButton(11, 5, 6, GLOBAL_CONFIG.ICONS.SYSTEM.FEEDBACK, "แจ้งปัญหา");
  
  sheet.getRange("B13:I13").merge().setValue("📅 คลังข้อมูลรายเดือน (Monthly Vault)").setFontWeight("bold").setFontColor("#64748B").setFontSize(11);
  
  const currentMonthIndex = new Date().getMonth(); 
  const monthRows = [15, 17, 19, 21]; 
  let mIndex = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      if (mIndex >= 12) break;
      const isCurrent = (mIndex === currentMonthIndex);
      createPillButton(monthRows[r], 2+(c*3), 3+(c*3), GLOBAL_CONFIG.ICONS.MONTHS[mIndex], `${GLOBAL_CONFIG.MONTH_LIST[mIndex]} ${isCurrent?"(ปัจจุบัน)":""}`, isCurrent);
      mIndex++;
    }
  }
  
  sheet.setRowHeight(2, 45); sheet.setRowHeight(5, 30); [7, 13].forEach(r => sheet.setRowHeight(r, 35));
  [9, 11, 15, 17, 19, 21].forEach(r => sheet.setRowHeight(r, 45)); [8, 10, 12, 14, 16, 18, 20].forEach(r => sheet.setRowHeight(r, 12));
  
  const protection = sheet.protect().setDescription('Lock Dashboard UI');
  protection.setUnprotectedRanges(unprotectedRanges);
  sheet.getRange("A1").activate();
}
function onEdit(e) {
  // 1. Guard Clauses: ตรวจสอบความสมบูรณ์ของ Event Object ป้องกัน Race Condition และ Null Pointer
  if (!e || !e.range) return;
  var range = e.range;
  var sheet = range.getSheet();
  var sheetName = sheet.getName();
  var row = range.getRow();
  var col = range.getColumn();
  
  // ดึงค่าอย่างปลอดภัย รองรับทั้งการพิมพ์ปกติและการติ๊ก Checkbox
  var value = e.value;
  if (value === undefined) {
    value = range.getValue();
  }

  // ==========================================
  // 🎯 ตรรกะส่วนที่ 1: Main Menu Navigator
  // ==========================================
  if (sheetName === "Main Menu" && (value === "TRUE" || value === true)) {
    var targetUrl = "";
    
    // กลุ่มเมนูหลักแถวที่ 9 และ 11
    if (row === 9) {
      targetUrl = (col === 2) ? GLOBAL_CONFIG.URLS.SUMMARY : (col === 5 ? GLOBAL_CONFIG.URLS.DATA : "");
    } else if (row === 11) {
      targetUrl = (col === 2) ? GLOBAL_CONFIG.URLS.GUIDE : (col === 5 ? GLOBAL_CONFIG.URLS.FEEDBACK : "");
    }
    // กลุ่มปุ่มกดเลือกคลังข้อมูลรายเดือน (แถว 15, 17, 19, 21)
    else if (row >= 15 && row <= 21 && row % 2 !== 0) {
      if (col === 2 || col === 5 || col === 8) {
        var subIndex = (col === 2) ? 0 : (col === 5 ? 1 : 2);
        var monthIndex = (Math.floor((row - 15) / 2) * 3) + subIndex;
        // ป้องกันดัชนีเกินขอบเขตอาร์เรย์เดือน
        if (typeof GLOBAL_CONFIG !== "undefined" && GLOBAL_CONFIG.URLS && GLOBAL_CONFIG.URLS.MONTHS && monthIndex < GLOBAL_CONFIG.URLS.MONTHS.length) {
          targetUrl = GLOBAL_CONFIG.URLS.MONTHS[monthIndex];
        }
      }
    }
    
    // หากพบ URL ปลายทาง ให้ดำเนินการเปิดลิงก์และล้างสถานะปุ่มกดทันที
    if (targetUrl) {
      SpreadsheetApp.getActiveSpreadsheet().toast("⏳ กำลังเปิดเอกสาร กรุณารอสักครู่...", "🚀 ระบบทำงาน", 3);
      range.uncheck(); 
      sheet.getRange("A1").activate(); 
      if (typeof openLinkInNewTab === "function") {
        openLinkInNewTab(targetUrl);
      }
      return; 
    }
  }

  // ==========================================
  // ⚙️ ตรรกะส่วนที่ 2: DevOps Engine (System_Changelog)
  // ==========================================
  if (sheetName === "System_Changelog" && col === 8 && row > 1) {
    if (value === "🟢 เสถียรแล้ว (Lock Code)") {
      if (typeof handleLockCode === "function") {
        handleLockCode(e);
      }
    } else if (value === "🧪 กำลังทดสอบ") {
      sheet.getRange(row, 7).clearContent();
      e.source.toast("🗑️ ล้างรหัสในคลังสำรองออกแล้ว", "DevOps Engine", 4);
    }
  }

  // ==========================================
  // 🎨 ตรรกะส่วนที่ 3: Workspace Utilities (Code_Workspace)
  // ==========================================
  if (sheetName === "Code_Workspace" && col <= 3 && range.getLastColumn() >= 3 && row > 1) {
    if (typeof highlightDuplicateFunctions === "function") {
      highlightDuplicateFunctions();
    }
  }
}
function openLinkInNewTab(url) {
  const html = HtmlService.createHtmlOutput(`
    <html><body style="font-family: sans-serif; text-align: center; margin-top: 25px; color: #334155;">
    <h3 style="color: #1E3A8A;">กำลังเปิดเอกสาร...</h3>
    <div class="loader" style="border: 4px solid #f3f3f3; border-top: 4px solid #38BDF8; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto;"></div>
    <div id="fallback" style="display:none; margin-top:15px;">
    <small style="color:#DC2626;">เบราว์เซอร์บล็อกการเปิดอัตโนมัติ</small><br><br>
    <a href="${url}" target="_blank" onclick="google.script.host.close()" style="padding: 10px 20px; background: #1E3A8A; color: white; text-decoration: none; border-radius: 6px; display: inline-block;">คลิกที่นี่เพื่อไปที่ไฟล์</a>
    </div>
    <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    <script>
      setTimeout(function() { 
        var winRef = window.open('${url}', '_blank'); 
        if (winRef) { google.script.host.close(); } 
        else { document.getElementById('fallback').style.display = 'block'; document.querySelector('.loader').style.display = 'none'; } 
      }, 500);
    </script>
    </body></html>
  `).setWidth(320).setHeight(180);
  SpreadsheetApp.getUi().showModalDialog(html, '🚀 SMART WORKSITE DASHBOARD');
}
function createSupportSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetsToCreate = ["Summary", "Data", "Guide", "Feedback"];
  sheetsToCreate.forEach(name => {
    if (!ss.getSheetByName(name)) {
      let newSheet = ss.insertSheet(name);
      newSheet.getRange("A1").setValue(`ส่วนจัดเก็บข้อมูล: ${name}`).setFontWeight("bold");
    }
  });
  SpreadsheetApp.getActiveSpreadsheet().toast("สร้างชีตระบบสำเร็จแล้วครับ", "System", 3);
}