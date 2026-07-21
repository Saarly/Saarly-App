const fs = require('fs');
const path = require('path');

const filesToProcess = [
  'dashboard-panel.tsx', 'data-section.tsx', 'notification-broadcast.tsx',
  'reports-panel.tsx', 'settings-panel.tsx', 'staff-management.tsx',
  'store-catalog-moderation.tsx', 'support-console.tsx'
].map(f => path.join('src/components', f)).concat([
  'i18n.ts', 'messages.ts', 'sections.ts'
].map(f => path.join('src/lib/admin', f)));

const dictionary = {
"Users": "المستخدمون",
"Stores": "المتاجر",
"Pending stores": "متاجر معلقة",
"Pending branches": "فروع معلقة",
"Awaiting confirmation": "بانتظار التأكيد",
"Open support chats": "محادثات دعم مفتوحة",
"Dashboard": "لوحة التحكم",
"A quick view of what needs attention today.": "نظرة سريعة على ما يحتاج للانتباه اليوم.",
"Operational alerts": "تنبيهات تشغيلية",
"Shortcuts": "اختصارات",
"Stores awaiting approval": "متاجر بانتظار الموافقة",
"Branches awaiting approval": "فروع بانتظار الموافقة",
"Delete account": "حذف الحساب",
"Review details": "مراجعة التفاصيل",
"Approve": "قبول",
"Reject": "رفض",
"Block": "حظر",
"Unblock": "فك الحظر",
"Toggle": "تغيير الحالة",
"Edit": "تعديل",
"Additional details": "تفاصيل إضافية",
"Send notification": "إرسال إشعار",
"Location targeting": "استهداف الموقع",
"Country": "الدولة",
"All countries": "كل الدول",
"Governorate": "المحافظة",
"All governorates": "كل المحافظات",
"City": "المدينة",
"All cities": "كل المدن",
"Arabic title": "العنوان بالعربي",
"English title": "العنوان بالإنجليزي",
"Arabic body": "النص بالعربي",
"English body": "النص بالإنجليزي",
"Selected destination:": "الوجهة المحددة:",
"Orders report": "تقرير الطلبات",
"Most active stores": "المتاجر الأكثر نشاطاً",
"Most requested categories": "الأقسام الأكثر طلباً",
"Offers chosen by buyers": "العروض المختارة من المشترين",
"Manual RFQ requests": "طلبات تسعير يدوية",
"Store dues": "مستحقات المتاجر",
"Invites and rewards": "الدعوات والمكافآت",
"Admin summaries": "ملخصات الإدارة",
"Reports": "التقارير",
"CSV": "CSV",
"No extra details": "لا توجد تفاصيل إضافية",
"Info": "معلومات",
"Buyer": "المشتري",
"Store": "المتجر",
"Category": "القسم",
"Categories": "الأقسام",
"Stores count": "عدد المتاجر",
"Orders count": "عدد الطلبات",
"Status": "الحالة",
"Order total": "إجمالي الطلب",
"Gross sales": "إجمالي المبيعات",
"Commissions due": "العمولات المستحقة",
"Commission": "العمولة",
"Confirmed orders": "طلبات مؤكدة",
"Order coverage": "نسبة تغطية الطلب",
"Offer price": "سعر العرض",
"Offer rank": "ترتيب العرض",
"Current due": "المستحق حالياً",
"Unpaid months": "أشهر غير مدفوعة",
"Grace period": "فترة السماح",
"Confirmed registrations": "تسجيلات مؤكدة",
"Required target": "الهدف المطلوب",
"Invite link": "رابط الدعوة",
"Referral code": "كود الإحالة",
"Reward": "المكافأة",
"Delivery": "التوصيل",
"Referrer email": "بريد المُحيل",
"Accepted at": "تاريخ القبول",
"Confirmed at": "تاريخ التأكيد",
"Created at": "تاريخ الإنشاء",
"Last order": "آخر طلب",
"Average rating": "متوسط التقييم",
"Responses": "الردود",
"Submitted responses": "ردود مقدمة",
"Priced responses": "ردود مسعرة",
"Accepted total": "إجمالي المقبول",
"Yes": "نعم",
"T-shirt": "تيشيرت",
"Football": "كرة قدم",
"Cap": "كاب",
"Add": "إضافة",
"Active reward": "مكافأة مفعلة",
"Arabic": "عربي",
"English": "إنجليزي",
"Active": "مفعل",
"Delete": "حذف",
"Team permissions": "صلاحيات الفريق",
"Audit log": "سجل الحركات",
"Merchant approvals": "موافقات المتاجر",
"Branch approvals": "موافقات الفروع",
"Store catalog moderation": "مراقبة منتجات المتاجر",
"Shipping companies": "شركات الشحن",
"Cities and areas": "المدن والمناطق",
"Orders": "الطلبات",
"Support chats": "محادثات الدعم",
"Complaints": "الشكاوى",
"Bot knowledge base": "قاعدة معرفة البوت",
"Content moderation": "مراقبة المحتوى",
"Low confidence matches": "تطابقات غير مؤكدة",
"AI reads": "قراءات الذكاء الاصطناعي",
"Send notifications": "إرسال إشعارات",
"Ads": "الإعلانات",
"Monetization": "تحقيق الدخل",
"Payments": "المدفوعات",
"Referrals": "الإحالات",
"Staff account created with permissions.": "تم إنشاء حساب الموظف بصلاحياته.",
"Staff permissions updated.": "تم تحديث صلاحيات الموظف.",
"Account enabled.": "تم تفعيل الحساب.",
"Enter a new password for this account": "أدخل كلمة مرور جديدة لهذا الحساب",
"Confirm the new password": "أكد كلمة المرور الجديدة",
"Passwords do not match.": "كلمات المرور غير متطابقة.",
"Password updated.": "تم تحديث كلمة المرور.",
"Admin team control": "تحكم فريق الإدارة",
"Team and permissions": "الفريق والصلاحيات",
"Add new staff": "إضافة موظف جديد",
"Name": "الاسم",
"Rank name": "اسم الرتبة",
"Example: Store manager": "مثال: مدير المتاجر",
"Email": "البريد الإلكتروني",
"Mobile": "رقم الجوال",
"Password": "كلمة المرور",
"Confirm password": "تأكيد كلمة المرور",
"Create account": "إنشاء حساب",
"Current team": "الفريق الحالي",
"Disable": "تعطيل",
"Edit rank and permissions": "تعديل الرتبة والصلاحيات",
"Limited admin": "مدير محدود",
"Can use the dashboard based on the checked permissions.": "يمكنه استخدام لوحة التحكم بناءً على الصلاحيات المحددة.",
"Support agent": "موظف دعم",
"Best for support, complaints, and chats.": "مناسب للدعم، الشكاوى، والمحادثات.",
"Full-permission admin": "مدير بصلاحيات كاملة",
"Can see and control everything.": "يمكنه رؤية والتحكم في كل شيء.",
"Full admin": "مدير كامل",
"All permissions": "جميع الصلاحيات",
"No permissions selected": "لم يتم تحديد أي صلاحيات",
"Write store suspension reason": "اكتب سبب إيقاف المتجر",
"Visual moderation": "المراقبة البصرية",
"Store and product moderation": "مراقبة المتاجر والمنتجات",
"Search stores": "البحث في المتاجر",
"Suspend store": "إيقاف المتجر",
"Delete store": "حذف المتجر",
"Search store products": "البحث في منتجات المتجر",
"No image": "بدون صورة",
"Visible": "ظاهر",
"Deactivate": "تعطيل",
"Choose a store to review": "اختر متجراً لمراجعته",
"Customer": "عميل",
"Bot": "بوت",
"Support": "الدعم",
"System": "النظام",
"Transferred to support": "محول للدعم",
"With bot": "مع البوت",
"Unassigned": "غير معين",
"Conversations": "المحادثات",
"Support chat": "محادثة الدعم",
"Handled by: ": "بواسطة: ",
"Choose a conversation": "اختر محادثة",
"Replies arrive through Realtime.": "الردود تصل مباشرة.",
"Saarly Admin": "إدارة سعرلي",
"Admin sign in": "تسجيل دخول الإدارة",
"Sign in": "تسجيل الدخول",
"Send magic link": "إرسال الرابط",
"Sign out": "تسجيل الخروج",
"Search": "بحث",
"Refresh": "تحديث",
"Save": "حفظ",
"Cancel": "إلغاء",
"Rejection reason": "سبب الرفض",
"Loading...": "جاري التحميل...",
"No data yet": "لا توجد بيانات",
"Support queue": "طابور الدعم",
"Write reply": "اكتب رداً",
"Assign to me": "تعيين لي",
"Close conversation": "إغلاق المحادثة",
"Open section": "فتح القسم",
"Connected to Supabase data": "متصل ببيانات قاعدة البيانات",
"Theme": "المظهر",
"Language": "اللغة",
"Light": "فاتح",
"Dark": "داكن",
"Waiting for store confirmation": "بانتظار تأكيد المتجر",
"Confirmed": "مؤكد",
"Cancelled by store": "ملغى من المتجر",
"Cancelled by buyer": "ملغى من المشتري",
"Completed": "مكتمل",
"Pending": "قيد الانتظار",
"Processing": "جاري المعالجة",
"Succeeded": "ناجح",
"Failed": "فشل",
"Due": "مستحق",
"Paid": "مدفوع",
"Inactive": "غير نشط",
"Approved": "مقبول",
"Rejected": "مرفوض",
"Submitted": "مقدم",
"Open": "مفتوح",
"Closed": "مغلق",
"Enter the country name first.": "أدخل اسم الدولة أولاً.",
"Owner": "المالك",
"Owner mobile": "جوال المالك",
"Created": "تاريخ الإنشاء",
"Branch": "الفرع",
"Branch contact": "رقم الفرع",
"Shipping Companies": "شركات الشحن",
"Company": "الشركة",
"Batches count": "عدد الدفعات",
"Role": "الصلاحية",
"Account": "الحساب",
"Arabic name": "الاسم بالعربي",
"English name": "الاسم بالإنجليزي",
"Parent": "الرئيسي",
"Order": "الترتيب",
"Currency": "العملة",
"Currency code": "رمز العملة",
"Contact": "رقم التواصل",
"Approval": "الموافقة",
"Billing": "الفواتير",
"Updated": "تاريخ التحديث",
"Payment": "الدفع",
"Subtotal": "المجموع الفرعي",
"Date": "التاريخ",
"Requested": "المطلوب",
"Matched": "المطابق",
"Total": "الإجمالي",
"Confidence": "نسبة التأكد",
"User": "المستخدم",
"Reading type": "نوع القراءة",
"Source": "المصدر",
"Error code": "رمز الخطأ",
"Reporter": "المُبلغ",
"Title": "العنوان",
"Type": "النوع",
"Priority": "الأولوية",
"Needs embedding": "يحتاج لتضمين",
"Term": "الكلمة",
"Match type": "نوع التطابق",
"Action": "الإجراء",
"Provider": "مزود الخدمة",
"Amount": "المبلغ",
"Referrals and rewards": "الإحالات والمكافآت",
"Referrer": "المُحيل",
"Rewarded user": "المستخدم المُكافأ",
"Code": "الكود",
"Audit logs": "سجل الحركات",
"Actor": "الفاعل",
"Table": "الجدول",
"Target": "الهدف"
};

