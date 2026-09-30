import { formatMoney } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';
import type { PriceView } from '@/lib/catalogue';

export function PriceTag({ price, lang, detailed = false }: { price: PriceView; lang: Lang; detailed?: boolean }) {
  if (price.kind === 'indicative') {
    return (
      <div>
        <p className="font-semibold tabular-nums">
          <bdi dir="ltr">{formatMoney(price.amount, price.currency, lang)}</bdi>
          <span className="ms-1 text-sm font-normal text-ink-soft">{t(lang, 'cat.perPost')}</span>
        </p>
        {detailed && <p className="mt-1 text-sm text-ink-soft">{t(lang, 'cat.indicativeNote')}</p>}
      </div>
    );
  }
  return <p className="text-sm text-ink-soft">{t(lang, price.kind === 'retainer' ? 'cat.retainer' : 'cat.onRequest')}</p>;
}
