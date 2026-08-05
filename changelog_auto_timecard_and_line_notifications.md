# 📋 Changelog: สรุปผลการปรับปรุงระบบประมวลผลบัตรตอกอัตโนมัติ และการส่งการแจ้งเตือน LINE

**วันที่ทำรายการ:** 5 สิงหาคม 2569 (2026-08-05)  
**ผู้ดำเนินการ:** Antigravity AI (Lead Python System Architect & Antigravity MCP Expert)

---

## 🛠️ รายการแก้ไขและเพิ่มฟีเจอร์ทั้งหมด (Summary of Changes)

### 1. 🤖 ระบบประมวลผลบัตรตอกอัตโนมัติ + เสียงภาษาธรรมชาติ (Auto Timecard & Audio Processing)
- **ไฟล์ที่สร้างใหม่:** `13_AutoTimecardProcessor.js`
- **ฟีเจอร์:**
  - **ดักจับผู้ส่งแชทส่วนตัว:** กรองข้อความแชท 1-on-1 จากผู้ส่งชื่อ *"สาสา สาสา"* ให้อัตโนมัติ
  - **Gemini Vision OCR:** สกัดรหัสพนักงานจากสติกเกอร์ 5 หลักและบัตรตอกเขียนมือ (Galileo)
  - **Gemini Audio STT & Natural Language Parsing:** วิเคราะห์เสียงพูดภาษาไทยธรรมชาติ:
    - สถานที่พัก: *"ชุดหนู"* $\rightarrow$ `เลคไซต์ 2`, *"ชุดพม่า"* $\rightarrow$ `สวนหลวง ร.9`
    - เวลาเลิกงาน: *"เลิกทุ่มครึ่ง"* $\rightarrow$ `08.00-19.30`, *"เลิกสองทุ่ม"* $\rightarrow$ `08.00-20.00`
  - **การจัดรูปแบบข้อความ:** `#DD/M/YY [สถานที่พัก] เข้า เล็กไซต์ 2`, `08.00-20.00`, `1.[ชื่อ-นามสกุล]/ทำงานปกติ`
  - **Auto Forwarding:** ยิง Push Message ส่งรายงานเข้ากลุ่ม LINE *"รายงานการทำงาน 52"* อัตโนมัติ

### 2. 📲 ระบบส่งข้อความสรุปเข้ากลุ่ม LINE จาก WebApp
- **ไฟล์ที่แก้ไข:** `2_WebApp.js`, `5_SupportMisc.js`, `index.html`
- **ฟีเจอร์:**
  - เพิ่มฟังก์ชัน `pushMessageToAllowedGroups` ใน `5_SupportMisc.js`
  - ปรับ `saveDailyReport` ใน `2_WebApp.js` ให้ใช้ `writeToDailySheetBatch` และส่งข้อความสรุปเข้ากลุ่ม LINE ที่ระบุไว้ใน `ALLOWED_GROUP_IDS` ทันทีหลังบันทึกสำเร็จ

### 3. 🧠 อัปเดตชื่อ AI Model ทั้งระบบ
- **ไฟล์ที่แก้ไข:** `Config.js`, `Script properties.js`, `7_AI_Core.js`, `5_SupportMisc.js`, `index.html`, `SmartWorksiteDashboard.html`
- **การเปลี่ยนแปลง:** เปลี่ยนการเรียกใช้งาน AI Model จาก `gemini-2.5-flash` เป็น `gemini-1.5-flash` ทั้งหมด

### 4. 🐞 แก้ไขบั๊ก ReferenceError
- **ไฟล์ที่แก้ไข:** `index.html`, `SmartWorksiteDashboard.html`
- **การเปลี่ยนแปลง:** แก้ไข `ReferenceError: MOCK_SITES_WITH_COORDS is not defined` ในส่วนของการสร้างตัวเลือก `<select>` ไซต์งาน ให้ดึงค่าจาก `sites` แบบไดนามิก 100%

---

## 🚀 การ Deploy ขึ้นระบบจริง
- พุชไฟล์ทั้งหมดผ่าน `npx @google/clasp push`
- อัปเดต Deployment เดิม (`AKfycbyJcb7sIAaH4VYMjicnh-qTXuYH7r3JBuZpsI9eR8xPhWgOLSmMDJZgW_bY8T10O2wX1A` @779) สำเร็จ เรียบร้อยแล้ว
