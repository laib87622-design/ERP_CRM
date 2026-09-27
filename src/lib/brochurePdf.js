import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, pdf, Font, Svg, Path } from '@react-pdf/renderer';
import { fetchAgencySettings } from './agencySettings';
import { supabase } from './supabase';

// ── Fonts: local files from /public/fonts ──
Font.register({
  family: 'Amiri',
  src: '/fonts/Amiri-Regular.ttf',
});
// Optional (recommended): download Amiri-Bold.ttf into the same folder and use:
// Font.register({
//   family: 'Amiri',
//   fonts: [
//     { src: '/fonts/Amiri-Regular.ttf', fontWeight: 400 },
//     { src: '/fonts/Amiri-Bold.ttf', fontWeight: 700 },
//   ],
// });

const e = React.createElement;

const formatDZD = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0 DZD';
  return new Intl.NumberFormat('fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(amount);
};

const PdfIcon = ({ children, size = 14, color = '#0a1120' }) =>
  e(
    Svg,
    { width: size, height: size, viewBox: '0 0 24 24', style: { overflow: 'visible' } },
    children
  );

const IconPlane = ({ size, color }) => e(PdfIcon, { size, color }, e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3.5c-.5-.5-2.5 0-4 1.5L13.5 8.5 5.3 6.7c-.8-.2-1.6.1-2 .7l-.9 1.3c-.4.6-.2 1.4.4 1.8l5.2 3.6-2.5 2.5-2.5-.5c-.4-.1-.8.1-1.1.4l-.5.5c-.3.3-.3.8 0 1.1l2.6 2.6c.3.3.8.3 1.1 0l.5-.5c.3-.3.5-.7.4-1.1l-.5-2.5 2.5-2.5 3.6 5.2c.4.6 1.2.8 1.8.4l1.3-.9c.6-.4.9-1.2.7-2z' }));
export const IconMapPin = ({ size, color }) => e(PdfIcon, { size, color }, e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z' }));
export const IconShield = ({ size, color }) => e(PdfIcon, { size, color }, e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }));
export const IconCard = ({ size, color }) => e(PdfIcon, { size, color }, e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M22 7v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2Z' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M2 10h20' }));
export const IconCar = ({ size, color }) => e(PdfIcon, { size, color }, e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M9 17a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M19 17a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z' }));
export const IconBriefcase = ({ size, color }) => e(PdfIcon, { size, color }, e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M22 7v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2Z' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M16 5V3a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2' }));
export const IconUser = ({ size, color }) => e(PdfIcon, { size, color }, e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z' }));
export const IconChild = ({ size, color }) => e(PdfIcon, { size, color }, e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M8 14s1.5 2 4 2 4-2 4-2' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M9 9h.01' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M15 9h.01' }));
export const IconMap = ({ size, color }) => e(PdfIcon, { size, color }, e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M9 3v15' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M15 6v15' }));
export const IconInfo = ({ size, color }) => e(PdfIcon, { size, color }, e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M12 16v-4' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M12 8h.01' }));
export const IconAlert = ({ size, color }) => e(PdfIcon, { size, color }, e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M12 9v4' }), e(Path, { fill: 'none', stroke: color || '#0a1120', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M12 17h.01' }));

const palette = {
  navy: '#0a1120',
  navySoft: '#12233d',
  gold: '#c9a84c',
  goldSoft: '#fff4d1',
  green: '#1e8e5a',
  greenSoft: '#eafaf1',
  red: '#b63b3b',
  redSoft: '#fdeaea',
  text: '#102033',
  muted: '#5b6b7d',
  border: '#e5e7eb',
  white: '#ffffff',
  gray: '#f5f7fa',
  grayAlt: '#edf2f7',
};

// ── Text helpers ──

const stripArabicText = (value = '') => String(value ?? '').replace(/[؀-ۿ]/g, '').replace(/\s{2,}/g, ' ').trim();

// DB sometimes returns {text: "..."} / {label: "..."} instead of a plain string
export const toText = (v) => {
  if (v === null || v === undefined) return '';

  if (typeof v === 'string') return v.trim();

  if (typeof v === 'number' || typeof v === 'boolean') return String(v);

  if (typeof v === 'object') {
    const candidate =
      v.text ??
      v.label ??
      v.name ??
      v.title ??
      v.value ??
      v.item ??
      v.exclusion ??
      v.description ??
      v.content ??
      '';

    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (candidate !== null && candidate !== undefined && typeof candidate !== 'object') return String(candidate).trim();

    try {
      const json = JSON.stringify(v);
      return json && json !== '{}' ? json : '';
    } catch {
      return '';
    }
  }

  return String(v).trim();
};

export const safeText = (value, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  const text = stripArabicText(toText(value)).trim();
  return text || fallback;
};

const frenchDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('fr-DZ', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const parsePhotoList = (rawPhotos) => {
  if (Array.isArray(rawPhotos)) return rawPhotos.filter(Boolean);
  if (typeof rawPhotos === 'string') {
    try {
      const parsed = JSON.parse(rawPhotos);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const getPhotoUrl = (photo) => {
  if (!photo) return '';
  if (typeof photo === 'string') return photo;
  if (typeof photo === 'object') {
    return photo.url || photo.src || photo.image || photo.link || '';
  }
  return '';
};

const normalizePhotoSelection = (photos, selectedPhoto) => {
  const resolved = parsePhotoList(photos ?? []);
  const selectedUrl = getPhotoUrl(selectedPhoto);
  if (!selectedUrl) return resolved;
  const withoutSelected = resolved.filter((photo) => getPhotoUrl(photo) !== selectedUrl);
  return [selectedPhoto, ...withoutSelected];
};

const getHotelLabel = (hotel) => {
  const name = safeText(hotel?.hotel_name || hotel?.name, 'Hotel');
  const nights = Number(hotel?.nights ?? hotel?.nuit ?? 0);
  const meal = safeText(hotel?.meal_type || hotel?.meals || 'Petit Déjeuner', 'Petit Déjeuner');
  return `${nights} Nuit : ${name} — ${meal}`;
};

const renderBilingualText = (value, textStyle = {}) => {
  const normalized = stripArabicText(value ?? '');
  return e(Text, { style: [{ ...textStyle, textAlign: 'left' }] }, normalized || '—');
};

const renderCompactPillRow = (items = []) =>
  e(
    View,
    { style: styles.compactPillRow },
    items.map((item, index) =>
      e(
        View,
        { key: `compact-pill-${index}`, style: styles.compactPill },
        e(Text, { style: styles.compactPillText }, stripArabicText(item.label || ''))
      )
    )
  );

const getFeatureHighlights = (template = {}) => {
  const items = [];
  const seen = new Set();

  const pushFeature = (label) => {
    const cleanLabel = safeText(label, '').trim();
    if (!cleanLabel) return;
    const key = cleanLabel.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ label: cleanLabel });
  };

  if (template?.visa_included) pushFeature('Visa included');
  if (template?.transfert) pushFeature('Transfer included');
  if (template?.assurance) pushFeature('Insurance included');
  if (template?.transport) pushFeature(`Transport: ${safeText(template.transport, 'Flight')}`);
  if (template?.departure_point) pushFeature(`Departure: ${safeText(template.departure_point, 'Departure point')}`);
  if (template?.destination) pushFeature(`Destination: ${safeText(template.destination, 'Destination')}`);
  if (template?.excursion) pushFeature(`Excursion: ${safeText(template.excursion, 'Excursion')}`);
  if (template?.include_itinerary || template?.plan_de_vol) pushFeature('Detailed itinerary');
  if (template?.duration_nights) pushFeature(`${safeText(template.duration_nights, '0')} nights`);
  if (template?.service_ref) pushFeature(`Service ref: ${safeText(template.service_ref, 'Service ref')}`);
  if (template?.country) pushFeature(`Country: ${safeText(template.country, 'Country')}`);

  const hotelMeals = uniqueTextValues(
    (Array.isArray(template?.hotels) ? template.hotels : [])
      .map((hotel) => hotel?.meal_type)
      .filter(Boolean)
  );
  hotelMeals.slice(0, 3).forEach((meal) => pushFeature(`Meal: ${meal}`));

  const optionalCount = (Array.isArray(template?.hotels) ? template.hotels : []).filter((hotel) => hotel?.is_primary === false).length;
  if (optionalCount > 0) pushFeature(`${optionalCount} optional hotel choice${optionalCount > 1 ? 's' : ''}`);

  return items.slice(0, 8);
};

export const parseItineraryLines = (planDeVol) => {
  if (!planDeVol || !String(planDeVol).trim()) return [];
  return String(planDeVol)
    .split(/\r?\n|<br\s*\/?>/i)
    .map((line) => stripArabicText(line.trim()))
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^(jour|day)\s*[:\-]?\s*(\d+)?\s*[:\-]?\s*(.*)$/i);
      if (match) {
        const dayNumber = match[2] ? Number(match[2]) : index + 1;
        return {
          label: `Day ${dayNumber}`,
          description: (match[3] || line).trim(),
        };
      }
      return { label: `Day ${index + 1}`, description: line };
    });
};

