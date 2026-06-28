---
name: code-ok
description: >-
  วิเคราะห์และปรับปรุงโค้ดอย่างปลอดภัยโดยไม่ลบฟังก์ชันเดิม ทำการจัดการ Checkpoint
  (Git Tag) สูงสุด 5 เวอร์ชัน ลบเวอร์ชันที่เก่าที่สุด พร้อม Commit, Push และ Deploy
  ขึ้น GAS อัตโนมัติ โดยอิงจาก Deployment ID เดิมเสมอเพื่อให้ลิงก์ Web App
  ไม่มีการเปลี่ยนแปลง
---

# โค้ดโอเคร (code-ok)

## Overview
Skill นี้ใช้สำหรับปรับแต่งโค้ด (Refactoring / Optimization) และจัดการเรื่องการอัปโหลดโค้ด (Deployment) ให้เป็นระบบอัตโนมัติรวดเดียวจบ ป้องกันข้อผิดพลาดของลิงก์ที่เปลี่ยนไปเวลาที่ Deploy ใหม่ และเก็บประวัติการปรับแต่ง (Checkpoint) ไว้อย่างเป็นระเบียบ

## Dependencies
- เครื่องมือ: `git`, `clasp`, `powershell`/`bash`

## Workflow

### 1. วิเคราะห์และแก้ไขโค้ด (Code Optimization)
- เอเจนต์จะต้องสแกนโค้ดและแก้ไขจุดบกพร่องตามที่ผู้ใช้ร้องขอ หรือค้นหาคอขวด (Bottlenecks)
- **กฎเหล็ก (CRITICAL):** ห้ามทำการลบฟังก์ชันที่มีอยู่เดิมโดยเด็ดขาด อนุญาตให้เพียง **แก้ไขหรือปรับปรุง (Refactor)** การทำงานภายในฟังก์ชันให้ดีขึ้นและเสถียรขึ้นเท่านั้น

### 2. สร้างจุดเช็คพอยต์ด้วย Git Tag (Checkpoint Management)
- รันคำสั่งตรวจสอบ Tag ปัจจุบัน (`git tag -l "checkpoint-*"`)
- หากจำนวนเช็คพอยต์ (Tag ที่ชื่อขึ้นต้นด้วย `checkpoint-`) ถึง 5 เวอร์ชันแล้ว ให้หาเวอร์ชันที่เก่าที่สุดและทำการลบออก:
  - `git tag -d <oldest-tag>`
  - `git push --delete origin <oldest-tag>`
- สร้าง Tag เช็คพอยต์ใหม่ที่เป็นลำดับถัดไป เช่น `checkpoint-6`
  - `git tag -a <new-tag> -m "Auto-checkpoint by code-ok"`

### 3. พุชโค้ด (Git Commit & Clasp Push)
- รัน `git add .`
- รัน `git commit -m "chore: code optimized by code-ok skill"`
- รัน `git push origin master` (หรือชื่อ branch ปัจจุบัน) และ `git push --tags`
- รัน `clasp push -f` เพื่อดันโค้ดขึ้นเซิร์ฟเวอร์

### 4. Deploy ด้วยลิงก์เดิมเสมอ (Safe Deployment)
- รันคำสั่ง `clasp deployments` เพื่อดูรายการ Deployment ของโปรเจกต์
- ค้นหา **Deployment ID** ของ `web app` ปัจจุบัน (ไอดีที่ถูกระบุอยู่ท้ายสุดหรือมี @version ต่อท้าย)
- **ห้าม**สร้าง Deployment ใหม่โดยไม่ระบุ ID 
- รันคำสั่ง `clasp deploy -i <DEPLOYMENT_ID> -d "Auto-deploy via code-ok"`
- ยืนยันผลลัพธ์ว่า Deployment ID ยังคงเดิมและอัปเดตเรียบร้อยแล้ว

## Common Mistakes
- **ลืมระบุ -i ใน clasp deploy:** จะทำให้ได้ Deployment ID ใหม่ (ลิงก์ใหม่) ทันที ซึ่งผิดกฎอย่างร้ายแรง
- **ลบฟังก์ชันทิ้ง:** การไปลบฟังก์ชันที่คิดว่าไม่ได้ใช้ อาจกระทบระบบอื่นที่พึ่งพามันอยู่
- **ไม่ได้ลบ Tag เก่าทั้งฝั่ง Local และ Remote:** หากลบแค่ในเครื่องแต่ไม่ลบใน GitHub จำนวน Tag บนเซิร์ฟเวอร์จะเกิน 5 ตัว
