# أدلة الانحدار والاختبار

تاريخ التحديث: 30 يوليو 2026  
مجلد الأدلة: `qa-artifacts\final-20260730-010826`

## أوامر الجولة الأخيرة

| الأمر | الملف | النتيجة |
|---|---|---|
| `npm run typecheck` | `last-round\npm-typecheck-last-round.log` | ناجح |
| `npm test` | `last-round\npm-test-last-round.log` | 89 ناجح، 0 فشل |
| `npm run lint` | `last-round\npm-lint-last-round.log` | 0 أخطاء، 17 تحذير |
| `npm run build` | `last-round\npm-build-last-round.log` | ناجح |
| فحص المتصفح بعد البناء | `last-round\last-round-cdp-browser-qa.json` | ناجح عبر Chrome CDP |

## اختبارات Regression المضافة

الملف المعدل: `tests\admin-security.test.mjs`

| الاختبار | ما الذي يمنعه |
|---|---|
| `decision notifications avoid partial unique-index upsert conflicts` | يمنع رجوع مشكلة تكرار مفتاح إشعار قرارات الموافقة والرفض |
| `percentage discounts keep blank cash amount as null` | يمنع رجوع مشكلة حفظ خصم نسبة مع ترك الخصم النقدي فارغا |

الدليل: `last-round\npm-test-last-round.log` يثبت أن عدد الاختبارات أصبح 89 وأنها كلها نجحت.

## تحذيرات useEffect الخمسة

تمت مراجعة التحذيرات من الكود نفسه، وليس اعتمادا على نجاح البناء فقط.

| الملف | التحذير | القرار |
|---|---|---|
| `src\components\admin-console.tsx:172` | `loadProfile` غير موجود في dependencies | آمن حاليا لأن effect مسؤول عن تحميل جلسة البداية وتسجيل listener واحد لتغييرات Auth. إضافة الدالة ستسبب إعادة اشتراك وإعادة تحميل غير لازمة بدون تغيير سلوك مقصود. |
| `src\components\monetization-console.tsx:929` | `load` غير موجود في dependencies | آمن حاليا لأن التحميل الأولي يتم مرة واحدة، وباقي التحديثات تتم من أزرار وإجراءات صريحة داخل الصفحة. |
| `src\components\notification-broadcast.tsx:525` | `loadTemplates` و`loadUsers` غير موجودين في dependencies | آمن حاليا لأن effect يعمل كتحميل أولي للقوائم والقوالب، وبعد الحفظ أو الحذف أو الإرسال يتم تحديث البيانات من مسارات الإجراءات نفسها. |
| `src\components\staff-management.tsx:315` | `loadStaff` غير موجود في dependencies | آمن حاليا لأن التحميل الأولي مرة واحدة، وإجراءات الإضافة والتعديل والحذف وتغيير الباسورد تعيد تحميل الفريق صراحة. |
| `src\components\store-catalog-moderation.tsx:333` | `loadProducts` و`selectedStore` غير موجودين في dependencies | آمن حاليا لأن تحميل المنتجات مربوط بـ `selectedStore?.id` فقط. استخدام كائن المتجر كله سيعيد التحميل بسبب تغير هوية الكائن بدون تغير المتجر. |

لم أصلح هذه التحذيرات في الجولة الحالية حتى لا يتغير سلوك الصفحات بدون داع، ولأن طلب الجولة كان محصورا وبدون Refactor. التحذيرات بقيت ظاهرة في lint ولم يتم إخفاؤها.

## تحذيرات lint كلها

ملف الدليل: `last-round\npm-lint-last-round.log`

| النوع | العدد | الحالة |
|---|---:|---|
| `react-hooks/exhaustive-deps` | 5 | تمت مراجعتها وتوثيق سبب الأمان أعلاه |
| `@next/next/no-img-element` | 11 | تحذيرات أداء صور، لا تكسر السلوك الحالي |
| `eslint-disable` غير مستخدم | 1 | تنظيفه ممكن لاحقا، لكنه ليس خطأ سلوك |
| أخطاء lint | 0 | لا توجد أخطاء |

