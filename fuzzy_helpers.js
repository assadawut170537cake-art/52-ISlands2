// fuzzy_helpers.gs
// ระบบช่วยจับคู่คำผิดอัตโนมัติ (Fuzzy Matching) สำหรับไซต์งานและชื่อพนักงาน

/**
 * คำนวณระยะห่างของข้อความ (Levenshtein Distance)
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
 * เรียกใช้ฟังก์ชัน normalize(t) จากไฟล์ gemini_wrappers.gs อัตโนมัติ
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
 * ค้นหาข้อความที่ใกล้เคียงที่สุดจากอาร์เรย์ฐานข้อมูล
 */
function findBestMatch(inputStr, referenceArray) {
  if (!inputStr || !referenceArray || referenceArray.length === 0) return null;
  let bestMatch = null;
  let highestScore = 0;

  referenceArray.forEach(ref => {
    const score = getStringSimilarity(inputStr, ref);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = ref;
    }
  });

  return { match: bestMatch, score: highestScore };
}