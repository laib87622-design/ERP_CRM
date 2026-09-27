import { Info, Plane, Tag, X } from 'lucide-react';

const resolveTicketValue = (value, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
};

const formatDZD = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(amount);
};

const getTripTypeLabel = (value) => {
  switch (value) {
    case 'one-way': return 'One Way';
    case 'round-trip': return 'Round Trip';
    case 'multi-city': return 'Multi City';
    default: return 'One Way';
  }
};

// 1. BULLETPROOF PARSER: Fixes the "TBD" white-screen bug from Supabase double-strings
const safeParseJSON = (data) => {
  if (!data) return {};
  let parsed = data;
  try {
    while (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    return parsed || {};
  } catch (e) {
    console.error("Failed to parse JSON:", e);
    return {};
  }
};

// 2. REUSABLE JOURNEY CARD: Automatically renders Outbound, Return, or Multi-City legs
const JourneyViewCard = ({ title, journey = {}, stops = [] }) => {
  const safeJourney = { ...journey };
  const departure = safeJourney.departure_time || safeJourney.departure || safeJourney.start_time || null;
  const arrival = safeJourney.arrival_time || safeJourney.arrival || safeJourney.end_time || null;

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-[#0a1120]">{title}</h3>

      <div className="overflow-hidden rounded-[28px] border border-[#e9e1c7] bg-white shadow-[0_18px_50px_rgba(10,17,32,0.08)] ring-1 ring-[#f3ead1]">
        <div className="flex items-center justify-between border-b border-[#f1e7c6] bg-[#f8fafc] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fffaf0] text-[#c9a84c] shadow-sm ring-1 ring-[#eadfb5]">
              ✈️
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Carrier</p>
              <p className="text-base font-black text-[#0a1120]">{safeJourney.airline || 'Unknown Airline'}</p>
            </div>
          </div>

          <span className="inline-flex items-center rounded-full border border-[#ead9a2] bg-[#fffaf0] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#0a1120]">
            Baggage: {safeJourney.baggage || '-'}
          </span>
        </div>

        <div className="px-5 pb-5 pt-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="min-w-0">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Departure</p>
              <p className="text-4xl font-black tracking-tight text-[#0a1120]">{safeJourney.start_airport || safeJourney.start || 'TBD'}</p>
              <p className="mt-2 text-sm text-slate-500">
                {departure ? new Date(departure).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Time TBD'}
              </p>
            </div>

            <div className="flex w-full min-w-[160px] flex-col items-center justify-center px-2">
              <div className="relative w-full">
                <div className="h-0 border-t-2 border-dashed border-[#cfd8e3]" />
                <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#c9a84c] bg-[#fffaf0] text-lg shadow-sm text-[#c9a84c]">
                  ✈️
                </div>
              </div>
              {stops.length > 0 && (
                <span className="mt-3 inline-flex rounded-full bg-[#fff7dd] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#0a1120]">
                  {stops.length} Layover{stops.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="min-w-0 text-right">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Arrival</p>
              <p className="text-4xl font-black tracking-tight text-[#0a1120]">{safeJourney.end_airport || safeJourney.end || 'TBD'}</p>
              <p className="mt-2 text-sm text-slate-500">
                {arrival ? new Date(arrival).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Time TBD'}
              </p>
            </div>
          </div>

          {stops.length > 0 && (
            <div className="mt-6 rounded-2xl border border-[#f1e7c6] bg-[#f8fafc] p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#fffaf0] text-sm text-[#c9a84c]">⏱️</span>
                <h4 className="text-sm font-black uppercase tracking-[0.14em] text-[#0a1120]">Layover Details</h4>
              </div>

              <div className="space-y-3">
                {stops.map((stop, idx) => (
                  <div key={stop.id || idx} className="ml-2 border-l-4 border-[#c9a84c] bg-white pl-4 py-3 pr-3 shadow-sm ring-1 ring-slate-100 rounded-r-xl">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">📍</span>
                        <span className="text-sm font-bold text-[#0a1120]">{stop.stop_airport || stop.airport || 'TBD'}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold">Arrives: {stop.arrival_time_at_stop ? new Date(stop.arrival_time_at_stop).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'TBD'}</span>
                        <span className="rounded-full bg-[#fffaf0] px-2 py-1 font-semibold text-[#0a1120]">Wait: {stop.stop_duration_hours || '0'}h</span>
                      </div>
                    </div>

                    {(stop.next_airline || stop.is_self_transfer) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {stop.is_self_transfer && (
                          <span className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-red-600 ring-1 ring-red-200">
                            ⚠️ Self Transfer
                          </span>
                        )}
                        {stop.next_airline && (
                          <span className="rounded-full bg-[#edf6ff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 ring-1 ring-blue-200">
                            ✈️ Next Flight: {stop.next_airline}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 3. MAIN MODAL COMPONENT
export default function TicketViewModal({ template, onClose }) {
  if (!template) return null;

  const flightDetails = safeParseJSON(template.flight_details) || {};
  const tripType = (flightDetails.trip_type || 'one-way').toLowerCase();

  const normalizeJourney = (journey = {}) => ({
    start_airport: journey.start_airport || journey.start || flightDetails.start_airport || flightDetails.start || 'TBD',
    end_airport: journey.end_airport || journey.end || flightDetails.end_airport || flightDetails.end || 'TBD',
    departure_time: journey.departure_time || journey.departure || flightDetails.departure_time || flightDetails.departure || null,
    arrival_time: journey.arrival_time || journey.arrival || flightDetails.arrival_time || flightDetails.arrival || null,
    airline: journey.airline || flightDetails.airline || 'Unknown Airline',
    baggage: journey.baggage || flightDetails.baggage || '-',
    start: journey.start_airport || journey.start || flightDetails.start_airport || flightDetails.start || 'TBD',
    end: journey.end_airport || journey.end || flightDetails.end_airport || flightDetails.end || 'TBD',
    departure: journey.departure_time || journey.departure || flightDetails.departure_time || flightDetails.departure || null,
    arrival: journey.arrival_time || journey.arrival || flightDetails.arrival_time || flightDetails.arrival || null,
  });

  const outboundJourney = normalizeJourney(
    flightDetails.outbound?.journey ||
    flightDetails.journey ||
    flightDetails.outbound ||
    flightDetails
  );
  const outboundStops = Array.isArray(flightDetails.outbound?.stops)
    ? flightDetails.outbound.stops
    : Array.isArray(flightDetails.stops)
      ? flightDetails.stops
      : [];
  const returnJourney = normalizeJourney(
    flightDetails.return_journey?.journey ||
    flightDetails.return?.journey ||
    flightDetails.return ||
    {}
  );
  const returnStops = Array.isArray(flightDetails.return_journey?.stops)
    ? flightDetails.return_journey.stops
    : Array.isArray(flightDetails.return?.stops)
      ? flightDetails.return.stops
      : [];
  const multiCityLegs = Array.isArray(flightDetails.multi_city_legs) ? flightDetails.multi_city_legs : [];
  
  const rawTags = safeParseJSON(template.target_tags);
  const tags = Array.isArray(rawTags) ? rawTags.filter(Boolean) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-[#ead9a2] bg-[#fdfdfb] shadow-2xl">
        
        <div className="border-b border-[#efe4c5] bg-[#fffaf0] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c9a84c]">Ticket promotion</p>
              <h3 className="mt-2 font-serif text-3xl text-[#0a1120]">{template.destination || template.label || 'Ticket Promotion Details'}</h3>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white p-2 text-[#0a1120] transition hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {tags.length > 0 && tags.map((tag, tagIndex) => (
              <span key={`${tag}-${tagIndex}`} className="inline-flex items-center rounded-full border border-[#e9d7a1] bg-[#fffdf7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0a1120]">
                <Tag size={11} className="mr-1 text-[#c9a84c]" />
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-6 p-5">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            
            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Destination</p>
                  <p className="mt-2 text-lg font-bold text-[#0a1120]">{resolveTicketValue(template.destination, '—')}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Selling price</p>
                  <p className="mt-2 text-lg font-bold text-[#0a1120]">{template.selling_price ? formatDZD(template.selling_price) : '—'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Available seats</p>
                  <p className="mt-2 text-lg font-bold text-[#0a1120]">{template?.stock || 0}</p>
                </div>
              </div>

              {/* DYNAMIC JOURNEY RENDERING */}
              {(tripType === 'one-way' || tripType === 'round-trip') && (
                <JourneyViewCard 
                  title="Outbound Journey" 
                  journey={outboundJourney} 
                  stops={outboundStops} 
                />
              )}

              {tripType === 'round-trip' && (
                <JourneyViewCard 
                  title="Return Journey" 
                  journey={returnJourney} 
                  stops={returnStops} 
                />
              )}

              {tripType === 'multi-city' && Array.isArray(multiCityLegs) && (
                multiCityLegs.map((leg, index) => (
                  <JourneyViewCard 
                    key={leg.id || index}
                    title={`Flight Leg ${index + 1}`} 
                    journey={leg.journey || leg} 
                    stops={Array.isArray(leg.stops) ? leg.stops : []} 
                  />
                ))
              )}

              <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-[#e9d7a1] bg-[#fffaf0] px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0a1120]">
                  <Plane size={15} className="text-[#c9a84c]" /> Trip type
                </div>
                <span className="rounded-full bg-[#0a1120] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                  {getTripTypeLabel(tripType)}
                </span>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-[#0a1120]">
                <Info size={16} className="text-[#c9a84c]" />
                <h4 className="text-lg font-semibold">Flight summary</h4>
              </div>
              <div className="space-y-3 text-sm text-[#0a1120]">
                <div className="rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2"><span className="text-slate-500">Country:</span> {resolveTicketValue(template.country, '—')}</div>
                <div className="rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2"><span className="text-slate-500">Departure point:</span> {resolveTicketValue(template.departure_point, '—')}</div>
                <div className="rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2"><span className="text-slate-500">Availability:</span> {template.is_available !== false ? 'Available' : 'Unavailable'}</div>
                <div className="rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2"><span className="text-slate-500">Service ref:</span> {resolveTicketValue(template.service_ref, '—')}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-[#0a1120]">
                <Info size={16} className="text-[#c9a84c]" />
                <h4 className="text-lg font-semibold">Fare rules</h4>
              </div>
              <p className="whitespace-pre-line text-sm text-[#0a1120]">{template.cancellation_policy || 'No fare rules provided.'}</p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-[#0a1120]">
                <Info size={16} className="text-[#c9a84c]" />
                <h4 className="text-lg font-semibold">Good to know</h4>
              </div>
              <p className="whitespace-pre-line text-sm text-[#0a1120]">{template.good_to_know || 'No extra guidance provided.'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}