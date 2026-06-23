/**
 * ระบบคำนวณค่าแรงอัตโนมัติ (Automated Wage Calculation System)
 * @param {Object} employeeData - ข้อมูลพนักงาน (role, skillLevel, age, monthsWorked, daysAbsent)
 * @returns {Object} ผลลัพธ์การคำนวณ (baseWage, attendanceBonus, ageDeduction, finalWage, message)
 */

// ==========================================
// 1. โมดูลคำนวณค่าแรงและเบี้ยขยัน (Core Engine)
// ==========================================
const WageCore = {
  calculateDailyWageWithAutomatedBonus: function(employeeData) {
    try {
      const role = employeeData.role;
      const skillLevel = employeeData.skillLevel || "ทั่วไป";
      const age = parseInt(employeeData.age) || 0;
      const monthsWorked = parseInt(employeeData.monthsWorked) || 0;
      const daysAbsent = parseFloat(employeeData.daysAbsent) || 0;

      let baseWage = 0;
      let maxBonus = 0;
      let minimumAgeLimit = 0;

      // ตรรกะคัดกรองตามตำแหน่ง
      if (role === "ช่างปูน") {
        if (skillLevel === "ประสบการณ์ > 5 ปี") { baseWage = 450; maxBonus = 0; }
        else if (skillLevel === "จับเซี้ยมได้") { baseWage = 440; maxBonus = 0; }
        else if (skillLevel === "ฉาบได้จับเซี้ยมไม่ได้") { baseWage = 430; maxBonus = 0; }
        else { baseWage = 430; maxBonus = 0; }
        minimumAgeLimit = 18;

      } else if (role === "ช่างเชื่อม") {
        if (skillLevel === "เชื่อมแน่นได้ดี") { baseWage = 440; maxBonus = 10; minimumAgeLimit = 18; }
        else { baseWage = 420; maxBonus = 10; minimumAgeLimit = 25; }

      } else if (role === "ช่างไม้") {
        if (skillLevel === "ประสบการณ์ > 5 ปี") { baseWage = 430; maxBonus = 0; }
        else { baseWage = 420; maxBonus = 0; minimumAgeLimit = 25; }

      } else if (role === "ผู้ช่วยช่าง") {
        if (age >= 22) { baseWage = 400; maxBonus = 20; minimumAgeLimit = 22; }
        else if (age >= 20) { baseWage = 380; maxBonus = 10; minimumAgeLimit = 20; }
        else { baseWage = 360; maxBonus = 10; minimumAgeLimit = 18; }

      } else if (role === "กรรมกร") {
        if (skillLevel === "ประสบการณ์ > 5 ปี") { baseWage = 320; minimumAgeLimit = 18; }
        else if (age >= 25) { baseWage = 310; minimumAgeLimit = 25; }
        else if (age >= 20) { baseWage = 300; minimumAgeLimit = 20; }
        else { baseWage = 290; minimumAgeLimit = 18; }
      } else {
        // หากตำแหน่งไม่ตรงกับด้านบน ให้ใช้ฐานล่างสุดป้องกัน Error
        baseWage = 300; 
        minimumAgeLimit = 18;
      }

      // ประเมินเบี้ยขยันอัตโนมัติ (อายุงาน > 3 เดือน)
      let calculatedBonus = 0;
      if (monthsWorked >= 3 && maxBonus > 0) {
        let absenceRatePerMonth = daysAbsent / monthsWorked;
        if (absenceRatePerMonth <= 0.5) calculatedBonus = maxBonus;
        else if (absenceRatePerMonth <= 1.0) calculatedBonus = maxBonus / 2;
      }

      // หักเงินอายุไม่ถึงเกณฑ์ (10 บาท/ปี)
      let ageDeduction = 0;
      if (age > 0 && age < minimumAgeLimit) {
        let yearsBelow = minimumAgeLimit - age;
        ageDeduction = yearsBelow * 10; 
      }

      let finalWage = baseWage + calculatedBonus - ageDeduction;

      return {
        role: role,
        baseWage: baseWage,
        attendanceBonus: calculatedBonus,
        ageDeduction: ageDeduction,
        finalWage: finalWage,
        message: "Success"
      };

    } catch (error) {
      Logger.log("Error in calculateDailyWage: " + error.message);
      return { baseWage: 0, attendanceBonus: 0, ageDeduction: 0, finalWage: 0, message: error.message };
    }
  }
};

// Global Wrapper
function calculateDailyWageWithAutomatedBonus(employeeData) {
  return WageCore.calculateDailyWageWithAutomatedBonus(employeeData);
}
