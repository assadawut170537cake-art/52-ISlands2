/**
 * ====================================================================================
 * 🚀 SMART WORKSITE - DEVOPS WORKSPACE & CONTROL PANEL (VERSION 11 - EXTENDED PRO)
 * ====================================================================================
 * * คุณสมบัติเด่นของโครงสร้างตาราง:
 * 1. หน้า Code_Workspace จะถูกล็อกให้เป็นหน้าแรกเสมอเมื่อแอดมินเปิดไฟล์ (ผ่านฟังก์ชัน onOpen)
 * 2. โครงสร้างแบบ 1 แถวต่อ 1 บรรทัดโค้ด สะอาดตา (ชื่อไฟล์/ฟังก์ชันแสตมป์เฉพาะแถวแรกของบล็อก)
 * 3. มีการเว้นแถวว่าง 1 บรรทัดโดยอัตโนมัติเมื่อสิ้นสุดแต่ละฟังก์ชัน
 * 4. คอลัมน์ F (โค้ดเต็มบรรทัดนี้) ใช้สูตรชีต 100% ในการสลับหยิบโค้ดใหม่/โค้ดเก่าโดยไม่กินโควตา AI
 * 5. ระบบ Conditional Formatting แบบสแกนจุดต่าง (Diff): โค้ดเก่าสีเขียวอ่อน, โค้ดใหม่สีชมพูอ่อน
 * 6. สร้างหน้า System_Settings เป็น Single Source of Truth พร้อมตาราง Error Response Mapping
 */

// Global Constants สำหรับพิกัดหน้าชีต
const SHEET_WORKSPACE = "Code_Workspace";
const SHEET_SETTINGS = "System_Settings";
const SHEET_CHANGELOG = "System_Changelog";

/**
 * Trigger อัตโนมัติของ Google Sheet: จะทำงานทุกครั้งที่มีการเปิดไฟล์ขึ้นมา
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  // สร้างเมนูคำสั่งพิเศษบนแถบเครื่องมือสำหรับแอดมิน
  ui.createMenu("🚀 Smart Worksite DevOps")
    .addItem("⚙️ ตั้งค่าโครงสร้างระบบใหม่ (Initialize)", "initializeDevopsWorkspace")
    .addItem("🔄 ประกอบร่างโค้ดเต็มไฟล์ (Compile Code)", "compileFilesFromWorkspace")
    .addToUi();

  // ล็อกหน้าจอ: บังคับให้เปิดหน้า Code_Workspace เป็นหน้าแรกเสมอ
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const workspaceSheet = ss.getSheetByName(SHEET_WORKSPACE);
  if (workspaceSheet) {
    ss.setActiveSheet(workspaceSheet);
  }
}

/**
 * ฟังก์ชันหลักในการสร้าง/ปรับปรุง หน้าชีตควบคุมทั้งหมดให้ตรงตามเงื่อนไขสเปกระดับโปร
 */
