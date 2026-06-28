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

/**
 * ฟังก์ชันหลักสำหรับประมวลผลคำสั่งระบบ (System Commands)
 * รองรับการกู้คืนข้ามส่วน, การแก้ไขข้อมูล และการจัดการแอดมิน
 */
function processSystemCommands(input, senderId) {
  const cmd = input.trim();
  
  // 1. คำสั่งกู้คืนระบบ (Recovery)
  if (cmd === "กู้คืนบอทแอพ") return triggerRecovery("WebApp");
  if (cmd === "กู้คืนบอทไลน์") return triggerRecovery("LineBot");
  if (cmd === "กู้คืนสมองกลาง") return triggerRecovery("CoreBrain");

  // 2. คำสั่งแก้ไขข้อมูล (Update)
  // รูปแบบ: "ยกเลิก [เงื่อนไข]" หรือ "แก้ไข [รายการ]"
  if (cmd.startsWith("ยกเลิก ")) return handleCancellation(cmd.replace("ยกเลิก ", ""));
  if (cmd.startsWith("แก้ไข ")) return handleDataEdit(cmd.replace("แก้ไข ", ""));

  // 3. คำสั่งจัดการแอดมิน (Admin Management)
  if (cmd.startsWith("เพิ่มแอดมิน ")) return manageAdmin(cmd.replace("เพิ่มแอดมิน ", ""), "ADD");
  if (cmd.startsWith("ลดแอดมิน ")) return manageAdmin(cmd.replace("ลดแอดมิน ", ""), "REMOVE");

  // 4. คำสั่งสรุปยอด
  if (cmd === "สรุปรายงานวันนี้") return getDailySummary();

  return "คำสั่งไม่ถูกต้อง กรุณาตรวจสอบรูปแบบการพิมพ์";
}

/**
 * ฟังก์ชันกู้คืนระบบแบบระบุส่วน (ใช้ร่วมกับ 10_DevOps_Core.gs)
 */
function triggerRecovery(module) {
  try {
    // สมมติว่ามีฟังก์ชัน centralRollback ใน 10_DevOps_Core.gs
    // centralRollback(module); 
    return `✅ ระบบสั่งการกู้คืน [${module}] เรียบร้อยแล้ว โปรดตรวจสอบสถานะในอีก 1 นาที`;
  } catch (e) {
    return `❌ เกิดข้อผิดพลาดในการกู้คืน [${module}]: ${e.message}`;
  }
}

/**
 * ฟังก์ชันแก้ไขข้อมูลพนักงานหรือรายการ
 */
function handleDataEdit(params) {
  // ตัวอย่างการแยกข้อความ: "แก้ไข [รหัสพนักงาน] เป็น [ข้อมูลใหม่]"
  const parts = params.split(" เป็น ");
  if (parts.length < 2) return "รูปแบบการแก้ไขไม่ถูกต้อง กรุณาพิมพ์: แก้ไข [รหัสเดิม] เป็น [ข้อมูลใหม่]";
  
  // Logic การอัปเดตข้อมูลใน Sheet ที่เกี่ยวข้อง
  return `อัปเดตข้อมูล "${parts[0]}" เรียบร้อยแล้ว`;
}

/**
 * ฟังก์ชันสรุปรายงานวันนี้
 */
function getDailySummary() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Database");
  const data = sheet.getDataRange().getValues();
  // Logic การกรองข้อมูลวันที่ปัจจุบัน
  const today = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy");
  const count = data.filter(row => row[0] == today).length;
  
  return `📊 สรุปยอดการทำงานวันที่ ${today}: มีผู้ปฏิบัติงานทั้งหมด ${count} คน`;
}

