/**
 * @description สั่ง Auto Deploy Web App เวอร์ชันใหม่ไปยัง Deployment ปัจจุบันโดยอัตโนมัติ
 * @param {string} versionDesc - คำอธิบายรายละเอียดของเวอร์ชัน (Changelog / Release Notes)
 * @returns {number|null} หมายเลข Version ที่เพิ่ง Deploy สำเร็จ หรือ null หากผิดพลาด
 */
function autoDeployOnStableUpdate(versionDesc) {
  const scriptId = ScriptApp.getScriptId();
  const deploymentId = getDynamicConfig("WEBAPP_DEPLOYMENT_ID"); 
  if (!deploymentId) throw new Error("Missing WEBAPP_DEPLOYMENT_ID config.");
  
  const token = ScriptApp.getOAuthToken();
  
  try {
    // 1. สร้าง Version ใหม่ก่อน
    const versionUrl = `https://script.googleapis.com/v1/projects/${scriptId}/versions`;
    const versionPayload = { "description": versionDesc };
    
    const versionRes = withExponentialBackoff(() => {
      const res = UrlFetchApp.fetch(versionUrl, {
        method: "post",
        contentType: "application/json",
        headers: { "Authorization": "Bearer " + token },
        payload: JSON.stringify(versionPayload),
        muteHttpExceptions: true
      });
      if (res.getResponseCode() >= 400) throw new Error(res.getContentText());
      return res;
    });
    
    const versionNumber = JSON.parse(versionRes.getContentText()).versionNumber;
    if (!versionNumber) throw new Error("Failed to extract version number.");
    
    // 2. อัปเดต Deployment เดิมให้ชี้ไปที่ Version ใหม่
    const updateUrl = `https://script.googleapis.com/v1/projects/${scriptId}/deployments/${deploymentId}`;
    const updatePayload = {
      "deploymentConfig": {
        "versionNumber": versionNumber,
        "description": "Auto-deployed via script: " + versionDesc
      }
    };
    
    withExponentialBackoff(() => {
      const res = UrlFetchApp.fetch(updateUrl, {
        method: "put",
        contentType: "application/json",
        headers: { "Authorization": "Bearer " + token },
        payload: JSON.stringify(updatePayload),
        muteHttpExceptions: true
      });
      if (res.getResponseCode() >= 400) throw new Error(res.getContentText());
    });
    
    return versionNumber;
  } catch (e) {
    console.error("Auto Deploy Failed: " + e.message);
    logToCloud("System_Deployments", "ERROR", "Auto Deploy Failed", { error: e.message, versionDesc });
    return null;
  }
}