function initializeDevopsWorkspace() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // ------------------------------------------------------------------
  // 1. จัดการหน้าแรก: Code_Workspace (1 แถว = 1 บรรทัดโค้ด)
  // ------------------------------------------------------------------
  let ws = ss.getSheetByName(SHEET_WORKSPACE);
  if (!ws) {
    ws = ss.insertSheet(SHEET_WORKSPACE, 0); // แทรกไว้ที่ตำแหน่งแรกสุด
  } else {
    ws.clear(); // ล้างหน้าเก่าเพื่อขึ้นโครงสร้างแบบ Clean Layout
    ws.clearFormats();
    ws.getConditionalFormatRules().forEach(() => ws.setConditionalFormatRules([])); // ล้างสีกฎเก่า
  }
  
  // กำหนดหัวข้อคอลัมน์หน้า Workspace
  const wsHeaders = [
    ["ชื่อไฟล์ (Source File)", "บรรทัด (Line)", "ชื่อฟังก์ชัน (Function)", "โค้ดปัจจุบัน (Current)", "โค้ดใหม่จากพี่ AI (New Update)", "สูตรประกอบโค้ด (Compiled Line)", "คำอธิบาย / บันทึกหน้างาน"]
  ];
  ws.getRange("A1:G1").setValues(wsHeaders);
  
  // จัดรูปแบบหัวตาราง (เน้นสีกราไฟต์เข้ม สไตล์ Professional Code Editor)
  ws.getRange("A1:G1")
    .setFontWeight("bold")
    .setFontColor("#F8FAFC")
    .setBackground("#0F172A")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  ws.setRowHeight(1, 35);
  ws.setFrozenRows(1);
  
  // ล็อกฟอนต์ให้เป็นสไตล์ที่อ่านโค้ดง่าย Monospace ผสม Kanit
  ws.getRange("A1:G1000").setFontFamily("Kanit");
  ws.getRange("D2:F1000").setFontFamily("Courier New"); // เฉพาะช่องโค้ดให้ใช้ฟอนต์พิมพ์ดีด

  // ------------------------------------------------------------------
  // 2. จัดการหน้าควบคุม: System_Settings (Single Source of Truth)
  // ------------------------------------------------------------------
  let settings = ss.getSheetByName(SHEET_SETTINGS);
  if (!settings) {
    settings = ss.insertSheet(SHEET_SETTINGS);
  } else {
    settings.clear();
    settings.clearFormats();
  }
  
  // โครงสร้างหัวตารางตั้งค่าผ่านแชทเว็บแอพ
  const settingHeaders = [
    ["หมวดหมู่ระบบ", "คีย์ตั้งค่า (Key Config)", "ค่าปัจจุบัน (Value)", "วัน-เวลาที่สั่งแก้ไขล่าสุด", "ชื่อผู้สั่งแก้ไข (Admin)"]
  ];
  settings.getRange("A1:E1").setValues(settingHeaders);
  settings.getRange("A1:E1")
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#1E3A8A")
    .setHorizontalAlignment("center");
  settings.setFrozenRows(1);

  // ใส่ข้อมูลตั้งค่าพื้นฐานของระบบบอท
  const defaultSettings = [
    ["LINE_BOT", "SYSTEM_STATUS", "ON", "", ""],
    ["LINE_BOT", "ADMIN_WHITELIST_GROUP", "Cc12345678...", "", ""],
    ["WEB_APP", "AI_ENGINE_MODEL", "Gemini-1.5-Pro-Extended", "", ""],
    ["SYSTEM_ERROR_MAPPING", "Cannot call SpreadsheetApp.getUi", "⚠️ ระบบรันเบื้องหลัง/Webhook กรุณาดูผลการรันผ่านเมนู Logger แทน", "", ""],
    ["SYSTEM_ERROR_MAPPING", "No Data", "❌ ไม่พบข้อมูล postData ส่งมาจาก LINE Webhook", "", ""]
  ];
  settings.getRange(2, 1, defaultSettings.length, 5).setValues(defaultSettings);

  // ------------------------------------------------------------------
  // 3. ฝังสูตร Google Sheet คอลัมน์ F (ประกอบโค้ดโดยไม่พึ่ง AI เพื่อประหยัดโควตา)
  // ------------------------------------------------------------------
  // สูตรตรวจสอบ: "ถ้าช่องโค้ดใหม่มีค่า ให้ใช้โค้ดใหม่ ถ้าไม่มีให้ใช้โค้ดปัจจุบัน"
  const formulaRange = ws.getRange("F2:F1000");
  formulaRange.setFormula(`=IF(AND(ISBLANK(D2), ISBLANK(E2)), "", IF(ISBLANK(E2), D2, E2))`);

  // ------------------------------------------------------------------
  // 4. ติดตั้งระบบตรวจจับจุดต่าง (Green & Pink Diff Highlighter)
  // ------------------------------------------------------------------
  const rules = [];
  
  // กฎที่ 1: โค้ดเก่า (คอลัมน์ D) -> หากไม่ว่าง และไม่ตรงกับโค้ดใหม่ (คอลัมน์ E) ให้เปลี่ยนเป็นสีเขียวอ่อน
  const ruleOldCode = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND(NOT(ISBLANK($E2)), $D2<>$E2)`)
    .setBackground("#DCFCE7") // สีเขียวอ่อน (🟢 โค้ดเดิม)
    .setFontColor("#15803D")
    .setRanges([ws.getRange("D2:D1000")])
    .build();
    
  // กฎที่ 2: โค้ดใหม่ (คอลัมน์ E) -> หากไม่ว่าง และไม่ตรงกับโค้ดเดิม (คอลัมน์ D) ให้เปลี่ยนเป็นสีชมพูอ่อน
  const ruleNewCode = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND(NOT(ISBLANK($E2)), $D2<>$E2)`)
    .setBackground("#FCE7F3") // สีชมพูอ่อน (🌸 โค้ดอัปเดตใหม่)
    .setFontColor("#B91C1C")
    .setRanges([ws.getRange("E2:E1000")])
    .build();

  rules.push(ruleOldCode, ruleNewCode);
  ws.setConditionalFormatRules(rules);

  // ------------------------------------------------------------------
  // 5. ป้อนชุดข้อมูลจำลอง (Seed Data) เพื่อแสดงโครงสร้าง Clean Layout ตามสเปกเป๊ะๆ
  // ------------------------------------------------------------------
  const sampleData = [
    ["1_LineBot.gs", 1, "replyWithButtons", "function replyWithButtons(tk, t, b) {", "", "", "บรรทัดแรกประกาศฟังก์ชัน แสลมป์ชื่อไฟล์และชื่อฟังก์ชัน"],
    ["", 2, "", "  const items = b.map(l => ({ type: 'action' }));", "", "", "เนื้อโค้ดด้านใน ปล่อยช่องชื่อไฟล์และชื่อฟังก์ชันว่างไว้"],
    ["", 3, "", "  // ตรรกะส่งกลับไลน์...", "", "", ""],
    ["", 4, "", "}", "", "", "บรรทัดสุดท้ายปีกกาปิดของฟังก์ชัน"],
    ["", 5, "", "", "", "", "แถวว่างที่ถูกเว้นไว้ 1 บรรทัดโดยอัตโนมัติ เพื่อแยกฟังก์ชัน"],
    ["1_LineBot.gs", 6, "doPost", "async function doPost(e) {", "", "", "ขึ้นฟังก์ชันใหม่ในไฟล์เดิม แสลมป์ชื่อไฟล์และชื่อฟังก์ชันแรกใหม่"],
    ["", 7, "", "  let globalReplyToken = null;", "", "", ""],
    ["", 8, "", "}", "", "", "จบฟังก์ชัน doPost"]
  ];
  
  ws.getRange(2, 1, sampleData.length, 7).setValues(sampleData);
  
  // ปรับขนาดคอลัมน์ให้กว้างพอดีและอ่านง่ายระดับสายตาช่าง
  ws.setColumnWidth(1, 150); // ชื่อไฟล์
  ws.setColumnWidth(2, 60);  // เลขบรรทัด
  ws.setColumnWidth(3, 160); // ชื่อฟังก์ชัน
  ws.setColumnWidth(4, 380); // โค้ดปัจจุบัน
  ws.setColumnWidth(5, 380); // โค้ดใหม่
  ws.setColumnWidth(6, 380); // สูตรประกอบ
  ws.setColumnWidth(7, 250); // คำอธิบาย

  settings.setColumnWidth(1, 160);
  settings.setColumnWidth(2, 220);
  settings.setColumnWidth(3, 250);
  settings.setColumnWidth(4, 180);
  settings.setColumnWidth(5, 130);

  Logger.log("DevOps Workspace Initialized successfully with clean layout specifications.");
}

