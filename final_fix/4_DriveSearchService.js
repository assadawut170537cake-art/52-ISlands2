/**
 * @description ค้นหา File ID ของเอกสาร Google Sheets ที่ต้องการโดยใช้ Drive API (ทำงานเร็วกว่าการวนลูปด้วย SpreadsheetApp)
 * @param {string} searchKeyword - คำค้นหาในชื่อไฟล์ (เช่น 'พฤษภาคม')
 * @returns {string|null} File ID ของไฟล์ที่พบ หรือ null หากไม่พบ
 */
function getTargetFileIdByDateOptimized(searchKeyword) {
  const folderId = getDynamicConfig("MONTHLY_VAULT_FOLDER_ID");
  if (!folderId) throw new Error("Missing MONTHLY_VAULT_FOLDER_ID config.");
  
  // Sanitize ข้อมูลเพื่อป้องกันอักขระพิเศษ (เช่น single quote) พังโครงสร้าง Query
  const safeKeyword = searchKeyword.replace(/'/g, "\\'");
  
  // ค้นหาเฉพาะเอกสาร Google Sheets ที่ไม่ถูกทิ้งลงถังขยะ
  const query = `title contains '${safeKeyword}' and '${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  
  try {
    const files = withExponentialBackoff(() => {
      return Drive.Files.list({
        q: query,
        maxResults: 1,
        fields: "items(id, title)"
      });
    });
    
    if (files && files.items && files.items.length > 0) {
      return files.items[0].id; // ได้ ID เร็วกว่าการสั่งเปิด Sheet
    }
    return null;
  } catch (e) {
    console.error("Drive API Search Failed: " + e.message);
    return null;
  }
}

/**
 * @description แยกแยะเดือนและปีจากวันที่รูปแบบ dd/MM/yy หรือดึงค่า File ID ของเดือนปัจจุบัน
 * พร้อมกลไกรับมือ (Fallback) หาจาก Script Properties หรือ MONTHLY_FILE_IDS
 * @param {string} dateStr - วันที่ (เช่น "18/6/69", "18/06/2569", "18-6-69")
 * @returns {string|null} - ส่งกลับ File ID ของเดือนนั้นๆ หรือ null ถ้าระบบหาไม่พบ
 */
function getTargetFileIdByDate(dateStr) {
  try {
    let targetMonthIndex = new Date().getMonth(); // ค่าเริ่มต้นคือเดือนปัจจุบัน (0-11)
    let targetYear = new Date().getFullYear();

    // 1. ตรวจสอบและแยกแยะวันที่ (ถ้ามีการระบุ)
    if (dateStr && typeof dateStr === 'string') {
      // Regex จับวันที่รูปแบบ dd/MM/yy, dd/MM/yyyy, dd-MM-yy
      const dateMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (dateMatch) {
        const parsedMonth = parseInt(dateMatch[2], 10) - 1; // แปลงเป็น index (0-11)
        let parsedYear = parseInt(dateMatch[3], 10);
        
        // ตรวจสอบปี (เช่น 69 หมายถึง 2569) ให้แปลงเป็น ค.ศ.
        if (parsedYear < 100) {
          parsedYear += 2500; // 69 -> 2569
        }
        if (parsedYear > 2400) {
          parsedYear -= 543; // 2569 -> 2026
        }
        
        targetMonthIndex = parsedMonth;
        targetYear = parsedYear;
      }
    }

    // 2. ดึง File ID จาก Script Properties (Fallback 1: โหลดแบบ Dynamic)
    const props = PropertiesService.getScriptProperties();
    const dynamicFileId = props.getProperty(`FILE_ID_${targetYear}_${targetMonthIndex + 1}`);
    if (dynamicFileId) {
      return dynamicFileId;
    }

    // 3. ดึง File ID จาก Config Sheet หรือ Global Array (Fallback 2: MONTHLY_FILE_IDS)
    if (typeof MONTHLY_FILE_IDS !== "undefined" && MONTHLY_FILE_IDS.length === 12) {
      const fileIdFromArray = MONTHLY_FILE_IDS[targetMonthIndex];
      if (fileIdFromArray && fileIdFromArray.trim() !== "") {
        return fileIdFromArray;
      }
    }

    // 4. หากยังไม่พบ (Fallback 3: ค้นหาด้วย Drive API หรือเตือนแอดมิน)
    const errorMsg = `ไม่พบ ID ไฟล์สำหรับเดือน ${targetMonthIndex + 1} ปี ${targetYear}`;
    console.error(errorMsg);
    
    // แจ้งเตือนไปยังแอดมินโดยตรง
    notifyAdminIfNoFileId(targetMonthIndex + 1, targetYear);
    
    return null;

  } catch (error) {
    console.error("Error in getTargetFileIdByDate: " + error.message);
    return null;
  }
}

/**
 * @description ตรวจสอบและแจ้งเตือนแอดมินโดยตรงผ่าน LINE หากระบบตรวจพบว่าเดือนปัจจุบันยังไม่ได้ผูก File ID
 * @param {number} month - เดือน (1-12)
 * @param {number} year - ปี (ค.ศ. หรือ พ.ศ.)
 */
function notifyAdminIfNoFileId(month, year) {
  try {
    const adminLineIdText = typeof getDynamicConfig === 'function' ? getDynamicConfig("ADMIN_LINE_IDS") : null;
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty("LINE_CHANNEL_ACCESS_TOKEN") || (typeof getDynamicConfig === "function" ? getDynamicConfig('LINE_CHANNEL_ACCESS_TOKEN') : null);
    
    if (!adminLineIdText || !token) {
      return;
    }

    const adminIds = adminLineIdText.split(",").map(function(id) {
      return id.trim();
    }).filter(function(id) {
      return id !== "";
    });

    const alertMessage = `🚨 [SYSTEM ALERT]\nระบบตรวจพบว่ายังไม่ได้ผูก File ID สำหรับเดือน ${month}/${year}\nกรุณาตั้งค่าใน MONTHLY_FILE_IDS หรือ Script Properties ด่วน!`;

    // วนลูปแจ้งเตือนแอดมินทุกคนที่ลงทะเบียนไว้
    adminIds.forEach(function(adminId) {
      UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        method: 'post',
        muteHttpExceptions: true,
        payload: JSON.stringify({
          to: adminId,
          messages: [{ type: 'text', text: alertMessage }]
        })
      });
    });

  } catch (error) {
    console.error("Error in notifyAdminIfNoFileId: " + error.message);
  }
}
