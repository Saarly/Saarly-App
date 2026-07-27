import { CircleHelp } from "lucide-react";
import type { Lang } from "@/lib/admin/i18n";

const guides: Record<string, { ar: string; en: string }> = {
  "dashboard": {
    ar: "الصفحة دي بتديك صورة سريعة عن شغل المنصة النهارده، وإيه اللي محتاج تدخل منك الأول.",
    en: "Use this page for a quick view of today’s platform activity and the items that need your attention first.",
  },
  "merchant-approvals": {
    ar: "راجع بيانات المتجر وصور المستندات، وبعد ما تتأكد إن كل حاجة سليمة وافق عليه أو ارفضه مع كتابة السبب.",
    en: "Review the store details and documents, then approve it or reject it with a clear reason.",
  },
  "branch-approvals": {
    ar: "هنا بتراجع الفرع ومديره وصوره قبل ما الفرع يظهر للعملاء ويبدأ يستقبل طلبات.",
    en: "Review the branch, its manager, and uploaded documents before it becomes visible and starts receiving work.",
  },
  "shipping-companies": {
    ar: "تابع شركات الشحن اللي المتاجر ضافتها واعرف كل شركة مستخدمة في كام إعداد شحن.",
    en: "Track the shipping companies added by stores and see how each one is being used.",
  },
  "users": {
    ar: "من هنا تقدر تراجع حسابات المستخدمين، توقف حساب، تفك الإيقاف، تغيّر كلمة المرور أو تحذف الحساب.",
    en: "Review user accounts, block or unblock access, reset passwords, and delete accounts from here.",
  },
  "staff": {
    ar: "ضيف موظفين الإدارة والدعم وحدد لكل واحد الصفحات والإجراءات اللي مسموح له يستخدمها.",
    en: "Add admin and support staff, then choose the pages and actions each person is allowed to use.",
  },
  "categories": {
    ar: "رتّب الأقسام الرئيسية والفرعية اللي بتظهر في التطبيق، وماتحذفش قسم مربوط بمنتجات إلا بعد مراجعة تأثير الحذف.",
    en: "Organize the main and subcategories shown in the app, and review the impact before removing a category linked to products.",
  },
  "cities": {
    ar: "ضيف البلد الأول، وبعدها المحافظات والمدن التابعة ليها. العملة بتتحدد من البلد وبتتطبق على المدن التابعة لها.",
    en: "Add the country first, then its governorates and cities. The country currency is applied to its locations.",
  },
  "stores": {
    ar: "الصفحة دي للمتابعة العامة لبيانات المتاجر وحالتها الحالية.",
    en: "Use this page for a general review of stores and their current status.",
  },
  "store-catalog": {
    ar: "اختار متجر من الناحية الجانبية، وبعدها راجع بياناته ومنتجاته. الحذف بيشيله من التشغيل، ولو عليه طلبات قديمة بنحفظ السجل بدل ما نضيّعه.",
    en: "Choose a store, then review its details and products. Deletion removes it from operation while retaining any required historical records.",
  },
  "orders": {
    ar: "تابع الطلب من أول إنشائه لحد التأكيد أو الإلغاء، وراجع المتجر والمبلغ وحالة الدفع.",
    en: "Follow each order from creation through confirmation or cancellation, including store, amount, and payment status.",
  },
  "suspicious-matches": {
    ar: "راجع المطابقات اللي النظام مش واثق منها قبل ما تعتمد المنتج المناسب للطلب.",
    en: "Review uncertain product matches before confirming the correct product for a request.",
  },
  "ai-reads": {
    ar: "تابع الملفات اللي الذكاء الاصطناعي قراها، واعرف الناجح واللي محتاج مراجعة أو إعادة محاولة.",
    en: "Track files processed by AI and identify successful, failed, or review-needed readings.",
  },
  "support": {
    ar: "تابع محادثات الدعم، استلم المحادثة أو حوّلها لموظف، وحوّلها لشكوى رسمية لو الموضوع محتاج متابعة أكبر.",
    en: "Handle support chats, assign them to staff, and convert a chat into a formal complaint when needed.",
  },
  "broadcast": {
    ar: "ابعت إشعار لمجموعة محددة من المستخدمين، وراجع العنوان والرسالة والرابط قبل الإرسال.",
    en: "Send a notification to a selected audience and review its title, message, and destination before sending.",
  },
  "ads": {
    ar: "ضيف الإعلان وحدد مكان ظهوره ومدته. الإعلان المستمر شغال لحد ما توقفه، والمجدول يبدأ تلقائي في معاده.",
    en: "Add an ad, choose its placement and dates. Ongoing ads run until stopped, while scheduled ads start automatically.",
  },
  "complaints": {
    ar: "اختار الشكوى، حدّث حالتها، عيّن المسؤول، ضيف التصنيفات ورد على العميل من نفس الشاشة.",
    en: "Choose a complaint, update its status, assign an owner, apply labels, and reply from the same screen.",
  },
  "knowledge": {
    ar: "اكتب المعلومات اللي المساعد الآلي يعتمد عليها في الرد، وخلي الكلام واضح ومحدث قبل ما تفعّله.",
    en: "Manage the information used by the automated assistant and keep it clear and up to date before activation.",
  },
  "reports": {
    ar: "اختار نوع التقرير من فوق. هتشوف تقرير واحد في كل مرة بشكل بسيط، وتقدر تبحث جواه أو تنزله كامل.",
    en: "Choose a report type above. One report is shown at a time, with search and full CSV export.",
  },
  "content-moderation": {
    ar: "ضيف الكلمات أو العبارات الممنوعة وحدد اللغة وطريقة المطابقة وهل تتمنع فورًا ولا تروح للمراجعة.",
    en: "Add blocked terms, choose language and match type, and decide whether content is blocked or sent for review.",
  },
  "monetization": {
    ar: "كل جزء مالي له تاب مستقل. اقرأ الشرح اللي تحت التابات قبل أي تعديل، لأن بعض الإجراءات بتأثر على اشتراك المتجر واستقباله للطلبات.",
    en: "Each financial area has its own tab. Read the tab guide before making changes that may affect store billing or order access.",
  },
  "payments": {
    ar: "راجع إعدادات الدفع وحالتها، وماتفعّلش أي طريقة غير بعد ما تتأكد إن إعدادها واختبارها تموا بنجاح.",
    en: "Review payment settings and only enable a method after its configuration and connection test succeed.",
  },
  "referrals": {
    ar: "تابع الدعوات والمكافآت، واعرف مين حقق الشروط وإيه المكافأة اللي اتسلمت أو لسه مستنية.",
    en: "Track invitations and rewards, including qualification and delivery status.",
  },
  "audit": {
    ar: "السجل ده بيوضح مين عمل كل تعديل وإمتى وعلى أي بيانات، وبيساعدك تراجع أي مشكلة حصلت.",
    en: "This log shows who changed what and when, helping you investigate operational issues.",
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
