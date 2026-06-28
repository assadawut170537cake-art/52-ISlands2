/**
 * @description บันทึกข้อมูล Audit Trail ลง Google BigQuery เพื่อรองรับข้อมูลมหาศาล พร้อมระบบ Fallback
 * @param {string} userId - รหัสผู้ใช้งาน หรือ อีเมล
 * @param {string} action - ประเภทของการกระทำ (Action Type)
 * @param {string} rawText - ข้อมูลรายละเอียดเพิ่มเติมหรือข้อความดิบ
 * @param {string} statusFlag - สถานะผลการทำงาน (เช่น SUCCESS, ERROR)
 */
function logToBigQueryEnterprise(userId, action, rawText, statusFlag) {
  const projectId = getDynamicConfig("BQ_PROJECT_ID");
  const datasetId = getDynamicConfig("BQ_DATASET_ID");
  const tableId = getDynamicConfig("BQ_TABLE_ID");
  
  if (!projectId || !datasetId || !tableId) {
    console.warn("BigQuery configs are missing. Reverting to Fallback Logger.");
    return fallbackAuditLogToSheet(userId, action, rawText, statusFlag);
  }
  
  const row = {
    timestamp: new Date().toISOString(),
    user_id: userId,
    action_type: action,
    raw_message: rawText,
    status: statusFlag
  };
  
  const requestBody = {
    kind: "bigquery#tableDataInsertAllRequest",
    rows: [{ json: row }]
  };
  
  try {
    withExponentialBackoff(() => {
      BigQuery.Tabledata.insertAll(requestBody, projectId, datasetId, tableId);
    });
  } catch (e) {
    console.error("BQ Insert Failed, reverting to Sheet: " + e.message);
    // 💡 Fallback: หาก BigQuery ล่ม หรือ API ผิดพลาด สลับไปเขียนลง Sheet สำรอง (High Availability)
    fallbackAuditLogToSheet(userId, action, rawText, statusFlag);
  }
}

/**
 * @description ระบบสำรอง (Fallback) บันทึก Audit ลง Google Sheets
 * @param {string} userId - รหัสผู้ใช้งาน หรือ อีเมล
 * @param {string} action - ประเภทของการกระทำ
 * @param {string} rawText - ข้อมูลข้อความดิบ
 * @param {string} statusFlag - สถานะผลการทำงาน
 */
function fallbackAuditLogToSheet(userId, action, rawText, statusFlag) {
  try {
    const fallbackSheetId = getDynamicConfig("FALLBACK_SHEET_ID");
    if (!fallbackSheetId) return;
    const sheet = SpreadsheetApp.openById(fallbackSheetId).getSheetByName("Audit_Fallback");
    if (sheet) {
      sheet.appendRow([new Date(), userId, action, rawText, statusFlag]);
    }
  } catch (sheetError) {
    console.error("Critical: Fallback Audit Logger also failed: " + sheetError.message);
  }
}
