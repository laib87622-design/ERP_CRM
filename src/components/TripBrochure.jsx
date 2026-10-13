import { forwardRef } from 'react';

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getListValues = (value) => parseArray(value)
  .map((item) => typeof item === 'string' ? item : item?.value || item?.label || '')
  .filter(Boolean);

const getTextLines = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === 'string' ? item : item?.value || item?.label || '').filter(Boolean);
  }

  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
};

const TripBrochure = forwardRef(({ packageData }, ref) => {
  if (!packageData) return null;

  const travelDate = parseArray(packageData.travel_dates)[0] || parseArray(packageData.travel_schedule)[0] || {};
  const hotels = parseArray(packageData.hotels);
  const baseHotels = hotels.filter((hotel) => hotel.pricing_scope !== 'optional' && hotel.is_primary !== false);
  const optionalHotels = hotels.filter((hotel) => hotel.pricing_scope === 'optional' || hotel.is_primary === false);
  const primaryHotelWithPrice = baseHotels.find((hotel) => hotel.prix_single || hotel.prix_double || hotel.prix_triple) || {};
  const inclusions = getListValues(packageData.inclusions);
  const exclusions = getListValues(packageData.exclusions);
  const cancellationRules = getTextLines(packageData.cancellation_policy);
  const goodToKnowNotes = getTextLines(packageData.good_to_know);
  const singlePrice = travelDate.prix_single || primaryHotelWithPrice.prix_single || '---';
  const doublePrice = travelDate.prix_double || primaryHotelWithPrice.prix_double || '---';
  const triplePrice = travelDate.prix_triple || primaryHotelWithPrice.prix_triple || '---';
  const getHotelName = (hotel) => hotel.hotel_name || hotel.name || 'Hotel';
  const getOptionalReplacement = (hotel) => hotels.find((item) => item.id === hotel.replacement_for_hotel_id);
  const formatPrice = (value) => value === '' || value === null || value === undefined || value === '---'
    ? '---'
    : Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : String(value);

  return (
    <div ref={ref} className="mx-auto w-[800px] bg-white p-10 font-sans text-slate-800">
      <div className="mb-8 flex items-end justify-between border-b border-slate-200 pb-6">
        <img
          src="https://bawmnczhczzyatdunbmv.supabase.co/storage/v1/object/public/LOGO/WhatsApp%20Image%202026-10-02%20at%2018.22.45.jpeg"
          alt="Sefar Travel Services"
          crossOrigin="anonymous"
          className="h-16 object-contain"
        />
        <div className="space-y-1 text-right text-xs text-slate-500">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-800">Sefar Travel Services</h2>
          <p>Rue Horchi Slimane N°28 Sidi Mabrouk</p>
          <p>Constantine, Algeria</p>
          <p>Email: sefartravelservices@gmail.com | Phone: 0562884864</p>
        </div>
      </div>

      <div className="mb-10 text-center">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-600">{packageData.country || 'International Trip'}</p>
        <h1 className="mb-4 text-4xl font-light text-slate-900">{packageData.destination || packageData.label}</h1>
        <div className="flex justify-center gap-8 rounded-lg border border-slate-100 bg-slate-50 py-3 text-sm text-slate-600">
          <p><strong>Departure:</strong> {travelDate.departure_date || packageData.departure_date || 'TBA'}</p>
          <p><strong>Return:</strong> {travelDate.return_date || packageData.return_date || 'TBA'}</p>
          <p><strong>Transport:</strong> {travelDate.transport || packageData.transport || 'TBA'}</p>
          <p><strong>Duration:</strong> {packageData.duration_nights ? `${packageData.duration_nights} nights` : 'TBA'}</p>
        </div>
      </div>

      <div className="mb-10">
        <h3 className="mb-4 border-b border-slate-200 pb-2 text-lg font-semibold uppercase tracking-wide">Base Package &amp; Pricing</h3>
        <div className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <h4 className="mb-3 text-xs font-bold uppercase text-slate-500">Included Accommodations</h4>
            <div className="space-y-3">
              {baseHotels.length ? baseHotels.map((hotel, index) => (
                <div key={hotel.id || index} className="rounded border border-slate-100 bg-slate-50 p-3">
                  <p className="text-sm font-semibold">{getHotelName(hotel)}</p>
                  <p className="text-xs text-slate-500">{hotel.nights || '—'} Nights · Meal Plan: {hotel.meal_type || 'N/A'}</p>
                </div>
              )) : <p className="text-sm text-slate-500">No included accommodations listed.</p>}
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-bold uppercase text-slate-500">Standard Rates</h4>
            <div className="space-y-2 rounded border border-slate-100 bg-slate-50 p-4">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-sm">Single Room</span>
                <span className="font-semibold">{formatPrice(singlePrice)} DA</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-sm">Double Room</span>
                <span className="font-semibold">{formatPrice(doublePrice)} DA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Triple Room</span>
                <span className="font-semibold">{formatPrice(triplePrice)} DA</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {optionalHotels.length > 0 && (
        <div className="mb-10 break-inside-avoid">
          <h3 className="mb-4 border-b border-slate-200 pb-2 text-lg font-semibold uppercase tracking-wide text-amber-700">Optional Upgrades</h3>
          <div className="space-y-4">
            {optionalHotels.map((hotel, index) => {
              const replacement = getOptionalReplacement(hotel);
              return (
                <div key={hotel.id || index} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/30 p-4">
                  <div>
                    <p className="font-bold text-slate-800">{getHotelName(hotel)}</p>
                    <p className="mt-1 text-xs text-slate-500">Replaces: {replacement ? getHotelName(replacement) : 'Standard Hotel'} · {hotel.nights || '—'} Nights · {hotel.meal_type || 'N/A'}</p>
                  </div>
                  <div className="space-y-1 text-right text-sm">
                    <p><span className="text-slate-500">Single:</span> <span className="font-bold">{formatPrice(hotel.prix_single)} DA</span></p>
                    <p><span className="text-slate-500">Double:</span> <span className="font-bold">{formatPrice(hotel.prix_double)} DA</span></p>
                    <p><span className="text-slate-500">Triple:</span> <span className="font-bold">{formatPrice(hotel.prix_triple)} DA</span></p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-8 break-inside-avoid">
        {inclusions.length > 0 && (
          <div>
            <h3 className="mb-3 border-b border-slate-200 pb-2 text-sm font-bold uppercase text-slate-800">Included</h3>
            <ul className="space-y-2 text-xs text-slate-600">
              {inclusions.map((inclusion, index) => (
                <li key={`${inclusion}-${index}`} className="flex items-start gap-2"><span className="text-green-500">✓</span>{inclusion}</li>
              ))}
            </ul>
          </div>
        )}
        {exclusions.length > 0 && (
          <div>
            <h3 className="mb-3 border-b border-slate-200 pb-2 text-sm font-bold uppercase text-slate-800">Not Included</h3>
            <ul className="space-y-2 text-xs text-slate-600">
              {exclusions.map((exclusion, index) => (
                <li key={`${exclusion}-${index}`} className="flex items-start gap-2"><span className="text-red-400">✗</span>{exclusion}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-8 break-inside-avoid">
        {cancellationRules.length > 0 && (
          <div>
            <h3 className="mb-3 border-b border-slate-200 pb-2 text-sm font-bold uppercase text-slate-800">Cancellation Policy</h3>
            <ul className="list-disc space-y-2 pl-4 text-xs text-slate-600">
              {cancellationRules.map((rule, index) => <li key={`${rule}-${index}`}>{rule}</li>)}
            </ul>
          </div>
        )}
        {goodToKnowNotes.length > 0 && (
          <div>
            <h3 className="mb-3 border-b border-slate-200 pb-2 text-sm font-bold uppercase text-slate-800">Good to Know</h3>
            <ul className="list-disc space-y-2 pl-4 text-xs text-slate-600">
              {goodToKnowNotes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
});

TripBrochure.displayName = 'TripBrochure';

export default TripBrochure;
