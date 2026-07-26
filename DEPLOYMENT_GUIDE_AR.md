# دليل تشغيل Admin Web بعد الإصلاح

## الترتيب المطلوب

1. خذ Backup من Supabase.
2. طبّق `APPLY_IN_SUPABASE_SQL_EDITOR.sql` من حزمة الإصلاح النهائية.
3. شغّل `VERIFY_AFTER_APPLY.sql`.
4. انشر `process-admin-email-events` و`send-approval-email` واضبط أسرارهما.
5. ضع متغيرات Admin Web.
6. شغّل الاختبارات والبناء.
7. انشر لوحة الأدمن قبل إتاحة بوابة المتاجر للمستخدمين.

## متغيرات البيئة

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
RESEND_API_KEY
RESEND_FROM_EMAIL
EMAIL_DISPATCH_SECRET
```

لا تضع Service Role أو أسرار البريد في متغير يبدأ بـ`NEXT_PUBLIC_`.

## فحوصات ما قبل النشر

```powershell
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
```

## سيناريو اختبار ضروري

- قبول وجه وظهر بطاقة مدير المتجر.
- قبول متجر والتأكد من وصول إشعار وبريد واحد فقط.
- رفض فرع والتأكد من ظهور السبب كاملًا.
- إرسال طلب دفع يدوي من بوابة المتاجر.
- منع تغيير الخطة بعد بدء المراجعة.
- قبول طلب الدفع والتأكد من تمديد الاشتراك مرة واحدة.
- الضغط مرتين على القبول والتأكد من عدم التمديد أو إرسال البريد مرتين.
- إيقاف متجر والتأكد من بقاء `approval_status = approved` مع توقف استقبال الطلبات.
- إعادة محاولة بريد فاشل والتأكد أن Dispatcher الحقيقي استُدعي.
