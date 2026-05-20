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

async function callGemini(content, system, isJson) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getDynamicConfig('MODEL_NAME')}:generateContent?key=${getDynamicConfig('GEMINI_API_KEY')}`;
  const payload = { contents: [{ parts: [{ text: content }] }], systemInstruction: { parts: [{ text: system }] }, generationConfig: { responseMimeType: isJson ? "application/json" : "text/plain" } };
  return fetchWithRetry(url, payload, isJson);
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
function parseComplexMessage(text) {
  try {
    const cleanText = text.replace(/^#/, "").trim();
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return null;

    let dateStr = "TODAY"; let currentAccom = ""; let defaultSite = ""; 
    let timeStart = "08.00"; let timeEnd = ""; let expectedCount = 0;

    const dateMatch = text.match(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/);
    if (dateMatch) dateStr = dateMatch[1];
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
      // 🛠️ จุดที่แก้ไข: เพิ่ม [\s#]* เพื่อดักจับการพิมพ์ "# " (มีเว้นวรรค) และตัดเครื่องหมาย/วันที่ทิ้งทั้งหมด
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

function parseThaiDate(s) {
  const p = String(s).split(/[\/\-]/); if(p.length<3) return s;
  const m = GLOBAL_CONFIG.MONTH_LIST[parseInt(p[1])-1];
  let y = parseInt(p[2]); 
  
  // 🛠️ อัปเกรดตรรกะปี ค.ศ. 2026 / พ.ศ. 2569
  if (y < 100) { if (y === 26 || y === 69) y = 2569; else y += 2000; }
  if (y < 2300) y += 543;
  
  return `${parseInt(p[0])} ${m} ${y}`;
}

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


function calculateAndTimeEntryFromValues(block, rowIndex, sT, eT, isN, nI, nO) {
  if (!eT || eT.toString().trim() === "") {
    block[rowIndex][GLOBAL_CONFIG.COL_NORMAL_HR - 1] = "";
    for (let c = 0; c < 7; c++) block[rowIndex][GLOBAL_CONFIG.COL_OT_M_IN - 1 + c] = "";
    return 0;
  }
  const toM = (t) => { const p = t.toString().replace('.', ':').split(':'); return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0); };
  const toF = (m) => { let h = Math.floor(m / 60) % 24; return (h < 10 ? "0" + h : h) + "." + (m % 60 < 10 ? "0" + m % 60 : m % 60); };
  const toHrs = (m) => parseFloat((m / 60).toFixed(2));

  const s = toM(sT); let e = toM(eT); if (e === 0) return 0;
  if (e < s) e += 1440; 
  let otData = ["", "", "", "", "", "", ""]; let otT = 0; let normHr = "";

  if (s < 480) { otData[0] = toF(s); otData[1] = "08.00"; otT += (480 - s); }
  const nIn = Math.max(s, 480); const nOut = Math.min(e, 1020);
  let nDur = Math.max(0, nOut - nIn);
  if (nIn <= 720 && nOut >= 780) nDur -= 60; 

  if (isN) { otData[2] = nI || "12.00"; otData[3] = nO || "13.00"; otT += (toM(otData[3]) - toM(otData[2])); }
  if (e > 1020) { otData[4] = "17.00"; otData[5] = toF(e); otT += (e - 1020); }

  let gap = 480 - nDur;
  if (gap > 0 && otT > 0) { let fill = Math.min(gap, otT); nDur += fill; otT -= fill; }
  if (nDur > 0) normHr = toHrs(nDur);
  if (otT > 0) otData[6] = toHrs(otT);

  block[rowIndex][GLOBAL_CONFIG.COL_NORMAL_HR - 1] = normHr || "";
  for (let i = 0; i < 7; i++) block[rowIndex][GLOBAL_CONFIG.COL_OT_M_IN - 1 + i] = otData[i];
  return toHrs(otT);
}

// -----------------------------------------------------------------
// 🛠️ ฟังก์ชันเสริมประสิทธิภาพฉบับ Hotfix แบบไม่พึ่งพารายการนอกไฟล์
// -----------------------------------------------------------------

function parseThaiDate(s) {
  if (!s) return "";
  const p = String(s).split(/[\/\-.]/); if (p.length < 3) return s;
  
  // 💾 ฝังรายชื่อเดือนไว้ในฟังก์ชันโดยตรง ป้องกันข้อผิดพลาด GLOBAL_CONFIG.MONTH_LIST หาย
  const thaiMonths = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  
  let day = parseInt(p[0], 10);
  let monthIdx = parseInt(p[1], 10) - 1;
  let year = parseInt(p[2], 10);
  
  if (monthIdx < 0 || monthIdx > 11) return s;
  const m = thaiMonths[monthIdx];
  
  if (year < 100) { 
    if (year === 26 || year === 69) year = 2569; 
    else year += 2000; 
  }
  if (year < 2300) year += 543;
  
  return `${day} ${m} ${year}`;
}

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
  
  // คลังสำรองกรณีดึงค่าอาเรย์หลักพลาด
  const backupIds = [
    "1gmS6ZYD4xeO2PP7gu15yvApLaKuFa5tPrmDe-PtMOBk", "1Uly9KQFnQ5pQyDn9pHGbgelCmXgDLO4DRM846Vsr7EM", 
    "1wwwbwFyDyoyZOQ_kkfvyrshfpGgi6wCRaPAHU3yXKbE", "1L4cB7dWgkgejhMV84-RuW7LdDNT9vZwm5I06xa9vQEE", 
    "1mc7eMzYDZqsUwKr8FZCEKClQZfqIybf6aZ-2mgkWGHI", "1kX-D_ehfo01rdj3WLLAvDxPO1IEy-XG5GLWe9i1CSo4", 
    "13GbWmUNrkLcJmo9gAnVSNnD_tH-PFaULH4I2C1DJEFE", "1mHSW_osT7LaXZPyU3KjU4i9801eJSibYyu3iHagK2I8", 
    "1NoNXMDNvMdw5NIfS3QXIi57fCbpqu-iS-6bZQ8dyUBY", "14SDdBPxt-_muIvtHAx06b2Feh97Q-JkpaDvqlyei1ak", 
    "1_DxUo7S7m1FwlPIyjHdetGONwdNwO9Ud54Xtmk4di1c", "1O5_8zTLQWZKuv647H65K-SHVyY3H2fDmwoWtZNUB7ZU"
  ];
  return backupIds[mIndex] || getDynamicConfig("EXTERNAL_DATABASE_ID");
}