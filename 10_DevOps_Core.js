/**
 * ====================================================================================
 * 🚀 SMART WORKSITE - DEVOPS WORKSPACE & CONTROL PANEL (VERSION 11 - PERFECT SYNC)
 * ====================================================================================
 * ไฟล์: 10_DevOps_Core.gs
 * แก้ไขบั๊ก: แยกลอจิกสาดสีออกมาเป็นอิสระ เพื่อให้ทำงานร่วมกับระบบ Auto API Sync ได้ 100%
 */

const SHEET_WORKSPACE = "Code_Workspace";
const SHEET_SETTINGS = "System_Settings";
const SHEET_CHANGELOG = "System_Changelog";

/**
 * คลังรายชื่อไฟล์จริงทั้ง 25 ไฟล์ในโครงการ Smart Worksite
 */
function getProjectFileList() {
  return [
    "appsscript.json", "Config.gs", "0_Security.gs", "1_botline.gs", 
    "2_WebApp.gs", "2_gemini_wrappers.gs", "2_VisionAPI.gs", "3_SharedFunctions.gs", 
    "3_BigQueryLogger.gs", "4_CoreDatabase.gs", "4_DriveSearchService.gs", "5_SupportMisc.gs", 
    "5_CloudLoggingService.gs", "6_fuzzy_helpers.gs", "6_DeploymentService.gs", "7_AI_Assistant.gs", 
    "7_CloudStorageService.gs", "8_WorkflowInteractions.gs", "9_System_Chat.gs", "10_DevOps_Core.gs", 
    "WebApp_GeminiTools.gs", "index.html", "InjectorSidebar.html", "Interactive_Manual.html", 
    "SmartWorksiteDashboard.html"
  ]
}

/**
 * Trigger อัตโนมัติเมื่อเปิดไฟล์: ล็อกเข้าหน้าแรกสร้างเมนูลัดเครื่องมือแอดมิน
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("🚀 Smart Worksite DevOps")
    .addItem("⚙️ ตั้งค่าโครงสร้างระบบใหม่ (Initialize)", "initializeDevopsWorkspace")
    .addItem("🔄 ⚡ ซิงค์รหัสจาก GAS อัตโนมัติ (Auto API Sync)", "syncDirectFromGAS")
    .addItem("👁️ ยุบ-กางเนื้อโค้ด (Toggle Outline View)", "toggleCodeVisibility")
    .addItem('📝 บันทึกการอัปเดต (Changelog)', 'promptChangelog')
    .addItem('📝 ตรวจสอบฟังชั้นซ้ำ (ฟังชั้นเค้ก)', 'mergeDuplicateFunctions')
    .addItem('📝 อัปเดตโค้ด (ฟังชั้นเค้ก)', 'showDevOpsInjectorSidebar')
    .addToUi();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const workspaceSheet = ss.getSheetByName(SHEET_WORKSPACE);
  if (workspaceSheet) ss.setActiveSheet(workspaceSheet);
}

/**
 * ฟังก์ชันสร้างโครงสร้างบอร์ดจัดระเบียบหน้ากระดาน Layout สั้นกระชับ (A - F)
 */