## package.json وeslint.config.mjs

المجلد الحالي ليس Git repository، لذلك لا يوجد `git diff` حقيقي يمكن عرضه من هذا المسار أو من المجلدات الأب. تم فحص محتوى الملفين الحاليين بدلا من ذلك.

حالة `package.json`:

- سكريبت `lint` ما زال `eslint .`.
- سكريبت `test` ما زال `node --test tests`.
- سكريبت `build` ما زال `next build`.
- لم يتم إضافة Playwright أو إخفاء الاختبارات عبر dependency جديدة.

حالة `eslint.config.mjs`:

- يستخدم `eslint-config-next/core-web-vitals`.
- القاعدة الوحيدة المغلقة صراحة هي `react-hooks/set-state-in-effect`.
- قاعدة `react-hooks/exhaustive-deps` ليست مغلقة، ولذلك ظهرت تحذيرات useEffect الخمسة في lint.
- قاعدة `@next/next/no-img-element` ليست مغلقة، ولذلك ظهرت تحذيرات الصور.
- التجاهل محصور في `qa-artifacts/**` و`.vercel/**` و`supabase/functions/**`.

النتيجة: لم يتم تعطيل Rule لإخفاء أخطاء الجولة، والتحذيرات ما زالت ظاهرة ومراجعة.

## أدلة Excel

ملف الدليل: `last-round\last-round-cdp-browser-qa.json`

تم تنزيل الملفين التاليين من أزرار الواجهة بعد زرع بيانات QA مؤقتة:

| الملف | النتيجة |
|---|---|
| `admin_report_payment_transactions.xlsx` | XLSX حقيقي، يحتوي النص المتوقع، Auto Filter، Freeze Header، Wrap Text، ولا توجد إشارة Repair |
| `admin_report_commission_dues.xlsx` | XLSX حقيقي، يحتوي النص المتوقع، Auto Filter، Freeze Header، Wrap Text، ولا توجد إشارة Repair |

تم تنظيف البيانات المؤقتة بعد الفحص، والدليل: `last-round\last-round-financial-export-cleanup.json`.

## أدلة التصميم والمتصفح

ملف الدليل: `last-round\last-round-cdp-browser-qa.json`

تم فحص:

- كمبيوتر إنجليزي داكن.
- كمبيوتر عربي فاتح.
- موبايل إنجليزي فاتح.
- موبايل عربي داكن.
- اتجاه العربي يمين، واتجاه الإنجليزي شمال.
- المودالات داخل الشاشة.
- نوافذ التأكيد تظهر ويتم رفضها بدون تغيير بيانات.
- لا يوجد تمرير أفقي غير مقصود.
- لا توجد أخطاء Console.
- لا توجد أخطاء Network حقيقية.

توجد طلبات `net::ERR_ABORTED` ملغاة أثناء التنقل، وتم فصلها عن أخطاء الشبكة لأنها طلبات ملغاة من المتصفح عند تغيير الصفحة وليست فشل API.

## أدلة قاعدة البيانات والتنظيف

| الملف | ما الذي يثبته |
|---|---|
| `last-round\last-round-api-db-qa.json` | 9 مجموعات فحص فعلية، كلها مثبتة، ولا يوجد بند محجوب داخلها |
| `last-round\last-round-financial-export-seed.json` | زرع بيانات مؤقتة لتفعيل تصدير المدفوعات والعمولات |
| `last-round\last-round-financial-export-cleanup.json` | تنظيف سجل الدفع والعمولة والمستخدم المؤقت من Auth و`public.users` |

## البريد

تم إثبات إعادة إرسال بريد QA ووصوله إلى مسار معالجة الأحداث وتحديث سجل البريد في `email-retry-e2e-api-db.json`.

التحقق من وصول الرسالة فعليا إلى صندوق بريد QA نفسه بقي `BLOCKED` لأن البيئة لا توفر وصولا لصندوق البريد أو إضافة بريد متصلة. لذلك لا يتم احتساب البريد Inbox كبند مثبت فعليا.
