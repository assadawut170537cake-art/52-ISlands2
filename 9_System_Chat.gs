// =================================================================
// 9_System_Chat.gs (ระบบปรับแต่งค่า และโต้ตอบ Google Chat)
// =================================================================

/**
 * 1. ฟังก์ชันปรับเกณฑ์คะแนนความแม่นยำ (Fuzzy Threshold)
 */
function updateSystemThreshold(newThreshold, updatedBy) {
  const score = parseFloat(newThreshold);
  
  if (isNaN(score) || score < 0.50 || score > 0.95) {
    return { success: false, message: "⚠️ ปรับไม่สำเร็จ: เกณฑ์คะแนนต้องเป็นตัวเลขระหว่าง 0.50 ถึง 0.95 ครับ" };
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperty("FUZZY_MATCH_THRESHOLD", score.toFixed(2));

  if (typeof addLogicHistory === 'function') {
    addLogicHistory({ DYNAMIC_THRESHOLD: score }, updatedBy, "update_threshold", `ปรับเกณฑ์ความแม่นยำเป็น ${score * 100}%`);
  }

  return { success: true, message: `⚙️ ปรับเกณฑ์ความแม่นยำเป็น ${(score * 100).toFixed(0)}% เรียบร้อยโดยคุณ ${updatedBy} ครับ` };
}

/**
 * 2. ฟังก์ชันเพิ่ม/ลด คำศัพท์ในคลังข้อมูลหลัก (Reference Words)
 */
function manageReferenceWord(action, word, updatedBy) {
  if (!word || word.trim() === "") return { success: false, message: "⚠️ กรุณาระบุคำหลักที่ต้องการจัดการครับ" };
  
  try {
    const targetWord = word.trim();
    const ssId = PropertiesService.getScriptProperties().getProperty("EXTERNAL_DATABASE_ID");
    if (!ssId) return { success: false, message: "❌ ไม่พบ KEY ฐานข้อมูลกลาง (EXTERNAL_DATABASE_ID)" };
    
    const ss = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheetByName("DATA");
    if (!sheet) return { success: false, message: "❌ ไม่พบหน้าชีตชื่อ 'DATA' ในระบบ" };

    const lastRow = sheet.getLastRow();
    const range = sheet.getRange(2, 3, lastRow > 1 ? lastRow - 1 : 1, 1);
    const values = range.getValues().map(r => r[0].toString().trim());

    if (action === "add") {
      if (values.includes(targetWord)) {
        return { success: false, message: `⚠️ คำว่า "${targetWord}" มีอยู่ในคลังไซต์งานเดิมอยู่แล้วครับ` };
      }
      sheet.appendRow(["", "", targetWord]); 
      return { success: true, message: `✅ เพิ่มคำหลัก "${targetWord}" ลงในฐานข้อมูลไซต์งานเรียบร้อยครับ` };
    } 
    
    if (action === "delete") {
      const index = values.indexOf(targetWord);
      if (index === -1) {
        return { success: false, message: `⚠️ ไม่พบคำหลัก "${targetWord}" ในคลังฐานข้อมูลครับ` };
      }
      sheet.deleteRow(index + 2);
      return { success: true, message: `🗑️ ลบคำหลัก "${targetWord}" ออกจากฐานข้อมูลเรียบร้อยครับ` };
    }

    return { success: false, message: "⚠️ คำสั่งไม่ถูกต้อง (รองรับเฉพาะ add หรือ delete)" };
  } catch (e) {
    return { success: false, message: `❌ เกิดข้อผิดพลาดทางเทคนิค: ${e.message}` };
  }
}

// -----------------------------------------------------------------
// Google Chat App Interactions
// -----------------------------------------------------------------

/**
 * 🚀 ฟังก์ชันมาตรฐานสำหรับรับข้อความจาก Google Chat 
 */
function onMessage(event) {
  try {
    const messageText = event.message.text.trim().toLowerCase();
    const senderName = event.user.displayName;

    if (messageText === "รายงาน" || messageText === "report") {
      const reportStatus = typeof generateProjectReportAndNotify === 'function' 
                           ? generateProjectReportAndNotify() 
                           : "ระบบกำลังปรับปรุงฟังก์ชันรายงานครับ";
                           
      return { "text": "รับทราบครับคุณ " + senderName + " ⏳ กำลังประมวลผล...\n\n" + reportStatus };
    }

    if (messageText === "วิธีใช้" || messageText === "help") {
      return {
        "text": "💡 *คู่มือด่วน Smart Worksite (Chat Edition):*\n" +
                "• พิมพ์ `รายงาน` : สั่งให้บอทสรุปยอดพนักงานและสร้างไฟล์ส่งให้ทันที\n" +
                "• พิมพ์ `วิธีใช้` : เรียกดูเมนูคำสั่ง"
      };
    }

    return { "text": "ขออภัยครับคุณ " + senderName + " ผมยังไม่รองรับคำสั่ง '" + messageText + "'\nลองพิมพ์ `วิธีใช้` เพื่อดูคำสั่งที่ผมเข้าใจนะครับ" };

  } catch (error) {
    return { "text": "🔴 เกิดข้อผิดพลาดในระบบโต้ตอบ: " + error.message };
  }
}

function onAddToSpace(event) {
  return { "text": "สวัสดีครับ! ผมคือผู้ช่วย Smart Worksite เข้ามาประจำการในห้องนี้แล้ว พิมพ์ `วิธีใช้` เพื่อเริ่มใช้งานได้เลยครับ" };
}

function onRemoveFromSpace(event) {
  console.log("บอทถูกเตะออกจาก Space: " + event.space.name);
}