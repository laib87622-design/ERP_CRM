import React from 'react';

const safeParseJSON = (data) => {
  if (!data) return null;
  let parsed = data;
  try {
    while (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    return parsed;
  } catch (e) {
    console.error('Failed to parse JSON in builder:', e);
    return null;
  }
};

const JourneySection = ({ title, journey, stops, onUpdateJourney, onAddStop, onUpdateStop, onRemoveStop }) => (
  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-4">
    <h3 className="font-bold text-lg mb-4">{title}</h3>
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col">
        <label className="text-xs font-semibold text-slate-500 mb-1">Start Airport</label>
        <input placeholder="e.g. ALG" value={journey.start_airport || ''} onChange={(e) => onUpdateJourney('start_airport', e.target.value)} className="border p-2 rounded" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-semibold text-slate-500 mb-1">End Airport</label>
        <input placeholder="e.g. IST" value={journey.end_airport || ''} onChange={(e) => onUpdateJourney('end_airport', e.target.value)} className="border p-2 rounded" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-semibold text-slate-500 mb-1">Departure Time</label>
        <input type="datetime-local" value={journey.departure_time || ''} onChange={(e) => onUpdateJourney('departure_time', e.target.value)} className="border p-2 rounded" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-semibold text-slate-500 mb-1">Arrival Time</label>
        <input type="datetime-local" value={journey.arrival_time || ''} onChange={(e) => onUpdateJourney('arrival_time', e.target.value)} className="border p-2 rounded" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-semibold text-slate-500 mb-1">Airline</label>
        <input placeholder="e.g. Air Algerie" value={journey.airline || ''} onChange={(e) => onUpdateJourney('airline', e.target.value)} className="border p-2 rounded" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs font-semibold text-slate-500 mb-1">Baggage</label>
        <input placeholder="e.g. 23kg * 2" value={journey.baggage || ''} onChange={(e) => onUpdateJourney('baggage', e.target.value)} className="border p-2 rounded" />
      </div>
    </div>

    <div className="flex flex-col gap-4 mt-6">
      <div className="flex justify-between items-center">
        <h4 className="font-bold">Layovers / Stops</h4>
        <button type="button" onClick={onAddStop} className="bg-slate-900 text-white px-3 py-1.5 rounded text-sm font-semibold hover:bg-slate-800">
          + Add Stop
        </button>
      </div>

      {stops.map((stop, index) => (
        <div key={stop.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border relative">
          <div className="col-span-full flex justify-between border-b pb-2">
            <span className="font-bold text-slate-700">Layover {index + 1}</span>
            <button type="button" onClick={() => onRemoveStop(stop.id)} className="text-red-500 text-sm font-bold hover:underline">Remove</button>
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 mb-1">Layover Airport</label>
            <input placeholder="e.g. IST" value={stop.stop_airport || ''} onChange={(e) => onUpdateStop(stop.id, 'stop_airport', e.target.value)} className="border p-2 rounded text-sm" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 mb-1">Arrival at Stop</label>
            <input type="datetime-local" value={stop.arrival_time_at_stop || ''} onChange={(e) => onUpdateStop(stop.id, 'arrival_time_at_stop', e.target.value)} className="border p-2 rounded text-sm" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 mb-1">Wait Duration (Hours)</label>
            <input type="number" placeholder="e.g. 3" value={stop.stop_duration_hours || ''} onChange={(e) => onUpdateStop(stop.id, 'stop_duration_hours', e.target.value)} className="border p-2 rounded text-sm" />
          </div>
          <div className="col-span-full flex flex-col sm:flex-row gap-4 items-center bg-white p-3 rounded border">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-red-600">
              <input type="checkbox" checked={stop.is_self_transfer || false} onChange={(e) => onUpdateStop(stop.id, 'is_self_transfer', e.target.checked)} className="w-4 h-4" />
              ⚠️ Self Transfer
            </label>
            <input type="text" placeholder="Next Airline (Leave blank if same)" value={stop.next_airline || ''} onChange={(e) => onUpdateStop(stop.id, 'next_airline', e.target.value)} className="border p-2 rounded flex-1 text-sm" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default function FlightItineraryBuilder({ value, onChange }) {
  const flightDetails = safeParseJSON(value) || { trip_type: 'one-way', outbound: { journey: {}, stops: [] } };
  const tripType = flightDetails.trip_type || 'one-way';
  const outbound = flightDetails.outbound || { journey: {}, stops: [] };
  const returnJourney = flightDetails.return_journey || { journey: {}, stops: [] };
  const multiCityLegs = Array.isArray(flightDetails.multi_city_legs) ? flightDetails.multi_city_legs : [];

  const updateTripType = (type) => onChange({ ...flightDetails, trip_type: type });

  const createStop = () => ({
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `stop-${Date.now()}`,
    stop_airport: '',
    arrival_time_at_stop: '',
    stop_duration_hours: '',
    next_airline: '',
    is_self_transfer: false,
  });

  const updateSection = (sectionKey, field, val) => {
    const section = flightDetails[sectionKey] || { journey: {}, stops: [] };
    onChange({
      ...flightDetails,
      [sectionKey]: { ...section, journey: { ...section.journey, [field]: val } },
    });
  };

  const addStopToSection = (sectionKey) => {
    const section = flightDetails[sectionKey] || { journey: {}, stops: [] };
    onChange({
      ...flightDetails,
      [sectionKey]: { ...section, stops: [...(section.stops || []), createStop()] },
    });
  };

  const updateStopInSection = (sectionKey, stopId, field, val) => {
    const section = flightDetails[sectionKey];
    onChange({
      ...flightDetails,
      [sectionKey]: {
        ...section,
        stops: section.stops.map((s) => s.id === stopId ? { ...s, [field]: val } : s),
      },
    });
  };

  const removeStopFromSection = (sectionKey, stopId) => {
    const section = flightDetails[sectionKey];
    onChange({
      ...flightDetails,
      [sectionKey]: {
        ...section,
        stops: section.stops.filter((s) => s.id !== stopId),
      },
    });
  };

  const addMultiCityLeg = () => {
    const newLeg = { id: `leg-${Date.now()}`, journey: {}, stops: [] };
    onChange({
      ...flightDetails,
      multi_city_legs: [...multiCityLegs, newLeg],
    });
  };

  const updateMultiCityJourney = (legId, field, val) => {
    onChange({
      ...flightDetails,
      multi_city_legs: multiCityLegs.map((leg) =>
        leg.id === legId ? { ...leg, journey: { ...leg.journey, [field]: val } } : leg
      ),
    });
  };

  const addMultiCityStop = (legId) => {
    onChange({
      ...flightDetails,
      multi_city_legs: multiCityLegs.map((leg) =>
        leg.id === legId ? { ...leg, stops: [...(leg.stops || []), createStop()] } : leg
      ),
    });
  };

  const updateMultiCityStop = (legId, stopId, field, val) => {
    onChange({
      ...flightDetails,
      multi_city_legs: multiCityLegs.map((leg) =>
        leg.id === legId
          ? {
              ...leg,
              stops: leg.stops.map((s) => s.id === stopId ? { ...s, [field]: val } : s),
            }
          : leg
      ),
    });
  };

  const removeMultiCityStop = (legId, stopId) => {
    onChange({
      ...flightDetails,
      multi_city_legs: multiCityLegs.map((leg) =>
        leg.id === legId ? { ...leg, stops: leg.stops.filter((s) => s.id !== stopId) } : leg
      ),
    });
  };

  const removeMultiCityLeg = (legId) => {
    onChange({
      ...flightDetails,
      multi_city_legs: multiCityLegs.filter((leg) => leg.id !== legId),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-4 p-4 bg-slate-50 border rounded-xl">
        {['one-way', 'round-trip', 'multi-city'].map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => updateTripType(type)}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider ${
              tripType === type ? 'bg-[#c9a84c] text-white shadow-md' : 'bg-white text-slate-500 border hover:bg-slate-100'
            }`}
          >
            {type.replace('-', ' ')}
          </button>
        ))}
      </div>

      {(tripType === 'one-way' || tripType === 'round-trip') && (
        <JourneySection
          title="Outbound Journey"
          journey={outbound.journey || {}}
          stops={outbound.stops || []}
          onUpdateJourney={(field, val) => updateSection('outbound', field, val)}
          onAddStop={() => addStopToSection('outbound')}
          onUpdateStop={(id, field, val) => updateStopInSection('outbound', id, field, val)}
          onRemoveStop={(id) => removeStopFromSection('outbound', id)}
        />
      )}

      {tripType === 'round-trip' && (
        <JourneySection
          title="Return Journey"
          journey={returnJourney.journey || {}}
          stops={returnJourney.stops || []}
          onUpdateJourney={(field, val) => updateSection('return_journey', field, val)}
          onAddStop={() => addStopToSection('return_journey')}
          onUpdateStop={(id, field, val) => updateStopInSection('return_journey', id, field, val)}
          onRemoveStop={(id) => removeStopFromSection('return_journey', id)}
        />
      )}

      {tripType === 'multi-city' && (
        <div className="flex flex-col gap-6">
          {multiCityLegs.map((leg, index) => (
            <div key={leg.id} className="relative">
              <JourneySection
                title={`Flight Leg ${index + 1}`}
                journey={leg.journey || {}}
                stops={leg.stops || []}
                onUpdateJourney={(field, val) => updateMultiCityJourney(leg.id, field, val)}
                onAddStop={() => addMultiCityStop(leg.id)}
                onUpdateStop={(stopId, field, val) => updateMultiCityStop(leg.id, stopId, field, val)}
                onRemoveStop={(stopId) => removeMultiCityStop(leg.id, stopId)}
              />
              <button type="button" onClick={() => removeMultiCityLeg(leg.id)} className="absolute top-6 right-6 text-red-500 font-bold hover:underline">
                Remove Leg {index + 1}
              </button>
            </div>
          ))}
          <button type="button" onClick={addMultiCityLeg} className="bg-[#0a1120] text-white p-3 rounded-lg font-bold text-center">
            + Add Another Flight Leg
          </button>
        </div>
      )}
    </div>
  );
}
