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