const placeholderPhotoSet = [
  { color: '#dfeaf7', label: 'Destination' },
  { color: '#fcebc9', label: 'Hotel' },
  { color: '#d9f2e4', label: 'Beach' },
  { color: '#f3dfe7', label: 'City' },
  { color: '#e6e0ff', label: 'Views' },
  { color: '#dff6fb', label: 'Travel' },
  { color: '#f9e7d5', label: 'Experience' },
];

export const uniqueTextValues = (items = []) => {
  const seen = new Set();
  return items
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        return item.text ?? item.label ?? item.name ?? item.title ?? item.value ?? item.description ?? '';
      }
      return '';
    })
    .map((value) => toText(value))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const getHotelOptionalPrice = (hotel) => {
  if (!hotel || hotel.is_primary !== false) return '';
  const values = [hotel?.prix_single, hotel?.prix_double, hotel?.prix_triple].filter(Boolean);
  if (!values.length) return 'Price on request';
  return values.join(' • ');
};

export const getTravelDatesForTemplate = (template) => {
  const rawDates = Array.isArray(template?.travel_dates)
    ? template.travel_dates
    : Array.isArray(template?.travel_schedule)
      ? template.travel_schedule
      : [];

  return rawDates.filter((travel) => {
    if (!travel || typeof travel !== 'object') return false;
    return Boolean(travel.departure_date || travel.return_date || travel.departure_time || travel.return_time || travel.label);
  });
};

export const formatTravelDateTimeRange = (travel) => {
  const departure = [travel?.departure_date, travel?.departure_time].filter(Boolean).join(' ');
  const returnDate = [travel?.return_date, travel?.return_time].filter(Boolean).join(' ');
  return {
    departure: departure || 'Dates to be confirmed',
    returnDate: returnDate || 'Dates to be confirmed',
  };
};

const getHotelPriceLines = (hotel = {}) => {
  const lines = [
    hotel?.prix_single ? `Single: ${toText(hotel.prix_single)}` : null,
    hotel?.prix_double ? `Double: ${toText(hotel.prix_double)}` : null,
    hotel?.prix_triple ? `Triple: ${toText(hotel.prix_triple)}` : null,
    ...(Array.isArray(hotel?.custom_prices)
      ? hotel.custom_prices.map((p) => {
          const name = toText(p?.name || p?.label || p?.title || 'Custom');
          const value = p?.price ?? p?.amount ?? p?.value;
          return value !== null && value !== undefined && value !== '' ? `${name}: ${toText(value)}` : null;
        }).filter(Boolean)
      : []),
  ].filter(Boolean);

  return lines.length ? uniqueTextValues(lines) : ['Price on request'];
};

const getTravelDatePriceLines = (travel = {}, dateScopeHotels = []) => {
  const globalHotel = dateScopeHotels.find((hotel) => hotel?.is_primary !== false) || dateScopeHotels[0] || null;

  const directEntries = [
    travel?.prix_single ? `Single: ${toText(travel.prix_single)}` : null,
    travel?.prix_double ? `Double: ${toText(travel.prix_double)}` : null,
    travel?.prix_triple ? `Triple: ${toText(travel.prix_triple)}` : null,
    ...(Array.isArray(travel?.custom_prices)
      ? travel.custom_prices.map((p) => {
          const name = toText(p?.name || p?.label || p?.title || 'Custom');
          const value = p?.price ?? p?.amount ?? p?.value;
          return value !== null && value !== undefined && value !== '' ? `${name}: ${toText(value)}` : null;
        }).filter(Boolean)
      : []),
    ...(globalHotel ? getHotelPriceLines(globalHotel) : []),
  ].filter(Boolean);

  return directEntries.length ? uniqueTextValues(directEntries) : ['Price on request'];
};

