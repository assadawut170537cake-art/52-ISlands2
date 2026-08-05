# Changelog: แก้ไขระบบยกเลิกล่าสุด (Undo Last Action) สำหรับ Group Chat และ Safety Guards

## 📌 สรุปรายการแก้ไข (Summary of Changes)
- **วันที่แก้ไข**: 6 สิงหาคม 2026
- **ไฟล์ที่เกี่ยวข้อง**: `1_bot line.js`
- **สถานะการ Deploy**: Deploy ขึ้น Google Apps Script (GAS) ผ่าน `clasp push` เรียบร้อยแล้ว (29 ไฟล์)

---

## 🛠️ รายละเอียดการแก้ไข (Technical Details)

### 1. 🛡️ เพิ่ม Safety Guard ใน `finalizeClockInSaving`
- **ปัญหาเดิม**: `customOt.split("/")` ทำงานโดยตรงนอก block ป้องกัน หาก `customOt` ไม่ใช่ string (เช่น เป็น `null` หรือ object) จะทำให้เกิด `TypeError` และ crash ก่อนที่จะถึงส่วนบันทึก Cache
- **การแก้ไข**: ตรวจสอบประเภทข้อมูล `typeof customOt === "string"` ก่อนรัน `.split("/")` เสมอ เพื่อให้การทำงานเสถียร 100%

### 2. 🔑 พัฒนาระบบ Dual-Key Caching รองรับ Group Chat และ DM
- **ปัญหาเดิม**: บันเทิง Cache Key เฉพาะ `LAST_ENTRY_${userId}` ทำให้เมื่อใช้งานใน LINE Group คำสั่ง `ยกเลิกล่าสุด` ไม่สามารถหาคีย์เจอเนื่องจาก `groupId` ไม่ตรงกับ `userId`
- **การแก้ไข**: 
  - บันทึก Cache **2 คีย์พร้อมกัน** ได้แก่ `LAST_ENTRY_${userId}` และ `LAST_ENTRY_${groupId}`
  - ฝัง `data.groupId = groupId` เข้าในอ็อบเจกต์ `data` ตั้งแต่ขั้นตอน `parseComplexMessage`

### 3. 🔍 ค้นหาแบบ Fallback และ Cleanup ทั้งสองคีย์ใน `handleUndoLastAction`
- **การค้นหา**: ให้ทดลองค้นหา `LAST_ENTRY_${groupId}` (สำหรับ Group Chat) ก่อน หากไม่เจอจึง fallback ไปค้นหา `LAST_ENTRY_${userId}` (สำหรับ Direct Chat)
- **การล้างข้อมูล**: เมื่อยกเลิกสำเร็จ ให้ทำการล้างคีย์ (`deleteProperty`) ทั้งสองคีย์พร้อมกันเพื่อป้องกันการกดลบซ้ำ

### 4. 🐛 เพิ่ม Debug Logs สำหรับการติดตาม (Tracing)
- เพิ่ม `console.log` แสดง Key ที่กำลังค้นหา และผลลัพธ์ว่าพบ Cache หรือไม่ ลงใน GAS Execution Log เพื่อการตรวจสอบย้อนหลัง

---

*สร้างโดย AI Assistant - สรุปการปิดงาน Checkpoint*