const otherFixes = [
  [/`\$\{format\(pendingMerchantsCount\)\}.*`/g, '`${format(pendingMerchantsCount)} متجراً بانتظار الموافقة.`'],
  [/`\$\{format\(pendingBranchesCount\)\}.*`/g, '`${format(pendingBranchesCount)} فرعاً بانتظار الموافقة.`'],
  [/`\$\{format\(awaitingOrdersCount\)\}.*`/g, '`${format(awaitingOrdersCount)} طلباً بانتظار تأكيد المتجر.`'],
  [/`\$\{format\(openSupportChatsCount\)\}.*`/g, '`${format(openSupportChatsCount)} محادثة دعم مفتوحة.`'],
  [/\? "[^\"]*"\s*:\s*"No operational alerts at the moment\."/g, '? "لا توجد تنبيهات تشغيلية في الوقت الحالي." : "No operational alerts at the moment."'],
  [/"[^"]+"\s*:\s*"Nothing here yet"/g, '"لا توجد بيانات متاحة حالياً" : "Nothing here yet"'],
  [/const DEFAULT_COUNTRY_AR = "[^"]*";/g, 'const DEFAULT_COUNTRY_AR = "مصر";'],
  [/ar:\s*"[^"]*",\s*en:\s*"Open link"/g, 'ar: "رابط خارجي", en: "Open link"'],
  [/hintAr:\s*"[^"]*",\s*hintEn:\s*"URL of the link"/g, 'hintAr: "الرابط الخارجي", hintEn: "URL of the link"'],
  [/ar:\s*"[^"]*",\s*en:\s*"In-app route"/g, 'ar: "رابط داخلي", en: "In-app route"'],
  [/hintAr:\s*"[^"]*",\s*hintEn:\s*"Path inside the app"/g, 'hintAr: "الرابط الداخلي", hintEn: "Path inside the app"'],
  [/ar:\s*"[^"]*",\s*en:\s*"Navigate to screen"/g, 'ar: "توجيه لشاشة", en: "Navigate to screen"'],
  [/hintAr:\s*"[^"]*",\s*hintEn:\s*"Screen name"/g, 'hintAr: "اسم الشاشة", hintEn: "Screen name"'],
  [/ar:\s*"[^"]*",\s*en:\s*"Popup message"/g, 'ar: "رسالة منبثقة", en: "Popup message"'],
  [/hintAr:\s*"[^"]*",\s*hintEn:\s*"Shows a popup dialogue when the user opens the app."/g, 'hintAr: "تظهر رسالة منبثقة للمستخدم فور فتح التطبيق.", hintEn: "Shows a popup dialogue when the user opens the app."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Dismiss"/g, 'ar: "إخفاء الإشعار", en: "Dismiss"'],
  [/hintAr:\s*"[^"]*",\s*hintEn:\s*"Dismisses the notification from the tray."/g, 'hintAr: "يقوم بإخفاء الإشعار من قائمة الإشعارات.", hintEn: "Dismisses the notification from the tray."'],
  [/hintAr:\s*"[^"]*",\s*hintEn:\s*"Forces the app to refresh all its configuration."/g, 'hintAr: "يقوم بتحديث إعدادات التطبيق بالكامل.", hintEn: "Forces the app to refresh all its configuration."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Open settings"/g, 'ar: "فتح الإعدادات", en: "Open settings"'],
  [/hintAr:\s*"[^"]*",\s*hintEn:\s*"Opens the app settings screen."/g, 'hintAr: "يفتح شاشة الإعدادات داخل التطبيق.", hintEn: "Opens the app settings screen."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Navigate to store"/g, 'ar: "توجيه للمتجر", en: "Navigate to store"'],
  [/hintAr:\s*"[^"]*",\s*hintEn:\s*"Opens the store details screen for the provided store ID."/g, 'hintAr: "يقوم بفتح تفاصيل المتجر المرفق رقمه.", hintEn: "Opens the store details screen for the provided store ID."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Update app"/g, 'ar: "تحديث التطبيق", en: "Update app"'],
  [/hintAr:\s*"[^"]*",\s*hintEn:\s*"Requests the user to update the app from the store."/g, 'hintAr: "يطلب من المستخدم تحديث التطبيق.", hintEn: "Requests the user to update the app from the store."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Rate app"/g, 'ar: "طلب تقييم التطبيق", en: "Rate app"'],
  [/hintAr:\s*"[^"]*",\s*hintEn:\s*"Directs the user to the app store for a review."/g, 'hintAr: "توجيه المستخدم لمتجر التطبيقات للتقييم.", hintEn: "Directs the user to the app store for a review."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Navigate to order"/g, 'ar: "توجيه لطلب", en: "Navigate to order"'],
  [/hintAr:\s*"[^"]*",\s*hintEn:\s*"Directs the user to a specific order details screen."/g, 'hintAr: "يقوم بتوجيه المستخدم لطلب معين.", hintEn: "Directs the user to a specific order details screen."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Custom action"/g, 'ar: "إجراء مخصص", en: "Custom action"'],
  [/hintAr:\s*"[^"]*",\s*hintEn:\s*"A custom action identifier to be handled by app code."/g, 'hintAr: "إجراء خاص يتم برمجته داخل التطبيق.", hintEn: "A custom action identifier to be handled by app code."'],
  [/`[^\`]*\$\{result\?\.inserted_count \?\? 0\}[^\`]*\`/g, '`تم إرسال ${result?.inserted_count ?? 0} إشعار. بانتظار استجابة فايربيس.`'],
  [/\? "[^"]+"\s*:\s*"Firebase \+ In-app"/g, '? "فايربيس + قاعدة البيانات" : "Firebase + In-app"'],
  [/\? "[^"]+"\s*:\s*"Notifications arrive immediately and also show up in the app\'s notification center."/g, '? "الإشعارات تصل فورا للمستخدمين، وتظهر في قائمة الإشعارات بالإضافة لرسائل الدفع (Push)." : "Notifications arrive immediately and also show up in the app\'s notification center."'],
  [/\? "[^"]+"\s*:\s*"Target users based on their country, governorate, or city, or broadcast globally."/g, '? "حدد المستخدمين بناءً على دولتهم، أو محافظتهم، أو مدينتهم، أو أرسل للجميع." : "Target users based on their country, governorate, or city, or broadcast globally."'],
  [/\? "[^"]+"\s*:\s*"Select a country or governorate first"/g, '? "اختر الدولة أو المحافظة أو المدينة" : "Select a country or governorate first"'],
  [/\? `[^\`]*\$\{selectedUsers\.length\}`\s*:\s*`Selected: \$\{selectedUsers\.length\}`/g, '? `المحدد: ${selectedUsers.length}` : `Selected: ${selectedUsers.length}`'],
  [/\? "[^"]+"\s*:\s*"Confirm sending notification\?"/g, '? "تأكيد إرسال الإشعار؟" : "Confirm sending notification?"'],
  [/\? "[^"]+"\s*:\s*"This notification will be dispatched to all matching users. This action cannot be undone."/g, '? "سيتم إرسال هذا الإشعار لجميع المستخدمين المحددين بناءً على الاستهداف المختار." : "This notification will be dispatched to all matching users. This action cannot be undone."'],
  [/\? "[^"]+"\s*:\s*"Notification action"/g, '? "الإجراء التلقائي للإشعار" : "Notification action"'],
  [/\? "[^"]+"\s*:\s*"Navigate to app"/g, '? "توجيه للتطبيق" : "Navigate to app"'],
  [/\? "[^"]+"\s*:\s*"Action type when tapped"/g, '? "نوع الإجراء عند النقر" : "Action type when tapped"'],
  [/\? "[^"]+"\s*:\s*"Comprehensive reports on users, merchants, revenue, commissions, and referrals."/g, '? "تقارير شاملة عن المستخدمين، المتاجر، الإيرادات، العمولات، والإحالات." : "Comprehensive reports on users, merchants, revenue, commissions, and referrals."'],
  [/<span>\{lang === "ar" \? `[^\`]*\$\{report\.rows\.length\}[^\`]*` : `\$\{report\.rows\.length\} results`\}<\/span>/g, '<span>{lang === "ar" ? `${report.rows.length} نتيجة` : `${report.rows.length} results`}</span>'],
  [/if \(\!details \|\| details === "No extra details" \|\| details\.includes\("[^"]+"\)\) return \[\];/g, 'if (!details || details === "No extra details" || details.includes("لا توجد")) return [];'],
  [/if \(lang === "ar" && String\(value\)\.trim\(\)\.toLowerCase\(\) === "deleted user"\) return "[^"]+";/g, 'if (lang === "ar" && String(value).trim().toLowerCase() === "deleted user") return "مستخدم محذوف";'],
  [/label_ar:\s*"[^"]*",\s*label_en:\s*"Other reward"/g, 'label_ar: "مكافأة أخرى", label_en: "Other reward"'],
  [/\? "[^"]+"\s*:\s*"New reward"/g, '? "مكافأة جديدة" : "New reward"'],
  [/\? "[^"]+"\s*:\s*"Store rewards"/g, '? "مكافآت المتجر" : "Store rewards"'],
  [/\? "[^"]+"\s*:\s*"Reward on signup"/g, '? "مكافأة بعد التسجيل" : "Reward on signup"'],
  [/\? "[^"]+"\s*:\s*"Added directly to user balance."/g, '? "تضاف إلى رصيد المستخدم." : "Added directly to user balance."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Basic Information"/g, 'ar: "البيانات الأساسية", en: "Basic Information"'],
  [/ar:\s*"[^"]*",\s*en:\s*"Advanced Tools"/g, 'ar: "أدوات متقدمة", en: "Advanced Tools"'],
  [/ar:\s*"[^"]*",\s*en:\s*"Operations & Support"/g, 'ar: "العمليات والدعم", en: "Operations & Support"'],
  [/\? "[^"]+"\s*:\s*"Add new staff, change ranks, and view an immutable audit log of all Supabase operations."/g, '? "يمكن إضافة موظف، تعديل صلاحياته، وعرض السجل الكامل لإجراءاته وكل ما يفعله على لوحة التحكم." : "Add new staff, change ranks, and view an immutable audit log of all Supabase operations."'],
  [/\{lang === "ar" \? `[^:]*:\s*\$\{activeCount\}` : `Active now: \$\{activeCount\}`\}/g, '{lang === "ar" ? `نشط الآن: ${activeCount}` : `Active now: ${activeCount}`}'],
  [/const names = enabled\.map\(\(item\) => \(lang === "ar" \? item\.ar : item\.en\)\)\.join\("[^"]+"\);/g, 'const names = enabled.map((item) => (lang === "ar" ? item.ar : item.en)).join("، ");'],
  [/ar:\s*"[^"]*",\s*en:\s*"Project configuration on Vercel, and internal system flags."/g, 'ar: "إعدادات المشروع على Vercel، وبعض إعدادات النظام الداخلية.", en: "Project configuration on Vercel, and internal system flags."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Raw SQL queries ready to be executed on your Supabase dashboard."/g, 'ar: "أكواد SQL جاهزة للاستخدام في لوحة تحكم قاعدة البيانات.", en: "Raw SQL queries ready to be executed on your Supabase dashboard."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Showing data for the last 8 hours."/g, 'ar: "عرض بيانات آخر 8 ساعات من النظام.", en: "Showing data for the last 8 hours."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Branch and store assignments for agents."/g, 'ar: "تعيينات الفروع والمتاجر للموظفين.", en: "Branch and store assignments for agents."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Action was executed successfully without errors."/g, 'ar: "تم تنفيذ الإجراء بنجاح دون أخطاء.", en: "Action was executed successfully without errors."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Settings have been updated on the server."/g, 'ar: "تم تحديث الإعدادات في الخادم بنجاح.", en: "Settings have been updated on the server."'],
  [/if \(\!window\.confirm\(lang === "ar" \? `[^"]*"\$\{product\.free_name\}"[^"]*` : `Deactivate "\$\{product\.free_name\}"\?`\)\) return;/g, 'if (!window.confirm(lang === "ar" ? `تعطيل المنتج "${product.free_name}"؟` : `Deactivate "${product.free_name}"?`)) return;'],
  [/\? `[^"]*"\$\{product\.free_name\}"[^"]*` : `Are you sure you want to deactivate "\$\{product\.free_name\}"\?`/g, '? `هل متأكد من تعطيل المنتج "${product.free_name}"؟` : `Are you sure you want to deactivate "${product.free_name}"?`'],
  [/\? `[^\$]*\$\{store\.store_name\}` : `A request has been made to suspend this store. Target: \$\{store\.store_name\}`/g, '? `تم طلب إيقاف المتجر ولن يظهر في لوحة تحكم المتاجر. الإجراء للمتجر: ${store.store_name}` : `A request has been made to suspend this store. Target: ${store.store_name}`'],
  [/\? "[^"]+"\s*:\s*"The store has been stopped, and all its products are hidden. This action is irreversible for the merchant."/g, '? "توقف المتجر عن العمل وتخفي جميع المنتجات تلقائيا. لا يمكن استرداده للمتجر مرة أخرى." : "The store has been stopped, and all its products are hidden. This action is irreversible for the merchant."'],
  [/\? `\$\{counts\.active\} [^\/]+ \/ \$\{counts\.total\} [^\`]*` : `\$\{counts\.active\} active \/ \$\{counts\.total\} total`/g, '? `${counts.active} نشط / ${counts.total} كلي` : `${counts.active} active / ${counts.total} total`'],
  [/<b>\{Number\(product\.price\)\.toLocaleString\("[^"]+"\)\} [^<]*<\/b>/g, '<b>{Number(product.price).toLocaleString("ar-EG")} ج.م</b>'],
  [/\? "[^"]+"\s*:\s*"The store and its products are subject to strict monitoring to ensure compliance."/g, '? "المتجر والمنتجات التابعة له تخضع لرقابة صارمة للتأكد من موافقة الشروط." : "The store and its products are subject to strict monitoring to ensure compliance."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Review and update the product catalog."/g, 'ar: "مراجعة وتحديث محتوى الكتالوج الخاص بالمنتجات.", en: "Review and update the product catalog."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Please verify all data before saving."/g, 'ar: "يرجى التحقق من صحة جميع البيانات قبل الحفظ.", en: "Please verify all data before saving."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Add environment variables to Vercel to update configuration."/g, 'ar: "أضف متغيرات البيئة إلى Vercel لتحديث الإعدادات.", en: "Add environment variables to Vercel to update configuration."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Additional options, and API integrations."/g, 'ar: "خيارات إضافية، وتفعيل التكامل عبر واجهة التطبيق.", en: "Additional options, and API integrations."'],
  [/\? "[^"]+"\s*:\s*"Enabling this feature requires setting up Supabase connection keys on Vercel."/g, '? "تمكين هذه الميزة يتطلب إعداد مفاتيح الاتصال بخوادم Supabase على Vercel." : "Enabling this feature requires setting up Supabase connection keys on Vercel."'],
  [/\? "[^"]+"\s*:\s*"Data here reflects the Vercel dashboard. Ensure correctness."/g, '? "البيانات الموجودة هنا ستنعكس على Vercel، احرص على التأكد من صحتها." : "Data here reflects the Vercel dashboard. Ensure correctness."'],
  [/\? "[^"]+"\s*:\s*"A private key is needed to verify permissions. Place it in the environment files to control cloud access from Supabase."/g, '? "المفتاح الخاص مطلوب للتأكد من الصلاحيات. ضعه في ملفات البيئة للتحكم في وصول الخدمات السحابية من Supabase." : "A private key is needed to verify permissions. Place it in the environment files to control cloud access from Supabase."'],
  [/\? "[^"]+"\s*:\s*"Save changes and update Vercel to push to users. Push your code from Admin Web to GitHub and hit Deploy."/g, '? "احفظ التغييرات وحدث Vercel للتأكد من وصولها للمستخدمين. ارفع الأكواد من Admin Web إلى GitHub واضغط Deploy." : "Save changes and update Vercel to push to users. Push your code from Admin Web to GitHub and hit Deploy."'],
  [/\? "[^"]+"\s*:\s*"To properly connect to Supabase, check Vercel. Add the SUPABASE_SERVICE_ROLE_KEY to the environment variables."/g, '? "للاتصال بخدمة Supabase بشكل صحيح تأكد من Vercel. أضف مفتاح SUPABASE_SERVICE_ROLE_KEY في متغيرات البيئة." : "To properly connect to Supabase, check Vercel. Add the SUPABASE_SERVICE_ROLE_KEY to the environment variables."'],
  [/\? "[^"]+"\s*:\s*"Linking Supabase and Vercel is essential. Ensure SUPABASE_SERVICE_ROLE_KEY and service_role are correct, then Redeploy."/g, '? "الربط بين Supabase و Vercel مهم لعمل لوحة التحكم. تأكد من SUPABASE_SERVICE_ROLE_KEY وقيمة service_role، ثم اضغط Redeploy." : "Linking Supabase and Vercel is essential. Ensure SUPABASE_SERVICE_ROLE_KEY and service_role are correct, then Redeploy."'],
  [/\? "[^"]+"\s*:\s*"Instructions in this section require admin rights. Use SQL to grant service_role permissions and update SUPABASE_SERVICE_ROLE_KEY on Vercel."/g, '? "التعليمات في هذا القسم تتطلب صلاحيات المشرفين. استخدم SQL لإعطاء صلاحيات للمستخدم service_role وحدث SUPABASE_SERVICE_ROLE_KEY في Vercel." : "Instructions in this section require admin rights. Use SQL to grant service_role permissions and update SUPABASE_SERVICE_ROLE_KEY on Vercel."'],
  [/\? "[^"]+"\s*:\s*"No software errors are logged in the system."/g, '? "لا يوجد أي أخطاء برمجية مسجلة في سجل النظام." : "No software errors are logged in the system."'],
  [/\? "[^"]+"\s*:\s*"Settings saved to database. It will update in a few minutes."/g, '? "تم حفظ الإعدادات على قاعدة البيانات. سيتم التحديث خلال بضع دقائق." : "Settings saved to database. It will update in a few minutes."'],
  [/\? "[^"]+"\s*:\s*"Caution when editing these values as they affect tables. Use SQL safely to avoid system downtime."/g, '? "يرجى الحذر عند تعديل هذه القيم حيث تؤثر على الجداول. استخدم أكواد SQL بحذر لضمان عدم توقف النظام." : "Caution when editing these values as they affect tables. Use SQL safely to avoid system downtime."'],
  [/\? "[^"]+"\s*:\s*"Quick access to commands speeds up workflow. You might need to run SQL to expedite admin tasks."/g, '? "الوصول السريع إلى أوامر التحكم يسهل من أداء عملك. قد تحتاج لتنفيذ بعض أكواد SQL لتسريع العمليات الإدارية." : "Quick access to commands speeds up workflow. You might need to run SQL to expedite admin tasks."'],
  [/\? "[^"]+"\s*:\s*"SQL script to clean data and repair tables in Supabase."/g, '? "كود SQL لتنظيف البيانات وإصلاح الجداول في قاعدة Supabase." : "SQL script to clean data and repair tables in Supabase."'],
  [/\? "[^"]+"\s*:\s*"Button to navigate to database control screens."/g, '? "الزر للتوجيه إلى شاشات تحكم قاعدة البيانات." : "Button to navigate to database control screens."'],
  [/\? "[^"]+"\s*:\s*"Some data is cached locally. Please clear it in case of errors."/g, '? "بعض البيانات مخزنة محلياً. يرجى مسحها في حال حدوث خطأ." : "Some data is cached locally. Please clear it in case of errors."'],
  [/\? "[^"]+"\s*:\s*"The request will be rejected, and a notification will be resent to the store."/g, '? "سيتم رفض الطلب، وإعادة إرسال إشعار للمتجر." : "The request will be rejected, and a notification will be resent to the store."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Monitor merchant applications, approve them, and get them activated."/g, 'ar: "مراقبة طلبات المتاجر والموافقة عليها وتفعيلها.", en: "Monitor merchant applications, approve them, and get them activated."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Verify new branch locations and approve them to go online quickly."/g, 'ar: "التحقق من الفروع الجديدة وقبول انضمامها للخدمة في أسرع وقت.", en: "Verify new branch locations and approve them to go online quickly."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Manage live merchants, overview their data, and adjust permissions."/g, 'ar: "إدارة عرض المتاجر النشطة وتعديل بياناتها من لوحة تحكم شاملة.", en: "Manage live merchants, overview their data, and adjust permissions."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Oversee store catalogs, manage products, and enforce policies."/g, 'ar: "مراقبة المنتجات المعروضة وتعديل الكتالوج الخاص بالمنتجات.", en: "Oversee store catalogs, manage products, and enforce policies."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Manage shipping companies, their integration, and track their performance."/g, 'ar: "دعم فني، إدارة شركات التوصيل، وتقييم أداء المندوبين والمتاجر.", en: "Manage shipping companies, their integration, and track their performance."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Define taxonomy, product hierarchies, and broad item classifications."/g, 'ar: "تقسيم الأقسام والمنتجات لتسهيل الوصول للمستخدمين وإدارة التطبيق.", en: "Define taxonomy, product hierarchies, and broad item classifications."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Set up geographical regions, cities, and associated shipping logic."/g, 'ar: "تحديد المدن والمناطق التي سيتاح فيها التوصيل وإدارة رسوم الشحن.", en: "Set up geographical regions, cities, and associated shipping logic."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Monitor incoming orders, their states, and resolve order disputes."/g, 'ar: "مراقبة المستخدمين والمتاجر والطلبات بشكل مستمر للحفاظ على الجودة.", en: "Monitor incoming orders, their states, and resolve order disputes."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Communicate with users and stores, handle inquiries, and assign agents."/g, 'ar: "تتبع مسار الطلبات بالكامل ومراجعة الفواتير وحل أي إشكالات تتعلق بها.", en: "Communicate with users and stores, handle inquiries, and assign agents."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Review user and merchant complaints, escalate, and resolve them."/g, 'ar: "حل الشكاوى والخلافات المتعلقة بالطلبات والرد على المستخدمين والمتاجر.", en: "Review user and merchant complaints, escalate, and resolve them."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Curate the FAQ knowledge base used by the automated support bot."/g, 'ar: "متابعة تطور الشكاوى واتخاذ القرار المناسب وإغلاق المشاكل الشائعة.", en: "Curate the FAQ knowledge base used by the automated support bot."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Block toxic phrases, filter scams, and moderate textual content automatically."/g, 'ar: "إدارة البوت الآلي للرد على الأسئلة المتكررة وتطوير قاعدة المعرفة.", en: "Block toxic phrases, filter scams, and moderate textual content automatically."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Review AI visual moderation flags and manually action flagged products."/g, 'ar: "تحديد الكلمات الممنوعة ومنع الرسائل أو المنتجات غير الملائمة تلقائياً.", en: "Review AI visual moderation flags and manually action flagged products."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Review backend AI logs, token usage, and automated reading errors."/g, 'ar: "مراجعة تقارير الذكاء الاصطناعي المتعلقة بالصور والمحتوى لمنع الاحتيال.", en: "Review backend AI logs, token usage, and automated reading errors."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Dispatch global or targeted Firebase Push notifications to specific cohorts."/g, 'ar: "إرسال الإشعارات الترويجية والتنبيهات العامة للمستخدمين بكل سهولة.", en: "Dispatch global or targeted Firebase Push notifications to specific cohorts."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Manage in-app banner campaigns, their targeting, and visibility."/g, 'ar: "مراقبة الإعلانات وتحديد مكان ظهورها وتحديث البانرات لزيادة التفاعل.", en: "Manage in-app banner campaigns, their targeting, and visibility."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Configure app revenue streams, subscription plans, and platform fees."/g, 'ar: "متابعة أرباح التطبيق ومدفوعات المتاجر، وإعدادات العمولات والخطط.", en: "Configure app revenue streams, subscription plans, and platform fees."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Track store billing, payouts, ledger, and reconcile financial disputes."/g, 'ar: "تحكم بالاشتراكات وتفعيل الميزات الإضافية للمتاجر والمستخدمين.", en: "Track store billing, payouts, ledger, and reconcile financial disputes."'],
  [/ar:\s*"[^"]*",\s*en:\s*"Oversee referral campaigns, codes, and dispatch physical or digital rewards."/g, 'ar: "مراقبة دعوات المستخدمين ونظام الإحالة وتقديم المكافآت الترويجية.", en: "Oversee referral campaigns, codes, and dispatch physical or digital rewards."'],
  [/ar:\s*"[^"]*",\s*en:\s*"An immutable log of every action taken by the admin team."/g, 'ar: "سجل كامل وتفصيلي لكل الإجراءات لضمان التتبع ومعرفة الفاعل متى شاء.", en: "An immutable log of every action taken by the admin team."']
];

for (const relPath of filesToProcess) {
  const fullPath = path.join(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) continue;
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let changed = false;

  // Process English-based translations
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('\uFFFD')) {
      let newLine = line;
      
      // Match { ar: "...", en: "Eng" }
      const enMatch = line.match(/en:\s*"([^"]+)"/);
      if (enMatch && dictionary[enMatch[1]]) {
        newLine = newLine.replace(/ar:\s*"[^"]+"/, `ar: "${dictionary[enMatch[1]]}"`);
      }
      
      // Match lang === "ar" ? "..." : "Eng"
      const ternaryMatch = line.match(/lang === "ar" \? "[^"]+" \: "([^"]+)"/);
      if (ternaryMatch && dictionary[ternaryMatch[1]]) {
        newLine = newLine.replace(/"[^"]+"\s*\:\s*"([^"]+)"/, `"${dictionary[ternaryMatch[1]]}" : "$1"`);
      }
      
      // Match label_en: "Eng"
      const labelEnMatch = line.match(/label_en:\s*"([^"]+)"/);
      if (labelEnMatch && dictionary[labelEnMatch[1]]) {
        newLine = newLine.replace(/label_ar:\s*"[^"]+"/, `label_ar: "${dictionary[labelEnMatch[1]]}"`);
      }
      
      if (newLine !== line) {
        lines[i] = newLine;
        changed = true;
      }
    }
  }
  
  content = lines.join('\n');
  
  // Apply other regex fixes
  for (const [regex, replacement] of otherFixes) {
    if (regex.test(content)) {
      content = content.replace(regex, replacement);
      changed = true;
    }
  }
  
  // Global catch-all for any remaining FFFD that were just placeholders or labels
  if (content.includes('\uFFFD')) {
    // Some lines might not have matched the exact regex due to whitespace or something.
    // Try a simpler approach for remaining lines:
    Object.keys(dictionary).forEach(enKey => {
      const arVal = dictionary[enKey];
      // lang === "ar" ? "" : "Active"
      const regex1 = new RegExp(`lang === "ar" \\? "[^"]+" : "${enKey}"`, 'g');
      content = content.replace(regex1, `lang === "ar" ? "${arVal}" : "${enKey}"`);
      
      // ar: "", en: "Active"
      const regex2 = new RegExp(`ar: "[^"]+", en: "${enKey}"`, 'g');
      content = content.replace(regex2, `ar: "${arVal}", en: "${enKey}"`);
      
      // label_ar: "", label_en: "Active"
      const regex3 = new RegExp(`label_ar: "[^"]+", label_en: "${enKey}"`, 'g');
      content = content.replace(regex3, `label_ar: "${arVal}", label_en: "${enKey}"`);
    });
  }

  if (content.includes('\uFFFD')) {
    console.warn(`WARNING: Still found corruption in ${relPath}`);
  }

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Fixed ${relPath}`);
}