function initializeDevopsWorkspace() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fileList = getProjectFileList();
  const maxRows = 2500;

  let ws = ss.getSheetByName(SHEET_WORKSPACE);
  if (!ws) ws = ss.insertSheet(SHEET_WORKSPACE, 0);
  else {
    ws.clear(); ws.clearFormats();
    ws.getConditionalFormatRules().forEach(() => ws.setConditionalFormatRules([]));
  }

  const wsHeaders = [
    ["ชื่อไฟล์ (Source File)", "บรรทัด (Line)", "ชื่อฟังก์ชัน (Function)", "โค้ดปัจจุบัน (Current)", "โค้ดใหม่จากพี่ AI (New Update)", "โค้ดผลลัพธ์หลังแก้ไข (Final Code)", "Helper_File_Fill (ซ่อน)", "Helper_Func_Fill (ซ่อน)", "Helper_Is_Mismatch (ซ่อน)"]
  ];
  ws.getRange("A1:I1").setValues(wsHeaders);

  ws.getRange("A1:I1").setFontWeight("bold").setFontColor("#F8FAFC").setBackground("#0F172A").setHorizontalAlignment("center").setVerticalAlignment("middle");
  ws.setRowHeight(1, 35); ws.setFrozenRows(1);
  ws.getRange("A1:I" + maxRows).setFontFamily("Kanit");
  ws.getRange("D2:F" + maxRows).setFontFamily("Courier New");
  ws.getRange("D2:F" + maxRows).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  ws.getRange("F2:F" + maxRows).setFormula(`=IF(AND(ISBLANK(D2), ISBLANK(E2)), "", IF(ISBLANK(E2), D2, E2))`);
  ws.hideColumns(7, 3);

  let cl = ss.getSheetByName(SHEET_CHANGELOG);
  if (!cl) cl = ss.insertSheet(SHEET_CHANGELOG, 1);
  else { cl.clear(); cl.clearFormats(); }

  const clHeaders = [
    ["วัน-เวลาที่อัปเดต (Timestamp)", "เวอร์ชันระบบ (Version)", "เวอร์ชันปุ่มกด/Web App (Deploy)", "ฟังก์ชันที่เปลี่ยนแปลง (Changed)", "ฟังก์ชันเพิ่มใหม่ + คำอธิบายสั้นๆ", "สรุปคนทั่วไป + ตัวอย่างวิธีใช้", "โค้ดเต็มไฟล์หลังยืนยันเสถียรแล้ว (คลังสำรอง)", "ตรวจสอบความเสถียรระบบ (Dropdown)"]
  ];
  cl.getRange("A1:H1").setValues(clHeaders);
  cl.getRange("A1:H1").setFontWeight("bold").setFontColor("#FFFFFF").setBackground("#1E293B").setHorizontalAlignment("center").setVerticalAlignment("middle");
  cl.setRowHeight(1, 35); cl.setFrozenRows(1);
  cl.getRange("A1:H500").setFontFamily("Kanit");
  cl.getRange("G2:G500").setFontFamily("Courier New").setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  const statusValidationRule = SpreadsheetApp.newDataValidation().requireValueInList(["🧪 กำลังทดสอบ", "🟢 เสถียรแล้ว (Lock Code)"], true).setAllowInvalid(false).build();
  cl.getRange("H2:H500").setDataValidation(statusValidationRule);

  const rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=AND(NOT(ISBLANK($E2)), $D2<>$E2)`).setBackground("#DCFCE7").setFontColor("#166534").setRanges([ws.getRange("D2:D" + maxRows)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=AND(NOT(ISBLANK($E2)), $D2<>$E2)`).setBackground("#FCE7F3").setFontColor("#991B1B").setRanges([ws.getRange("E2:E" + maxRows)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=AND(NOT(ISBLANK($E2)), $D2<>$E2)`).setBackground("#FCE7F3").setFontColor("#991B1B").setRanges([ws.getRange("F2:F" + maxRows)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=AND(NOT(ISBLANK($C2)), COUNTIFS($H$2:$H$${maxRows}, $C2, $I$2:$I$${maxRows}, 1) > 0)`).setBackground("#FCE7F3").setBold(true).setFontColor("#991B1B").setRanges([ws.getRange("C2:C" + maxRows)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=AND(NOT(ISBLANK($A2)), COUNTIFS($G$2:$G$${maxRows}, $A2, $I$2:$I$${maxRows}, 1) > 0)`).setBackground("#FCE7F3").setBold(true).setFontColor("#991B1B").setRanges([ws.getRange("A2:A" + maxRows)]).build());
  ws.setConditionalFormatRules(rules);

  const fileValidationRule = SpreadsheetApp.newDataValidation().requireValueInList(fileList, true).setAllowInvalid(false).setHelpText("โปรดตรวจสอบรายชื่อไฟล์จริงในโครงการปัจจุบันเท่านั้น").build();
  ws.getRange("A2:A" + maxRows).setDataValidation(fileValidationRule);

  ws.setColumnWidth(1, 180); ws.setColumnWidth(2, 60); ws.setColumnWidth(3, 160); ws.setColumnWidth(4, 380); ws.setColumnWidth(5, 380); ws.setColumnWidth(6, 380);
  cl.setColumnWidth(1, 160); cl.setColumnWidth(2, 100); cl.setColumnWidth(3, 150); cl.setColumnWidth(4, 150); cl.setColumnWidth(5, 230); cl.setColumnWidth(6, 260); cl.setColumnWidth(7, 400);

  let settings = ss.getSheetByName(SHEET_SETTINGS);
  if (!settings) settings = ss.insertSheet(SHEET_SETTINGS);
  else settings.clear();
  const settingHeaders = [["หมวดหมู่ระบบ", "คีย์ตั้งค่า (Key Config)", "ค่าปัจจุบัน (Value)", "วัน-เวลาที่สั่งแก้ไขล่าสุด", "ชื่อผู้สั่งแก้ไข (Admin)"]];
  settings.getRange("A1:E1").setValues(settingHeaders);
  settings.getRange("A1:E1").setFontWeight("bold").setFontColor("#FFFFFF").setBackground("#1E3A8A").setHorizontalAlignment("center");
  settings.getRange(2, 1, 2, 5).setValues([["LINE_BOT", "SYSTEM_STATUS", "ON", "21/05/2026 00:35:00", "Admin_Nong"], ["SYSTEM_ERROR_MAPPING", "Cannot call SpreadsheetApp.getUi", "⚠️ ระบบรันเบื้องหลังกรุณาเปิด Logger แทน", "21/05/2026 00:35:00", "Admin_Nong"]]);
  settings.setColumnWidth(1, 160); settings.setColumnWidth(2, 220); settings.setColumnWidth(3, 250); settings.setColumnWidth(4, 180); settings.setColumnWidth(5, 130);

  ss.toast("⚙️ บอร์ด DevOps เวอร์ชั่น 11 พร้อมทำงาน!", "DevOps Engine", 4);
}

/**
 * 🔄 ⚡ ฟังก์ชัน One-Click API Sync: ดึงรหัสตรงจาก GAS และสั่งเรียกสาดสีอัตโนมัติทันทีหลังทำงานเสร็จ
 */
function syncDirectFromGAS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName(SHEET_WORKSPACE);
  if (!ws) throw new Error("ไม่พบหน้าแผ่นงาน Code_Workspace กรุณากด Initialize ก่อน");

  const scriptId = ScriptApp.getScriptId();
  const url = "https://script.googleapis.com/v1/projects/" + scriptId + "/content";
  const options = { method: "get", headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());
  
  if (json.error) throw new Error("❌ API โดนบล็อก: " + json.error.message);

  if (ws.getLastRow() > 1) ws.getRange(2, 1, ws.getLastRow() - 1, 9).clearContent();

  const projectFiles = getProjectFileList();
  let allOutputRows = [];

  projectFiles.forEach(targetName => {
    const cleanTargetName = targetName.replace(/\.gs$/, "");
    const matchedFile = json.files.find(f => f.name === cleanTargetName);
    if (!matchedFile || !matchedFile.source) return;

    const lines = matchedFile.source.split(/\r?\n/);
    let braceCount = 0; let inFunction = false; let currentFunctionName = "";

    for (let i = 0; i < lines.length; i++) {
      const originalLine = lines[i]; const trimmedLine = originalLine.trim();
      let isFunctionStart = false; let functionName = "";

      const funcMatch = trimmedLine.match(/^(async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(/);
      if (funcMatch) { isFunctionStart = true; functionName = funcMatch[2]; currentFunctionName = functionName; inFunction = true; }
      braceCount += (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;

      allOutputRows.push([
        isFunctionStart ? targetName : "", "", isFunctionStart ? functionName : "", originalLine, "", "", targetName, currentFunctionName, ""
      ]);

      if (inFunction && braceCount <= 0 && (trimmedLine === "}" || trimmedLine.endsWith("}") || trimmedLine.includes("}"))) {
        inFunction = false; braceCount = 0; currentFunctionName = "";
        allOutputRows.push(["", "", "", "", "", "", targetName, "", ""]); 
      }
    }
  });

  if (allOutputRows.length > 0) {
    ws.getRange(2, 1, allOutputRows.length, 9).setValues(allOutputRows);
    const lineNumbers = []; const syncFormulas = []; const diffFormulas = [];
    const lastRowIndex = allOutputRows.length + 1;
    
    for (let k = 0; k < allOutputRows.length; k++) {
      const r = k + 2; lineNumbers.push([k + 1]);
      syncFormulas.push([`=IF(AND(ISBLANK(D${r}), ISBLANK(E${r})), "", IF(ISBLANK(E${r}), D${r}, E${r}))`]);
      diffFormulas.push([`=IF(AND(NOT(ISBLANK(E${r})), D${r}<>E${r}), 1, 0)`]);
    }
    ws.getRange("B2:B" + lastRowIndex).setValues(lineNumbers);
    ws.getRange("F2:F" + lastRowIndex).setFormulas(syncFormulas);
    ws.getRange("I2:I" + lastRowIndex).setFormulas(diffFormulas);
    
    // 🔥 [จุดแก้บั๊ก] สั่งให้ระบบสาดสีกลุ่มคำซ้ำทำงานทันทีหลังดึงข้อมูลเสร็จโดยไม่ต้องรอการพิมพ์จากมนุษย์!
    highlightDuplicateFunctions();
  }
  ss.toast("🔄 ดึงฐานข้อมูลรหัส 25 ไฟล์ลงบอร์ดคอลัมน์ F เรียบร้อย!", "DevOps Engine", 5);
}

function highlightDuplicateFunctions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_WORKSPACE);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const columnCRange = sheet.getRange(2, 3, lastRow - 1, 1);
  const values = columnCRange.getValues();
  const backgrounds = [];
  const textGroups = {};

  // ขั้นที่ 1: ล้างสีเก่าออกและจับกลุ่มคำลงอาเรย์หน่วยความจำ
  for (let i = 0; i < values.length; i++) {
    backgrounds.push([null]); 
    const cleanValue = values[i][0].toString().trim();
    if (cleanValue === "") continue;

    if (!textGroups[cleanValue]) {
      textGroups[cleanValue] = [];
    }
    textGroups[cleanValue].push(i);
  }

  // ขั้นที่ 2: แจกสีพาสเทลเฉพาะกลุ่มให้กับคำที่ซ้ำกัน
  for (const text in textGroups) {
    if (textGroups[text].length > 1) {
      const uniquePastelColor = generateRandomPastelColor();
      textGroups[text].forEach(index => {
        backgrounds[index][0] = uniquePastelColor;
      });
    }
  }

  // ขั้นที่ 3: สาดเขียนสีลงตารางในคำสั่งเดียว
  columnCRange.setBackgrounds(backgrounds);
}

/**
 * ฟังก์ชันช่วยสุ่มสีพาสเทลนุ่มตาอ่านง่าย
 */
function generateRandomPastelColor() {
  const r = Math.floor(Math.random() * 56) + 200;
  const g = Math.floor(Math.random() * 56) + 200;
  const b = Math.floor(Math.random() * 56) + 200;
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/**
 * เมนูย่อย: สลับสถานะ ยุบ/กาง แถวเนื้อโค้ดความเร็วสูง เหลือเฉพาะชื่อหัวข้อฟังก์ชันหลัก
 */
function toggleCodeVisibility() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); const ws = ss.getSheetByName(SHEET_WORKSPACE); if (!ws) return;
  const lastRow = ws.getLastRow(); if (lastRow <= 1) return;
  
  if (ws.isRowHiddenByUser(3)) {
    ws.showRows(2, lastRow - 1); ss.toast("🔓 กางแสดงสคริปต์รายบรรทัดเต็มระบบแล้ว", "DevOps Engine", 3);
  } else {
    const data = ws.getRange(2, 1, lastRow - 1, 3).getValues();
    let startRow = null; let blockLength = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0].toString().trim() === "" && data[i][2].toString().trim() === "") {
        if (blockLength === 0) startRow = i + 2; blockLength++;
      } else {
        if (blockLength > 0) { ws.hideRows(startRow, blockLength); blockLength = 0; }
      }
    }
    if (blockLength > 0) ws.hideRows(startRow, blockLength);
    ss.toast("🔒 โหมดย่นตาราง: แสดงเฉพาะโครงสร้างคลังสารบัญ", "DevOps Engine", 3);
  }
}

function handleLockCode(e) {
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  const targetFunc = sheet.getRange(row, 4).getValue().toString().trim() || sheet.getRange(row, 5).getValue().toString().trim();
  
  if (!targetFunc) {
    SpreadsheetApp.getUi().alert("⚠️ กรุณากรอกชื่อฟังก์ชันในช่องคอลัมน์ Changed หรือ Added ก่อนกดล็อกครับ");
    e.range.setValue("🧪 กำลังทดสอบ"); return;
  }
  
  const wsSheet = e.source.getSheetByName(SHEET_WORKSPACE);
  const wsData = wsSheet.getRange(2, 1, wsSheet.getLastRow() - 1, 9).getValues();
  let foundFile = wsData.find(r => r[2].toString().trim() === targetFunc)?.[6] || "";

  if (foundFile) {
    const matchedFullCode = wsData.filter(r => r[6].toString().trim() === foundFile).map(r => r[5]).join("\n");
    sheet.getRange(row, 7).setValue(matchedFullCode);
    sheet.getRange(row, 1).setValue(new Date());
    e.source.toast("🔒 รวมร่างโค้ดเสถียรไฟล์ " + foundFile + " เรียบร้อย!", "DevOps Engine", 5);
  } else {
    SpreadsheetApp.getUi().alert("❌ ไม่พบฟังก์ชันชื่อ '" + targetFunc + "' ครับน้อง");
    e.range.setValue("🧪 กำลังทดสอบ");
  }
}
// FILE: 10_DevOps_Core | FUNC: injectCodeFromSidebar
function injectCodeFromSidebar(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Code_Workspace");
  if (!sheet) return "❌ ไม่พบแผ่นงานชื่อ: Code_Workspace";

  const rawCode = payload.newCode || "";
  const lines = rawCode.split("\n");
  if (lines.length === 0 || !lines[0].trim()) {
    return "❌ โค้ดว่างเปล่า หรือไม่มีบรรทัดแรกระบุพิกัดภาระงาน";
  }

  // 🌟 [CRITICAL FIX] ปรับปรุง Regex ตัวสแกนชื่อไฟล์ให้รองรับช่องว่าง (เช่น 1_bot line.gs) โดยกวาดคำยาวไปจนกว่าจะชนเครื่องหมาย |
  const firstLine = lines[0].trim();
  const fileMatch = firstLine.match(/FILE:\s*([^|]+?)(?=\s*\||\s*FUNC|$)/i);
  const funcMatch = firstLine.match(/FUNC:\s*([a-zA-Z0-9_]+)/i);

  if (!fileMatch || !funcMatch) {
    return "❌ รูปแบบหัวนำทางบรรทัดแรกไม่ถูกต้อง (ต้องประกอบด้วย FILE: และ FUNC:)";
  }

  const fileName = fileMatch[1].trim();
  const functionName = funcMatch[1].trim();
  
  // 🌟 ลอกคราบตัดข้อความคอมเมนต์บรรทัดแรกทิ้งไป ไม่บันทึกลงตารางหากมีฟังก์ชันอยู่แล้ว
  const codeToSave = lines.slice(1).join("\n");

  const lastRow = sheet.getLastRow();
  const data = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 4).getValues() : [];
  
  let currentFile = "";
  let matchRow = -1;
  let lastRowOfFile = -1;

  for (let i = 0; i < data.length; i++) {
    let rowFile = data[i][0] ? data[i][0].toString().trim() : "";
    let rowFunc = data[i][2] ? data[i][2].toString().trim() : "";

    if (rowFile !== "") currentFile = rowFile;
    
    if (currentFile.toLowerCase() === fileName.toLowerCase()) {
      lastRowOfFile = i + 2; // บันทึกพิกัดท้ายสุดของไฟล์ไว้ เผื่อต้องแทรกแถวใหม่
      if (rowFunc.toLowerCase() === functionName.toLowerCase()) {
        matchRow = i + 2;
        break;
      }
    }
  }

  // 🎯 กรณีที่ 1: ตรวจพบฟังก์ชันเดิมอยู่แล้ว -> อัปเดตลง คอลัมน์ E (New Update)
  if (matchRow !== -1) {
    sheet.getRange(matchRow, 5).setValue(codeToSave);
    sheet.setActiveRange(sheet.getRange(matchRow, 5));
    return "🟢 โมดิฟายฟังก์ชันเดิมสำเร็จ! ระบบลอกคราบหัวไฟล์และหยอดเข้าไฟล์ [" + fileName + "] แถวที่ " + matchRow + " เรียบร้อยครับ";
  } 
  // 🎯 กรณีที่ 2: ไม่พบในระบบ (ฟังก์ชันใหม่เอี่ยม) -> แทรกแถวใหม่ในตำแหน่งที่เหมาะสม
  else {
    let insertAt = lastRowOfFile !== -1 ? lastRowOfFile + 1 : sheet.getLastRow() + 1;
    sheet.insertRowAfter(insertAt - 1);
    
    // พ่นโครงสร้างตรรกะตั้งต้นเข้าคอลัมน์หลักตามกฎ Data Validation 14 ไฟล์จริง
    sheet.getRange(insertAt, 1).setValue(fileName);
    sheet.getRange(insertAt, 2).setValue(1); 
    sheet.getRange(insertAt, 3).setValue(functionName);
    sheet.getRange(insertAt, 4).setValue(""); 
    sheet.getRange(insertAt, 5).setValue(codeToSave); 
    
    sheet.setActiveRange(sheet.getRange(insertAt, 5));
    return "✨ ติดตั้งฟังก์ชันใหม่เอี่ยม! เขียนชื่อไฟล์และชื่อฟังก์ชันลงคอลัมน์ตั้งต้น แถวที่ " + insertAt + " สำเร็จแล้วครับน้อง!";
  }
}
// 🌟 ฟังก์ชันเปิดแผงควบคุม Sidebar บนหน้า Google Sheets
function showDevOpsInjectorSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('InjectorSidebar')
      .setTitle('DevOps Workspace Injector (V11)')
      .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

// =================================================================
// 🚀 AGENT SKILLS: DevOps & Pipelines
// =================================================================

/**
 * 🛠️ Skill: skill-repair (ช่างซ่อมทักษะ AI)
 * ตรวจสอบความสมบูรณ์ของระบบหลังบ้าน และซ่อมแซม Token/Cache ที่ค้าง
 * @returns {Object} - ผลการซ่อมแซม
 */
function repairSystemSkills() {
  try {
    const cache = CacheService.getScriptCache();
    // 1. ซ่อม Cache ที่อาจจะบวมหรือค้าง
    clearBotPerfCacheIfStale(); 
    
    // 2. รีเซ็ตสถานะการเชื่อมต่อ AI
    const props = PropertiesService.getScriptProperties();
    const isBotActive = props.getProperty("SYSTEM_STATUS");
    if (!isBotActive) {
      props.setProperty("SYSTEM_STATUS", "ON");
    }
    
    return { success: true, message: "System skills repaired & Cache flushed." };
  } catch (error) {
    console.error("Skill Repair Error:", error);
    return { success: false, message: error.message };
  }
}

/**
 * 📦 Skill: uv-dependency-validator (ประยุกต์ใช้แทน uv ของ Python)
 * ตรวจสอบตัวแปรและ Library (Config) ที่สำคัญว่าครบถ้วนหรือไม่
 * @returns {Boolean}
 */
function validateSystemDependencies() {
  try {
    const props = PropertiesService.getScriptProperties();
    const requiredKeys = ["GEMINI_API_KEY_LINE", "EXTERNAL_DATABASE_ID", "ADMIN_LINE_IDS"];
    let isHealthy = true;
    let missing = [];
    
    requiredKeys.forEach(key => {
      if (!props.getProperty(key)) {
        isHealthy = false;
        missing.push(key);
      }
    });
    
    if (!isHealthy) console.warn("Missing Dependencies:", missing.join(", "));
    return isHealthy;
  } catch (error) {
    console.error("Dependency Check Error:", error);
    return false;
  }
}

/**
 * 🗄️ Skill: gcp-data-pipelines & dataform-bigquery (โครงร่าง)
 * เตรียมพร้อมท่อข้อมูลสำหรับยิงเข้า BigQuery เพื่อทำ Report ขั้นสูง
 * @param {Array} reportData - ข้อมูลสรุปรายวัน
 */
function exportPipelineToBigQuery(reportData) {
  try {
    // เป็นโครงร่างสำหรับอนาคต หากต้องการเปิดใช้งาน BigQuery API 
    // จะใช้ฟังก์ชันนี้ประกอบ JSON ยิงเข้า Google Cloud Storage / BigQuery
    console.log("Data Pipeline triggered. Ready to export " + reportData.length + " records.");
    // TODO: Implement BigQuery.Jobs.insert(...)
  } catch (error) {
    console.error("Pipeline Error:", error);
  }
}