const getDatePriceLines = (travel, hotels = []) => {
  const dateHotels = (hotels || []).filter((hotel) => {
    if (hotel?.travel_date_id) return hotel.travel_date_id === travel.id;
    if (hotel?.travel_date_label) {
      return hotel.travel_date_label === travel.label || hotel.travel_date_label === `Travel Date ${Number(travel?.label?.match(/\d+/)?.[0] || 1)}`;
    }
    return true;
  });

  const primaryHotel = dateHotels.find((hotel) => hotel?.is_primary !== false) || dateHotels[0] || null;

  const lines = [
    primaryHotel?.prix_single ? `Single: ${primaryHotel.prix_single}` : null,
    primaryHotel?.prix_double ? `Double: ${primaryHotel.prix_double}` : null,
    primaryHotel?.prix_triple ? `Triple: ${primaryHotel.prix_triple}` : null,
    ...(Array.isArray(primaryHotel?.custom_prices)
      ? primaryHotel.custom_prices
          .map((p) => {
            const name = toText(p?.name || p?.label || p?.title || 'Custom');
            const value = p?.price ?? p?.amount ?? p?.value;
            return value !== null && value !== undefined && value !== '' ? `${name}: ${toText(value)}` : null;
          })
          .filter(Boolean)
      : []),
  ].filter(Boolean);

  return lines.length ? lines : ['Price on request'];
};

// ── Styles ──

const styles = StyleSheet.create({
  page: { padding: 18, backgroundColor: palette.white, fontFamily: 'Helvetica' },
  pageFrame: { flex: 1, paddingBottom: 24 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  logoWrap: { width: 52, height: 52, borderRadius: 16, overflow: 'hidden', backgroundColor: '#f4f8ff', borderWidth: 1, borderColor: palette.border },
  logoImage: { width: 52, height: 52, objectFit: 'contain' },
  agencyName: { fontSize: 13, color: palette.navy, fontFamily: 'Helvetica', textAlign: 'left' },
  coverTitle: { fontSize: 29, color: palette.navy, fontFamily: 'Helvetica', lineHeight: 1.12, letterSpacing: 0.3 },
  coverArabic: { fontSize: 14, color: palette.muted, fontFamily: 'Helvetica', marginBottom: 8, lineHeight: 1.2 },
  photoGrid: { marginBottom: 10 },
  photoRowLarge: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  photoBoxLarge: { flex: 1, height: 120, borderRadius: 18, overflow: 'hidden', backgroundColor: palette.grayAlt, borderWidth: 1, borderColor: palette.border },
  photoBoxSmall: { width: '18.5%', height: 64, borderRadius: 14, overflow: 'hidden', backgroundColor: palette.grayAlt, borderWidth: 1, borderColor: palette.border },
  imageFill: { width: '100%', height: '100%', objectFit: 'cover' },
  summaryCard: { borderWidth: 1, borderColor: palette.border, borderRadius: 18, backgroundColor: palette.gray, padding: 12 },
  detailsGrid: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailItem: { width: '48%', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.border },
  detailLabel: { fontSize: 9, color: palette.muted, fontFamily: 'Helvetica', letterSpacing: 0.8 },
  detailText: { fontSize: 11, color: palette.text, fontFamily: 'Helvetica', marginTop: 3, textAlign: 'left', lineHeight: 1.3 },
  dateTable: { marginTop: 8, borderWidth: 1, borderColor: palette.border, borderRadius: 8, overflow: 'hidden' },
  dateRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: palette.border },
  dateHeader: { flex: 1, backgroundColor: palette.navy, color: palette.white, fontSize: 9, fontFamily: 'Helvetica', textAlign: 'center', paddingVertical: 7 },
  dateCell: { flex: 1, backgroundColor: palette.white, color: palette.text, fontSize: 9, fontFamily: 'Helvetica', textAlign: 'center', paddingVertical: 7 },
  badge: { marginTop: 10, alignSelf: 'flex-start', backgroundColor: palette.goldSoft, borderWidth: 1, borderColor: palette.gold, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { fontSize: 9, color: palette.navy, fontFamily: 'Helvetica', letterSpacing: 1.2 },
  sectionHeader: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionHeaderGreen: { backgroundColor: palette.green },
  sectionHeaderRed: { backgroundColor: palette.red },
  sectionHeaderNavy: { backgroundColor: palette.navySoft },
  sectionHeaderGold: { backgroundColor: palette.goldSoft, borderWidth: 1, borderColor: palette.gold },
  sectionIconWrap: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  sectionIconText: { fontSize: 11, color: palette.white, fontFamily: 'Helvetica' },
  sectionHeaderText: { fontSize: 12.5, color: palette.white, fontFamily: 'Helvetica' },
  listBlock: { marginTop: 4, borderWidth: 1, borderColor: palette.border, borderRadius: 14, backgroundColor: palette.white, padding: 8 },
  inclusionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: palette.border },
  checkIconWrap: { width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.greenSoft },
  checkIconText: { fontSize: 9, color: palette.green, fontFamily: 'Helvetica' },
  crossIconWrap: { width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.redSoft },
  crossIconText: { fontSize: 9, color: palette.red, fontFamily: 'Helvetica' },
  featureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 },
  featurePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#e8dfc2', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#fffdf7', maxWidth: 170 },
  featureIcon: { fontSize: 8, color: palette.navy, fontFamily: 'Helvetica' },
  featureText: { fontSize: 7.8, color: palette.text, fontFamily: 'Helvetica', letterSpacing: 0.2 },
  compactPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  compactPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#e7d4a9', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#fffaf0' },
  compactPillText: { fontSize: 7.5, color: palette.navy, fontFamily: 'Helvetica', fontWeight: 'bold', letterSpacing: 0.3 },
  listText: { fontSize: 10, color: palette.text, fontFamily: 'Helvetica', flex: 1, lineHeight: 1.25, textAlign: 'left' },
  priceBlock: { width: '48.2%', borderWidth: 1, borderColor: '#f0d47a', borderRadius: 8, backgroundColor: '#fffaf0', padding: 6, marginBottom: 6 },
  priceLabel: { fontSize: 6.8, color: palette.muted, fontFamily: 'Helvetica', letterSpacing: 0.7, textTransform: 'uppercase' },
  priceValue: { fontSize: 11.5, color: palette.navy, fontFamily: 'Helvetica', fontWeight: 'bold', marginTop: 2 },
  hotelCardRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  hotelCard: { width: '48.4%', borderWidth: 1, borderColor: '#dfe7ee', borderRadius: 9, backgroundColor: '#ffffff', padding: 7, minHeight: 68 },
  hotelCardOptional: { borderColor: '#efc96a', backgroundColor: '#fffaf0' },
  hotelCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  hotelCardTag: { fontSize: 6.6, color: palette.navy, fontFamily: 'Helvetica', letterSpacing: 0.8, backgroundColor: '#eafaf1', borderRadius: 999, paddingHorizontal: 5, paddingVertical: 2 },
  hotelCardTagOptional: { backgroundColor: '#fff1c6', color: palette.navy },
  hotelCardName: { fontSize: 9.5, color: palette.navy, fontFamily: 'Helvetica', fontWeight: 'bold', marginBottom: 2 },
  hotelMetaText: { fontSize: 7.8, color: palette.text, fontFamily: 'Helvetica', lineHeight: 1.25 },
  itineraryRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: '#f9fafb' },
  itineraryRowAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: '#ffffff' },
  itineraryDay: { width: 100, padding: 8 },
  itineraryDayText: { fontSize: 9.5, color: palette.navy, fontFamily: 'Helvetica' },
  itineraryContent: { flex: 1, padding: 8, fontSize: 9.5, color: palette.text, fontFamily: 'Helvetica', textAlign: 'left' },
  emptyState: { marginTop: 8, borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: palette.gray, padding: 12 },
  emptyStateText: { fontSize: 10.5, color: palette.muted, fontFamily: 'Helvetica', textAlign: 'center' },
  footer: { position: 'absolute', left: 14, right: 14, bottom: 8, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  footerText: { fontSize: 7.2, color: palette.muted, fontFamily: 'Helvetica' },
  footerStrong: { fontFamily: 'Helvetica', color: palette.navy },
  footerAddress: { flex: 1, textAlign: 'center' },
});