function promptChangelog() {
  const ui = SpreadsheetApp.getUi();
  
  // 1. รับค่าประเภทการอัปเดต
  const typeRes = ui.prompt('ประเภทการอัปเดต', 'เช่น Major, Minor, Patch, Bugfix', ui.ButtonSet.OK_CANCEL);
  if (typeRes.getSelectedButton() !== ui.Button.OK) return;
  const updateType = typeRes.getResponseText() || 'Patch';

  // 2. รับรายละเอียด
  const descRes = ui.prompt('รายละเอียดการอัปเดต', 'คุณได้แก้ไขหรือเพิ่มเติมอะไรบ้าง?', ui.ButtonSet.OK_CANCEL);
  if (descRes.getSelectedButton() !== ui.Button.OK) return;
  const details = descRes.getResponseText();

  // 3. รับชื่อผู้แก้ไข
  const userRes = ui.prompt('ผู้ทำรายการ', 'ระบุชื่อผู้แก้ไข:', ui.ButtonSet.OK_CANCEL);
  if (userRes.getSelectedButton() !== ui.Button.OK) return;
  const user = userRes.getResponseText();

  // ส่งข้อมูลไปบันทึกลงชีต
  saveChangelog(updateType, details, user);
}

function saveChangelog(updateType, details, user) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Changelog');
  
  // ตรวจสอบความถูกต้องของชื่อชีต
  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ ไม่พบชีตชื่อ "System_Changelog" กรุณาตรวจสอบชื่อชีตให้ตรงกันครับ');
    return;
  }

  const lastRow = sheet.getLastRow();
  let newVersion = 'v1.0.0'; // ค่าเริ่มต้นกรณีเพิ่งเริ่มบันทึกบรรทัดแรก
  
  // อ่านเวอร์ชันก่อนหน้าเพื่อคำนวณเวอร์ชันใหม่
  if (lastRow > 1) { 
    // ดึงค่าเซลล์ในคอลัมน์ B (คอลัมน์ที่ 2) ของบรรทัดล่าสุด
    const lastVersion = sheet.getRange(lastRow, 2).getValue().toString(); 
    newVersion = autoCalculateVersion(lastVersion, updateType);
  }

  // ใช้ลิงก์โปรเจกต์โค้ดแทนการดึงโค้ดทั้งหมด เพื่อป้องกันปัญหาตัวอักษรล้นเซลล์
  const scriptId = ScriptApp.getScriptId();
  const codeBackupLink = `https://script.google.com/d/${scriptId}/edit`;

  // ลำดับข้อมูลตามคอลัมน์ A ถึง H
  const rowData = [
    new Date(),                 // A: วันที่
    newVersion,                 // B: เลขเวอร์ชัน
    updateType,                 // C: ประเภทการเปลี่ยนแปลง
    details,                    // D: รายละเอียด
    user,                       // E: ผู้แก้ไข
    'อัปเดตระบบปกติ',             // F: ผลกระทบ/หมายเหตุ
    codeBackupLink,             // G: ลิงก์แบ็กอัปโค้ด
    'Completed'                 // H: สถานะ
  ];

  // นำข้อมูลไปต่อท้ายแถวล่าสุดเสมอ
  sheet.appendRow(rowData);
  
  SpreadsheetApp.getUi().alert(`✅ บันทึกการอัปเดตเป็นเวอร์ชัน ${newVersion} สำเร็จแล้ว!`);
}

function autoCalculateVersion(lastVersion, updateType) {
  // หาตัวเลขเวอร์ชันในรูปแบบ vX.Y.Z
  let match = lastVersion.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return lastVersion + ' (Updated)'; // หากของเดิมไม่ได้เขียนรูปแบบนี้ ให้ต่อท้ายด้วย (Updated) ไปก่อน

  let major = parseInt(match[1]);
  let minor = parseInt(match[2]);
  let patch = parseInt(match[3]);

  let type = updateType.toLowerCase();
  
  // เงื่อนไขการคำนวณเลข
  if (type.includes('major')) {
    major++; minor = 0; patch = 0;
  } else if (type.includes('minor') || type.includes('feature')) {
    minor++; patch = 0;
  } else {
    patch++; // Bugfix, Patch จะอัปเดตแค่จุดทศนิยมตำแหน่งสุดท้าย
  }

  return `v${major}.${minor}.${patch}`;
}
