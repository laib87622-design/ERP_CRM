import { forwardRef } from 'react';

const defaultAgencyInfo = {
  agency_name: 'SEFAR TRAVEL SERVICES',
  address: '',
  city: '',
  phone: '0562884864',
  email: 'sefartravelservices@gmail.com',
};

const parseObject = (value) => {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const HotelPromotionBrochure = forwardRef(({ packageData }, ref) => {
  if (!packageData) return null;

  const hotel = parseObject(packageData.hotel_details);
  const agency = { ...defaultAgencyInfo, ...(packageData.agencySettings || {}) };
  const agencyAddress = [agency.address, agency.city, agency.wilaya].filter(Boolean).join(', ');
  const stars = Math.max(0, Math.min(5, Number(hotel.stars) || 0));
  const discountValue = Number(hotel.discount_value || 0);
  const isFixedDiscount = hotel.discount_type === 'fixed';
  const discountLabel = isFixedDiscount
    ? `${discountValue.toLocaleString('en-US')} DA OFF`
    : `${discountValue}% OFF`;
  const hotelName = hotel.hotel_name || packageData.label || 'Hotel Promotion';
  const location = [hotel.province, hotel.country || packageData.country].filter(Boolean).join(', ');

  return (
    <div ref={ref} className="mx-auto min-h-[1050px] w-[800px] max-w-full bg-white p-12 font-sans text-slate-800">
      <header className="mb-12 flex items-end justify-between gap-8 border-b border-slate-200 pb-6">
        <img
          src="https://bawmnczhczzyatdunbmv.supabase.co/storage/v1/object/public/LOGO/WhatsApp%20Image%202026-10-02%20at%2018.22.45.jpeg"
          alt={agency.agency_name || defaultAgencyInfo.agency_name}
          crossOrigin="anonymous"
          className="h-16 max-w-[180px] object-contain"
        />
        <div className="max-w-[55%] break-words text-right text-xs leading-5 text-slate-500">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-widest text-slate-800">{agency.agency_name || defaultAgencyInfo.agency_name}</h2>
          {agencyAddress && <p>{agencyAddress}</p>}
          <p>Phone: {agency.phone || defaultAgencyInfo.phone}</p>
          <p>Email: {agency.email || defaultAgencyInfo.email}</p>
        </div>
      </header>

      <main>
        <section className="mb-10 border-b border-slate-200 pb-8 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Hotel Promotion</p>
          <h1 className="break-words text-4xl font-light text-slate-900">{hotelName}</h1>
          <p className="mt-2 text-sm text-slate-600">{location || 'Location available upon request'}</p>
          <div className="mt-3 text-xl tracking-widest text-amber-600" aria-label={`${stars} out of 5 stars`}>
            {Array.from({ length: stars }, (_, index) => <span key={index}>★</span>)}
            {stars === 0 && <span className="text-sm tracking-normal text-slate-400">Rating not provided</span>}
          </div>
        </section>

        <section className="mb-10 rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">Special Discount</p>
          <p className="mt-2 text-4xl font-semibold text-amber-900">{discountLabel}</p>
          <p className="mt-2 text-sm text-slate-600">
            Valid stay: {hotel.start_date || 'Dates to be confirmed'}
            {hotel.end_date ? ` to ${hotel.end_date}` : ''}
          </p>
        </section>

        {(hotel.hotel_website || hotel.hotel_map_url) && (
          <section className="flex flex-wrap justify-center gap-4 border-t border-slate-200 pt-6 text-sm">
            {hotel.hotel_website && (
              <a href={hotel.hotel_website} target="_blank" rel="noreferrer" className="rounded border border-slate-300 px-4 py-2 font-medium text-slate-700 underline underline-offset-2">
                Hotel Website
              </a>
            )}
            {hotel.hotel_map_url && (
              <a href={hotel.hotel_map_url} target="_blank" rel="noreferrer" className="rounded border border-slate-300 px-4 py-2 font-medium text-slate-700 underline underline-offset-2">
                Google Maps
              </a>
            )}
          </section>
        )}
      </main>
    </div>
  );
});

HotelPromotionBrochure.displayName = 'HotelPromotionBrochure';

export default HotelPromotionBrochure;
