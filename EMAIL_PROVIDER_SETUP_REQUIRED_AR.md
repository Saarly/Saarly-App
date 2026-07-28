# إعداد إرسال رسائل الموافقة بالبريد

## السبب المؤكد للمشكلة

أحداث قبول ورفض المتاجر والفروع تُنشأ بنجاح داخل جدول `admin_email_events`، لكن محاولات الإرسال الحالية تنتهي بالخطأ:

```text
email_provider_not_configured
```

هذا يعني أن إشعار التطبيق وقاعدة البيانات يعملان، لكن مشروع Supabase لا يحتوي على بيانات مزود بريد حقيقية. لا يمكن للتطبيق أو لوحة الأدمن اختراع مفتاح إرسال بريد.

## اختيار 1: Resend

أضف أسرار Edge Function التالية في Supabase:

```text
EMAIL_PROVIDER=resend
RESEND_API_KEY=<real key>
EMAIL_FROM_ADDRESS=<verified sender address>
EMAIL_FROM_NAME=Saarly | سعرلي
MERCHANT_PORTAL_URL=https://your-domain.example
```

ويجب أن يكون النطاق أو عنوان المرسل موثقًا لدى Resend.

## اختيار 2: SMTP

```text
EMAIL_PROVIDER=smtp
SMTP_HOST=<smtp host>
SMTP_PORT=465
SMTP_USER=<smtp user>
SMTP_PASS=<smtp password>
EMAIL_FROM_ADDRESS=<sender address>
EMAIL_FROM_NAME=Saarly | سعرلي
MERCHANT_PORTAL_URL=https://your-domain.example
```

## تشغيل العامل

الدالة المسؤولة هي:

```text
process-admin-email-events
```

وهي تقبل مصادقة Service Role أو `EMAIL_DISPATCH_SECRET`. بعد ضبط المزود وتشغيل العامل، يلتقط النظام تلقائيًا الأحداث ذات الحالة `pending` أو `failed` ما دامت لم تتجاوز حد المحاولات؛ فلا يلزم إنشاء حدث جديد لنفس القرار.

## ما تم تأمينه في هذا الإصدار

- قرار قبول المتجر لا يفشل إذا فشل البريد.
- لوحة الأدمن تعرض تحذيرًا واضحًا بعد حفظ القرار بدل إخفاء مشكلة البريد.
- الفرع الرئيسي لا ينتج رسالة فرع منفصلة؛ رسالة المتجر وحدها هي التي تُرسل.
- الأحداث تستخدم مفتاح منع تكرار، فلا تُرسل الرسالة نفسها مرتين لنفس القرار.
