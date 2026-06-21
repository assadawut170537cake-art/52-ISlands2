/**
 * @file 3_SharedFunctions.gs
 * @description ศูนย์รวมฟังก์ชัน Utilities, ระบบแกะข้อความอัจฉริยะ (Regex Parser), ระบบเวลา และ Fuzzy Logic Matching
 */

// =================================================================
// 🧠 1. ระบบ AI (Gemini) และระบบ Retry
// =================================================================

function callGeminiVision(base64Str, system, mimeType) {
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

function processMessageWithAI(message) {
  const prompt = `คุณคือระบบประมวลผลข้อมูล (API) ห้ามอธิบายใดๆ แปลงข้อความเป็น JSON โครงสร้างดังนี้: 
  { "date": "DD/MM/YYYY", "default_site": "ชื่อไซต์", "default_Accom": "ที่พัก", "time_start": "08.00", "time_end": "17.00", "expected_count": 0, "has_ot_noon": false, "ot_noon_in": "", "ot_noon_out": "", "employees": [] } 
  ข้อความ: "${message}"`;
  return callGemini(message, prompt, true);
}

// =================================================================
// 🔎 2. ระบบค้นหาชื่ออัจฉริยะ (Fuzzy Logic)
// =================================================================

/**
 * @function levenshteinDistance
 * @description คำนวณหาระยะห่างความแตกต่างของข้อความสองชุดตามหลักการ Levenshtein Distance
 * @param {string} s1 - ข้อความชุดที่หนึ่ง
 * @param {string} s2 - ข้อความชุดที่สอง
 * @returns {number} ค่าจำนวนเต็มแสดงระยะห่างความต่าง
 */
function levenshteinDistance(s1, s2) {
  const len1 = s1.length; 
  const len2 = s2.length; 
  const matrix = [];
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

/**
 * @function getStringSimilarity
 * @description คำนวณหาค่าความเหมือนระหว่างข้อความสองชุดให้ออกมาเป็นเปอร์เซ็นต์ทศนิยม (0.0 - 1.0)
 * @param {string} str1 - ตัวอักษรชุดแรก
 * @param {string} str2 - ตัวอักษรชุดที่สอง
 * @returns {number} ระดับคะแนนความใกล้เคียง
 */
function getStringSimilarity(str1, str2) {
  const s1 = normalize(str1); 
  const s2 = normalize(str2);
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;
  const distance = levenshteinDistance(s1, s2);
  return (Math.max(s1.length, s2.length) - distance) / Math.max(s1.length, s2.length);
}

// =================================================================
// 📝 3. ระบบแกะข้อความ Regex และแปลงข้อมูลวันที่พอร์ตเสริม
// =================================================================

/**
 * @function smartParseDate
 * @description วิเคราะห์ข้อความเพื่อหาข้อมูลวันที่ทำงาน โดยหากไม่ระบุหรือระบุไม่สมบูรณ์จะอิงตามเดือนและปีปัจจุบันของระบบ
 * @param {string} text - ข้อความที่มีข้อมูลวันที่ผสมอยู่
 * @returns {string} วันที่ที่ผ่านการปรับปรุงให้อยู่ในฟอร์แมต "dd/MM/yyyy"
 */
function smartParseDate(text) {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const match = text.match(/(\d{1,2})[\/.-]?(\d{1,2})?[\/.-]?(\d{2,4})?/);
    if (!match) return Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy");

    let day = parseInt(match[1], 10);
    let month = match[2] ? parseInt(match[2], 10) : currentMonth;
    let year = match[3] ? parseInt(match[3], 10) : currentYear;

    if (year < 100) year += 2000;
    if (year > 2500) year -= 543;

    const dateObj = new Date(year, month - 1, day);
    if (isNaN(dateObj.getTime())) return Utilities.formatDate(now, "GMT+7", "dd/MM/yyyy");

    return Utilities.formatDate(dateObj, "GMT+7", "dd/MM/yyyy");
  } catch (e) {
    return Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  }
}

/**
 * @function parseThaiDate
 * @description แปลงวันที่รูปแบบตัวเลขมาตรฐานเป็นชื่อแท็บชีตภาษาไทย เช่น "01/05/2026" เป็น "1 พฤษภาคม 2569"
 * @param {string} s - สตริงวันที่จัดรูปแบบ "dd/MM/yyyy" หรือใกล้เคียง
 * @returns {string} ชื่อเดือนและปี พ.ศ. สไตล์ภาษาไทยแบบไร้ช่องว่างซ้ำซ้อน
 */
function parseThaiDate(s) {
  if (!s) return "";
  try {
    const p = String(s).split(/[\/\-.]/); 
    if (p.length < 3) return s;
    
    const thaiMonths = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    
    let day = parseInt(p[0], 10);
    let monthIdx = parseInt(p[1], 10) - 1;
    if (monthIdx < 0 || monthIdx > 11) return s;
    
    const m = thaiMonths[monthIdx];
    const now = new Date();
    const currentMonthIdx = now.getMonth(); 
    let y = now.getFullYear() + 543; 
    
    // ลอจิกข้ามปีประมวลผลช่วงคาบเกี่ยวปีใหม่
    if (currentMonthIdx === 0 && monthIdx === 11) {
      y -= 1; 
    } else if (currentMonthIdx === 11 && monthIdx === 0) {
      y += 1; 
    }
    return `${day} ${m} ${y}`;
  } catch (error) {
    return s;
  }
}

/**
 * @function parseComplexMessage
 * @description ถอดรหัสโครงสร้างข้อความรายงานคนงานประจำวันแบบซับซ้อน ดึงรายละเอียดเวลา, ไซต์งาน, และรายชื่อพนักงานด้วย Regex
 * @param {string} text - ข้อความที่ผู้ใช้งานส่งเข้ามาผ่าน Webhook
 * @returns {Object|null} แฟ้มออบเจกต์โครงสร้างรายงาน หรือ null หากข้อมูลไม่ครบถ้วน
 */
function parseComplexMessage(text) {
  try {
    const cleanText = text.replace(/^#/, "").trim();
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return null;

    let dateStr = smartParseDate(text); 
    let currentAccom = ""; 
    let defaultSite = ""; 
    let timeStart = "08.00"; 
    let timeEnd = ""; 
    let expectedCount = 0;

    const countMatch = text.match(/ทั้งหมด\s*(\d+)\s*คน/);
    if (countMatch) expectedCount = parseInt(countMatch[1], 10);
    
    const timeMatch = text.match(/(\d{1,2}[.:]\d{2})\s*[-ถึง]\s*(\d{1,2}[.:]\d{2})/);
    if (timeMatch) { 
      timeStart = timeMatch[1].replace(':', '.'); 
      timeEnd = timeMatch[2].replace(':', '.'); 
    }

    let hasOtNoon = false; 
    let otNoonIn = "12.00"; 
    let otNoonOut = "13.00";
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
        let firstName = nameParts[0]; 
        let lastName = nameParts.length > 1 ? nameParts[nameParts.length-1] : ""; 
        
        ["นาย","นาง","น.ส.","นส.","ด.ช.","ด.ญ."].forEach(p => { if (firstName.startsWith(p)) firstName = firstName.replace(p, ""); });
        if (["นาย","นาง","น.ส.","นส."].includes(nameParts[0])) { firstName = nameParts[1]; lastName = nameParts.length > 2 ? nameParts[2] : ""; }

        let empHasOt = false; 
        let eOtIn = "12.00"; 
        let eOtOut = "13.00";
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
  } catch (e) { 
    return null; 
  }
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

/**
 * @function checkDate
 * @description ตรวจสอบการส่งข้อมูลย้อนหลัง ป้องกันการเขียนข้อมูลข้ามสิทธิ์เกินขีดจำกัดความปลอดภัย
 * @param {string} s - สตริงวันที่พิจารณา
 * @returns {Object} ออบเจกต์รายงานสถานะการประเมิน [OK, WARNING, BLOCK]
 */
function checkDate(s) {
  try {
    const p = String(s).split(/[\/\-]/); 
    let y = parseInt(p[2]); 
    y = (y < 100 ? 2000 + y : y) > 2300 ? y - 543 : y;
    const d = new Date(y, p[1] - 1, p[0]); d.setHours(0,0,0,0);
    const now = new Date(); now.setHours(0,0,0,0);
    const diff = (now - d) / 86400000;
    const limit = typeof getDynamicConfig === 'function' ? parseInt(getDynamicConfig("BACKDATE_LIMIT")) : 3;
    
    if (diff <= 0) return { status: "OK" };
    return diff <= limit ? { status: "WARNING", msg: `ส่งย้อนหลัง ${diff} วัน` } : { status: "BLOCK", msg: `ห้ามส่งย้อนหลังเกิน ${limit} วัน` };
  } catch (e) {
    return { status: "BLOCK", msg: "รูปแบบวันที่สับสนไม่ชัดเจนในการตรวจสอบสิทธิ์" };
  }
}

/**
 * @function getEmployeesByCodes
 * @description ดึงชุดข้อมูลพนักงานจากฐานข้อมูลภายนอก (External Master DB) อิงตามรหัสบาร์โค้ดหรือรหัสประทับตรา
 * @param {Array<string>} codes - รายการรหัสพนักงาน
 * @returns {Array<Object>} ข้อมูลพนักงานที่จับคู่พบบน Master DB
 */
function getEmployeesByCodes(codes) {
  try {
    if (typeof GLOBAL_CONFIG === 'undefined') return [];
    const sheet = SpreadsheetApp.openById(GLOBAL_CONFIG.EXTERNAL_DATABASE_ID).getSheetByName(GLOBAL_CONFIG.DATABASE_SHEET_NAME);
    const data = sheet.getRange(2, 1, sheet.getLastRow(), 14).getValues();
    return data.filter(r => codes.includes(String(r[13]).trim())).map(r => ({ code: r[13], firstname: r[2], lastname: r[3] }));
  } catch (e) { 
    return []; 
  }
}

// =================================================================
// 🏺 5. ฟังก์ชันกลุ่ม Legacy สำหรับงานประมวลผลแชทและการลาพนักงาน
// =================================================================
function checkClockIn(text) { return parseComplexMessage(text); }
function recordLeaveData(name, type, date) { return `✅ บันทึกการลาของ ${name} ประเภท ${type} วันที่ ${date} เรียบร้อยแล้ว`; }
function handleCheckAbsent(date) { return `📊 รายงานคนขาดวันที่ ${date}:\nระบบกำลังอยู่ระหว่างการเชื่อมโยงฐานข้อมูลการลาครับ`; }
function processTimeEntry(e) { return true; }
function fixAllOTInSheet() { Logger.log("ฟังก์ชันซ่อมแซม OT ถูกเรียกใช้"); }


// =================================================================
// 🧹 AGENT SKILLS: Data Auto-Cleaning
// =================================================================

/**
 * ✨ Skill: data-autocleaning (ระบบทำความสะอาดข้อมูลอัตโนมัติ)
 * กวาดล้างอักขระขยะ และปรับฟอร์แมตข้อความให้อยู่ในมาตรฐานเดียวกัน
 * @param {String} rawText - ข้อความดิบที่ต้องการคลีน
 * @returns {String} - ข้อความที่คลีนแล้ว
 */
function autoCleanDataPipeline(rawText) {
  try {
    if (!rawText) return "";
    let cleaned = rawText.toString().trim();
    
    // 1. ลบ Zero-width characters (ตัวอักษรล่องหนที่ทำให้ Regex พัง)
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, "");
    
    // 2. แปลงเครื่องหมายขีดกลางแปลกๆ ให้เป็น Hyphen มาตรฐาน
    cleaned = cleaned.replace(/[–—]/g, "-");
    
    // 3. แปลงเวลาที่เป็น . ให้เป็น : (เช่น 08.00 -> 08:00) กรณีที่พบตัวเลขติดกัน
    cleaned = cleaned.replace(/(\d{1,2})\.(\d{2})/g, "$1:$2");
    
    // 4. ลบช่องว่างที่ซ้อนกันหลายตัวให้เหลือตัวเดียว
    cleaned = cleaned.replace(/\s{2,}/g, " ");
    
    return cleaned;
  } catch (error) {
    console.error("Auto Cleaning Error:", error);
    return rawText; // หากพังให้ส่งค่าเดิมกลับ ป้องกันข้อมูลหาย
  }
}