const https = require('https');

// URL Web App ของ GAS ที่นำมาทดสอบ
const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzIwUH-pQlUYVjr4CBjbsMOavUwFsAQTqxTCGIqi2nL-gZDeuyqpwIz-Ffj_eGaeSiPdw/exec";
const USER_ID = "U19fc3f88a0ae90bfb047e362b60e2493"; // Admin Line ID

// ฟังก์ชันจำลองการส่งข้อมูลแบบเดียวกับที่ LINE ส่งมา
function testWebhook(messageText) {
    console.log(`\n======================================================`);
    console.log(`[TEST] กำลังจำลองส่งข้อความ: "${messageText}"`);
    console.log(`======================================================`);

    const payload = JSON.stringify({
        "destination": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "events": [
            {
                "replyToken": "dummy_test_token_" + Date.now(),
                "type": "message",
                "mode": "active",
                "timestamp": Date.now(),
                "source": {
                    "type": "user",
                    "userId": USER_ID
                },
                "message": {
                    "id": "12345678901234",
                    "type": "text",
                    "text": messageText
                }
            }
        ]
    });

    const urlObj = new URL(WEBHOOK_URL);

    const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const req = https.request(options, (res) => {
        let responseData = '';

        // ถ้ามีการ redirect (302) Google Script มักจะทำแบบนี้สำหรับ WebApp
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            console.log(`[INFO] Redirecting to ${res.headers.location}`);
            const redirectUrl = new URL(res.headers.location);
            const redirectOptions = {
                hostname: redirectUrl.hostname,
                path: redirectUrl.pathname + redirectUrl.search,
                method: 'GET' // redirects in GAS are GET
            };
            
            const redirectReq = https.request(redirectOptions, (redirectRes) => {
                let redirData = '';
                redirectRes.on('data', chunk => redirData += chunk);
                redirectRes.on('end', () => {
                    console.log(`[RESULT HTTP ${redirectRes.statusCode}] ${redirData}`);
                });
            });
            redirectReq.end();
            return;
        }

        res.on('data', (chunk) => {
            responseData += chunk;
        });

        res.on('end', () => {
            console.log(`[RESULT HTTP ${res.statusCode}] ${responseData}`);
        });
    });

    req.on('error', (e) => {
        console.error(`[ERROR] ${e.message}`);
    });

    req.write(payload);
    req.end();
}

// 1. จำลองการพิมพ์ข้อความทั่วไป
testWebhook("สวัสดีจารวิส เช็คระบบหน่อย");

// 2. ถ้ามีคำสั่งอื่นเพิ่มเติม สามารถเปิดคอมเมนต์ด้านล่างได้
// setTimeout(() => testWebhook("ลงเวลาเข้างาน วันนี้"), 5000);
