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

function writeToDailySheet(data, userId, fileId) {
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
  let processedNames = [];
  let replyAccom = "ไม่ได้ระบุ";

  data.employees.forEach(emp => {
    const inputName = typeof normalize === 'function' ? normalize(emp.firstname) : emp.firstname;
    let rowIndex = -1;

    // 🔒 ปิดระบบ Fuzzy และ Includes: บังคับให้ชื่อต้องตรงกันเป๊ะๆ (Exact Match) 100% เท่านั้น
    for (let i = 0; i < block.length; i++) {
      const sheetName = typeof normalize === 'function' ? normalize(block[i][CORE_DB.COL_NAME_CHECK - 1]) : block[i][CORE_DB.COL_NAME_CHECK - 1];
      if (sheetName === inputName) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex !== -1) {
      if (data.site) block[rowIndex][CORE_DB.COL_SITE - 1] = data.site;
      if (data.work) block[rowIndex][CORE_DB.COL_WORK - 1] = data.work;

      if (!data.isOTDetailsOnly) {
        const accomVal = block[rowIndex][CORE_DB.COL_ACCOM - 1];
        if (accomVal) replyAccom = accomVal;
      }

      const hasOTInput = (data.timeOut && typeof parseTime === 'function' && parseTime(data.timeOut) > 1020);
      let calculatedOT = 0;

      if (data.timeIn && data.timeOut && !data.isOTDetailsOnly) {
        calculatedOT = calculateAndFillTimes(block, rowIndex, data.timeIn, data.timeOut);
      } else if (data.otHours !== undefined) {
        let currentOT = parseFloat(block[rowIndex][CORE_DB.COL_OT_TOTAL - 1]) || 0;
        let newOT = data.otHours + currentOT;
        block[rowIndex][CORE_DB.COL_OT_TOTAL - 1] = newOT;
        calculatedOT = newOT;
      }

      if (typeof updateEmpRecordInState === 'function') {
        updateEmpRecordInState(emp.firstname, data.site, data.work, data.timeIn, data.timeOut, calculatedOT);
      }

      successCount++;
      processedNames.push(emp.firstname);
    } else {
      errors.push(emp.firstname);
    }
  });

  if (successCount > 0) {
    blockRange.setValues(block);
  }

  return { count: successCount, errors: errors, accom: replyAccom, processedNames: processedNames };
}

function calculateAndFillTimes(block, rowIndex, tInStr, tOutStr) {
  let tIn = parseTime(tInStr), tOut = parseTime(tOutStr);
  if (tIn > tOut && tOut < 480) tOut += 1440;

  let nDur = 0, otT = 0, normHr = 0;
  let otData = ["", "", "", "", "", "", ""];

  if (tOut <= 1020) {
    nDur = tOut - tIn;
    if (tIn <= 720 && tOut >= 780) nDur -= 60;
  } else {
    if (tIn < 1020) {
      nDur = 1020 - tIn;
      if (tIn <= 720) nDur -= 60;

      if (tOut > 1020 && tOut <= 1440) {
        otT = tOut - 1020;
        otData[4] = "17.00";
        otData[5] = formatTime(tOut);
      } else if (tOut > 1440) {
        otT = 420 + (tOut - 1440);
        otData[4] = "17.00";
        otData[5] = "24.00";
        otData[2] = "00.00";
        otData[3] = formatTime(tOut - 1440);
      }
    } else {
      if (tOut <= 1440) {
        otT = tOut - tIn;
        otData[4] = formatTime(tIn);
        otData[5] = formatTime(tOut);
      } else {
        otT = (1440 - tIn) + (tOut - 1440);
        otData[4] = formatTime(tIn);
        otData[5] = "24.00";
        otData[2] = "00.00";
        otData[3] = formatTime(tOut - 1440);
      }
    }
  }

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

/**
 * ดึงสรุปข้อมูล Check-in และรายชื่อพนักงานที่ขาดงานประจำวัน
 * @param {string} dateStr วันที่รูปแบบ DD/MM/YYYY หรือ Date object
 * @returns {Object} { checkedIn: [], absent: [], total: number, dateStr: string, error: string }
 */
function getDailyCheckInSummary(dateStr) {
  try {
    const formattedDate = typeof parseThaiDate === 'function' ? parseThaiDate(dateStr) : dateStr;
    const fileId = typeof getTargetFileIdByDate === 'function' ? getTargetFileIdByDate(dateStr) : null;

    if (!fileId) return { error: "ไม่พบฐานข้อมูล Monthly Vault ของเดือนนี้", checkedIn: [], absent: [] };

    const ss = SpreadsheetApp.openById(fileId);

    // ค้นหาแท็บ
    let sheet = ss.getSheetByName(formattedDate);
    if (!sheet) {
      const sheets = ss.getSheets();
      const cleanTarget = formattedDate.replace(/\s+/g, "");
      for (let i = 0; i < sheets.length; i++) {
        if (sheets[i].getName().replace(/\s+/g, "") === cleanTarget) {
          sheet = sheets[i];
          break;
        }
      }
    }

    if (!sheet) return { error: "ไม่พบหน้า Sheet ของวันที่: " + formattedDate, checkedIn: [], absent: [] };

    const startRow = CORE_DB.START_ROW;
    const lastRow = Math.max(startRow, sheet.getLastRow());
    if (lastRow < startRow) return { checkedIn: [], absent: [], total: 0, dateStr: formattedDate };

    const numRows = lastRow - startRow + 1;
    // อ่านข้อมูล 20 คอลัมน์
    const block = sheet.getRange(startRow, 1, numRows, 20).getValues();

    let checkedIn = [];
    let absent = [];

    for (let i = 0; i < block.length; i++) {
      const row = block[i];
      const name = (row[CORE_DB.COL_NAME_CHECK - 1] || "").toString().trim();
      if (!name) continue; // ข้ามแถวว่าง

      const site = (row[CORE_DB.COL_SITE - 1] || "").toString().trim();
      const normHr = (row[CORE_DB.COL_NORMAL_HR - 1] || "").toString().trim();
      const otHr = (row[CORE_DB.COL_OT_TOTAL - 1] || "").toString().trim();

      // เงื่อนไข: ถ้ามี Site หรือ ชั่วโมงปกติ หรือ OT ถือว่าเข้างานแล้ว
      if (site !== "" || normHr !== "" || otHr !== "") {
        checkedIn.push({
          name: name,
          site: site || "ระบุไซต์งานไม่ชัดเจน",
          normHr: normHr,
          otHr: otHr
        });
      } else {
        absent.push(name);
      }
    }

    return {
      checkedIn: checkedIn,
      absent: absent,
      total: checkedIn.length + absent.length,
      dateStr: formattedDate
    };

  } catch (err) {
    if (typeof logToCloud === "function") logToCloud("System_CoreDB", "ERROR", err.message, { function: "getDailyCheckInSummary" });
    return { error: "เกิดข้อผิดพลาดในการดึงข้อมูล: " + err.message, checkedIn: [], absent: [] };
  }
}