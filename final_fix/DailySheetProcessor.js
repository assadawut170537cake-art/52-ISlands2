/**
 * หน้าที่การทำงาน: บันทึกข้อมูลการทำงาน ไซต์งาน และค่าล่วงเวลา (OT) ของพนักงานลงในสเปรดชีตประจำวัน
 * รองรับการค้นหาแผ่นงานแบบยืดหยุ่นและการจับคู่รายชื่อด้วยระบบ Exact Match และ Fuzzy Logic บนหน่วยความจำ (Bulk Processing)
 * * @param {Object} data - วัตถุข้อมูลหลักที่ส่งมาจากระบบ (ประกอบด้วยวันที่ ไซต์งาน และอาเรย์รายชื่อพนักงาน)
 * @param {string} userId - ไอดีของผู้ใช้งานที่ทำการบันทึกข้อมูล
 * @param {string} fileId - ไอดีของไฟล์ Google Spreadsheet ประจำเดือน
 * @return {Object} วัตถุผลลัพธ์การทำงาน { count: 0, errors: [], accom: "ไม่ได้ระบุ", processedNames: [] }
 */
function writeToDailySheet(data, userId, fileId) {
  try {
    if (!fileId) {
      return { count: 0, errors: ["ไม่พบลิงก์ไฟล์เดือนนี้"], accom: "ไม่ได้ระบุ", processedNames: [] };
    }

    const ss = SpreadsheetApp.openById(fileId);
    const sheetName = typeof parseThaiDate === 'function' ? parseThaiDate(data.date) : data.date;

    // 🛠️ ค้นหาแท็บแผ่นงานแบบทนทานต่อช่องว่าง (Space-Tolerant Finder)
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

    if (!sheet) {
      return { count: 0, errors: ["ไม่พบหน้าวันที่: " + sheetName], accom: "ไม่ได้ระบุ", processedNames: [] };
    }

    // กำหนดค่าตำแหน่งแถวเริ่มต้นเริ่มต้นจากโครงสร้างคอนฟิก
    const startRow = (typeof CORE_DB !== 'undefined' && CORE_DB.START_ROW) ? CORE_DB.START_ROW : 3;
    const lastRow = sheet.getLastRow();
    const numRows = Math.max(0, lastRow - startRow + 1);
    
    if (numRows === 0) {
      return { count: 0, errors: ["Sheet ว่างเปล่า ไม่มีรายชื่อพนักงานเลย"], accom: "ไม่ได้ระบุ", processedNames: [] };
    }

    const fullCols = 20;
    const blockRange = sheet.getRange(startRow, 1, numRows, fullCols);
    const block = blockRange.getValues();

    let successCount = 0;
    let errors = [];
    let processedNames = [];
    let replyAccom = "ไม่ได้ระบุ";

    // ดึงค่ามาตรฐานคอนฟิกสำหรับระบุพิกัดคอลัมน์ (Fallback โครงสร้างตัวแปรทั้งสองเวอร์ชัน)
    const colNameCheck = (typeof CORE_DB !== 'undefined') ? CORE_DB.COL_NAME_CHECK : 4;
    const colSite = (typeof CORE_DB !== 'undefined') ? CORE_DB.COL_SITE : (typeof GLOBAL_CONFIG !== 'undefined' ? GLOBAL_CONFIG.COL_SITE : 5);
    const colWork = (typeof CORE_DB !== 'undefined') ? CORE_DB.COL_WORK : (typeof GLOBAL_CONFIG !== 'undefined' ? GLOBAL_CONFIG.COL_WORK : 6);
    const colAccom = (typeof CORE_DB !== 'undefined') ? CORE_DB.COL_ACCOM : (typeof GLOBAL_CONFIG !== 'undefined' ? GLOBAL_CONFIG.COL_ACCOM : 7);
    const colOtTotal = (typeof CORE_DB !== 'undefined') ? CORE_DB.COL_OT_TOTAL : 11;

    // ดึงระดับความแม่นยำในการค้นหาชื่อ (Fuzzy Threshold)
    let fuzzyThreshold = 0.85;
    if (typeof getDynamicConfig === 'function') {
      const configValue = getDynamicConfig("FUZZY_THRESHOLD");
      if (configValue) fuzzyThreshold = parseFloat(configValue);
    }

    data.employees.forEach(emp => {
      const inputName = typeof normalize === 'function' ? normalize(emp.firstname) : emp.firstname;
      let rowIndex = -1;
      let bestScore = 0;

      // 🔍 ขั้นตอนที่ 1: ค้นหาด้วยระบบความแม่นยำ 100% (Exact Match) ก่อนเป็นอันดับแรก
      for (let i = 0; i < block.length; i++) {
        const sheetNameValue = typeof normalize === 'function' ? normalize(block[i][colNameCheck - 1]) : block[i][colNameCheck - 1];
        if (sheetNameValue === inputName) {
          rowIndex = i;
          bestScore = 1.0;
          break;
        }
      }

      // 🔮 ขั้นตอนที่ 2: ระบบตรวจจับด้วย Fuzzy Logic ทำงานเมื่อไม่พบชื่อตรงเป๊ะ
      if (rowIndex === -1 && typeof getStringSimilarity === 'function') {
        for (let i = 0; i < block.length; i++) {
          const sheetNameValue = typeof normalize === 'function' ? normalize(block[i][colNameCheck - 1]) : block[i][colNameCheck - 1];
          if (!sheetNameValue) continue;

          const score = getStringSimilarity(inputName, sheetNameValue);
          if (score >= fuzzyThreshold && score > bestScore) {
            bestScore = score;
            rowIndex = i;
          }
        }
      }

      // ทำการปรับปรุงข้อมูลภายในบล็อกอาเรย์หน่วยความจำเมื่อจับคู่สำเร็จ
      if (rowIndex !== -1) {
        const targetSite = data.site || data.default_site;
        const targetWork = emp.task || data.work;

        if (targetSite) block[rowIndex][colSite - 1] = targetSite;
        if (targetWork) block[rowIndex][colWork - 1] = targetWork;

        // จัดการสถานะและข้อมูลที่พักของพนักงาน (Accommodation)
        if (!data.isOTDetailsOnly) {
          let empAccom = emp.accom;
          if (!empAccom || empAccom === "-" || empAccom === "เดิม") {
            empAccom = block[rowIndex][colAccom - 1];
          } else {
            block[rowIndex][colAccom - 1] = empAccom;
          }
          if (successCount === 0) {
            replyAccom = empAccom || "ไม่ได้ระบุ";
          }
        }

        // ประมวลผลและคำนวณรอบเวลาการทำโอที (OT Calculation)
        let calculatedOT = 0;
        if (data.timeIn && data.timeOut && !data.isOTDetailsOnly) {
          if (typeof calculateAndFillTimes === 'function') {
            calculatedOT = calculateAndFillTimes(block, rowIndex, data.timeIn, data.timeOut);
          } else if (typeof calculateAndTimeEntry === 'function') {
            calculatedOT = calculateAndTimeEntry(sheet, startRow + rowIndex, data.time_start, data.time_end, emp.has_ot_noon, emp.ot_noon_in, emp.ot_noon_out);
          }
        } else if (data.otHours !== undefined) {
          let currentOT = parseFloat(block[rowIndex][colOtTotal - 1]) || 0;
          let newOT = data.otHours + currentOT;
          block[rowIndex][colOtTotal - 1] = newOT;
          calculatedOT = newOT;
        }

        // ซิงค์บันทึกประวัติการอัปเดตลงในโครงสร้าง State (ถ้ามี)
        if (typeof updateEmpRecordInState === 'function') {
          updateEmpRecordInState(emp.firstname, targetSite, targetWork, data.timeIn, data.timeOut, calculatedOT);
        }

        successCount++;
        processedNames.push(inputName);
      } else {
        errors.push(emp.firstname);
      }
    });

    // เขียนข้อมูลชุดใหญ่กลับลงหน้าชีตเพียงครั้งเดียวเพื่อประสิทธิภาพสูงสุด
    if (successCount > 0) {
      blockRange.setValues(block);
      
      if (userId) {
        try {
          PropertiesService.getScriptProperties().setProperty(
            `LAST_ENTRY_${userId}`, 
            JSON.stringify({ date: data.date, names: processedNames })
          );
        } catch (propertyError) {
          console.warn("ไม่สามารถบันทึก Properties ล่าสุดได้: " + propertyError);
        }
      }
    }

    return { count: successCount, errors: errors, accom: replyAccom, processedNames: processedNames, spreadsheet: ss };

  } catch (globalError) {
    console.error("เกิดข้อผิดพลาดร้ายแรงในฟังก์ชัน writeToDailySheet: " + globalError.stack);
    return { count: 0, errors: ["ระบบขัดข้องภายใน: " + globalError.toString()], accom: "ไม่ได้ระบุ", processedNames: [], spreadsheet: null };
  }
}