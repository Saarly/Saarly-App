نسخة رفع نظيفة لـ Vercel / GitHub

1) فك الضغط.
2) ارفع محتويات المجلد نفسها إلى جذر مستودع GitHub.
3) يجب أن يكون package.json في الصفحة الرئيسية للمستودع.
4) احذف أي مجلد متداخل بهذا الشكل إن كان موجودًا:
   src/components/src
5) في Vercel > Project Settings > Build and Deployment:
   Root Directory = فارغ أو ./
6) Build Command = npm run build
7) Install Command = npm install أو npm ci

ملحوظة: لا ترفع ملف .env.local إلى GitHub. ضع القيم داخل Vercel Environment Variables.
