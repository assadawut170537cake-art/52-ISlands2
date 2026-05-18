/**
 * 🧠 AI ASSISTANT CORE SYSTEM
 * หน้าที่: ประมวลผลภาษาธรรมชาติ (ข้อความ/เสียง) เปลี่ยนตรรกะระบบแบบ Dynamic และบันทึกประวัติ 5 ชั้น
 */

function processUserChat(prompt, userId, replyToken) {
  try {
    const props = PropertiesService.getScriptProperties();
    const adminIds = (props.getProperty("ADMIN_LINE_IDS") || "").split(",").map(s => s.trim()).filter(Boolean);
    const isAdmin = userId && adminIds.includes(userId);

    // 🚀 ทางลัดด่วน: คำสั่งกู้คืนระบบของแอดมิน (ไม่ต้องส่งไปถาม AI)
    if (prompt.trim() === "กู้คืนระบบ" || prompt.toLowerCase() === "rollback") {
      const rollbackResult = rollbackLogic(userId, 1);
      return { success: rollbackResult.success, text: rollbackResult.success ? rollbackResult.message : rollbackResult.error };
    }

    const validNames = getValidNamesForAI(); // เรียกฟังก์ชันดึงรายชื่อเดิมของคุณ
    const currentLogic = getCurrentLogic();

    const systemInstruction = `คุณคือ AI ผู้ช่วยประจำระบบ Smart Worksite System
    รายชื่อพนักงานในระบบปัจจุบัน: ${validNames}
    ตรรกะควบคุมระบบปัจจุบัน: ${JSON.stringify(currentLogic)}

    หน้าที่และวิธีการตอบกลับ:
    1. แนะนำการใช้งาน (Guide): หากผู้ใช้ถามวิธีใช้แอป ให้ตอบอธิบายสั้น กระชับ สุภาพ สไตล์พี่สอนน้อง เป็นข้อๆ (Bullet points)
    2. บันทึกงาน (Natural Language Input): หากผู้ใช้สั่งงานด้วยภาษาทั่วไป ให้แปลงเป็นโครงสร้าง JSON นี้เท่านั้น:
       {"type":"SAVE", "payload": {"date":"YYYY-MM-DD", "default_site":"ชื่อไซต์", "time_start":"08.00", "time_end":"17.00", "employees":[{"firstname":"ชื่อพนักงาน","task":"ลักษณะงาน"}]}}
       *กฎล็อกย้อนหลัง:* ตรรกะปัจจุบันยอมให้บันทึกย้อนหลังได้ ${currentLogic.backdate_limit} วัน (สถานะผู้ใช้ปัจจุบันคือ Admin: ${isAdmin})
    3. อัปเดตตรรกะระบบ: หากแอดมินสั่งปรับเปลี่ยนกฎเกณฑ์ ให้ตอบกลับเป็น JSON นี้เท่านั้น:
       {"type":"UPDATE_LOGIC", "new_logic": {"backdate_limit": 3}} (ปรับเปลี่ยนคีย์เท่าที่สั่ง)
       *กฎเหล็ก:* จำกัดสิทธิ์เฉพาะ Admin เท่านั้น

    สรุปใจความสำคัญไว้บรรทัดแรกเสมอ ใช้ภาษาสุภาพ เป็นกันเอง`;

    // เรียกใช้ระบบส่งคำสั่งหา Gemini จากไฟล์ gemini_wrappers.gs เดิมของคุณ
    const aiRawText = callGemini(prompt, systemInstruction, false);
    if (!aiRawText) return { success: false, text: "⚠️ ไม่สามารถติดต่อสมอง AI ได้ในขณะนี้ครับ" };

    // ตรวจสอบว่าคำตอบจาก AI เป็นโครงสร้างคำสั่ง (JSON) หรือไม่
    let data;
    try {
      data = JSON.parse(aiRawText.replace(/```json/g, "").replace(/```/g, "").trim());
    } catch(e) {
      // ถ้าไม่ใช่ JSON แสดงว่าเป็นข้อความพูดคุย/แนะนำการใช้งานทั่วไป
      return { success: true, text: aiRawText };
    }

    // --- แยกเส้นทางการทำงานตามคำสั่งที่ AI วิเคราะห์ได้ ---
    
    // โหมดที่ 1: การลงเวลาทำงาน
    if (data.type === "SAVE") {
      const today = new Date();
      const entryDate = new Date(data.payload.date);
      const diffDays = Math.ceil(Math.abs(today - entryDate) / (1000 * 60 * 60 * 24));
      const allowedDays = currentLogic.backdate_limit;
      
      if (diffDays > allowedDays && !isAdmin) {
        return { success: false, text: `❌ ไม่สามารถลงข้อมูลย้อนหลังเกิน ${allowedDays} วันได้ครับ (จำกัดสิทธิ์เฉพาะ Admin)` };
      }
      
      // 🚀 ส่งต่อข้อมูลที่ AI แปลงได้ ไปรันที่ฟังก์ชัน handleClockIn เดิมของคุณทันที
      handleClockIn(prompt, userId, replyToken, data.payload);
      return { success: true, text: null }; // ส่ง null เพื่อให้ handleClockIn เป็นตัวตอบไลน์เอง
    }

    // โหมดที่ 2: แอดมินสั่งแก้ตรรกะระบบหลังบ้าน
    if (data.type === "UPDATE_LOGIC") {
      if (!isAdmin) return { success: false, text: "🔒 ขออภัยครับ สิทธิ์การเปลี่ยนกฎระบบจำกัดเฉพาะ Admin ครับ" };
      const updateResult = updateLogic(JSON.stringify(data.new_logic), "Admin", "อัปเดตระบบผ่านแชท");
      return { success: updateResult.success, text: updateResult.success ? updateResult.message : "⚠️ " + updateResult.error };
    }

    return { success: true, text: aiRawText };

  } catch (err) {
    return { success: false, text: "🔴 เกิดข้อผิดพลาดในระบบสมองกล: " + err.message };
  }
}

