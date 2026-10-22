import { forwardRef } from 'react';
import backgroundImage from '../assets/background.jpg';
import {
  getBrochureItineraryDays,
  getBrochureTravelDatePricing,
  parseBrochureArray,
} from '../lib/packageBrochureData';

const defaultAgencyInfo = {
  agency_name: 'SEFAR TRAVEL SERVICES',
  address: 'شارع حرشي سليمان رقم 28 سيدي مبروك',
  city: 'قسنطينة',
  phone: '0562884864',
  email: 'sefartravelservices@gmail.com',
};

const arabicRateLabels = { Single: 'فردي', Double: 'ثنائي', Triple: 'ثلاثي' };

const getListValues = (value) => parseBrochureArray(value)
  .map((item) => typeof item === 'string' ? item : item?.value || item?.label || '')
  .filter(Boolean);

const HajjOmraBrochure = forwardRef(({ packageData }, ref) => {
  if (!packageData) return null;

  const agencyInfo = { ...defaultAgencyInfo, ...(packageData.agencySettings || {}) };
  const travelDates = parseBrochureArray(packageData.travel_dates).length
    ? parseBrochureArray(packageData.travel_dates)
    : parseBrochureArray(packageData.travel_schedule);
  const legs = travelDates.length ? travelDates : [{
    departure_date: packageData.departure_date,
    return_date: packageData.return_date,
    destination: packageData.destination,
    departure_point: packageData.departure_point,
    transport: packageData.transport,
  }];
  const hotels = parseBrochureArray(packageData.hotels);
  const inclusions = getListValues(packageData.inclusions);
  const exclusions = getListValues(packageData.exclusions);
  const itineraryDays = getBrochureItineraryDays(packageData);
  const formatPrice = (value) => value === '' || value === null || value === undefined
    ? '---'
    : Number.isFinite(Number(value)) ? Number(value).toLocaleString('ar-DZ') : String(value);
  const formatLocation = (location) => ({ Mecca: 'مكة المكرمة', Medina: 'المدينة المنورة' })[location] || location || '---';
  const agencyAddress = [agencyInfo.address, agencyInfo.city, agencyInfo.wilaya].filter(Boolean).join('، ');
  const getHotelLegIndex = (hotel) => {
    if (hotel.travel_date_id) {
      const matchedIndex = legs.findIndex((leg) => leg.id === hotel.travel_date_id);
      if (matchedIndex >= 0) return matchedIndex;
    }
    if (hotel.travel_date_label) {
      const matchedIndex = legs.findIndex((leg) => leg.label === hotel.travel_date_label);
      if (matchedIndex >= 0) return matchedIndex;
    }
    return 0;
  };

  return (
    <div
      ref={ref}
      dir="rtl"
      className="relative mx-auto w-[800px] max-w-full bg-white p-8 text-slate-900 font-['Amiri',serif] print:static print:m-0 print:w-full print:max-w-none print:overflow-visible print:bg-white print:p-0"
      style={{ backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', fontFamily: "'Amiri', serif" }}
    >
      <div className="absolute inset-0 z-0 bg-white/95" />

      <div className="relative z-10">
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-amber-900/20 pb-4">
          <img
            src="https://bawmnczhczzyatdunbmv.supabase.co/storage/v1/object/public/LOGO/WhatsApp%20Image%202026-10-02%20at%2018.22.45.jpeg"
            alt="شركة سفار للخدمات السياحية"
            crossOrigin="anonymous"
            className="h-16 object-contain"
          />
          <div className="min-w-0 max-w-[55%] space-y-1 break-words whitespace-normal text-left text-xs text-slate-600">
            <h2 className="text-base font-bold uppercase tracking-widest text-amber-900">{agencyInfo.agency_name || defaultAgencyInfo.agency_name}</h2>
            {agencyAddress && <p>{agencyAddress}</p>}
            <p>الهاتف: {agencyInfo.phone || defaultAgencyInfo.phone} | البريد: {agencyInfo.email || defaultAgencyInfo.email}</p>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-amber-900/10 bg-amber-50/50 p-4 text-center">
          <span className="rounded-full bg-amber-100/80 px-3 py-1 text-xs font-bold uppercase text-amber-800">برنامج رحلة مقدسة</span>
          <h1 className="mb-2 mt-3 text-3xl font-bold text-slate-900">{packageData.label || 'برنامج الحج والعمرة'}</h1>
          <p className="mt-4 text-sm text-slate-700">المدة الإجمالية: {packageData.duration_nights || '---'} ليال</p>
        </div>

        <div className="mb-5 break-inside-avoid">
          <h3 className="mb-2 border-b border-amber-900/20 pb-2 text-lg font-bold text-amber-900">مواعيد الرحلات</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
            {legs.map((leg, legIndex) => (
              <section key={leg.id || `travel-leg-${legIndex}`} className="min-w-0 break-inside-avoid rounded-lg border border-amber-900/10 bg-amber-50/30 p-2 text-[10px] leading-4 text-slate-700 break-words whitespace-normal">
                <p className="mb-1 break-words font-bold text-amber-900">{leg.destination || packageData.destination || `الرحلة ${legIndex + 1}`}</p>
                <p className="break-words"><strong>من:</strong> {leg.departure_point || packageData.departure_point || '---'}</p>
                <p className="break-words"><strong>الذهاب:</strong> {leg.departure_date || packageData.departure_date || 'يحدد لاحقاً'}</p>
                <p className="break-words"><strong>العودة:</strong> {leg.return_date || packageData.return_date || 'يحدد لاحقاً'}</p>
                <p className="break-words"><strong>النقل:</strong> {leg.transport || packageData.transport || '---'}</p>
                {(() => {
                  const { standardRates, customPrices } = getBrochureTravelDatePricing(leg, hotels, legIndex);
                  if (!standardRates.length && !customPrices.length) return null;
                  return (
                  <div className="mt-2 space-y-1 border-t border-amber-900/10 pt-1">
                    {standardRates.map((rate) => (
                        <p key={rate.label} className="flex justify-between gap-1 break-words">
                          <span>{arabicRateLabels[rate.label]}:</span>
                          <strong className="text-amber-900">{formatPrice(rate.value)} دج</strong>
                        </p>
                      ))}
                    {customPrices.map((customPrice, priceIndex) => (
                        <p key={`${customPrice.name}-${customPrice.value}-${priceIndex}`} className="flex justify-between gap-1 break-words">
                          <span>{customPrice.name}:</span>
                          <strong className="text-amber-900">{formatPrice(customPrice.value)} دج</strong>
                        </p>
                      ))}
                  </div>
                  );
                })()}
              </section>
            ))}
          </div>
        </div>

        {itineraryDays.length > 0 && (
          <section className="mb-5">
            <h3 className="mb-2 border-b border-amber-900/20 pb-2 text-lg font-bold text-amber-900">برنامج الرحلة اليومي</h3>
            <div className="space-y-2">
              {itineraryDays.map((day, dayIndex) => (
                <article key={`${day.label}-${dayIndex}`} className="break-inside-avoid rounded-lg border border-amber-900/10 bg-white/80 p-3">
                  <h4 className="mb-1 text-sm font-bold text-amber-900">{day.label}</h4>
                  {day.description && <p className="whitespace-pre-wrap text-xs leading-5 text-slate-700">{day.description}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        <div className="mb-5">
          <h3 className="mb-2 border-b border-amber-900/20 pb-2 text-lg font-bold text-amber-900">الفنادق والأسعار</h3>
          {hotels.length ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
              {hotels.map((hotel, hotelIndex) => {
                const legIndex = getHotelLegIndex(hotel);
                const leg = legs[legIndex] || {};
                const customPrices = parseBrochureArray(hotel.custom_prices);
                return (
                  <article key={hotel.id || `hotel-${hotelIndex}`} className="min-w-0 break-inside-avoid rounded-lg border border-slate-200 bg-white p-2 shadow-sm break-words whitespace-normal">
                    <p className="mb-1 break-words text-[10px] font-bold text-amber-800">{leg.destination || packageData.destination || `الرحلة ${legIndex + 1}`}</p>
                    <div className="min-w-0 space-y-1.5">
                      <div className="min-w-0 break-words whitespace-normal">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h4 className="min-w-0 break-words text-sm font-bold text-slate-900">{hotel.hotel_name || hotel.name || 'فندق'}</h4>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{hotel.nights || '---'} ليال</span>
                          {hotel.is_primary === false && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">اختياري</span>}
                        </div>
                        <p className="mt-1 break-words whitespace-normal text-[10px] leading-4 text-slate-500">الموقع: {formatLocation(hotel.location)} | المسافة: {hotel.distance_from_haram || '---'} | الوجبات: {hotel.meal_type || '---'}</p>
                      </div>
                      <div className="min-w-0 space-y-0.5 rounded border border-slate-100 bg-slate-50 p-1.5 text-[10px] leading-4 break-words whitespace-normal">
                        <div className="flex justify-between gap-1"><span className="min-w-0 break-words">فردي:</span><strong className="min-w-0 break-words text-amber-900">{formatPrice(hotel.prix_single)} دج</strong></div>
                        <div className="flex justify-between gap-1"><span className="min-w-0 break-words">ثنائي:</span><strong className="min-w-0 break-words text-amber-900">{formatPrice(hotel.prix_double)} دج</strong></div>
                        <div className="flex justify-between gap-1"><span className="min-w-0 break-words">ثلاثي:</span><strong className="min-w-0 break-words text-amber-900">{formatPrice(hotel.prix_triple)} دج</strong></div>
                        {customPrices.length > 0 && (
                          <div className="mt-1 space-y-0.5 border-t border-slate-200 pt-1">
                            <p className="break-words text-[10px] font-bold leading-4 text-amber-900">أسعار إضافية / خاصة:</p>
                            {customPrices.map((customPrice, priceIndex) => (
                              <div key={customPrice.id || priceIndex} className="flex justify-between gap-1 whitespace-normal break-words text-[10px] leading-4 text-slate-700">
                                <span className="min-w-0 break-words">{customPrice.label || customPrice.name || 'سعر خاص'}:</span>
                                <strong className="min-w-0 break-words text-amber-900">{formatPrice(customPrice.price ?? customPrice.amount)} دج</strong>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : <p className="text-sm text-slate-500">لا توجد فنادق مضافة لهذا البرنامج.</p>}
        </div>

        {(inclusions.length > 0 || exclusions.length > 0) && (
          <div className="grid grid-cols-2 gap-6 text-xs text-slate-700">
            {inclusions.length > 0 && (
              <div className="rounded-xl border border-emerald-900/10 bg-emerald-50/50 p-4">
                <h4 className="mb-2 font-bold uppercase text-emerald-900">الخدمات المتضمنة</h4>
                <ul className="space-y-1.5">
                  {inclusions.map((inclusion, index) => <li key={`${inclusion}-${index}`} className="flex items-center gap-2"><span>✓</span>{inclusion}</li>)}
                </ul>
              </div>
            )}
            {exclusions.length > 0 && (
              <div className="rounded-xl border border-rose-900/10 bg-rose-50/50 p-4">
                <h4 className="mb-2 font-bold uppercase text-rose-900">الخدمات غير المتضمنة</h4>
                <ul className="space-y-1.5">
                  {exclusions.map((exclusion, index) => <li key={`${exclusion}-${index}`} className="flex items-center gap-2"><span>✗</span>{exclusion}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

HajjOmraBrochure.displayName = 'HajjOmraBrochure';

export default HajjOmraBrochure;
