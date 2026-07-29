# إصلاح Build لتصدير Excel

تم إصلاح تعارض TypeScript 6 مع `BlobPart` داخل `src/lib/admin/excel.ts`.

بدل تمرير `Uint8Array<ArrayBufferLike>` مباشرة إلى `Blob`، يتم الآن نسخ كل جزء إلى `ArrayBuffer` صريح قبل إنشاء ملف XLSX.

لا يوجد تغيير في بيانات التقارير أو تنسيق ملفات Excel.