// ==========================================
// ระบบจัดเก็บตรรกะแบบแปรผัน และระบบประวัติ 5 ชั้น
// ==========================================

function updateLogic(newLogicJson, updatedBy = "AI", note = "AI อัปเดตตรรกะใหม่ตามคำสั่ง") {
  try {
    const parsed = JSON.parse(newLogicJson);
    const allowedKeys = ["ot_rule", "backdate_limit", "allow_overtime_noon"];
    if (!Object.keys(parsed).every(key => allowedKeys.includes(key))) throw new Error("ตรวจพบคีย์ที่ไม่ได้รับอนุญาต");

    const scriptProperties = PropertiesService.getScriptProperties();
    const currentLogic = getCurrentLogic();
    
    // สำรองข้อมูลลงคลังประวัติก่อนเปลี่ยนค่า
    addLogicHistory(currentLogic, updatedBy, "update", note);
    
    // ผสานข้อมูลเก่าและใหม่เข้าด้วยกัน (Merge)
    const mergedLogic = { ...currentLogic, ...parsed };
    scriptProperties.setProperty('DYNAMIC_SYSTEM_LOGIC', JSON.stringify(mergedLogic));

    return { success: true, message: "✅ อัปเดตตรรกะระบบเรียบร้อยแล้วครับ" };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getCurrentLogic() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const savedLogic = scriptProperties.getProperty('DYNAMIC_SYSTEM_LOGIC');
  if (savedLogic) return JSON.parse(savedLogic);
  
  // ค่าเริ่มต้นของระบบกรณีติดตั้งครั้งแรก
  return {
    ot_rule: "standard",
    backdate_limit: 2,
    allow_overtime_noon: true
  };
}

function addLogicHistory(logicObj, updatedBy, action, note) {
  const props = PropertiesService.getScriptProperties();
  let history = props.getProperty('DYNAMIC_SYSTEM_LOGIC_HISTORY');
  history = history ? JSON.parse(history) : [];

  const timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  history.unshift({
    logic: logicObj,
    timestamp: timestamp,
    updatedBy: updatedBy,
    action: action,
    note: note
  });

  // ล็อกประวัติไว้ไม่ให้เกิน 5 ชั้นล่าสุด
  if (history.length > 5) history = history.slice(0, 5);
  props.setProperty('DYNAMIC_SYSTEM_LOGIC_HISTORY', JSON.stringify(history));
}

function rollbackLogic(userId, step = 1) {
  const props = PropertiesService.getScriptProperties();
  const adminIds = (props.getProperty("ADMIN_LINE_IDS") || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!userId || !adminIds.includes(userId)) return { success: false, error: "🔒 จำกัดสิทธิ์เฉพาะ Admin เท่านั้นครับ" };

  let history = props.getProperty('DYNAMIC_SYSTEM_LOGIC_HISTORY');
  history = history ? JSON.parse(history) : [];

  if (history.length < step) return { success: false, error: "❌ ไม่พบประวัติการแก้ไขย้อนหลังในระบบ" };

  const rollbackItem = history[step - 1];
  const currentLogic = getCurrentLogic();
  
  addLogicHistory(currentLogic, "Admin", "rollback", `บันทึกค่าก่อนย้อนระบบกลับ ${step} ขั้น`);
  props.setProperty('DYNAMIC_SYSTEM_LOGIC', JSON.stringify(rollbackItem.logic));

  return { success: true, message: `↩️ กู้คืนตรรกะระบบย้อนหลัง ${step} ชั้นสำเร็จแล้วครับ` };
}