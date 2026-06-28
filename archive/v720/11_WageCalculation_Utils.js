// ==========================================
// 2. โมดูลคำนวณวันเป้าหมายประจำเดือน (หักวันหยุด)
// ==========================================
const WageUtils = {
  getTargetWorkingDays: function(year, monthIndex, companyHolidays) {
    let targetDays = 0;
    let daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      let currentDate = new Date(year, monthIndex, d);
      let dateStr = Utilities.formatDate(currentDate, "GMT+7", "yyyy-MM-dd");
      let isSunday = (currentDate.getDay() === 0);
      let isHoliday = companyHolidays.includes(dateStr);
      
      // ถ้านับวันทำงานปกติ (ไม่ใช่อาทิตย์ และ ไม่ใช่วันหยุด)
      if (!isSunday && !isHoliday) {
        targetDays++;
      }
    }
    return targetDays;
  }
};

// Global Wrapper
function getTargetWorkingDays(year, monthIndex, companyHolidays) {
  return WageUtils.getTargetWorkingDays(year, monthIndex, companyHolidays);
}
