/**
 * @description ส่งรูปภาพไปประมวลผล OCR ด้วย Google Cloud Vision API และสกัดรหัสพนักงาน (5 หลัก)
 * @param {string} base64Image - รูปภาพในรูปแบบ Base64 String (ไม่รวม Data URI header)
 * @returns {Array<string>|null} อาร์เรย์ของรหัสพนักงาน หรือ null กรณีที่ไม่พบ/เกิดข้อผิดพลาด
 */
function extractCodesWithVisionAPI(base64Image) {
  const VISION_API_KEY = getDynamicConfig("VISION_API_KEY");
  if (!VISION_API_KEY) throw new Error("Missing VISION_API_KEY config.");

  const url = `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`;
  const payload = {
    "requests": [{
      "image": { "content": base64Image },
      "features": [{ "type": "TEXT_DETECTION" }] // OCR ความเร็วสูง
    }]
  };
  
  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  try {
    const response = withExponentialBackoff(() => UrlFetchApp.fetch(url, options));
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      throw new Error(`Vision API error: ${responseCode} - ${response.getContentText()}`);
    }

    const data = JSON.parse(response.getContentText());
    if (data.responses && data.responses[0].textAnnotations && data.responses[0].textAnnotations.length > 0) {
      const fullText = data.responses[0].textAnnotations[0].description;
      // Regex ดึงเฉพาะรหัสที่เป็นตัวเลข 5 หลัก
      const codes = fullText.match(/\b\d{5}\b/g); 
      return codes ? [...new Set(codes)] : [];
    }
    return []; // เรียกสำเร็จแต่ไม่มีข้อความในรูป
  } catch (e) {
    console.error("Vision API Failed: " + e.message);
    // 💡 Fallback: คืนค่า null เพื่อให้ฟังก์ชันหลักสลับไปใช้งาน GeminiVision
    return null;
  }
}
