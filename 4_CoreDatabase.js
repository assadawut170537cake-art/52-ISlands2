// =================================================================
// 4_CoreDatabase.gs (ฟังก์ชัน Batch Write และตรรกะคำนวณเวลาฉบับสมบูรณ์ V.2)
// =================================================================

var CORE_DB = {
  START_ROW: 3,      
  COL_NAME_CHECK: 4, 
  COL_SITE: 6,       
  COL_WORK: 7,       
  COL_NORMAL_HR: 8,  
  COL_OT_M_IN: 11,   
  COL_OT_M_OUT: 12,  
  COL_OT_N_IN: 13,   
  COL_OT_N_OUT: 14,  
  COL_OT_E_IN: 15,   
  COL_OT_E_OUT: 16,  
  COL_OT_TOTAL: 17,  
  COL_ACCOM: 20      
};

function writeToDailySheetBatch(data, userId, fileId) {
  try {
    if (!fileId) return { count: 0, errors: ["ไม่พบลิงก์ไฟล์เดือนนี้"] };
  const ss = SpreadsheetApp.openById(fileId);
  const sheetName = typeof parseThaiDate === 'function' ? parseThaiDate(data.date) : data.date;
  
  // 🛠️ ค้นหาแท็บแบบทนทานต่อช่องว่าง (Space-Tolerant Finder)
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    const sheets = ss.getSheets();
    const cleanTarget = sheetName.replace(/\s+/g, "");
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].getName().replace(/\s+/g, "") === cleanTarget) {
        sheet = sheets[i];
        break;
      }
    }
  }
  
  if (!sheet) return { count: 0, errors: ["ไม่พบหน้า Sheet วันที่: " + sheetName] };
  
  const startRow = CORE_DB.START_ROW;
  const lastRow = sheet.getLastRow();
  const numRows = Math.max(0, lastRow - startRow + 1);
  if (numRows === 0) return { count: 0, errors: ["Sheet ว่างเปล่า ไม่มีรายชื่อพนักงานเลย"] };

  const fullCols = 20; 
  const blockRange = sheet.getRange(startRow, 1, numRows, fullCols);
  const block = blockRange.getValues();
  
  let successCount = 0; 
  let errors = [];

  data.employees.forEach(emp => {
    const inputName = typeof normalize === 'function' ? normalize(emp.firstname) : emp.firstname;
    let rowIndex = -1;
    
    let bestScore = 0;
    const fuzzyThreshold = parseFloat(typeof getDynamicConfig === 'function' ? getDynamicConfig("FUZZY_THRESHOLD") : 0.8) || 0.8;
    
    // 🔮 กู้คืนระบบ Fuzzy Logic กลับมาใช้งาน เพื่อป้องกันปัญหาค้นหาชื่อพนักงานไม่พบเวลาพิมพ์ผิดเล็กน้อย
    for (let i = 0; i < block.length; i++) {
      const rowName = typeof normalize === 'function' ? normalize(block[i][CORE_DB.COL_NAME_CHECK - 1]) : block[i][CORE_DB.COL_NAME_CHECK - 1]; 
      if (!rowName) continue;
      
      const score = typeof getStringSimilarity === 'function' ? getStringSimilarity(inputName, rowName) : (rowName === inputName ? 1.0 : 0);
      
      if (score === 1.0 || (score >= fuzzyThreshold && score > bestScore)) {
        bestScore = score;
        rowIndex = i;
        if (score === 1.0) break; // ตรงเป๊ะออกเลย
      }
    }

    if (rowIndex !== -1) {
      block[rowIndex][CORE_DB.COL_SITE - 1] = data.default_site;
      block[rowIndex][CORE_DB.COL_WORK - 1] = emp.task;
      
      let empAccom = emp.accom;
      if (empAccom && empAccom !== "-" && empAccom !== "เดิม") {
        block[rowIndex][CORE_DB.COL_ACCOM - 1] = empAccom;
      }
      
      const otHrs = calculateAndTimeEntryFromValues(block, rowIndex, data.time_start, data.time_end, emp.has_ot_noon, emp.ot_noon_in, emp.ot_noon_out);
      
      if (otHrs > 0) { 
         block[rowIndex][8] = data.default_site; 
         block[rowIndex][9] = emp.task;          
      } else { 
         block[rowIndex][8] = ""; 
         block[rowIndex][9] = ""; 
      }
      successCount++;
    } else {
      errors.push(emp.firstname);
    }
  });

    blockRange.setValues(block);
    return { count: successCount, errors: errors };
  } catch (err) {
    if (typeof logSystemEvent === "function") logSystemEvent("DB_ERROR", "writeToDailySheetBatch", err.message);
    return { count: 0, errors: ["เกิดข้อผิดพลาดภายในระบบ: " + err.message] };
  }
}

/**
 * คำนวณเวลาทำงานปกติและ OT ตามมาตรฐาน CORE_DB
 */
function calculateAndTimeEntryFromValues(block, rowIndex, sT, eT, isN, nI, nO) {
  if (!eT || eT.toString().trim() === "") {
    block[rowIndex][CORE_DB.COL_NORMAL_HR - 1] = "";
    for (let c = 0; c < 7; c++) block[rowIndex][CORE_DB.COL_OT_M_IN - 1 + c] = "";
    return 0;
  }
  
  const toM = (t) => { const p = t.toString().replace('.', ':').split(':'); return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0); };
  const toF = (m) => { let h = Math.floor(m / 60) % 24; return (h < 10 ? "0" + h : h) + "." + (m % 60 < 10 ? "0" + m % 60 : m % 60); };
  const toHrs = (m) => parseFloat((m / 60).toFixed(2));

  const s = toM(sT); let e = toM(eT);
  if (e === 0) return 0;
  if (e < s) e += 1440; 

  let otData = ["", "", "", "", "", "", ""];
  let otT = 0; let normHr = "";

  // คำนวณเวลาตามช่วง
  if (s < 480) { otData[0] = toF(s); otData[1] = "08.00"; otT += (480 - s); }
  const nIn = Math.max(s, 480); const nOut = Math.min(e, 1020);
  let nDur = Math.max(0, nOut - nIn);
  if (nIn <= 720 && nOut >= 780) nDur -= 60; // หักพักเที่ยง

  if (isN) { otData[2] = nI || "12.00"; otData[3] = nO || "13.00"; otT += (toM(otData[3]) - toM(otData[2])); }
  if (e > 1020) { otData[4] = "17.00"; otData[5] = toF(e); otT += (e - 1020); }

  // เติม OT ลงในเวลาทำงานปกติที่ขาด (ถ้ามี)
  let gap = 480 - nDur;
  if (gap > 0 && otT > 0) {
      let fill = Math.min(gap, otT);
      nDur += fill; otT -= fill;
  }
  
  if (nDur > 0) normHr = toHrs(nDur);
  if (otT > 0) otData[6] = toHrs(otT);

  // อัปเดตข้อมูลลงใน block
  block[rowIndex][CORE_DB.COL_NORMAL_HR - 1] = normHr || "";
  for (let i = 0; i < 7; i++) block[rowIndex][CORE_DB.COL_OT_M_IN - 1 + i] = otData[i];
  
  return toHrs(otT);
}