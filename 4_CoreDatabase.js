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
      
      const isContOT = data.is_continuous_ot || data.isContinuousOT || false;
      const otHrs = calculateAndTimeEntryFromValues(block, rowIndex, data.time_start, data.time_end, emp.has_ot_noon, emp.ot_noon_in, emp.ot_noon_out, data.date, isContOT);
      
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

    sheet.getRange(startRow, 1, block.length, block[0].length).setValues(block);
    return { success: successCount, total: data.employees.length, errors: errors };
  } catch (err) {
    if (typeof logSystemEvent === "function") logSystemEvent("DB_ERROR", "writeToDailySheetBatch", err.message);
    return { count: 0, errors: ["เกิดข้อผิดพลาดภายในระบบ: " + err.message] };
  }
}

/**
 * คำนวณชั่วโมงการทำงานและลงเวลาลงในอาร์เรย์สองมิติ (Memory Block) โดยตรงเพื่อลดการอ่านเขียน Sheet หลายรอบ
 */
function calculateAndTimeEntryFromValues(block, rowIndex, sT, eT, isN, nI, nO, recordDate, isContinuousOT) {
  try {
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
    
    // [NEW] ตรวจสอบว่าเป็นการลง OT เย็นแยกต่างหากหรือไม่ (Smart Append OT)
    let currentNormHrs = parseFloat(block[rowIndex][CORE_DB.COL_NORMAL_HR - 1]) || 0;
    let isAppendEveningOT = (s >= 1020 && currentNormHrs > 0);
    
    // 1. คำนวณเวลาทำงานรวม และหักพักเที่ยง
    let totalMins = e - s;
    let breakStart = Math.max(s, 720);
    let breakEnd = Math.min(e, 780);
    let breakDuration = 0;
    
    if (breakStart < breakEnd) {
        breakDuration = breakEnd - breakStart;
        if (isN) {
            let otNIn = toM(nI || "12.00");
            let otNOut = toM(nO || "13.00");
            let otNDuration = Math.max(0, otNOut - otNIn);
            breakDuration = Math.max(0, breakDuration - otNDuration);
        }
    }
    
    // [NEW] กฎใหม่: หักพักสำหรับ OT เช้าและเย็น (เริ่ม 16/07/2026, ยกเว้นกรณี OT ต่อเนื่อง)
    let isNewOTRule = false;
    if (recordDate) {
        try {
            let p = String(recordDate).trim().split(/[\/\-]/);
            if (p.length >= 2) {
                let d = parseInt(p[0], 10) || 0;
                let m = parseInt(p[1], 10) || 0;
                let y = parseInt(p[2], 10) || new Date().getFullYear();
                if (y > 2500) y -= 543;
                else if (y >= 50 && y < 100) y = (2500 + y) - 543;
                else if (y < 50) y += 2000;
                
                let curDate = new Date(y, m - 1, d);
                let thresholdDate = new Date(2026, 6, 16); // 16 July 2026
                if (curDate >= thresholdDate) {
                    isNewOTRule = true;
                }
            }
        } catch (err) {}
    }

    if (isNewOTRule) {
        // Morning OT Break (07:30 - 08:00)
        let mBreakStart = Math.max(s, 450);
        let mBreakEnd = Math.min(e, 480);
        if (mBreakStart < mBreakEnd) {
            breakDuration += (mBreakEnd - mBreakStart);
        }

        // Evening OT Break (17:00 - 17:30)
        let eBreakStart = Math.max(s, 1020);
        let eBreakEnd = Math.min(e, 1050);
        if (eBreakStart < eBreakEnd && !isContinuousOT) {
            // หักพักเบรกเย็น 17:00 - 17:30 ของทุกคน โดยไม่มีเงื่อนไขเวลาเลิกงาน
            breakDuration += (eBreakEnd - eBreakStart);
        }
    }
    
    let actualWorkMins = totalMins - breakDuration;
    
    if (isAppendEveningOT) {
        let eveningOtMins = actualWorkMins;
        let currentOtMins = Math.round(parseFloat(block[rowIndex][CORE_DB.COL_OT_TOTAL - 1] || 0) * 60);
        
        block[rowIndex][CORE_DB.COL_OT_M_IN - 1 + 4] = toF(s);
        block[rowIndex][CORE_DB.COL_OT_M_IN - 1 + 5] = toF(e);
        
        let newOtTotal = currentOtMins + eveningOtMins;
        block[rowIndex][CORE_DB.COL_OT_TOTAL - 1] = newOtTotal > 0 ? toHrs(newOtTotal) : "";
        return toHrs(newOtTotal);
    }

    let normMins = 0;
    let otMins = 0;
    let otData = ["", "", "", "", "", "", ""];

    // 2. จัดสรรเวลาตามกฎ 8 ชั่วโมง (ห้ามนำเวลาหลัง 17.00 มาปัดเป็น OT ถ้ารวมไม่ถึง 8 ชม.)
    if (actualWorkMins <= 480) {
        normMins = actualWorkMins;
        otMins = 0;
    } else {
        normMins = 480;
        otMins = actualWorkMins - 480;
        let remainingOt = otMins;
        
        // 2.1 ลงช่อง OT เที่ยงก่อน (ถ้ามีการระบุ)
        if (isN && remainingOt > 0) {
            let otNIn = toM(nI || "12.00");
            let otNOut = toM(nO || "13.00");
            let otNDuration = Math.max(0, otNOut - otNIn);
            let assigned = Math.min(remainingOt, otNDuration);
            if (assigned > 0) {
                otData[2] = toF(otNIn);
                otData[3] = toF(otNIn + assigned);
                remainingOt -= assigned;
            }
        }
        
        // 2.2 ลงช่อง OT เช้า (ถ้ายอดเริ่มงานก่อน 08.00 น.)
        if (s < 480 && remainingOt > 0) {
            let availableMorning = 0;
            if (isNewOTRule) {
                let endM = Math.min(450, e);
                availableMorning = Math.max(0, endM - s);
            } else {
                availableMorning = Math.max(0, Math.min(480, e) - s);
            }
            let morningOtDuration = Math.min(availableMorning, remainingOt);
            if (morningOtDuration > 0) {
                otData[0] = toF(s);
                otData[1] = toF(s + morningOtDuration);
                remainingOt -= morningOtDuration;
            }
        }
        
        // 2.3 ถ้ายังมี OT เหลือ ให้ไปลงช่อง OT เย็น
        if (remainingOt > 0) {
            let otEIn = 0;
            if (isNewOTRule && !isContinuousOT && e > 1050) {
                otEIn = Math.max(1050, e - remainingOt);
            } else if (!isNewOTRule && e > 1020) {
                otEIn = Math.max(1020, e - remainingOt);
            } else {
                otEIn = Math.max(1020, e - remainingOt);
            }
            otData[4] = toF(otEIn);
            otData[5] = toF(otEIn + remainingOt);
            remainingOt -= remainingOt;
        }
    }

    // 3. อัปเดตข้อมูลลงใน block
    block[rowIndex][CORE_DB.COL_NORMAL_HR - 1] = normMins > 0 ? toHrs(normMins) : "";
    for (let i = 0; i < 6; i++) {
        block[rowIndex][CORE_DB.COL_OT_M_IN - 1 + i] = otData[i];
    }
    block[rowIndex][CORE_DB.COL_OT_TOTAL - 1] = otMins > 0 ? toHrs(otMins) : "";
    
    return toHrs(otMins);
  } catch (err) {
    console.error("calculateAndTimeEntryFromValues error: " + err.message);
    return 0;
  }
}