// ── Components ──

function Footer({ agency }) {
  const agencyName = safeText(agency?.agency_name, 'AIRVOY');
  const phone = safeText(agency?.phone, '—');
  const email = safeText(agency?.email, '—');
  const address = [agency?.address, agency?.city, agency?.wilaya].filter(Boolean).join(', ') || 'Algeria';
  const rc = safeText(agency?.rc_number, '—');

  return e(
    View,
    { style: styles.footer, fixed: true },
    e(Text, { style: styles.footerText }, e(Text, { style: styles.footerStrong }, agencyName), ' • ', phone),
    e(Text, { style: [styles.footerText, styles.footerAddress] }, `${email} • ${address}`),
    e(Text, { style: styles.footerText }, `RC: ${rc}`)
  );
}

function SectionHeader({ icon: Icon, titleFr, tone = 'navy' }) {
  const toneStyle =
    tone === 'green' ? styles.sectionHeaderGreen :
    tone === 'red' ? styles.sectionHeaderRed :
    tone === 'gold' ? styles.sectionHeaderGold : styles.sectionHeaderNavy;
  const textColor = tone === 'gold' ? palette.navy : palette.white;
  return e(
    View,
    { style: [styles.sectionHeader, toneStyle], minPresenceAhead: 40 },
    Icon
      ? e(View, { style: styles.sectionIconWrap }, e(Icon, { size: 12, color: textColor }))
      : null,
    e(Text, { style: [styles.sectionHeaderText, { color: textColor }] }, stripArabicText(titleFr))
  );
}

function PhotoGrid({ photos, title, selectedPhoto = null }) {
  const resolvedPhotos = normalizePhotoSelection(photos, selectedPhoto);
  const filledSlots = [
    ...resolvedPhotos.slice(0, 2).map((photo) => ({ url: getPhotoUrl(photo), label: title })),
    ...Array.from({ length: 5 }).map((_, index) => ({
      url: getPhotoUrl(resolvedPhotos[index + 2]) || '',
      color: placeholderPhotoSet[index % placeholderPhotoSet.length]?.color,
      label: placeholderPhotoSet[index % placeholderPhotoSet.length]?.label || 'Photo',
    })),
  ];

  const renderSlot = (photo, index, isLarge) => {
    const uri = photo?.url;
    const fallback = placeholderPhotoSet[index % placeholderPhotoSet.length];
    return e(
      View,
      { key: `slot-${index}`, style: isLarge ? styles.photoBoxLarge : styles.photoBoxSmall },
      uri
        ? e(Image, { src: uri, style: styles.imageFill })
        : e(
            View,
            { style: { flex: 1, backgroundColor: fallback?.color || '#dfeaf7', justifyContent: 'flex-end', padding: 6 } },
            e(Text, { style: { fontSize: 8, color: palette.white, fontFamily: 'Amiri', letterSpacing: 1 } }, fallback?.label || 'Photo')
          )
    );
  };

  return e(
    View,
    { style: styles.photoGrid },
    e(View, { style: styles.photoRowLarge },
      Array.from({ length: 2 }).map((_, i) => renderSlot(filledSlots[i], i, true))),
    e(View, { style: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 } },
      Array.from({ length: 5 }).map((_, i) => renderSlot(filledSlots[i + 2], i, false)))
  );
}

// ── Main document ──

