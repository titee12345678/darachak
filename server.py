#!/usr/bin/env python3
"""เซิร์ฟเวอร์สำหรับพัฒนา — ส่ง no-cache กันไฟล์ JS เก่าค้างใน browser
ใช้แทน python3 -m http.server:  python3 server.py [port]
"""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5556


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # บังคับ browser ตรวจไฟล์ใหม่ทุกครั้ง — โมดูล JS หลายไฟล์
        # จะไม่มีทางเวอร์ชันปนกันจน app ค้างหน้าโหลด
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

    def log_message(self, fmt, *args):  # เงียบ log ปกติ
        pass


if __name__ == '__main__':
    with http.server.ThreadingHTTPServer(('', PORT), NoCacheHandler) as httpd:
        print(f'serving at http://localhost:{PORT} (no-cache)')
        httpd.serve_forever()
