// =================================================================
// 8_WorkflowInteractions.gs (ฟังก์ชันที่ตกหล่น: Flow ปุ่มกด, ตรวจวันที่, AI Fallback)
// =================================================================

async function processMessageWithAIBot(cleanedMsg) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty("GEMINI_API_KEY_LINE");

  if (!apiKey) {
    throw new Error("ไม่พบพารามิเตอร์คีย์ 'GEMINI_API_KEY_LINE' ในการตั้งค่าคุณสมบัติสคริปต์ (Script Properties)");
  }

  // ปรับโมเดลเป็นเวอร์ชันเสถียรและประมวลผลข้อความภาษาไทยได้แม่นยำ
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  // แก้ไขโดยใช้ Backticks (``) เพื่อครอบข้อความพรอมต์ขนาดยาวแบบหลายบรรทัดได้สมบูรณ์
  const systemInstruction = `คุณคือระบบผู้เชี่ยวชาญด้านข้อมูล (Data Extraction Engine) มีหน้าที่แกะและสกัดข้อความรายงานตัวประจำวันของช่างหน้างาน ให้ออกมาเป็นโครงสร้างข้อมูลประเภท JSON วัตถุประสงค์เพื่อนำข้อมูลนี้ไปบันทึกสถิติลงฐานข้อมูลระบบ Sheets อย่างแม่นยำ

จงปฏิบัติตามกฎเหล็กและขั้นตอนการวิเคราะห์ข้อความต่อไปนี้อย่างเคร่งครัด:

1. [ข้อมูลภาพรวม (Header)]
   - ดึงข้อมูลจากบรรทัดแรก: รูปแบบฟอร์แมตคือ วันที่ (DD/MM/YYYY) + ที่พักอาศัยเริ่มต้น + คำว่า "เข้า" + ชื่อไซต์งานหลัก
   - แปลงฟอร์แมตวันที่ให้เป็นมาตรฐาน ค.ศ. 4 หลักเสมอ เช่น หากเจอปี พ.ศ. /69 หรือ /2569 ให้แปลงเป็น /2026 เสมอ
   - สกัด "เวลาเข้างานและเลิกงานปกติ" จากข้อความ เช่น "08.00-17.00" ให้แปลงเครื่องหมายทศนิยมเป็นจุดทศนิยมมาตรฐาน (time_start และ time_end) หากไม่มีระบุ ให้กำหนดค่าเริ่มต้นเป็น time_start: "08.00"

2. [การสแกนและสลับสเตตัสที่พัก (Accommodation Tracking)]
   - ช่างทุกคนจะใช้ "ที่พักอาศัยเริ่มต้น" ที่ระบุในบรรทัดแรก
   - **ข้อยกเว้น:** หากระหว่างบรรทัดรายชื่อ มีข้อความขึ้นต้นด้วยคำว่า "พักหน้างาน" หรือ "พัก" (เช่น พักหน้างานB) ให้เปลี่ยนที่พักของช่างในบรรทัดต่อๆ ไปหลังจากนั้นทั้งหมด ให้เป็นชื่อที่พักใหม่นั้นทันที

3. [การสกัดข้อมูลช่างรายบุคคล (Employees Array)]
   - ค้นหาบรรทัดที่ขึ้นต้นด้วยตัวเลขตามด้วยจุด (เช่น 1., 2., 3.)
   - ใช้เครื่องหมาย Slash (/ ) เป็นตัวแบ่งระหว่าง "ชื่อช่าง" และ "รายละเอียดงวดงาน"
   - **การคลีนชื่อพนักงาน (Name Cleaning):** * แยกชื่อแรก (firstname) และนามสกุล (lastname) ออกจากกันด้วยช่องว่าง
     * ห้ามใส่คำนำหน้าชื่อเด็ดขาด! ให้ลบคำว่า "นาย", "นาง", "น.ส.", "นส.", "Mr.", "Ms." ออกไปจากชื่อแรกเสมอ
   - **การตรวจจับโอทีเที่ยง (OT Noon Validation):**
     * สแกนข้อความในฝั่ง "รายละเอียดงวดงาน" หากมีคำว่า "OT เที่ยง" หรือ "โอทีเที่ยง" ให้ตั้งค่า has_ot_noon เป็น true
     * ดึงช่วงเวลาโอทีเที่ยงออกมา (ถ้ามีระบุ เช่น 12.00-13.00) หากไม่ระบุเวลา ให้ใช้ค่าเริ่มต้นคือ ot_noon_in: "12.00" และ ot_noon_out: "13.00"
     * **สำคัญ:** ให้ลบข้อความ (OT เที่ยง...) ออกจากรายละเอียดงวดงาน เพื่อให้ข้อความงวดงานสะอาด หากลบแล้วข้อความงวดงานว่างเปล่า ให้ใส่คำว่า "ทำงาน" แทน

4. [รูปแบบผลลัพธ์ที่บังคับ (Strict JSON Output)]
   - ห้ามพิมพ์เกริ่นนำ ห้ามพิมพ์อธิบาย ห้ามใส่เครื่องหมายคำพูดครอบนอกโครงสร้าง JSON
   - คืนค่ากลับมาเฉพาะโครงสร้าง JSON ตามรูปแบบพิกัดนี้เท่านั้น:

{
  "date": "ข้อความวันที่ เช่น 20/05/2026",
  "default_site": "ชื่อไซต์งานหลัก",
  "default_Accom": "ชื่อที่พักหลักเริ่มต้น",
  "time_start": "เวลาเข้างานปกติ เช่น 08.00",
  "time_end": "เวลาเลิกงานปกติ เช่น 17.00",
  "employees": [
    {
      "firstname": "ชื่อแรกช่าง (ไม่มีคำนำหน้า)",
      "lastname": "นามสกุลช่าง (ถ้ามี)",
      "task": "รายละเอียดงวดงานที่สะอาดแล้ว",
      "accom": "ที่พักของช่างคนนี้ (ตามเงื่อนไขสลับที่พัก)",
      "has_ot_noon": true,
      "ot_noon_in": "12.00",
      "ot_noon_out": "13.00"
    }
  ]
}`;

  const payload = {
    "contents": [{
      "parts": [{
        "text": `จงสกัดข้อมูลจากข้อความรายงานต่อไปนี้ให้เป็น JSON ตามสั่ง:\n\n${cleanedMsg}`
      }]
    }],
    "systemInstruction": {
      "parts": [{
        "text": systemInstruction
      }]
    },
    "generationConfig": {
      "temperature": 0.1, // ตั้งค่าความเพี้ยนให้ต่ำที่สุด เพื่อเน้นความถูกต้องของข้อมูลพนักงาน
      "responseMimeType": "application/json" // บังคับให้ส่งกลับมาเป็นเนื้อหาประเภท JSON
    }
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const response = UrlFetchApp.fetch(apiUrl, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      throw new Error(`Gemini API ตอบกลับด้วยข้อผิดพลาด รหัสสถานะ: ${responseCode} รายละเอียด: ${responseBody}`);
    }

    const resJson = JSON.parse(responseBody);

    if (!resJson.candidates || resJson.candidates.length === 0) {
      throw new Error("AI สมองกลไม่ได้ส่งคำตอบ (Candidates) กลับมา");
    }

    // ดึงเนื้อหาข้อความ JSON ที่สกัดเสร็จแล้วออกมา
    const aiTextResult = resJson.candidates[0].content.parts[0].text.trim();
    const finalData = JSON.parse(aiTextResult);

    return finalData;

  } catch (error) {
    console.error("เกิดปัญหาในฟังก์ชัน processMessageWithAIBot: " + error.toString());
    throw new Error(`[ระบบสมองกล AI ขัดข้อง] -> ${error.message}`);
  }
}