function TripBrochureDocument({ template, agency, selectedPhoto = null }) {
  const type = safeText(template?.type || 'national', 'NATIONAL').toUpperCase();
  const country = safeText(template?.country, '—');
  const destination = safeText(template?.destination, '—');
  const departurePoint = safeText(template?.departure_point, '—');
  const logoUrl = safeText(agency?.logo_url, '').trim();
  const hotels = Array.isArray(template?.hotels) ? template.hotels : [];
  const travelDates = getTravelDatesForTemplate(template);

  const normalizedHotelData = hotels.map((hotel, index) => {
    const customPrices = Array.isArray(hotel?.custom_prices)
      ? hotel.custom_prices
      : typeof hotel?.custom_prices === 'string'
        ? (() => {
            try { const p = JSON.parse(hotel.custom_prices); return Array.isArray(p) ? p : []; } catch { return []; }
          })()
        : [];

    const assignmentText = hotel?.assigned_nights_dates || hotel?.nights ? `Assigned: ${hotel?.assigned_nights_dates || hotel?.nights || 'Nights to be confirmed'}` : null;

    const hotelLines = [
      hotel?.nights ? `Nights: ${hotel.nights}` : null,
      hotel?.meal_type ? `Meal: ${hotel.meal_type}` : null,
      assignmentText,
      hotel?.is_primary === false ? `Optional hotel-only price: ${getHotelOptionalPrice(hotel)}` : null,
      ...customPrices.map((p) => {
        if (!p) return null;
        const name = toText(p.name || p.label || p.title || 'Custom');
        const value = p.price ?? p.amount ?? p.value;
        return value !== null && value !== undefined && value !== '' ? `${name}: ${toText(value)}` : null;
      }),
    ].filter(Boolean);

    return {
      hotelName: safeText(hotel?.hotel_name, `Hotel ${index + 1}`),
      lines: hotelLines,
      isOptional: hotel?.is_primary === false,
      nights: hotel?.nights || '—',
      mealType: hotel?.meal_type || 'Petit Déjeuner',
      assignedDates: hotel?.assigned_nights_dates || hotel?.nights ? hotel.assigned_nights_dates || `Nights: ${hotel.nights}` : '',
      optionalPrice: getHotelOptionalPrice(hotel),
    };
  });

  const travelDateColors = [
    { main: '#0a1120', soft: '#eef4ff', pill: '#dfeafc' },
    { main: '#157f6d', soft: '#ebfffb', pill: '#d9f7ef' },
    { main: '#6d4ec2', soft: '#f3eeff', pill: '#e6dcff' },
    { main: '#b45a27', soft: '#fff2e8', pill: '#fce2cd' },
    { main: '#0f5f9a', soft: '#edf7ff', pill: '#d9ebff' },
  ];

  const travelDateBlocks = travelDates.length
    ? travelDates.map((travel, dateIndex) => {
        const travelLabel = safeText(travel?.label, `Travel Date ${dateIndex + 1}`);
        const accent = travelDateColors[dateIndex % travelDateColors.length];
        const dateScopeHotels = (Array.isArray(template?.hotels) ? template.hotels : []).filter((hotel) => {
          if (hotel?.travel_date_id) return hotel.travel_date_id === travel.id;
          if (hotel?.travel_date_label) return hotel.travel_date_label === travelLabel || hotel.travel_date_label === `Travel Date ${dateIndex + 1}`;
          if (Array.isArray(template?.hotels) && template.hotels.length > 1) {
            return template.hotels.indexOf(hotel) === dateIndex;
          }
          return true;
        });

        return {
          label: travelLabel,
          accent,
          departure: formatTravelDateTimeRange(travel).departure,
          returnDate: formatTravelDateTimeRange(travel).returnDate,
          priceLines: getTravelDatePriceLines(travel, dateScopeHotels),
          hotels: dateScopeHotels.map((hotel, hotelIndex) => ({
            name: safeText(hotel?.hotel_name, `Hotel ${hotelIndex + 1}`),
            nights: hotel?.nights || '—',
            mealType: hotel?.meal_type || 'Petit Déjeuner',
            isOptional: hotel?.is_primary === false,
            replacementFor: hotel?.replacement_for_hotel_id
              ? safeText(dateScopeHotels.find((candidate) => candidate.id === hotel.replacement_for_hotel_id)?.hotel_name || 'Primary hotel', 'Primary hotel')
              : null,
            priceLines: getHotelPriceLines(hotel),
          })),
        };
      })
    : [];

  const includedItems = uniqueTextValues([
    ...(template?.transport ? [toText(template.transport)] : []),
    ...(template?.transfert ? ['Transfers included'] : []),
    ...(template?.excursion ? [`Excursion: ${toText(template.excursion)}`] : []),
    ...(template?.assurance ? ['Insurance included'] : []),
    ...(template?.visa_included ? ['Visa included'] : []),
    ...(Array.isArray(template?.inclusions)
      ? template.inclusions.map((item) => toText(item)).filter(Boolean)
      : []),
  ]);

  const excluded = uniqueTextValues([
    !template?.transfert ? 'Transfers not included' : null,
    !template?.assurance ? 'Insurance not included' : null,
    !template?.visa_included ? 'Visa not included' : null,
    ...(Array.isArray(template?.exclusions)
      ? template.exclusions.map((item) => toText(item)).filter(Boolean)
      : []),
  ]);

  const itineraryLines = parseItineraryLines(template?.plan_de_vol);
  const titleText = safeText(template?.label, 'Trip Package');
  const agencyName = safeText(agency?.agency_name, 'AIRVOY');
  const cancellationPolicy = safeText(template?.cancellation_policy, '');
  const goodToKnow = safeText(template?.good_to_know, '');

  const renderList = (items, iconComponent = null) =>
    e(
      View,
      { style: styles.listBlock },
      items.length
        ? items.map((item, index) =>
            e(
              View,
              {
                key: `row-${index}`,
                style: [styles.inclusionRow, index === items.length - 1 && { borderBottomWidth: 0 }],
              },
              iconComponent
                ? e(View, { style: styles.checkIconWrap }, e(iconComponent, { size: 12, color: palette.green }))
                : null,
              renderBilingualText(toText(typeof item === 'string' ? item : item.text), styles.listText)
            )
          )
        : e(View, { style: styles.emptyState }, e(Text, { style: styles.emptyStateText }, '—'))
    );

  return e(
    Document,
    null,
    // PAGE 1 — cover
    e(
      Page,
      { size: 'A4', style: styles.page },
      e(
        View,
        { style: styles.pageFrame },
        e(
          View,
          { style: styles.topBar },
          e(View, { style: styles.logoWrap }, logoUrl ? e(Image, { src: logoUrl, style: styles.logoImage }) : null),
          e(Text, { style: styles.agencyName }, agencyName)
        ),
        e(Text, { style: styles.coverTitle }, titleText),
        e(PhotoGrid, { photos: template?.photos ?? [], title: titleText, selectedPhoto }),
        e(
          View,
          { style: styles.summaryCard },
          e(Text, { style: { fontSize: 12, fontFamily: 'Helvetica', color: palette.navy, marginBottom: 6 } }, 'Trip summary'),
          e(
            View,
            { style: styles.detailsGrid },
            e(View, { style: styles.detailItem },
              e(Text, { style: styles.detailLabel }, 'Destination'),
              e(Text, { style: styles.detailText }, `${country} • ${destination}`)),
            e(View, { style: styles.detailItem },
              e(Text, { style: styles.detailLabel }, 'Departure point'),
              e(Text, { style: styles.detailText }, departurePoint)),
            e(View, { style: styles.detailItem },
              e(Text, { style: styles.detailLabel }, 'Type'),
              e(Text, { style: styles.detailText }, type))
          ),
          e(
            View,
            { style: styles.dateTable },
            e(View, { style: styles.dateRow },
              e(Text, { style: styles.dateHeader }, 'Departure'),
              e(Text, { style: styles.dateHeader }, 'Return')),
            ...(travelDates.length
              ? travelDates.map((travel, index) => {
                  const { departure, returnDate: returnValue } = formatTravelDateTimeRange(travel);
                  return e(
                    View,
                    { key: `cover-date-${index}`, style: [styles.dateRow, index === travelDates.length - 1 && { borderBottomWidth: 0 }] },
                    e(Text, { style: styles.dateCell }, departure),
                    e(Text, { style: styles.dateCell }, returnValue)
                  );
                })
              : [e(View, { key: 'cover-date-empty', style: [styles.dateRow, { borderBottomWidth: 0 }] },
                  e(Text, { style: styles.dateCell }, 'Dates to be confirmed'),
                  e(Text, { style: styles.dateCell }, 'Dates to be confirmed'))]
            )
          ),
          e(View, { style: styles.badge }, e(Text, { style: styles.badgeText }, type))
        )
      ),
      e(Footer, { agency })
    ),
    // PAGE 2 — inclusions / exclusions / hotels
    e(
      Page,
      { size: 'A4', style: styles.page },
      e(
        View,
        { style: styles.pageFrame },
        renderCompactPillRow([
          { label: 'Included' },
          { label: 'Excluded' },
          { label: 'Departures' },
          { label: 'Hotels' },
        ]),
        e(SectionHeader, { icon: IconShield, titleFr: 'Included services', tone: 'green' }),
        renderList(includedItems, IconShield),
        e(View, { style: { marginTop: 8 } },
          e(SectionHeader, { icon: IconAlert, titleFr: 'Excluded services', tone: 'red' })),
        renderList(excluded, IconAlert),
        e(View, { style: { marginTop: 8 } },
          e(SectionHeader, { icon: IconMapPin, titleFr: 'Departures, prices & hotels', tone: 'gold' })),
        e(
          View,
          { style: styles.listBlock },
          travelDateBlocks.length
            ? travelDateBlocks.map((travel, index) => {
                const featureHighlights = getFeatureHighlights(template);
                const datePills = [
                  { label: safeText(travel.departure, 'Departure') },
                  { label: safeText(travel.returnDate, 'Return') },
                  { label: `${travel.hotels.length} hotel${travel.hotels.length > 1 ? 's' : ''}` },
                  ...(travel.hotels.some((hotel) => hotel.isOptional) ? [{ label: 'Optional' }] : []),
                ];

                return e(
                  View,
                  {
                    key: `travel-block-${index}`,
                    style: {
                      borderBottomWidth: index < travelDateBlocks.length - 1 ? 1 : 0,
                      borderBottomColor: palette.border,
                      paddingVertical: 6,
                    },
                  },
                  e(
                    View,
                    {
                      style: {
                        borderWidth: 1,
                        borderColor: travel.accent.main,
                        borderRadius: 10,
                        backgroundColor: travel.accent.soft,
                        padding: 8,
                        marginBottom: 6,
                      },
                      wrap: false,
                    },
                    e(
                      View,
                      { style: { backgroundColor: travel.accent.main, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, marginBottom: 6, alignSelf: 'flex-start' } },
                      e(Text, { style: { fontSize: 9.5, color: palette.white, fontFamily: 'Helvetica', fontWeight: 'bold' } }, `${travel.label}`)
                    ),
                    renderCompactPillRow(datePills),
                    e(Text, { style: { fontSize: 9.5, color: travel.accent.main, fontFamily: 'Helvetica', lineHeight: 1.4, fontWeight: 'bold' } }, `Departure: ${travel.departure}  •  Return: ${travel.returnDate}`)
                  ),
                  featureHighlights.length ? e(
                    View,
                    { style: styles.featureRow },
                    featureHighlights.map((feature, featureIndex) =>
                      e(
                        View,
                        { key: `feature-${index}-${featureIndex}`, style: styles.featurePill },
                        e(Text, { style: styles.featureText }, feature.label)
                      )
                    )
                  ) : null,
                  e(Text, { style: { fontSize: 9.5, color: palette.navy, fontFamily: 'Helvetica', marginBottom: 4, fontWeight: 'bold' } }, 'Global prices'),
                  e(
                    View,
                    { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 }, wrap: false },
                    travel.priceLines.map((line, lineIndex) =>
                      e(
                        View,
                        { key: `price-${index}-${lineIndex}`, style: [styles.priceBlock, { marginBottom: lineIndex === travel.priceLines.length - 1 ? 0 : 4 }], wrap: false },
                        e(Text, { style: styles.priceLabel }, 'From'),
                        e(Text, { style: styles.priceValue }, line)
                      )
                    )
                  ),
                  e(Text, { style: { fontSize: 9.5, color: palette.navy, fontFamily: 'Helvetica', marginTop: 6, marginBottom: 4, fontWeight: 'bold' } }, 'Hotels for this date'),
                  travel.hotels.length
                    ? e(
                        View,
                        { style: [styles.hotelCardRow, { gap: 4 }], wrap: false },
                        travel.hotels.map((hotel, hotelIndex) =>
                          e(
                            View,
                            {
                              key: `travel-hotel-${index}-${hotelIndex}`,
                              style: [styles.hotelCard, hotel.isOptional && styles.hotelCardOptional],
                              wrap: false,
                            },
                            e(
                              View,
                              { style: styles.hotelCardHeader },
                              e(Text, { style: [styles.hotelCardTag, hotel.isOptional && styles.hotelCardTagOptional] }, hotel.isOptional ? 'OPTIONAL' : 'STANDARD'),
                              e(Text, { style: { fontSize: 9, color: palette.gold, fontFamily: 'Helvetica' } }, `Nights: ${hotel.nights}`)
                            ),
                            e(Text, { style: styles.hotelCardName }, hotel.name),
                            e(Text, { style: styles.hotelMetaText }, `Meal: ${hotel.mealType}`),
                            e(Text, { style: [styles.hotelMetaText, { marginTop: 2 }] }, hotel.isOptional && hotel.replacementFor ? `Replacement for: ${hotel.replacementFor}` : 'Included for this travel date'),
                            hotel.isOptional && Array.isArray(hotel.priceLines) && hotel.priceLines.length
                              ? e(
                                  View,
                                  { style: { marginTop: 6, gap: 2 } },
                                  hotel.priceLines.map((priceLine, priceIndex) =>
                                    e(
                                      Text,
                                      { key: `hotel-price-${index}-${hotelIndex}-${priceIndex}`, style: [styles.hotelMetaText, { color: palette.navy, fontWeight: 'bold' }] },
                                      priceLine
                                    )
                                  )
                                )
                              : null,
                            hotel.isOptional && hotel.optionalPrice
                              ? e(Text, { style: [styles.hotelMetaText, { marginTop: 2, color: palette.navy, fontWeight: 'bold' }] }, `Optional price: ${hotel.optionalPrice}`)
                              : null
                          )
                        )
                      )
                    : e(Text, { style: { fontSize: 9.5, color: palette.muted, fontFamily: 'Helvetica', marginTop: 2 } }, 'No hotel assigned to this date.')
                );
              })
            : e(View, { style: styles.emptyState }, e(Text, { style: styles.emptyStateText }, 'No departure dates available.'))
        )
      ),
      e(Footer, { agency })
    ),
    // PAGE 3 — itinerary + policies
    e(
      Page,
      { size: 'A4', style: styles.page },
      e(
        View,
        { style: styles.pageFrame },
        renderCompactPillRow([
          { label: 'Itinerary' },
          { label: 'Cancellation' },
          { label: 'Good to know' },
        ]),
        e(SectionHeader, { icon: IconMap, titleFr: 'Itinerary', tone: 'navy' }),
        itineraryLines.length
          ? e(
              View,
              { style: { borderWidth: 1, borderColor: palette.border, borderRadius: 12, overflow: 'hidden', marginTop: 8 } },
              itineraryLines.map((line, index) => e(
                View,
                {
                  key: `day-${index}`,
                  style: [
                    index % 2 === 0 ? styles.itineraryRow : styles.itineraryRowAlt,
                    index === itineraryLines.length - 1 && { borderBottomWidth: 0 },
                  ],
                },
                e(
                  View,
                  { style: styles.itineraryDay },
                  e(Text, { style: styles.itineraryDayText }, stripArabicText(line.label))
                ),
                e(Text, { style: styles.itineraryContent }, stripArabicText(line.description))
              ))
            )
          : e(
              View,
              { style: styles.emptyState },
              e(Text, { style: styles.emptyStateText }, 'Programme détaillé disponible sur demande')
            ),
        e(View, { style: { marginTop: 8 } },
          e(SectionHeader, { icon: IconCard, titleFr: 'Cancellation policy', tone: 'navy' })),
        e(
          View,
          { style: styles.listBlock },
          cancellationPolicy
            ? e(Text, { style: { fontSize: 10, color: palette.text, fontFamily: 'Amiri', lineHeight: 1.5, textAlign: 'right' } }, cancellationPolicy)
            : e(Text, { style: styles.emptyStateText }, 'No cancellation policy provided.')
        ),
        e(View, { style: { marginTop: 8 } },
          e(SectionHeader, { icon: IconInfo, titleFr: 'Good to know', tone: 'gold' })),
        e(
          View,
          { style: styles.listBlock },
          goodToKnow
            ? e(Text, { style: { fontSize: 10, color: palette.text, fontFamily: 'Amiri', lineHeight: 1.5, textAlign: 'right' } }, goodToKnow)
            : e(Text, { style: styles.emptyStateText }, 'No additional guidance provided.')
        )
      ),
      e(Footer, { agency })
    )
  );
}

