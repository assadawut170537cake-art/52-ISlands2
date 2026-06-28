const fs = require('fs');
const path = require('path');

// หน้าที่: สร้างหรือเพิ่มข้อมูลลงไฟล์ ready_for_review.md โดยบันทึกเวลาและรายชื่อไฟล์ที่แก้ไข เพื่อให้ Roo Code เข้ามาตรวจสอบ
// พารามิเตอร์อินพุท: modifiedFiles (อาร์เรย์ของชื่อไฟล์ที่ต้องการให้ตรวจสอบ)
// ประเภทอ็อบเจกต์: Array<string>
function generateReviewFile(modifiedFiles) {
    try {
        // ตรวจสอบว่ามีการส่งชื่อไฟล์เข้ามาหรือไม่
        if (!modifiedFiles || modifiedFiles.length === 0) {
            console.log("ไม่มีรายชื่อไฟล์สำหรับตรวจสอบ");
            return;
        }

        const reviewFilePath = path.join(__dirname, 'ready_for_review.md');
        const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        
        // สร้างโครงสร้างข้อความที่จะนำไปต่อท้ายไฟล์
        let contentToAppend = `\n## รอบการตรวจสอบ: ${timestamp}\n`;

        // วนลูปเพื่อสร้างรายการ Checkbox สำหรับแต่ละไฟล์
        for (let i = 0; i < modifiedFiles.length; i++) {
            const currentFile = modifiedFiles[i];
            
            // ระบบป้องกัน: ห้ามนำไฟล์ ready_for_review.md เข้าสู่คิวตรวจสอบ
            if (currentFile.includes('ready_for_review.md')) {
                continue;
            }
            
            contentToAppend += `- [ ] ${currentFile}\n`;
        }

        // เขียนข้อมูลต่อท้ายไฟล์ (Append) หากไม่มีไฟล์ระบบจะสร้างใหม่ให้อัตโนมัติ
        fs.appendFileSync(reviewFilePath, contentToAppend, 'utf8');
        console.log("อัปเดตไฟล์ ready_for_review.md สำเร็จ");

    } catch (error) {
        // จัดการข้อผิดพลาดที่อาจเกิดขึ้น เช่น ปัญหาเรื่องสิทธิ์การเข้าถึงไฟล์ (Permission)
        console.error("เกิดข้อผิดพลาดในการจัดการไฟล์ ready_for_review.md: ", error.message);
    }
}

// ตัวเชื่อมต่อกับ Terminal (รับอาร์กิวเมนต์จาก Command Line)
// เมื่อระบบรันคำสั่ง ระบบจะตัด 2 ตำแหน่งแรกทิ้ง (node และชื่อไฟล์สคริปต์) เพื่อเอาเฉพาะชื่อไฟล์เป้าหมาย
const args = process.argv.slice(2);
if (args.length > 0) {
    generateReviewFile(args);
}
