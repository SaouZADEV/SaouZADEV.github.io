# Supabase Setup

โปรเจกต์นี้ใช้ `Supabase Auth + Postgres + Realtime` กับหน้าเว็บ static บน GitHub Pages

## 1. สร้าง Supabase project

สร้างโปรเจกต์ใหม่ใน [Supabase Dashboard](https://supabase.com/dashboard/projects)

## 2. รัน SQL

เปิด `SQL Editor` แล้วรันไฟล์ [schema.sql](/C:/Users/User/Documents/_projects/SaouZADEV.github.io/supabase/schema.sql)

ถ้ายังไม่ได้รันขั้นตอนนี้ หน้าเว็บจะขึ้นข้อความประมาณ `Could not find the table 'public.fundraising_summary' in the schema cache` หรือ `PGRST205`

สิ่งที่จะถูกสร้าง:

- ตาราง `public.fundraising_donations`
- ตาราง `public.fundraising_summary`
- trigger ที่สรุปยอดให้อัตโนมัติเมื่อ insert / update / delete
- RLS policies
- realtime publication สำหรับ 2 ตารางนี้

## 3. สร้างผู้ใช้แอดมิน

เปิด `Authentication` แล้วสร้างผู้ใช้แบบ Email/Password สำหรับคนที่มีสิทธิ์อัปเดตยอด

คำแนะนำ:

- ปิด public signups ถ้าคุณไม่อยากให้ใครสมัครเพิ่มเอง
- ใช้บัญชีแอดมินเฉพาะสำหรับหน้า [admin.html](/C:/Users/User/Documents/_projects/SaouZADEV.github.io/admin.html)

## 4. คัดลอก Project URL และ anon key

เปิด `Project Settings` > `Data API`

คัดลอก:

- `Project URL`
- `anon / publishable key`

## 5. ใส่ค่าลง config

เปิด [fundraising-config.js](/C:/Users/User/Documents/_projects/SaouZADEV.github.io/fundraising-config.js) แล้วใส่ค่า:

```js
window.FUNDRAISING_CONFIG = {
  goalAmount: 1000000,
  supabase: {
    url: 'https://YOUR-PROJECT.supabase.co',
    anonKey: 'YOUR-ANON-KEY',
    summaryTable: 'fundraising_summary',
    donationsTable: 'fundraising_donations',
    summaryRowId: 1,
    enableRealtime: true,
    pollIntervalMs: 15000,
  },
};
```

## 6. วิธีใช้งาน

- หน้า [index.html](/C:/Users/User/Documents/_projects/SaouZADEV.github.io/index.html) อ่านสรุปยอดจาก `fundraising_summary`
- หน้า [admin.html](/C:/Users/User/Documents/_projects/SaouZADEV.github.io/admin.html) ใช้ Supabase Auth เพื่อ login
- เมื่อเพิ่มหรือลบรายการใน `fundraising_donations` trigger จะอัปเดต `fundraising_summary` ให้อัตโนมัติ

## หมายเหตุด้านความปลอดภัย

- หน้า public ใช้ `anon key` ได้ เพราะการอ่านถูกจำกัดด้วย RLS
- ตาราง `fundraising_donations` เปิดสิทธิ์เฉพาะ `authenticated`
- ถ้าคุณเปิดให้คนสมัครสมาชิกเอง ทุกคนที่ login ได้จะมีสิทธิ์จัดการยอดตาม policy ปัจจุบัน

ดังนั้นถ้าใช้ policy ชุดนี้:

- ปิด public signup
- สร้าง user แอดมินเองจาก dashboard เท่านั้น

## เอกสารทางการ

- [JavaScript client](https://supabase.com/docs/reference/javascript/installing)
- [Auth: signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [Auth: onAuthStateChange](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
