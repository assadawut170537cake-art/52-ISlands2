/**
 * @description ดึงค่า Configuration จาก System_Settings หรือ Script Properties พร้อมแคช
 * @param {string} key - ชื่อ Key ของ Config
 * @returns {string} ค่า Config ที่ต้องการ
 */
function getDynamicConfig(key, defaultValue) {
  if (!key) return defaultValue !== undefined ? defaultValue : "";
  try {
    const cache = CacheService.getScriptCache();
    let value = cache.get("CONFIG_" + key);
    
    if (value !== null) return value;
    
    value = PropertiesService.getScriptProperties().getProperty(key);
    if (value !== null) {
      cache.put("CONFIG_" + key, value, 3600); 
      return value;
    }
  } catch (e) {
    if (typeof Logger !== "undefined") Logger.log("⚠️ getDynamicConfig Warning: " + e.message);
  }

  if (typeof GLOBAL_CONFIG !== "undefined" && GLOBAL_CONFIG[key] !== undefined && GLOBAL_CONFIG[key] !== "") {
    return GLOBAL_CONFIG[key];
  }
  return defaultValue !== undefined ? defaultValue : "";
}

/**
 * @description จัดการการเรียกใช้งาน API/Service แบบมีระบบ Retry และ Exponential Backoff เพื่อจัดการ Rate Limit
 * @param {Function} action - ฟังก์ชัน (Closure) ที่จะเรียกใช้งาน
 * @param {number} maxRetries - จำนวนครั้งที่พยายามสูงสุด (ค่าเริ่มต้น 3)
 * @returns {any} ผลลัพธ์จากการทำงานของฟังก์ชัน
 * @throws {Error} คืนค่า Error หากล้มเหลวครบตามจำนวนครั้งที่กำหนด
 */
function withExponentialBackoff(action, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return action();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      // หน่วงเวลาเพิ่มขึ้นทวีคูณ (1s, 2s, 4s) + Jitter(ลดโอกาสชนกันพร้อมกัน)
      Utilities.sleep((Math.pow(2, i) * 1000) + Math.round(Math.random() * 1000));
    }
  }
}