/**
 * 🛠️ ฟังก์ชันเสริม: ทำความสะอาดข้อความ ปรับแต่งสัญลักษณ์ให้อยู่ในร่องในรอยก่อนส่งให้ระบบแกะข้อมูล
 * (ช่วยซัพพอร์ตระบบที่คุณเขียนดักสิทธิ์ตรวจสอบไว้ใน handleClockInHybrid)
 */
function cleanText(text) {
  if (!text) return "";
  let cleaned = text;

  // แปลงเครื่องหมายขีดกลางเพี้ยนๆ หรือเว้นวรรคแปลกๆ ให้เป็นมาตรฐานเดียวกัน
  cleaned = cleaned.replace(/–/g, "-");
  cleaned = cleaned.replace(/—/g, "-");
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, ""); // ลบตัวอักษรล่องหน (Zero-width spaces)

  return cleaned.trim();
}

/**
 * 2. ฟังก์ชันตรวจสอบการลงเวลาย้อนหลัง
 */
function checkDateLogic(str) {
  if (!str) return { status: "OK" };
  try {
    const p = str.split(/[-/]/);
    let d = parseInt(p[0], 10);
    let m = parseInt(p[1], 10) - 1;
    let y = parseInt(p[2], 10);
    if (y < 100) y += 2000;
    if (y > 2300) y -= 543;

    const inputDate = new Date(y, m, d);
    const today = new Date();
    inputDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diff = (today - inputDate) / 86400000;
    const limit = parseInt(PropertiesService.getScriptProperties().getProperty("BACKDATE_LIMIT_DAYS") || "2");

    if (diff <= 0) return { status: "OK" };
    if (diff <= limit) return { status: "WARNING", msg: `ส่งย้อนหลัง ${diff} วัน` };
    return { status: "BLOCK", msg: `ช้า ${Math.floor(diff)} วัน (ห้ามเกิน ${limit} วัน)` };
  } catch (e) {
    return { status: "OK" }; // หากแปลงวันที่พัง ให้ยอมผ่านไปก่อน
  }
}

