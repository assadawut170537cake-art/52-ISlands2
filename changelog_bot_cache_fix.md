# 📝 Changelog: ปรับปรุงประสิทธิภาพบอทไลน์ (Cache & State Fix)

**วันที่:** 2 กรกฎาคม 2026
**ผู้ดำเนินการ:** J.A.R.V.I.S. (AI Assistant)

## 📌 สรุปปัญหาเดิม
- **Memory Leak & Quota Limit:** ระบบเดิมใช้ `PropertiesService` สำหรับเก็บสถานะ (State) ชั่วคราว (เช่น รอคำตอบการทำ OT) ซึ่งไม่มีระบบหมดอายุอัตโนมัติ ทำให้มีข้อมูลขยะค้างในฐานข้อมูลและเสี่ยงต่อการเกินโควต้า 500KB ของ Google Apps Script
- **Race Condition & คอขวด:** พบการเรียกใช้ `PropertiesService.getScriptProperties().getProperty()` โดยตรงแบบ Hard-code สำหรับค่า `ADMIN_LINE_IDS` และ `IS_TESTING` ทำให้เกิดความหน่วงเมื่อมีผู้ใช้งานพร้อมกันจำนวนมาก

## 🛠️ การแก้ไขที่ทำไป (ในไฟล์ `1_bot line.js`)
1. **ย้ายระบบ State ไปใช้ CacheService (TTL 30 นาที):**
   - เปลี่ยน `PropertiesService` เป็น `CacheService.getScriptCache()` ในตัวแปร `pendingClockIn12`, `pendingOTConfirm`, `pendingOTDetails` และ `LAST_ENTRY`
   - ปรับการดึงค่า (`getProperty` เป็น `get`), การเขียนค่า (`setProperty` เป็น `put` โดยระบุหมดอายุใน 1800 วินาที) และการลบค่า (`deleteProperty` เป็น `remove`)
2. **รวมศูนย์การเรียก Config (Single Source of Truth):**
   - เปลี่ยนการ Hard-code ค่า `ADMIN_LINE_IDS` และ `IS_TESTING` มาใช้ฟังก์ชัน `getDynamicConfig()` ที่เตรียมไว้

## 🚀 ผลการทดสอบ (Verification)
- ✅ Syntax ของ JavaScript ถูกต้อง 100%
- ✅ สถานะค้างจะถูกล้างอัตโนมัติเมื่อครบ 30 นาที หมดปัญหาขยะล้นระบบ
- ✅ โค้ดได้รับการ Deploy ผ่านระบบ CI/CD (`clasp push`) เรียบร้อยแล้ว
