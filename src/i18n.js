// The app's words, in English and Arabic (the test checks both have every key), Latin digits in both (OnCloud's rule).
// The builder's own form and the printed document keep their words in src/builder/engine.js: the document prints in
// the proposal's language (English, Arabic or both), whatever the reader's.
const strings = {
  en: {
    title: 'Proposal Builder',
    loading: 'Loading…',
    signIn: 'Sign in with OnCloud',
    signInAgain: 'Sign in again',
    failed: 'Could not reach OnCloud.',
    startFailed: 'The app could not start.',
    startNotFound: 'This app is not installed in your workspace.',
    startRefused: 'OnCloud refused this app. Ask your workspace admin to check it is installed and active.',
    startOrigin: 'OnCloud does not allow this address for the app. Add it to the app\'s allowed origins.',
    startPackage: 'The Proposal Builder is not in your workspace\'s package. Ask OnCloud to add it.',
    notFound: 'Not found',
    pageNotFoundBody: 'This page does not exist, or it was removed.',
    open: 'Open', back: 'Back', delete: 'Delete', cancel: 'Cancel', select: 'Select', search: 'Search', empty: 'Nothing yet.',

    proposals: 'Proposals', newProposal: 'New proposal', companyProfile: 'Company profile', sales: 'Sales',
    noProposals: 'No proposals yet', noProposalsBody: 'Start one, or build one from a quote.',
    ref: 'Reference', client: 'Client', status: 'Status', currency: 'Currency', yearOne: 'Year one', valid: 'Valid until',
    issued: 'Issued', preparedBy: 'Prepared by', quote: 'Quote', added: 'Added', id: 'ID', version: 'Version',
    'st.draft': 'Draft', 'st.awaiting': 'Sent — awaiting response', 'st.active': 'Active', 'st.won': 'Closed won', 'st.lost': 'Closed lost',

    hideInternal: 'Hide internal', company: 'Company', import: 'Import', export: 'Export', exportCosts: 'Export with costs',
    print: 'Print / PDF', duplicate: 'Duplicate', duplicated: 'Duplicated', deleteProposal: 'Delete this proposal?', deleted: 'Deleted',
    saveFailed: 'Not saved', conflict: 'Someone else changed this proposal. Reopen it to see their version.',
    creating: 'Creating the proposal…',

    pickClient: 'Pick from Contacts', pickQuote: 'Build from a quote', pickProduct: 'Add from Products',
    pickClientTitle: 'Choose the client', pickProductTitle: 'Choose a product', pickQuoteTitle: 'Choose a quote',
    linkedClient: 'Linked to Contacts', linkedQuote: 'Built from', unlink: 'Unlink', linked: 'Added to the proposal',
    noResults: 'Nothing matches.', loadRates: 'Load exchange rates from OnCloud', ratesLoaded: 'Exchange rates loaded',
    noRates: 'Your workspace has no exchange rates to or from the base currency.', uploadFailed: 'The image could not be uploaded.',
    noPrice: 'no price', typeToSearch: 'Type to search',

    companyNote: 'Everything true of your company rather than of one client: stored once in OnCloud and used by every proposal.',
    costsHidden: 'Costing settings are shown only to people who may see product costs in this workspace.',

    errQuota: 'The app has reached its limit.', errScope: 'The app is not allowed to do this.', errOrigin: 'This address is not allowed for the app.',
    errUnavailable: 'OnCloud\'s app data is unavailable right now. Try again shortly.', errInvalid: 'Some fields need another look.',
    errSignedOut: 'You were signed out. Sign in again.', errGeneric: 'That did not work.', errForbidden: 'You do not have access to this in your workspace.',
    errPackage: 'This app is not in your workspace\'s package.', errLocked: 'This record is locked.', errConflict: 'Someone else changed this. Reload it.',
  },
  ar: {
    title: 'منشئ العروض',
    loading: 'جارٍ التحميل…',
    signIn: 'تسجيل الدخول عبر OnCloud',
    signInAgain: 'سجّل الدخول مرة أخرى',
    failed: 'تعذّر الوصول إلى OnCloud.',
    startFailed: 'تعذّر تشغيل التطبيق.',
    startNotFound: 'هذا التطبيق غير مثبّت في مساحة عملك.',
    startRefused: 'رفض OnCloud هذا التطبيق. اطلب من مسؤول مساحة العمل التأكد من تثبيته وتفعيله.',
    startOrigin: 'لا يسمح OnCloud بهذا العنوان للتطبيق. أضفه إلى العناوين المسموح بها للتطبيق.',
    startPackage: 'منشئ العروض ليس ضمن باقة مساحة عملك. اطلب من OnCloud إضافته.',
    notFound: 'غير موجود',
    pageNotFoundBody: 'هذه الصفحة غير موجودة، أو أُزيلت.',
    open: 'فتح', back: 'رجوع', delete: 'حذف', cancel: 'إلغاء', select: 'اختيار', search: 'بحث', empty: 'لا شيء بعد.',

    proposals: 'العروض', newProposal: 'عرض جديد', companyProfile: 'ملف الشركة', sales: 'المبيعات',
    noProposals: 'لا توجد عروض بعد', noProposalsBody: 'ابدأ عرضًا، أو أنشئه من عرض سعر.',
    ref: 'المرجع', client: 'العميل', status: 'الحالة', currency: 'العملة', yearOne: 'السنة الأولى', valid: 'صالح حتى',
    issued: 'تاريخ الإصدار', preparedBy: 'أعدّه', quote: 'عرض السعر', added: 'أُضيف', id: 'الرمز', version: 'الإصدار',
    'st.draft': 'مسودة', 'st.awaiting': 'أُرسل — بانتظار الرد', 'st.active': 'نشط', 'st.won': 'مغلق — فوز', 'st.lost': 'مغلق — خسارة',

    hideInternal: 'إخفاء الداخلي', company: 'الشركة', import: 'استيراد', export: 'تصدير', exportCosts: 'تصدير مع التكاليف',
    print: 'طباعة / PDF', duplicate: 'نسخ', duplicated: 'نُسخ', deleteProposal: 'حذف هذا العرض؟', deleted: 'حُذف',
    saveFailed: 'لم يُحفظ', conflict: 'غيّر شخص آخر هذا العرض. أعد فتحه لترى نسخته.',
    creating: 'جارٍ إنشاء العرض…',

    pickClient: 'اختيار من جهات الاتصال', pickQuote: 'إنشاء من عرض سعر', pickProduct: 'إضافة من المنتجات',
    pickClientTitle: 'اختر العميل', pickProductTitle: 'اختر منتجًا', pickQuoteTitle: 'اختر عرض سعر',
    linkedClient: 'مرتبط بجهات الاتصال', linkedQuote: 'أُنشئ من', unlink: 'فك الربط', linked: 'أُضيف إلى العرض',
    noResults: 'لا توجد نتائج.', loadRates: 'تحميل أسعار الصرف من OnCloud', ratesLoaded: 'حُمّلت أسعار الصرف',
    noRates: 'لا توجد في مساحة عملك أسعار صرف من العملة الأساسية أو إليها.', uploadFailed: 'تعذّر رفع الصورة.',
    noPrice: 'بلا سعر', typeToSearch: 'اكتب للبحث',

    companyNote: 'كل ما يخص شركتك لا عميلًا بعينه: يُحفظ مرة واحدة في OnCloud وتستخدمه كل العروض.',
    costsHidden: 'إعدادات التكاليف تظهر فقط لمن يحق له رؤية تكاليف المنتجات في مساحة العمل.',

    errQuota: 'بلغ التطبيق حده.', errScope: 'لا يُسمح للتطبيق بهذا.', errOrigin: 'هذا العنوان غير مسموح به للتطبيق.',
    errUnavailable: 'بيانات التطبيقات في OnCloud غير متاحة الآن. حاول بعد قليل.', errInvalid: 'بعض الحقول تحتاج إلى مراجعة.',
    errSignedOut: 'سُجّل خروجك. سجّل الدخول مرة أخرى.', errGeneric: 'لم ينجح ذلك.', errForbidden: 'لا تملك صلاحية الوصول إلى هذا في مساحة عملك.',
    errPackage: 'هذا التطبيق ليس ضمن باقة مساحة عملك.', errLocked: 'هذا السجل مقفل.', errConflict: 'غيّر شخص آخر هذا. أعد تحميله.',
  },
};

let lang = 'en';

// The page's language and direction are OnCloud's runtime's to set; this only picks the app's words to match.
export function setLocale(locale) {
  lang = String(locale || 'en').startsWith('ar') ? 'ar' : 'en';
}

export const locale = () => lang;
export const t = (key) => strings[lang][key] ?? strings.en[key] ?? key;
export const keys = (l) => Object.keys(strings[l]);
// Both languages, for the manifest: the runtime picks the reader's.
export const both = (key) => ({ en: strings.en[key] ?? key, ar: strings.ar[key] ?? strings.en[key] ?? key });
// Latin digits.
export const num = (n, digits = 0) => (n == null || n === '' ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