/**
 * 3. ฟังก์ชันดึงเป้าหมายไฟล์ (อิงจากฐานข้อมูลหลัก)
 */
function getTargetFileIdByDate(dateStr) {
  return PropertiesService.getScriptProperties().getProperty("EXTERNAL_DATABASE_ID");
}

/**
 * 3. ฟังก์ชันดึงเป้าหมายไฟล์ และแปลงฟอร์แมตวันที่ให้ตรงกับชื่อแท็บชีต (เช่น "17 พฤษภาคม 2569")
 */
/**
 * 3. ฟังก์ชันดึงเป้าหมายไฟล์ และแปลงฟอร์แมตวันที่ให้ตรงกับชื่อแท็บชีต (เช่น "17 พฤษภาคม 2569")
 */
/**
 * 3. ฟังก์ชันดึงเป้าหมายไฟล์ (คืนชีพตรรกะ Array 12 เดือนจากระบบดั้งเดิม)
 */
function getTargetFileIdByDate(dateStr) {
  let mIndex = new Date().getMonth();

  if (dateStr) {
    const cleanDate = String(dateStr).replace("#", "").trim();
    const parts = cleanDate.split(/[\/\-]/);
    if (parts.length >= 2) {
      let parsedMonth = parseInt(parts[1], 10) - 1;
      if (!isNaN(parsedMonth) && parsedMonth >= 0 && parsedMonth <= 11) {
        mIndex = parsedMonth;
      }
    }
  }

  // ลิสต์ ID ไฟล์รายเดือนของแท้ (ตามต้นฉบับ)
  const FILE_IDS = [
    "1gmS6ZYD4xeO2PP7gu15yvApLaKuFa5tPrmDe-PtMOBk", // 01 ม.ค.
    "1Uly9KQFnQ5pQyDn9pHGbgelCmXgDLO4DRM846Vsr7EM", // 02 ก.พ.
    "1wwwbwFyDyoyZOQ_kkfvyrshfpGgi6wCRaPAHU3yXKbE", // 03 มี.ค.
    "1L4cB7dWgkgejhMV84-RuW7LdDNT9vZwm5I06xa9vQEE", // 04 เม.ย.
    "1mc7eMzYDZqsUwKr8FZCEKClQZfqIybf6aZ-2mgkWGHI", // 05 พ.ค.
    "1kX-D_ehfo01rdj3WLLAvDxPO1IEy-XG5GLWe9i1CSo4", // 06 มิ.ย.
    "13GbWmUNrkLcJmo9gAnVSNnD_tH-PFaULH4I2C1DJEFE", // 07 ก.ค.
    "1mHSW_osT7LaXZPyU3KjU4i9801eJSibYyu3iHagK2I8", // 08 ส.ค.
    "1NoNXMDNvMdw5NIfS3QXIi57fCbpqu-iS-6bZQ8dyUBY", // 09 ก.ย.
    "14SDdBPxt-_muIvtHAx06b2Feh97Q-JkpaDvqlyei1ak", // 10 ต.ค.
    "1_DxUo7S7m1FwlPIyjHdetGONwdNwO9Ud54Xtmk4di1c", // 11 พ.ย.
    "1O5_8zTLQWZKuv647H65K-SHVyY3H2fDmwoWtZNUB7ZU"  // 12 ธ.ค.
  ];

  return FILE_IDS[mIndex];
}

