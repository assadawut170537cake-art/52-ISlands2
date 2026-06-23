/**
 * หน้าที่การทำงาน: ส่งข้อมูลรูปภาพประเภท Base64 ไปประมวลผลกับโครงข่ายประสาทเทียม Gemini Vision API
 * มาพร้อมระบบสลับ API Key อัตโนมัติ (Fallback) และระบบควบคุมการส่งคำสั่งซ้ำเมื่อเกิดปัญหาเครือข่าย (Exponential Backoff)
 * * @param {string} base64Str - สายอักขระข้อมูลรูปภาพในรูปแบบดั้งเดิม Base64
 * @param {string} systemInstruction - ข้อความกำหนดขอบเขต ข้อบังคับ และบทบาทหน้าที่ของตัวโมเดล AI
 * @param {string} mimeType - ชนิดและนามสกุลมาตรฐานของสื่อรูปภาพ เช่น "image/jpeg" หรือ "image/png"
 * @param {boolean} [useWebKey=false] - ตัวเลือกสลับจัดลำดับความสำคัญของคีย์เว็บขึ้นก่อนคีย์ไลน์
 * @return {Object|null} ข้อมูลสรุปในรูปแบบ Object ที่ถูกแปลงมาจากผลลัพธ์ JSON ของ AI หรือ null เมื่อระบบทำงานไม่สำเร็จ
 */
function callGeminiVision(base64Str, systemInstruction, mimeType, useWebKey = false) {
  try {
    const props = PropertiesService.getScriptProperties();
    
    // ตั้งค่าตัวเลือกชื่อโมเดล AI มาตรฐาน
    let model = "gemini-2.5-flash";
    if (typeof getDynamicConfig === 'function') {
      model = getDynamicConfig('MODEL_NAME') || model;
    } else {
      model = getDynamicConfig("MODEL_NAME", model);
    }

    // ลอจิกการจัดลำดับสลับสิทธิ์การใช้งาน API Key อัตโนมัติ (Fallback Key Rotation)
    let apiKey = "";
    const keyWeb = getDynamicConfig("GEMINI_API_KEY_WEB");
    const keyLine = getDynamicConfig("GEMINI_API_KEY_LINE");
    const keyDefault = typeof getDynamicConfig === 'function' ? getDynamicConfig('GEMINI_API_KEY') : null;

    if (useWebKey) {
      apiKey = keyWeb || keyLine || keyDefault;
    } else {
      apiKey = keyLine || keyWeb || keyDefault;
    }

    if (!apiKey) {
      console.error("ระบบไม่สามารถดำเนินการได้เนื่องจากไม่มีการตั้งค่ารหัสสิทธิ์ระบบ (GEMINI_API_KEY)");
      return null;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    // จัดวางโครงสร้าง Payload ตามข้อกำหนดโครงสร้างอย่างเป็นทางการของ Google Gemini API v1beta
    const payload = {
      contents: [{
        parts: [
          { text: "Extract worker codes and structured text information accurately according to the instruction." },
          { inlineData: { mimeType: mimeType || "image/jpeg", data: base64Str } }
        ]
      }],
      systemInstruction: {
        parts: [{ text: systemInstruction || "You are a precise data extraction assistant." }]
      },
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const fetchExecution = () => {
      const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };

      const res = UrlFetchApp.fetch(url, options);
      const responseCode = res.getResponseCode();

      if (responseCode >= 200 && responseCode < 300) {
        const json = JSON.parse(res.getContentText());
        if (json.candidates && json.candidates[0].content && json.candidates[0].content.parts[0].text) {
          let textResult = json.candidates[0].content.parts[0].text;
          
          // ทำความสะอาดข้อความดิบ ตัดสัญลักษณ์มาร์กดาวน์ของโค้ดบล็อกออกทั้งหมดเพื่อป้องการความเสียหายขณะ Parse
          textResult = textResult.replace(/```json/g, "").replace(/```/g, "").trim();
          return JSON.parse(textResult);
        }
      }
      
      throw new Error(`ส่งคำสั่งประมวลผลล้มเหลวด้วยโค้ดสถานะของ HTTP: ${responseCode} รายละเอียด: ${res.getContentText()}`);
    };

    // เลือกใช้ตัวควบคุมอัตราการส่งข้อมูลซ้ำตามฟังก์ชันความเสถียรที่มีอยู่ในระบบหลัก
    if (typeof withExponentialBackoff === 'function') {
      return withExponentialBackoff(fetchExecution);
    } else if (typeof fetchGemini === 'function') {
      return fetchGemini(url, payload, true);
    } else {
      return fetchExecution();
    }

  } catch (apiError) {
    console.error("เกิดข้อผิดพลาดในการประมวลผลภาพฟังก์ชัน callGeminiVision: " + apiError.toString());
    return null;
  }
}