# خريطة صفحات وأفعال لوحة إدارة سعرلي

تاريخ التحديث: 30 يوليو 2026  
مجلد الأدلة: `qa-artifacts\final-20260730-010826`

| الصفحة أو المسار | الأفعال التي تم فحصها | الحالة | الدليل |
|---|---|---|---|
| `/admin/store-catalog` | تفعيل وإيقاف منتج، حذف منتج، إيقاف متجر، استعادة متجر | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| `/admin/categories` | إضافة قسم، تعديل، تفعيل، إيقاف، حذف | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| `/admin/locations` أو صفحة المدن والمناطق | إضافة وتعديل وتفعيل وحذف بلد/محافظة/مدينة | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| `/admin/users` | حظر، فك حظر، تغيير باسورد، حذف حساب QA، التحقق من Auth و`public.users` | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| `/admin/ads` | رفع صورة، إضافة، تعديل، تفعيل، إيقاف، حذف، تنظيف ملف وسجل | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| `/admin/assistant-knowledge` أو صفحة معرفة المساعد | إضافة، تعديل، تفعيل، إيقاف، حذف بيانات QA | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| `/admin/content-moderation` | إضافة، تعديل، تفعيل، إيقاف، حذف، وفحص Confirmation | مثبت فعليا | `last-round\last-round-api-db-qa.json` و`last-round\last-round-cdp-browser-qa.json` |
| `/admin/orders` | البحث، الفلاتر، الفرز، التفاصيل، حالة الدفع، القيم، التصدير | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| `/admin/reports` | تفعيل بيانات Payment transactions وCommissions، تنزيل الملفين، فحصهما، تنظيف البيانات | مثبت فعليا | `last-round\last-round-cdp-browser-qa.json` |
| `/admin/monetization` | الخطط، الخصومات، طرق الدفع، الفترات، المؤسسون، العمولات، البريد | مثبت من جولات سابقة مع إعادة فحص التصدير المالي في الجولة الأخيرة | `monetization-e2e-after-fixes.json` و`last-round\last-round-cdp-browser-qa.json` |
| `/admin/approvals` أو صفحات موافقات المتاجر والفروع | فتح التفاصيل والقبول والرفض ورسائل التأكيد | مثبت فعليا | `approvals-e2e-after-notification-fix.json` و`approvals-rejections-after-notification-fix.json` |
| `/admin/staff` | تعديل صلاحيات QA Support، إزالة وصول Admin Web، إرجاعه، حماية آخر Owner | مثبت فعليا | `staff-permissions-e2e-api-db.json` |
| `/admin/support` | فتح محادثة QA، تعيين، رد، تصنيف، تحويل لشكوى، إغلاق | مثبت فعليا | `support-complaints-e2e-api-db.json` |
| `/admin/complaints` | عرض رسائل الشكوى منفصلة ومرتبة زمنيا حسب المصدر | مثبت فعليا | `browser-complaint-ui-converted-groups.json` و`support-complaints-e2e-api-db.json` |
| `/admin/notifications` | عربي وإنجليزي، جمهور ووجهات، قوالب، حفظ وتحميل وحذف، منع تكرار تشكيل "مرحبا" | مثبت فعليا | `notifications-e2e-api-db.json` |
| `/admin/email` أو تبويب البريد | إعادة إرسال بريد QA ووصوله لمعالجة الأحداث وتحديث السجل | مثبت على مستوى النظام وقاعدة البيانات، وInbox محجوب | `email-retry-e2e-api-db.json` |
| صفحات التصميم العامة | RTL/LTR، الكمبيوتر والموبايل، الوضع الفاتح والداكن، المودالات، التأكيدات، عدم وجود تمرير أفقي | مثبت فعليا | `browser-responsive-rtl-ltr-all-visible-routes.json` و`last-round\last-round-cdp-browser-qa.json` |

## صفحات غير محسوبة كنقص

المسارات التي ليست ظاهرة في القائمة الحالية أو تحتاج صلاحية غير متاحة لم يتم احتسابها كبنود ناقصة لبطاقة الشرح أو لأفعال الواجهة. الأدلة السابقة توثق المسارات التي تم فتحها فعليا من القائمة الظاهرة.

## حدود التحقق

التصدير المالي تم إثباته ببيانات QA مؤقتة ثم تم تنظيفها. البريد تم إثباته حتى مسار المعالجة وتحديث قاعدة البيانات، لكن وصول الرسالة لصندوق البريد نفسه بقي `BLOCKED` بسبب عدم توفر وصول للصندوق.
