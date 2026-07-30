# قائمة تحقق لوحة إدارة سعرلي

تاريخ التحديث: 30 يوليو 2026  
النطاق: آخر جولة محصورة على البنود غير المثبتة  
مجلد الأدلة: `qa-artifacts\final-20260730-010826`

## قائمة البنود

| البند | الحالة | الدليل |
|---|---|---|
| مراجعة المتاجر والمنتجات: تفعيل، إيقاف، حذف منتج، إيقاف متجر، استعادة متجر | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| الأقسام: إضافة، تعديل، تفعيل، إيقاف، حذف | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| المدن والمناطق: بلد، محافظة، مدينة، إضافة وتعديل وتفعيل وحذف | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| المستخدمون: حظر وفك حظر وتغيير باسورد وحذف حساب QA | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| التحقق من حذف مستخدم QA في Auth و`public.users` | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| الإعلانات: رفع صورة QA وإضافة وتعديل وتفعيل وإيقاف وحذف | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| تنظيف ملف الإعلان وسجله بعد الاختبار | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| معرفة المساعد: إضافة وتعديل وتفعيل وإيقاف وحذف | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| مراقبة المحتوى: إضافة وتعديل وتفعيل وإيقاف وحذف | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| الطلبات: البحث والفلاتر والفرز والتفاصيل | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| الطلبات: حالات الدفع والقيم والتصدير | مثبت فعليا | `last-round\last-round-api-db-qa.json` |
| Pagination وLoading وEmpty وError وRetry في الصفحات الموجودة | تم فحصها ضمن جولات الواجهة والبيانات | `browser-responsive-rtl-ltr-all-visible-routes.json` و`last-round\last-round-cdp-browser-qa.json` |
| إنشاء بيانات QA مؤقتة لتفعيل Payment transactions | مثبت فعليا | `last-round\last-round-financial-export-seed.json` |
| إنشاء بيانات QA مؤقتة لتفعيل Commissions | مثبت فعليا | `last-round\last-round-financial-export-seed.json` |
| تنزيل ملف Payment transactions من الزر الفعلي | مثبت فعليا | `last-round\last-round-cdp-browser-qa.json` |
| تنزيل ملف Commissions من الزر الفعلي | مثبت فعليا | `last-round\last-round-cdp-browser-qa.json` |
| فتح ملفي XLSX برمجيا والتأكد أنهما لا يحتاجان Repair | مثبت فعليا | `last-round\last-round-cdp-browser-qa.json` |
| التحقق من الأعمدة والقيم وFreeze Header وAuto Filter وWrap Text | مثبت فعليا | `last-round\last-round-cdp-browser-qa.json` |
| تنظيف بيانات Payment transactions وCommissions المؤقتة | مثبت فعليا | `last-round\last-round-financial-export-cleanup.json` |
| وصول البريد العربي والإنجليزي إلى صندوق بريد QA نفسه | BLOCKED | لا يوجد وصول Inbox في البيئة الحالية |
| مسار إعادة إرسال البريد ووصوله لمعالجة الأحداث | مثبت على مستوى النظام وقاعدة البيانات | `email-retry-e2e-api-db.json` |
| اختبار تكرار مفتاح إشعار الموافقة والرفض | مثبت باختبار مستقل | `last-round\npm-test-last-round.log` |
| اختبار حفظ خصم نسبة مع ترك الخصم النقدي فارغا | مثبت باختبار مستقل | `last-round\npm-test-last-round.log` |
| عدد الاختبارات أصبح أكبر من 87 | مثبت | `last-round\npm-test-last-round.log`، النتيجة 89 |
| مراجعة تحذيرات useEffect الخمسة | تمت مراجعتها من الكود | `ADMIN_WEB_REGRESSION_EVIDENCE.md` |
| إثبات عدم تعطيل قواعد lint | مثبت بالمحتوى الحالي والتحذيرات الظاهرة | `eslint.config.mjs` و`last-round\npm-lint-last-round.log` |
| فحص الوضع الفاتح والداكن | مثبت فعليا | `last-round\last-round-cdp-browser-qa.json` |
| فحص المودالات والتأكيدات على الكمبيوتر والموبايل | مثبت فعليا | `last-round\last-round-cdp-browser-qa.json` |
| عدم وجود أخطاء Console أو Network حقيقية | مثبت فعليا | `last-round\last-round-cdp-browser-qa.json` |
| `npm run typecheck` | ناجح | `last-round\npm-typecheck-last-round.log` |
| `npm test` | ناجح، 89 اختبار | `last-round\npm-test-last-round.log` |
| `npm run lint` | ناجح مع 17 تحذير و0 أخطاء | `last-round\npm-lint-last-round.log` |
| `npm run build` | ناجح | `last-round\npm-build-last-round.log` |
| Playwright | BLOCKED | غير مثبت في المشروع، وتم استخدام Chrome CDP بدلا منه مع دليل مستقل |

## ملاحظات مهمة

- لا يوجد بند قاعدة بيانات في الجولة الأخيرة متروك بدون تنظيف.
- لم يتم استخدام بيانات حقيقية خارج نطاق QA.
- فتح الصفحة وحده لم يتم احتسابه كإثبات نهائي لأي إجراء يغير بيانات.
- بند البريد لا يمكن اعتباره مثبتا من صندوق الوارد بدون وصول فعلي لصندوق البريد.
