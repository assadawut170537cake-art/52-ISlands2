
function handleWebAppGateway(payload) {
  // รองรับทั้งแบบ action/data และแบบ type/payload
  const action = payload.action || payload.type;
  const data = payload.data || payload.payload;
  
  try {
    switch (action) {
      case "GET_DASHBOARD_SUMMARY":
        return ContentService.createTextOutput(
          JSON.stringify({ status: "OK", data: getDashboardSummary() })
        ).setMimeType(ContentService.MimeType.JSON);

      case "SAVE_CONFIG":
        if (!data || !data.key || !data.value) throw new Error("Missing key/value");
        setDynamicConfig(data.key, data.value);
        return ContentService.createTextOutput(
          JSON.stringify({ status: "OK", message: `Saved: ${data.key} = ${data.value}` })
        ).setMimeType(ContentService.MimeType.JSON);

      case "PROCESS_NLP_TIMELOG":
        if (!data || !data.text) throw new Error("Missing text");
        const nlpResult = processNlpTimelogFromWeb(data.text);
        return ContentService.createTextOutput(
          JSON.stringify({ status: "OK", data: nlpResult })
        ).setMimeType(ContentService.MimeType.JSON);

      case "SAVE":
      case "SAVE_WORK":
        // บันทึกลงตารางประจำวัน
        if (!data || !data.date || !data.employees) throw new Error("Missing data for SAVE");
        const targetId = getTargetFileIdByDate(data.date);
        if (!targetId) throw new Error("ไม่พบไฟล์สำหรับเดือนนี้");
        // WebApp requests default to system admin or user email if tracked
        const writeRes = typeof writeToDailySheetBatch === 'function'
            ? writeToDailySheetBatch(data, "WEB_APP_USER", targetId)
            : writeToDailySheet(data, "WEB_APP_USER", targetId);
        
        return ContentService.createTextOutput(
          JSON.stringify({ status: "OK", message: `บันทึกสำเร็จ ${writeRes.count} คน` })
        ).setMimeType(ContentService.MimeType.JSON);

      default:
        return ContentService.createTextOutput(
          JSON.stringify({ status: "IGNORED", action })
        ).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    logError("handleWebAppGateway", err.message, JSON.stringify(payload));
    return ContentService.createTextOutput(
      JSON.stringify({ status: "ERROR", error: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// FUNCTION: callGeminiAiChat (เรียกจาก React: google.script.run)
// Chatbot ทั่วไปใน Dashboard — รับข้อความ → Gemini → ตอบกลับ
// ใช้ system prompt ที่เข้าใจบริบทโครงการก่อสร้าง
// ============================================================
function callGeminiAiChat(userMessage) {
  if (!userMessage || userMessage.trim() === "") return "กรุณาพิมพ์ข้อความครับ";

  const systemPrompt = `คุณคือ AI ผู้ช่วยผู้จัดการไซต์งานก่อสร้างอัจฉริยะ (Smart Worksite AI)
ทำงานร่วมกับระบบบันทึกเวลาพนักงาน ระบบความปลอดภัย และการจัดการโครงการ

ตอบเป็นภาษาไทยสั้น กระชับ เป็นกันเอง เข้าใจง่าย
ถ้าถามเรื่องข้อมูลพนักงานหรือรายงาน ให้แนะนำดูจากหน้า Dashboard หรือ คลังข้อมูล
ถ้าถามเรื่องเวลา OT ให้อ้างอิงกฎ: ปกติ 08:00-17:00, โอที = เกิน 17:00 หรือก่อน 08:00`;

  try {
    const reply = callGemini(userMessage, systemPrompt, false);
    return reply || "ขอโทษครับ ระบบ AI ไม่ได้รับคำตอบในขณะนี้ กรุณาลองใหม่อีกครั้ง";
  } catch (err) {
    logError("callGeminiAiChat", err.message, userMessage);
    return "⚠️ เกิดข้อผิดพลาดในการเชื่อม Gemini API: " + err.message;
  }
}

// ============================================================
// FUNCTION: callGeminiTool (เรียกจาก React AiToolsTab)
// 6 เครื่องมือ AI ตาม action name จาก frontend:
//   estimateMaterials, draftAccidentReport, draftSafetyTalk,
//   generateWBS, translateSiteCommand, analyzeWeatherPlan
// ============================================================
function callGeminiTool(action, inputText, lang) {
  if (!inputText || inputText.trim() === "") return "กรุณากรอกข้อมูลก่อนครับ";

  // System prompts สำหรับแต่ละเครื่องมือ
  const TOOL_PROMPTS = {
    estimateMaterials: `คุณคือวิศวกรประเมินวัสดุก่อสร้างมืออาชีพ
ผู้ใช้จะอธิบายงาน ให้คุณประเมินวัสดุ เครื่องมือ และปริมาณที่ต้องใช้
ตอบเป็นรายการชัดเจน พร้อมระบุหน่วยและหมายเหตุ`,

    draftAccidentReport: `คุณคือผู้เชี่ยวชาญด้านความปลอดภัยในงานก่อสร้าง
ผู้ใช้จะเล่าเหตุการณ์ ให้คุณร่างรายงานอุบัติเหตุแบบมาตรฐาน OSHA ประกอบด้วย:
1. สรุปเหตุการณ์  2. สาเหตุเบื้องต้น  3. ผู้บาดเจ็บ/ความเสียหาย
4. มาตรการแก้ไขเร่งด่วน  5. การป้องกันในอนาคต`,

    draftSafetyTalk: `คุณคือผู้ฝึกอบรมความปลอดภัยหน้างานก่อสร้าง
สร้างสคริปต์ Safety Talk สั้น (3-5 นาที) ที่เข้าใจง่าย
ใช้ภาษาพูดทั่วไป มีตัวอย่างจริงจากหน้างาน มีการถามตอบ`,

    generateWBS: `คุณคือผู้จัดการโครงการก่อสร้างมืออาชีพ
แยกย่อยงานที่ผู้ใช้บอกออกเป็น Work Breakdown Structure (WBS)
แสดงเป็นรายการลำดับชั้น มีกำหนดเวลาโดยประมาณและผู้รับผิดชอบ`,

    translateSiteCommand: `คุณคือล่ามแปลภาษาหน้างานก่อสร้าง
แปลข้อความที่ผู้ใช้ให้มาเป็นภาษา ${lang || 'พม่า'} (Myanmar)
พร้อมอ่านออกเสียงภาษาไทยให้ช่างที่พูดภาษาเป้าหมายได้`,

    analyzeWeatherPlan: `คุณคือที่ปรึกษาการบริหารโครงการก่อสร้างตามสภาพอากาศ
วิเคราะห์สภาพอากาศที่ผู้ใช้แจ้ง แล้วแนะนำ:
1. งานใดควรเร่ง/ชะลอ  2. ความเสี่ยงด้านความปลอดภัย
3. การจัดการเครื่องจักร/วัสดุที่เหมาะสม`
  };

  const systemPrompt = TOOL_PROMPTS[action];
  if (!systemPrompt) return `❌ ไม่รู้จักเครื่องมือ: ${action}`;

  try {
    const result = callGemini(inputText, systemPrompt, false);
    return result || "⚠️ ไม่ได้รับผลลัพธ์จาก AI กรุณาลองใหม่";
  } catch (err) {
    logError("callGeminiTool_" + action, err.message, inputText);
    return "❌ เกิดข้อผิดพลาด: " + err.message;
  }
}

// ============================================================
// FUNCTION: callGeminiAdminTool (เรียกจาก AiAdminTab — Admin only)
// เครื่องมือ AI สำหรับผู้ดูแลระบบ: สรุปรายงาน, HR, ร่างประกาศ
// ============================================================
function callGeminiAdminTool(action, inputText) {
  // 🛡️ ตรวจสอบสิทธิ์ Admin ก่อนประมวลผล
  const userEmail = Session.getActiveUser().getEmail();
  const adminEmails = getAdminEmailsFromSheet();
  if (!adminEmails.includes(userEmail.toLowerCase().trim())) {
    return "🔒 เฉพาะ Admin เท่านั้น — " + userEmail + " ไม่มีสิทธิ์";
  }

  const ADMIN_PROMPTS = {
    summary: `คุณคือผู้ช่วยผู้จัดการโครงการก่อสร้าง
สรุปผลลัพธ์การทำงานในช่วงเวลาที่ผู้ใช้ระบุ ประกอบด้วย:
จำนวนชั่วโมงรวม, OT รวม, ไซต์งานหลัก, ประเด็นที่ต้องติดตาม
เขียนเป็นรายงานสรุปผู้บริหาร (Executive Summary)`,

    hr: `คุณคือผู้เชี่ยวชาญ HR ในอุตสาหกรรมก่อสร้าง
วิเคราะห์แนวโน้มการขาด/ลา/OT ที่ผู้ใช้แจ้ง
เสนอแนะการวางแผนกำลังคนล่วงหน้าและมาตรการที่ควรดำเนินการ`,

    announce: `คุณคือผู้ช่วยสื่อสารองค์กรในบริษัทก่อสร้าง
ร่างประกาศสั่งงานและความปลอดภัยประจำวันที่มืออาชีพ
ภาษากระชับ ชัดเจน ครบถ้วน มีหัวข้อ Safety Moment ด้วยเสมอ`
  };

  const systemPrompt = ADMIN_PROMPTS[action];
  if (!systemPrompt) return `❌ ไม่รู้จักเครื่องมือ Admin: ${action}`;

  try {
    const result = callGemini(inputText, systemPrompt, false);
    return result || "⚠️ ไม่ได้รับผลลัพธ์จาก AI";
  } catch (err) {
    logError("callGeminiAdminTool_" + action, err.message, inputText);
    return "❌ เกิดข้อผิดพลาด: " + err.message;
  }
}

// ============================================================
// FUNCTION: processNlpTimelogFromWeb
// Fast Track Logger: รับข้อความธรรมชาติ → parse → return
// ส่งกลับ JSON ที่ใช้เติมฟอร์มลงเวลาใน React
// ============================================================
function processNlpTimelogFromWeb(text) {
  const systemPrompt = `คุณคือระบบ AI แปลงข้อความลงเวลาของพนักงานก่อสร้าง
อ่านข้อความ แล้ว extract ข้อมูลออกมาเป็น JSON โดยตรง ไม่มีคำอธิบาย

JSON format:
{
  "date": "YYYY-MM-DD หรือ dd/MM/YYYY",
  "site": "ชื่อไซต์งาน",
  "timeIn": "HH:MM",
  "timeOut": "HH:MM",
  "otHours": 0,
  "employees": ["ชื่อ1", "ชื่อ2"]
}

ถ้าหาข้อมูลไม่ได้ให้ใส่ null
วันที่ default = วันนี้ถ้าไม่ระบุ`;

  try {
    const result = callGemini(text, systemPrompt, true); // isJson = true
    return result;
  } catch (err) {
    logError("processNlpTimelogFromWeb", err.message, text);
    return { error: err.message };
  }
}

// ============================================================
// FUNCTION: getAdminEmailsFromSheet
// ดึง Admin emails จาก Column Z ของ Sheet "รายชื่อพนักงาน"
// (ตาม Google Sheets URL ที่ user ระบุ)
// ============================================================
function getAdminEmailsFromSheet() {
  try {
    const spreadsheetId = getDynamicConfig("EMPLOYEE_SHEET_ID") || "1SSbgN9lmObsAyrqjykFttqNbCVDd3yhUq47yT8Z_Agk";
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName("รายชื่อพนักงาน");
    if (!sheet) return [];

    // Column Z = ลำดับที่ 26 → ดึงตั้งแต่แถวที่ 2 (แถว 1 เป็น header)
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const colZ = sheet.getRange(2, 26, lastRow - 1, 1).getValues();
    return colZ
      .flat()
      .map(email => (email || "").toString().toLowerCase().trim())
      .filter(email => email.includes("@")); // กรองเฉพาะ email จริง

  } catch (err) {
    logError("getAdminEmailsFromSheet", err.message, "");
    return [];
  }
}

// ============================================================
// FUNCTION: getActiveEmployeesFromSheet
// ดึงพนักงาน Column B-E + N จาก Sheet "รายชื่อพนักงาน"
// กรองเฉพาะ Column K = "ปกติ" เท่านั้น
//
// Column mapping (จาก user):
//   B = prefix (คำนำหน้า)
//   C = firstName (ชื่อ)
//   D = lastName (นามสกุล)
//   E = fullName (ชื่อเต็ม)
//   J = camp (แคมป์/ที่พัก)
//   K = status (สถานะ — กรอง "ปกติ" เท่านั้น)
//   N = code (รหัสพนักงาน 5 หลัก)
// ============================================================
function getActiveEmployeesFromSheet() {
  try {
    const spreadsheetId = getDynamicConfig("EMPLOYEE_SHEET_ID") || "1SSbgN9lmObsAyrqjykFttqNbCVDd3yhUq47yT8Z_Agk";
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName("รายชื่อพนักงาน");
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    // ดึงข้อมูล Column A-N ตั้งแต่แถวที่ 2
    const data = sheet.getRange(2, 1, lastRow - 1, 14).getValues();

    return data
      .filter(row => {
        const status = (row[10] || "").toString().trim(); // Column K (index 10)
        return status === "ปกติ";
      })
      .map(row => ({
        prefix:    (row[1]  || "").toString().trim(), // Column B
        firstName: (row[2]  || "").toString().trim(), // Column C
        lastName:  (row[3]  || "").toString().trim(), // Column D
        fullName:  (row[4]  || "").toString().trim(), // Column E
        camp:      (row[9]  || "").toString().trim(), // Column J
        status:    (row[10] || "").toString().trim(), // Column K
        code:      (row[13] || "").toString().trim(), // Column N
      }))
      .filter(emp => emp.firstName); // กรองแถวว่าง

  } catch (err) {
    logError("getActiveEmployeesFromSheet", err.message, "");
    return [];
  }
}

// ============================================================
// FUNCTION: getDashboardSummary
// สรุปข้อมูลภาพรวมสำหรับ Dashboard (optional)
// ============================================================
function getDashboardSummary() {
  try {
    const activeEmployees = getActiveEmployeesFromSheet();
    const systemStatus = getDynamicConfig("SYSTEM_STATUS") || "ON";
    return {
      activeEmployeeCount: activeEmployees.length,
      systemStatus:        systemStatus,
      timestamp:           new Date().toISOString()
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ============================================================
// FUNCTION: logError (fallback ถ้าไม่มี logAuditTrail)
// ============================================================
function logError(fnName, errMsg, context) {
  try {
    if (typeof logAuditTrail === "function") {
      logAuditTrail("SYSTEM", fnName, context, "", 0.0, "ERROR", errMsg);
    } else {
      console.error(`[${fnName}] ${errMsg} | Context: ${context}`);
    }
  } catch (e) {
    console.error("logError failed: " + e.message);
  }
}