// ── PDF generation ──

export function getStoragePathFromUrl(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const prefix = '/storage/v1/object/public/brochures/';
    const pathname = decodeURIComponent(parsed.pathname || '');
    if (!pathname.startsWith(prefix)) return null;
    return pathname.slice(prefix.length).replace(/^\/+/, '');
  } catch {
    return null;
  }
}

export function withCacheBust(url, suffix = Date.now()) {
  if (!url) return url;

  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set('t', String(suffix));
    return parsed.toString();
  } catch {
    return `${url}${url.includes('?') ? '&' : '?'}t=${suffix}`;
  }
}

function HotelPromotionBrochureDocument({ template, agency, selectedPhoto = null }) {
  const e = React.createElement;
  const rawHotelDetails = typeof template?.hotel_details === 'string' ? (() => { try { return JSON.parse(template.hotel_details || '{}'); } catch { return {}; } })() : (template?.hotel_details || {});
  const hotelDetails = rawHotelDetails && typeof rawHotelDetails === 'object' ? rawHotelDetails : {};
  const photoUrl = getPhotoUrl(selectedPhoto) || getPhotoUrl((Array.isArray(template?.photos) ? template.photos : [])[0]);
  const basePrice = Number(template?.selling_price || 0);
  const discountValue = Number(hotelDetails?.discount_value || 0);
  const finalPrice = hotelDetails?.discount_type === 'fixed'
    ? Math.max(basePrice - discountValue, 0)
    : basePrice * (1 - (discountValue / 100));
  const websiteUrl = typeof hotelDetails?.hotel_website === 'string' && hotelDetails.hotel_website.trim()
    ? hotelDetails.hotel_website.trim()
    : (typeof template?.hotel_website === 'string' && template.hotel_website.trim() ? template.hotel_website.trim() : 'Website not provided');
  const mapUrl = typeof hotelDetails?.hotel_map_url === 'string' && hotelDetails.hotel_map_url.trim()
    ? hotelDetails.hotel_map_url.trim()
    : (typeof template?.hotel_map_url === 'string' && template.hotel_map_url.trim() ? template.hotel_map_url.trim() : 'Maps link not provided');

  const styles = StyleSheet.create({
    page: { padding: 24, backgroundColor: '#f5f0e1', fontFamily: 'Helvetica' },
    card: { backgroundColor: '#fffefb', borderRadius: 18, borderWidth: 1, borderColor: '#e7d7a3', padding: 20 },
    badge: { alignSelf: 'flex-start', backgroundColor: '#f2e7c4', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12 },
    badgeText: { fontSize: 10, color: '#1a1d1a', fontWeight: 'bold', letterSpacing: 1.1 },
    title: { fontSize: 28, color: '#0a1120', fontWeight: 'bold', marginBottom: 8 },
    subtitle: { fontSize: 12, color: '#475569', marginBottom: 18 },
    image: { width: '100%', height: 220, borderRadius: 14, marginBottom: 18, objectFit: 'cover' },
    grid: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
    item: { flex: 1, backgroundColor: '#f7f2e3', borderRadius: 12, borderWidth: 1, borderColor: '#ead7a5', padding: 12 },
    label: { fontSize: 9, color: '#667085', textTransform: 'uppercase', marginBottom: 6 },
    value: { fontSize: 14, color: '#0a1120', fontWeight: 'bold' },
    priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e8dcc1' },
    priceBlock: { flex: 1 },
    footer: { marginTop: 18, fontSize: 10, color: '#475569' },
  });

  return e(
    Document,
    null,
    e(
      Page,
      { size: 'A4', style: styles.page },
      e(
        View,
        { style: styles.card },
        e(View, { style: styles.badge }, e(Text, { style: styles.badgeText }, 'HOTEL PROMOTION')),
        e(Text, { style: styles.title }, safeText(template?.label || hotelDetails?.hotel_name || 'Hotel Promotion', 'Hotel Promotion')),
        e(Text, { style: styles.subtitle }, `${safeText(hotelDetails?.country || template?.country || '—', '—')} • ${safeText(hotelDetails?.province || template?.destination || '—', '—')}`),
        photoUrl ? e(Image, { src: photoUrl, style: styles.image }) : null,
        e(
          View,
          { style: styles.grid },
          e(
            View,
            { style: styles.item },
            e(Text, { style: styles.label }, 'Hotel'),
            e(Text, { style: styles.value }, safeText(hotelDetails?.hotel_name || template?.label || 'Hotel', 'Hotel'))
          ),
          e(
            View,
            { style: styles.item },
            e(Text, { style: styles.label }, 'Stay period'),
            e(Text, { style: styles.value }, `${safeText(hotelDetails?.start_date || '—', '—')} ${hotelDetails?.end_date ? `→ ${hotelDetails.end_date}` : ''}`)
          )
        ),
        e(
          View,
          { style: styles.grid },
          e(
            View,
            { style: styles.item },
            e(Text, { style: styles.label }, 'Discount'),
            e(Text, { style: styles.value }, hotelDetails?.discount_type === 'fixed' ? `${formatDZD(Number(discountValue || 0))} off` : `${discountValue || 0}% off`)
          ),
          e(
            View,
            { style: styles.item },
            e(Text, { style: styles.label }, 'Child age'),
            e(Text, { style: styles.value }, `${hotelDetails?.free_child_age ?? '—'} years`)
          )
        ),
        e(
          View,
          { style: styles.priceRow },
          e(View, { style: styles.priceBlock }, e(Text, { style: { ...styles.label, marginBottom: 4 } }, 'Before'), e(Text, { style: { fontSize: 18, color: '#0a1120', fontWeight: 'bold' } }, formatDZD(basePrice))),
          e(View, { style: { ...styles.priceBlock, alignItems: 'flex-end' } }, e(Text, { style: { ...styles.label, marginBottom: 4 } }, 'After'), e(Text, { style: { fontSize: 18, color: '#0a1120', fontWeight: 'bold' } }, formatDZD(finalPrice)))
        ),
        e(
          View,
          { style: { marginTop: 18, gap: 8 } },
          e(
            View,
            { style: { backgroundColor: '#f7f2e3', borderRadius: 10, borderWidth: 1, borderColor: '#ead7a5', padding: 10 } },
            e(Text, { style: { fontSize: 9, color: '#667085', textTransform: 'uppercase', marginBottom: 4 } }, 'Website'),
            e(Text, { style: { fontSize: 10, color: '#0a1120', fontWeight: 'bold', lineHeight: 1.4 } }, websiteUrl)
          ),
          e(
            View,
            { style: { backgroundColor: '#f7f2e3', borderRadius: 10, borderWidth: 1, borderColor: '#ead7a5', padding: 10 } },
            e(Text, { style: { fontSize: 9, color: '#667085', textTransform: 'uppercase', marginBottom: 4 } }, 'Maps'),
            e(Text, { style: { fontSize: 10, color: '#0a1120', fontWeight: 'bold', lineHeight: 1.4 } }, mapUrl)
          )
        )
      )
    )
  );
}

