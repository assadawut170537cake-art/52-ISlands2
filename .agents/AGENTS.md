> **Auto-Update Document:** Whenever you modify or add features to the project codebase, you MUST review and update the `PROJECT_STRUCTURE.md` file to ensure it accurately reflects the current structure, functions, and logic of the project.
> **GAS Synchronous Execution:** Google Apps Script natively supports synchronous APIs. Do NOT use `async/await` to wrap GAS APIs (like `SpreadsheetApp`, `CacheService`) or top-level handlers like `doPost(e)`, as this can lead to premature termination before the Promises resolve.

- **Strict Project Isolation**: ห้ามทำงานข้ามโปรเจกต์เด็ดขาด (Cross-project execution) ตรวจสอบ Path ของ Active Document เสมอก่อนรันสคริปต์, แก้ไขไฟล์, หรือ Deploy เพื่อป้องกันการปนเปื้อนของข้อมูล
