'use client';

import * as React from 'react';

export type AppLanguage = 'en' | 'ar';

const LANGUAGE_KEY = 'taskflow_language';

type Dictionary = Record<string, string>;

const dictionaries: Record<AppLanguage, Dictionary> = {
  en: {
    'language.english': 'English',
    'language.arabic': 'Arabic',
    'language.switch': 'Language',

    'common.loading': 'Loading...',
    'common.accessDenied': 'Access Denied',
    'common.cancel': 'Cancel',
    'common.continue': 'Continue',

    'app.loadingTaskflow': 'Loading TaskFlow...',

    'nav.dashboard': 'Dashboard',
    'nav.projects': 'Projects',
    'nav.diagram': 'Diagram',
    'nav.finance': 'Finance',
    'nav.inventory': 'Inventory',
    'nav.purchases': 'Purchases',
    'nav.clients': 'Clients',
    'nav.suppliers': 'Suppliers',
    'nav.users': 'Users',
    'nav.companies': 'Companies',
    'nav.settings': 'Settings',

    'company.search': 'Search company...',
    'company.none': 'No company found.',

    'user.profile': 'Profile',
    'user.settings': 'Settings',
    'user.logout': 'Log out',

    'login.title': 'Login',
    'login.subtitle': 'Enter your email below to login to your account',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.signIn': 'Sign In',
    'login.signingIn': 'Signing In...',
    'login.successTitle': 'Login Successful',
    'login.successMessage': 'Welcome back!',
    'login.failedTitle': 'Login Failed',
    'login.failedMessage': 'Invalid email or password. Please try again.',
    'login.accessDeniedTitle': 'Access Denied',
    'login.accessDeniedMessage':
      'Your account exists but has not been configured by an administrator yet. Please contact your manager.',

    'auth.guardDenied': "You don't have permission to view this page.",
    'auth.adminOnly': 'Access Denied. You must be an Admin to view this page.',
    'auth.managerAdminOnly':
      'Access Denied. You must be an Admin or Manager to view this page.',
    'auth.financeOnly':
      'Access Denied. You must be an Admin or Accountant to view this page.',
    'auth.operationsOnly':
      'Access Denied. You must be an Admin, Manager, or Accountant to view this page.',

    'projects.title': 'Projects',
    'projects.subtitle': 'Select a project to view its tasks or see all tasks below.',
    'projects.allTasks': 'All Tasks',

    'users.title': 'User Management',
    'users.subtitle': 'Add, edit, and manage users for your company.',
    'users.addUser': 'Add User',

    'companies.title': 'Companies',
    'companies.subtitle': 'Manage companies, positions, and user assignments.',
    'companies.tabCompanies': 'Companies',
    'companies.tabPositions': 'Positions',

    'diagram.title': 'Task Diagram',
    'diagram.subtitle': 'Visualize task dependencies and workflow for the selected company.',

    'finance.title': 'Finance',
    'finance.subtitle': 'Manage receivables, payables, and the general ledger.',
    'finance.tabOverview': 'Overview',
    'finance.tabInvoices': 'Invoices',
    'finance.tabPayables': 'Payables',
    'finance.tabLedger': 'General Ledger',
    'finance.tabExpenses': 'Expenses',
    'finance.tabClients': 'Clients',
    'finance.createInvoice': 'Create Invoice',
    'finance.sendAllDraft': 'Send All Draft',
    'finance.markAllSentPaid': 'Mark All Sent Paid',
    'finance.exportCsv': 'Export CSV',

    'sections.finance.title': 'Finance',
    'sections.finance.description': 'Receivables, payables, and accounting controls.',
    'sections.inventory.title': 'Inventory',
    'sections.inventory.description': 'Track stock, reorder points, and inbound quantities.',
    'sections.purchases.title': 'Purchases',
    'sections.purchases.description': 'Create purchase orders and receive stock into inventory.',
    'sections.clients.title': 'Client Management',
    'sections.clients.description': 'Manage clients linked to projects and invoices.',
    'sections.suppliers.title': 'Suppliers',
    'sections.suppliers.description': 'Maintain vendor records used by inventory and purchases.',

    'settings.title': 'Settings',
    'settings.subtitle': 'Manage your application settings and data.',
  },
  ar: {
    'language.english': 'الإنجليزية',
    'language.arabic': 'العربية',
    'language.switch': 'اللغة',

    'common.loading': 'جاري التحميل...',
    'common.accessDenied': 'تم رفض الوصول',
    'common.cancel': 'إلغاء',
    'common.continue': 'متابعة',

    'app.loadingTaskflow': 'جاري تحميل تاسك فلو...',

    'nav.dashboard': 'لوحة التحكم',
    'nav.projects': 'المشاريع',
    'nav.diagram': 'المخطط',
    'nav.finance': 'المالية',
    'nav.inventory': 'المخزون',
    'nav.purchases': 'المشتريات',
    'nav.clients': 'العملاء',
    'nav.suppliers': 'الموردون',
    'nav.users': 'المستخدمون',
    'nav.companies': 'الشركات',
    'nav.settings': 'الإعدادات',

    'company.search': 'ابحث عن شركة...',
    'company.none': 'لم يتم العثور على شركة.',

    'user.profile': 'الملف الشخصي',
    'user.settings': 'الإعدادات',
    'user.logout': 'تسجيل الخروج',

    'login.title': 'تسجيل الدخول',
    'login.subtitle': 'أدخل بريدك الإلكتروني أدناه لتسجيل الدخول إلى حسابك',
    'login.email': 'البريد الإلكتروني',
    'login.password': 'كلمة المرور',
    'login.signIn': 'دخول',
    'login.signingIn': 'جاري تسجيل الدخول...',
    'login.successTitle': 'تم تسجيل الدخول بنجاح',
    'login.successMessage': 'مرحبًا بعودتك!',
    'login.failedTitle': 'فشل تسجيل الدخول',
    'login.failedMessage': 'البريد الإلكتروني أو كلمة المرور غير صحيحة. حاول مرة أخرى.',
    'login.accessDeniedTitle': 'تم رفض الوصول',
    'login.accessDeniedMessage':
      'الحساب موجود لكن لم يتم إعداده من قبل المدير بعد. الرجاء التواصل مع المدير.',

    'auth.guardDenied': 'ليس لديك صلاحية عرض هذه الصفحة.',
    'auth.adminOnly': 'تم رفض الوصول. يجب أن تكون مسؤولًا لعرض هذه الصفحة.',
    'auth.managerAdminOnly': 'تم رفض الوصول. يجب أن تكون مسؤولًا أو مديرًا لعرض هذه الصفحة.',
    'auth.financeOnly': 'تم رفض الوصول. يجب أن تكون مسؤولًا أو محاسبًا لعرض هذه الصفحة.',
    'auth.operationsOnly':
      'تم رفض الوصول. يجب أن تكون مسؤولًا أو مديرًا أو محاسبًا لعرض هذه الصفحة.',

    'projects.title': 'المشاريع',
    'projects.subtitle': 'اختر مشروعًا لعرض مهامه أو شاهد جميع المهام أدناه.',
    'projects.allTasks': 'كل المهام',

    'users.title': 'إدارة المستخدمين',
    'users.subtitle': 'إضافة وتعديل وإدارة مستخدمي شركتك.',
    'users.addUser': 'إضافة مستخدم',

    'companies.title': 'الشركات',
    'companies.subtitle': 'إدارة الشركات والمناصب وتوزيع المستخدمين.',
    'companies.tabCompanies': 'الشركات',
    'companies.tabPositions': 'المناصب',

    'diagram.title': 'مخطط المهام',
    'diagram.subtitle': 'عرض تبعيات المهام وتدفق العمل للشركة المحددة.',

    'finance.title': 'المالية',
    'finance.subtitle': 'إدارة الذمم المدينة والذمم الدائنة ودفتر الأستاذ العام.',
    'finance.tabOverview': 'نظرة عامة',
    'finance.tabInvoices': 'الفواتير',
    'finance.tabPayables': 'المدفوعات المستحقة',
    'finance.tabLedger': 'دفتر الأستاذ العام',
    'finance.tabExpenses': 'المصروفات',
    'finance.tabClients': 'العملاء',
    'finance.createInvoice': 'إنشاء فاتورة',
    'finance.sendAllDraft': 'إرسال كل المسودات',
    'finance.markAllSentPaid': 'تعيين كل المرسلة كمدفوعة',
    'finance.exportCsv': 'تصدير CSV',

    'sections.finance.title': 'المالية',
    'sections.finance.description': 'إدارة الذمم المدينة والدائنة وضوابط المحاسبة.',
    'sections.inventory.title': 'المخزون',
    'sections.inventory.description': 'متابعة الرصيد ونقاط إعادة الطلب والكميات الواردة.',
    'sections.purchases.title': 'المشتريات',
    'sections.purchases.description': 'إنشاء أوامر شراء واستلامها مباشرة إلى المخزون.',
    'sections.clients.title': 'إدارة العملاء',
    'sections.clients.description': 'إدارة العملاء المرتبطين بالمشاريع والفواتير.',
    'sections.suppliers.title': 'الموردون',
    'sections.suppliers.description': 'إدارة المورّدين المستخدمين في المخزون وأوامر الشراء.',

    'settings.title': 'الإعدادات',
    'settings.subtitle': 'إدارة إعدادات التطبيق والبيانات.',
  },
};

interface I18nContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  isRtl: boolean;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = React.createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<AppLanguage>('en');

  React.useEffect(() => {
    const stored =
      typeof window !== 'undefined'
        ? (localStorage.getItem(LANGUAGE_KEY) as AppLanguage | null)
        : null;
    if (stored === 'en' || stored === 'ar') {
      setLanguageState(stored);
    }
  }, []);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  const setLanguage = React.useCallback((value: AppLanguage) => {
    setLanguageState(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LANGUAGE_KEY, value);
    }
  }, []);

  const t = React.useCallback(
    (key: string, fallback?: string) => {
      const fromLang = dictionaries[language]?.[key];
      if (fromLang) return fromLang;
      const fromEnglish = dictionaries.en[key];
      if (fromEnglish) return fromEnglish;
      return fallback ?? key;
    },
    [language],
  );

  const value = React.useMemo(
    () => ({
      language,
      setLanguage,
      isRtl: language === 'ar',
      t,
    }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return context;
}