function parseThaiDate(dateStr) {
  try {
    if (!dateStr) return "";
    // แยกส่วน วัน เดือน ปี ด้วยตัวคั่นร่วม -, /, .
    const parts = dateStr.split(/[-/.]/);
    if (parts.length < 3) return dateStr;

    let day, monthIdx, year;

    // ✨ ตรรกะอัจฉริยะ: ดักจับและรองรับทั้งฟอร์แมตหน้าเว็บ (YYYY-MM-DD) และฟอร์แมตไลน์บอท (DD/MM/YYYY)
    if (parts[0].length === 4) {
      // เคสมาจากฝั่ง Web App เช่น "2026-05-17"
      year = parseInt(parts[0], 10);
      monthIdx = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10).toString();
    } else {
      // เคสมาจากฝั่ง LINE Bot เช่น "17/5/2026"
      day = parseInt(parts[0], 10).toString();
      monthIdx = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    }

    // จัดการแปลงโครงสร้างเศษปี ค.ศ. ให้กลายเป็น พ.ศ. แบบเสถียรสูง
    if (year < 100) {
      if (year === 26 || year === 69) year = 2569;
      else year += 2000;
    }
    if (year < 2300) {
      year += 543; // แปลง ค.ศ. 2026 ให้กลายเป็น พ.ศ. 2569
    }

    // คลังรายชื่อเดือนภาษาไทยเต็มรูปแบบ
    const thaiMonths = [
      "", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];

    const thaiMonthName = thaiMonths[monthIdx] || parts[1];

    // ประกอบร่างผลลัพธ์กลับไปเป็นชื่อแท็บชีต "17 พฤษภาคม 2569"
    return `${day} ${thaiMonthName} ${year}`;
  } catch (e) {
    return dateStr;
  }
}

/**
 * 4. Flow ปุ่มกด - ตรวจสอบ OT และถามการยืนยัน
 */
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
    dataToProcess.targetFileId = targetFileId;
    CacheService.getScriptCache().put(`PENDING_OT_CONFIRM_${userId}`, JSON.stringify(dataToProcess), 300);
    const questionText = `ตรวจพบว่ามีข้อมูลการทำ OT\n\nโปรดยืนยันว่า... ทำ OT ที่ไซต์งานเดิม และ ลักษณะงานเดิม หรือไม่?`;
    // เรียกใช้งานปุ่มจาก 1_LineBot.gs
    replyWithButtons(token, questionText, ["ทำที่เดิม/งานเดิม", "เปลี่ยนไซต์/เปลี่ยนงาน", "ยกเลิกลงเวลา"]);
  } else {
    finalizeClockInSaving(dataToProcess, userId, token, check, null, targetFileId);
  }
}

