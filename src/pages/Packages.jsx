import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Info,
  Luggage,
  MapPin,
  Plane,
  Plus,
  ShieldCheck,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  downloadBrochureLink,
  generateHotelPromotionBrochurePdf,
  generateTripBrochurePdf,
  withCacheBust,
} from '../lib/brochurePdf';
import { generateHajjOmraBrochurePdf } from '../lib/hajjOmraBrochure';
import FlightItineraryBuilder from '../components/FlightItineraryBuilder';
import HotelPromotionBuilder from '../components/HotelPromotionBuilder';
import TicketViewModal from '../components/modals/TicketViewModal';

const mealTypeOptions = ['Petit Déjeuner', 'Demi-Pension', 'Pension Complète', 'All Inclusive Soft'];
const defaultCountryOptions = ['Turkey', 'Tunisia', 'Egypt', 'Algeria', 'France', 'United Arab Emirates', 'Qatar', 'Saudi Arabia'];

const packageTypeCards = [
  { key: 'trip', label: 'Trip', labelAr: 'رحلة', icon: '✈️' },
  { key: 'hajj', label: 'Hajj', labelAr: 'الحج', icon: '🕋' },
  { key: 'omra', label: 'Omra', labelAr: 'العمرة', icon: '🌙' },
  { key: 'ticket_promotion', label: 'Ticket Promotion', labelAr: 'ترويج التذاكر', icon: '🎫' },
  { key: 'hotel_promotion', label: 'Hotel Promotion', labelAr: 'ترويج الفنادق', icon: '🏨' },
];

const createTravelDate = (index = 0) => ({
  id: `travel-${Date.now()}-${Math.random()}`,
  label: `Travel Date ${index + 1}`,
  departure_date: '',
  departure_time: '',
  return_date: '',
  return_time: '',
  prix_single: '',
  prix_double: '',
  prix_triple: '',
  custom_prices: [],
});

const createFlightSegment = (overrides = {}) => ({
  airline: '',
  airport_start: '',
  airport_end: '',
  departure_time: '',
  arrival_time: '',
  baggage_en_soute: '',
  baggage_a_main: '',
  stop_duration: '',
  ...overrides,
});

const createFlightLeg = () => ({
  segments: [createFlightSegment()],
});

const createTicketJourney = () => ({
  start_airport: '',
  end_airport: '',
  departure_time: '',
  arrival_time: '',
  airline: '',
  baggage: '',
  start: '',
  end: '',
  departure: '',
  arrival: '',
});

const createTicketStop = (overrides = {}) => ({
  _id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `stop-${Date.now()}-${Math.random()}`,
  airport: '',
  arrival_time_at_stop: '',
  stop_duration_hours: '',
  airline_changed: false,
  next_airline: '',
  is_self_transfer: false,
  ...overrides,
});

const createTicketLeg = () => ({
  id: `ticket-leg-${Date.now()}-${Math.random()}`,
  start: '',
  end: '',
  departure: '',
  arrival: '',
  airline: '',
  baggage: '',
  stops: [],
});

const createDefaultFlightDetails = () => ({
  trip_type: 'one-way',
  journey: createTicketJourney(),
  return_journey: createTicketJourney(),
  outbound: {
    journey: createTicketJourney(),
    stops: [],
  },
  return: {
    journey: createTicketJourney(),
    stops: [],
  },
  stops: [],
  multi_city_legs: [createTicketLeg()],
});

const createDefaultHotelDetails = () => ({
  country: '',
  province: '',
  hotel_name: '',
  hotel_website: '',
  hotel_map_url: '',
  stars: 5,
  discount_type: 'percentage',
  discount_value: 0,
  free_child_age: 6,
  start_date: '',
  end_date: '',
});

const getTravelDateLabel = (index = 0) => `Travel Date ${index + 1}`;

const syncTravelDateLabels = (travelSchedule = []) =>
  travelSchedule.map((travel, index) => ({
    ...travel,
    label: getTravelDateLabel(index),
  }));

const syncHotelTravelDateLabels = (travelSchedule = [], hotels = []) => {
  const normalizedTravelSchedule = syncTravelDateLabels(travelSchedule);

  return normalizedTravelSchedule.map((travel) => travel).length
    ? hotels.map((hotel, index) => {
        const matchedTravel = normalizedTravelSchedule.find((travel) => travel.id === hotel.travel_date_id) || normalizedTravelSchedule[Math.min(index, normalizedTravelSchedule.length - 1)] || normalizedTravelSchedule[0];
        return {
          ...hotel,
          travel_date_id: hotel.travel_date_id || matchedTravel?.id || null,
          travel_date_label: matchedTravel?.label || hotel.travel_date_label || getTravelDateLabel(index),
        };
      })
    : hotels.map((hotel, index) => ({
        ...hotel,
        travel_date_id: hotel.travel_date_id || null,
        travel_date_label: hotel.travel_date_label || getTravelDateLabel(index),
      }));
};

const createEmptyHotel = (travelDateId = null, travelDateLabel = getTravelDateLabel(0)) => ({
  id: `hotel-${Date.now()}-${Math.random()}`,
  travel_date_id: travelDateId,
  travel_date_label: travelDateLabel,
  hotel_name: '',
  location: '',
  distance_from_haram: '',
  nights: '',
  assigned_nights_dates: '',
  is_primary: true,
  replacement_for_hotel_id: null,
  meals: false,
  meal_type: 'Petit Déjeuner',
  prix_single: '',
  prix_double: '',
  prix_triple: '',
  prix_quadruple: '',
  prix_quintuple: '',
  custom_prices: [],
});

const createListEntry = (value = '') => ({
  id: `entry-${Date.now()}-${Math.random()}`,
  value,
});

const createItineraryDay = (label = 'Jour 1', description = '') => ({
  id: `itinerary-${Date.now()}-${Math.random()}`,
  label,
  description,
});

const normalizeItineraryDays = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => ({
        id: entry?.id || `itinerary-${Date.now()}-${Math.random()}`,
        label: entry?.label || 'Jour 1',
        description: entry?.description || '',
      }))
      .filter((entry) => entry.label || entry.description);
  }

  const raw = String(value || '').trim();
  if (!raw) return [createItineraryDay('Jour 1', '')];

  return raw
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^(.*?):\s*(.*)$/);
      return {
        id: `itinerary-${Date.now()}-${index}-${Math.random()}`,
        label: match ? (match[1] || `Jour ${index + 1}`).trim() : `Jour ${index + 1}`,
        description: match ? (match[2] || '').trim() : line.trim(),
      };
    })
    .filter((entry) => entry.label || entry.description);
};

const createCustomPriceEntry = (name = '', price = '') => ({
  id: `custom-price-${Date.now()}-${Math.random()}`,
  name,
  price,
});

const getAutoAssignedNightsLabel = (nights) => {
  const count = Number(nights ?? 0);
  if (!Number.isFinite(count) || count <= 0) return 'Nights to be confirmed';
  return Array.from({ length: count }, (_, index) => `N${index + 1}`).join(', ');
};

const createPackageDraft = (packageType = 'trip') => ({
  id: null,
  template_type: packageType,
  type: 'national',
  label: packageType === 'ticket_promotion' ? 'Ticket Promotion' : (packageType === 'hotel_promotion' ? 'Hotel Promotion' : ''),
  stock: '',
  service_ref: '',
  country: ['hajj', 'omra'].includes(packageType) ? 'Saudi Arabia' : (packageType === 'ticket_promotion' ? 'Algeria' : (packageType === 'hotel_promotion' ? 'Algeria' : '')),
  destination: '',
  location: packageType === 'ticket_promotion' ? 'Airport' : (packageType === 'hotel_promotion' ? 'Hotel' : 'Mecca'),
  distance_from_haram: '',
  flight_details: createDefaultFlightDetails(),
  hotel_details: createDefaultHotelDetails(),
  target_tags: [],
  departure_date: '',
  return_date: '',
  duration_nights: '',
  departure_point: packageType === 'ticket_promotion' ? 'Algiers Airport' : '',
  transport: packageType === 'ticket_promotion' ? 'Flight' : '',
  include_itinerary: false,
  plan_de_vol: '',
  itinerary_days: [createItineraryDay('Jour 1', '')],
  travel_schedule: packageType === 'ticket_promotion' ? [] : [createTravelDate()],
  hotels: packageType === 'ticket_promotion' ? [] : [createEmptyHotel()],
  photos: [],
  inclusions: packageType === 'ticket_promotion' ? [] : [createListEntry('')],
  exclusions: packageType === 'ticket_promotion' ? [] : [createListEntry('')],
  transfert: packageType === 'ticket_promotion' ? false : true,
  excursion: '',
  visa_included: packageType === 'ticket_promotion' ? false : false,
  assurance: packageType === 'ticket_promotion' ? false : true,
  selling_price: '',
  is_available: true,
  cancellation_policy: '',
  good_to_know: '',
});

const formatDZD = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(amount);
};

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const parseJsonObject = (value, fallback = {}) => {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value || '{}');
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const isTicketPromotionTemplate = (template) => {
  const type = String(template?.template_type || template?.type || '').toLowerCase();
  return type === 'ticket' || type === 'ticket_promotion' || type.includes('ticket') || type.includes('flight');
};

const getTicketTripTypeLabel = (tripType) => {
  switch ((tripType || '').toLowerCase()) {
    case 'one-way':
    case 'one_way':
    case 'oneway':
      return 'One Way';
    case 'round-trip':
    case 'round_trip':
    case 'roundtrip':
      return 'Round Trip';
    case 'multi-city':
    case 'multi_city':
    case 'multicity':
      return 'Multi City';
    default:
      return 'Round Trip';
  }
};

const normalizeTargetTags = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value || '[]');
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch {
      // fallback to comma-separated parsing below
    }

    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeTicketFlightDetails = (value) => {
  const parsed = parseJsonObject(value || {}, createDefaultFlightDetails());

  const normalizeJourney = (journey = {}) => ({
    start_airport: journey.start_airport || journey.start || '',
    end_airport: journey.end_airport || journey.end || '',
    departure_time: journey.departure_time || journey.departure || '',
    arrival_time: journey.arrival_time || journey.arrival || '',
    airline: journey.airline || '',
    baggage: journey.baggage || '',
    start: journey.start_airport || journey.start || '',
    end: journey.end_airport || journey.end || '',
    departure: journey.departure_time || journey.departure || '',
    arrival: journey.arrival_time || journey.arrival || '',
  });

  const canonicalizeSavedTicketDetails = (details) => {
    const outbound = parseJsonObject(details?.outbound || {}, {});
    const outboundJourney = normalizeJourney(outbound?.journey || details?.journey || {});
    const rootJourney = normalizeJourney(details?.journey || outboundJourney);
    const returnJourney = normalizeJourney(parseJsonObject(details?.return_journey || details?.return || {}, {}).journey || details?.return || {});
    const returnStops = Array.isArray(parseJsonObject(details?.return_journey || details?.return || {}, {}).stops)
      ? parseJsonObject(details?.return_journey || details?.return || {}, {}).stops
      : [];
    const outboundStops = Array.isArray(outbound?.stops)
      ? outbound.stops
      : Array.isArray(details?.stops)
        ? details.stops
        : [];

    return {
      ...createDefaultFlightDetails(),
      ...details,
      trip_type: details?.trip_type || 'one-way',
      journey: {
        ...createTicketJourney(),
        ...rootJourney,
        start_airport: rootJourney.start_airport || outboundJourney.start_airport || '',
        end_airport: rootJourney.end_airport || outboundJourney.end_airport || '',
        departure_time: rootJourney.departure_time || outboundJourney.departure_time || '',
        arrival_time: rootJourney.arrival_time || outboundJourney.arrival_time || '',
      },
      outbound: {
        journey: {
          ...createTicketJourney(),
          ...outboundJourney,
          start_airport: outboundJourney.start_airport || rootJourney.start_airport || '',
          end_airport: outboundJourney.end_airport || rootJourney.end_airport || '',
          departure_time: outboundJourney.departure_time || rootJourney.departure_time || '',
          arrival_time: outboundJourney.arrival_time || rootJourney.arrival_time || '',
        },
        stops: outboundStops,
      },
      return_journey: {
        ...createTicketJourney(),
        ...returnJourney,
      },
      return: {
        journey: {
          ...createTicketJourney(),
          ...returnJourney,
        },
        stops: returnStops,
      },
      stops: outboundStops,
    };
  };

  const canonicalParsed = canonicalizeSavedTicketDetails(parsed);

  const directJourney = normalizeJourney(parsed);
  const outboundJourney = normalizeJourney(parsed?.outbound?.journey || parsed?.journey || directJourney);
  const returnJourney = normalizeJourney(parsed?.return_journey?.journey || parsed?.return?.journey || parsed?.return || parsed?.returnJourney || {});
  const outboundStops = Array.isArray(parsed?.outbound?.stops)
    ? parsed.outbound.stops.map((stop) => ({ ...createTicketStop(), ...stop }))
    : Array.isArray(parsed?.stops)
      ? parsed.stops.map((stop) => ({ ...createTicketStop(), ...stop }))
      : [];
  const returnStops = Array.isArray(parsed?.return?.stops)
    ? parsed.return.stops.map((stop) => ({ ...createTicketStop(), ...stop }))
    : [];

  const legacyStops = Array.isArray(parsed?.stops)
    ? parsed.stops.map((stop) => ({ ...createTicketStop(), ...stop }))
    : [];

  const multiCityLegs = Array.isArray(parsed?.multi_city_legs) && parsed.multi_city_legs.length
    ? parsed.multi_city_legs.map((leg, index) => ({
        id: leg?.id || `ticket-leg-${index}-${Date.now()}-${Math.random()}`,
        start: leg?.start || leg?.start_airport || '',
        end: leg?.end || leg?.end_airport || '',
        departure: leg?.departure || leg?.departure_time || '',
        arrival: leg?.arrival || leg?.arrival_time || '',
        airline: leg?.airline || '',
        baggage: leg?.baggage || '',
        stops: Array.isArray(leg?.stops) ? leg.stops.map((stop) => ({ ...createTicketStop(), ...stop })) : [],
      }))
    : [createTicketLeg()];

  const legacyOutbound = Array.isArray(parsed?.outbound) && parsed.outbound.length ? parsed.outbound : [];
  if (legacyOutbound.length) {
    const firstSegment = legacyOutbound[0] || {};
    const lastSegment = legacyOutbound[legacyOutbound.length - 1] || {};
    return {
      trip_type: parsed.trip_type || 'one-way',
      journey: {
        start: outboundJourney.start || firstSegment.airport_start || '',
        end: outboundJourney.end || lastSegment.airport_end || '',
        departure: outboundJourney.departure || firstSegment.departure_time || '',
        arrival: outboundJourney.arrival || lastSegment.arrival_time || '',
        airline: outboundJourney.airline || firstSegment.airline || '',
        baggage: outboundJourney.baggage || firstSegment.baggage_a_main || firstSegment.baggage_en_soute || '',
      },
      return_journey: { ...createTicketJourney(), ...returnJourney },
      outbound: {
        journey: {
          start_airport: outboundJourney.start || firstSegment.airport_start || '',
          end_airport: outboundJourney.end || lastSegment.airport_end || '',
          departure_time: outboundJourney.departure || firstSegment.departure_time || '',
          arrival_time: outboundJourney.arrival || lastSegment.arrival_time || '',
          airline: outboundJourney.airline || firstSegment.airline || '',
          baggage: outboundJourney.baggage || firstSegment.baggage_a_main || firstSegment.baggage_en_soute || '',
        },
        stops: outboundStops.length ? outboundStops : legacyStops,
      },
      return: {
        journey: { ...createTicketJourney(), ...returnJourney },
        stops: returnStops,
      },
      stops: outboundStops.length ? outboundStops : legacyStops,
      multi_city_legs: multiCityLegs,
    };
  }

  const hasDirectRootJourney = Boolean(
    parsed?.start_airport || parsed?.end_airport || parsed?.departure_time || parsed?.arrival_time || parsed?.airline || parsed?.baggage || parsed?.start || parsed?.end || parsed?.departure || parsed?.arrival
  );

  const rootJourney = hasDirectRootJourney ? outboundJourney : { ...createTicketJourney() };

  const canonicalResult = {
    trip_type: parsed.trip_type || 'one-way',
    journey: { ...createTicketJourney(), ...rootJourney },
    return_journey: { ...createTicketJourney(), ...returnJourney },
    outbound: {
      journey: {
        start_airport: rootJourney.start_airport || outboundJourney.start_airport || '',
        end_airport: rootJourney.end_airport || outboundJourney.end_airport || '',
        departure_time: rootJourney.departure_time || outboundJourney.departure_time || '',
        arrival_time: rootJourney.arrival_time || outboundJourney.arrival_time || '',
        airline: rootJourney.airline || outboundJourney.airline || '',
        baggage: rootJourney.baggage || outboundJourney.baggage || '',
      },
      stops: outboundStops.length ? outboundStops : legacyStops,
    },
    return: {
      journey: { ...createTicketJourney(), ...returnJourney },
      stops: returnStops,
    },
    stops: outboundStops.length ? outboundStops : legacyStops,
    multi_city_legs: multiCityLegs,
  };

  return canonicalResult;
};

