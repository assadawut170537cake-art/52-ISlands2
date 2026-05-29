/**
 * ดึงรายชื่อกลุ่มที่อนุญาตใช้งาน (มีระบบ Cache)
 */
function getSavedGroupWhitelist() {
  const cache = CacheService.getScriptCache();
  const cachedWhitelist = cache.get("GROUP_WHITELIST");
  if (cachedWhitelist) return JSON.parse(cachedWhitelist); 
  
  let whitelist = [];
  const whitelistString = getDynamicConfig("ALLOWED_GROUP_IDS");
  
  if (whitelistString) {
    whitelist = whitelistString.split(",").map(id => id.trim());
  } else {
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ตั้งค่า");
      if (sheet) {
        const data = sheet.getRange("A2:A").getValues();
        whitelist = data.map(row => row[0].toString().trim()).filter(id => id !== "");
      }
    } catch(e) { 
      logSystemEvent("ERROR", "getSavedGroupWhitelist", e.message); 
    }
  }
  
  if (whitelist.length > 0) {
    cache.put("GROUP_WHITELIST", JSON.stringify(whitelist), 3600);
  }
  return whitelist;
}

/**
 * ตรวจสอบว่า Group ID นี้ได้รับอนุญาตหรือไม่ (Guard Clause)
 */
function isAllowedGroup(groupId) {
  if (!groupId) return false;
  return getSavedGroupWhitelist().includes(groupId);
}