/**
 * 5. Flow ปุ่มกด - รับคำตอบจากการยืนยันเวลาเที่ยง/บ่ายโมง
 */
function processPendingClockIn(answer, pendingDataStr, userId, token) {
  const cache = CacheService.getScriptCache();
  try {
    let dataToProcess = JSON.parse(pendingDataStr);
    if (answer === "ลงเวลา 13.00 น.") dataToProcess.time_start = "13.00";
    cache.put(`PENDING_CLOCKIN_${userId}`, "CLEARED", 1);
    checkOTAndProceed(dataToProcess, userId, token, dataToProcess.checkStatus, dataToProcess.targetFileId);
  } catch (e) {
    cache.put(`PENDING_CLOCKIN_${userId}`, "CLEARED", 1);
    emergencyReply(token, "❌ ข้อมูลหมดอายุหรือเกิดข้อผิดพลาด กรุณาส่งรายการลงเวลามาใหม่อีกครั้งครับ");
  }
}

/**
 * 6. Flow บันทึกข้อมูลขั้นสุดท้าย และส่งผลลัพธ์กลับหา LINE
 */
function finalizeClockInSaving(data, userId, token, check, customOt, targetId) {
  const props = PropertiesService.getScriptProperties();
  const isTesting = props.getProperty("IS_TESTING") === "TRUE";
  if (!data || !data.date) { emergencyReply(token, "❌ ข้อมูลสูญหายระหว่างทำรายการ กรุณาส่งข้อมูลเพื่อลงเวลาใหม่อีกครั้งครับ"); return; }
  if (!targetId) targetId = data.targetFileId || getTargetFileIdByDate(data.date);
  if (!targetId) { emergencyReply(token, "❌ ไม่พบลิงก์ไฟล์สำหรับเดือนนี้"); return; }

  // เรียกใช้ฟังก์ชัน Batch จาก 4_CoreDatabase.gs
  const writeRes = writeToDailySheetBatch(data, userId, targetId);

  let customOtSite = null; let customOtTask = null;
  if (customOt && writeRes.count > 0) {
    let parts = customOt.split('/');
    customOtSite = parts[0] ? parts[0].trim() : data.default_site;
    customOtTask = parts[1] ? parts[1].trim() : "ทำ OT";

    try {
      const ss = SpreadsheetApp.openById(targetId);
      const targetSheetName = parseThaiDate(data.date);

      // 🛠️ ค้นหาแท็บแบบทนทานช่องว่างสำหรับบันทึกงวดงาน OT
      let sheet = ss.getSheetByName(targetSheetName);
      if (!sheet) {
        const sheets = ss.getSheets();
        const cleanTarget = targetSheetName.replace(/\s+/g, "");
        for (let i = 0; i < sheets.length; i++) {
          if (sheets[i].getName().replace(/\s+/g, "") === cleanTarget) {
            sheet = sheets[i];
            break;
          }
        }
      }

      if (sheet) {
        const dbData = sheet.getRange(CORE_DB.START_ROW, 4, sheet.getLastRow() - CORE_DB.START_ROW + 1, 2).getValues();
        data.employees.forEach(emp => {
          const inputName = typeof normalize === 'function' ? normalize(emp.firstname) : emp.firstname;
          for (let i = 0; i < dbData.length; i++) {
            const dbName = typeof normalize === 'function' ? normalize(dbData[i][0]) : dbData[i][0];
            if (dbName === inputName) {
              const targetRow = i + CORE_DB.START_ROW;
              sheet.getRange(targetRow, 9).setValue(customOtSite);  // คอลัมน์ OT Site
              sheet.getRange(targetRow, 10).setValue(customOtTask); // คอลัมน์ OT Task
              break;
            }
          }
        });
      }
    } catch (e) { console.error("Custom OT error: " + e.message); }
  }

  let txt = (check && check.status === "WARNING") ? `⚠️ ${check.msg}\n` : "";
  if (writeRes.errors && writeRes.errors.length > 0) txt += `⚠️ หาชื่อไม่พบ: ${writeRes.errors.join(', ')}\n`;
  if (txt !== "" || writeRes.count === 0) {
    if (typeof logErrorToSheet === 'function') logErrorToSheet(targetId, data.original_msg || "-", txt || "บันทึกไม่ได้");
  }

  let timeStatus = "";
  if (!data.time_end || data.time_end === "") {
    timeStatus = `(ลงเวลาเข้า: ${data.time_start})`;
  } else {
    timeStatus = `(เวลา: ${data.time_start}-${data.time_end})`;
  }

  let displaySite = data.default_site;
  if (customOtSite) displaySite += `\n[ไซต์ OT: ${customOtSite} | งาน OT: ${customOtTask}]`;
  const accomText = data.default_Accom || 'ไม่ได้ระบุ';
  const dateToShow = data.date ? `\n📅 วันที่: ${data.date}` : "";
  const statusText = (!writeRes || writeRes.count === 0) ? "❌ ไม่พบข้อมูลที่บันทึกได้" : `✅ บันทึกสำเร็จ ${writeRes.count} คน`;
  const warningFooter = "\n\n📌 โปรดตรวจเช็คความถูกต้อง หากผิดพลาดให้แจ้งแอดมินทันที";
  const testTag = isTesting ? "\n🧪 [โหมดทดสอบ - ข้อมูลจะถูกล้างเมื่อจบ]" : "";

  // ส่งผลกลับไปให้ผู้ใช้
  emergencyReply(token, `${statusText}${dateToShow}\n${timeStatus}\nไซต์: ${displaySite}\n[ที่พัก: ${accomText}]${testTag}${txt ? "\n" + txt : ""}${warningFooter}`);
}

