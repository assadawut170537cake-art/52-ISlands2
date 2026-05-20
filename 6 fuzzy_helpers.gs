// =================================================================
// 6_FuzzyHelpers.gs (ระบบประมวลผล Fuzzy Matching คำนวณความคล้ายข้อความ)
// =================================================================

/**
 * ปรับปรุง: ค้นหาข้อความที่ใกล้เคียงที่สุดจากอาร์เรย์ฐานข้อมูลโดยอ้างอิง Dynamic Threshold
 * @param {string} inputStr - ข้อความที่พิมพ์เข้ามา
 * @param {Array} referenceArray - คลังคำศัพท์ที่ถูกต้อง
 * @returns {Object|null} - ส่งกลับ { match: "คำที่ถูก", score: 0.XX } หรือ null หากต่ำกว่าเกณฑ์
 */
function findBestMatch(inputStr, referenceArray) {
  if (!inputStr || !referenceArray || referenceArray.length === 0) return null;
  
  let bestMatch = null;
  let highestScore = 0;
  // ดึงค่า Threshold จาก Config หรือให้ค่า Default 0.8
  const currentThreshold = typeof getDynamicConfig === 'function' ? parseFloat(getDynamicConfig("FUZZY_THRESHOLD")) : 0.8; 

  referenceArray.forEach(ref => {
    const score = getStringSimilarity(inputStr, ref); // ดึงจาก 3_SharedFunctions
    if (score > highestScore) {
      highestScore = score;
      bestMatch = ref;
    }
  });

  // ตรวจสอบเงื่อนไข Validation Logic ร่วมกัน: คะแนนต้องสูงกว่าหรือเท่ากับเกณฑ์ที่ตั้งไว้
  if (highestScore >= currentThreshold) {
    return { match: bestMatch, score: highestScore };
  }
  
  return null; // ต่ำกว่าเกณฑ์ ให้ถือว่าหาไม่พบเพื่อป้องกันข้อมูลเพี้ยน บันทึกผิดคน/ผิดไซต์
}