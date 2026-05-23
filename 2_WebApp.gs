// =================================================================
// 2_WebApp.gs (ระบบ Web Dashboard และ Spreadsheet UI)
// =================================================================

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Interactive_Manual')
      .setTitle('คู่มือ Smart Worksite')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
// =================================================================
// 2_WebApp.gs (ระบบ Web Dashboard และ Spreadsheet UI)
// =================================================================
/**
 * 🔗 API สำหรับให้ Web App ในอนาคตเรียกใช้ตั้งค่าระบบ
 */
function apiSaveConfigFromWeb(key, value) {
  return setDynamicConfig(key, value);
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

  sheet.getRange("B2:I4").merge().setBackground("#0F172A").setValue("🏢 SMART WORKSITE DASHBOARD").setFontColor("#FFFFFF").setFontSize(24).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true, true, true, true, false, false, "#0F172A", SpreadsheetApp.BorderStyle.SOLID_THICK);
  sheet.getRange("B5:I5").merge().setBackground("#1E293B").setValue("💡 กดติ๊กถูก ☑️ ที่กล่องด้านซ้าย เพื่อเปิดเอกสาร (คลิกเพียง 1 ครั้ง)").setFontColor("#38BDF8").setFontSize(11).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");

  let unprotectedRanges = [sheet.getRange("A1")];

  function createPillButton(row, colCheck, colText, icon, label, isHighlight = false) {
    const checkCell = sheet.getRange(row, colCheck); const textCell = sheet.getRange(row, colText);
    const bgColor = isHighlight ? "#E0F2FE" : "#FFFFFF"; const borderColor = isHighlight ? "#38BDF8" : "#CBD5E1"; const textColor = isHighlight ? "#0284C7" : "#334155";
    checkCell.insertCheckboxes().setBackground(bgColor).setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true, true, true, false, false, false, borderColor, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    textCell.setValue(`${icon}  ${label}`).setBackground(bgColor).setFontColor(textColor).setFontSize(12).setFontWeight(isHighlight ? "bold" : "normal").setHorizontalAlignment("left").setVerticalAlignment("middle").setBorder(true, false, true, true, false, false, borderColor, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    unprotectedRanges.push(checkCell);
  }

  sheet.getRange("B7:I7").merge().setValue("⚙️ ส่วนจัดการระบบ (System)").setFontWeight("bold").setFontColor("#64748B").setFontSize(11);
  createPillButton(9, 2, 3, GLOBAL_CONFIG.ICONS.SYSTEM.SUMMARY, "สรุปภาพรวมปี"); createPillButton(9, 5, 6, GLOBAL_CONFIG.ICONS.SYSTEM.DATA, "ฐานข้อมูล (Admin)");
  createPillButton(11, 2, 3, GLOBAL_CONFIG.ICONS.SYSTEM.GUIDE, "คู่มือการใช้งาน"); createPillButton(11, 5, 6, GLOBAL_CONFIG.ICONS.SYSTEM.FEEDBACK, "แจ้งปัญหา");

  sheet.getRange("B13:I13").merge().setValue("📅 คลังข้อมูลรายเดือน (Monthly Vault)").setFontWeight("bold").setFontColor("#64748B").setFontSize(11);
  const currentMonthIndex = new Date().getMonth(); const monthRows = [15, 17, 19, 21]; let mIndex = 0;
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
  if (!e || !e.range || e.range.getSheet().getName() !== "Main Menu" || (e.value !== "TRUE" && e.value !== true)) return;
  const row = e.range.getRow(); 
  const col = e.range.getColumn(); 
  let targetUrl = "";
  
  if (row === 9) targetUrl = col === 2 ? GLOBAL_CONFIG.URLS.SUMMARY : GLOBAL_CONFIG.URLS.DATA;
  else if (row === 11) targetUrl = col === 2 ? GLOBAL_CONFIG.URLS.GUIDE : GLOBAL_CONFIG.URLS.FEEDBACK;
  else if (row === 15) targetUrl = GLOBAL_CONFIG.URLS.MONTHS[col===2 ? 0 : (col===5 ? 1 : 2)];
  else if (row === 17) targetUrl = GLOBAL_CONFIG.URLS.MONTHS[col===2 ? 3 : (col===5 ? 4 : 5)];
  else if (row === 19) targetUrl = GLOBAL_CONFIG.URLS.MONTHS[col===2 ? 6 : (col===5 ? 7 : 8)];
  else if (row === 21) targetUrl = GLOBAL_CONFIG.URLS.MONTHS[col===2 ? 9 : (col===5 ? 10 : 11)];

  SpreadsheetApp.getActiveSpreadsheet().toast("⏳ กำลังเปิดเอกสาร กรุณารอสักครู่...", "🚀 ระบบทำงาน", 3);
  e.range.uncheck(); 
  e.range.getSheet().getRange("A1").activate();
  if (targetUrl) openLinkInNewTab(targetUrl);
}

