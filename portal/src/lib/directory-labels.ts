import type { Lang } from './i18n';

/**
 * Arabic names for the niches and places staff type in English. Values not
 * listed show as typed, so a new niche never disappears, it just waits for a
 * translation here.
 */
const NICHES: Record<string, string> = {
  lifestyle: 'نمط الحياة', advertising: 'إعلانات', mixed: 'متنوع', cars: 'سيارات', actor: 'تمثيل', model: 'عارض أزياء',
  promoter: 'ترويج', food: 'طعام', fashion: 'أزياء', beauty: 'جمال', tech: 'تقنية', travel: 'سفر', fitness: 'لياقة',
  family: 'عائلة', gaming: 'ألعاب', sports: 'رياضة', comedy: 'كوميديا', music: 'موسيقى', education: 'تعليم',
  health: 'صحة', business: 'أعمال', film: 'أفلام', books: 'كتب', photography: 'تصوير', art: 'فن', automotive: 'سيارات',
};
const PLACES: Record<string, string> = {
  muscat: 'مسقط', salalah: 'صلالة', sohar: 'صحار', nizwa: 'نزوى', sur: 'صور', ibri: 'عبري', buraimi: 'البريمي',
  barka: 'بركاء', batinah: 'الباطنة', oman: 'عُمان', seeb: 'السيب', rustaq: 'الرستاق', duqm: 'الدقم', khasab: 'خصب',
};

export const nicheLabel = (v: string, lang: Lang) => (lang === 'ar' ? NICHES[v.trim().toLowerCase()] ?? v : v);
export const placeLabel = (v: string, lang: Lang) => (lang === 'ar' ? PLACES[v.trim().toLowerCase()] ?? v : v);