export async function generateHotelPromotionBrochurePdf(template, selectedPhoto = null) {
  if (!template?.id) throw new Error('The hotel promotion must be saved before generating a brochure.');
  if (!supabase) throw new Error('Supabase is not configured.');

  const agency = await fetchAgencySettings();
  const pdfDoc = pdf(React.createElement(HotelPromotionBrochureDocument, { template, agency, selectedPhoto }));
  const blob = await pdfDoc.toBlob();

  if (!blob) throw new Error('The hotel brochure could not be generated.');

  const safeName = (template?.service_ref || template?.label || 'hotel-promotion')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();

  const fileName = `${safeName}-${template.id}.pdf`;
  const previousBrochurePath = getStoragePathFromUrl(template?.brochure_url || '');

  if (previousBrochurePath && previousBrochurePath !== fileName) {
    await supabase.storage.from('brochures').remove([previousBrochurePath]);
  }

  const { error: uploadError } = await supabase.storage
    .from('brochures')
    .upload(fileName, blob, { contentType: 'application/pdf', upsert: true });

  if (uploadError) throw uploadError;

  const { data: { publicUrl: baseUrl } } = supabase.storage.from('brochures').getPublicUrl(fileName);
  if (!baseUrl) throw new Error('The brochure was uploaded but the public URL could not be created.');

  const publicUrl = withCacheBust(baseUrl, Date.now());
  const normalizedPhotos = Array.isArray(template?.photos)
    ? template.photos
    : typeof template?.photos === 'string'
      ? (() => { try { const parsed = JSON.parse(template.photos); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })()
      : [];

  const { error: updateError } = await supabase
    .from('package_templates')
    .update({ brochure_url: publicUrl, photos: normalizedPhotos.length ? normalizedPhotos : null })
    .eq('id', template.id);

  if (updateError) throw updateError;

  return { blob, publicUrl, fileName };
}

export async function generateTripBrochurePdf(template, selectedPhoto = null) {
  if (!template?.id) throw new Error('This package must be saved before generating a brochure.');
  if (!supabase) throw new Error('Supabase is not configured.');

  const agency = await fetchAgencySettings();
  const pdfDoc = pdf(e(TripBrochureDocument, { template, agency, selectedPhoto }));
  const blob = await pdfDoc.toBlob();

  if (!blob) throw new Error('The brochure could not be generated.');

  const safeName = (template?.service_ref || template?.label || 'trip-package')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();

  const fileName = `${safeName}-${template.id}.pdf`;
  const previousBrochurePath = getStoragePathFromUrl(template?.brochure_url || '');

  if (previousBrochurePath && previousBrochurePath !== fileName) {
    await supabase.storage.from('brochures').remove([previousBrochurePath]);
  }

  const { error: uploadError } = await supabase.storage
    .from('brochures')
    .upload(fileName, blob, { contentType: 'application/pdf', upsert: true });

  if (uploadError) throw uploadError;

  const { data: { publicUrl: baseUrl } } = supabase.storage.from('brochures').getPublicUrl(fileName);
  if (!baseUrl) throw new Error('The brochure was uploaded but the public URL could not be created.');

  const publicUrl = withCacheBust(baseUrl, Date.now());

  const normalizedPhotos = Array.isArray(template?.photos)
    ? template.photos
    : typeof template?.photos === 'string'
      ? (() => {
          try { const p = JSON.parse(template.photos); return Array.isArray(p) ? p : []; } catch { return []; }
        })()
      : [];

  const { error: updateError } = await supabase
    .from('package_templates')
    .update({ brochure_url: publicUrl, photos: normalizedPhotos.length ? normalizedPhotos : null })
    .eq('id', template.id);

  if (updateError) throw updateError;

  return { blob, publicUrl, fileName };
}

export function downloadBrochureLink(url) {
  if (!url) return;
  const anchor = document.createElement('a');
  anchor.href = withCacheBust(url, Date.now());
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.download = 'trip-brochure.pdf';
  anchor.click();
}