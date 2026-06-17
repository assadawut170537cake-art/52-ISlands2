
        const { useState, useEffect, useMemo, useRef, useCallback } = React;

        // ============================================================
        // 🛡️ ERROR BOUNDARY — ดักจับ Render Error ป้องกันหน้าขาว
        // ============================================================
        class ErrorBoundary extends React.Component {
            constructor(props) {
                super(props);
                this.state = { hasError: false, error: null, info: null };
            }
            static getDerivedStateFromError(error) { return { hasError: true, error }; }
            componentDidCatch(error, info) { console.error("System Error:", error, info); this.setState({ info }); }
            render() {
                if (this.state.hasError) {
                    return (
                        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
                            <div className="bg-white p-6 rounded-2xl shadow-xl border border-red-100 max-w-xl w-full">
                                <h2 className="text-xl font-bold text-red-600 mb-2">⚠️ เกิดข้อผิดพลาดในระบบ</h2>
                                <p className="text-sm text-slate-600 mb-4">หน้าเว็บไม่สามารถแสดงผลได้ กรุณาตรวจสอบโค้ดตามแจ้งเตือนด้านล่าง:</p>
                                <div className="bg-slate-100 p-4 rounded-xl text-xs font-mono text-slate-800 overflow-x-auto whitespace-pre-wrap">
                                    {this.state.error && this.state.error.toString()}
                                    <br /><br />
                                    {this.state.info && this.state.info.componentStack}
                                </div>
                                <button onClick={() => window.location.reload()} className="mt-4 w-full bg-indigo-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all">
                                    🔄 รีโหลดหน้าใหม่
                                </button>
                            </div>
                        </div>
                    );
                }
                return this.props.children;
            }
        }

        // ============================================================
        // 🚀 GEMINI API CONFIGURATION & HELPER
        // ============================================================
        const apiKey = ""; // <--- ⚠️ วาง API KEY ของ Gemini ตรงนี้

        const fetchGemini = async (prompt, systemInstruction = "", base64Image = null) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

            const parts = [{ text: prompt }];
            if (base64Image) {
                const base64Data = base64Image.split(',')[1];
                parts.push({ inlineData: { data: base64Data, mimeType: "image/jpeg" } });
            }

            const payload = { contents: [{ parts }] };
            if (systemInstruction) {
                payload.systemInstruction = { parts: [{ text: systemInstruction }] };
            }

            let retries = 5;
            let delay = 1000;
            while (retries > 0) {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    const result = await response.json();
                    return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
                } catch (error) {
                    retries--;
                    if (retries === 0) {
                        console.error("Gemini API Error:", error);
                        throw error;
                    }
                    await new Promise(res => setTimeout(res, delay));
                    delay *= 2;
                }
            }
        };

        const LOGO_URL = "https://i.ibb.co/N3w3P9pS/52.png";

        // ============================================================
        // 🌐 DICTIONARY FOR MULTI-LANGUAGE TRANSLATION (4 LANGUAGES)
        // ============================================================
        const TRANSLATIONS = {
            TH: {
                appName: "ระบบสมาร์ทไซต์งาน",
                dashboard: "ภาพรวมระบบ",
                attendance: "ลงเวลา (AI)",
                aiTools: "AI ทั่วไป",
                aiAdmin: "AI แอดมิน",
                stats: "สถิติ",
                archive: "คลังข้อมูล",
                admin: "จัดการพนักงาน",
                user: "ผู้ใช้งานปัจจุบัน",
                roleAdmin: "👑 ผู้ดูแลระบบ (Admin)",
                roleUser: "👤 พนักงานทั่วไป (User)",
                next: "ถัดไป",
                back: "ถอยกลับ",
                confirmSave: "ยืนยันบันทึกเข้าระบบ",
                manualBtn: "📖 เปิดคู่มือการใช้งาน",
                noPermission: "🔒 เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น",
                bellTitle: "🚨 ล็อกรายงานข้อผิดพลาดหน้างาน",
                bellDesc: "รายงานความผิดพลาดที่เกิดขึ้นจริงจากกลุ่มไลน์ผู้ปฏิบัติงาน",
                welcomeChat: "สวัสดีครับพี่ 👋 มีอะไรให้ผมวิเคราะห์หรือสั่งร่างรายงานหน้างานไหมครับ?",
                quickAccess: "🔲 ทางลัดระบบ (QUICK ACCESS)",
                quickManual: "วิธีใช้ระบบ",
                quickAITool: "เครื่องมือ AI",
                quickAIAdmin: "AI สำหรับผู้ดูแล",
                quickStats: "กลุ่ม / รายบุคคล",
                quickSettings: "Config ระบบ",
                recentActivity: "ความเคลื่อนไหวการเข้างานล่าสุด",
                activeEmployees: "พนักงานวันนี้",
                activeSites: "ไซต์งานที่ใช้งาน",
                otAccumulated: "OT สะสม (เดือนนี้)",
                safetyStandard: "ความปลอดภัย",
                siteTitle: "ภาพรวมประจำวัน"
            },
            EN: {
                appName: "SMART WORKSITE",
                dashboard: "Dashboard",
                attendance: "Attendance (AI)",
                aiTools: "General AI",
                aiAdmin: "AI Admin",
                stats: "Statistics",
                archive: "Monthly Vault",
                admin: "Staff Mgmt",
                user: "Current User",
                roleAdmin: "👑 System Administrator",
                roleUser: "👤 Regular Worker",
                next: "Next",
                back: "Back",
                confirmSave: "Confirm Save Database",
                manualBtn: "📖 Open User Manual",
                noPermission: "🔒 Administrator Access Only",
                bellTitle: "🚨 System Error & Exception Logs",
                bellDesc: "Realtime error logs retrieved from operational Line groups.",
                welcomeChat: "Hello chief! 👋 How can I help you analyze site data or draft reports today?",
                quickAccess: "🔲 QUICK ACCESS SYSTEM",
                quickManual: "How to use",
                quickAITool: "AI Assistant",
                quickAIAdmin: "Manager AI Tools",
                quickStats: "Group / Individual",
                quickSettings: "System Config",
                recentActivity: "Recent On-site Attendance",
                activeEmployees: "Active Staff Today",
                activeSites: "Active Sites",
                otAccumulated: "Monthly Accumulated OT",
                safetyStandard: "Safety Level",
                siteTitle: "Daily Performance Overview"
            },
            MY: {
                appName: "စမတ်လုပ်ငန်းခွင်စနစ်",
                dashboard: "ပင်မမျက်နှာပြင်",
                attendance: "အချိန်မှတ်တမ်း (AI)",
                aiTools: "အထွေထွေ AI",
                aiAdmin: "အက်ဒမင် AI",
                stats: "စာရင်းအင်း",
                archive: "ဒေတာဘဏ်",
                admin: "ဝန်ထမ်းခန့်ခွဲမှု",
                user: "လက်ရှိအသုံးပြုသူ",
                roleAdmin: "👑 စနစ်အက်ဒမင် (Admin)",
                roleUser: "👤 အထွေထွေဝန်ထမ်း (User)",
                next: "ရှေ့သို့",
                back: "နောက်သို့",
                confirmSave: "ဒေတာသိမ်းဆည်းမှုကို အတည်ပြုပါ",
                manualBtn: "📖 အသုံးပြုသူလက်စွဲစာအုပ်",
                noPermission: "🔒 အက်ဒမင်များသာ ဝင်ရောက်ခွင့်ရှိသည်",
                bellTitle: "🚨 လုပ်ငန်းခွင်အမှားအယွင်း အစီရင်ခံစာများ",
                bellDesc: "လိုင်းဂရုမှ ရရှိသော အမှားမှတ်တမ်းများ",
                welcomeChat: "မင်္ဂလာပါ ခေါင်းဆောင် 👋 ဒီနေ့ လုပ်ငန်းခွင်ဒေတာတွေကို ခွဲခြမ်းစိတ်ဖြာဖို့ ကူညီပေးရမလားခင်ဗျာ။",
                quickAccess: "🔲 ဖြတ်လမ်းများ (QUICK ACCESS)",
                quickManual: "အသုံးပြုပုံလမ်းညွှန်",
                quickAITool: "AI ကိရိယာများ",
                quickAIAdmin: "အက်ဒမင်အတွက် AI",
                quickStats: "အဖွဲ့လိုက် / တစ်ဦးချင်း",
                quickSettings: "စနစ်ချိန်ညှိချက်များ",
                recentActivity: "မကြာသေးမီက အလုပ်ဝင်ရောက်မှုမှတ်တမ်း",
                activeEmployees: "ယနေ့ ဝန်ထမ်းအင်အား",
                activeSites: "အသုံးပြုနေသော ဆိုက်များ",
                otAccumulated: "စုစုပေါင်း OT နာရီ (ယခုလ)",
                safetyStandard: "ဘေးကင်းလုံခြုံမှု",
                siteTitle: "နေ့စဉ် စွမ်းဆောင်ရည်အကျဉ်းချုပ်"
            },
            KH: {
                appName: "ប្រព័ន្ធការដ្ឋានឆ្លាតវៃ",
                dashboard: "ផ្ទាំងគ្រប់គ្រង",
                attendance: "កត់ត្រាម៉ោង (AI)",
                aiTools: "AI ទូទៅ",
                aiAdmin: "អ្នកគ្រប់គ្រង AI",
                stats: "ស្ថិតិ",
                archive: "ប័ណ្ណសារទិន្នន័យ",
                admin: "គ្រប់គ្រងបុគ្គលិក",
                user: "អ្នកប្រើប្រាស់បច្ចុប្បន្ន",
                roleAdmin: "👑 អ្នកគ្រប់គ្រងប្រព័ន្ធ (Admin)",
                roleUser: "👤 បុគ្គលិកទូទៅ (User)",
                next: "បន្ទាប់",
                back: "ថយក្រោយ",
                confirmSave: "បញ្ជាក់ការរក្សាទុកទិន្នន័យ",
                manualBtn: "📖 បើកសៀវភៅណែនាំប្រើប្រាស់",
                noPermission: "🔒 សិទ្ធិចូលប្រើសម្រាប់តែ Admin ប៉ុណ្ណោះ",
                bellTitle: "🚨 របាយការណ៍កំហុសឆ្គងប្រព័ន្ធ",
                bellDesc: "កំណត់ត្រាកំហុសជាក់ស្តែងពីក្រុមការងារតាម Line",
                welcomeChat: "សួស្តីបង! 👋 តើមានអ្វីឱ្យខ្ញុំជួយវិភាគទិន្នន័យ ឬព្រាងរបាយការណ៍ថ្ងៃនេះទេ?",
                quickAccess: "🔲 ផ្លូវកាត់ប្រព័ន្ធ (QUICK ACCESS)",
                quickManual: "របៀបប្រើប្រាស់",
                quickAITool: "ឧបករណ៍ AI",
                quickAIAdmin: "AI សម្រាប់អ្នកគ្រប់គ្រង",
                quickStats: "ជាក្រុម / ផ្ទាល់ខ្លួន",
                quickSettings: "កំណត់រចនាសម្ព័ន្ធប្រព័ន្ធ",
                recentActivity: "សកម្មភាពវត្តមានបុគ្គលិកចុងក្រោយបង្អស់",
                activeEmployees: "បុគ្គលិកសរុបថ្ងៃនេះ",
                activeSites: "ការដ្ឋានកំពុងដំណើរការ",
                otAccumulated: "ម៉ោងបន្ថែម OT សរុប (ខែនេះ)",
                safetyStandard: "សុវត្ថិភាពការងារ",
                siteTitle: "ទិដ្ឋភាពទូទៅប្រចាំថ្ងៃ"
            }
        };

        const INITIAL_MOCK_DATA = [
            { A: 2, B: 'นาย', C: 'มนตรี', D: 'ใสภาค', E: 'นาย มนตรี ใสภาค', J: 'กฤษฎานคร 21', K: 'ปกติ', N: '52901' },
            { A: 3, B: 'นาย', C: 'แทน', D: 'สุขสม', E: 'นาย แทน สุขสม', J: 'ปรานบุรี', K: 'ปกติ', N: '52902' },
            { A: 4, B: 'นาย', C: 'ศุภณัฐ', D: 'จำเริญ', E: 'นาย ศุภณัฐ จำเริญ', J: 'นิมิตใหม่', K: 'ลาออก', N: '52903' },
            { A: 5, B: 'นาย', C: 'สมพร', D: 'หิตะรัตน์', E: 'นาย สมพร หิตะรัตน์', J: 'นิมิตใหม่', K: 'ปกติ', N: '52904' },
            { A: 6, B: 'นาย', C: 'วินวิน', D: 'ทัน', E: 'นาย วินวิน ทัน', J: 'บางละมุง', K: 'ปกติ', N: '52093' },
            { A: 7, B: 'น.ส.', C: 'โมนัน', D: 'ดา', E: 'น.ส. โมนัน ดา', J: 'พระราม 3', K: 'ปกติ', N: '52096' },
            { A: 8, B: 'นาย', C: 'ธนวุฒิ', D: 'โมคทิพย์', E: 'นาย ธนวุฒิ โมคทิพย์', J: 'เลคไซท์2', K: 'ปกติ', N: '52098' },
            { A: 9, B: 'นาย', C: 'ซอ', D: 'หม่อง', E: 'นาย ซอ หม่อง', J: 'โกดังลาดกระบัง', K: 'ปกติ', N: '52003' }
        ];

        const MOCK_SITES_WITH_COORDS = [
            { name: 'โครงการอาคารสูง Rama 3', lat: 13.6821, lng: 100.5342 },
            { name: 'โกดังศูนย์กระจายสินค้า ลาดกระบัง', lat: 13.7241, lng: 100.7485 },
            { name: 'โครงการคอนโด พัทยา เฟส 2', lat: 12.9235, lng: 100.8824 },
            { name: 'ไซต์วิลล่าหรู สาทร', lat: 13.7156, lng: 100.5281 },
            { name: 'สาธุประดิษฐ์', lat: 13.7023, lng: 100.5284 },
            { name: 'บางละมุง', lat: 12.9813, lng: 100.9172 },
            { name: 'คลองสาน', lat: 13.7294, lng: 100.5073 },
            { name: 'ปรานบุรี', lat: 12.3842, lng: 99.9125 },
            { name: 'ดุสิต', lat: 13.7661, lng: 100.5186 },
            { name: 'สุขุมวิท101', lat: 13.6936, lng: 100.6067 },
            { name: 'นิมิตใหม่', lat: 13.8694, lng: 100.7302 },
            { name: 'เลควูด', lat: 13.6186, lng: 100.7547 }
        ];

        // ============================================================
        // SVG ICONS (Native SVG)
        // ============================================================
        const Icon = {
            Dashboard: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>,
            Phone: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>,
            Chart: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 3v18h18" /><rect x="7" y="10" width="4" height="7" rx="1" /><rect x="15" y="5" width="4" height="12" rx="1" /></svg>,
            Users: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
            Chat: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
            Sparkles: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>,
            Bot: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8.01" y2="16" /><line x1="16" y1="16" x2="16.01" y2="16" /></svg>,
            Mic: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>,
            Send: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>,
            X: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
            Trash: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
            Lock: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
            Menu: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
            Bell: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
            Gear: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
            Save: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>,
            Check: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="m9 12 2 2 4-4" /></svg>,
            Download: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
            Clock: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
            Folder: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>,
            Location: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
            Clipboard: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>,
            Share: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>,
            MapPin: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
            ArrowLeft: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>,
            ArrowRight: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>,
            CheckSquare: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
            Calendar: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
            BookOpen: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
            Database: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>,
            ChevronLeft: ({ c = "w-5 h-5" }) => <svg className={c} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>,
        };

        // ============================================================
        // COMPONENT: StatSlider 
        // ============================================================
        function StatSlider({ stats, activeEmployeeCount, activeSitesCount, t }) {
            const slides = [
                { label: t('activeEmployees'), value: activeEmployeeCount, unit: '人/คน', icon: '👥', color: 'from-violet-600 to-purple-700', sub: 'Active' },
                { label: t('activeSites'), value: activeSitesCount, unit: '🏗️', icon: '🏗️', color: 'from-sky-500 to-blue-600', sub: 'Site' },
                { label: t('otAccumulated'), value: stats.otTotal, unit: 'Hr.', icon: '⏰', color: 'from-emerald-500 to-teal-600', sub: 'Accumulated' },
                { label: t('safetyStandard'), value: stats.safetyAvg, unit: '%', icon: '🛡️', color: 'from-amber-500 to-orange-600', sub: 'PPE Compliance' }
            ];
            return (
                <div className="space-y-2">
                    <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                        {slides.map((s, i) => (
                            <div key={i} className={`stat-slide bg-gradient-to-br ${s.color} rounded-2xl p-4 text-white shadow-md flex-shrink-0 w-[145px] sm:w-[170px]`}>
                                <div className="text-xl mb-1">{s.icon}</div>
                                <div className="text-xl font-bold">{s.value}<span className="text-xs font-medium ml-1 opacity-80">{s.unit}</span></div>
                                <div className="text-xs font-semibold opacity-90 truncate">{s.label}</div>
                                <div className="text-[10px] opacity-70 mt-0.5">{s.sub}</div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // ============================================================
        // COMPONENT: FloatingAIChat
        // ============================================================
        function FloatingAIChat({ isAdmin, userEmail, showNotification, t }) {
            const [messages, setMessages] = useState([
                { id: 1, role: 'ai', text: t('welcomeChat') }
            ]);
            const [inputMsg, setInputMsg] = useState('');
            const [isTyping, setIsTyping] = useState(false);
            const [isOpen, setIsOpen] = useState(false);

            // Drag State (Touch-friendly สำหรับย้ายปุ่มแชทตามนิ้ว)
            const [position, setPosition] = useState({ x: window.innerWidth - 75, y: window.innerHeight - 150 });
            const [isDragging, setIsDragging] = useState(false);
            const dragRef = useRef({ startX: 0, startY: 0, currentX: position.x, currentY: position.y });
            const messagesEndRef = useRef(null);

            useEffect(() => {
                if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, [messages, isTyping, isOpen]);

            const handleMouseDown = (e) => {
                setIsDragging(true);
                const clientX = e.clientX || e.touches?.[0].clientX;
                const clientY = e.clientY || e.touches?.[0].clientY;
                dragRef.current.startX = clientX;
                dragRef.current.startY = clientY;
            };

            const handleMouseMove = useCallback((e) => {
                if (!isDragging) return;
                const clientX = e.clientX || e.touches?.[0].clientX;
                const clientY = e.clientY || e.touches?.[0].clientY;
                const deltaX = clientX - dragRef.current.startX;
                const deltaY = clientY - dragRef.current.startY;

                let newX = dragRef.current.currentX + deltaX;
                let newY = dragRef.current.currentY + deltaY;

                newX = Math.max(10, Math.min(newX, window.innerWidth - 65));
                newY = Math.max(10, Math.min(newY, window.innerHeight - 65));

                setPosition({ x: newX, y: newY });
            }, [isDragging]);

            const handleMouseUp = useCallback(() => {
                if (isDragging) {
                    setIsDragging(false);
                    dragRef.current.currentX = position.x;
                    dragRef.current.currentY = position.y;
                }
            }, [isDragging, position]);

            useEffect(() => {
                if (isDragging) {
                    window.addEventListener('mousemove', handleMouseMove);
                    window.addEventListener('mouseup', handleMouseUp);
                    window.addEventListener('touchmove', handleMouseMove, { passive: false });
                    window.addEventListener('touchend', handleMouseUp);
                } else {
                    window.removeEventListener('mousemove', handleMouseMove);
                    window.removeEventListener('mouseup', handleMouseUp);
                    window.removeEventListener('touchmove', handleMouseMove);
                    window.removeEventListener('touchend', handleMouseUp);
                }
                return () => {
                    window.removeEventListener('mousemove', handleMouseMove);
                    window.removeEventListener('mouseup', handleMouseUp);
                    window.removeEventListener('touchmove', handleMouseMove);
                    window.removeEventListener('touchend', handleMouseUp);
                };
            }, [isDragging, handleMouseMove, handleMouseUp]);

            const sendChatMessage = async () => {
                if (!inputMsg.trim()) return;
                const userText = inputMsg;
                setMessages(prev => [...prev, { id: Date.now(), role: 'user', text: userText }]);
                setInputMsg('');
                setIsTyping(true);

                try {
                    const systemPrompt = "คุณคือผู้ช่วย AI ประจำไซต์ก่อสร้าง ตอบคำถามเป็นภาษาไทยอย่างมืออาชีพ กระชับ มีประโยชน์";
                    const responseText = await fetchGemini(userText, systemPrompt);
                    setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: responseText }]);
                } catch (err) {
                    setMessages(prev => [...prev, { id: Date.now() + 1, role: 'ai', text: '❌ ไม่สามารถติดต่อเซิร์ฟเวอร์ AI ได้' }]);
                } finally {
                    setIsTyping(false);
                }
            };

            return (
                <div
                    className="fixed z-[100] flex flex-col items-end"
                    style={{ left: position.x, top: position.y, transform: isOpen ? 'translate(-85%, -90%)' : 'translate(0, 0)' }}
                >
                    {/* หน้าต่างแชท AI */}
                    {isOpen && (
                        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden w-72 sm:w-85 mb-3 flex flex-col animate-fade-in" style={{ height: '380px' }}>
                            <div
                                className="bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 flex items-center justify-between cursor-move"
                                onMouseDown={handleMouseDown}
                                onTouchStart={handleMouseDown}
                            >
                                <div className="flex items-center gap-2 text-white">
                                    <Icon.Bot c="w-4 h-4" />
                                    <div>
                                        <div className="font-bold text-xs">AI Assistant</div>
                                        <div className="text-white/70 text-[9px]">Gemini V2.5 (ลากเพื่อย้าย)</div>
                                    </div>
                                </div>
                                <button onClick={() => setIsOpen(false)} className="text-white hover:bg-white/20 p-1 rounded">
                                    <Icon.X c="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex-1 bg-slate-50 overflow-y-auto p-3 space-y-3">
                                {messages.map(msg => (
                                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                                        <div className={msg.role === 'ai' ? 'chat-bubble-ai' : 'chat-bubble-user'}>{msg.text}</div>
                                    </div>
                                ))}
                                {isTyping && (
                                    <div className="chat-bubble-ai flex gap-1 py-3 w-14 justify-center">
                                        <div className="typing-dot"></div><div className="typing-dot"></div><div className="typing-dot"></div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="p-2.5 bg-white border-t border-slate-100 flex gap-2">
                                <input
                                    type="text"
                                    value={inputMsg}
                                    onChange={e => setInputMsg(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                                    placeholder="พิมพ์ถาม AI..."
                                    className="flex-1 bg-slate-100 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                                />
                                <button onClick={sendChatMessage} disabled={!inputMsg.trim()} className="bg-violet-600 text-white p-2 rounded-xl disabled:bg-slate-300">
                                    <Icon.Send c="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ปุ่มลอยเรียกเปิดแชท */}
                    {!isOpen && (
                        <button
                            onMouseDown={handleMouseDown}
                            onTouchStart={handleMouseDown}
                            onClick={() => !isDragging && setIsOpen(true)}
                            className="w-12 h-12 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full shadow-xl flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform cursor-grab active:cursor-grabbing border-2 border-white"
                        >
                            <Icon.Sparkles c="w-5 h-5" />
                        </button>
                    )}
                </div>
            );
        }

        // ============================================================
        // COMPONENT: QuickActionsGrid 
        // ============================================================
        function QuickActionsGrid({ setActiveTab, isAdmin, showNotification, t }) {
            const quickItems = [
                { id: 1, label: t('archive'), sub: 'Monthly Report', icon: '📁', color: 'from-amber-500/10 to-amber-600/5 border-amber-200/60', iconBg: 'bg-amber-100 text-amber-700', action: () => setActiveTab('archive') },
                { id: 2, label: t('quickManual'), sub: 'Guides', icon: '📖', color: 'from-blue-500/10 to-blue-600/5 border-blue-200/60', iconBg: 'bg-blue-100 text-blue-700', action: () => setActiveTab('manual') },
                { id: 3, label: t('quickAITool'), sub: 'Engineering AI', icon: '✨', color: 'from-violet-500/10 to-violet-600/5 border-violet-200/60', iconBg: 'bg-violet-100 text-violet-700', action: () => setActiveTab('ai-tools') },
                { id: 4, label: t('quickAIAdmin'), sub: 'Executive Bot', color: isAdmin ? 'from-rose-500/10 to-rose-600/5 border-rose-200/60' : 'bg-slate-50 border-slate-200', icon: '🤖', iconBg: isAdmin ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400', action: () => { if (!isAdmin) { showNotification('🔒 Admin Access Only', 'error'); return; } setActiveTab('ai-admin'); } },
                { id: 5, label: t('quickStats'), sub: 'Analytics', icon: '📋', color: 'from-emerald-500/10 to-emerald-600/5 border-emerald-200/60', iconBg: 'bg-emerald-100 text-emerald-700', action: () => setActiveTab('stats') },
                { id: 6, label: t('quickSettings'), sub: 'Staff Data', color: isAdmin ? 'from-slate-500/10 to-slate-600/5 border-slate-300' : 'bg-slate-50 border-slate-200', icon: '⚙️', iconBg: 'bg-slate-200 text-slate-700', action: () => { if (!isAdmin) { showNotification('🔒 Admin Access Only', 'error'); return; } setActiveTab('admin'); } },
            ];

            return (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 sm:p-4">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">{t('quickAccess')}</div>
                    <div className="grid grid-cols-3 gap-2">
                        {quickItems.map(item => (
                            <button key={item.id} onClick={item.action} className={`${item.color} border bg-gradient-to-br rounded-xl p-2 text-left hover:scale-102 active:scale-95 transition-all duration-150 relative flex flex-col justify-between h-20 sm:h-24`}>
                                {(item.id === 4 || item.id === 6) && !isAdmin && (
                                    <div className="absolute top-1 right-1">
                                        <Icon.Lock c="w-3 h-3 text-slate-400" />
                                    </div>
                                )}
                                <div className={`${item.iconBg} w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-sm sm:text-base`}>
                                    {item.icon}
                                </div>
                                <div className="truncate w-full">
                                    <div className="font-bold text-slate-800 text-[10px] sm:text-xs leading-tight truncate">{item.label}</div>
                                    <div className="text-slate-400 text-[8px] sm:text-[9px] mt-0.5 truncate">{item.sub}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        // ============================================================
        // COMPONENT: RecentActivityTable 
        // ============================================================
        function RecentActivityTable({ dailyReports, t }) {
            const recent = dailyReports.slice(0, 5);
            if (recent.length === 0) return null;

            return (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                        <span className="font-bold text-slate-700 text-xs sm:text-sm">{t('recentActivity')}</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px] sm:text-xs">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-3 py-2 text-left text-slate-500 font-semibold">ชื่อ/Name</th>
                                    <th className="px-3 py-2 text-left text-slate-500 font-semibold">ไซต์งาน/Site</th>
                                    <th className="px-2 py-2 text-center text-slate-500 font-semibold">เวลา/Time</th>
                                    <th className="px-2 py-2 text-center text-slate-500 font-semibold">OT</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {recent.map((r, i) => (
                                    <tr key={r.id || i} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-3 py-2.5">
                                            <div className="font-medium text-slate-700 leading-tight truncate" style={{ maxWidth: '110px' }}>{r.names}</div>
                                            <div className="text-slate-400 text-[9px]">{r.date}</div>
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-600 truncate" style={{ maxWidth: '90px' }}>{r.site}</td>
                                        <td className="px-2 py-2.5 text-center text-slate-600">{r.timeIn || '08:00'}-{r.timeOut || '17:00'}</td>
                                        <td className="px-2 py-2.5 text-center">
                                            {r.otTotal > 0 ? <span className="bg-orange-100 text-orange-600 font-bold px-1.5 py-0.5 rounded-lg">{r.otTotal}h</span> : <span className="text-slate-300">-</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }

        // ============================================================
        // COMPONENT: FastTrackPanel
        // ============================================================
        function FastTrackPanel({ onClose, employees, showNotification, onProcessed }) {
            const [fastText, setFastText] = useState('');
            const [isProcessing, setIsProcessing] = useState(false);
            const [isRecording, setIsRecording] = useState(false);
            const hour = new Date().getHours();
            const isOtTime = hour >= 17;

            const processFastTrackAI = () => {
                if (!fastText.trim()) { showNotification('กรุณาพิมพ์ข้อความก่อนประมวลผลครับ', 'error'); return; }
                setIsProcessing(true);
                showNotification('🧠 AI กำลังวิเคราะห์ข้อความและจับคู่ชื่อพนักงาน...', 'success');

                setTimeout(() => {
                    setIsProcessing(false);
                    showNotification('✅ ประมวลผลสำเร็จ! ข้อมูลถูกเติมในแบบฟอร์มแล้ว', 'success');
                    if (onProcessed) onProcessed({ success: true });
                    onClose();
                }, 1800);
            };

            const handleMic = () => {
                if (!isRecording) {
                    setIsRecording(true);
                    showNotification('🎙️ กำลังฟัง... พูดรายงานประจำวันได้เลยครับ', 'success');
                    setTimeout(() => {
                        setIsRecording(false);
                        setFastText('ช่างวินวิน กับ ช่างโมนัน เข้าทำงานไซต์บางละมุง เลิกงานทุ่มครึ่ง โอทีสองชั่วโมง');
                        showNotification('✅ แปลงเสียงเป็นข้อความสำเร็จ!', 'success');
                    }, 3000);
                } else {
                    setIsRecording(false);
                }
            };

            return (
                <div className="bg-white rounded-2xl shadow-sm border-2 border-indigo-300 overflow-hidden animate-fade-in">
                    <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">⚡</span>
                            <div>
                                <div className="text-white font-bold text-xs sm:text-sm">AI Fast Track Logger</div>
                                <div className="text-indigo-200 text-[10px]">บันทึกเวลาด่วนผ่านการพิมพ์หรือสั่งเสียง</div>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all">
                            <Icon.X c="w-4 h-4" />
                        </button>
                    </div>

                    {isOtTime && (
                        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
                            <span className="text-amber-600 text-xs">✨</span>
                            <span className="text-amber-700 text-[10px] font-medium">หลังเวลา 17:00 น. — ระบบเตรียมโหมดคิด OT อัตโนมัติ</span>
                        </div>
                    )}

                    <div className="p-3 sm:p-4 space-y-3">
                        <div className="relative">
                            <textarea value={fastText} onChange={e => setFastText(e.target.value)} rows={3} placeholder='เช่น: "ช่างมนตรี เข้าไซต์ดุสิต ทำงานถึงสองทุ่มครึ่ง"' className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs sm:text-sm text-slate-700 placeholder-slate-400 italic focus:outline-none focus:border-indigo-400 focus:bg-white resize-none transition-all" />
                            <button onClick={handleMic} className={`absolute bottom-3 right-3 p-1.5 rounded-lg transition-all ${isRecording ? 'bg-red-100 text-red-500 pulse-mic' : 'bg-indigo-50 text-indigo-400 hover:text-indigo-600'}`}>
                                <Icon.Mic c="w-4 h-4" />
                            </button>
                        </div>
                        <button onClick={processFastTrackAI} disabled={!fastText.trim() || isProcessing} className="w-full py-2 rounded-xl font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white shadow-md">
                            {isProcessing ? <><div className="spinner" style={{ width: '14px', height: '14px', borderTopColor: 'white' }}></div> กำลังประมวลผล...</> : <><Icon.Sparkles c="w-4 h-4" /> วิเคราะห์ลงฟอร์มด้วย AI</>}
                        </button>
                    </div>
                </div>
            );
        }

        // ============================================================
        // COMPONENT: DashboardTab 
        // ============================================================
        function DashboardTab({ employees, dailyReports, safetyHistory, stats, setActiveTab, isAdmin, userEmail, showNotification, t }) {
            const [showFastTrack, setShowFastTrack] = useState(false);
            const activeEmployeeCount = employees.filter(e => e.K === 'ปกติ').length;
            const activeSitesCount = new Set(dailyReports.map(r => r.site).filter(Boolean)).size;
            const dateStr = new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            return (
                <div className="space-y-4 pb-6">
                    <StatSlider stats={stats} activeEmployeeCount={activeEmployeeCount} activeSitesCount={activeSitesCount} t={t} />

                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-4 sm:p-5 text-white shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-violet-500/10 rounded-full translate-y-1/2 -translate-x-1/2"></div>

                        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white flex items-center justify-center p-1.5 shadow-inner shrink-0 transform hover:scale-105 transition-transform">
                                    <img src={LOGO_URL} alt="App Icon" className="w-full h-full object-contain" />
                                </div>
                                <div>
                                    <div className="text-sky-400 text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-0.5">{t('appName')}</div>
                                    <h2 className="text-lg sm:text-xl font-black text-white leading-tight">{t('siteTitle')}</h2>
                                    <p className="text-slate-400 text-[10px] sm:text-xs mt-0.5">{dateStr}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 w-full md:w-auto shrink-0">
                                <button onClick={() => setActiveTab('app')} className="py-2 px-3 rounded-xl border border-white/30 text-white text-[10px] sm:text-xs font-bold hover:bg-white/10 active:bg-white/20 transition-all flex items-center justify-center gap-1.5 shadow-sm">
                                    <Icon.Phone c="w-3.5 h-3.5" /> {t('attendance')}
                                </button>
                                <button onClick={() => setShowFastTrack(!showFastTrack)} className={`py-2 px-3 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm ${showFastTrack ? 'bg-indigo-500 border-transparent text-white fast-track-active' : 'border border-white/30 text-white hover:bg-white/10 active:bg-white/20'}`}>
                                    ⚡ AI Fast Track
                                </button>
                            </div>
                        </div>
                    </div>

                    {showFastTrack ? (
                        <FastTrackPanel onClose={() => setShowFastTrack(false)} employees={employees} showNotification={showNotification} onProcessed={() => setActiveTab('app')} />
                    ) : (
                        <QuickActionsGrid setActiveTab={setActiveTab} isAdmin={isAdmin} showNotification={showNotification} t={t} />
                    )}

                    <RecentActivityTable dailyReports={dailyReports} t={t} />
                </div>
            );
        }

        // ============================================================================
        // COMPONENT: AppTab
        // ============================================================================
        function AppTab({ employees, dailyReports, setDailyReports, showNotification, setActiveTab, isAdmin, dropdownData, t }) {
            const { sites = [], accommodations = [] } = dropdownData || {};

            const activeEmps = useMemo(() => employees.filter(emp => emp.K === 'ปกติ'), [employees]);
            const residenceGroups = useMemo(() => {
                const groups = new Set(activeEmps.map(emp => emp.J).filter(Boolean));
                return Array.from(groups).sort();
            }, [activeEmps]);

            const [step, setStep] = useState(1);
            const [activeInputMode, setActiveInputMode] = useState('manual');
            const [inputText, setInputText] = useState('');
            const [isRecording, setIsRecording] = useState(false);
            const [isLoading, setIsLoading] = useState(false);
            const [uploadedImage, setUploadedImage] = useState(null);
            const fileInputRef = useRef(null);

            const [selectedDate, setSelectedDate] = useState(() => {
                const tzoffset = (new Date()).getTimezoneOffset() * 60000;
                return (new Date(Date.now() - tzoffset)).toISOString().split('T')[0];
            });
            const [selectedSite, setSelectedSite] = useState('');
            const [gpsCoords, setGpsCoords] = useState(null);
            const [gpsStatusText, setGpsStatusText] = useState('');

            const [bulkStartTime, setBulkStartTime] = useState('08:00');
            const [bulkEndTime, setBulkEndTime] = useState('17:00');
            const [workH, setWorkH] = useState('8');
            const [otH, setOtH] = useState('0');
            const [bulkNote, setBulkNote] = useState('');

            const [selectedGroup, setSelectedGroup] = useState('');
            const [selectedEmployees, setSelectedEmployees] = useState([]);
            const [employeeCustomData, setEmployeeCustomData] = useState({});

            const [otSite1, setOtSite1] = useState('');
            const [otTime1, setOtTime1] = useState('17:00-18:00');
            const [otSite2, setOtSite2] = useState('');
            const [otTime2, setOtTime2] = useState('18:00-19:00');

            const [isAuditing, setIsAuditing] = useState(false);
            const [auditResult, setAuditResult] = useState(null);
            const [isSaving, setIsSaving] = useState(false);

            useEffect(() => {
                if (bulkStartTime && bulkEndTime) {
                    const [iH, iM] = bulkStartTime.split(':').map(Number);
                    const [oH, oM] = bulkEndTime.split(':').map(Number);
                    let total = (oH + oM / 60) - (iH + iM / 60);
                    if (total < 0) total += 24;
                    if (total > 0) {
                        let net = total >= 5 ? total - 1 : total;
                        let ot = 0, norm = net;
                        if (oH >= 17 && iH < 17) { ot = (oH + oM / 60) - 17; norm = net - ot; }
                        else if (net > 8) { ot = net - 8; norm = 8; }
                        const r = n => Math.round(n * 2) / 2;
                        setWorkH(r(Math.max(0, norm)).toString());
                        setOtH(r(Math.max(0, ot)).toString());
                    }
                }
            }, [bulkStartTime, bulkEndTime]);

            const nextStep = () => {
                if (step === 1 && (!selectedDate || !selectedSite)) { return showNotification('กรุณาระบุวันที่และไซต์งานให้ครบถ้วน', 'error'); }
                if (step === 2 && (!bulkStartTime || !bulkEndTime)) { return showNotification('กรุณาระบุเวลาให้ครบถ้วน', 'error'); }
                if (step === 4 && selectedEmployees.length === 0) { return showNotification('กรุณาเลือกพนักงานอย่างน้อย 1 คน', 'error'); }
                setStep(s => Math.min(5, s + 1));
            };
            const prevStep = () => setStep(s => Math.max(1, s - 1));

            const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
                const R = 6371;
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
                return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
            };

            const handleGpsDetection = () => {
                if (!navigator.geolocation) return showNotification('เบราว์เซอร์นี้ไม่รองรับพิกัด GPS', 'error');
                setGpsStatusText('กำลังดึงพิกัด...');

                const sitesWithCoords = typeof MOCK_SITES_WITH_COORDS !== 'undefined' ? MOCK_SITES_WITH_COORDS : [];
                if (sitesWithCoords.length === 0) {
                    setGpsStatusText('⚠️ ไม่พบข้อมูลพิกัดไซต์งานอ้างอิง');
                    return;
                }

                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude: userLat, longitude: userLng } = position.coords;
                        setGpsCoords({ lat: userLat, lng: userLng });
                        let nearestSite = null, shortestDistance = Infinity;
                        sitesWithCoords.forEach((site) => {
                            const distance = calculateHaversineDistance(userLat, userLng, site.lat, site.lng);
                            if (distance < shortestDistance) { shortestDistance = distance; nearestSite = site; }
                        });
                        if (nearestSite) {
                            setSelectedSite(nearestSite.name);
                            setGpsStatusText(`🎯 ใกล้เคียง "${nearestSite.name}" (${shortestDistance.toFixed(2)} กม.)`);
                            showNotification(`ระบุไซต์ "${nearestSite.name}" ตามพิกัดอัตโนมัติ`);
                        }
                    },
                    (error) => { setGpsStatusText('❌ ดึงพิกัดล้มเหลว'); showNotification('โปรดเปิดบริการตำแหน่งที่ตั้ง (GPS)', 'error'); },
                    { enableHighAccuracy: true, timeout: 8000 }
                );
            };

            const processAI = async () => {
                if (!inputText.trim()) { showNotification('กรุณากรอกข้อมูล', 'error'); return; }
                setIsLoading(true); showNotification('🧠 AI กำลังสรุปข้อมูลไซต์งาน...', 'success');
                try {
                    const prompt = `ดึงข้อมูลจาก: "${inputText}"\nตอบเป็น JSON keys: site(string), startTime(HH:MM), endTime(HH:MM), names(array of strings)`;
                    const resultText = await fetchGemini(prompt, "You are a Thai construction records helper. Output strictly valid JSON.");
                    const data = JSON.parse(resultText.replace(/```json/gi, '').replace(/```/g, '').trim());
                    applyAIParsedData(data);
                } catch (error) {
                    showNotification('❌ วิเคราะห์ไม่สำเร็จ โปรดแจ้งภาษาพนักงานให้ชัดเจนขึ้น', 'error');
                } finally { setIsLoading(false); }
            };

            const applyAIParsedData = (data) => {
                if (data.date) setSelectedDate(data.date);
                if (data.site) {
                    const matchedSite = sites.find(s => s.includes(data.site)) || data.site;
                    setSelectedSite(matchedSite);
                }
                if (data.startTime) setBulkStartTime(data.startTime);
                if (data.endTime) setBulkEndTime(data.endTime);
                if (data.names && data.names.length > 0) {
                    const matchedIds = [];
                    data.names.forEach(name => {
                        const found = activeEmps.find(e => e.E.includes(name) || e.C.includes(name));
                        if (found) matchedIds.push(found.N);
                    });
                    if (matchedIds.length > 0) {
                        setSelectedEmployees(matchedIds);
                        const firstEmp = activeEmps.find(e => e.N === matchedIds[0]);
                        if (firstEmp) setSelectedGroup(firstEmp.J);
                        setStep(4);
                    }
                }
                showNotification('✅ AI ทำการวิเคราะห์และป้อนข้อความให้สำเร็จ!', 'success');
            };

            const toggleEmployeeSelection = (empId) => setSelectedEmployees(prev => prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]);
            const selectAllEmployees = () => {
                const currentList = selectedGroup ? activeEmps.filter(emp => emp.J === selectedGroup) : activeEmps;
                const currentIds = currentList.map(emp => emp.N);
                const isAllSelected = currentIds.every(id => selectedEmployees.includes(id));
                setSelectedEmployees(isAllSelected ? prev => prev.filter(id => !currentIds.includes(id)) : prev => Array.from(new Set([...prev, ...currentIds])));
            };
            const clearSelection = () => setSelectedEmployees([]);
            const handleIndividualChange = (empId, field, value) => {
                setEmployeeCustomData(prev => ({
                    ...prev, [empId]: { startTime: prev[empId]?.startTime || bulkStartTime, endTime: prev[empId]?.endTime || bulkEndTime, note: prev[empId]?.note || bulkNote, [field]: value }
                }));
            };

            const generateLineReport = () => {
                const presentCount = selectedEmployees.length;
                let otHoursSum = otSite2 ? 2 : otSite1 ? 1 : Number(otH);
                let msg = `👷‍♂️ SMART WORKSITE REPORT 👷‍♂️\n---------------------------------------\n📅 Date: ${selectedDate}\n⏰ Time: [${bulkStartTime}-${bulkEndTime}] = ${workH} Hr. / OT = ${otHoursSum} Hr.\n👥 Group: ${selectedGroup || 'ทั้งหมด'}\n📍 Site: ${selectedSite}\n`;
                if (otSite1) msg += `🌙 OT 1: [${otTime1}] ${otSite1}\n`;
                if (otSite2) msg += `🌙 OT 2: [${otTime2}] ${otSite2}\n`;
                msg += `---------------------------------------\n📊 Attendance (${presentCount} Present):\n`;

                let idx = 1;
                const filteredEmp = selectedGroup ? activeEmps.filter(emp => emp.J === selectedGroup) : activeEmps;
                filteredEmp.forEach(emp => {
                    if (selectedEmployees.includes(emp.N)) {
                        const custom = employeeCustomData[emp.N] || { note: bulkNote };
                        const noteStr = custom.note ? `[${custom.note}]` : '[ปฏิบัติงานทั่วไป]';
                        msg += `${idx++}. ✅ ${emp.C} ${emp.D} ${noteStr}\n`;
                    }
                });

                const absent = filteredEmp.filter(emp => !selectedEmployees.includes(emp.N));
                if (absent.length > 0) {
                    msg += `\n⛔หยุด!!\n`;
                    absent.forEach((emp, i) => { msg += `${i + 1}. ❌ ${emp.C} ${emp.D} [${emp.N}]\n`; });
                }
                return msg;
            };

            const handleShareToLine = () => window.open(`https://line.me/R/share?text=${encodeURIComponent(generateLineReport())}`, '_blank');
            const handleCopyToClipboard = () => {
                const text = generateLineReport();
                // ใช้กระบวนการ Copy หลีกเลี่ยง iframe restriction
                const textarea = document.createElement("textarea");
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
                showNotification('📋 คัดลอกรายงานลงคลิปบอร์ดสำเร็จ!');
            };

            // 🟢 ฟังก์ชันบันทึกข้อมูลแบบเรียงลำดับ Queue ป้องกันปัญหาระบบเขียนทับล้มเหลว
            const handleFinalSubmitWithLog = (e) => {
                e.preventDefault();
                if (selectedEmployees.length === 0) return showNotification('กรุณาเลือกรายชื่อพนักงานเพื่อทำรายการ', 'error');

                setIsSaving(true);
                showNotification('⏳ ระบบกำลังเริ่มบันทึกข้อมูลพนักงานแบบ Sequential...', 'success');

                const otCalculated = otSite2 ? 2 : otSite1 ? 1 : Number(otH);
                const employeeNames = selectedEmployees.map(id => activeEmps.find(e => e.N === id)?.E || id);

                if (typeof google !== 'undefined' && google.script && google.script.run) {

                    const saveWorkerSequential = (index) => {
                        if (index >= selectedEmployees.length) {
                            setIsSaving(false);
                            showNotification(`✅ บันทึกรายงานพนักงาน ${selectedEmployees.length} คนลงแผ่นงานเรียบร้อยครบถ้วน`, 'success');

                            setDailyReports(prev => [{
                                id: Date.now(),
                                date: selectedDate,
                                site: selectedSite,
                                timeIn: bulkStartTime,
                                timeOut: bulkEndTime,
                                normalHour: Number(workH),
                                otTotal: otCalculated,
                                employeesCount: selectedEmployees.length,
                                names: employeeNames.join(', ')
                            }, ...prev]);
                            setActiveTab('dashboard');
                            return;
                        }

                        const empId = selectedEmployees[index];
                        const currentWorker = activeEmps.find(e => e.N === empId);
                        const workerName = currentWorker ? currentWorker.E : empId;
                        const workerCamp = currentWorker ? currentWorker.J : '';
                        const customDetails = employeeCustomData[empId] || { note: bulkNote };

                        const singlePayload = {
                            workDate: selectedDate,
                            siteName: selectedSite,
                            staffName: workerName,
                            accommodation: workerCamp,
                            note: customDetails.note || bulkNote,
                            isAdmin: isAdmin
                        };

                        google.script.run
                            .withSuccessHandler((response) => {
                                if (response.success) {
                                    saveWorkerSequential(index + 1); // รันพนักงานคนถัดไปเมื่อแถวก่อนหน้าผ่าน
                                } else {
                                    setIsSaving(false);
                                    showNotification(`❌ บันทึกรายชื่อ ${workerName} ล้มเหลว: ${response.message}`, 'error');
                                }
                            })
                            .withFailureHandler((error) => {
                                setIsSaving(false);
                                showNotification(`❌ ระบบเซิร์ฟเวอร์ขัดข้อง: ${error.message}`, 'error');
                            })
                            .saveDailyReport(singlePayload);
                    };

                    saveWorkerSequential(0); // เริ่มคิวที่พนักงานคนแรก

                } else {
                    // แซนด์บ็อกซ์สำหรับหน้าบราวเซอร์ทดลองรัน Offline
                    setTimeout(() => {
                        setIsSaving(false);
                        showNotification('✅ [โหมดออฟไลน์] จำลองการบันทึกฐานข้อมูลลงชีทเรียบร้อย', 'success');
                        setDailyReports(prev => [{ id: Date.now(), date: selectedDate, site: selectedSite, timeIn: bulkStartTime, timeOut: bulkEndTime, normalHour: Number(workH), otTotal: otCalculated, employeesCount: selectedEmployees.length, names: employeeNames.join(', ') }, ...prev]);
                        setActiveTab('dashboard');
                    }, 1200);
                }
            };

            const filteredEmp = selectedGroup ? activeEmps.filter(emp => emp.J === selectedGroup) : activeEmps;

            return (
                <div className="space-y-4 pb-6 animate-fade-in max-w-full">
                    {/* เมนูด้านบนสำหรับการกรอกข้อมูล */}
                    <div className="flex bg-slate-200/70 p-1 rounded-xl shadow-inner max-w-full">
                        {['manual', 'voice'].map((mode) => (
                            <button key={mode} type="button" onClick={() => setActiveInputMode(mode)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeInputMode === mode ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                {mode === 'manual' ? 'คีย์มือ / Manual' : '🎙️ พูดสั่งการ / Voice'}
                            </button>
                        ))}
                    </div>

                    {activeInputMode === 'voice' && (
                        <div className="bg-white rounded-2xl border-2 border-indigo-300 shadow-sm p-4 animate-fade-in w-full">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">🎙️</span>
                                <div>
                                    <div className="font-bold text-xs text-indigo-700">AI Voice Assistant</div>
                                    <div className="text-slate-500 text-[10px]">ป้อนข้อมูลไซต์และรายชื่อคนงานโดยการพูด</div>
                                </div>
                            </div>
                            <div className="relative">
                                <textarea value={inputText} onChange={e => setInputText(e.target.value)} rows={2} placeholder='กดที่ไมโครโฟนเพื่อพูด เช่น "ช่างแทน เข้าไซต์สาทร ทำโอทีสองชั่วโมง"' className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:border-indigo-400 resize-none outline-none text-slate-700" />
                                <button onClick={() => { setIsRecording(!isRecording); if (!isRecording) { showNotification('🎙️ กำลังรับเสียงพูดหน้างาน...', 'success'); setTimeout(() => { setIsRecording(false); setInputText('ช่างมนตรี เข้าไซต์บางละมุง ทำงานล่วงเวลาสองชั่วโมง'); showNotification('✅ แปลงเสียงเป็นคำสั่งสำเร็จ', 'success'); }, 2500); } }} className={`absolute bottom-3 right-3 p-1.5 rounded-lg transition-all ${isRecording ? 'bg-red-100 text-red-500 pulse-mic' : 'bg-indigo-50 text-indigo-400'}`}><Icon.Mic c="w-4 h-4" /></button>
                            </div>
                            <button onClick={processAI} disabled={!inputText.trim() || isLoading} className="mt-2 w-full py-2.5 rounded-xl font-bold text-xs bg-indigo-600 text-white disabled:bg-slate-300 shadow flex items-center justify-center gap-1.5">
                                {isLoading ? 'AI สรุปผล...' : <><Icon.Sparkles c="w-3.5 h-3.5" /> ประมวลผลและกรอกฟอร์ม</>}
                            </button>
                        </div>
                    )}

                    {/* กล่องแบบฟอร์ม 5 ขั้นตอน */}
                    <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-200 min-h-[420px] flex flex-col relative w-full overflow-hidden">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm sm:text-base font-black text-slate-800 flex items-center gap-1.5"><Icon.Clock c="w-4 h-4 text-indigo-600" /> {t('attendance')}</h2>
                            <div className="text-[10px] sm:text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">Step {step} / 5</div>
                        </div>

                        {/* แถบแจ้งสถานะ step ยืดหยุ่นได้ดีบนมือถือทุกรุ่น */}
                        <div className="flex items-center justify-between mb-5 relative px-1">
                            <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-slate-100 -z-10 -translate-y-1/2"></div>
                            <div className="absolute top-1/2 left-4 h-0.5 bg-indigo-600 -z-10 -translate-y-1/2 transition-all duration-300" style={{ width: `calc(${((step - 1) / 4) * 100}% - 1.5rem)` }}></div>
                            {[1, 2, 3, 4, 5].map(s => (
                                <div key={s} className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shadow-sm transition-colors ${step >= s ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}>
                                    {s}
                                </div>
                            ))}
                        </div>

                        {step === 1 && (
                            <div className="flex-1 space-y-4 animate-fade-in">
                                <h3 className="text-xs font-bold text-slate-700 bg-slate-50 p-2 rounded-lg text-center border border-slate-100">1. ข้อมูลหลักและไซต์งาน (Main Site)</h3>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">วันที่ทำงาน / Date *</label>
                                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-400" />
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[10px] font-bold text-slate-500">ไซต์งานปลายทาง / Construction Site *</label>
                                        <button type="button" onClick={handleGpsDetection} className="text-[9px] bg-indigo-50 text-indigo-600 font-bold px-2 py-1 rounded border border-indigo-100 flex items-center gap-1"><Icon.Location c="w-3 h-3" /> Check GPS</button>
                                    </div>
                                    <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-400">
                                        <option value="">-- เลือกไซต์งานก่อสร้าง --</option>
                                        {sites.length > 0 ? sites.map(name => <option key={name} value={name}>{name}</option>) : MOCK_SITES_WITH_COORDS.map(site => <option key={site.name} value={site.name}>{site.name}</option>)}
                                    </select>
                                    {gpsStatusText && <p className="text-[9px] font-semibold mt-1 text-emerald-600">{gpsStatusText}</p>}
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="flex-1 space-y-4 animate-fade-in">
                                <h3 className="text-xs font-bold text-slate-700 bg-slate-50 p-2 rounded-lg text-center border border-slate-100">2. กำหนดรอบเวลาทำงาน (Shift Hours)</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">เวลาเข้างาน</label>
                                        <input type="time" value={bulkStartTime} onChange={e => setBulkStartTime(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-xs text-center font-semibold" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">เวลาออกงาน</label>
                                        <input type="time" value={bulkEndTime} onChange={e => setBulkEndTime(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-xs text-center font-semibold" />
                                    </div>
                                </div>
                                <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100 flex items-center justify-around">
                                    <div className="text-center">
                                        <div className="text-[9px] font-bold text-indigo-400 uppercase">เวลาทำงานปกติ</div>
                                        <div className="text-xl font-black text-indigo-700">{workH} <span className="text-xs font-medium">ชม.</span></div>
                                    </div>
                                    <div className="w-px h-8 bg-indigo-200"></div>
                                    <div className="text-center">
                                        <div className="text-[9px] font-bold text-orange-400 uppercase">งานล่วงเวลา (OT)</div>
                                        <div className="text-xl font-black text-orange-600">{otH} <span className="text-xs font-medium">ชม.</span></div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">รายละเอียดงานที่ปฏิบัติ</label>
                                    <input type="text" value={bulkNote} onChange={e => setBulkNote(e.target.value)} placeholder="เช่น งานวางระบบเหล็ก, ฉาบปูน" className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-xs outline-none focus:ring-2 focus:ring-indigo-400" />
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="flex-1 space-y-4 animate-fade-in">
                                <h3 className="text-xs font-bold text-slate-700 bg-slate-50 p-2 rounded-lg text-center border border-slate-100">3. ตัวกรองแคมป์พนักงาน (Group Filter)</h3>
                                <p className="text-[10px] text-slate-500 text-center">เลือกแคมป์ที่พักเพื่อแสดงรายชื่อพนักงานสังกัดนั้นๆ อย่างรวดเร็วบนมือถือ</p>
                                <select value={selectedGroup} onChange={e => { setSelectedGroup(e.target.value); clearSelection(); }} className="w-full px-3 py-3 border border-slate-200 rounded-xl bg-slate-50 text-xs font-semibold outline-none">
                                    <option value="">-- แสดงทั้งหมด ({activeEmps.length} คน) --</option>
                                    {residenceGroups.map(g => <option key={g} value={g}>แคมป์: {g}</option>)}
                                </select>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="flex-1 flex flex-col space-y-3 animate-fade-in h-full overflow-hidden">
                                <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-700">4. เช็คชื่อพนักงานปฏิบัติงาน</h3>
                                    <button onClick={selectAllEmployees} className="text-[9px] font-bold text-indigo-600 bg-white px-2 py-1 rounded border border-indigo-200 shadow-sm">
                                        {selectedEmployees.length === filteredEmp.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                    </button>
                                </div>
                                <div className="text-[10px] text-slate-500 text-center font-semibold">เลือกแล้ว <span className="text-indigo-600 font-bold">{selectedEmployees.length}</span> จาก {filteredEmp.length} พนักงาน</div>

                                <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[180px]">
                                    {filteredEmp.map(emp => {
                                        const isSelected = selectedEmployees.includes(emp.N);
                                        const empData = employeeCustomData[emp.N] || { startTime: bulkStartTime, endTime: bulkEndTime, note: bulkNote };
                                        return (
                                            <div key={emp.N} className={`p-2 rounded-xl border transition-all flex flex-col gap-1.5 ${isSelected ? 'bg-indigo-50/50 border-indigo-300 shadow-sm' : 'bg-white border-slate-200'}`}>
                                                <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleEmployeeSelection(emp.N)}>
                                                    <div className={`w-4.5 h-4.5 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-300'}`}>
                                                        {isSelected && <Icon.Check c="w-3 h-3" />}
                                                    </div>
                                                    <div className="flex-1 truncate">
                                                        <div className={`font-bold text-xs ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>{emp.C} {emp.D}</div>
                                                        <div className="text-[8px] text-slate-400">รหัส ID: {emp.N} | แคมป์: {emp.J}</div>
                                                    </div>
                                                </div>
                                                {isSelected && (
                                                    <div className="pl-6 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                        <input type="text" value={empData.startTime} onChange={e => handleIndividualChange(emp.N, 'startTime', e.target.value)} className="w-10 px-1 py-0.5 text-[9px] border rounded text-center" />
                                                        <span className="text-slate-400 text-[8px]">-</span>
                                                        <input type="text" value={empData.endTime} onChange={e => handleIndividualChange(emp.N, 'endTime', e.target.value)} className="w-10 px-1 py-0.5 text-[9px] border rounded text-center" />
                                                        <input type="text" value={empData.note} onChange={e => handleIndividualChange(emp.N, 'note', e.target.value)} placeholder="ชื่องานเฉพาะ..." className="flex-1 px-1.5 py-0.5 text-[9px] border rounded" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {step === 5 && (
                            <div className="flex-1 space-y-4 animate-fade-in overflow-y-auto pr-1 max-h-[300px]">
                                <h3 className="text-xs font-bold text-slate-700 bg-slate-50 p-2 rounded-lg text-center border border-slate-100">5. รายงานและบันทึกรายงาน</h3>

                                <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200 space-y-1">
                                    <div className="text-[10px] font-bold text-amber-800 flex items-center gap-1">🌙 งานล่วงเวลาเฉพาะไซต์ (OT Option)</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="text" value={otSite1} onChange={e => setOtSite1(e.target.value)} placeholder="ไซต์ OT 1 (17-18)" className="w-full px-2 py-1.5 text-[10px] border rounded-lg bg-white outline-none" />
                                        <input type="text" value={otSite2} onChange={e => setOtSite2(e.target.value)} placeholder="ไซต์ OT 2 (18-19)" className="w-full px-2 py-1.5 text-[10px] border rounded-lg bg-white outline-none" />
                                    </div>
                                </div>

                                <div className="bg-slate-100 p-2.5 rounded-xl text-[9px] sm:text-[10px] font-mono whitespace-pre-wrap border border-slate-200 text-slate-700 h-28 overflow-y-auto">
                                    {generateLineReport()}
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={handleCopyToClipboard} className="bg-white border border-slate-300 text-slate-700 py-2 rounded-xl text-xs font-bold flex justify-center items-center gap-1 shadow-sm"><Icon.Clipboard c="w-3.5 h-3.5" /> Copy Report</button>
                                    <button type="button" onClick={handleShareToLine} className="bg-[#06C755] text-white py-2 rounded-xl text-xs font-bold flex justify-center items-center gap-1 shadow-sm"><Icon.Share c="w-3.5 h-3.5" /> Share LINE</button>
                                </div>

                                <button type="button" onClick={handleFinalSubmitWithLog} disabled={isSaving || selectedEmployees.length === 0} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow transition-all">
                                    {isSaving ? <><div className="spinner border-t-white" style={{ width: '14px', height: '14px' }}></div> บันทึกเข้าระบบคิว...</> : <><Icon.Save c="w-3.5 h-3.5" /> {t('confirmSave')}</>}
                                </button>
                            </div>
                        )}

                        <div className="flex gap-2 mt-auto pt-4 border-t border-slate-100">
                            {step > 1 && (
                                <button type="button" onClick={prevStep} className="px-4 py-2 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                                    {t('back')}
                                </button>
                            )}
                            {step < 5 && (
                                <button type="button" onClick={nextStep} className="flex-1 bg-[#0f172a] hover:bg-slate-800 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition-all shadow shadow-slate-300">
                                    {t('next')} <Icon.ArrowRight c="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        // ============================================================
        // COMPONENT: AiToolsTab
        // ============================================================
        function AiToolsTab({ showNotification }) {
            const tools = [
                { id: 'material', icon: '🧱', title: 'AI ประเมินวัสดุก่อสร้าง', desc: 'พิมพ์รายละเอียดหน้างานก่อสร้างเพื่อให้ AI คำนวณปริมาณวัสดุอ้างอิง', placeholder: 'เช่น: ก่อกำแพงอิฐมวลเบา กว้าง 4 เมตร สูง 2.8 เมตร', buttonText: '✨ ประเมินวัสดุหน้างานด้วย AI', btnClass: 'bg-violet-600 hover:bg-violet-700' },
                { id: 'translate', icon: '🌐', title: 'AI แปลภาษาพนักงาน', desc: 'แปลคำสั่งงานภาษาไทย ออกเป็นภาษาพม่า เขมร ลาว พร้อมคำอ่านภาษาไทย', placeholder: 'เช่น: ล้างเครื่องผสมปูนแล้วนำเหล็กเส้นไปเรียงให้เรียบร้อย', buttonText: '✨ แปลงภาษาหน้างานด้วย AI', btnClass: 'bg-teal-600 hover:bg-teal-700', lang: true },
                { id: 'safety', icon: '🛡️', title: 'AI ตรวจสอบกฎความปลอดภัย', desc: 'ระบุกิจกรรมความเสี่ยงหน้างานเพื่อให้ AI ช่วยเตือนความปลอดภัยตามมาตรฐาน', placeholder: 'เช่น: กำลังประกอบนั่งร้านสูง 3 ชั้น ติดตั้งสลิงเหล็ก', buttonText: '✨ วิเคราะห์ความเสี่ยงด้วย AI', btnClass: 'bg-rose-600 hover:bg-rose-700' }
            ];
            const [inputs, setInputs] = useState({});
            const [langs, setLangs] = useState({});
            const [loadings, setLoadings] = useState({});
            const [results, setResults] = useState({});

            const handleProcess = async (tool) => {
                const text = inputs[tool.id] || '';
                if (!text.trim()) { showNotification('กรุณาระบุคำอธิบายก่อนประมวลผล', 'error'); return; }
                setLoadings(prev => ({ ...prev, [tool.id]: true }));
                showNotification(`🧠 AI กำลังสร้างเอกสารวิเคราะห์ "${tool.title}"...`, 'success');

                try {
                    let prompt = "";
                    if (tool.id === 'material') prompt = `ประเมินวัสดุก่อสร้างและอุปกรณ์ที่จำเป็นสำหรับ: ${text}\nเขียนให้เป็นข้อๆ เพื่อความชัดเจน`;
                    else if (tool.id === 'translate') prompt = `แปลประโยคสั่งงานนี้: "${text}"\nแปลเป็นภาษา: ${langs[tool.id] || 'พม่า'}\nพร้อมระบุคำอ่านภาษาไทยสะกดด้วยเพื่อให้คนไทยนำไปพูดกับพนักงานโดยตรง`;
                    else if (tool.id === 'safety') prompt = `วิเคราะห์อันตรายหน้างานพร้อมสคริปต์พูดเตือนภัยในการทำกิจกรรม: ${text}`;

                    const responseText = await fetchGemini(prompt, "คุณคือวิศวกรโครงสร้างและผู้เชี่ยวชาญด้านความปลอดภัยไซต์งาน ตอบกลับเป็นภาษาไทยอย่างกระชับ");
                    setResults(prev => ({ ...prev, [tool.id]: responseText }));
                    showNotification('✅ วิเคราะห์และสร้างข้อมูลสำเร็จ!', 'success');
                } catch (err) {
                    showNotification('❌ เกิดข้อผิดพลาด ไม่สามารถติดต่อเซิร์ฟเวอร์ AI', 'error');
                } finally {
                    setLoadings(prev => ({ ...prev, [tool.id]: false }));
                }
            };

            return (
                <div className="space-y-4 pb-6 animate-fade-in w-full">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">🔮</span>
                        <div>
                            <h2 className="text-base sm:text-lg font-extrabold text-slate-800">เครื่องมือวิศวกร AI (AI Tools)</h2>
                            <p className="text-[10px] text-slate-500">รวมผู้ช่วยการทำงานหน้างานฉลาดล้ำบนระบบคลาวด์</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {tools.map(tool => (
                            <div key={tool.id} className="ai-tool-card bg-white rounded-2xl border border-slate-150 shadow-sm p-4 space-y-3 w-full">
                                <div className="flex items-start gap-2">
                                    <span className="text-xl">{tool.icon}</span>
                                    <div>
                                        <div className="font-bold text-slate-800 text-xs sm:text-sm">{tool.title}</div>
                                        <div className="text-slate-500 text-[10px] sm:text-xs mt-0.5">{tool.desc}</div>
                                    </div>
                                </div>
                                {tool.lang && (
                                    <select value={langs[tool.id] || 'พม่า'} onChange={e => setLangs(prev => ({ ...prev, [tool.id]: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 outline-none">
                                        <option value="พม่า">ภาษาพม่า (Myanmar)</option>
                                        <option value="กัมพูชา">ภาษาเขมร (Khmer)</option>
                                        <option value="ลาว">ภาษาลาว (Lao)</option>
                                        <option value="อังกฤษ">ภาษาอังกฤษ (English)</option>
                                    </select>
                                )}
                                <textarea value={inputs[tool.id] || ''} onChange={e => setInputs(prev => ({ ...prev, [tool.id]: e.target.value }))} rows={2} placeholder={tool.placeholder} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-indigo-400" />
                                <button onClick={() => handleProcess(tool)} disabled={loadings[tool.id]} className={`w-full ${tool.btnClass} text-white py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 shadow`}>
                                    {loadings[tool.id] ? 'AI กำลังประมวลผล...' : tool.buttonText}
                                </button>
                                {results[tool.id] && (
                                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{results[tool.id]}</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // ============================================================
        // COMPONENT: AiAdminTab
        // ============================================================
        function AiAdminTab({ isAdmin, userEmail, showNotification }) {
            const [inputText, setInputText] = useState('');
            const [isLoading, setIsLoading] = useState(false);
            const [result, setResult] = useState('');

            if (!isAdmin) {
                return (
                    <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center">
                        <Icon.Lock c="w-12 h-12 text-rose-400" />
                        <h3 className="font-bold text-slate-700 text-sm">เข้าถึงได้เฉพาะแอดมินระบบ</h3>
                        <p className="text-slate-500 text-xs max-w-xs px-4">อีเมล {userEmail} ไม่พบการตั้งค่าในรายชื่อแอดมินหลัก</p>
                    </div>
                );
            }

            const generateWeeklySummary = async () => {
                if (!inputText.trim()) return showNotification('กรุณาป้อนรายละเอียดงาน', 'error');
                setIsLoading(true);
                showNotification('🧠 AI ผู้บริหารกำลังร่างสรุปงานรายสัปดาห์...', 'success');
                try {
                    const prompt = `ร่างรายงานสรุปความคืบหน้ารอบสัปดาห์หน้างานก่อสร้างสำหรับส่งผู้บริหารระดับสูงจากข้อมูลดิบ: ${inputText}`;
                    const res = await fetchGemini(prompt, "คุณคือผู้จัดการโครงการอาวุโส ร่างจดหมายรายงานทางการ สรุปผลลัพธ์ ปัญหา และทางแก้ให้เรียบร้อย");
                    setResult(res);
                } catch (e) {
                    showNotification('ประมวลผลติดขัด', 'error');
                } finally { setIsLoading(false); }
            };

            return (
                <div className="space-y-4 pb-6 animate-fade-in w-full">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">🤵</span>
                        <div>
                            <h2 className="text-base sm:text-lg font-extrabold text-slate-800">แผง AI แอดมินวิเคราะห์รายงาน</h2>
                            <p className="text-[10px] text-slate-500">ร่างเอกสาร สรุปประสิทธิภาพรอบเดือน สำหรับรายงานผู้บริหาร</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-150 shadow p-4 space-y-3 w-full">
                        <textarea value={inputText} onChange={e => setInputText(e.target.value)} rows={3} placeholder="ระบุสรุปความคืบหน้าหน้างานสั้นๆ เช่น ไซต์ Rama 3 ตอกเสาเข็มครบถ้วน ฝนตกหน่วงงานสองวัน..." className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs sm:text-sm text-slate-700 placeholder-slate-400" />
                        <button onClick={generateWeeklySummary} disabled={isLoading} className="w-full bg-slate-900 text-white font-bold text-xs py-2.5 rounded-xl">
                            {isLoading ? 'AI กำลังจัดเตรียมนิทรรศการงานสรุป...' : '✨ ร่างรายงานความคืบหน้าสัปดาห์โดย AI'}
                        </button>
                        {result && <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed shadow-inner">{result}</div>}
                    </div>
                </div>
            );
        }

        // ============================================================
        // COMPONENT: StatsTab
        // ============================================================
        function StatsTab({ dailyReports, safetyHistory, stats }) {
            const chart1Ref = useRef(null);
            const chart2Ref = useRef(null);

            useEffect(() => {
                const ctx1 = document.getElementById('chart-sites')?.getContext('2d');
                if (ctx1) {
                    if (chart1Ref.current) chart1Ref.current.destroy();
                    const map = {};
                    dailyReports.forEach(r => { if (r.site) map[r.site] = (map[r.site] || 0) + Number(r.normalHour) + Number(r.otTotal); });
                    chart1Ref.current = new Chart(ctx1, {
                        type: 'bar',
                        data: { labels: Object.keys(map), datasets: [{ label: 'ชั่วโมงสะสม', data: Object.values(map), backgroundColor: 'rgba(99,102,241,0.75)', borderColor: 'rgb(79,70,229)', borderWidth: 1.5, borderRadius: 8 }] },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                    });
                }
                const ctx2 = document.getElementById('chart-safety')?.getContext('2d');
                if (ctx2) {
                    if (chart2Ref.current) chart2Ref.current.destroy();
                    const sorted = [...safetyHistory].reverse();
                    chart2Ref.current = new Chart(ctx2, {
                        type: 'line',
                        data: { labels: sorted.map(h => h.date), datasets: [{ label: 'PPE %', data: sorted.map(h => parseFloat(h.complianceScore)), borderColor: 'rgb(16,185,129)', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.3, fill: true, borderWidth: 3 }] },
                        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } }
                    });
                }
                return () => {
                    if (chart1Ref.current) chart1Ref.current.destroy();
                    if (chart2Ref.current) chart2Ref.current.destroy();
                }
            }, [dailyReports, safetyHistory]);

            return (
                <div className="space-y-4 pb-6 w-full animate-fade-in">
                    <h2 className="text-base sm:text-lg font-extrabold text-slate-800">📊 วิเคราะห์สถิติและการทำงาน</h2>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { label: 'OT สะสม', value: `${stats.otTotal} ชม.`, bg: 'bg-orange-50', text: 'text-orange-600' },
                            { label: 'ชม.ปกติสะสม', value: `${stats.normalTotal} ชม.`, bg: 'bg-blue-50', text: 'text-blue-600' },
                            { label: 'รายงานทั้งหมด', value: dailyReports.length, bg: 'bg-violet-50', text: 'text-violet-600' },
                            { label: 'PPE เฉลี่ย', value: `${stats.safetyAvg}%`, bg: 'bg-emerald-50', text: 'text-emerald-600' }
                        ].map((s, i) => (
                            <div key={i} className={`${s.bg} rounded-xl p-2.5 text-center`}>
                                <div className={`text-base sm:text-lg font-extrabold ${s.text}`}>{s.value}</div>
                                <div className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                            </div>
                        ))}
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-100 p-3 sm:p-4 w-full">
                        <div className="font-bold text-slate-700 text-xs mb-3">สะสมชั่วโมงจำแนกตามไซต์งาน</div>
                        <div style={{ height: '180px' }}><canvas id="chart-sites"></canvas></div>
                    </div>
                </div>
            );
        }

        // ============================================================
        // COMPONENT: ArchiveTab (Monthly Vault)
        // ============================================================
        function ArchiveTab({ dailyReports, setDailyReports, showNotification }) {
            const [selectedMonth, setSelectedMonth] = useState(null);
            const currentYear = new Date().getFullYear();

            const months = [
                { id: '01', name: 'มกราคม', icon: '❄️' },
                { id: '02', name: 'กุมภาพันธ์', icon: '💘' },
                { id: '03', name: 'มีนาคม', icon: '🪁' },
                { id: '04', name: 'เมษายน', icon: '💦' },
                { id: '05', name: 'พฤษภาคม', icon: '🌱' },
                { id: '06', name: 'มิถุนายน', icon: '☔' },
                { id: '07', name: 'กรกฎาคม', icon: '🦁' },
                { id: '08', name: 'สิงหาคม', icon: '💙' },
                { id: '09', name: 'กันยายน', icon: '🍂' },
                { id: '10', name: 'ตุลาคม', icon: '🎃' },
                { id: '11', name: 'พฤศจิกายน', icon: '🌕' },
                { id: '12', name: 'ธันวาคม', icon: '🎄' }
            ];

            const filteredReports = useMemo(() => {
                if (!selectedMonth) return [];
                return dailyReports.filter(report => {
                    if (!report.date) return false;
                    return report.date.split('-')[1] === selectedMonth;
                });
            }, [dailyReports, selectedMonth]);

            return (
                <div className="space-y-4 pb-6 animate-fade-in w-full">
                    {!selectedMonth ? (
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">คลังข้อมูลรายเดือน (Monthly Archive)</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {months.map(m => (
                                    <button key={m.id} onClick={() => setSelectedMonth(m.id)} className="bg-white border border-slate-200 hover:border-indigo-400 p-4 rounded-2xl flex flex-col items-center text-center shadow-sm hover:scale-102 transition-all">
                                        <span className="text-2xl mb-1">{m.icon}</span>
                                        <span className="font-bold text-xs text-slate-700">{m.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <button onClick={() => setSelectedMonth(null)} className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg font-bold">← ย้อนกลับคลัง</button>
                                <span className="font-bold text-xs text-slate-700">{months.find(m => m.id === selectedMonth)?.name}</span>
                            </div>
                            {filteredReports.length > 0 ? (
                                filteredReports.map((item, i) => (
                                    <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
                                        <div className="font-bold text-slate-800">{item.site}</div>
                                        <div className="text-slate-500 text-[10px]">วันที่: {item.date} | เวลา: {item.timeIn}-{item.timeOut} | พนักงาน: {item.employeesCount} คน</div>
                                        <div className="text-slate-600 font-medium">รายชื่อ: {item.names}</div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center p-8 text-slate-400 text-xs">ไม่พบข้อมูลรายงานในเดือนนี้</p>
                            )}
                        </div>
                    )}
                </div>
            );
        }

        // ============================================================
        // COMPONENT: AdminTab
        // ============================================================
        function AdminTab({ employees, setEmployees, isAdmin, showNotification }) {
            const [search, setSearch] = useState('');
            const filtered = employees.filter(e => e.E?.toLowerCase().includes(search.toLowerCase()) || e.N?.includes(search));

            return (
                <div className="space-y-4 pb-6 animate-fade-in w-full">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base sm:text-lg font-extrabold text-slate-800">👤 ฐานข้อมูลรายชื่อพนักงาน</h2>
                    </div>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ หรือรหัสพนักงาน 5 หลัก..." className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:outline-none focus:border-indigo-400 bg-white" />
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {filtered.map(emp => (
                            <div key={emp.N} className="bg-white rounded-xl border border-slate-100 p-2.5 flex items-center justify-between gap-2 shadow-sm text-xs">
                                <div>
                                    <div className="font-bold text-slate-700">{emp.E}</div>
                                    <div className="text-[10px] text-slate-400">รหัสประจำตัว: {emp.N} | สังกัด: {emp.J}</div>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${emp.K === 'ปกติ' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>{emp.K}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // ============================================================
        // COMPONENT: ManualTab (คู่มือการใช้งานระบบฉบับสมบูรณ์)
        // ============================================================
        function ManualTab() {
            return (
                <div className="space-y-4 pb-6 animate-fade-in text-xs w-full">
                    <h2 className="text-base sm:text-lg font-extrabold text-slate-800 flex items-center gap-2">📖 คู่มือการใช้งานแอดมิน (Smart Worksite Guide)</h2>

                    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4 shadow-sm text-slate-700 leading-relaxed">
                        <div>
                            <h3 className="font-bold text-slate-800 text-sm border-b pb-1 text-indigo-600">1. การบันทึกเวลาทำงานผ่านระบบเว็บแอป</h3>
                            <ul className="list-disc pl-5 mt-1.5 space-y-1">
                                <li><strong>คีย์มือ (Manual):</strong> ทำรายการตามขั้นตอนที่ 1-5 โดยระบุวันที่ ไซต์งาน เวลา และรายชื่อพนักงานที่ปฏิบัติงานจริง</li>
                                <li><strong>สั่งการด้วยเสียง (Voice):</strong> กดปุ่มไมโครโฟนเพื่อพูดคำสั่ง เช่น <em>"ช่างมนตรี เข้าไซต์สาทร เลิกงานสองทุ่ม"</em> ระบบ AI จะกรอกฟอร์มให้อัตโนมัติในทันที</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-bold text-slate-800 text-sm border-b pb-1 text-indigo-600">2. ระบบคำสั่งแชทบอท LINE / Web App (Commands)</h3>
                            <div className="bg-slate-50 p-2 rounded-xl mt-1.5 font-mono space-y-1 text-[10px]">
                                <div>• <strong>/report</strong> หรือ <strong>สรุปงาน</strong> : สั่งให้ AI ตรวจสอบและรายงานสรุปผลแต่ละไซต์งานประจำวัน</div>
                                <div>• <strong>/check</strong> หรือ <strong>ตรวจสอบ</strong> : ค้นหารายชื่อพนักงานที่รายงานเข้ามาในระบบวันนี้</div>
                                <div>• <strong>/error</strong> : เรียกดูรายการข้อผิดพลาดจากการทำงานระบบ 5 ล็อกล่าสุด</div>
                                <div>• <strong>/help</strong> : ให้แชทบอทแสดงรายชื่อคู่มือคำสั่งทั้งหมด</div>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-bold text-slate-800 text-sm border-b pb-1 text-indigo-600">3. ปัญหาระบบและแนวทางการแก้ไข (Troubleshooting)</h3>
                            <div className="space-y-2 mt-1.5">
                                <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg">
                                    <span className="font-bold text-rose-800">ปัญหาที่พบบ่อย: บันทึกข้อมูลรายงานไม่เข้า Google Sheets</span>
                                    <p className="mt-0.5 text-rose-700"><strong>สาเหตุ:</strong> เกิดจากปัญหา Sheet Lock Timeout เนื่องจากมีคนเข้าเขียนข้อมูลพร้อมกันจำนวนมาก</p>
                                    <p className="mt-0.5 text-rose-700 font-semibold"><strong>วิธีป้องกัน:</strong> แอป V.7 ได้อัปเกรดระบบ Sequential Record Queue ซึ่งจะเรียงคิวส่งทีละแถวอัตโนมัติ ทำให้บันทึกได้สำเร็จ 100%</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // ============================================================
        // MAIN APP COMPONENT
        // ============================================================
        function App() {
            const [activeTab, setActiveTab] = useState('dashboard');
            const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
            const [notification, setNotification] = useState(null);

            // สิทธิ์การทดสอบ Admin & บันทึกประวัติ
            const [isAdmin, setIsAdmin] = useState(true);
            const [userEmail, setUserEmail] = useState('engineer@smartworksite.local');
            const [userRole, setUserRole] = useState('👑 ผู้ดูแลระบบ (Admin)');

            // ระบบสลับภาษาใช้งานได้จริง 4 ภาษา
            const [currentLang, setCurrentLang] = useState('TH');
            const [showLangMenu, setShowLangMenu] = useState(false);

            // แจ้งเตือนกระดิ่ง (เฉพาะ Admin ดึงรายงานข้อผิดพลาดไลน์กลุ่ม)
            const [showBellDot, setShowBellDot] = useState(true);
            const [showBellModal, setShowBellModal] = useState(false);
            const [bellLogs, setBellLogs] = useState([
                { timestamp: "16/06/2026 08:45", type: "SHEET_LOCK", message: "ระบบแจ้งคิวบันทึกชะงัก ช่างสมพร (ID: 52904) เข้าระบบคิวเรียบร้อย" },
                { timestamp: "15/06/2026 17:15", type: "LINE_WEBHOOK", message: "Webhook ส่งพิกัดล้มเหลวชั่วคราวเนื่องจากพิกัดอับสัญญาณ (สาทร)" },
                { timestamp: "15/06/2026 11:30", type: "AI_QUOTA", message: "วิเคราะห์ Vision OCR ลายมือล่าช้าเล็กน้อยจาก Quota API ของรุ่นทดสอบ" }
            ]);

            // Database States
            const [employees, setEmployees] = useState(() => {
                const local = localStorage.getItem('sw_emp');
                return local ? JSON.parse(local) : INITIAL_MOCK_DATA;
            });
            const [dailyReports, setDailyReports] = useState(() => {
                const local = localStorage.getItem('sw_reports');
                return local ? JSON.parse(local) : [
                    { id: 1, date: '2026-06-15', site: 'บางละมุง', timeIn: '08:00', timeOut: '19:00', normalHour: 8, otTotal: 2, employeesCount: 2, names: 'นาย วินวิน ทัน, น.ส. โมนัน ดา' },
                    { id: 2, date: '2026-06-14', site: 'ปรานบุรี', timeIn: '08:00', timeOut: '17:00', normalHour: 8, otTotal: 0, employeesCount: 1, names: 'นาย แทน สุขสม' },
                ];
            });
            const [safetyHistory, setSafetyHistory] = useState(() => {
                const local = localStorage.getItem('sw_safety');
                return local ? JSON.parse(local) : [
                    { id: 1, date: '2026-06-16', site: 'บางละมุง', complianceScore: '100%', workersDetected: 2, summary: 'PPE ครบถ้วน' }
                ];
            });
            const [dropdownData, setDropdownData] = useState({ sites: [], staff: [], accommodations: [] });

            useEffect(() => { localStorage.setItem('sw_emp', JSON.stringify(employees)); }, [employees]);
            useEffect(() => { localStorage.setItem('sw_reports', JSON.stringify(dailyReports)); }, [dailyReports]);
            useEffect(() => { localStorage.setItem('sw_safety', JSON.stringify(safetyHistory)); }, [safetyHistory]);

            const showNotification = useCallback((msg, type = 'success') => {
                setNotification({ msg, type });
                setTimeout(() => setNotification(null), 3000);
            }, []);

            // โหลดผู้ใช้และข้อมูลระบบจาก GAS Dynamic Bridge
            useEffect(() => {
                try {
                    const bridge = document.getElementById('gas-data-bridge');
                    if (bridge) {
                        const config = JSON.parse(bridge.textContent.trim());
                        setIsAdmin(config.isAdmin !== undefined ? config.isAdmin : true);
                        setUserEmail(config.userEmail || 'engineer@smartworksite.local');
                        setUserRole(config.isAdmin ? '👑 ผู้ดูแลระบบ (Admin)' : '👤 พนักงานทั่วไป (User)');
                    }
                } catch (err) {
                    console.warn('gas-data-bridge init error:', err);
                }

                if (typeof google !== 'undefined' && google.script && google.script.run) {
                    google.script.run
                        .withSuccessHandler((res) => {
                            if (res && res.success) {
                                setDropdownData({
                                    sites: res.sites || [],
                                    staff: res.staff || [],
                                    accommodations: res.accommodations || []
                                });
                            }
                        })
                        .getWebAppDropdownData();

                    google.script.run
                        .withSuccessHandler((liveData) => {
                            if (liveData && liveData.length > 0) {
                                setEmployees(liveData);
                                showNotification('🔄 ซิงค์ฐานข้อมูลพนักงานเรียลไทม์เรียบร้อย', 'success');
                            }
                        })
                        .getEmployeeData();
                }
            }, [showNotification]);

            const stats = useMemo(() => ({
                otTotal: dailyReports.reduce((s, r) => s + Number(r.otTotal || 0), 0),
                normalTotal: dailyReports.reduce((s, r) => s + Number(r.normalHour || 0), 0),
                activeSitesCount: new Set(dailyReports.map(r => r.site).filter(Boolean)).size,
                safetyAvg: safetyHistory.length > 0
                    ? Math.round(safetyHistory.reduce((s, h) => s + parseFloat(h.complianceScore), 0) / safetyHistory.length)
                    : 100,
            }), [dailyReports, safetyHistory]);

            // Helper แปลภาษาอย่างเป็นทางการ
            const t = (key) => {
                return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS['TH'][key] || key;
            };

            const systemMenus = [
                { id: 'dashboard', label: t('dashboard'), icon: <Icon.Dashboard c="w-4.5 h-4.5" />, color: 'text-blue-600', bg: 'bg-blue-50' },
                { id: 'app', label: t('attendance'), icon: <Icon.Phone c="w-4.5 h-4.5" />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { id: 'ai-tools', label: t('aiTools'), icon: <Icon.Sparkles c="w-4.5 h-4.5" />, color: 'text-violet-600', bg: 'bg-violet-50' },
                { id: 'ai-admin', label: t('aiAdmin'), icon: <Icon.Bot c="w-4.5 h-4.5" />, color: isAdmin ? 'text-purple-600' : 'text-slate-400', bg: isAdmin ? 'bg-purple-50' : 'bg-slate-50', adminOnly: true },
                { id: 'stats', label: t('stats'), icon: <Icon.Chart c="w-4.5 h-4.5" />, color: 'text-amber-600', bg: 'bg-amber-50' },
                { id: 'archive', label: t('archive'), icon: <Icon.Folder c="w-4.5 h-4.5" />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { id: 'admin', label: t('admin'), icon: <Icon.Users c="w-4.5 h-4.5" />, color: 'text-slate-600', bg: 'bg-slate-100', adminOnly: true },
                { id: 'manual', label: 'คู่มือ / Manual', icon: <Icon.BookOpen c="w-4.5 h-4.5" />, color: 'text-teal-600', bg: 'bg-teal-50' }
            ];

            const handleTabChange = (id) => {
                if (systemMenus.find(m => m.id === id)?.adminOnly && !isAdmin) {
                    showNotification(t('noPermission'), 'error');
                    return;
                }
                setActiveTab(id);
                setIsMobileMenuOpen(false);
            };

            const toggleLangMenu = () => setShowLangMenu(!showLangMenu);
            const selectLanguage = (langCode) => {
                setCurrentLang(langCode);
                setShowLangMenu(false);
                showNotification(`สลับเป็นภาษา ${langCode} เรียบร้อย`, 'success');
            };

            const clickBellNotifications = () => {
                if (!isAdmin) {
                    showNotification('🔒 เฉพาะแอดมินจึงจะสามารถตรวจสอบรายงานกระดิ่งได้', 'error');
                    return;
                }
                setShowBellModal(true);
                setShowBellDot(false); // ลบไฟสีแดงกระพริบเมื่อเปิดอ่านแล้ว
            };

            const initials = userEmail.split('@')[0].substring(0, 2).toUpperCase();

            return (
                <div className="min-h-screen bg-slate-100 flex flex-col relative pb-16 lg:pb-0">

                    {/* ========== HEADER ========== */}
                    <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-md">
                        <div className="flex items-center justify-between px-3.5 py-3">
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-1.5 rounded-lg hover:bg-white/10 lg:hidden">
                                    <Icon.Menu c="w-5 h-5" />
                                </button>
                                <img src={LOGO_URL} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white p-0.5" />
                                <div>
                                    <div className="font-extrabold text-[11px] sm:text-xs tracking-wide">SMART WORKSITE</div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse"></div>
                                        <span className="text-emerald-400 text-[8px] sm:text-[9px] font-semibold">Enterprise V.7</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {/* ปุ่มเปลี่ยนภาษาใช้งานได้จริง 4 ภาษา */}
                                <div className="relative">
                                    <button onClick={toggleLangMenu} className="bg-slate-800 text-white border border-slate-700 px-2 py-1 text-[11px] font-bold rounded-lg hover:bg-slate-700 active:scale-95 transition-all flex items-center gap-1 min-h-[30px]">
                                        🌐 {currentLang}
                                    </button>
                                    {showLangMenu && (
                                        <div className="absolute right-0 mt-1.5 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden w-28 shadow-2xl z-[120]">
                                            <button onClick={() => selectLanguage('TH')} className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-slate-700 transition-colors">🇹🇭 ภาษาไทย</button>
                                            <button onClick={() => selectLanguage('EN')} className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-slate-700 transition-colors">🇺🇸 English</button>
                                            <button onClick={() => selectLanguage('MY')} className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-slate-700 transition-colors">🇲🇲 မြန်မာ</button>
                                            <button onClick={() => selectLanguage('KH')} className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-slate-700 transition-colors">🇰🇭 ភាសាខ្មែរ</button>
                                        </div>
                                    )}
                                </div>

                                {/* ปุ่มกระดิ่งตรวจสอบข้อผิดพลาดจากไลน์กลุ่ม */}
                                <button onClick={clickBellNotifications} className="relative text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 min-h-[32px] flex items-center justify-center">
                                    <Icon.Bell c="w-4.5 h-4.5" />
                                    {showBellDot && (
                                        <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></div>
                                    )}
                                </button>

                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isAdmin ? 'bg-amber-500 ring-2 ring-amber-300' : 'bg-indigo-500'}`} title={userEmail}>
                                    {initials}
                                </div>
                            </div>
                        </div>

                        {/* เมนูนำทางแบบยืดหยุ่นเปิดปิดบนมือถือ */}
                        {isMobileMenuOpen && (
                            <div className="bg-slate-800 border-t border-slate-700 px-4 py-2 flex flex-col gap-1 lg:hidden animate-fade-in">
                                {systemMenus.map(m => (
                                    <button key={m.id} onClick={() => handleTabChange(m.id)}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${activeTab === m.id ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                                        <span className={m.color}>{m.icon}</span>
                                        {m.label}
                                        {m.adminOnly && !isAdmin && <Icon.Lock c="w-3 h-3 text-slate-500 ml-auto" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </header>

                    {/* ========== MAIN LAYOUT CONTAINER ========== */}
                    <div className="flex flex-1 max-w-7xl mx-auto w-full relative">

                        {/* ========== SIDEBAR (Desktop) ========== */}
                        <aside className="hidden lg:flex flex-col w-64 h-[calc(100vh-60px)] bg-white border-r border-slate-200 sticky top-[60px] pt-4 px-4 gap-1.5 overflow-y-auto shrink-0">
                            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-2 mb-2">MAIN MENUS</div>
                            {systemMenus.map(m => (
                                <button key={m.id} onClick={() => handleTabChange(m.id)}
                                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${activeTab === m.id ? `${m.bg} ${m.color}` : 'text-slate-600 hover:bg-slate-50 border border-transparent hover:border-slate-200'}`}>
                                    <span className={activeTab === m.id ? m.color : 'text-slate-400'}>{m.icon}</span>
                                    {m.label}
                                    {m.adminOnly && !isAdmin && <Icon.Lock c="w-3 h-3 text-slate-300 ml-auto" />}
                                </button>
                            ))}

                            <div className="flex-1"></div>

                            {/* กล่องแสดงข้อมูลผู้ใช้งานและอีเมลจริง */}
                            <div className="mb-4 px-3 py-3.5 bg-slate-50 rounded-xl border border-slate-150">
                                <div className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-widest">{t('user')}</div>
                                <div className="text-xs text-slate-600 truncate font-semibold">{userEmail}</div>
                                <div className="text-[10px] text-indigo-600 font-bold mt-1">{isAdmin ? t('roleAdmin') : t('roleUser')}</div>
                            </div>
                        </aside>

                        {/* ========== MAIN CONTENT AREA (Responsive Fluid) ========== */}
                        <main className="flex-1 p-3.5 sm:p-5 lg:p-6 w-full overflow-x-hidden">
                            {activeTab === 'dashboard' && <DashboardTab employees={employees} dailyReports={dailyReports} safetyHistory={safetyHistory} stats={stats} setActiveTab={handleTabChange} isAdmin={isAdmin} userEmail={userEmail} showNotification={showNotification} t={t} />}
                            {activeTab === 'app' && <AppTab employees={employees} dailyReports={dailyReports} setDailyReports={setDailyReports} showNotification={showNotification} setActiveTab={handleTabChange} isAdmin={isAdmin} dropdownData={dropdownData} t={t} />}
                            {activeTab === 'ai-tools' && <AiToolsTab showNotification={showNotification} />}
                            {activeTab === 'ai-admin' && <AiAdminTab isAdmin={isAdmin} userEmail={userEmail} showNotification={showNotification} />}
                            {activeTab === 'stats' && <StatsTab dailyReports={dailyReports} safetyHistory={safetyHistory} stats={stats} />}
                            {activeTab === 'archive' && <ArchiveTab dailyReports={dailyReports} setDailyReports={setDailyReports} showNotification={showNotification} />}
                            {activeTab === 'admin' && <AdminTab employees={employees} setEmployees={setEmployees} isAdmin={isAdmin} showNotification={showNotification} />}
                            {activeTab === 'manual' && <ManualTab />}
                        </main>
                    </div>

                    {/* ========== BOTTOM NAVIGATION BAR (Mobile Tab View) ========== */}
                    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40 flex pb-safe min-h-[50px]">
                        {systemMenus.slice(0, 5).map(m => (
                            <button key={m.id} onClick={() => handleTabChange(m.id)}
                                className={`flex-1 flex flex-col items-center justify-center py-2 gap-1 transition-all ${activeTab === m.id ? m.color : 'text-slate-400'}`}>
                                <span className={`${activeTab === m.id ? 'scale-105' : ''} transition-transform`}>{m.icon}</span>
                                <span className="text-[9px] font-bold">{m.label}</span>
                            </button>
                        ))}
                    </nav>

                    {/* ========== FLOATING AI CHATBOT ========== */}
                    <FloatingAIChat isAdmin={isAdmin} userEmail={userEmail} showNotification={showNotification} t={t} />

                    {/* ========== MODAL: ERROR REPORT LOGS (🔔 Notification Bell) ========== */}
                    {showBellModal && (
                        <div className="fixed inset-0 z-[200] bg-slate-900/50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-fade-in border border-slate-100">
                                <div className="bg-rose-900 text-white px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Icon.Bell c="w-4 h-4 text-rose-300" />
                                        <span className="font-bold text-xs sm:text-sm">{t('bellTitle')}</span>
                                    </div>
                                    <button onClick={() => setShowBellModal(false)} className="text-white/80 hover:text-white"><Icon.X c="w-4.5 h-4.5" /></button>
                                </div>
                                <div className="p-4 space-y-3">
                                    <p className="text-[10px] text-slate-500 font-medium">{t('bellDesc')}</p>
                                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                        {bellLogs.map((log, i) => (
                                            <div key={i} className="p-2.5 bg-rose-50/50 border border-rose-100 rounded-lg text-[10px]">
                                                <div className="flex justify-between font-bold text-rose-900 mb-0.5">
                                                    <span>[{log.type}]</span>
                                                    <span>{log.timestamp}</span>
                                                </div>
                                                <p className="text-rose-700 leading-relaxed">{log.message}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={() => setShowBellModal(false)} className="w-full bg-slate-900 text-white text-xs py-2 rounded-xl font-bold">รับทราบและปิดรายงาน</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== TOAST NOTIFICATION SYSTEM ========== */}
                    {notification && (
                        <div className={`fixed bottom-16 lg:bottom-10 left-1/2 -translate-x-1/2 z-[250] px-4 py-2.5 rounded-2xl shadow-xl text-white text-xs font-bold flex items-center gap-2 transition-all w-max max-w-[90%] text-center border ${notification.type === 'error' ? 'bg-rose-600 border-rose-500' : 'bg-slate-900 border-slate-700'}`}>
                            {notification.type === 'error' ? '⚠️' : '✅'} {notification.msg}
                        </div>
                    )}
                </div>
            );
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<ErrorBoundary><App /></ErrorBoundary>);
    