// =================================================================
// 9_ParserHelpers.gs (โมดูลตรรกะ Regex สำหรับแกะข้อความแบบแมนนวล)
// =================================================================

/**
 * ฟังก์ชันแกะโครงสร้างข้อความรายงานตัวแมนนวลด้วย Regular Expression (เสถียรสูง)
 * @param {string} text ข้อความดิบจากไลน์ที่ส่งเข้ามา
 * @return {Object|null} คลังข้อมูล Object พร้อมโครงสร้างบันทึก หรือ null หากรูปแบบไม่ตรง
 */
function parseComplexMessage(text) {
  try {
    // 1. เคลียร์เครื่องหมาย # และช่องว่างส่วนเกินออก แยกข้อมูลเป็นรายบรรทัด
    const cleanText = text.replace(/^#/, "").trim();
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return null;

    // 2. สแกนบรรทัดแรก (หัวข้อหลัก) แยก วันที่ | ที่พัก | ไซต์งาน
    const headerLine = lines[0];
    const headerMatch = headerLine.match(/^(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\s+(.+?)\s+เข้า\s+(.+)$/);
    if (!headerMatch) return null;

    const dateStr = headerMatch[1];
    let currentAccom = headerMatch[2].trim();
    const defaultSite = headerMatch[3].trim();

    let timeStart = "08.00";
    let timeEnd = "";
    let lineIndex = 1;

    // 3. สแกนหาช่วงบรรทัดเวลาทำงาน (เช่น 08.00-17.00)
    for (let i = 1; i < lines.length; i++) {
      let line = lines[i];
      // แปลงสัญลักษณ์ขีดแดชให้เป็นมาตรฐานเดียวกัน
      line = line.replace(/[–—]/g, "-").replace(/\s*([-\u0E16\u0E36\u0E07])\s*/g, "-");

      const hasTimeFormat = /\d{1,2}[.:]\d{2}/.test(line);
      const isListItem = /^\d+\./.test(line);
      const hasDash = line.includes("-");

      if (hasTimeFormat && (!isListItem || hasDash)) {
        const timeMatch = line.match(/(\d{1,2}[.:]\d{2})(?:.*?(\d{1,2}[.:]\d{2}))?/);
        if (timeMatch) {
          timeStart = timeMatch[1].replace(':', '.');
          if (timeMatch[2]) timeEnd = timeMatch[2].replace(':', '.');
          else timeEnd = "";
        }
        lineIndex = i + 1;
        break;
      }
    }

    // 4. วนลูปสแกนรายชื่อช่างและรายละเอียดงวดงานตั้งแต่ไลน์ถัดไป
    let employees = [];

    for (let i = lineIndex; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("***หมายเหตุ***")) break; // ดักจับบรรทัดปิดท้าย (ถ้ามี)

      // ดักจับกรณีมีการเปลี่ยนสลับที่พักหน้างานระหว่างบรรทัด
      if (line.startsWith("พักหน้างาน") || line.startsWith("พัก")) {
        const newAccom = line.replace(/พัก(หน้างาน)?/, "").trim();
        if (newAccom) currentAccom = newAccom;
        continue;
      }

      // ดักจับแพทเทิร์นรายชื่อช่าง ขึ้นต้นด้วย "ตัวเลข. " (เช่น 1.สมชาย / งานฝ้า)
      if (/^\d+\./.test(line)) {
        const parts = line.split('/');
        if (parts.length < 2) continue;

        let rawName = parts[0].replace(/^\d+\./, "").trim();
        let taskStr = parts[1].trim();

        // แยกโครงสร้าง ชื่อ - นามสกุล และล้างคำนำหน้าชื่อช่างออก
        let nameParts = rawName.split(/\s+/);
        const prefixes = ["นาย", "นาง", "น.ส.", "นส.", "ด.ช.", "ด.ญ.", "Mr.", "Ms."];
        let firstName = nameParts[0];
        let lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

        prefixes.forEach(p => { if (firstName.startsWith(p)) firstName = firstName.replace(p, ""); });
        if (["นาย", "นาง", "น.ส.", "นส."].includes(nameParts[0])) {
          firstName = nameParts[1];
          lastName = nameParts.length > 2 ? nameParts[2] : "";
        }

        // ตรวจสอบโครงสร้างคำว่า "OT เที่ยง" หรือ "โอทีเที่ยง" ในช่องรายละเอียดงาน
        let hasOtNoon = false;
        let otNoonIn = "12.00";
        let otNoonOut = "13.00";
        const otRegex = /\(?\s*(OT|โอที)\s*เที่ยง\s*(?:(\d{1,2}[.:]\d{2})\s*[-ถึง]\s*(\d{1,2}[.:]\d{2}))?\s*\)?/i;
        const matchOT = taskStr.match(otRegex);

        if (matchOT) {
          hasOtNoon = true;
          if (matchOT[2] && matchOT[3]) {
            otNoonIn = matchOT[2].replace(':', '.');
            otNoonOut = matchOT[3].replace(':', '.');
          }
          // คลีนข้อความช่องงานให้สะอาด ตัดคำว่า OTเที่ยง ออกไปไม่ให้รกชีต
          taskStr = taskStr.replace(matchOT[0], "").replace(/^[\/\-\s]+|[\/\-\s]+$/g, "").trim();
          if (taskStr === "") taskStr = "ทำงาน";
        }

        // บันทึกเข้าสู่อาเรย์พนักงานเพื่อเตรียม Batch ไปเขียนลงชีต
        employees.push({
          "firstname": firstName,
          "lastname": lastName,
          "task": taskStr,
          "accom": currentAccom,
          "has_ot_noon": hasOtNoon,
          "ot_noon_in": otNoonIn,
          "ot_noon_out": otNoonOut
        });
      }
    }

    if (employees.length === 0) return null;

    return {
      "date": dateStr,
      "default_site": defaultSite,
      "default_Accom": currentAccom,
      "time_start": timeStart,
      "time_end": timeEnd,
      "employees": employees
    };

  } catch (e) {
    return null;
  }
}