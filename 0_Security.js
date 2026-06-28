// =====================================================================
// หมวดหมู่ที่ 1: ระบบล็อกกลุ่มการทำงาน (Group ID Whitelist)
// =====================================================================

/**
 * ดึงรายชื่อกลุ่มที่อนุญาตใช้งาน (มีระบบ Cache ช่วยให้ทำงานเร็วขึ้น)
 */
function getSavedGroupWhitelist() {
  var cache = CacheService.getScriptCache();
  var cachedWhitelist = cache.get("GROUP_WHITELIST");
  
  if (cachedWhitelist) {
    return JSON.parse(cachedWhitelist); 
  }
  
  var whitelist = [];
  var properties = PropertiesService.getScriptProperties();
  var whitelistString = properties.getProperty("ALLOWED_GROUP_IDS");
  
  if (whitelistString) {
    whitelist = whitelistString.split(",").map(function(id) { return id.trim(); });
  } else {
    try {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ตั้งค่า");
      if (sheet) {
        var data = sheet.getRange("A2:A").getValues();
        whitelist = data.map(function(row) { return row[0].toString().trim(); })
                        .filter(function(id) { return id !== ""; });
      }
    } catch(e) {
      Logger.log("Error reading whitelist sheet: " + e);
    }
  }
  
  if (whitelist.length > 0) {
    cache.put("GROUP_WHITELIST", JSON.stringify(whitelist), 3600);
  }
  
  return whitelist;
}

/**
 * ตรวจสอบสิทธิ์ของกลุ่มตรวจสอบข้อความ
 */
function isAllowedGroup(groupId) {
  if (!groupId) return false;
  var allowedGroups = getSavedGroupWhitelist();
  
  if (!allowedGroups || allowedGroups.length === 0) {
    console.warn("⚠️ แจ้งเตือน: ไม่พบการตั้งค่า Whitelist หรือ Whitelist ว่างเปล่า ระบบจึงบล็อกการทำงานเพื่อความปลอดภัย");
    if (typeof logAuditTrail === "function") {
      logAuditTrail("SYSTEM", "WHITELIST_EMPTY", "บล็อกการทำงานจากกลุ่ม " + groupId, "BLOCK", 1.0, "SECURITY", "ระบบบล็อกเพื่อความปลอดภัย");
    }
    return false; 
  }
  
  return allowedGroups.indexOf(groupId) !== -1;
}


// =====================================================================
// หมวดหมู่ที่ 2: ระบบค้นหารายชื่อพนักงานแบบยืดหยุ่น (Flexible Name Matching)
// =====================================================================

/**
 * ดึงฐานข้อมูลรายชื่อพนักงานปัจจุบัน (มีระบบ Cache)
 */
function getEmployeeListFromSheet() {
  var cache = CacheService.getScriptCache();
  var cachedEmpList = cache.get("EMPLOYEE_LIST");
  
  if (cachedEmpList) {
    return JSON.parse(cachedEmpList);
  }
  
  var empList = [];
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("รายชื่อพนักงาน");
    if (sheet) {
      var data = sheet.getRange("B2:C").getValues();
      
      for (var i = 0; i < data.length; i++) {
        var empName = data[i][0].toString().trim();
        var status = data[i][1].toString().trim();
        
        if (empName !== "" && (status === "ปกติ" || status === "ทำงาน" || status === "")) {
          empList.push(empName);
        }
      }
    }
  } catch(e) {
     Logger.log("Error reading employee list: " + e);
  }
  
  if (empList.length > 0) {
    cache.put("EMPLOYEE_LIST", JSON.stringify(empList), 3600);
  }
  
  return empList;
}

// =====================================================================
// หมวดหมู่ที่ 3: ระบบสืบค้นข้อมูลเพิ่มเติม & จัดรูปแบบข้อความตอบกลับ
// =====================================================================

/**
 * ค้นหาข้อมูลที่พักของพนักงานรายบุคคลจากคอลัมน์ J ในชีต "รายชื่อพนักงาน"
 */
function getAccommodationByStaff(empName) {
  if (!empName) return null;
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("รายชื่อพนักงาน");
    if (!sheet) return null;
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    
    // ดึงข้อมูลตั้งแต่คอลัมน์ B (คอลัมน์ที่ 2) ถึง J (คอลัมน์ที่ 10) รวมทั้งหมด 9 คอลัมน์
    var data = sheet.getRange(2, 2, lastRow - 1, 9).getValues();
    
    for (var i = 0; i < data.length; i++) {
      var nameInSheet = data[i][0].toString().trim();
      
      // ตรวจสอบความสอดคล้องของชื่อพนักงาน (รองรับทั้งแบบตรงกันทั้งหมดหรือบางส่วน)
      if (nameInSheet !== "" && (nameInSheet === empName.trim() || empName.trim().indexOf(nameInSheet) !== -1 || nameInSheet.indexOf(empName.trim()) !== -1)) {
        var accomValue = data[i][8]; // ดัชนีที่ 8 คือคอลัมน์ J เมื่อนับจากคอลัมน์ B เป็น 0
        return accomValue ? accomValue.toString().trim() : null;
      }
    }
  } catch (e) {
    Logger.log("Error in getAccommodationByStaff: " + e);
  }
  return null;
}

