# 📋 Changelog: สรุปผลการปิดงานแก้ไขระบบ LINE Bot และการรวบรวมรายงาน PDF

**วันที่ทำรายการ:** 6 สิงหาคม 2569 (2026-08-06 14:13 น.)  
**ผู้ดำเนินการ:** Antigravity AI (Lead Python System Architect & IDE Prompt Architect)  
**สถานะการปิดงาน:** สรุปรายการแก้ไข, อัปเดตโครงสร้าง, Deploy ขึ้น GAS, Commit & Push และบันทึก Review Log เรียบร้อยแล้ว

---

## 🛠️ รายการแก้ไขและปรับปรุงทั้งหมด (Summary of Changes)

### 1. 🤖 แก้ไขคำสั่ง `#ยกเลิกล่าสุด` สำหรับ LINE Group Chat
- **ไฟล์ที่แก้ไข:** `1_bot line.js`, `DailySheetProcessor.js`
- **การเปลี่ยนแปลง:**
  - เพิ่มการส่ง `groupId` จาก `handleLineWebhook` เข้าไปยัง `handleClockIn`
  - บันทึก Cache Key **2 คีย์พร้อมกัน** ได้แก่ `LAST_ENTRY_${userId}` และ `LAST_ENTRY_${groupId}`
  - ปรับ `handleUndoLastAction` ให้ค้นหา `LAST_ENTRY_${groupId}` ก่อน แล้วจึง fallback ไป `LAST_ENTRY_${userId}`
  - ป้องกันปัญหาคำสั่ง `#ยกเลิกล่าสุด` ไม่ทำงานเมื่อพิมพ์ในกลุ่ม LINE

### 2. ⏰ แก้ไขลอจิก `OTต่อเนื่อง` ไม่โดนหักเวลาพัก 30 นาที
- **ไฟล์ที่แก้ไข:** `4_CoreDatabase.js`, `3_SharedFunctions.js`
- **การเปลี่ยนแปลง:**
  - เพิ่มเงื่อนไข `!isContinuousOT` ในการคำนวณเวลาเริ่ม OT เย็น (`otEIn`) ใน `calculateAndTimeEntryFromValues` บรรทัดที่ 245
  - แก้ไขตรรกะการแปลงปี พ.ศ. 2 หลัก (เช่น `69` -> 2569 BE -> 2026 AD) ไม่ให้หลุดไปปี 2069
  - สามารถคำนวณเวลา OT เย็นได้เต็มจำนวนตั้งแต่ 17.00 น. ถึง 22.00 น. (5.0 ชั่วโมงเต็ม) โดยไม่ถูกตัด 30 นาที

### 3. ✏️ แก้ไขโหมด `แก้ไข` ให้ล้างรายการเดิมตามวันที่ก่อนลงบันทึกใหม่
- **ไฟล์ที่แก้ไข:** `1_bot line.js`
- **การเปลี่ยนแปลง:**
  - เมื่อตรวจพบคำสั่งเริ่มต้นด้วย `แก้ไข` ระบบจะแกะรายชื่อพนักงานและวันที่จากข้อความ
  - เรียกใช้ `undoLastEntry(emp.firstname, data.date)` เพื่อล้างข้อมูลเก่าในคอลัมน์ F-Q ของพนักงานทุกคนในวันที่ระบูก่อนลงบันทึกใหม่เสมอ

### 4. 📄 รวบรวมเอกสาร Markdown และสร้างรายงาน PDF
- **ไฟล์ที่เกี่ยวข้อง:** `generate_pdf.py`
- **การเปลี่ยนแปลง:**
  - สแกนและรวบรวมไฟล์ `.md` ของโปรเจกต์ 52 ที่มีการแก้ไขวันที่ 5-6 สิงหาคม 2569
  - แปลง Markdown เป็น PDF ผ่าน Microsoft Edge Headless Rendering
  - สร้างไฟล์ `Project_52_Markdown_Report_20260805_20260806.pdf` (ขนาด 1.95 MB) พร้อม styling สวยงามและรองรับภาษาไทยสมบูรณ์

---

## 🚀 ผลการ Deploy และ CI/CD Status
- **Google Apps Script:** `npx clasp push -f` (29 ไฟล์)
- **Deployment ID:** `AKfycby5Ocmfiu1jHcKxe-ZbKJPV7tiNGXinILojdwnHAiUKgUZ9dqpQfY8zof0EJGqo8qIE2A` (Deployment Version @790)
- **Git Commit:** `"ปิดงาน: แก้ไขบอทไลน์ #ยกเลิกล่าสุด OTต่อเนื่อง โหมดแก้ไข และสร้าง PDF 06/08/2026 14:13"`
- **Git Status:** Sync กับ `origin/master` สมบูรณ์
