/**
 * @description ดึงรูปภาพจาก LINE API และอัปโหลดเป็นไฟล์สื่อบน Google Cloud Storage (GCS)
 * @param {string} lineMessageId - ID ของข้อความรูปภาพจาก LINE (Message ID)
 * @param {string} filename - ชื่อไฟล์ภาพที่จะจัดเก็บ (ไม่ต้องระบุนามสกุล)
 * @returns {string|null} Public URL (CDN Link) ของรูปภาพใน Cloud Storage หรือ null หากล้มเหลว
 */
function uploadLineImageToCloudStorage(lineMessageId, filename) {
  const bucketName = getDynamicConfig("GCS_BUCKET_NAME");
  const lineToken = getDynamicConfig("LINE_CHANNEL_ACCESS_TOKEN");
  
  if (!bucketName || !lineToken) {
    console.error("Missing GCS_BUCKET_NAME or LINE_CHANNEL_ACCESS_TOKEN config.");
    return null;
  }
  
  const token = ScriptApp.getOAuthToken();
  const lineUrl = `https://api-data.line.me/v2/bot/message/${lineMessageId}/content`;
  
  try {
    // 1. ดึงภาพจาก LINE API
    const lineRes = withExponentialBackoff(() => {
      const res = UrlFetchApp.fetch(lineUrl, {
        "headers": { "Authorization": "Bearer " + lineToken },
        "muteHttpExceptions": true
      });
      if (res.getResponseCode() !== 200) throw new Error(`LINE Fetch Error: ${res.getContentText()}`);
      return res;
    });
    
    const imageBlob = lineRes.getBlob();
    
    // 2. อัปโหลดขึ้น Cloud Storage
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=media&name=reports/${filename}.jpg`;
    
    const storageRes = withExponentialBackoff(() => {
      const res = UrlFetchApp.fetch(uploadUrl, {
        method: "post",
        contentType: imageBlob.getContentType(),
        headers: { "Authorization": "Bearer " + token },
        payload: imageBlob.getBytes(),
        muteHttpExceptions: true
      });
      if (res.getResponseCode() !== 200) throw new Error(`GCS Upload Error: ${res.getContentText()}`);
      return res;
    });
    
    const data = JSON.parse(storageRes.getContentText());
    // ส่งลิงก์ CDN กลับไปบันทึกในฐานข้อมูล หรือ Sheet
    return `https://storage.googleapis.com/${bucketName}/${data.name}`; 
    
  } catch (e) {
    console.error("Upload LINE Image to GCS Failed: " + e.message);
    logToCloud("System_Uploads", "ERROR", "Image Upload Failed", { error: e.message, lineMessageId });
    return null;
  }
}
