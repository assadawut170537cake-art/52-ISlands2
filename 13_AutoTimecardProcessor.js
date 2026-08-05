// =================================================================
// 13_AutoTimecardProcessor.gs (โมดูลประมวลผลบัตรตอกและส่งรายงานอัตโนมัติ V2)
// =================================================================

/**
 * คอนฟิกการทำงานส่วนตัวสำหรับระบบประมวลผลบัตรตอกอัตโนมัติ
 */
var TIMECARD_CONFIG = {
  SENDER_ALLOW_NAME: "สาสา สาสา",       // ชื่อผู้ส่งที่ระบบต้องดักจับ (หรืออนุญาตทั้งหมดหากเป็นแชทส่วนตัว)
  TARGET_GROUP_NAME: "รายงานการทำงาน 52", // ชื่อกลุ่มไลน์ปลายทางที่ต้องส่งรายงาน
  DEFAULT_TARGET_SITE: "เล็กไซต์ 2",     // สถานที่ทำงานปลายทาง (Hardcode ตามเงื่อนไข)
  DEFAULT_SHIFT_TIME: "08.00-17.00"      // เวลาทำงานมาตรฐานสำรอง
};

/**
 * ดักจับและประมวลผลข้อความ/รูปภาพ/เสียงจากแชทส่วนตัวเพื่อสร้างรายงานอัตโนมัติ
 * @param {Object} event - LINE Webhook Event
 * @returns {boolean} true หากประมวลผลสำเร็จ
 */
