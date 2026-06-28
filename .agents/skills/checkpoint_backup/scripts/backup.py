import os
import zipfile
import datetime
import glob

def run_backup():
    # กำหนด path ของโปรเจค
    project_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
    backup_dir = os.path.join(project_dir, "backups")
    
    # สร้างโฟลเดอร์ backups ถ้ายังไม่มี
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)
    
    # สร้างชื่อไฟล์
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_filename = os.path.join(backup_dir, f"checkpoint_{timestamp}.zip")
    
    # ไฟล์และโฟลเดอร์ที่ไม่ต้องการ backup
    exclude_dirs = {'.git', 'backups', 'node_modules', '.agents'}
    
    # สร้างไฟล์ zip
    print(f"กำลังสร้างไฟล์แบ็คอัพ: {zip_filename}...")
    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(project_dir):
            # กรองโฟลเดอร์ที่ไม่ต้องการออก
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, project_dir)
                zipf.write(file_path, arcname)
                
    print(f"แบ็คอัพสำเร็จ: {zip_filename}")
    
    # จัดการ Rolling Backup (เก็บสูงสุด 5 ไฟล์)
    backup_files = glob.glob(os.path.join(backup_dir, "checkpoint_*.zip"))
    backup_files.sort(key=os.path.getmtime) # เรียงจากเก่าไปใหม่
    
    if len(backup_files) > 5:
        # มีเกิน 5 ไฟล์ ลบไฟล์ที่เก่าที่สุด
        files_to_delete = backup_files[:-5]
        for f in files_to_delete:
            os.remove(f)
            print(f"ลบไฟล์แบ็คอัพเก่า (Rolling): {os.path.basename(f)}")
    else:
        print(f"ปัจจุบันมีไฟล์แบ็คอัพทั้งหมด {len(backup_files)} ไฟล์ (สูงสุด 5 ไฟล์)")

if __name__ == "__main__":
    run_backup()
