// ============================================================
// WebApp_GeminiTools.gs — Web App AI Gateway Layer
// เชื่อม SmartWorksiteDashboard.html กับ Gemini API
// ผ่านระบบ google.script.run จาก React frontend
//
// ฟังก์ชันที่ frontend เรียกได้:
//   1. callGeminiAiChat(userMsg)          — Chatbot ทั่วไป
//   2. callGeminiTool(action, text, lang) — 6 AI Tools
//   3. handleWebAppGateway(payload)       — Router สำหรับ POST
//   4. doGet(e)                           — Serve HTML + inject config
// ============================================================

// ============================================================
// FUNCTION: doGet
// เปิดหน้า Web App และ inject ข้อมูลจาก GAS เข้า HTML
// ข้อมูลที่ inject: isAdmin, userEmail, employees (K=ปกติ)
//
// วิธีใช้ใน index.html:
//   <div id="gas-data-bridge" style="display:none;"><?= appConfig ?></div>
// ============================================================
function doGet(e) {
  try {
    const page = e.parameter.page;
    if (page === 'manual') {
      return HtmlService.createHtmlOutputFromFile('Interactive_Manual')
          .setTitle('คู่มือ Smart Worksite')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
          .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    
    if (page === 'settings') {
      return HtmlService.createHtmlOutputFromFile('System_Settings')
          .setTitle('System Settings - Smart Worksite')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
          .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }

    const userEmail = Session.getActiveUser().getEmail();
    const adminEmails = getAdminEmailsFromSheet();
    const isAdmin = adminEmails.includes(userEmail.toLowerCase().trim());
    const employees = getActiveEmployeesFromSheet();

    let userPhoto = null;
    try {
      if (typeof AdminDirectory !== 'undefined') {
        const userProfile = AdminDirectory.Users.get(userEmail);
        userPhoto = userProfile.thumbnailPhotoUrl || null;
      }
    } catch(e) {}

    const appConfig = JSON.stringify({
      isAdmin:       isAdmin,
      userEmail:     userEmail,
      userPhoto:     userPhoto,
      adminEmails:   adminEmails,
      employees:     employees,
      employeeCount: employees.length,
      backdateLimit: parseInt(getDynamicConfig("BACKDATE_LIMIT") || "2"),
      isLocalDev:    false,
      buildVersion:  "V.7",
      timestamp:     new Date().toISOString()
    });

    const template = HtmlService.createTemplate(
      HtmlService.createHtmlOutputFromFile('index').getContent()
        .replace(
          /(<div id="gas-data-bridge"[^>]*>)([\s\S]*?)(<\/div>)/,
          `$1${appConfig}$3`
        )
    );

    return HtmlService.createHtmlOutput(template.evaluate().getContent())
      .setTitle('Smart Worksite System V.7')
      .setFaviconUrl('https://i.ibb.co/N3w3P9pS/52.png')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');

  } catch (err) {
    logError("doGet_WebApp", err.message, "");
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('Smart Worksite System V.6');
  }
}

// ============================================================
// FUNCTION: handleWebAppGateway
// Router สำหรับ POST requests จาก Web App Portal
// รับ payload.action แล้วแยกไปยังฟังก์ชันที่ถูกต้อง
//
// Payload format:
//   { source: "WEB_APP_PORTAL", action: "...", data: {...} }
// ============================================================
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

      case "GET_DROPDOWN_DATA":
        return ContentService.createTextOutput(
          JSON.stringify({ status: "OK", data: getWebAppDropdownData() })
        ).setMimeType(ContentService.MimeType.JSON);

      case "GET_ALL_EMPLOYEES":
        return ContentService.createTextOutput(
          JSON.stringify({ status: "OK", data: getAllEmployeesFromSheet() })
        ).setMimeType(ContentService.MimeType.JSON);

      case "ADD_EMPLOYEE":
        const addRes = addNewEmployeeToSheet(data);
        return ContentService.createTextOutput(
          JSON.stringify({ status: addRes.success ? "OK" : "ERROR", message: addRes.message })
        ).setMimeType(ContentService.MimeType.JSON);

      case "UPDATE_EMPLOYEE_STATUS":
        if (!data || !data.empCodeOrName || !data.newStatus) throw new Error("Missing empCodeOrName or newStatus");
        const updateRes = updateEmployeeStatusInSheet(data.empCodeOrName, data.newStatus);
        return ContentService.createTextOutput(
          JSON.stringify({ status: updateRes.success ? "OK" : "ERROR", message: updateRes.message })
        ).setMimeType(ContentService.MimeType.JSON);

      case "GET_SYSTEM_CONFIGS":
        return ContentService.createTextOutput(
          JSON.stringify({ status: "OK", data: getSystemConfigsMap() })
        ).setMimeType(ContentService.MimeType.JSON);

      case "SAVE_CONFIG":
      case "SAVE_SYSTEM_CONFIG":
        if (!data || !data.key || data.value === undefined) throw new Error("Missing key/value");
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
// FUNCTION: getWebAppDropdownData
// ดึงรายชื่อไซต์งาน (จาก Col A หน้า DATA) ที่พัก (จาก Col B หน้า DATA) 
// และรายชื่อพนักงาน สำหรับ Dropdown ใน Dashboard V.7
// เรียกจาก SmartWorksiteDashboard: google.script.run.getWebAppDropdownData()
// ============================================================
function getWebAppDropdownData() {
  try {
    const spreadsheetId = getDynamicConfig("EMPLOYEE_SHEET_ID") || "1SSbgN9lmObsAyrqjykFttqNbCVDd3yhUq47yT8Z_Agk";
    const ss = SpreadsheetApp.openById(spreadsheetId);
    
    const sites = [];
    const accommodations = [];
    
    // ดึงรายชื่อไซต์งานและที่พักจาก Sheet "DATA"
    const dataSheet = ss.getSheetByName("DATA");
    if (dataSheet) {
      const lastRow = dataSheet.getLastRow();
      if (lastRow >= 2) {
        const dataValues = dataSheet.getRange(2, 1, lastRow - 1, 2).getValues(); // Col A (Site), Col B (Camp)
        dataValues.forEach(function(row) {
          const s = (row[0] || "").toString().trim();
          const c = (row[1] || "").toString().trim();
          if (s && !sites.includes(s)) sites.push(s);
          if (c && !accommodations.includes(c)) accommodations.push(c);
        });
      }
    }
    
    // Fallback สำหรับ Sites จาก Dynamic Config ถ้า Sheet DATA ว่าง
    if (sites.length === 0) {
      const siteListConfig = getDynamicConfig("SITE_LIST") || "";
      if (siteListConfig) {
        siteListConfig.split(",").forEach(function(s) {
          const trimmed = s.trim();
          if (trimmed && !sites.includes(trimmed)) sites.push(trimmed);
        });
      }
    }
    
    const employees = getActiveEmployeesFromSheet();
    const staff = employees.map(function(emp) {
      return emp.fullName || (emp.firstName + " " + emp.lastName);
    });
    
    // เติม Accommodations จากข้อมูลพนักงานเพิ่มเติม
    employees.forEach(function(emp) {
      if (emp.camp && !accommodations.includes(emp.camp)) {
        accommodations.push(emp.camp);
      }
    });

    return {
      success: true,
      sites: sites,
      staff: staff,
      accommodations: accommodations.sort()
    };
  } catch (err) {
    logError("getWebAppDropdownData", err.message, "");
    return { success: false, sites: [], staff: [], accommodations: [] };
  }
}

// ============================================================
// FUNCTION: addNewEmployeeToSheet
// เพิ่มพนักงานใหม่ลง Sheet "รายชื่อพนักงาน" (สำหรับ Admin)
// ============================================================
function addNewEmployeeToSheet(empData) {
  try {
    const spreadsheetId = getDynamicConfig("EMPLOYEE_SHEET_ID") || "1SSbgN9lmObsAyrqjykFttqNbCVDd3yhUq47yT8Z_Agk";
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName("รายชื่อพนักงาน");
    if (!sheet) return { success: false, message: "ไม่พบ Sheet รายชื่อพนักงาน" };

    const prefix = (empData.prefix || "นาย").trim();
    const firstName = (empData.firstName || "").trim();
    const lastName = (empData.lastName || "").trim();
    const fullName = empData.fullName || (prefix + " " + firstName + " " + lastName).trim();
    const position = (empData.position || "ช่างทั่วไป").trim();
    const camp = (empData.camp || "สาทร").trim();
    const status = (empData.status || "ปกติ").trim();
    const code = (empData.code || "").toString().trim();

    if (!firstName) return { success: false, message: "กรุณาระบุชื่อพนักงาน" };

    const newRow = [
      "",         // Col A: Prefix / Index
      prefix,     // Col B: Prefix
      firstName,  // Col C: First Name
      lastName,   // Col D: Last Name
      fullName,   // Col E: Full Name
      "",         // Col F
      "",         // Col G
      position,   // Col H: Position
      "",         // Col I
      camp,       // Col J: Camp/Residence
      status,     // Col K: Status
      "",         // Col L
      "",         // Col M
      code        // Col N: Employee Code (5 digits)
    ];

    sheet.appendRow(newRow);
    return { success: true, message: `เพิ่มพนักงาน ${fullName} สำเร็จ` };
  } catch (err) {
    logError("addNewEmployeeToSheet", err.message, "");
    return { success: false, message: "เกิดข้อผิดพลาด: " + err.message };
  }
}

// ============================================================
// FUNCTION: updateEmployeeStatusInSheet
// อัปเดตสถานะพนักงาน (ปกติ / ลาออก / พักงาน) ใน Col K
// ============================================================
function updateEmployeeStatusInSheet(empCodeOrName, newStatus) {
  try {
    const spreadsheetId = getDynamicConfig("EMPLOYEE_SHEET_ID") || "1SSbgN9lmObsAyrqjykFttqNbCVDd3yhUq47yT8Z_Agk";
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName("รายชื่อพนักงาน");
    if (!sheet) return { success: false, message: "ไม่พบ Sheet รายชื่อพนักงาน" };

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: false, message: "ไม่มีข้อมูลพนักงาน" };

    const data = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
    let targetRowIndex = -1;

    const searchTerm = empCodeOrName.toString().trim().toLowerCase();

    for (let i = 0; i < data.length; i++) {
      const fullName = (data[i][4] || "").toString().trim().toLowerCase(); // Col E
      const code = (data[i][13] || "").toString().trim().toLowerCase();     // Col N
      if (code === searchTerm || fullName.includes(searchTerm)) {
        targetRowIndex = i + 2; // Rows are 1-indexed, starting from row 2
        break;
      }
    }

    if (targetRowIndex === -1) {
      return { success: false, message: "ไม่พบรายชื่อพนักงานที่ระบุ" };
    }

    sheet.getRange(targetRowIndex, 11).setValue(newStatus); // Col K is column 11
    return { success: true, message: `อัปเดตสถานะเป็น '${newStatus}' สำเร็จ` };
  } catch (err) {
    logError("updateEmployeeStatusInSheet", err.message, "");
    return { success: false, message: "เกิดข้อผิดพลาด: " + err.message };
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
// FUNCTION: getAllEmployeesFromSheet
// ดึงข้อมูลพนักงานทั้งหมด (รวมทั้ง "ปกติ", "ลาออก", "พักงาน")
// สำหรับแสดงผลในหน้าจัดการพนักงาน (Staff Data)
// ============================================================
function getAllEmployeesFromSheet() {
  try {
    const spreadsheetId = getDynamicConfig("EMPLOYEE_SHEET_ID") || "1SSbgN9lmObsAyrqjykFttqNbCVDd3yhUq47yT8Z_Agk";
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName("รายชื่อพนักงาน");
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const data = sheet.getRange(2, 1, lastRow - 1, 14).getValues();

    return data
      .map(row => ({
        prefix:    (row[1]  || "").toString().trim(), // Column B
        firstName: (row[2]  || "").toString().trim(), // Column C
        lastName:  (row[3]  || "").toString().trim(), // Column D
        fullName:  (row[4]  || "").toString().trim(), // Column E
        position:  (row[7]  || "").toString().trim(), // Column H
        camp:      (row[9]  || "").toString().trim(), // Column J
        status:    (row[10] || "").toString().trim() || "ปกติ", // Column K
        code:      (row[13] || "").toString().trim(), // Column N
      }))
      .filter(emp => emp.firstName || emp.fullName); // กรองแถวว่าง

  } catch (err) {
    logError("getAllEmployeesFromSheet", err.message, "");
    return [];
  }
}

// ============================================================
// FUNCTION: getSystemConfigsMap
// ดึงค่าการตั้งค่าระบบจาก ScriptProperties ทั้งหมด
// ============================================================
function getSystemConfigsMap() {
  try {
    const props = PropertiesService.getScriptProperties().getProperties();
    return {
      BACKDATE_LIMIT: props.BACKDATE_LIMIT || "2",
      SYSTEM_STATUS: props.SYSTEM_STATUS || "ON",
      EMPLOYEE_SHEET_ID: props.EMPLOYEE_SHEET_ID || "1SSbgN9lmObsAyrqjykFttqNbCVDd3yhUq47yT8Z_Agk",
      SITE_LIST: props.SITE_LIST || "",
      QUOTA_CHECK_INTERVAL_MINUTES: props.QUOTA_CHECK_INTERVAL_MINUTES || "15",
      QUOTA_THRESHOLD: props.QUOTA_THRESHOLD || "0.9"
    };
  } catch (err) {
    logError("getSystemConfigsMap", err.message, "");
    return {};
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