function openLinkInNewTab(url) {
  const html = HtmlService.createHtmlOutput(`<html><body style="font-family: sans-serif; text-align: center; margin-top: 25px; color: #334155;"><h3 style="color: #1E3A8A;">กำลังเปิดเอกสาร...</h3><div class="loader" style="border: 4px solid #f3f3f3; border-top: 4px solid #38BDF8; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto;"></div><div id="fallback" style="display:none; margin-top:15px;"><small style="color:#DC2626;">เบราว์เซอร์บล็อกการเปิดอัตโนมัติ</small><br><br><a href="${url}" target="_blank" onclick="google.script.host.close()" style="padding: 10px 20px; background: #1E3A8A; color: white; text-decoration: none; border-radius: 6px; display: inline-block;">คลิกที่นี่เพื่อไปที่ไฟล์</a></div><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style><script>setTimeout(function() { var winRef = window.open('${url}', '_blank'); if (winRef) { google.script.host.close(); } else { document.getElementById('fallback').style.display = 'block'; document.querySelector('.loader').style.display = 'none'; } }, 500);</script></body></html>`).setWidth(320).setHeight(180);
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
/**
 * 🔗 API สำหรับให้ Web App ในอนาคตเรียกใช้ตั้งค่าระบบ
 */
function apiSaveConfigFromWeb(key, value) {
  return setDynamicConfig(key, value);
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

  sheet.getRange("B2:I4").merge().setBackground("#0F172A").setValue("🏢 SMART WORKSITE DASHBOARD").setFontColor("#FFFFFF").setFontSize(24).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true, true, true, true, false, false, "#0F172A", SpreadsheetApp.BorderStyle.SOLID_THICK);
  sheet.getRange("B5:I5").merge().setBackground("#1E293B").setValue("💡 กดติ๊กถูก ☑️ ที่กล่องด้านซ้าย เพื่อเปิดเอกสาร (คลิกเพียง 1 ครั้ง)").setFontColor("#38BDF8").setFontSize(11).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");

  let unprotectedRanges = [sheet.getRange("A1")];

  function createPillButton(row, colCheck, colText, icon, label, isHighlight = false) {
    const checkCell = sheet.getRange(row, colCheck); const textCell = sheet.getRange(row, colText);
    const bgColor = isHighlight ? "#E0F2FE" : "#FFFFFF"; const borderColor = isHighlight ? "#38BDF8" : "#CBD5E1"; const textColor = isHighlight ? "#0284C7" : "#334155";
    checkCell.insertCheckboxes().setBackground(bgColor).setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true, true, true, false, false, false, borderColor, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    textCell.setValue(`${icon}  ${label}`).setBackground(bgColor).setFontColor(textColor).setFontSize(12).setFontWeight(isHighlight ? "bold" : "normal").setHorizontalAlignment("left").setVerticalAlignment("middle").setBorder(true, false, true, true, false, false, borderColor, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    unprotectedRanges.push(checkCell);
  }

  sheet.getRange("B7:I7").merge().setValue("⚙️ ส่วนจัดการระบบ (System)").setFontWeight("bold").setFontColor("#64748B").setFontSize(11);
  createPillButton(9, 2, 3, GLOBAL_CONFIG.ICONS.SYSTEM.SUMMARY, "สรุปภาพรวมปี"); createPillButton(9, 5, 6, GLOBAL_CONFIG.ICONS.SYSTEM.DATA, "ฐานข้อมูล (Admin)");
  createPillButton(11, 2, 3, GLOBAL_CONFIG.ICONS.SYSTEM.GUIDE, "คู่มือการใช้งาน"); createPillButton(11, 5, 6, GLOBAL_CONFIG.ICONS.SYSTEM.FEEDBACK, "แจ้งปัญหา");

  sheet.getRange("B13:I13").merge().setValue("📅 คลังข้อมูลรายเดือน (Monthly Vault)").setFontWeight("bold").setFontColor("#64748B").setFontSize(11);
  const currentMonthIndex = new Date().getMonth(); const monthRows = [15, 17, 19, 21]; let mIndex = 0;
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
  if (!e || !e.range || e.range.getSheet().getName() !== "Main Menu" || (e.value !== "TRUE" && e.value !== true)) return;
  const row = e.range.getRow(); 
  const col = e.range.getColumn(); 
  let targetUrl = "";
  
  if (row === 9) targetUrl = col === 2 ? GLOBAL_CONFIG.URLS.SUMMARY : GLOBAL_CONFIG.URLS.DATA;
  else if (row === 11) targetUrl = col === 2 ? GLOBAL_CONFIG.URLS.GUIDE : GLOBAL_CONFIG.URLS.FEEDBACK;
  else if (row === 15) targetUrl = GLOBAL_CONFIG.URLS.MONTHS[col===2 ? 0 : (col===5 ? 1 : 2)];
  else if (row === 17) targetUrl = GLOBAL_CONFIG.URLS.MONTHS[col===2 ? 3 : (col===5 ? 4 : 5)];
  else if (row === 19) targetUrl = GLOBAL_CONFIG.URLS.MONTHS[col===2 ? 6 : (col===5 ? 7 : 8)];
  else if (row === 21) targetUrl = GLOBAL_CONFIG.URLS.MONTHS[col===2 ? 9 : (col===5 ? 10 : 11)];

  SpreadsheetApp.getActiveSpreadsheet().toast("⏳ กำลังเปิดเอกสาร กรุณารอสักครู่...", "🚀 ระบบทำงาน", 3);
  e.range.uncheck(); 
  e.range.getSheet().getRange("A1").activate();
  if (targetUrl) openLinkInNewTab(targetUrl);
}

function openLinkInNewTab(url) {
  const html = HtmlService.createHtmlOutput(`<html><body style="font-family: sans-serif; text-align: center; margin-top: 25px; color: #334155;"><h3 style="color: #1E3A8A;">กำลังเปิดเอกสาร...</h3><div class="loader" style="border: 4px solid #f3f3f3; border-top: 4px solid #38BDF8; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto;"></div><div id="fallback" style="display:none; margin-top:15px;"><small style="color:#DC2626;">เบราว์เซอร์บล็อกการเปิดอัตโนมัติ</small><br><br><a href="${url}" target="_blank" onclick="google.script.host.close()" style="padding: 10px 20px; background: #1E3A8A; color: white; text-decoration: none; border-radius: 6px; display: inline-block;">คลิกที่นี่เพื่อไปที่ไฟล์</a></div><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style><script>setTimeout(function() { var winRef = window.open('${url}', '_blank'); if (winRef) { google.script.host.close(); } else { document.getElementById('fallback').style.display = 'block'; document.querySelector('.loader').style.display = 'none'; } }, 500);</script></body></html>`).setWidth(320).setHeight(180);
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