// =================================================================
// 6_FuzzyHelpers.gs (ระบบประมวลผล Fuzzy Matching คำนวณความคล้ายข้อความ)
// =================================================================

/**
 * คำนวณระยะห่างของข้อความ (Levenshtein Distance)
 * ใช้หาระยะความห่างของการพิมพ์ผิด (ลบ, แทรก, แทนที่)
 */
function levenshteinDistance(s1, s2) {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = [];

  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[len1][len2];
}

/**
 * แปลงค่าระยะห่างข้อความเป็นเปอร์เซ็นต์ความคล้ายคลึง (0.0 - 1.0)
 * มีการเรียกใช้ฟังก์ชัน normalize(t) จากไฟล์ 3_GeminiWrappers.gs เพื่อทำความสะอาดคำนำหน้าก่อนเปรียบเทียบ
 */
function getStringSimilarity(str1, str2) {
  const s1 = normalize(str1); 
  const s2 = normalize(str2);
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  return (maxLength - distance) / maxLength;
}

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
  const currentThreshold = getFuzzyThreshold(); // ดึงเกณฑ์คะแนนแบบ Dynamic

  referenceArray.forEach(ref => {
    const score = getStringSimilarity(inputStr, ref);
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