/**
 * @description บันทึก System Log ไปยัง Google Cloud Logging สำหรับการ Monitoring และตั้งแจ้งเตือน (Alerting)
 * @param {string} logName - ชื่อของ Log Stream ใน Cloud Logging (เช่น 'SmartWorksite_Errors')
 * @param {string} severity - ระดับความรุนแรง (เช่น 'DEFAULT', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')
 * @param {string} message - ข้อความแจ้งเตือนหรือคำอธิบายแบบย่อ
 * @param {Object} contextData - ข้อมูลบริบทเพิ่มเติม (JSON Object)
 */
function logToCloud(logName, severity, message, contextData) {
  const projectId = getDynamicConfig("GCP_PROJECT_ID");
  if (!projectId) {
    console.error("Missing GCP_PROJECT_ID config.");
    return;
  }
  
  const token = ScriptApp.getOAuthToken();
  const url = "https://logging.googleapis.com/v2/entries:write";

  const payload = {
    "entries": [{
      "logName": `projects/${projectId}/logs/${logName}`,
      "resource": { "type": "global" },
      "severity": severity,
      "jsonPayload": {
        "message": message,
        "context": contextData || {},
        "timestamp": new Date().toISOString(),
        "operator": Session.getActiveUser().getEmail() || "SYSTEM"
      }
    }]
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": { "Authorization": "Bearer " + token },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    withExponentialBackoff(() => {
      const response = UrlFetchApp.fetch(url, options);
      if (response.getResponseCode() !== 200) {
        throw new Error(`Cloud Logging Error: ${response.getContentText()}`);
      }
    });
  } catch (e) {
    console.error("Cloud Logging Failed: " + e.message);
    // ไม่วาง Fallback ตรงนี้ เพื่อไม่ให้รบกวน Flow การทำงานหลักของผู้ใช้ เพราะเป็นแค่ System Log
  }
}