function handleAutoTimecardEvent(event) {
  try {
    if (!event || !event.source || event.source.type !== "user") {
      return false; // ไม่ใช่ข้อความจากแชทส่วนตัว
    }

    var userId = event.source.userId;
    var senderName = typeof getUserProfile === "function" ? getUserProfile(userId) : "ผู้ใช้";

    // 1. ตรวจสอบเงื่อนไขผู้ส่ง (ถ้าตั้งชื่อไว้ ต้องตรงกับ "สาสา สาสา" หรือผู้ส่งแชทส่วนตัว)
    var isTargetSender = (senderName.indexOf(TIMECARD_CONFIG.SENDER_ALLOW_NAME) !== -1) || 
                         (senderName.indexOf("สาสา") !== -1);

    var messageType = event.message ? event.message.type : "";

    // หากไม่ใช่รูปภาพ, เสียง หรือข้อความที่เกี่ยวกับบัตรตอก ให้ข้าม
    if (messageType !== "image" && messageType !== "audio" && messageType !== "text") {
      return false;
    }

    // 2. จัดการเก็บบันทึกไฟล์ชั่วคราว (Batch Buffering)
    var cacheKey = "TIMECARD_BATCH_" + userId;
    var props = PropertiesService.getScriptProperties();
    var batchJson = props.getProperty(cacheKey);
    var batch = batchJson ? JSON.parse(batchJson) : { imageIds: [], voiceId: null, text: "", timestamp: Date.now() };

    // เคลียร์บัฟเฟอร์เดิมถ้าห่างเกิน 5 นาที
    if (Date.now() - batch.timestamp > 300000) {
      batch = { imageIds: [], voiceId: null, text: "", timestamp: Date.now() };
    }
    batch.timestamp = Date.now();

    if (messageType === "image") {
      batch.imageIds.push(event.message.id);
    } else if (messageType === "audio") {
      batch.voiceId = event.message.id;
    } else if (messageType === "text") {
      batch.text = event.message.text.trim();
    }

    props.setProperty(cacheKey, JSON.stringify(batch));

    // หากรับรูปภาพมา ให้เริ่มประมวลผลเมื่อมีรูปภาพครบ
    if (batch.imageIds.length === 0) {
      return false;
    }

    // 3. เริ่มดึง Blobs และสกัดข้อมูล
    var imageBlobs = [];
    batch.imageIds.forEach(function(msgId) {
      if (typeof getLineContentAsBlob === "function") {
        var blob = getLineContentAsBlob(msgId);
        if (blob) imageBlobs.push(blob);
      }
    });

    if (imageBlobs.length === 0) return false;

    var voiceBlob = null;
    if (batch.voiceId && typeof getLineContentAsBlob === "function") {
      voiceBlob = getLineContentAsBlob(batch.voiceId);
    }

    // 4. ทำ OCR สกัดรหัสพนักงาน
    var extractedCodes = extractCodesFromImages(imageBlobs);
    if (!extractedCodes || extractedCodes.length === 0) {
      return false;
    }

    // 5. วิเคราะห์เสียงภาษาธรรมชาติด้วย Gemini AI (ดึงสถานที่พัก + เวลาเลิกงาน)
    var aiParsedVoice = parseVoiceWithGeminiAI(voiceBlob, batch.text);

    // 6. ดึงข้อมูลพนักงานจาก Sheet "รายชื่อพนักงาน"
    var staffDatabase = getStaffDatabaseFromSheet();
    var matchedEmployees = [];
    var detectedAccommodations = [];

    extractedCodes.forEach(function(code) {
      var staffInfo = findStaffByCode(code, staffDatabase);
      if (staffInfo) {
        matchedEmployees.push(staffInfo);
        if (staffInfo.accommodation && staffInfo.accommodation.trim() !== "") {
          detectedAccommodations.push(staffInfo.accommodation.trim());
        }
      } else {
        matchedEmployees.push({
          code: code,
          name: "รหัส " + code,
          department: "พนักงาน",
          accommodation: ""
        });
      }
    });

    // 7. กำหนดสถานที่พักตามผลวิเคราะห์จาก AI หรือฐานข้อมูล
    var primaryAccommodation = aiParsedVoice.accommodation;
    if (!primaryAccommodation) {
      primaryAccommodation = detectedAccommodations.length > 0 ? detectedAccommodations[0] : "เลคไซต์ 2";
    }

    // 8. กำหนดรอบเวลาทำงาน (Shift Time) จากเสียงภาษาธรรมชาติ
    var shiftTime = aiParsedVoice.shiftTime || TIMECARD_CONFIG.DEFAULT_SHIFT_TIME;

    // 9. สร้างข้อความรายงาน
    var todayStr = getFormattedThaiDateStr();
    var reportLines = [
      todayStr + " " + primaryAccommodation + " เข้า " + TIMECARD_CONFIG.DEFAULT_TARGET_SITE,
      shiftTime
    ];

    matchedEmployees.forEach(function(emp, index) {
      reportLines.push((index + 1) + "." + emp.name + "/ทำงานปกติ");
    });

    var finalReportText = reportLines.join("\n");

    // 10. ส่ง Push Message เข้ากลุ่ม LINE "รายงานการทำงาน 52"
    var targetGroupId = findTargetGroupId(TIMECARD_CONFIG.TARGET_GROUP_NAME);
    var pushSuccess = false;

    if (targetGroupId) {
      if (typeof pushMessage === "function") {
        pushSuccess = pushMessage(targetGroupId, finalReportText);
      } else if (typeof pushMessageToAllowedGroups === "function") {
        pushSuccess = pushMessageToAllowedGroups(finalReportText);
      }
    } else {
      if (typeof pushMessageToAllowedGroups === "function") {
        pushSuccess = pushMessageToAllowedGroups(finalReportText);
      }
    }

    // 11. ส่งข้อความยืนยันตอบกลับหาผู้ส่งในแชทส่วนตัว
    if (typeof reply === "function" && event.replyToken) {
      var confirmMsg = "✅ [ระบบประมวลผลบัตรตอกอัตโนมัติ]\nสกัดข้อมูลสำเร็จ " + matchedEmployees.length + " คน\nส่งรายงานเข้ากลุ่มแล้ว:\n\n" + finalReportText;
      reply(event.replyToken, confirmMsg);
    }

    // ล้าง Cache เมื่อประมวลผลสำเร็จ
    props.deleteProperty(cacheKey);
    return true;

  } catch (err) {
    console.error("handleAutoTimecardEvent Error: " + err.message);
    return false;
  }
}

