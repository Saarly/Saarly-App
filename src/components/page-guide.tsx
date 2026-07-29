import { CircleHelp } from "lucide-react";
import type { Lang } from "@/lib/admin/i18n";

const guides: Record<string, { ar: string; en: string }> = {
  "dashboard": {
    ar: "هنا بتاخد لقطة سريعة عن حالة المنصة النهارده: عدد المستخدمين والمتاجر، الطلبات اللي مستنية تأكيد، المحادثات المفتوحة، وأهم الحاجات اللي محتاجة تدخل منك الأول.",
    en: "Use this page to see today’s platform status at a glance: users and stores, orders awaiting confirmation, open support chats, and the items that need your attention first.",
  },
  "merchant-approvals": {
    ar: "هنا بتراجع طلبات تسجيل المتاجر قبل ما تشتغل على سعرلي. افتح بيانات كل متجر ومستنداته، وبعد المراجعة وافق عليه أو ارفضه واكتب سبب واضح يوصل لصاحب المتجر.",
    en: "Review new store applications before they go live on Saarly. Open each store’s details and documents, then approve it or reject it with a clear reason for the owner.",
  },
  "branch-approvals": {
    ar: "الصفحة دي لمراجعة الفروع الجديدة قبل ظهورها للعملاء. اتأكد من بيانات الفرع والمدير والمستندات والموقع، وبعدها وافق أو ارفض مع توضيح السبب.",
    en: "Review new branches before they become visible to customers. Check the branch, manager, documents, and location, then approve or reject it with a clear reason.",
  },
  "shipping-companies": {
    ar: "من هنا بتشوف شركات الشحن اللي المتاجر ضافتها وإعدادات استخدامها. تقدر تراجع حالة كل شركة وتعرف مرتبطة بكام متجر أو شريحة شحن قبل أي تعديل.",
    en: "See the shipping companies added by stores and how they are used. Review each company’s status and linked store or pricing settings before making changes.",
  },
  "users": {
    ar: "هنا بتدير حسابات المستخدمين العاديين: تبحث عن حساب، تراجع بياناته وحالته، توقفه أو تفك الإيقاف، تغيّر كلمة المرور، أو تحذف الحساب بعد التأكيد.",
    en: "Manage regular user accounts here: search for an account, review its details and status, block or unblock it, reset its password, or delete it after confirmation.",
  },
  "staff": {
    ar: "الصفحة دي لإدارة الناس اللي بتدخل لوحة الأدمن. تقدر تضيف مدير أو موظف دعم، تحدد صلاحياته، تعدلها، توقف دخوله، أو تحذف صلاحية الأدمن من غير ما تحذف حسابه العادي.",
    en: "Manage the people who can access the admin panel. Add admins or support staff, set or edit permissions, disable access, or remove admin access without deleting the person’s normal account.",
  },
  "categories": {
    ar: "من هنا بتنظم الأقسام الرئيسية والفرعية اللي بتظهر في التطبيق وبتتربط بالمتاجر والمنتجات. تقدر تضيف وتعدل وترتب الأقسام، لكن راجع الارتباطات قبل الحذف عشان مايتأثرش المحتوى الموجود.",
    en: "Organize the main and subcategories shown in the app and linked to stores and products. Add, edit, and reorder categories, and review existing links before deleting anything.",
  },
  "cities": {
    ar: "هنا بتبني تقسيم الأماكن في التطبيق: البلد الأول، وبعدها المحافظات والمدن التابعة ليها. العملة بتتحدد من البلد، وتقدر تفعل أو توقف أي مكان حسب التغطية الفعلية.",
    en: "Build the app’s location structure here: add the country first, then its governorates and cities. Currency comes from the country, and each location can be enabled or disabled based on coverage.",
  },
  "stores": {
    ar: "الصفحة دي للمتابعة العامة لكل المتاجر المسجلة. تقدر تبحث عن متجر وتراجع حالته وبياناته الأساسية، وتعرف هل شغال أو موقوف أو محتاج إجراء إداري.",
    en: "Use this page for an overall review of registered stores. Search for a store, check its current status and key details, and see whether it is active, suspended, or needs an admin action.",
  },
  "store-catalog": {
    ar: "اختار متجر من القائمة، وبعدها راجع بياناته وصوره ومنتجاته وحالة كل منتج. تقدر تعدل بيانات العرض أو توقف منتج أو تحذفه، مع الحفاظ على السجلات القديمة المرتبطة بالطلبات.",
    en: "Choose a store, then review its details, images, products, and product status. You can edit displayed data, disable a product, or remove it while keeping required historical order records.",
  },
  "orders": {
    ar: "هنا بتتابع كل طلب من وقت إنشائه لحد التأكيد أو الإلغاء. راجع العميل والمتجر وحالة الطلب وقيمة المنتجات المختارة وحالة الدفع داخل التطبيق، وافتح التفاصيل لو محتاج تعرف التسلسل كامل.",
    en: "Track every order from creation through confirmation or cancellation. Review the buyer, store, order status, selected-item subtotal, and in-app payment status, then open details for the full flow.",
  },
  "suspicious-matches": {
    ar: "الصفحة دي للمطابقات اللي الذكاء الاصطناعي مش واثق منها. راجع المنتج اللي اتفهم من طلب العميل وقارنه بالاختيارات، وبعدها اعتمد المنتج الصح عشان النتائج والأسعار تبقى دقيقة.",
    en: "Review product matches that the AI marked as uncertain. Compare the interpreted request with the available choices, then confirm the correct product so results and prices stay accurate.",
  },
  "ai-reads": {
    ar: "هنا بتتابع الصور والملفات اللي الذكاء الاصطناعي حللها. شوف القراءة نجحت ولا فشلت، نسبة الثقة، وهل محتاجة مراجعة أو إعادة محاولة قبل استخدامها في طلب العميل.",
    en: "Track images and files processed by AI. Check whether parsing succeeded, the confidence level, and whether a result needs review or another attempt before it is used in a customer request.",
  },
  "support": {
    ar: "الصفحة دي لمحادثات الدعم قبل ما تتحول لشكوى رسمية. تقدر تشوف كلام العميل والبوت، تستلم المحادثة أو تعينها لموظف، ترد على العميل، تضيف تصنيف، وتقفلها أو تحولها لشكوى لو محتاجة متابعة أكبر.",
    en: "Handle support conversations before they become formal complaints. Review customer and bot messages, assign the chat, reply, add labels, close it, or convert it into a complaint when deeper follow-up is needed.",
  },
  "broadcast": {
    ar: "من هنا بتجهز إشعار وتحدد مين يستلمه والصفحة اللي هتفتح لما يضغط عليه. تقدر تختار العملاء أو المتاجر أو جمهور مخصص، تحفظ الإعدادات كقالب، وبعد المراجعة تبعت فورًا أو تحدد معاد الإرسال.",
    en: "Create a notification, choose its audience, and select the page opened when it is tapped. Target customers, stores, or a custom audience, save the setup as a template, then send now or schedule it.",
  },
  "ads": {
    ar: "الصفحة دي لإدارة الإعلانات اللي بتظهر جوه التطبيق. ارفع الصورة وحدد مكان الظهور والجمهور والترتيب ومدة التشغيل، وبعدها فعل الإعلان أو وقفه من غير ما تحذفه.",
    en: "Manage in-app ads here. Upload the image, choose placement, audience, order, and active dates, then enable or pause the ad without deleting it.",
  },
  "complaints": {
    ar: "هنا بتدير الشكاوى الرسمية بعد تصعيدها من الدعم. اختار الشكوى عشان تشوف سياق العميل والبوت والدعم قبل التصعيد كل جزء لوحده، وبعدها تابع رسائل الشكوى، عيّن المسؤول، حدّث الحالة والتصنيفات، وسجل الحل النهائي.",
    en: "Manage formal complaints after escalation from support. Open a case to review customer, bot, and pre-escalation support messages in separate sections, then follow complaint replies, assign an owner, update labels and status, and record the final resolution.",
  },
  "knowledge": {
    ar: "هنا بتكتب وتحدّث المعلومات اللي المساعد الآلي بيرجع لها وهو بيرد على المستخدمين. ضيف السؤال أو الموضوع والإجابة الصحيحة بالعربي والإنجليزي، وفعّل المحتوى بعد ما تتأكد إنه واضح ومحدث.",
    en: "Manage the information used by the automated assistant. Add the topic and correct Arabic and English content, then activate it after confirming that it is clear and up to date.",
  },
  "reports": {
    ar: "من هنا بتطلع تقارير التشغيل والماليات. اختار نوع التقرير، استخدم البحث والفلاتر لمراجعة البيانات، وبعدها صدّره كملف Excel مرتب لو محتاج تحفظه أو تبعته.",
    en: "Open operational and financial reports here. Choose a report, use search and filters to review the data, then export a properly structured Excel file when needed.",
  },
  "content-moderation": {
    ar: "الصفحة دي للتحكم في الكلمات والعبارات الممنوعة في الرسائل ومحتوى المنتجات. ضيف العبارة وحدد اللغة وطريقة المطابقة والإجراء، وفعّلها أو وقفها حسب سياسة المنصة.",
    en: "Control blocked words and phrases used in messages and product content. Add the term, choose its language, match method, and action, then enable or disable it according to platform policy.",
  },
  "monetization": {
    ar: "هنا بتدير كل إعدادات الربح من مكان واحد عن طريق التابات: الخطط والاشتراكات والدفع والعمولات والفترة المجانية وفترة السماح. افتح التاب المطلوب واقرأ شرحه قبل التعديل لأن بعض الإعدادات بتأثر على المتجر واستقباله للطلبات.",
    en: "Manage monetization from one place using the tabs for plans, subscriptions, payments, commissions, free periods, and grace periods. Open the required tab and read its guide before changing settings that may affect store access or order activity.",
  },
  "payments": {
    ar: "الصفحة دي لمتابعة عمليات الدفع المسجلة على النظام. تقدر تبحث بالمستخدم أو المتجر أو المرجع، وتراجع مزود الدفع والمبلغ والحالة والتاريخ عشان تعرف العملية اتدفعت ولا لسه أو فشلت.",
    en: "Review payment transactions recorded by the system. Search by user, store, or reference and check the provider, amount, status, and date to see whether a payment is pending, completed, or failed.",
  },
  "referrals": {
    ar: "هنا بتتابع دعوات المستخدمين والمكافآت الناتجة عنها. شوف صاحب الدعوة والمستخدم اللي سجل والكود ونوع المكافأة، وتأكد هل الشروط اتحققت والمكافأة اتسلمت ولا لسه.",
    en: "Track user invitations and the rewards they generate. Review the referrer, new user, code, reward type, qualification, and whether the reward has been delivered.",
  },
  "audit": {
    ar: "السجل ده بيوضح مين عمل كل إجراء في لوحة الأدمن وإمتى وعلى أنهي بيانات. استخدمه وقت المراجعة أو حل مشكلة عشان تعرف التغيير حصل إزاي ومين نفذه.",
    en: "This log shows who performed each admin action, when it happened, and which data was affected. Use it to investigate changes and operational issues.",
  },
};

export function PageGuide({ sectionId, lang }: { sectionId: string; lang: Lang }) {
  const guide = guides[sectionId];
  if (!guide) return null;

  return (
    <aside className="page-guide" aria-label={lang === "ar" ? "شرح الصفحة" : "Page guide"}>
      <CircleHelp size={19} />
      <div>
        <strong>{lang === "ar" ? "الصفحة دي بتعمل إيه؟" : "What is this page for?"}</strong>
        <p>{guide[lang]}</p>
      </div>
    </aside>
  );
}