/**
 * ฟังก์ชันคัดกรองและประกอบร่างโค้ดแยกตามไฟล์ (Compile Asset Engine)
 * วิ่งอ่านช่องคอลัมน์สูตรประกอบโค้ด (F) เพื่อดึงรหัสตัวเต็มออกมารายไฟล์แยกกันอย่างชัดเจนและเว้นแถวถูกต้อง
 */
function compileFilesFromWorkspace() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName(SHEET_WORKSPACE);
  if (!ws) return;
  
  const data = ws.getRange(2, 1, ws.getLastRow() - 1, 6).getValues();
  let currentFile = "";
  let fileCodes = {};

  // วนลูปอ่านข้อมูลบรรทัดโค้ดทีละแถว
  for (let i = 0; i < data.length; i++) {
    const fileNameInRow = data[i][0].toString().trim();
    const compiledLine = data[i][5].toString(); // ดึงข้อมูลโค้ดจากคอลัมน์ F
    
    // ถ้าเจอชื่อไฟล์ในคอลัมน์ A ให้สลับพิกัดไปรวบรวมไฟล์นั้น
    if (fileNameInRow !== "") {
      currentFile = fileNameInRow;
    }
    
    if (currentFile !== "") {
      if (!fileCodes[currentFile]) {
        fileCodes[currentFile] = [];
      }
      fileCodes[currentFile].push(compiledLine);
    }
  }

  // สร้างหน้าต่างข้อความแสดงโค้ดฉบับสมบูรณ์แยกรายไฟล์ เพื่อให้แอดมินก๊อปปี้ไปใช้งาน
  let htmlOutput = '<div style="font-family: sans-serif; padding: 15px; background: #0F172A; color: #E2E8F0;">';
  htmlOutput += '<h2 style="color: #38BDF8; border-bottom: 2px solid #334155; padding-bottom: 8px;">🛠️ สรุปรายงานการประกอบร่างโค้ดตัวเต็ม (Code Compiler Output)</h2>';
  
  for (let file in fileCodes) {
    // รวมร่างบรรทัดโค้ดทั้งหมดเข้าด้วยกัน โดยขั้นด้วยการเว้นบรรทัดสากล (\n)
    let fullText = fileCodes[file].join("\n");
    
    htmlOutput += `<h3 style="color: #FBBF24; margin-top: 20px;">📂 ไฟล์: ${file}</h3>`;
    htmlOutput += `<textarea style="width: 100%; height: 250px; font-family: 'Courier New', monospace; background: #1E293B; color: #34D399; border: 1px solid #475569; padding: 10px; box-sizing: border-box;" readonly>${fullText}</textarea>`;
    htmlOutput += `<p style="font-size: 11px; color: #94A3B8;">* คัดลอกโค้ดในกล่องด้านบนไปวางทับในไฟล์สคริปต์หลักได้ทันที</p>`;
  }
  htmlOutput += '</div>';

  const htmlWindow = HtmlService.createHtmlOutput(htmlOutput)
    .setTitle("Code Compiler - Smart Worksite")
    .setWidth(750)
    .setHeight(550);
    
  SpreadsheetApp.getUi().showModalDialog(htmlWindow, "📦 ตัวประกอบร่างโค้ดเสร็จสมบูรณ์");
}