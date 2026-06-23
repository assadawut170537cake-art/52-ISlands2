// ==========================================
// 3. โมดูลหลักสำหรับเชื่อมต่อข้ามไฟล์ (Cross-Spreadsheet Fetching)
const WageMain = {
  runMainWageCalculation: function() {
    try {
      const COL_EMP_NAME = getDynamicConfig("COL_EMP_NAME");
      const COL_EMP_ROLE = getDynamicConfig("COL_EMP_ROLE");
      const COL_EMP_AGE = getDynamicConfig("COL_EMP_AGE");
      
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonthIndex = currentDate.getMonth(); 
      const monthNamesThai = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
      const currentMonthName = monthNamesThai[currentMonthIndex];

      // 1. ดึงข้อมูลจากไฟล์ DATA
      const dataFiles = DriveApp.getFilesByName("ไฟล์ DATA");
      if (!dataFiles.hasNext()) throw new Error("ไม่พบ 'ไฟล์ DATA'");
      const dataSS = SpreadsheetApp.open(dataFiles.next());

      const holidaySheet = dataSS.getSheetByName("วันหยุด");
      const holidayData = holidaySheet.getRange(2, 1, holidaySheet.getLastRow() - 1, 1).getValues();
      const companyHolidays = holidayData
        .filter(row => row[0] instanceof Date || row[0] !== "")
        .map(row => Utilities.formatDate(new Date(row[0]), "GMT+7", "yyyy-MM-dd"));

      // ใช้ WageUtils
      const targetWorkingDays = typeof WageUtils !== 'undefined' ? 
        WageUtils.getTargetWorkingDays(currentYear, currentMonthIndex, companyHolidays) :
        getTargetWorkingDays(currentYear, currentMonthIndex, companyHolidays);

      // 2. ดึงข้อมูลไฟล์รายเดือน
      const monthFiles = DriveApp.getFilesByName(currentMonthName);
      if (!monthFiles.hasNext()) throw new Error("ไม่พบไฟล์รายงานเดือน " + currentMonthName);
      const monthSS = SpreadsheetApp.open(monthFiles.next());

      const reportSheet = monthSS.getSheetByName("สรุป");
      if (!reportSheet) throw new Error("ไม่พบแท็บ 'สรุป' ในไฟล์เดือนนี้");
      const reportData = reportSheet.getDataRange().getValues();

      // --- ระบบค้นหาคอลัมน์ "รวม" อัตโนมัติ ---
      let block1TotalCol = -1;
      let block2TotalCol = -1;
      let block2StartRow = -1;

      for (let r = 0; r < reportData.length; r++) {
        let firstCell = (reportData[r][0] || "").toString();
        if (firstCell.includes("16-31")) {
          block2StartRow = r; // จุดเริ่มต้นของบล็อกครึ่งเดือนหลัง
        }
        
        for(let c = 0; c < reportData[r].length; c++) {
          if (reportData[r][c] === "รวม") {
            if (block2StartRow === -1 && block1TotalCol === -1) block1TotalCol = c;
            if (block2StartRow !== -1 && block2TotalCol === -1) block2TotalCol = c;
          }
        }
      }

      // 3. ดึงรายชื่อพนักงานจากฐานข้อมูล
      const employeeSheet = dataSS.getSheetByName("รายชื่อพนักงาน");
      const empDataRange = employeeSheet.getDataRange().getValues();

      // 4. ลูปประมวลผลพนักงานทีละคน
      for (let i = 1; i < empDataRange.length; i++) {
        let row = empDataRange[i];
        let empName = (row[COL_EMP_NAME] || "").toString().trim(); 
        if (!empName) continue;
        
        // ตัดช่องว่างออกจากชื่อในฐานข้อมูลเพื่อใช้เทียบเคียง
        let empNameClean = empName.replace(/\s+/g, ""); 

        // --- ค้นหายอดวันทำงานในแท็บสรุปทั้ง 2 บล็อก ---
        let actualDaysWorked = 0;
        
        for (let r = 0; r < reportData.length; r++) {
          let reportRow = reportData[r];
          let firstName = (reportRow[2] || "").toString().trim(); // คอลัมน์ C (ชื่อ)
          let lastName = (reportRow[3] || "").toString().trim();  // คอลัมน์ D (นามสกุล)
          
          if (!firstName) continue;
          let reportNameClean = firstName + lastName;

          // ถ้าชื่อและนามสกุลตรงกัน (แบบไม่มีช่องว่าง)
          if (empNameClean === reportNameClean || empNameClean.includes(firstName)) {
            let val = 0;
            if (r < block2StartRow) {
              val = parseFloat(reportRow[block1TotalCol]); // ดึงยอดบล็อกบน (1-15)
            } else {
              val = parseFloat(reportRow[block2TotalCol]); // ดึงยอดบล็อกล่าง (16-31)
            }
            
            // ดักจับค่า #REF! หรือค่าที่ไม่ใช่ตัวเลขให้เป็น 0
            if (!isNaN(val)) {
              actualDaysWorked += val;
            }
          }
        }

        // คำนวณวันขาดงานสุทธิ
        let calculatedAbsence = targetWorkingDays - actualDaysWorked;
        if (calculatedAbsence < 0) calculatedAbsence = 0; 

        let employeeObj = {
          role: row[COL_EMP_ROLE],          
          skillLevel: "ทั่วไป", 
          age: row[COL_EMP_AGE],           
          monthsWorked: 6,      
          daysAbsent: calculatedAbsence
        };

        // ใช้ WageCore
        let finalResult = typeof WageCore !== 'undefined' ?
          WageCore.calculateDailyWageWithAutomatedBonus(employeeObj) :
          calculateDailyWageWithAutomatedBonus(employeeObj);

        // --- บันทึกผลลัพธ์ (กรุณาปรับเลขคอลัมน์ให้ตรงกับที่ต้องการแสดงผล) ---
        // employeeSheet.getRange(i + 1, 28).setValue(finalResult.baseWage);
        // employeeSheet.getRange(i + 1, 29).setValue(finalResult.attendanceBonus);
        // employeeSheet.getRange(i + 1, 30).setValue(finalResult.ageDeduction);
        // employeeSheet.getRange(i + 1, 31).setValue(finalResult.finalWage);
      }

      SpreadsheetApp.getUi().alert("✅ ประมวลผลสำเร็จ!\nระบบคำนวณและรวมคอลัมน์ทั้ง 2 บล็อกอัตโนมัติเรียบร้อยแล้ว");

    } catch (error) {
      SpreadsheetApp.getUi().alert("❌ เกิดข้อผิดพลาด: " + error.message);
    }
  }
};

// Global Wrapper
function runMainWageCalculation() {
  return WageMain.runMainWageCalculation();
}