const resolveTicketFlightDetails = (template) => normalizeTicketFlightDetails(template?.flight_details || {});

const resolveTicketValue = (value, fallback = '—') => (value === undefined || value === null || value === '' ? fallback : value);

const resolveTicketTags = (template) => normalizeTargetTags(template?.target_tags || []);

const getNextDepartureForStop = (stop) => {
  if (!stop?.arrival_time_at_stop) return null;
  const duration = Number(stop.stop_duration_hours ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const arrivalDate = new Date(stop.arrival_time_at_stop);
  if (Number.isNaN(arrivalDate.getTime())) return null;

  arrivalDate.setHours(arrivalDate.getHours() + duration);
  const result = new Date(arrivalDate);
  return result;
};

const resolveTicketSegments = (tripType, flightDetails, directionKey) => {
  if (!flightDetails) return [];

  if (tripType === 'multi-city') {
    const legs = parseJsonArray(flightDetails.multi_city_legs || []);
    if (!legs.length) return [];
    return legs.map((leg) => parseJsonArray(leg?.segments || []));
  }

  return parseJsonArray(flightDetails[directionKey] || []);
};

const resolvePackagePhotoList = (value) => {
  const parsed = parseJsonArray(value);

  return parsed
    .map((photo) => {
      if (typeof photo === 'string') return photo;
      if (typeof photo === 'object') {
        return photo.url || photo.src || photo.image || photo.link || '';
      }
      return '';
    })
    .filter(Boolean);
};

const normalizeTravelSchedule = (travelSchedule) => {
  const items = parseJsonArray(travelSchedule);
  if (!items.length) return [createTravelDate(0)];

  return items.map((item, index) => ({
    id: item.id || `travel-${Date.now()}-${Math.random()}`,
    label: item.label || item.travel_date_label || getTravelDateLabel(index),
    departure_date: item.departure_date || '',
    departure_time: item.departure_time || '',
    return_date: item.return_date || '',
    return_time: item.return_time || '',
    prix_single: item.prix_single ?? '',
    prix_double: item.prix_double ?? '',
    prix_triple: item.prix_triple ?? '',
    custom_prices: normalizeCustomPrices(item.custom_prices),
  }));
};

const normalizeCustomPrices = (customPrices) => {
  const items = parseJsonArray(customPrices);
  if (!items.length) return [];

  return items.map((item) => ({
    id: item.id || `custom-price-${Date.now()}-${Math.random()}`,
    name: item.name || item.label || item.key || '',
    price: item.price ?? item.amount ?? '',
  })).filter((item) => item.name || item.price !== '');
};

const normalizeHotels = (hotels, travelSchedule = []) => {
  const items = parseJsonArray(hotels);
  if (!items.length) return [createEmptyHotel(null, getTravelDateLabel(0))];

  return syncHotelTravelDateLabels(travelSchedule, items).map((hotel) => ({
    id: hotel.id || `hotel-${Date.now()}-${Math.random()}`,
    travel_date_id: hotel.travel_date_id || null,
    travel_date_label: hotel.travel_date_label || getTravelDateLabel(0),
    hotel_name: hotel.hotel_name || '',
    location: hotel.location || hotel.city || hotel.hotel_city || '',
    distance_from_haram: hotel.distance_from_haram ?? hotel.distanceFromHaram ?? '',
    nights: hotel.nights ?? '',
    assigned_nights_dates: hotel.assigned_nights_dates || '',
    is_primary: hotel.is_primary !== false,
    replacement_for_hotel_id: hotel.replacement_for_hotel_id || null,
    meals: Boolean(hotel.meals),
    meal_type: hotel.meal_type || 'Petit Déjeuner',
    prix_single: hotel.prix_single ?? '',
    prix_double: hotel.prix_double ?? '',
    prix_triple: hotel.prix_triple ?? '',
    prix_quadruple: hotel.prix_quadruple ?? '',
    prix_quintuple: hotel.prix_quintuple ?? '',
    custom_prices: normalizeCustomPrices(hotel.custom_prices),
  }));
};

const normalizeListEntries = (items) => {
  const parsed = parseJsonArray(items);
  if (!parsed.length) return [createListEntry('')];

  return parsed.map((item) => {
    if (typeof item === 'string') return createListEntry(item);
    return { id: item.id || `entry-${Date.now()}-${Math.random()}`, value: item.value || item.title || item.label || '' };
  });
};

const normalizeTripTemplate = (row) => {
  const parsedHotels = parseJsonArray(row?.hotels);
  const parsedTravelSchedule = parseJsonArray(row?.travel_schedule);
  const parsedInclusions = parseJsonArray(row?.inclusions);
  const parsedExclusions = parseJsonArray(row?.exclusions);

  const firstTravel = Array.isArray(parsedTravelSchedule) && parsedTravelSchedule[0] ? parsedTravelSchedule[0] : {};

  const packageType = row?.template_type || 'trip';
  const parsedFlightDetails = (() => {
    try {
      const value = typeof row?.flight_details === 'string' ? JSON.parse(row.flight_details || '{}') : (row?.flight_details || {});
      return normalizeTicketFlightDetails(value);
    } catch {
      return createDefaultFlightDetails();
    }
  })();

  const parsedHotelDetails = (() => {
    const value = row?.hotel_details || {};
    return { ...createDefaultHotelDetails(), ...parseJsonObject(value, createDefaultHotelDetails()) };
  })();

  const parsedTargetTags = (() => {
    const raw = row?.target_tags || [];
    const items = parseJsonArray(raw);
    return items.map((item) => (typeof item === 'string' ? item : item?.value || item?.label || '')).filter(Boolean);
  })();

  return {
    ...createPackageDraft(packageType),
    id: row.id || null,
    template_type: packageType,
    type: row.type || 'national',
    label: row.label || '',
    service_ref: row.service_ref || '',
    country: ['hajj', 'omra'].includes(packageType) ? 'Saudi Arabia' : (row.country || ''),
    destination: row.destination || '',
    location: row.location || row.hotel_location || 'Mecca',
    distance_from_haram: row.distance_from_haram ?? row.distanceFromHaram ?? '',
    departure_date: row.departure_date || firstTravel.departure_date || '',
    return_date: row.return_date || firstTravel.return_date || '',
    duration_nights: row.duration_nights ?? '',
    departure_point: row.departure_point || '',
    transport: row.transport || '',
    stock: row.stock ?? '',
    flight_details: parsedFlightDetails,
    hotel_details: parsedHotelDetails,
    target_tags: parsedTargetTags,
    include_itinerary: Boolean(row?.plan_de_vol?.trim()) || Boolean(row?.include_itinerary),
    plan_de_vol: row.plan_de_vol || '',
    itinerary_days: normalizeItineraryDays(row?.plan_de_vol || row?.itinerary_days),
    travel_schedule: normalizeTravelSchedule(parsedTravelSchedule),
    hotels: normalizeHotels(parsedHotels, parsedTravelSchedule),
    photos: resolvePackagePhotoList(row?.photos),
    inclusions: normalizeListEntries(parsedInclusions),
    exclusions: normalizeListEntries(parsedExclusions),
    transfert: Boolean(row.transfert),
    excursion: row.excursion || '',
    visa_included: Boolean(row.visa_included),
    assurance: Boolean(row.assurance),
    selling_price: row.selling_price ?? '',
    brochure_url: row.brochure_url || '',
    is_available: row.is_available !== false,
    cancellation_policy: row.cancellation_policy || '',
    good_to_know: row.good_to_know || '',
  };
};

export default function Packages({ language = 'en' }) {
  const [role, setRole] = useState('viewer');
  const [templates, setTemplates] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [selectedType, setSelectedType] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [step, setStep] = useState(1);
  const [activeTab, setActiveTab] = useState('Basic Info');
  const [draft, setDraft] = useState(createPackageDraft('trip'));
  const [activeHotelDateId, setActiveHotelDateId] = useState(null);
  const [showCountryInput, setShowCountryInput] = useState(false);
  const [availableTags, setAvailableTags] = useState(['B2B', 'VIP', 'Agencies', 'Families']);
  const [customTagInput, setCustomTagInput] = useState(null);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [generatingBrochureId, setGeneratingBrochureId] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [ticketViewModalOpen, setTicketViewModalOpen] = useState(false);
  const [selectedPackageDetails, setSelectedPackageDetails] = useState(null);
  const [expandedTravelDateIds, setExpandedTravelDateIds] = useState([]);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsPackage, setStatsPackage] = useState(null);
  const [brochurePickerOpen, setBrochurePickerOpen] = useState(false);
  const [brochurePickerTemplate, setBrochurePickerTemplate] = useState(null);
  const [brochurePickerPhotos, setBrochurePickerPhotos] = useState([]);
  const [selectedBrochurePhoto, setSelectedBrochurePhoto] = useState('');
  const [statsData, setStatsData] = useState({
    timesSold: 0,
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    clients: [],
  });

  const canWrite = useMemo(() => ['super_admin', 'sales_agent'].includes(role), [role]);

  const isPilgrimagePackage = useMemo(
    () => ['hajj', 'omra'].includes(selectedType || draft.template_type || 'trip'),
    [selectedType, draft.template_type]
  );

  const isTicketPromotionPackage = useMemo(
    () => (selectedType || draft.template_type || 'trip') === 'ticket_promotion',
    [selectedType, draft.template_type]
  );

  const isHotelPromotionPackage = useMemo(
    () => (selectedType || draft.template_type || 'trip') === 'hotel_promotion',
    [selectedType, draft.template_type]
  );

  const ticketPromotionTabs = ['Basic Info', 'Flight Itinerary', 'Fare Rules', 'Good to Know'];

  useEffect(() => {
    if (isPilgrimagePackage) {
      setDraft((prev) => ({ ...prev, country: 'Saudi Arabia' }));
      setShowCountryInput(false);
    }
  }, [isPilgrimagePackage]);

  const countryOptions = useMemo(() => {
    const unique = new Set(defaultCountryOptions);
    templates.forEach((template) => {
      if (template.country) unique.add(template.country);
    });
    return [...unique];
  }, [templates]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (draft.target_tags && Array.isArray(draft.target_tags)) {
      setAvailableTags((prev) => {
        const merged = [...prev];
        draft.target_tags.forEach((tag) => {
          const value = String(tag || '').trim();
          if (value && !merged.includes(value)) merged.push(value);
        });
        return merged;
      });
    }
  }, [draft.target_tags]);

  useEffect(() => {
    if (!draft.travel_schedule?.length) {
      setActiveHotelDateId(null);
      return;
    }

    const currentExists = draft.travel_schedule.some((travel) => travel.id === activeHotelDateId);
    if (!currentExists) {
      setActiveHotelDateId(draft.travel_schedule[0].id);
    }
  }, [draft.travel_schedule, activeHotelDateId]);

  useEffect(() => {
    const loadRole = async () => {
      if (!supabase) {
        setRole('viewer');
        return;
      }

      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user?.id) {
          setRole('viewer');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userData.user.id)
          .maybeSingle();

        setRole(profile?.role || 'viewer');
      } catch {
        setRole('viewer');
      }
    };

    loadRole();
  }, []);

  useEffect(() => {
    if (!editingId || !templates.length) return;

    const currentTemplate = templates.find((item) => item.id === editingId);
    if (!currentTemplate || currentTemplate.template_type !== 'ticket_promotion') return;

    const initialData = normalizeTripTemplate(currentTemplate);
    setDraft(initialData);
  }, [editingId, templates]);

  useEffect(() => {
    if (!draft.include_itinerary) return;

    const nextPlan = (draft.itinerary_days || [])
      .filter((day) => day && (day.label || day.description))
      .map((day) => {
        const label = (day.label || 'Jour 1').trim();
        const description = (day.description || '').trim();
        return description ? `${label}: ${description}` : label;
      })
      .join('\n');

    if (draft.plan_de_vol !== nextPlan) {
      setDraft((prev) => ({
        ...prev,
        plan_de_vol: nextPlan,
      }));
    }
  }, [draft.include_itinerary, draft.itinerary_days]);

  useEffect(() => {
    const loadTemplates = async () => {
      setLoading(true);

      if (!supabase) {
        setTemplates([]);
        setServiceTypes([]);
        setLoading(false);
        return;
      }

      try {
        const [templatesRes, serviceTypesRes] = await Promise.all([
          supabase.from('package_templates').select('*').order('created_at', { ascending: false }),
          supabase.from('service_types').select('id, name').order('name', { ascending: true }),
        ]);

        if (templatesRes.error) {
          console.warn('package_templates unavailable:', templatesRes.error.message || templatesRes.error);
          setTemplates([]);
        } else {
          const rows = (templatesRes.data || []).map((item) => normalizeTripTemplate(item));
          setTemplates(rows);
        }

        if (serviceTypesRes.error) {
          console.warn('service_types unavailable:', serviceTypesRes.error.message || serviceTypesRes.error);
          setServiceTypes([]);
        } else {
          setServiceTypes(serviceTypesRes.data || []);
        }
      } catch (error) {
        console.warn('Unable to load package templates or service types:', error);
        setTemplates([]);
        setServiceTypes([]);
      } finally {
        setLoading(false);
      }
    };

    loadTemplates();
  }, []);

  const typeCounts = useMemo(() => {
    const counts = {};
    packageTypeCards.forEach((card) => {
      counts[card.key] = templates.filter((template) => (template.template_type || 'trip') === card.key).length;
    });
    return counts;
  }, [templates]);

  const activeTemplates = useMemo(
    () => templates.filter((template) => (template.template_type || 'trip') === selectedType),
    [templates, selectedType]
  );

  const openCreate = () => {
    if (!canWrite) {
      setToast(language === 'en' ? 'Viewer role cannot create templates.' : 'لا يمكن للمشاهد إنشاء القوالب.');
      return;
    }

    setEditingId(null);
    setDraft(createPackageDraft(selectedType || 'trip'));
    setStep(1);
    setActiveTab('Basic Info');
    setShowCountryInput(true);
    setIsFormOpen(true);
  };

  const openEdit = (item) => {
    if (!canWrite) {
      setToast(language === 'en' ? 'Viewer role cannot edit templates.' : 'لا يمكن للمشاهد تعديل القوالب.');
      return;
    }

    setEditingId(item.id);
    setDraft(normalizeTripTemplate(item));
    setStep(1);
    setActiveTab('Basic Info');
    setShowCountryInput(Boolean(!item.country || !countryOptions.includes(item.country)));
    setIsFormOpen(true);
  };

  const openPackageDetails = (item) => {
    setSelectedPackageDetails(item);
    const dates = resolveTravelDates(item);
    setExpandedTravelDateIds(dates.length ? [dates[0].id] : []);

    if (isTicketPromotionTemplate(item)) {
      setDetailsModalOpen(false);
      setTicketViewModalOpen(true);
      return;
    }

    setTicketViewModalOpen(false);
    setDetailsModalOpen(true);
  };

  const toggleTravelDate = (travelId) => {
    setExpandedTravelDateIds((prev) =>
      prev.includes(travelId) ? prev.filter((id) => id !== travelId) : [...prev, travelId]
    );
  };

  const resolveTravelDates = (item) => {
    const raw = item?.travel_dates || item?.travel_schedule || [];
    const items = parseJsonArray(raw);

    return items
      .map((entry) => {
        const normalizedCustomPrices = Array.isArray(entry?.custom_prices)
          ? entry.custom_prices
          : typeof entry?.custom_prices === 'string'
            ? (() => {
                try {
                  const parsed = JSON.parse(entry.custom_prices);
                  return Array.isArray(parsed) ? parsed : [];
                } catch {
                  return [];
                }
              })()
            : [];

        return {
          id: entry.id || `${entry.departure_date || 'date'}-${Math.random()}`,
          label: entry.label || '',
          departure_date: entry.departure_date || '',
          departure_time: entry.departure_time || '',
          return_date: entry.return_date || '',
          return_time: entry.return_time || '',
          prix_single: entry.prix_single ?? '',
          prix_double: entry.prix_double ?? '',
          prix_triple: entry.prix_triple ?? '',
          custom_prices: normalizedCustomPrices,
        };
      })
      .filter((entry) => entry.departure_date || entry.return_date || entry.departure_time || entry.return_time);
  };

  const resolveListValues = (value) => {
    const items = parseJsonArray(value);
    return items.map((entry) => (typeof entry === 'string' ? entry : entry?.value || entry?.title || entry?.label || '')).filter(Boolean);
  };

  const copyHotelsFromFirstTravelDate = () => {
    const firstTravel = draft.travel_schedule[0];
    const targetTravel = draft.travel_schedule.find((travel) => travel.id === activeHotelDateId) || draft.travel_schedule[0];
    if (!firstTravel || !targetTravel) return;

    const firstDateHotels = draft.hotels.filter((hotel) => {
      if (hotel.travel_date_id) return hotel.travel_date_id === firstTravel.id;
      return !draft.travel_schedule.some((travel) => travel.id === hotel.travel_date_id) || firstTravel.id === activeHotelDateId;
    });

    if (!firstDateHotels.length) {
      setToast(language === 'en' ? 'No hotel from the first travel date to copy.' : 'لا توجد فنادق في أول تاريخ سفر لنسخها.');
      return;
    }

    const targetDateLabel = targetTravel.label || getTravelDateLabel(draft.travel_schedule.indexOf(targetTravel));

    setDraft((prev) => ({
      ...prev,
      hotels: [
        ...prev.hotels,
        ...firstDateHotels.map((hotel) => ({
          ...hotel,
          id: `hotel-${Date.now()}-${Math.random()}`,
          travel_date_id: targetTravel.id,
          travel_date_label: targetDateLabel,
          hotel_name: hotel.hotel_name || '',
          custom_prices: (hotel.custom_prices || []).map((price) => ({
            ...price,
            id: price.id || `custom-price-${Date.now()}-${Math.random()}`,
          })),
        })),
      ],
    }));
  };

  const addHotel = () => {
    const dateId = activeHotelDateId || draft.travel_schedule[0]?.id || null;
    const dateLabel = draft.travel_schedule.find((travel) => travel.id === dateId)?.label || getTravelDateLabel(0);
    setDraft((prev) => ({ ...prev, hotels: [...prev.hotels, createEmptyHotel(dateId, dateLabel)] }));
  };

  const getHotelPriceSummary = (hotel) => {
    const entries = [];
    if (hotel?.prix_single) entries.push(`Single: ${hotel.prix_single}`);
    if (hotel?.prix_double) entries.push(`Double: ${hotel.prix_double}`);
    if (hotel?.prix_triple) entries.push(`Triple: ${hotel.prix_triple}`);
    if (hotel?.prix_quadruple) entries.push(`Quadruple: ${hotel.prix_quadruple}`);
    if (hotel?.prix_quintuple) entries.push(`Quintuple: ${hotel.prix_quintuple}`);
    if ((hotel?.custom_prices || []).length) {
      (hotel.custom_prices || []).forEach((option) => {
        if (option?.name && option?.price !== '' && option?.price !== null && option?.price !== undefined) {
          entries.push(`${option.name}: ${option.price}`);
        }
      });
    }
    return entries.length ? entries.join(' • ') : 'Price on request';
  };

  const getTravelDatePriceSummary = (travelId, hotels = []) => {
    const dateHotels = hotels.filter((hotel) => {
      if (hotel?.travel_date_id) return hotel.travel_date_id === travelId;
      return true;
    });

    const baseHotels = dateHotels.filter((hotel) => hotel?.is_primary !== false);
    const optionalHotels = dateHotels.filter((hotel) => hotel?.is_primary === false);

    const summarize = (items) => {
      const entries = [];
      items.forEach((hotel) => {
        const hotelSummary = getHotelPriceSummary(hotel);
        if (hotelSummary && hotelSummary !== 'Price on request') entries.push(`${hotel?.hotel_name || 'Hotel'}: ${hotelSummary}`);
      });
      return entries;
    };

    return {
      base: summarize(baseHotels),
      optional: summarize(optionalHotels),
    };
  };

  const getTravelDateHotels = (travel, hotels = []) => {
    if (!travel) return [];
    return hotels.filter((hotel) => {
      if (hotel?.travel_date_id) return hotel.travel_date_id === travel.id;
      if (hotel?.travel_date_label) {
        return hotel.travel_date_label === travel.label || hotel.travel_date_label === travel.travel_date_label || hotel.travel_date_label === `Travel Date ${Number(travel?.label?.match(/\d+/)?.[0] || 1)}`;
      }
      return true;
    });
  };

  const updateHotel = (hotelId, field, value) => {
    setDraft((prev) => ({
      ...prev,
      hotels: prev.hotels.map((hotel) => (hotel.id === hotelId ? { ...hotel, [field]: value } : hotel)),
    }));
  };

  const removeHotel = (hotelId) => {
    setDraft((prev) => ({
      ...prev,
      hotels: prev.hotels.length > 1 ? prev.hotels.filter((hotel) => hotel.id !== hotelId) : prev.hotels,
    }));
  };

  const getHotelsForActiveTravelDate = () => {
    if (!draft.travel_schedule?.length) return [];

    const fallbackId = draft.travel_schedule[0]?.id ?? null;

    return draft.hotels.filter((hotel) => {
      if (hotel.travel_date_id) return hotel.travel_date_id === activeHotelDateId;
      return activeHotelDateId === fallbackId || (!activeHotelDateId && fallbackId === null);
    });
  };

  const handleGenerateBrochure = (template) => {
    if (!template?.id) {
      setToast(language === 'en' ? 'Save the template before generating a brochure.' : 'احفظ القالب قبل إنشاء الكتيب.');
      return;
    }

    const photos = resolvePackagePhotoList(template.photos);
    setBrochurePickerTemplate(template);
    setBrochurePickerPhotos(photos);
    setSelectedBrochurePhoto(photos[0] || '');
    setBrochurePickerOpen(true);
  };

  const handleLocalBrochureUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;

      setBrochurePickerPhotos((prev) => {
        const next = [...prev, dataUrl];
        setSelectedBrochurePhoto(dataUrl);
        return next;
      });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleRemoveSelectedBrochurePhoto = () => {
    if (!selectedBrochurePhoto) return;

    setBrochurePickerPhotos((prev) => {
      const next = prev.filter((photo) => photo !== selectedBrochurePhoto);
      setSelectedBrochurePhoto(next[0] || '');
      return next;
    });
  };

  const confirmBrochureGeneration = async () => {
    if (!brochurePickerTemplate) return;

    setGeneratingBrochureId(brochurePickerTemplate.id);
    setBrochurePickerOpen(false);

    try {
      const templateKind = brochurePickerTemplate.template_type || 'trip';
      const generator = templateKind === 'hotel_promotion'
        ? generateHotelPromotionBrochurePdf
        : ['hajj', 'omra'].includes(templateKind)
          ? generateHajjOmraBrochurePdf
          : generateTripBrochurePdf;
      const result = await generator(
        { ...brochurePickerTemplate, photos: brochurePickerPhotos },
        selectedBrochurePhoto || brochurePickerPhotos[0] || null
      );

      setTemplates((prev) =>
        prev.map((item) => (item.id === brochurePickerTemplate.id ? { ...item, brochure_url: result.publicUrl, photos: brochurePickerPhotos } : item))
      );

      setToast(language === 'en' ? 'Brochure generated and saved.' : 'تم إنشاء الكتيب وحفظه.');
    } catch (error) {
      setToast(error?.message || 'Unable to generate brochure.');
    } finally {
      setGeneratingBrochureId(null);
    }
  };

  const handleCopyBrochureLink = async (url) => {
    if (!url) {
      setToast(language === 'en' ? 'No brochure link available yet.' : 'لا يوجد رابط كتيب بعد.');
      return;
    }

    try {
      await navigator.clipboard.writeText(withCacheBust(url, Date.now()));
      setToast(language === 'en' ? 'Brochure link copied.' : 'تم نسخ رابط الكتيب.');
    } catch {
      setToast(language === 'en' ? 'Copy failed. You can still download the brochure.' : 'فشل النسخ. يمكنك تنزيل الكتيب يدوياً.');
    }
  };

  const handleOpenStats = async (item) => {
    if (!item?.id) return;

    setStatsPackage(item);
    setStatsModalOpen(true);
    setStatsLoading(true);
    setStatsData({ timesSold: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, clients: [] });

    try {
      if (!supabase) {
        setStatsLoading(false);
        return;
      }

      const { data: lineRows, error: lineError } = await supabase
        .from('booking_service_lines')
        .select(
          'id, booking_id, description, selling_price, cost_price, details, bookings(id, reference, finish_date, selling_price, client_id, clients(full_name, reference))'
        )
        .filter('details->>package_id', 'eq', item.id);

      if (lineError) throw lineError;

      const bookingRows = new Map();
      const rows = lineRows || [];

      rows.forEach((line) => {
        const booking = line.bookings;
        if (!booking) return;

        const clientName = booking.clients?.full_name || 'Unknown client';
        const clientReference = booking.clients?.reference || '—';
        const bookingRef = booking.reference || '—';
        const bookingDate = booking.finish_date || null;
        const sellingPrice = Number(line.selling_price ?? booking.selling_price ?? 0);
        const costPrice = Number(line.cost_price ?? 0);

        bookingRows.set(String(booking.id), {
          bookingId: booking.id,
          clientName,
          clientReference,
          bookingReference: bookingRef,
          bookingDate,
          sellingPrice,
          costPrice,
        });
      });

      const clients = [...bookingRows.values()].map((row) => ({
        clientName: row.clientName,
        bookingReference: row.bookingReference,
        bookingDate: row.bookingDate,
        sellingPrice: Number(row.sellingPrice || 0),
      }));

      const totalRevenue = clients.reduce((sum, client) => sum + Number(client.sellingPrice || 0), 0);
      const totalCost = [...bookingRows.values()].reduce((sum, row) => sum + Number(row.costPrice || 0), 0);

      setStatsData({
        timesSold: clients.length,
        totalRevenue,
        totalCost,
        totalProfit: totalRevenue - totalCost,
        clients,
      });
    } catch (error) {
      console.warn('Unable to load package stats:', error?.message || error);
      setStatsData({ timesSold: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, clients: [] });
    } finally {
      setStatsLoading(false);
    }
  };

  const handleSave = async () => {
    const packageKind = selectedType || draft.template_type || 'trip';
    const isTicketPromotionPackage = packageKind === 'ticket_promotion' || packageKind === 'ticket';
    const isHotelPromotionPackage = packageKind === 'hotel_promotion';

    if (!draft.label?.trim()) {
      setToast(language === 'en' ? 'Please add a label.' : 'يرجى إدخال تسمية القالب.');
      return;
    }

    if (!isTicketPromotionPackage && !draft.country?.trim()) {
      setToast(language === 'en' ? 'Please select a country.' : 'يرجى اختيار الدولة.');
      return;
    }

    if (!supabase) {
      setToast(language === 'en' ? 'Supabase is not configured.' : 'لم يتم تكوين Supabase.');
      return;
    }

    const travelDates = syncTravelDateLabels(
      (draft.travel_schedule || []).filter(
        (item) => item.departure_date || item.return_date || item.departure_time || item.return_time
      )
    );
    const normalizedHotels = (draft.hotels || []).map((hotel, index) => {
      const matchedTravel = travelDates.find((travel) => travel.id === hotel.travel_date_id) || travelDates[Math.min(index, travelDates.length - 1)] || travelDates[0];
      return {
        ...hotel,
        travel_date_id: hotel.travel_date_id || matchedTravel?.id || null,
        travel_date_label: matchedTravel?.label || hotel.travel_date_label || getTravelDateLabel(index),
      };
    });
    const firstTravel = travelDates[0] || {};

    const flightDetailsToSave = normalizeTicketFlightDetails(draft.flight_details || createDefaultFlightDetails());
    const hotelDetailsToSave = {
      ...createDefaultHotelDetails(),
      ...parseJsonObject(draft.hotel_details || {}, createDefaultHotelDetails()),
    };

    const payload = {
      template_type: packageKind,
      type: isTicketPromotionPackage ? 'national' : (draft.type || 'national'),
      label: draft.label.trim(),
      service_ref: draft.service_ref?.trim() || '',
      country: isTicketPromotionPackage ? 'Algeria' : draft.country.trim(),
      destination: isTicketPromotionPackage ? (draft.destination?.trim() || 'Algiers') : (draft.destination?.trim() || ''),
      location: isTicketPromotionPackage ? 'Airport' : (draft.location?.trim() || ''),
      distance_from_haram: isTicketPromotionPackage ? null : (draft.distance_from_haram === '' ? null : Number(draft.distance_from_haram) || null),
      departure_date: isTicketPromotionPackage ? null : (firstTravel.departure_date || draft.departure_date || null),
      return_date: isTicketPromotionPackage ? null : (firstTravel.return_date || draft.return_date || null),
      duration_nights: isTicketPromotionPackage ? null : (draft.duration_nights === '' ? null : Number(draft.duration_nights) || null),
      departure_point: isTicketPromotionPackage ? 'Algiers Airport' : (draft.departure_point?.trim() || ''),
      transport: isTicketPromotionPackage ? 'Flight' : (draft.transport?.trim() || ''),
      plan_de_vol: isTicketPromotionPackage
        ? ''
        : (draft.include_itinerary
            ? (draft.itinerary_days || [])
                .filter((day) => day && (day.label || day.description))
                .map((day) => {
                  const label = (day.label || 'Jour 1').trim();
                  const description = (day.description || '').trim();
                  return description ? `${label}: ${description}` : label;
                })
                .join('\n')
            : ''),
      travel_schedule: JSON.stringify(isTicketPromotionPackage ? [] : travelDates),
      hotels: JSON.stringify(isTicketPromotionPackage ? [] : normalizedHotels.map((hotel) => ({
        id: hotel.id,
        travel_date_id: hotel.travel_date_id || null,
        travel_date_label: hotel.travel_date_label || getTravelDateLabel(0),
        hotel_name: hotel.hotel_name || '',
        location: hotel.location || '',
        distance_from_haram: hotel.distance_from_haram ?? '',
        nights: hotel.nights ?? '',
        assigned_nights_dates: hotel.assigned_nights_dates || '',
        is_primary: Boolean(hotel.is_primary),
        replacement_for_hotel_id: hotel.is_primary === false ? (hotel.replacement_for_hotel_id || null) : null,
        meals: Boolean(hotel.meals),
        meal_type: hotel.meal_type || 'Petit Déjeuner',
        prix_single: hotel.prix_single ?? '',
        prix_double: hotel.prix_double ?? '',
        prix_triple: hotel.prix_triple ?? '',
        prix_quadruple: hotel.prix_quadruple ?? '',
        prix_quintuple: hotel.prix_quintuple ?? '',
        custom_prices: (hotel.custom_prices || [])
          .map((option) => ({
            id: option.id,
            name: option.name?.trim() || '',
            price: option.price === '' || option.price === null || option.price === undefined ? '' : Number(option.price),
          }))
          .filter((option) => option.name || option.price !== ''),
      }))),
      photos: JSON.stringify(isTicketPromotionPackage ? [] : (draft.photos || []).filter(Boolean)),
      inclusions: JSON.stringify(isTicketPromotionPackage ? [] : (draft.inclusions || []).map((item) => item.value?.trim()).filter(Boolean)),
      exclusions: JSON.stringify(isTicketPromotionPackage ? [] : (draft.exclusions || []).map((item) => item.value?.trim()).filter(Boolean)),
      transfert: Boolean(isTicketPromotionPackage ? false : draft.transfert),
      excursion: isTicketPromotionPackage ? '' : (draft.excursion?.trim() || ''),
      visa_included: Boolean(isTicketPromotionPackage ? false : draft.visa_included),
      assurance: Boolean(isTicketPromotionPackage ? false : draft.assurance),
      selling_price: draft.selling_price === '' ? 0 : Number(draft.selling_price) || 0,
      stock: Number(draft.stock ?? 0) || 0,
      flight_details: isTicketPromotionPackage ? flightDetailsToSave : null,
      hotel_details: isHotelPromotionPackage ? hotelDetailsToSave : null,
      target_tags: JSON.stringify((draft.target_tags || []).filter(Boolean)),
      is_available: draft.is_available !== false,
      cancellation_policy: draft.cancellation_policy?.trim() || '',
      good_to_know: draft.good_to_know?.trim() || '',
      updated_at: new Date().toISOString(),
    };

    const persistPayload = async (record) => {
      if (editingId) {
        const { error } = await supabase.from('package_templates').update(record).eq('id', editingId);
        return { error };
      }

      const { error } = await supabase.from('package_templates').insert([record]);
      return { error };
    };

    try {
      let result = await persistPayload(payload);

      if (result.error && String(result.error.message || '').includes("'stock'") && String(result.error.message || '').includes('package_templates')) {
        const fallbackPayload = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'stock'));
        result = await persistPayload(fallbackPayload);
      }

      if (result.error) throw result.error;

      const { data, error: refetchError } = await supabase.from('package_templates').select('*').order('created_at', { ascending: false });

      if (!refetchError) {
        setTemplates((data || []).map((item) => normalizeTripTemplate(item)));
      }

      setIsFormOpen(false);
      setToast(language === 'en' ? 'Trip template saved.' : 'تم حفظ قالب الرحلة.');
    } catch (error) {
      setToast(error?.message || 'Unable to save package template.');
    }
  };

  const renderFlightSegmentEditor = (segments, onSegmentsChange, blockLabel, allowAddStop = true) => (
    <div className="space-y-4">
      {segments.map((segment, segmentIndex) => (
        <div key={`${blockLabel}-${segmentIndex}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[#0a1120]">
              {segmentIndex === 0 ? <Plane size={16} className="text-[#c9a84c]" /> : <Plane size={16} className="text-[#c9a84c]" />}
              <span className="text-sm font-semibold">{segmentIndex === 0 ? `${blockLabel} Segment 1` : `${blockLabel} Stop ${segmentIndex}`}</span>
            </div>
            {segments.length > 1 && (
              <button
                type="button"
                onClick={() => onSegmentsChange(segments.filter((_, index) => index !== segmentIndex))}
                className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700"
              >
                Remove
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor={`ticket-airline-${segmentIndex}`} className="mb-1 block text-sm font-medium text-slate-700">Airline</label>
              <input
                id={`ticket-airline-${segmentIndex}`}
                value={segment.airline || ''}
                onChange={(event) => onSegmentsChange(segments.map((item, index) => index === segmentIndex ? { ...item, airline: event.target.value } : item))}
                placeholder="e.g. Air Algerie"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>
            <div>
              <label htmlFor={`ticket-airport-start-${segmentIndex}`} className="mb-1 block text-sm font-medium text-slate-700">Airport start</label>
              <input
                id={`ticket-airport-start-${segmentIndex}`}
                value={segment.airport_start || ''}
                onChange={(event) => onSegmentsChange(segments.map((item, index) => index === segmentIndex ? { ...item, airport_start: event.target.value } : item))}
                placeholder="ALG"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>
            <div>
              <label htmlFor={`ticket-airport-end-${segmentIndex}`} className="mb-1 block text-sm font-medium text-slate-700">Airport end</label>
              <input
                id={`ticket-airport-end-${segmentIndex}`}
                value={segment.airport_end || ''}
                onChange={(event) => onSegmentsChange(segments.map((item, index) => index === segmentIndex ? { ...item, airport_end: event.target.value } : item))}
                placeholder="CDG"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>
            <div>
              <label htmlFor={`ticket-departure-time-${segmentIndex}`} className="mb-1 block text-sm font-medium text-slate-700">Departure time</label>
              <input
                id={`ticket-departure-time-${segmentIndex}`}
                type="datetime-local"
                value={segment.departure_time || ''}
                onChange={(event) => onSegmentsChange(segments.map((item, index) => index === segmentIndex ? { ...item, departure_time: event.target.value } : item))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>
            <div>
              <label htmlFor={`ticket-arrival-time-${segmentIndex}`} className="mb-1 block text-sm font-medium text-slate-700">Arrival time</label>
              <input
                id={`ticket-arrival-time-${segmentIndex}`}
                type="datetime-local"
                value={segment.arrival_time || ''}
                onChange={(event) => onSegmentsChange(segments.map((item, index) => index === segmentIndex ? { ...item, arrival_time: event.target.value } : item))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>
            <div>
              <label htmlFor={`ticket-baggage-soute-${segmentIndex}`} className="mb-1 block text-sm font-medium text-slate-700">Baggage en soute</label>
              <input
                id={`ticket-baggage-soute-${segmentIndex}`}
                value={segment.baggage_en_soute || ''}
                onChange={(event) => onSegmentsChange(segments.map((item, index) => index === segmentIndex ? { ...item, baggage_en_soute: event.target.value } : item))}
                placeholder="Checked bag"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>
            <div>
              <label htmlFor={`ticket-baggage-main-${segmentIndex}`} className="mb-1 block text-sm font-medium text-slate-700">Baggage à main</label>
              <input
                id={`ticket-baggage-main-${segmentIndex}`}
                value={segment.baggage_a_main || ''}
                onChange={(event) => onSegmentsChange(segments.map((item, index) => index === segmentIndex ? { ...item, baggage_a_main: event.target.value } : item))}
                placeholder="Cabin bag"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>
            {allowAddStop && segmentIndex < segments.length - 1 && (
              <div className="flex items-end">
                <label htmlFor={`ticket-stop-duration-${segmentIndex}`} className="block w-full text-sm font-medium text-slate-700">
                  Stop duration
                  <input
                    id={`ticket-stop-duration-${segmentIndex}`}
                    value={segment.stop_duration || ''}
                    onChange={(event) => onSegmentsChange(segments.map((item, index) => index === segmentIndex ? { ...item, stop_duration: event.target.value } : item))}
                    placeholder="Layover duration"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      ))}

      {allowAddStop && (
        <button
          type="button"
          onClick={() => onSegmentsChange([...segments, createFlightSegment()])}
          className="inline-flex items-center gap-2 rounded-xl border border-[#c9a84c] bg-[#fffaf0] px-3 py-2 text-sm font-semibold text-[#0a1120]"
        >
          <Plus size={16} />
          + Add Stop/Layover
        </button>
      )}
    </div>
  );

  const renderHotelPromotionForm = () => {
    const hotelTabs = ['Basic Info', 'Hotel Details'];

    const renderHotelTabContent = () => {
      if (activeTab === 'Hotel Details') {
        return (
          <div className="space-y-4">
            <HotelPromotionBuilder
              value={draft.hotel_details || createDefaultHotelDetails()}
              onChange={(nextDetails) => setDraft((prev) => ({ ...prev, hotel_details: nextDetails }))}
            />
          </div>
        );
      }

      return (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="hotel-promo-label" className="mb-1 block text-sm font-medium text-slate-700">Promotion Title</label>
              <input
                id="hotel-promo-label"
                value={draft.label || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                placeholder="Hotel Promotion - Alger"
              />
            </div>

            <div>
              <label htmlFor="hotel-promo-price" className="mb-1 block text-sm font-medium text-slate-700">Selling Price</label>
              <input
                id="hotel-promo-price"
                value={draft.selling_price || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, selling_price: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>

            <div>
              <label htmlFor="hotel-promo-stock" className="mb-1 block text-sm font-medium text-slate-700">Available Rooms / Stock</label>
              <input
                id="hotel-promo-stock"
                type="number"
                min="0"
                value={draft.stock || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, stock: event.target.value ? Number(event.target.value) : 0 }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>

            <div>
              <label htmlFor="hotel-promo-availability" className="mb-1 block text-sm font-medium text-slate-700">Availability</label>
              <button
                id="hotel-promo-availability"
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, is_available: !prev.is_available }))}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm font-semibold ${draft.is_available !== false ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
              >
                {draft.is_available !== false ? 'Available' : 'Unavailable'}
              </button>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-6">
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
          {hotelTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-2 transition ${activeTab === tab ? 'bg-[#0a1120] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {renderHotelTabContent()}
      </div>
    );
  };

  const renderTicketPromotionForm = () => {
    const ticketTabs = ['Basic Info', 'Flight Itinerary', 'Fare Rules', 'Good to Know'];

    const renderTicketTabContent = () => {
      if (activeTab === 'Flight Itinerary') {
        return (
          <div className="mt-4">
            <FlightItineraryBuilder
              value={draft.flight_details}
              onChange={(newDetails) => setDraft((prev) => ({ ...prev, flight_details: newDetails }))}
            />
          </div>
        );
      }

      if (activeTab === 'Fare Rules') {
        return (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <label htmlFor="ticket-fare-rules" className="mb-2 block text-sm font-medium text-slate-700">Cancellation Policy</label>
              <textarea
                id="ticket-fare-rules"
                value={draft.cancellation_policy || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, cancellation_policy: event.target.value }))}
                rows={12}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                placeholder="Add the ticket change, cancellation, and fare conditions here..."
              />
            </div>
          </div>
        );
      }

      if (activeTab === 'Good to Know') {
        return (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <label htmlFor="ticket-good-to-know" className="mb-2 block text-sm font-medium text-slate-700">Extra Guidance</label>
              <textarea
                id="ticket-good-to-know"
                value={draft.good_to_know || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, good_to_know: event.target.value }))}
                rows={12}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                placeholder="Add useful travel notices, baggage notes, airport advice, and customer information..."
              />
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="ticket-destination" className="mb-1 block text-sm font-medium text-slate-700">Destination</label>
              <input
                id="ticket-destination"
                value={draft.destination || ''}
                onChange={(event) => {
                  const nextDestination = event.target.value;
                  setDraft((prev) => ({
                    ...prev,
                    destination: nextDestination,
                    label: nextDestination ? `Ticket Promotion - ${nextDestination}` : 'Ticket Promotion',
                  }));
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>

            <div>
              <label htmlFor="ticket-service-ref" className="mb-1 block text-sm font-medium text-slate-700">Service Ref</label>
              <input
                id="ticket-service-ref"
                value={draft.service_ref || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, service_ref: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>

            <div>
              <label htmlFor="ticket-label" className="mb-1 block text-sm font-medium text-slate-700">Auto Label</label>
              <input
                id="ticket-label"
                value={draft.label || 'Ticket Promotion'}
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-700 outline-none"
              />
            </div>

            <div>
              <label htmlFor="ticket-price" className="mb-1 block text-sm font-medium text-slate-700">Selling Price</label>
              <input
                id="ticket-price"
                value={draft.selling_price || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, selling_price: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>

            <div>
              <label htmlFor="ticket-stock" className="mb-1 block text-sm font-medium text-slate-700">Available Seats / Stock</label>
              <input
                id="ticket-stock"
                type="number"
                value={draft.stock || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, stock: event.target.value ? Number(event.target.value) : 0 }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>

            <div>
              <label htmlFor="ticket-availability" className="mb-1 block text-sm font-medium text-slate-700">Availability</label>
              <button
                id="ticket-availability"
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, is_available: !prev.is_available }))}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm font-semibold ${draft.is_available !== false ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
              >
                {draft.is_available !== false ? 'Available' : 'Unavailable'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-[#0a1120]">
              <Tag size={16} className="text-[#c9a84c]" />
              <h4 className="text-sm font-semibold">Client Category Tags</h4>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-end">
                <div className="flex-1">
                  <label htmlFor="ticket-tag-select" className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Select tag</label>
                  <select
                    id="ticket-tag-select"
                    value=""
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) return;
                      setDraft((prev) => {
                        const existing = prev.target_tags || [];
                        return { ...prev, target_tags: existing.includes(value) ? existing : [...existing, value] };
                      });
                      setAvailableTags((prev) => (prev.includes(value) ? prev : [...prev, value]));
                      event.target.value = '';
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                  >
                    <option value="">Choose a tag</option>
                    {availableTags.map((tag) => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                </div>
              </div>

              {(draft.target_tags || []).length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {(draft.target_tags || []).map((tag, index) => (
                    <span key={`${tag}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-[#e7d4a9] bg-[#fffdf7] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#0a1120]">
                      {tag}
                      <button type="button" onClick={() => setDraft((prev) => ({ ...prev, target_tags: (prev.target_tags || []).filter((item) => item !== tag) }))} className="text-[#0a1120]">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-6">
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
          {ticketTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-2 transition ${activeTab === tab ? 'bg-[#0a1120] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {renderTicketTabContent()}
      </div>
    );
  };

  const ticketTabIndex = ticketPromotionTabs.indexOf(activeTab);
  const goToTicketTab = (direction) => {
    const nextIndex = Math.min(ticketPromotionTabs.length - 1, Math.max(0, ticketTabIndex + direction));
    setActiveTab(ticketPromotionTabs[nextIndex]);
  };

  const renderTripForm = () => {
    const packageKind = selectedType || draft.template_type || 'trip';

    if (packageKind === 'ticket_promotion') {
      return renderTicketPromotionForm();
    }

    if (packageKind === 'hotel_promotion') {
      return renderHotelPromotionForm();
    }

    const tabs = [
      { key: 1, label: 'Basic' },
      { key: 2, label: 'Travel' },
      { key: 3, label: 'Hotels' },
      { key: 4, label: 'Inclusions' },
      { key: 5, label: 'Exclusions' },
      { key: 6, label: 'Cancellation' },
      { key: 7, label: 'Good to Know' },
    ];

    if (step === 1) {
      return (
        <div className="space-y-4">
          {!isPilgrimagePackage && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
              <div className="flex gap-3 rounded-xl bg-slate-100 p-1">
                {['national', 'international'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, type: option }))}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${draft.type === option ? 'bg-[#0a1120] text-white' : 'text-slate-600'}`}
                  >
                    {option === 'national' ? 'National' : 'International'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Label</label>
              <input
                value={draft.label}
                onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Service ref</label>
              <select
                value={draft.service_ref || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, service_ref: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              >
                <option value="">Select service type</option>
                {serviceTypes.map((serviceType) => (
                  <option key={serviceType.id} value={serviceType.name}>{serviceType.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
              {isPilgrimagePackage ? (
                <div className="w-full rounded-xl border border-[#d6c38d] bg-[#f9f3e5] px-3 py-2.5 text-sm font-medium text-[#0a1120]">
                  Saudi Arabia
                </div>
              ) : !showCountryInput ? (
                <select
                  value={draft.country || ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === '__custom__') {
                      setShowCountryInput(true);
                      return;
                    }
                    setDraft((prev) => ({ ...prev, country: value }));
                    setShowCountryInput(false);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                >
                  <option value="">Select country</option>
                  {countryOptions.map((country) => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                  <option value="__custom__">+ Add new country</option>
                </select>
              ) : (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={draft.country}
                    onChange={(event) => setDraft((prev) => ({ ...prev, country: event.target.value }))}
                    placeholder="Enter country name"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setShowCountryInput(false);
                      setDraft((prev) => ({ ...prev, country: prev.country || '' }));
                    }}
                    className="text-xs font-medium text-[#0a1120] underline"
                  >
                    Use saved country list instead
                  </button>
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Destination</label>
              <input
                value={draft.destination}
                onChange={(event) => setDraft((prev) => ({ ...prev, destination: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-slate-700">Brochure Photos</label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#0a1120] px-3 py-2 text-xs font-semibold text-white">
                <Plus size={14} />
                Add image
                <input type="file" accept="image/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const uploadedUrl = String(reader.result || '');
                    if (!uploadedUrl) return;
                    setDraft((prev) => ({ ...prev, photos: [...(prev.photos || []), uploadedUrl] }));
                  };
                  reader.readAsDataURL(file);
                  event.target.value = '';
                }} />
              </label>
            </div>

            {(!draft.photos || draft.photos.length === 0) ? (
              <p className="text-sm text-slate-500">No brochure images added yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {draft.photos.map((photo, index) => (
                  <div key={`${photo}-${index}`} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <img src={photo} alt={`Brochure image ${index + 1}`} className="h-28 w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, photos: prev.photos.filter((item) => item !== photo) }))}
                      className="absolute right-2 top-2 rounded-full bg-slate-900/70 p-1.5 text-white"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, transfert: !prev.transfert }))}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${draft.transfert ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
              >
                Transfer Included
              </button>
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, visa_included: !prev.visa_included }))}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${draft.visa_included ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
              >
                Visa Included
              </button>
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, assurance: !prev.assurance }))}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${draft.assurance ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
              >
                Insurance Included
              </button>
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, is_available: !prev.is_available }))}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${draft.is_available ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
              >
                Availability
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-5">
          {draft.travel_schedule.map((travel, index) => (
            <div key={travel.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Travel Date {index + 1}</p>
                {draft.travel_schedule.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({
                      ...prev,
                      travel_schedule: syncTravelDateLabels(prev.travel_schedule.filter((item) => item.id !== travel.id)),
                    }))}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700"
                  >
                    <Trash2 size={14} />
                    Remove
                  </button>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Departure Date</label>
                  <input
                    type="date"
                    value={travel.departure_date}
                    onChange={(event) => setDraft((prev) => ({
                      ...prev,
                      travel_schedule: prev.travel_schedule.map((item) =>
                        item.id === travel.id ? { ...item, departure_date: event.target.value } : item
                      ),
                    }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Departure Hour</label>
                  <input
                    type="time"
                    value={travel.departure_time}
                    onChange={(event) => setDraft((prev) => ({
                      ...prev,
                      travel_schedule: prev.travel_schedule.map((item) =>
                        item.id === travel.id ? { ...item, departure_time: event.target.value } : item
                      ),
                    }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Return Date</label>
                  <input
                    type="date"
                    value={travel.return_date}
                    onChange={(event) => setDraft((prev) => ({
                      ...prev,
                      travel_schedule: prev.travel_schedule.map((item) =>
                        item.id === travel.id ? { ...item, return_date: event.target.value } : item
                      ),
                    }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Return Hour</label>
                  <input
                    type="time"
                    value={travel.return_time}
                    onChange={(event) => setDraft((prev) => ({
                      ...prev,
                      travel_schedule: prev.travel_schedule.map((item) =>
                        item.id === travel.id ? { ...item, return_time: event.target.value } : item
                      ),
                    }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setDraft((prev) => ({
              ...prev,
              travel_schedule: syncTravelDateLabels([
                ...prev.travel_schedule,
                createTravelDate(prev.travel_schedule.length),
              ]),
            }))}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand-navy"
          >
            <Plus size={16} />
            Add Travel Date
          </button>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Departure point</label>
              <input
                value={draft.departure_point}
                onChange={(event) => setDraft((prev) => ({ ...prev, departure_point: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Transport</label>
              <input
                value={draft.transport}
                onChange={(event) => setDraft((prev) => ({ ...prev, transport: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
              />
            </div>

            <div className="md:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-700">Itinéraire (optional)</p>
                  <p className="text-xs text-slate-500">Dynamic day-by-day itinerary</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, include_itinerary: !prev.include_itinerary }))}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${draft.include_itinerary ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
                >
                  {draft.include_itinerary ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {draft.include_itinerary && (
                <div className="space-y-3">
                  {(draft.itinerary_days || []).map((day, index) => (
                    <div key={day.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Day {index + 1}</label>
                        {(draft.itinerary_days || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDraft((prev) => ({
                              ...prev,
                              itinerary_days: prev.itinerary_days.filter((item) => item.id !== day.id),
                            }))}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="mb-2">
                        <label className="mb-1 block text-sm font-medium text-slate-700">Day Label</label>
                        <input
                          value={day.label || ''}
                          onChange={(event) => setDraft((prev) => ({
                            ...prev,
                            itinerary_days: prev.itinerary_days.map((item) =>
                              item.id === day.id ? { ...item, label: event.target.value } : item
                            ),
                          }))}
                          placeholder="Jour 1"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                        <textarea
                          value={day.description || ''}
                          onChange={(event) => setDraft((prev) => ({
                            ...prev,
                            itinerary_days: prev.itinerary_days.map((item) =>
                              item.id === day.id ? { ...item, description: event.target.value } : item
                            ),
                          }))}
                          rows={4}
                          placeholder="Arrival in the city, hotel check-in, guided visit..."
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({
                      ...prev,
                      itinerary_days: [
                        ...(prev.itinerary_days || []),
                        createItineraryDay(`Jour ${(prev.itinerary_days || []).length + 1}`, ''),
                      ],
                    }))}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand-navy"
                  >
                    <Plus size={16} />
                    Add Day
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (step === 3 && isPilgrimagePackage) {
      return (
        <div className="space-y-5">
          <div className="rounded-2xl border border-dashed border-[#c9a84c] bg-[#fffaf0] p-3 text-xs text-slate-600">
            Hajj &amp; Omra pricing is set per hotel (no global travel-date pricing). Add every hotel option with its own room rates below.
          </div>

          {draft.hotels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No hotels added yet.
            </div>
          ) : (
            draft.hotels.map((hotel, index) => (
              <div key={hotel.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Hotel {index + 1}</p>
                  {draft.hotels.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, hotels: prev.hotels.filter((item) => item.id !== hotel.id) }))}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700"
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Hotel Name</label>
                      <input
                        value={hotel.hotel_name}
                        onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, hotel_name: event.target.value } : item) }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Nights</label>
                      <input
                        type="number"
                        min="0"
                        value={hotel.nights}
                        onChange={(event) => {
                          const nextNights = event.target.value;
                          setDraft((prev) => ({
                            ...prev,
                            hotels: prev.hotels.map((item) => item.id === hotel.id
                              ? { ...item, nights: nextNights, assigned_nights_dates: item.assigned_nights_dates || getAutoAssignedNightsLabel(nextNights) }
                              : item),
                          }));
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Location</label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, location: 'Mecca' } : item) }))}
                        className={`rounded-xl border px-3 py-2 text-sm font-medium ${hotel.location === 'Mecca' ? 'border-brand-gold bg-brand-gold/10 text-brand-navy' : 'border-slate-200 bg-white text-slate-600'}`}
                      >
                        Mecca (مكة المكرمة)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, location: 'Medina' } : item) }))}
                        className={`rounded-xl border px-3 py-2 text-sm font-medium ${hotel.location === 'Medina' ? 'border-brand-gold bg-brand-gold/10 text-brand-navy' : 'border-slate-200 bg-white text-slate-600'}`}
                      >
                        Medina (المدينة المنورة)
                      </button>
                    </div>

                    <div className="mt-3">
                      <label className="mb-1 block text-sm font-medium text-slate-700">Distance from Haram (البعد عن الحرم)</label>
                      <input
                        value={hotel.distance_from_haram}
                        onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, distance_from_haram: event.target.value } : item) }))}
                        placeholder="Example: 300m"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Room pricing</p>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Single</label>
                        <input
                          value={hotel.prix_single}
                          onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, prix_single: event.target.value } : item) }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Double</label>
                        <input
                          value={hotel.prix_double}
                          onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, prix_double: event.target.value } : item) }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Triple</label>
                        <input
                          value={hotel.prix_triple}
                          onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, prix_triple: event.target.value } : item) }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Quadruple (الرباعي)</label>
                        <input
                          value={hotel.prix_quadruple}
                          onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, prix_quadruple: event.target.value } : item) }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Quintuple (الخماسي)</label>
                        <input
                          value={hotel.prix_quintuple}
                          onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, prix_quintuple: event.target.value } : item) }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Meal Type</label>
                    <div className="flex flex-wrap gap-2">
                      {mealTypeOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, meal_type: option } : item) }))}
                          className={`rounded-xl border px-3 py-2 text-xs font-medium ${hotel.meal_type === option ? 'border-brand-gold bg-brand-gold/10 text-brand-navy' : 'border-slate-200 bg-white text-slate-600'}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-700">Additional custom prices</p>
                    </div>

                    <div className="space-y-3">
                      {(hotel.custom_prices || []).length === 0 ? (
                        <p className="text-sm text-slate-500">No custom price added yet.</p>
                      ) : (
                        (hotel.custom_prices || []).map((priceOption) => (
                          <div key={priceOption.id} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                            <input
                              value={priceOption.name || ''}
                              onChange={(event) => setDraft((prev) => ({
                                ...prev,
                                hotels: prev.hotels.map((item) => item.id === hotel.id ? {
                                  ...item,
                                  custom_prices: (item.custom_prices || []).map((entry) => entry.id === priceOption.id ? { ...entry, name: event.target.value } : entry),
                                } : item),
                              }))}
                              placeholder="Custom Label / Name"
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                            />
                            <input
                              type="number"
                              min="0"
                              value={priceOption.price ?? ''}
                              onChange={(event) => setDraft((prev) => ({
                                ...prev,
                                hotels: prev.hotels.map((item) => item.id === hotel.id ? {
                                  ...item,
                                  custom_prices: (item.custom_prices || []).map((entry) => entry.id === priceOption.id ? { ...entry, price: event.target.value } : entry),
                                } : item),
                              }))}
                              placeholder="Price"
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                            />
                            <button
                              type="button"
                              onClick={() => setDraft((prev) => ({
                                ...prev,
                                hotels: prev.hotels.map((item) => item.id === hotel.id ? {
                                  ...item,
                                  custom_prices: (item.custom_prices || []).filter((entry) => entry.id !== priceOption.id),
                                } : item),
                              }))}
                              className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-700"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))
                      )}

                      <button
                        type="button"
                        onClick={() => setDraft((prev) => ({
                          ...prev,
                          hotels: prev.hotels.map((item) => item.id === hotel.id ? {
                            ...item,
                            custom_prices: [...(item.custom_prices || []), createCustomPriceEntry()],
                          } : item),
                        }))}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                      >
                        <Plus size={14} />
                        Add custom price
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                    <span className="text-sm font-medium text-slate-700">Meals included</span>
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, meals: !item.meals } : item) }))}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${hotel.meals ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
                    >
                      {hotel.meals ? 'Yes' : 'No'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}

          <button
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, hotels: [...prev.hotels, createEmptyHotel()] }))}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand-navy"
          >
            <Plus size={16} />
            Add Hotel
          </button>
        </div>
      );
    }

    if (step === 3) {
      const visibleHotels = getHotelsForActiveTravelDate();
      const selectedTravel = draft.travel_schedule.find((travel) => travel.id === activeHotelDateId) || draft.travel_schedule[0];

      return (
        <div className="space-y-5">
          {draft.travel_schedule.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
              <div className="flex flex-wrap gap-2">
                {draft.travel_schedule.map((travel, index) => (
                  <button
                    key={travel.id}
                    type="button"
                    onClick={() => setActiveHotelDateId(travel.id)}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold ${travel.id === activeHotelDateId ? 'bg-[#0a1120] text-white' : 'bg-white text-slate-600'}`}
                  >
                    {travel.label || getTravelDateLabel(index)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedTravel && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <span className="font-semibold text-slate-700">{selectedTravel.label || getTravelDateLabel(0)}</span>
              {selectedTravel.departure_date || selectedTravel.return_date
                ? ` • ${selectedTravel.departure_date || 'departure'}${selectedTravel.return_date ? ` → ${selectedTravel.return_date}` : ''}`
                : ' • hotel details for this travel date'}
            </div>
          )}

          {visibleHotels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No hotels added for this travel date yet.
            </div>
          ) : (
            <>
              {(() => {
                const generalDateHotel = visibleHotels.find((item) => item.is_primary !== false) || visibleHotels[0];
                const optionalHotel = visibleHotels.find((item) => item.is_primary === false);

                return generalDateHotel ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-[#fffaf0] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-700">Travel date pricing</p>
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                          General rate
                        </span>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">Single</label>
                          <input
                            value={generalDateHotel.prix_single}
                            onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === generalDateHotel.id ? { ...item, prix_single: event.target.value } : item) }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">Double</label>
                          <input
                            value={generalDateHotel.prix_double}
                            onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === generalDateHotel.id ? { ...item, prix_double: event.target.value } : item) }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">Triple</label>
                          <input
                            value={generalDateHotel.prix_triple}
                            onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === generalDateHotel.id ? { ...item, prix_triple: event.target.value } : item) }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-emerald-900">Travel date custom pricing</p>
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                          Date level
                        </span>
                      </div>

                      <div className="space-y-3">
                        {(generalDateHotel.custom_prices || []).length === 0 ? (
                          <p className="text-sm text-emerald-800">No custom price added for this travel date yet.</p>
                        ) : (
                          (generalDateHotel.custom_prices || []).map((priceOption, optionIndex) => (
                            <div key={priceOption.id || `travel-custom-${generalDateHotel.id}-${optionIndex}`} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                              <input
                                value={priceOption.name || ''}
                                onChange={(event) => setDraft((prev) => ({
                                  ...prev,
                                  hotels: prev.hotels.map((item) => item.id === generalDateHotel.id ? {
                                    ...item,
                                    custom_prices: (item.custom_prices || []).map((entry) => entry.id === priceOption.id ? { ...entry, name: event.target.value } : entry),
                                  } : item),
                                }))}
                                placeholder="Custom Label / Name"
                                className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                              />
                              <input
                                type="number"
                                min="0"
                                value={priceOption.price ?? ''}
                                onChange={(event) => setDraft((prev) => ({
                                  ...prev,
                                  hotels: prev.hotels.map((item) => item.id === generalDateHotel.id ? {
                                    ...item,
                                    custom_prices: (item.custom_prices || []).map((entry) => entry.id === priceOption.id ? { ...entry, price: event.target.value } : entry),
                                  } : item),
                                }))}
                                placeholder="Price"
                                className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                              />
                              <button
                                type="button"
                                onClick={() => setDraft((prev) => ({
                                  ...prev,
                                  hotels: prev.hotels.map((item) => item.id === generalDateHotel.id ? {
                                    ...item,
                                    custom_prices: (item.custom_prices || []).filter((entry) => entry.id !== priceOption.id),
                                  } : item),
                                }))}
                                className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-700"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))
                        )}

                        <button
                          type="button"
                          onClick={() => setDraft((prev) => ({
                            ...prev,
                            hotels: prev.hotels.map((item) => item.id === generalDateHotel.id ? {
                              ...item,
                              custom_prices: [...(item.custom_prices || []), createCustomPriceEntry()],
                            } : item),
                          }))}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                        >
                          <Plus size={14} />
                          Add custom price
                        </button>
                      </div>
                    </div>

                    {optionalHotel && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-amber-900">Optional hotel custom pricing</p>
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                            Optional only
                          </span>
                        </div>

                        <div className="space-y-3">
                          {(optionalHotel.custom_prices || []).length === 0 ? (
                            <p className="text-sm text-amber-800">No custom price added for this optional hotel yet.</p>
                          ) : (
                            (optionalHotel.custom_prices || []).map((priceOption, optionIndex) => (
                              <div key={priceOption.id || `custom-${optionalHotel.id}-${optionIndex}`} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                                <input
                                  value={priceOption.name || ''}
                                  onChange={(event) => setDraft((prev) => ({
                                    ...prev,
                                    hotels: prev.hotels.map((item) => item.id === optionalHotel.id ? {
                                      ...item,
                                      custom_prices: (item.custom_prices || []).map((entry) => entry.id === priceOption.id ? { ...entry, name: event.target.value } : entry),
                                    } : item),
                                  }))}
                                  placeholder="Custom Label / Name"
                                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  value={priceOption.price ?? ''}
                                  onChange={(event) => setDraft((prev) => ({
                                    ...prev,
                                    hotels: prev.hotels.map((item) => item.id === optionalHotel.id ? {
                                      ...item,
                                      custom_prices: (item.custom_prices || []).map((entry) => entry.id === priceOption.id ? { ...entry, price: event.target.value } : entry),
                                    } : item),
                                  }))}
                                  placeholder="Price"
                                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                                />
                                <button
                                  type="button"
                                  onClick={() => setDraft((prev) => ({
                                    ...prev,
                                    hotels: prev.hotels.map((item) => item.id === optionalHotel.id ? {
                                      ...item,
                                      custom_prices: (item.custom_prices || []).filter((entry) => entry.id !== priceOption.id),
                                    } : item),
                                  }))}
                                  className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-700"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ))
                          )}

                          <button
                            type="button"
                            onClick={() => setDraft((prev) => ({
                              ...prev,
                              hotels: prev.hotels.map((item) => item.id === optionalHotel.id ? {
                                ...item,
                                custom_prices: [...(item.custom_prices || []), createCustomPriceEntry()],
                              } : item),
                            }))}
                            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white"
                          >
                            <Plus size={14} />
                            Add custom price
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null;
              })()}

              {visibleHotels.map((hotel, index) => (
                <div key={hotel.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">Hotel {index + 1}</p>
                    {visibleHotels.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, hotels: prev.hotels.filter((item) => item.id !== hotel.id) }))}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Hotel Name</label>
                        <input
                          value={hotel.hotel_name}
                          onChange={(event) => setDraft((prev) => {
                            const selectedTravelId = activeHotelDateId || hotel.travel_date_id || prev.travel_schedule[0]?.id || null;
                            const selectedTravel = prev.travel_schedule.find((travel) => travel.id === selectedTravelId);
                            const fallbackLabel = selectedTravel?.label || prev.travel_schedule[0]?.label || getTravelDateLabel(0);

                            return { ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, hotel_name: event.target.value, travel_date_id: selectedTravelId, travel_date_label: selectedTravel?.label || item.travel_date_label || fallbackLabel } : item) };
                          })}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Nights</label>
                        <input
                          type="number"
                          min="0"
                          value={hotel.nights}
                          onChange={(event) => {
                            const nextNights = event.target.value;
                            setDraft((prev) => ({
                              ...prev,
                              hotels: prev.hotels.map((item) => item.id === hotel.id
                                ? {
                                    ...item,
                                    nights: nextNights,
                                    assigned_nights_dates: item.assigned_nights_dates || getAutoAssignedNightsLabel(nextNights),
                                  }
                                : item),
                            }));
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Hotel pricing scope</p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, is_primary: true, replacement_for_hotel_id: null } : item) }))}
                          className={`rounded-xl border px-3 py-2 text-sm font-medium ${hotel.is_primary ? 'border-brand-gold bg-brand-gold/10 text-brand-navy' : 'border-slate-200 bg-white text-slate-600'}`}
                        >
                          General travel-date price
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, is_primary: false, replacement_for_hotel_id: item.replacement_for_hotel_id || visibleHotels.find((candidate) => candidate.is_primary !== false && candidate.id !== item.id)?.id || null } : item) }))}
                          className={`rounded-xl border px-3 py-2 text-sm font-medium ${!hotel.is_primary ? 'border-brand-gold bg-brand-gold/10 text-brand-navy' : 'border-slate-200 bg-white text-slate-600'}`}
                        >
                          Optional hotel-only price
                        </button>
                      </div>

                      <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                        {hotel.is_primary
                          ? 'This price is treated as the standard room rate for this travel date.'
                          : 'This price is only applied to this optional hotel choice and is not treated as the base travel-date rate.'}
                      </div>

                      {!hotel.is_primary && (
                        <div className="mt-3">
                          <label className="mb-1 block text-sm font-medium text-slate-700">Replacement for which primary hotel?</label>
                          <select
                            value={hotel.replacement_for_hotel_id || ''}
                            onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, replacement_for_hotel_id: event.target.value || null } : item) }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                          >
                            <option value="">Select a primary hotel</option>
                            {visibleHotels
                              .filter((candidate) => candidate.is_primary !== false && candidate.id !== hotel.id)
                              .map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>{candidate.hotel_name || 'Primary hotel'}</option>
                              ))}
                          </select>
                        </div>
                      )}

                      <div className="mt-3">
                        <label className="mb-1 block text-sm font-medium text-slate-700">Assigned nights / dates</label>
                        <input
                          value={hotel.assigned_nights_dates || getAutoAssignedNightsLabel(hotel.nights)}
                          onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, assigned_nights_dates: event.target.value } : item) }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                          placeholder="Example: N1, N2, N3"
                        />
                      </div>
                    </div>

                    {hotel.is_primary === false && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">Single</label>
                          <input
                            value={hotel.prix_single}
                            onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, prix_single: event.target.value } : item) }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">Double</label>
                          <input
                            value={hotel.prix_double}
                            onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, prix_double: event.target.value } : item) }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">Triple</label>
                          <input
                            value={hotel.prix_triple}
                            onChange={(event) => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, prix_triple: event.target.value } : item) }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">Meal Type</label>
                          <div className="flex flex-wrap gap-2">
                            {['Petit Déjeuner', 'Demi-Pension', 'Pension Complète', 'All Inclusive'].map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, meal_type: option } : item) }))}
                                className={`rounded-xl border px-3 py-2 text-xs font-medium ${hotel.meal_type === option ? 'border-brand-gold bg-brand-gold/10 text-brand-navy' : 'border-slate-200 bg-white text-slate-600'}`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {hotel.is_primary !== false && (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-500">
                        General travel-date price is configured above. Optional hotel-only pricing is configured in the optional section only.
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <label className="mb-2 block text-sm font-medium text-slate-700">Meal Type</label>
                      <div className="flex flex-wrap gap-2">
                        {['Petit Déjeuner', 'Demi-Pension', 'Pension Complète', 'All Inclusive', 'All Inclusive Soft'].map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, meal_type: option } : item) }))}
                            className={`rounded-xl border px-3 py-2 text-xs font-medium ${hotel.meal_type === option ? 'border-brand-gold bg-brand-gold/10 text-brand-navy' : 'border-slate-200 bg-white text-slate-600'}`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                      <span className="text-sm font-medium text-slate-700">Meals included</span>
                      <button
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, hotels: prev.hotels.map((item) => item.id === hotel.id ? { ...item, meals: !item.meals } : item) }))}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${hotel.meals ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
                      >
                        {hotel.meals ? 'Yes' : 'No'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {draft.travel_schedule.length > 1 && (
              <button
                type="button"
                onClick={copyHotelsFromFirstTravelDate}
                className="inline-flex items-center gap-2 rounded-xl border border-[#c9a84c] bg-[#fff7dd] px-4 py-2.5 text-sm font-semibold text-brand-navy"
              >
                <Plus size={16} />
                {`Copy from ${draft.travel_schedule[0]?.label || getTravelDateLabel(0)}`}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const dateId = activeHotelDateId || draft.travel_schedule[0]?.id || null;
                const dateLabel = draft.travel_schedule.find((travel) => travel.id === dateId)?.label || getTravelDateLabel(0);
                setDraft((prev) => ({ ...prev, hotels: [...prev.hotels, createEmptyHotel(dateId, dateLabel)] }));
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand-navy"
            >
              <Plus size={16} />
              Add Hotel
            </button>
          </div>
        </div>
      );
    }

    if (step === 4) {
      return (
        <div className="space-y-4">
          {draft.inclusions.map((item, index) => (
            <div key={item.id} className="flex gap-3">
              <input
                value={item.value}
                onChange={(event) => setDraft((prev) => ({ ...prev, inclusions: prev.inclusions.map((entry) => entry.id === item.id ? { ...entry, value: event.target.value } : entry) }))}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                placeholder={`Inclusion ${index + 1}`}
              />
              {draft.inclusions.length > 1 && (
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, inclusions: prev.inclusions.filter((entry) => entry.id !== item.id) }))}
                  className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-700"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, inclusions: [...prev.inclusions, createListEntry('')] }))}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand-navy"
          >
            <Plus size={16} />
            Add Inclusion
          </button>
        </div>
      );
    }

    if (step === 5) {
      return (
        <div className="space-y-4">
          {draft.exclusions.map((item, index) => (
            <div key={item.id} className="flex gap-3">
              <input
                value={item.value}
                onChange={(event) => setDraft((prev) => ({ ...prev, exclusions: prev.exclusions.map((entry) => entry.id === item.id ? { ...entry, value: event.target.value } : entry) }))}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
                placeholder={`Exclusion ${index + 1}`}
              />
              {draft.exclusions.length > 1 && (
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, exclusions: prev.exclusions.filter((entry) => entry.id !== item.id) }))}
                  className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-700"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, exclusions: [...prev.exclusions, createListEntry('')] }))}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand-navy"
          >
            <Plus size={16} />
            Add Exclusion
          </button>
        </div>
      );
    }

    if (step === 6) {
      return (
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Cancellation Policy</label>
          <textarea
            value={draft.cancellation_policy}
            onChange={(event) => setDraft((prev) => ({ ...prev, cancellation_policy: event.target.value }))}
            rows={10}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
            placeholder="Before 30 days: full refund..."
          />
        </div>
      );
    }

    if (step === 7) {
      return (
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Good to Know</label>
          <textarea
            value={draft.good_to_know}
            onChange={(event) => setDraft((prev) => ({ ...prev, good_to_know: event.target.value }))}
            rows={10}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-[#c9a84c]"
            placeholder="Important notes, visa reminders, dress code, local tips..."
          />
        </div>
      );
    }

    return null;
  };

  const pageTitle = language === 'en'
    ? `${packageTypeCards.find((card) => card.key === selectedType)?.label || 'Trip'} Packages`
    : `${packageTypeCards.find((card) => card.key === selectedType)?.labelAr || 'رحلة'} / باقات`;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-[#0a1120] p-5 text-white shadow-lg">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c9a84c]">{language === 'en' ? 'Packages' : 'الباقات'}</p>
            <h2 className="mt-2 font-serif text-3xl text-white">{language === 'en' ? 'Packages' : 'الباقات'}</h2>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-100">
              <ShieldCheck size={14} className="text-[#c9a84c]" />
              {canWrite ? 'Super Admin + Sales Agent' : 'Viewer read-only'}
            </span>
          </div>
        </div>
      </div>

      {selectedType === null ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {packageTypeCards.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => setSelectedType(card.key)}
              className="group rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#c9a84c]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff7dd] text-2xl shadow-inner">
                {card.icon}
              </div>

              <div className="mt-5">
                <p className="text-xl font-serif text-[#0a1120]">{language === 'en' ? card.label : card.labelAr}</p>
                <p className="mt-1 text-sm text-slate-500">{typeCounts[card.key] || 0} existing</p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-3">
                <span className="text-sm font-semibold text-[#0a1120]">{language === 'en' ? 'View Packages' : 'عرض الباقات'}</span>
                <ChevronRight size={18} className="text-[#c9a84c]" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedType(null)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#0a1120]"
              >
                <ChevronLeft size={16} />
                {language === 'en' ? 'Back' : 'رجوع'}
              </button>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c9a84c]">{language === 'en' ? 'Package type' : 'نوع الباقة'}</p>
                <h3 className="mt-1 text-2xl font-serif text-[#0a1120]">{pageTitle}</h3>
              </div>
            </div>

            <button
              type="button"
              disabled={!canWrite}
              onClick={openCreate}
              className="rounded-xl bg-[#c9a84c] px-4 py-2.5 text-sm font-bold text-[#0a1120] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {language === 'en' ? '+ Create' : '+ إنشاء'}
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {loading ? (
              <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
                Loading package templates...
              </div>
            ) : activeTemplates.length === 0 ? (
              <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
                {language === 'en' ? `No ${packageTypeCards.find((card) => card.key === selectedType)?.label || 'package'} templates created yet.` : `لا توجد ${packageTypeCards.find((card) => card.key === selectedType)?.labelAr || 'باقات'} بعد.`}
              </div>
            ) : (
              activeTemplates.map((item) => {
                const flightDetails = (() => {
                  if (!item?.flight_details) return {};
                  if (typeof item.flight_details === 'string') {
                    try {
                      const parsed = JSON.parse(item.flight_details);
                      return parsed && typeof parsed === 'object' ? parsed : {};
                    } catch {
                      return {};
                    }
                  }
                  return typeof item.flight_details === 'object' ? item.flight_details : {};
                })();

                const outboundJourney = flightDetails.outbound?.journey || flightDetails.journey || {};
                const returnJourney = flightDetails.return?.journey || flightDetails.return_journey?.journey || {};
                const airlineName = outboundJourney.airline || 'Standard Flight';
                const startPoint = outboundJourney.start_airport || item?.departure_point || '—';
                const endPoint = outboundJourney.end_airport || item?.destination || '—';
                const returnStartPoint = returnJourney.start_airport || returnJourney.start || endPoint;
                const returnEndPoint = returnJourney.end_airport || returnJourney.end || startPoint;
                const tripType = flightDetails.trip_type || 'one-way';
                const rate = Number(item?.selling_price ?? 0);
                const seats = Number(item?.stock ?? 0);
                const outboundStops = Array.isArray(flightDetails.outbound?.stops) ? flightDetails.outbound.stops : [];
                const returnStops = Array.isArray(flightDetails.return?.stops) ? flightDetails.return.stops : (Array.isArray(flightDetails.return_journey?.stops) ? flightDetails.return_journey.stops : []);
                const layoverCount = outboundStops.length + returnStops.length;

                const isTicketCard = item?.template_type === 'ticket' || item?.template_type === 'ticket_promotion';
                const isHotelCard = item?.template_type === 'hotel_promotion';
                const hotelDetails = parseJsonObject(item?.hotel_details || {}, createDefaultHotelDetails());
                const hotelWebsite = hotelDetails?.hotel_website || '';
                const hotelMapUrl = hotelDetails?.hotel_map_url || '';
                const hotelName = hotelDetails?.hotel_name || item?.label || 'Hotel promotion';
                const hotelCountry = hotelDetails?.country || item?.country || '—';
                const hotelProvince = hotelDetails?.province || item?.destination || '—';
                const hotelStars = Number(hotelDetails?.stars || 0);
                const hotelDiscountLabel = hotelDetails?.discount_type === 'fixed'
                  ? `${formatDZD(hotelDetails?.discount_value || 0)} off`
                  : `${hotelDetails?.discount_value || 0}% off`;

                return (
                  <div
                    key={item.id}
                    className="group overflow-hidden rounded-[28px] border border-[#ead9a2] bg-[radial-gradient(circle_at_top_left,_#fffdf9_0%,_#f8f3e3_30%,_#f4efe6_100%)] shadow-[0_16px_45px_rgba(10,17,32,0.07)] transition duration-200 hover:-translate-y-1 hover:border-[#c9a84c]"
                  >
                    <div className="flex items-center justify-between border-b border-[#f2e8c8] bg-[#fffaf0] px-4 py-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-[#e8d6a3] bg-[#fff7dd] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0a1120]">
                        <span className="text-[#c9a84c]">✈️</span>
                        {tripType === 'round-trip' ? 'ROUND TRIP' : tripType === 'multi-city' ? 'MULTI CITY' : 'INTERNATIONAL'}
                      </div>

                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                          item.is_available === false ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {item.is_available === false ? 'Unavailable' : 'Available'}
                      </span>
                    </div>

                    <div className="space-y-3 p-3.5">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c9a84c]">
                            {item.service_ref || 'SERVICE'}
                          </p>
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="inline-flex items-center gap-1 rounded-full border border-[#e2cc88] bg-[#fffaf0] px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-[#0a1120] transition hover:bg-[#f9e7a3]"
                          >
                            ✏️ Edit
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="mt-2 w-full text-left text-lg font-black leading-tight text-[#0a1120]"
                        >
                          {item.label || 'Ticket Promotion'}
                        </button>
                      </div>

                      {isTicketCard ? (
                        <div className="rounded-[18px] border border-[#efe4c5] bg-[linear-gradient(135deg,_#f9f6ef_0%,_#f3efe6_100%)] p-2.5 shadow-inner">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#0a1120]">
                              <span className="text-[#c9a84c]">✈️</span>
                              <span>{airlineName}</span>
                            </div>
                            {layoverCount > 0 && (
                              <span className="rounded-full border border-[#ead9a2] bg-[#fffaf0] px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-[#0a1120]">
                                {layoverCount} layover{layoverCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div className="rounded-xl border border-[#e8dcc0] bg-[#fffdf9] px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Outbound</p>
                                <span className="rounded-full bg-[#0a1120] px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-white">Out</span>
                              </div>
                              <p className="mt-1 text-base font-black text-[#0a1120]">{startPoint} → {endPoint}</p>
                              {outboundStops.length > 0 && (
                                <p className="mt-1 text-[10px] text-slate-600">
                                  Layover: {outboundStops[0]?.stop_airport || outboundStops[0]?.airport || 'TBD'} • {outboundStops[0]?.stop_duration_hours || '—'}
                                </p>
                              )}
                            </div>

                            {tripType === 'round-trip' && (
                              <div className="rounded-xl border border-[#e8dcc0] bg-[#fffdf9] px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Return</p>
                                  <span className="rounded-full bg-[#e7f7ef] px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-[#0f766e]">Return</span>
                                </div>
                                <p className="mt-1 text-base font-black text-[#0a1120]">{returnStartPoint} → {returnEndPoint}</p>
                                {returnStops.length > 0 && (
                                  <p className="mt-1 text-[10px] text-slate-600">
                                    Layover: {returnStops[0]?.stop_airport || returnStops[0]?.airport || 'TBD'} • {returnStops[0]?.stop_duration_hours || '—'}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : isHotelCard ? (
                        <div className="h-2" />
                      ) : (
                        <div className="mt-4 space-y-2 text-sm text-slate-600">
                          <div className="flex items-center gap-2"><MapPin size={14} className="text-[#c9a84c]" /> {item.country || '—'}</div>
                          <div className="flex items-center gap-2"><MapPin size={14} className="text-[#c9a84c]" /> {item.destination || item.location || '—'}</div>
                          <div className="flex items-center gap-2"><CalendarDays size={14} className="text-[#c9a84c]" /> {item.departure_date || '—'}</div>
                          <div className="flex items-center gap-2"><Clock3 size={14} className="text-[#c9a84c]" /> {(item.duration_nights ?? '—')} nights</div>
                        </div>
                      )}

                      {isHotelCard ? (
                        <div className="rounded-[18px] border border-[#efe4c5] bg-[linear-gradient(135deg,_#fffaf1_0%,_#fef7df_100%)] p-3 shadow-inner">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#c9a84c]">Hotel offer</p>
                              <h4 className="mt-1 text-lg font-black text-[#0a1120]">{hotelName}</h4>
                            </div>
                            <div className="rounded-full border border-[#ead9a2] bg-[#fffdf8] px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#0a1120]">
                              {hotelStars ? `${hotelStars}★` : 'Hotel'}
                            </div>
                          </div>

                          <div className="mt-3 space-y-2 text-sm text-slate-700">
                            <div className="flex items-center gap-2"><MapPin size={14} className="text-[#c9a84c]" /> {hotelCountry}</div>
                            <div className="flex items-center gap-2"><MapPin size={14} className="text-[#c9a84c]" /> {hotelProvince}</div>
                            <div className="flex items-center gap-2"><CalendarDays size={14} className="text-[#c9a84c]" /> {hotelDetails?.start_date || '—'} {hotelDetails?.end_date ? `→ ${hotelDetails.end_date}` : ''}</div>
                            <div className="flex items-center gap-2"><Tag size={14} className="text-[#c9a84c]" /> {hotelDiscountLabel}</div>
                          </div>

                          {(hotelWebsite || hotelMapUrl) && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {hotelWebsite && (
                                <a href={hotelWebsite} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-[#0a1120]">
                                  Website
                                </a>
                              )}
                              {hotelMapUrl && (
                                <a href={hotelMapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-[#0a1120]">
                                  Maps
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      ) : isTicketCard ? (
                        <div className="flex items-center justify-between rounded-2xl border border-[#ead9a2] bg-[#fffaf0] px-3 py-2.5">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Price</p>
                            <p className="mt-1 text-xl font-black text-[#0a1120]">
                              {new Intl.NumberFormat('fr-DZ', {
                                style: 'currency',
                                currency: 'DZD',
                                maximumFractionDigits: 0,
                              }).format(rate)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Seats</p>
                            <p className="mt-1 text-xl font-black text-[#0a1120]">{seats}</p>
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenStats(item)}
                          className="flex-1 rounded-xl bg-[#fff7dd] px-3 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-[#0a1120] transition hover:bg-[#f9e7a3]"
                        >
                          📊 View Stats
                        </button>

                        {item.template_type !== 'ticket' && item.template_type !== 'ticket_promotion' && (
                          <button
                            type="button"
                            onClick={() => handleGenerateBrochure(item)}
                            disabled={generatingBrochureId === item.id}
                            className="rounded-xl bg-[#0a1120] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {generatingBrochureId === item.id ? 'Generating...' : 'Generate Brochure'}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => openPackageDetails(item)}
                          className="flex-1 rounded-xl border border-[#e4d2a0] bg-white px-3 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-[#0a1120] shadow-sm transition hover:border-[#c9a84c] hover:bg-[#fffaf0]"
                        >
                          View Details
                        </button>

                        {item.brochure_url && (
                          <>
                            <button
                              type="button"
                              onClick={() => downloadBrochureLink(item.brochure_url)}
                              className="rounded-xl border border-[#c9a84c] bg-[#fff7dd] px-3 py-2 text-xs font-semibold text-[#0a1120]"
                            >
                              Download
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyBrochureLink(item.brochure_url)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                            >
                              Copy link
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {brochurePickerOpen && brochurePickerTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c9a84c]">Brochure Cover</p>
                <h3 className="mt-2 font-serif text-2xl text-[#0a1120]">Select the image for the brochure</h3>
              </div>

              <button type="button" onClick={() => setBrochurePickerOpen(false)} className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-700">Available images</p>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#0a1120] px-3 py-2 text-xs font-semibold text-white">
                    <Plus size={14} />
                    Add local image
                    <input type="file" accept="image/*" className="hidden" onChange={handleLocalBrochureUpload} />
                  </label>
                </div>

                {brochurePickerPhotos.length === 0 ? (
                  <p className="text-sm text-slate-500">No brochure image selected yet. Upload one to continue.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {brochurePickerPhotos.map((photo, index) => (
                      <div key={`${photo}-${index}`} className={`relative overflow-hidden rounded-2xl border transition ${selectedBrochurePhoto === photo ? 'border-[#c9a84c] ring-2 ring-[#f9e7a3]' : 'border-slate-200'}`}>
                        <button
                          type="button"
                          onClick={() => setSelectedBrochurePhoto(photo)}
                          className="block w-full text-left"
                        >
                          <img src={photo} alt={`Brochure selection ${index + 1}`} className="h-28 w-full object-cover" />
                          <div className="px-3 py-2 text-xs font-medium text-slate-600">Image {index + 1}</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setBrochurePickerPhotos((prev) => prev.filter((item) => item !== photo))}
                          className="absolute right-2 top-2 rounded-full bg-slate-900/80 p-1.5 text-white transition hover:bg-slate-900"
                          aria-label={`Remove brochure image ${index + 1}`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleRemoveSelectedBrochurePhoto}
                  disabled={!selectedBrochurePhoto}
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Remove selected photo
                </button>

                <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setBrochurePickerOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
                  Cancel
                </button>
                  <button
                    type="button"
                    disabled={brochurePickerPhotos.length === 0}
                    onClick={confirmBrochureGeneration}
                    className="rounded-xl bg-[#c9a84c] px-4 py-2.5 text-sm font-bold text-[#0a1120] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Generate brochure
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {ticketViewModalOpen && selectedPackageDetails && (
        <TicketViewModal
          template={selectedPackageDetails}
          onClose={() => {
            setTicketViewModalOpen(false);
            setSelectedPackageDetails(null);
          }}
        />
      )}

      {detailsModalOpen && selectedPackageDetails && (() => {
        const hotelDetails = parseJsonObject(selectedPackageDetails?.hotel_details || {}, createDefaultHotelDetails());
        const hotelWebsite = hotelDetails?.hotel_website || '';
        const hotelMapUrl = hotelDetails?.hotel_map_url || '';
        const isHotelPromotion = (selectedPackageDetails?.template_type || '').toLowerCase() === 'hotel_promotion';

        const featureHighlights = isHotelPromotion
          ? [
              selectedPackageDetails.service_ref ? { icon: '🧾', label: selectedPackageDetails.service_ref } : null,
              hotelDetails.start_date ? { icon: '📅', label: `${hotelDetails.start_date}${hotelDetails.end_date ? ` → ${hotelDetails.end_date}` : ''}` } : null,
              hotelDetails.discount_value ? { icon: '🏷', label: hotelDetails.discount_type === 'fixed' ? `${formatDZD(hotelDetails.discount_value)} off` : `${hotelDetails.discount_value}% off` } : null,
            ].filter(Boolean)
          : [
              selectedPackageDetails.service_ref ? { icon: '🧾', label: selectedPackageDetails.service_ref } : null,
              selectedPackageDetails.country ? { icon: '🌍', label: selectedPackageDetails.country } : null,
              selectedPackageDetails.destination ? { icon: '📍', label: selectedPackageDetails.destination } : null,
              selectedPackageDetails.departure_point ? { icon: '🚐', label: selectedPackageDetails.departure_point } : null,
              selectedPackageDetails.transport ? { icon: '✈', label: selectedPackageDetails.transport } : null,
              selectedPackageDetails.duration_nights ? { icon: '🌙', label: `${selectedPackageDetails.duration_nights} nights` } : null,
              selectedPackageDetails.visa_included ? { icon: '✓', label: 'Visa included' } : null,
              selectedPackageDetails.transfert ? { icon: '🚐', label: 'Transfer included' } : null,
              selectedPackageDetails.assurance ? { icon: '🛡', label: 'Insurance' } : null,
            ].filter(Boolean);

        const travelDates = resolveTravelDates(selectedPackageDetails);
        const hotels = parseJsonArray(selectedPackageDetails?.hotels || []);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-[#ead9a2] bg-[#fdfdfb] shadow-2xl">
              <div className="border-b border-[#efe4c5] bg-[#fffaf0] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c9a84c]">Trip details</p>
                    <h3 className="mt-2 font-serif text-3xl text-[#0a1120]">{selectedPackageDetails.label || 'Package Details'}</h3>
                  </div>

                  <button type="button" onClick={() => setDetailsModalOpen(false)} className="rounded-xl border border-slate-200 bg-white p-2 text-[#0a1120] transition hover:bg-slate-100">
                    <X size={18} />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {featureHighlights.map((feature, featureIndex) => (
                    <span key={`${feature.label}-${featureIndex}`} className="inline-flex items-center gap-2 rounded-full border border-[#e7d4a9] bg-[#fffdf7] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#0a1120]">
                      <span className="text-[#c9a84c]">{feature.icon}</span>
                      {feature.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-6 p-5">
                {isHotelPromotion && (
                  <div className="rounded-[22px] border border-[#ead9a2] bg-[linear-gradient(135deg,_#fffaf1_0%,_#fdf7e8_100%)] p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c9a84c]">Hotel promotion</p>
                        <h4 className="mt-2 text-2xl font-black text-[#0a1120]">{hotelDetails.hotel_name || selectedPackageDetails.label || 'Hotel'}</h4>
                        <p className="mt-1 text-sm text-slate-600">
                          {hotelDetails.province || selectedPackageDetails.destination || '—'}
                        </p>
                      </div>

                      <div className="rounded-full border border-[#ead9a2] bg-[#fffdf8] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#0a1120]">
                        {Number(hotelDetails.stars || 0) ? `${Number(hotelDetails.stars || 0)}★` : 'Hotel'}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-[#f1e8d0] bg-white/80 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Stay period</p>
                        <p className="mt-2 text-sm font-semibold text-[#0a1120]">{hotelDetails.start_date || '—'}{hotelDetails.end_date ? ` → ${hotelDetails.end_date}` : ''}</p>
                      </div>
                      <div className="rounded-2xl border border-[#f1e8d0] bg-white/80 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Child age</p>
                        <p className="mt-2 text-sm font-semibold text-[#0a1120]">{hotelDetails.free_child_age ?? '—'} years</p>
                      </div>
                      <div className="rounded-2xl border border-[#f1e8d0] bg-white/80 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Offer</p>
                        <p className="mt-2 text-sm font-semibold text-[#0a1120]">{hotelDetails.discount_value ? (hotelDetails.discount_type === 'fixed' ? `${formatDZD(hotelDetails.discount_value)} off` : `${hotelDetails.discount_value}% off`) : 'No discount'}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-[#f1e8d0] bg-white/80 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Price</p>
                      <div className="mt-2 flex flex-wrap items-end gap-3">
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Before</span>
                          <p className="text-lg font-black text-[#0a1120]">{formatDZD(Number(selectedPackageDetails.selling_price || 0))}</p>
                        </div>
                        <div className="h-6 w-px bg-slate-200" />
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">After</span>
                          <p className="text-lg font-black text-[#0a1120]">
                            {hotelDetails.discount_type === 'fixed'
                              ? formatDZD(Math.max((Number(selectedPackageDetails.selling_price || 0) || 0) - Number(hotelDetails.discount_value || 0), 0))
                              : formatDZD((Number(selectedPackageDetails.selling_price || 0) || 0) * (1 - (Number(hotelDetails.discount_value || 0) / 100)))}
                          </p>
                        </div>
                      </div>
                    </div>

                    {(hotelWebsite || hotelMapUrl) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {hotelWebsite && (
                          <a href={hotelWebsite} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full border border-[#c9a84c] bg-[#fffaf0] px-3 py-1.5 text-xs font-semibold text-[#0a1120]">
                            Website
                          </a>
                        )}
                        {hotelMapUrl && (
                          <a href={hotelMapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full border border-[#c9a84c] bg-[#fffaf0] px-3 py-1.5 text-xs font-semibold text-[#0a1120]">
                            Open in Maps
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!isHotelPromotion && (
                  <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 flex items-center gap-2 text-[#0a1120]">
                        <CalendarDays size={16} className="text-[#c9a84c]" />
                        <h4 className="text-lg font-semibold">Travel dates</h4>
                      </div>

                      <div className="space-y-3">
                        {travelDates.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">No departure dates available.</div>
                        ) : (
                          travelDates.map((travel, index) => {
                            const dateHotels = getTravelDateHotels(travel, hotels);
                            const templateType = (selectedPackageDetails?.template_type || 'trip').toLowerCase();
                            const isPilgrimagePackage = templateType === 'hajj' || templateType === 'omra';
                            const isStandardTrip = templateType === 'trip' || !templateType;
                            const isExpanded = expandedTravelDateIds.includes(travel.id);
                            const generalHotelForFallback = dateHotels.find((hotel) => hotel?.is_primary !== false) || dateHotels[0] || null;
                            const directTravelPriceEntries = [
                              travel?.prix_single ? `Single: ${travel.prix_single}` : null,
                              travel?.prix_double ? `Double: ${travel.prix_double}` : null,
                              travel?.prix_triple ? `Triple: ${travel.prix_triple}` : null,
                              ...(Array.isArray(travel?.custom_prices)
                                ? travel.custom_prices.map((price) => {
                                    const label = price?.name || price?.label || 'Custom';
                                    const value = price?.price ?? price?.value ?? price?.amount;
                                    return value ? `${label}: ${value}` : null;
                                  })
                                : []),
                            ].filter(Boolean);
                            const travelDatePriceEntries = directTravelPriceEntries.length
                              ? directTravelPriceEntries
                              : [
                                  generalHotelForFallback?.prix_single ? `Single: ${generalHotelForFallback.prix_single}` : null,
                                  generalHotelForFallback?.prix_double ? `Double: ${generalHotelForFallback.prix_double}` : null,
                                  generalHotelForFallback?.prix_triple ? `Triple: ${generalHotelForFallback.prix_triple}` : null,
                                  ...(Array.isArray(generalHotelForFallback?.custom_prices)
                                    ? generalHotelForFallback.custom_prices.map((price) => {
                                        const label = price?.name || price?.label || 'Custom';
                                        const value = price?.price ?? price?.value ?? price?.amount;
                                        return value ? `${label}: ${value}` : null;
                                      })
                                    : []),
                                ].filter(Boolean);

                            return (
                              <div key={`${travel.id || index}`} className="rounded-2xl border border-[#e7e5e4] bg-[#f8fafc] p-3">
                                <button
                                  type="button"
                                  onClick={() => toggleTravelDate(travel.id)}
                                  className="flex w-full items-center justify-between gap-3 text-left"
                                >
                                  <p className="text-sm font-semibold text-[#0a1120]">{travel.label || `Travel Date ${index + 1}`}</p>
                                  <span className="inline-flex items-center gap-2">
                                    <span className="rounded-full bg-[#fff7dd] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a1120]">Schedule</span>
                                    <span className="text-[11px] font-semibold text-[#0a1120]">{isExpanded ? 'Hide' : 'Show'}</span>
                                  </span>
                                </button>

                                {isExpanded && (
                                  <>
                                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                                      <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Departure</p>
                                        <p className="mt-1 text-sm font-medium text-[#0a1120]">{travel.departure_date || '—'}</p>
                                        <p className="text-xs text-slate-500">{travel.departure_time || 'No time'}</p>
                                      </div>
                                      <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Return</p>
                                        <p className="mt-1 text-sm font-medium text-[#0a1120]">{travel.return_date || '—'}</p>
                                        <p className="text-xs text-slate-500">{travel.return_time || 'No time'}</p>
                                      </div>
                                    </div>

                                    {isStandardTrip && travelDatePriceEntries.length > 0 && (
                                      <div className="mt-3 rounded-xl border border-slate-200 bg-[#fffaf0] p-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Travel Date Price</p>
                                        <div className="mt-2 text-sm font-semibold text-[#0a1120]">{travelDatePriceEntries.join(' • ')}</div>
                                      </div>
                                    )}

                                    <div className="mt-3 space-y-2">
                                      {dateHotels.length ? (
                                        dateHotels.map((hotel, hotelIndex) => {
                                          const hotelPriceEntries = [
                                            hotel?.prix_single ? `Single: ${hotel.prix_single}` : null,
                                            hotel?.prix_double ? `Double: ${hotel.prix_double}` : null,
                                            hotel?.prix_triple ? `Triple: ${hotel.prix_triple}` : null,
                                            hotel?.prix_quadruple ? `Quadruple: ${hotel.prix_quadruple}` : null,
                                            hotel?.prix_quintuple ? `Quintuple: ${hotel.prix_quintuple}` : null,
                                            ...(Array.isArray(hotel?.custom_prices)
                                              ? hotel.custom_prices.map((price) => {
                                                  const label = price?.name || price?.label || 'Custom';
                                                  const value = price?.price ?? price?.value ?? price?.amount;
                                                  return value ? `${label}: ${value}` : null;
                                                })
                                              : []),
                                          ].filter(Boolean);

                                          return (
                                            <div key={`${hotel?.hotel_name || 'hotel'}-${hotelIndex}`} className="rounded-xl border border-[#e7e5e4] bg-white p-2.5">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-semibold text-[#0a1120]">{hotel?.hotel_name || 'Hotel'}</span>
                                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${hotel?.is_primary === false ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                  {hotel?.is_primary === false ? 'Optional' : 'General'}
                                                </span>
                                              </div>

                                              {isPilgrimagePackage ? (
                                                <div className="mt-2 text-[11px] font-medium text-slate-700">
                                                  {hotelPriceEntries.length ? hotelPriceEntries.join(' • ') : 'No hotel pricing available'}
                                                </div>
                                              ) : hotel?.is_primary === false ? (
                                                <div className="mt-2 text-[11px] text-slate-600">{getHotelPriceSummary(hotel)}</div>
                                              ) : (
                                                <div className="mt-2 text-[11px] text-slate-600">
                                                  Included in travel date • {hotel?.nights || 0} Nights • {hotel?.meal_type || 'Meal plan not specified'}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })
                                      ) : null}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 flex items-center gap-2 text-[#0a1120]">
                        <Info size={16} className="text-[#c9a84c]" />
                        <h4 className="text-lg font-semibold">Package overview</h4>
                      </div>

                      <div className="space-y-3 text-sm text-[#0a1120]">
                        <div className="rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2"><span className="text-slate-500">Country:</span> {selectedPackageDetails.country || '—'}</div>
                        <div className="rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2"><span className="text-slate-500">Destination:</span> {selectedPackageDetails.destination || '—'}</div>
                        <div className="rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2"><span className="text-slate-500">Departure point:</span> {selectedPackageDetails.departure_point || '—'}</div>
                        <div className="rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2"><span className="text-slate-500">Transport:</span> {selectedPackageDetails.transport || '—'}</div>
                        <div className="rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2"><span className="text-slate-500">Duration:</span> {selectedPackageDetails.duration_nights || 0} nights</div>
                        <div className="rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2"><span className="text-slate-500">Selling price:</span> {selectedPackageDetails.selling_price ? formatDZD(selectedPackageDetails.selling_price) : '—'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {!isHotelPromotion && (
                  <>
                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="rounded-3xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center gap-2 text-[#0a1120]">
                          <Info size={16} className="text-[#c9a84c]" />
                          <h4 className="text-lg font-semibold">Inclusions</h4>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {resolveListValues(selectedPackageDetails?.inclusions).length ? (
                            resolveListValues(selectedPackageDetails?.inclusions).map((item, index) => (
                              <span key={`${item}-${index}`} className="rounded-full border border-[#dfe9ef] bg-[#f8fafc] px-2.5 py-1.5 text-xs font-medium text-[#0a1120]">{item}</span>
                            ))
                          ) : (
                            <span className="text-sm text-slate-500">No inclusions listed.</span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center gap-2 text-[#0a1120]">
                          <Info size={16} className="text-[#c9a84c]" />
                          <h4 className="text-lg font-semibold">Exclusions</h4>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {resolveListValues(selectedPackageDetails?.exclusions).length ? (
                            resolveListValues(selectedPackageDetails?.exclusions).map((item, index) => (
                              <span key={`${item}-${index}`} className="rounded-full border border-[#f1d9d9] bg-[#fff8f8] px-2.5 py-1.5 text-xs font-medium text-[#0a1120]">{item}</span>
                            ))
                          ) : (
                            <span className="text-sm text-slate-500">No exclusions listed.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="rounded-3xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center gap-2 text-[#0a1120]">
                          <Info size={16} className="text-[#c9a84c]" />
                          <h4 className="text-lg font-semibold">Cancellation policy</h4>
                        </div>
                        <p className="whitespace-pre-line text-sm text-[#0a1120]">{selectedPackageDetails.cancellation_policy || 'No cancellation policy provided.'}</p>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center gap-2 text-[#0a1120]">
                          <Info size={16} className="text-[#c9a84c]" />
                          <h4 className="text-lg font-semibold">Good to know</h4>
                        </div>
                        <p className="whitespace-pre-line text-sm text-[#0a1120]">{selectedPackageDetails.good_to_know || 'No additional guidance provided.'}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {statsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c9a84c]">Package Stats</p>
                <h3 className="mt-2 text-2xl font-serif text-[#0a1120]">{statsPackage?.label || 'Package'}</h3>
              </div>

              <button type="button" onClick={() => setStatsModalOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            {statsLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                Loading stats...
              </div>
            ) : statsData.timesSold === 0 ? (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">📊</div>
                <h4 className="text-xl font-serif text-[#0a1120]">No sales yet for this package</h4>
                <p className="mt-2 text-sm text-slate-500">No bookings have been linked to this package yet.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Times Sold</p>
                    <p className="mt-2 text-2xl font-bold text-[#0a1120]">{statsData.timesSold}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Total Revenue</p>
                    <p className="mt-2 text-xl font-bold text-[#0a1120]">{formatDZD(statsData.totalRevenue)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Total Cost</p>
                    <p className="mt-2 text-xl font-bold text-[#0a1120]">{formatDZD(statsData.totalCost)}</p>
                  </div>
                  <div className="rounded-2xl border border-[#c9a84c]/40 bg-[#fff7dd] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0a1120]">Total Profit</p>
                    <p className="mt-2 text-xl font-bold text-[#0a1120]">{formatDZD(statsData.totalProfit)}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Clients</p>
                  <div className="space-y-3">
                    {statsData.clients.map((client, index) => (
                      <div key={`${client.clientName}-${client.bookingReference}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-[#0a1120]">{client.clientName}</p>
                            <p className="text-xs text-slate-500">{client.bookingReference}</p>
                          </div>
                          <span className="text-sm font-semibold text-[#0a1120]">{formatDZD(client.sellingPrice)}</span>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          <span>{client.bookingDate ? new Date(client.bookingDate).toLocaleDateString('en-GB') : 'No date'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c9a84c]">
                  {(selectedType || draft.template_type || 'trip') === 'hajj'
                    ? 'Hajj Template'
                    : (selectedType || draft.template_type || 'trip') === 'omra'
                      ? 'Omra Template'
                      : (selectedType || draft.template_type || 'trip') === 'ticket_promotion'
                        ? 'Ticket Promotion Template'
                        : (selectedType || draft.template_type || 'trip') === 'hotel_promotion'
                          ? 'Hotel Promotion Template'
                          : 'Trip Template'}
                </p>
                <h3 className="mt-2 text-2xl font-serif text-[#0a1120]">
                  {(selectedType || draft.template_type || 'trip') === 'hajj'
                    ? (editingId ? 'Edit Hajj Package' : 'Create Hajj Package')
                    : (selectedType || draft.template_type || 'trip') === 'omra'
                      ? (editingId ? 'Edit Omra Package' : 'Create Omra Package')
                      : (selectedType || draft.template_type || 'trip') === 'ticket_promotion'
                        ? (editingId ? 'Edit Ticket Promotion' : 'Create Ticket Promotion')
                        : (selectedType || draft.template_type || 'trip') === 'hotel_promotion'
                          ? (editingId ? 'Edit Hotel Promotion' : 'Create Hotel Promotion')
                          : (editingId ? 'Edit Trip Package' : 'Create Trip Package')}
                </h3>
              </div>

              <button type="button" onClick={() => setIsFormOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            {!isTicketPromotionPackage && !isHotelPromotionPackage && (
              <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
                {['Basic', 'Travel', 'Hotels', 'Inclusions', 'Exclusions', 'Cancellation', 'Good to Know'].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setStep(index + 1)}
                    className={`rounded-lg px-3 py-2 ${step === index + 1 ? 'bg-[#0a1120] text-white' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {renderTripForm()}

            <div className="mt-6 flex items-center justify-between gap-3">
              {!isHotelPromotionPackage && (
                <button
                  type="button"
                  onClick={() => {
                    if (isTicketPromotionPackage) {
                      goToTicketTab(-1);
                      return;
                    }
                    setStep((prev) => Math.max(1, prev - 1));
                  }}
                  disabled={isTicketPromotionPackage ? ticketTabIndex <= 0 : step === 1}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#0a1120] disabled:opacity-40"
                >
                  <ChevronLeft size={16} /> Previous
                </button>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => setIsFormOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#0a1120]">Cancel</button>
                {isTicketPromotionPackage ? (
                  ticketTabIndex < ticketPromotionTabs.length - 1 ? (
                    <button type="button" onClick={() => goToTicketTab(1)} className="rounded-xl bg-[#c9a84c] px-4 py-2.5 text-sm font-bold text-[#0a1120]">Next</button>
                  ) : (
                    <button type="button" onClick={handleSave} className="rounded-xl bg-[#c9a84c] px-4 py-2.5 text-sm font-bold text-[#0a1120]">Save</button>
                  )
                ) : isHotelPromotionPackage ? (
                  <button type="button" onClick={handleSave} className="rounded-xl bg-[#c9a84c] px-4 py-2.5 text-sm font-bold text-[#0a1120]">Save</button>
                ) : step < 7 ? (
                  <button type="button" onClick={() => setStep((prev) => Math.min(7, prev + 1))} className="rounded-xl bg-[#c9a84c] px-4 py-2.5 text-sm font-bold text-[#0a1120]">Next</button>
                ) : (
                  <button type="button" onClick={handleSave} className="rounded-xl bg-[#c9a84c] px-4 py-2.5 text-sm font-bold text-[#0a1120]">Save</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[70] rounded-xl bg-[#0a1120] px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