/**
 * Extender Pro Model - Smart Worksite DevOps
 * ฟังก์ชันตรวจสอบความซ้ำซ้อนของชื่อฟังก์ชันในคอลัมน์ C สุ่มสีไฮไลต์ และผสานโค้ดจากคอลัมน์ D ลงในคอลัมน์ E
 */
function mergeDuplicateFunctions() {
  const sheetName = 'Code_Workspace';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    console.error('ไม่พบหน้าชีตที่ระบุในระบบ: ' + sheetName);
    return;
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return; // ไม่มีข้อมูลเพียงพอสำหรับการตรวจสอบ
  
  const startRow = 2;
  const numRows = lastRow - startRow + 1;
  
  // ดึงข้อมูลบล็อกใหญ่ตั้งแต่แถว 2 (คอลัมน์ A ถึง E) เพื่อประมวลผลใน Memory ลด Race Condition
  const range = sheet.getRange(startRow, 1, numRows, 5);
  const values = range.getValues();
  
  // โครงสร้าง Object สำหรับจัดกลุ่มตรวจสอบข้อมูลซ้ำ: { 'functionName': [ { rowIndex: X, arrayIndex: Y, code: '...' }, ... ] }
  const functionMap = {};
  
  // 1. ตรวจสอบหาช่องซ้ำ (Null Check และเตรียมโครงสร้างข้อมูล)
  for (let i = 0; i < values.length; i++) {
    const funcName = values[i][2] ? values[i][2].toString().trim() : ''; // คอลัมน์ C (Index 2)
    const code = values[i][3] ? values[i][3].toString() : ''; // คอลัมน์ D (Index 3)
    const actualRowIndex = startRow + i;
    
    if (funcName !== '') {
      if (!functionMap[funcName]) {
        functionMap[funcName] = [];
      }
      functionMap[funcName].push({
        rowIndex: actualRowIndex,
        arrayIndex: i,
        code: code
      });
    }
  }
  
  // ดึงอาเรย์สีพื้นหลังเดิมของคอลัมน์ C และอาเรย์ข้อมูลคอลัมน์ E มาเตรียมอัปเดตแบบ Batch
  const bgRange = sheet.getRange(startRow, 3, numRows, 1);
  const currentBgs = bgRange.getBackgrounds();
  
  const targetERange = sheet.getRange(startRow, 5, numRows, 1);
  const updateEValues = targetERange.getValues();
  
  /**
   * ฟังก์ชันภายในสำหรับสุ่มสีโทนพาสเทล (Pastel Color) 
   * เพื่อความสว่าง สบายตา และไม่ทับซ้อนกับตัวอักษรบนชีต
   */
  function generatePastelColor() {
    const r = Math.floor((Math.random() * 127) + 127).toString(16).padStart(2, '0');
    const g = Math.floor((Math.random() * 127) + 127).toString(16).padStart(2, '0');
    const b = Math.floor((Math.random() * 127) + 127).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  
  let hasDuplicates = false;
  
  // 2. ลูปประมวลผลผสานโค้ดและการสุ่มไฮไลต์สีเฉพาะกลุ่มข้อมูลที่ตรวจพบการซ้ำซ้อน
  for (const funcName in functionMap) {
    const items = functionMap[funcName];
    
    if (items.length > 1) {
      hasDuplicates = true;
      const randomColor = generatePastelColor();
      
      // ดำเนินการ Code Merging: กรองค่าว่างออกแล้วผสานด้วยการเว้นบรรทัดคู่ (\n\n) เพื่อความเสถียรของโค้ด
      const mergedCode = items
        .map(item => item.code.trim())
        .filter(c => c !== '')
        .join('\n\n');
      
      items.forEach(item => {
        // กำหนดสีไฮไลต์ที่ได้จากการสุ่มลงในช่องคอลัมน์ C
        currentBgs[item.arrayIndex][0] = randomColor;
        // ส่งผลลัพธ์โค้ดที่รวมเสร็จแล้วไปบันทึกไว้ที่คอลัมน์ E
        updateEValues[item.arrayIndex][0] = mergedCode;
      });
    } else {
      // หากฟังก์ชันนี้มีเพียงแถวเดียว (ไม่ซ้ำ) ให้เคลียร์พื้นหลังเป็นสีขาวมาตรฐาน
      currentBgs[items[0].arrayIndex][0] = '#ffffff';
    }
  }
  
  // 3. ทำการ Batch Update ข้อมูลทั้งหมดกลับลงหน้าชีตพร้อมกันเพื่อประสิทธิภาพสูงสุด
  bgRange.setBackgrounds(currentBgs);
  targetERange.setValues(updateEValues);
  
  // ล็อกสถานะและล้างคิวคำสั่งเพื่อให้แน่ใจว่าระบบบันทึกเรียบร้อย
  SpreadsheetApp.flush();
  console.log('กระบวนการ DevOps ตรวจสอบและผสานโค้ดเสร็จสิ้น ตรวจพบกลุ่มซ้ำซ้อนหรือไม่: ' + hasDuplicates);
}