/**
 * ใช้ Gemini AI วิเคราะห์ข้อความเสียงภาษาธรรมชาติ (ดึงสถานที่พัก + เวลาเลิกงาน)
 * @param {Blob} voiceBlob - ไฟล์เสียง
 * @param {string} rawText - ข้อความประกอบ (ถ้ามี)
 * @returns {Object} { accommodation: string|null, shiftTime: string|null }
 */
function parseVoiceWithGeminiAI(voiceBlob, rawText) {
  var result = { accommodation: null, shiftTime: null };
  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY_LINE");
    if (!apiKey) return result;

    var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;
    var parts = [];

    var promptText = "วิเคราะห์ข้อความเสียงภาษาไทยธรรมชาตินี้เกี่ยวกับรายงานการทำงาน:\n" +
      "1. ระบุชุด/สถานที่พัก:\n" +
      "   - หากกล่าวถึง 'ชุดหนู', 'หนู', 'พี่หนู', 'ทีมหนู' ให้ตอบ accommodation เป็น 'เลคไซต์ 2'\n" +
      "   - หากกล่าวถึง 'ชุดพม่า', 'พม่า', 'ทีมพม่า' ให้ตอบ accommodation เป็น 'สวนหลวง ร.9'\n" +
      "   - หากระบุสถานที่อื่น ให้ตอบตามนั้น\n" +
      "2. ระบุเวลาทำงาน (Shift Time):\n" +
      "   - สกัดเวลาเลิกงานจากภาษาพูดธรรมชาติ เช่น 'เลิกสองทุ่ม' -> '08.00-20.00', 'เลิกทุ่มครึ่ง' -> '08.00-19.30', 'เลิกห้าโมง' -> '08.00-17.00', 'เลิก 20.30' -> '08.00-20.30'\n" +
      "ตอบเป็น JSON สั้นๆ ดังนี้เท่านั้น: {\"accommodation\": \"...\", \"shiftTime\": \"08.00-XX.XX\"}";

    parts.push({ text: promptText });

    if (rawText) {
      parts.push({ text: "ข้อความภาษาไทยเสริม: " + rawText });
    }

    if (voiceBlob) {
      var base64Data = Utilities.base64Encode(voiceBlob.getBytes());
      var mimeType = voiceBlob.getContentType() || "audio/m4a";
      parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
    }

    var payload = { contents: [{ parts: parts }] };

    var res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (res.getResponseCode() === 200) {
      var json = JSON.parse(res.getContentText());
      if (json.candidates && json.candidates[0].content) {
        var respText = json.candidates[0].content.parts[0].text.trim();
        var cleanJsonStr = respText.replace(/```json/g, "").replace(/```/g, "").trim();
        var parsedObj = JSON.parse(cleanJsonStr);
        if (parsedObj.accommodation) result.accommodation = parsedObj.accommodation;
        if (parsedObj.shiftTime) result.shiftTime = parsedObj.shiftTime;
      }
    }
  } catch (e) {
    console.error("parseVoiceWithGeminiAI error: " + e.message);
  }

  // Local Fallback Regex Matching ถ้า AI ล้มเหลว
  if (!result.accommodation && rawText) {
    var text = rawText.toLowerCase();
    if (text.indexOf("ชุดหนู") !== -1 || text.indexOf("หนู") !== -1) result.accommodation = "เลคไซต์ 2";
    else if (text.indexOf("ชุดพม่า") !== -1 || text.indexOf("พม่า") !== -1) result.accommodation = "สวนหลวง ร.9";
  }

  return result;
}

/**
 * ค้นหา Group ID ตามชื่อกลุ่ม
 */
function findTargetGroupId(groupName) {
  try {
    var props = PropertiesService.getScriptProperties();
    var savedGroupId = props.getProperty("TARGET_GROUP_ID");
    if (savedGroupId) return savedGroupId;

    var whitelistString = props.getProperty("ALLOWED_GROUP_IDS");
    if (whitelistString) {
      var ids = whitelistString.split(",").map(function(id) { return id.trim(); }).filter(Boolean);
      if (ids.length > 0) return ids[0];
    }
  } catch (e) {
    console.error("findTargetGroupId error: " + e.message);
  }
  return null;
}

