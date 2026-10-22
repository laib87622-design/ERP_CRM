import { forwardRef } from 'react';
import {
  getBrochureItineraryDays,
  getBrochureTravelDatePricing,
  parseBrochureArray,
} from '../lib/packageBrochureData';

const getListValues = (value) => parseBrochureArray(value)
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

  const travelDates = parseBrochureArray(packageData.travel_dates).length
    ? parseBrochureArray(packageData.travel_dates)
    : parseBrochureArray(packageData.travel_schedule);
  const hotels = parseBrochureArray(packageData.hotels);
  const legs = travelDates.length ? travelDates : [{
    departure_date: packageData.departure_date,
    return_date: packageData.return_date,
    destination: packageData.destination,
    departure_point: packageData.departure_point,
    transport: packageData.transport,
  }];
  const baseHotels = hotels.filter((hotel) => hotel.pricing_scope !== 'optional' && hotel.is_primary !== false);
  const optionalHotels = hotels.filter((hotel) => hotel.pricing_scope === 'optional' || hotel.is_primary === false);
  const primaryHotelWithPrice = baseHotels.find((hotel) => hotel.prix_single || hotel.prix_double || hotel.prix_triple) || {};
  const inclusions = getListValues(packageData.inclusions);
  const exclusions = getListValues(packageData.exclusions);
  const itineraryDays = getBrochureItineraryDays(packageData);
  const cancellationRules = getTextLines(packageData.cancellation_policy);
  const goodToKnowNotes = getTextLines(packageData.good_to_know);
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
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 rounded-lg border border-slate-100 bg-slate-50 py-3 text-sm text-slate-600">
          <p><strong>Duration:</strong> {packageData.duration_nights ? `${packageData.duration_nights} nights` : 'TBA'}</p>
          {legs.slice(0, 1).map((leg, index) => (
            <p key={leg.id || index}>
              <strong>Departure:</strong> {leg.departure_date || 'TBA'}
              {' · '}
              <strong>Return:</strong> {leg.return_date || 'TBA'}
              {' · '}
              <strong>Transport:</strong> {leg.transport || 'TBA'}
            </p>
          ))}
        </div>
      </div>

      {itineraryDays.length > 0 && (
        <section className="mb-8">
          <h3 className="mb-4 border-b border-slate-200 pb-2 text-lg font-semibold uppercase tracking-wide">Itinerary</h3>
          <div className="space-y-3">
            {itineraryDays.map((day, index) => (
              <article key={`${day.label}-${index}`} className="break-inside-avoid rounded-lg border border-slate-100 bg-slate-50 p-4">
                <h4 className="mb-1 font-semibold text-slate-800">{day.label}</h4>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{day.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h3 className="mb-4 border-b border-slate-200 pb-2 text-lg font-semibold uppercase tracking-wide">Travel Dates &amp; Pricing</h3>
        <div className="space-y-3">
          {legs.map((leg, index) => {
            const { standardRates, customPrices } = getBrochureTravelDatePricing(leg, hotels, index);
            return (
              <article key={leg.id || `travel-date-${index}`} className="break-inside-avoid rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="mb-2 font-semibold text-slate-800">{leg.label || `Travel Date ${index + 1}`}</h4>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                  <span><strong>Departure:</strong> {leg.departure_date || 'TBA'}</span>
                  <span><strong>Return:</strong> {leg.return_date || 'TBA'}</span>
                  <span><strong>Transport:</strong> {leg.transport || 'TBA'}</span>
                  {leg.departure_point && <span><strong>From:</strong> {leg.departure_point}</span>}
                </div>
                {(standardRates.length > 0 || customPrices.length > 0) && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {standardRates.map((rate) => (
                      <p key={rate.label} className="flex justify-between gap-3 rounded bg-slate-50 px-3 py-2 text-sm">
                        <span>{rate.label}</span>
                        <strong>{formatPrice(rate.value)} DA</strong>
                      </p>
                    ))}
                    {customPrices.map((rate, rateIndex) => (
                      <p key={`${rate.name}-${rate.value}-${rateIndex}`} className="flex justify-between gap-3 rounded bg-amber-50 px-3 py-2 text-sm">
                        <span>{rate.name}</span>
                        <strong>{formatPrice(rate.value)} DA</strong>
                      </p>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

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
                <span className="font-semibold">{formatPrice(primaryHotelWithPrice.prix_single)} DA</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-sm">Double Room</span>
                <span className="font-semibold">{formatPrice(primaryHotelWithPrice.prix_double)} DA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Triple Room</span>
                <span className="font-semibold">{formatPrice(primaryHotelWithPrice.prix_triple)} DA</span>
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
