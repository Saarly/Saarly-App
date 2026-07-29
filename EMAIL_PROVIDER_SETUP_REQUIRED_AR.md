# حالة إرسال البريد في مشروع Saarly

المشروع يستخدم بريد Hostinger الاحترافي عبر SMTP، وليس مطلوبًا إنشاء حساب Resend. المتغير `RESEND_API_KEY` يخص بديل Resend فقط، ولا يُستخدم مع إعداد Hostinger الحالي.

الأسرار المطلوبة موجودة داخل Supabase Edge Functions، ومنها:

```text
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=info@saarly.app
SMTP_PASS=<كلمة مرور صندوق البريد>
EMAIL_FROM_ADDRESS=info@saarly.app
EMAIL_FROM_NAME=Saarly | سعرلي
EMAIL_DISPATCH_SECRET=<secret>
```

الدالة المسؤولة عن الإرسال هي:

```text
process-admin-email-events
```

## إصلاح V9

في V8 كان زر «إعادة محاولة» يعيد الرسالة إلى حالة pending، ثم يحاول تشغيل العامل باستخدام `EMAIL_DISPATCH_SECRET` من بيئة Vercel. السر موجود داخل Supabase، لكنه لم يكن مطلوبًا أن يكون مكررًا في Vercel؛ لذلك بقيت الرسالة «بانتظار المراجعة».

في V9 تستدعي لوحة الأدمن العامل من السيرفر باستخدام `SUPABASE_SERVICE_ROLE_KEY` الموجود بالفعل في Vercel، ثم تعيد قراءة النتيجة وتعرض:

- تم إرسال البريد بنجاح.
- أو سبب الفشل الحقيقي القادم من SMTP.
- أو تنبيه واضح إذا لم يعالج العامل الرسالة.

لا يحتاج هذا الإصلاح إلى SQL أو تعديل قاعدة البيانات أو إنشاء مزود بريد جديد.

## توضيح الأخطاء القديمة

القيمة القديمة `email_provider_not_configured` كانت رسالة عامة لا تحدد أي سر ناقص. في V10 أصبحت الدالة تعرض اسم الإعداد الناقص مثل `smtp_missing:SMTP_PASS`، أو تعرض خطأ Hostinger الحقيقي إذا كانت بيانات الدخول غير صحيحة.