/**
 * ทำ OCR ด้วย Gemini Vision
 */
function extractCodesFromImages(imageBlobs) {
  var extractedCodes = [];
  var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY_LINE") 
            || PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY_WEB");
            
  if (!apiKey || !imageBlobs || imageBlobs.length === 0) return extractedCodes;

  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;

  imageBlobs.forEach(function(blob) {
    try {
      var base64Data = Utilities.base64Encode(blob.getBytes());
      var mimeType = blob.getContentType() || "image/jpeg";

      var promptText = "ทำ OCR รูปภาพบัตรตอกนี้ แล้วสกัดรหัสพนักงานทั้งหมดออกมา ตอบเป็น JSON Array ของ String เท่านั้น เช่น [\"10234\", \"10235\"] ห้ามมีข้อความอื่นเด็ดขาด";

      var payload = {
        contents: [{
          parts: [
            { text: promptText },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }]
      };

      var res = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      if (res.getResponseCode() === 200) {
        var json = JSON.parse(res.getContentText());
        if (json.candidates && json.candidates[0].content) {
          var responseText = json.candidates[0].content.parts[0].text.trim();
          var cleanJsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
          var parsedCodes = JSON.parse(cleanJsonStr);
          if (Array.isArray(parsedCodes)) {
            parsedCodes.forEach(function(c) { extractedCodes.push(String(c).trim()); });
          }
        }
      }
    } catch (err) {
      console.error("OCR Fetch Error: " + err.message);
    }
  });

  return extractedCodes;
}

/**
 * ดึงฐานข้อมูลพนักงานจาก Sheet
 */
function getStaffDatabaseFromSheet() {
  try {
    var ssId = PropertiesService.getScriptProperties().getProperty("EXTERNAL_DATABASE_ID");
    if (!ssId) return [];

    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName("รายชื่อพนักงาน");
    if (!sheet) return [];

    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0].map(function(h) { return String(h).trim(); });
    var colCode = headers.indexOf("รหัสพนักงาน") !== -1 ? headers.indexOf("รหัสพนักงาน") : 0;
    var colName = headers.indexOf("ชื่อ-นามสกุล") !== -1 ? headers.indexOf("ชื่อ-นามสกุล") : 1;
    var colDept = headers.indexOf("ตำแหน่ง") !== -1 ? headers.indexOf("ตำแหน่ง") : (headers.indexOf("แผนก") !== -1 ? headers.indexOf("แผนก") : 2);
    var colAccom = headers.indexOf("สถานที่พัก") !== -1 ? headers.indexOf("สถานที่พัก") : 3;

    var staffList = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (row[colName]) {
        staffList.push({
          code: String(row[colCode]).trim(),
          name: String(row[colName]).trim(),
          department: String(row[colDept] || "พนักงาน").trim(),
          accommodation: String(row[colAccom] || "").trim()
        });
      }
    }
    return staffList;
  } catch (e) {
    console.error("getStaffDatabaseFromSheet error: " + e.message);
    return [];
  }
}

/**
 * ค้นหาข้อมูลพนักงานด้วยรหัส
 */
function findStaffByCode(code, staffDatabase) {
  if (!code || !staffDatabase) return null;
  var cleanCode = String(code).trim();
  for (var i = 0; i < staffDatabase.length; i++) {
    if (staffDatabase[i].code === cleanCode || staffDatabase[i].name.indexOf(cleanCode) !== -1) {
      return staffDatabase[i];
    }
  }
  return null;
}

/**
 * ฟังก์ชันจัดรูปแบบวันที่ภาษาไทย (#DD/M/YY)
 */
function getFormattedThaiDateStr() {
  var now = new Date();
  var day = String(now.getDate()).padStart(2, '0');
  var month = String(now.getMonth() + 1);
  var yearBE = (now.getFullYear() + 543) % 100;
  return "#" + day + "/" + month + "/" + yearBE;
}
