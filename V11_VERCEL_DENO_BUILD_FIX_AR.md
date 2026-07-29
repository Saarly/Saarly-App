# إصلاح بناء Vercel لملفات Supabase Edge Functions — V11

## سبب الخطأ

ملف `tsconfig.json` كان يشمل كل ملفات TypeScript داخل المشروع عبر `**/*.ts` و`**/*.tsx`.
وبالتالي كان Next.js يحاول فحص ملف Edge Function الموجود في:

```text
supabase/functions/process-admin-email-events/index.ts
```

هذا الملف مخصص لبيئة Deno في Supabase ويستخدم استيرادًا مباشرًا من رابط HTTPS، وهو صحيح داخل Supabase لكنه غير مفهوم داخل TypeScript الخاص بـNext.js على Vercel.

## الإصلاح

تم استبعاد المسار التالي من فحص Next.js فقط:

```text
supabase/functions/**/*
```

ملفات Edge Functions ما زالت موجودة داخل المشروع ولم تُحذف أو تُعدل، ويمكن الاحتفاظ بها في Git أو نشرها على Supabase بصورة مستقلة. الاستبعاد يؤثر فقط على Build الخاص بلوحة الأدمن.

## ما لم يتغير

- لم يتم تجاهل أخطاء TypeScript داخل `src`.
- لم يتم تعطيل فحص TypeScript في Next.js.
- لم يتم تفعيل `ignoreBuildErrors`.
- لم يتم حذف ملفات Supabase أو migrations.
- لم يتم تغيير دالة البريد المنشورة على Supabase.
