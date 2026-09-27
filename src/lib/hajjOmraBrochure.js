import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, pdf, Font, Svg, Path } from '@react-pdf/renderer';
import backgroundImage from '../assets/background.jpg';
import { fetchAgencySettings } from './agencySettings';
import { supabase } from './supabase';
import {
  toText,
  safeText,
  getPhotoUrl,
  uniqueTextValues,
  getTravelDatesForTemplate,
  formatTravelDateTimeRange,
  parseItineraryLines,
  withCacheBust,
  getStoragePathFromUrl,
} from './brochurePdf';

Font.register({
  family: 'Amiri',
  src: '/fonts/Amiri-Regular.ttf',
});

const e = React.createElement;

// ── Islamic palette ──
const palette = {
  green: '#103824',
  greenSoft: '#edf6f0',
  gold: '#c9a84c',
  goldSoft: '#faf3df',
  cream: '#fcfcf9',
  white: '#ffffff',
  text: '#1c2a24',
  muted: '#5b6b63',
  border: '#dfe7e0',
};

const PdfIcon = ({ children, size = 14 }) =>
  e(Svg, { width: size, height: size, viewBox: '0 0 24 24', style: { overflow: 'visible' } }, children);

const IconCheck = ({ size, color = palette.green }) =>
  e(PdfIcon, { size }, e(Path, { fill: 'none', stroke: color, strokeWidth: '2.4', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M20 6 9 17l-5-5' }));

const IconCross = ({ size, color = '#a13636' }) =>
  e(PdfIcon, { size }, e(Path, { fill: 'none', stroke: color, strokeWidth: '2.4', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M18 6 6 18M6 6l12 12' }));

const IconCalendar = ({ size, color = palette.gold }) =>
  e(
    PdfIcon,
    { size },
    e(Path, { fill: 'none', stroke: color, strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M3 8h18M7 3v4M17 3v4M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z' })
  );

const IconMosque = ({ size, color = palette.gold }) =>
  e(
    PdfIcon,
    { size },
    e(Path, { fill: 'none', stroke: color, strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M12 2v3M9 6a3 3 0 0 1 6 0v2H9V6ZM3 21v-6l4-4 5 4 5-4 4 4v6M3 21h18' })
  );

const IconInfoCircle = ({ size, color = palette.green }) =>
  e(PdfIcon, { size }, e(Path, { fill: 'none', stroke: color, strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 16v-4M12 8h.01' }));

// ── Arabic-friendly helpers (kept AS-IS text, no stripping) ──

const arabicText = (v) => {
  const text = toText(v);
  return text || '';
};

const roomLabels = [
  { key: 'prix_single', label: 'فردي (Single)' },
  { key: 'prix_double', label: 'ثنائي (Double)' },
  { key: 'prix_triple', label: 'ثلاثي (Triple)' },
  { key: 'prix_quadruple', label: 'رباعي (Quadruple)' },
  { key: 'prix_quintuple', label: 'خماسي (Quintuple)' },
];

const getHotelRoomPrices = (hotel = {}) =>
  roomLabels
    .map(({ key, label }) => (hotel?.[key] ? { label, value: toText(hotel[key]) } : null))
    .filter(Boolean);

const getHotelLocationLabel = (hotel = {}) => {
  const location = String(hotel?.location || '').trim().toLowerCase();
  if (location.includes('medina') || location.includes('مدينة')) return 'المدينة المنورة';
  if (location.includes('mecca') || location.includes('مكة')) return 'مكة المكرمة';
  return hotel?.location ? arabicText(hotel.location) : '—';
};

const getHotelDisplayName = (hotel, index) => {
  const candidate = hotel?.hotel_name || hotel?.name || hotel?.hotelName || hotel?.title || hotel?.label || hotel?.hotel || '';
  const text = arabicText(candidate) || arabicText(hotel?.hotel_name_ar) || `فندق ${index + 1}`;
  return text || `فندق ${index + 1}`;
};

const translateMealType = (meal) => {
  const raw = String(meal ?? '').trim();
  if (!raw) return 'غير محدد';

  const normalized = raw.toLowerCase().replace(/\s+/g, ' ');
  const map = {
    'petit déjeuner': 'فطور الصباح',
    'breakfast': 'فطور الصباح',
    'demi-pension': 'نصف إقامة (فطور وعشاء)',
    'half board': 'نصف إقامة (فطور وعشاء)',
    'pension complète': 'إقامة كاملة',
    'full board': 'إقامة كاملة',
    'all inclusive': 'شامل كلياً',
    'all inclusive soft': 'شامل كلياً',
    'sans repas': 'بدون وجبات',
    'room only': 'بدون وجبات',
  };

  return map[normalized] || arabicText(raw);
};

const styles = StyleSheet.create({
  page: { padding: 24, backgroundColor: palette.cream, fontFamily: 'Amiri', direction: 'rtl' },
  pageBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    minWidth: '100%',
    minHeight: '100%',
    zIndex: -1,
    objectFit: 'cover',
    opacity: 0.12,
  },
  pageFrame: { flex: 1 },
  watermarkWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  topBar: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  logoWrap: { width: 52, height: 52, borderRadius: 16, overflow: 'hidden', backgroundColor: palette.white, borderWidth: 1, borderColor: palette.gold },
  logoImage: { width: 52, height: 52, objectFit: 'contain' },
  agencyName: { fontSize: 13, color: palette.green, fontFamily: 'Amiri', textAlign: 'right' },
  badge: { alignSelf: 'flex-end', backgroundColor: palette.gold, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 8 },
  badgeText: { fontSize: 11, color: palette.white, fontFamily: 'Amiri', letterSpacing: 1 },
  coverTitle: { fontSize: 27, color: palette.green, fontFamily: 'Amiri', textAlign: 'right', lineHeight: 1.25, marginBottom: 8 },
  summaryCard: { borderWidth: 1, borderColor: palette.gold, borderRadius: 18, backgroundColor: palette.white, padding: 12, marginTop: 8 },
  summaryRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  summaryItem: { width: '48%', borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: palette.greenSoft, paddingVertical: 7, paddingHorizontal: 8 },
  summaryLabel: { fontSize: 9, color: palette.muted, fontFamily: 'Amiri', textAlign: 'right' },
  summaryValue: { fontSize: 12, color: palette.text, fontFamily: 'Amiri', textAlign: 'right', marginTop: 2 },
  photoBox: { height: 128, borderRadius: 18, overflow: 'hidden', backgroundColor: palette.greenSoft, borderWidth: 1, borderColor: palette.border, marginTop: 8 },
  imageFill: { width: '100%', height: '100%', objectFit: 'cover' },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: palette.green, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 },
  sectionHeaderText: { fontSize: 13, color: palette.white, fontFamily: 'Amiri' },
  sectionIconWrap: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  card: { borderWidth: 1, borderColor: palette.border, borderRadius: 14, backgroundColor: palette.white, padding: 10, marginBottom: 8 },
  dateRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: palette.border, paddingVertical: 8 },
  dateLabel: { fontSize: 11, color: palette.green, fontFamily: 'Amiri' },
  dateValue: { fontSize: 10.5, color: palette.text, fontFamily: 'Amiri' },
  hotelCard: { borderWidth: 1, borderColor: palette.gold, borderRadius: 16, backgroundColor: palette.white, padding: 12, marginBottom: 10 },
  hotelHeaderRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  hotelName: { fontSize: 14, color: palette.green, fontFamily: 'Amiri', textAlign: 'right' },
  locationPill: { backgroundColor: palette.goldSoft, borderWidth: 1, borderColor: palette.gold, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  locationPillText: { fontSize: 9, color: palette.green, fontFamily: 'Amiri' },
  hotelMetaText: { fontSize: 9.5, color: palette.muted, fontFamily: 'Amiri', textAlign: 'right', marginBottom: 3 },
  priceGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  priceBlock: { width: '31%', borderWidth: 1, borderColor: palette.border, borderRadius: 10, backgroundColor: palette.greenSoft, padding: 7 },
  priceLabel: { fontSize: 8, color: palette.muted, fontFamily: 'Amiri', textAlign: 'right' },
  priceValue: { fontSize: 11, color: palette.green, fontFamily: 'Amiri', textAlign: 'right', marginTop: 2 },
  listRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: palette.border },
  listIconWrap: { width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.greenSoft },
  listText: { fontSize: 10.5, color: palette.text, fontFamily: 'Amiri', flex: 1, textAlign: 'right', lineHeight: 1.4 },
  itineraryRow: { flexDirection: 'row-reverse', borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.white },
  itineraryRowAlt: { flexDirection: 'row-reverse', borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.greenSoft },
  itineraryDay: { width: 90, padding: 8 },
  itineraryDayText: { fontSize: 10, color: palette.green, fontFamily: 'Amiri', textAlign: 'right' },
  itineraryContent: { flex: 1, padding: 8, fontSize: 10, color: palette.text, fontFamily: 'Amiri', textAlign: 'right' },
  emptyState: { borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: palette.white, padding: 12 },
  emptyStateText: { fontSize: 10.5, color: palette.muted, fontFamily: 'Amiri', textAlign: 'center' },
  footer: { position: 'absolute', left: 16, right: 16, bottom: 10, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 6, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  footerText: { fontSize: 7.4, color: palette.muted, fontFamily: 'Amiri' },
});

function IslamicWatermark() {
  // Subtle repeated geometric star pattern used as a cover watermark.
  const stars = Array.from({ length: 5 });
  return e(
    View,
    { style: styles.watermarkWrap },
    e(
      Svg,
      { width: '100%', height: '100%', viewBox: '0 0 400 560', style: { opacity: 0.06 } },
      stars.map((_, row) =>
        Array.from({ length: 4 }).map((__, col) =>
          e(Path, {
            key: `star-${row}-${col}`,
            fill: palette.green,
            d: 'M50 0 L61 35 L98 35 L68 57 L79 92 L50 70 L21 92 L32 57 L2 35 L39 35 Z',
            transform: `translate(${col * 110 - 20}, ${row * 120 - 20}) scale(0.9)`,
          })
        )
      )
    )
  );
}

function Footer({ agency }) {
  const agencyName = safeText(agency?.agency_name, 'AIRVOY');
  const phone = safeText(agency?.phone, '—');
  const email = safeText(agency?.email, '—');

  return e(
    View,
    { style: styles.footer, fixed: true },
    e(Text, { style: styles.footerText }, `${agencyName} • ${phone}`),
    e(Text, { style: styles.footerText }, email)
  );
}

function SectionHeader({ icon: Icon, title }) {
  return e(
    View,
    { style: styles.sectionHeader },
    Icon ? e(View, { style: styles.sectionIconWrap }, e(Icon, { size: 12, color: palette.white })) : null,
    e(Text, { style: styles.sectionHeaderText }, title)
  );
}

function HajjOmraBrochureDocument({ template, agency, selectedPhoto = null }) {
  const isHajj = String(template?.template_type || '').toLowerCase() === 'hajj';
  const typeLabel = isHajj ? 'برنامج الحج' : 'برنامج العمرة';
  const logoUrl = safeText(agency?.logo_url, '').trim();
  const agencyName = safeText(agency?.agency_name, 'AIRVOY');
  const titleText = arabicText(template?.label) || typeLabel;
  const country = arabicText(template?.country) || '—';
  const destination = arabicText(template?.destination) || '—';
  const durationNights = (() => {
    const raw = template?.duration_nights;
    if (raw === null || raw === undefined || raw === '') return '14 ليلة / 15 يوماً';
    const nights = Number(raw);
    if (!Number.isFinite(nights) || nights <= 0) return '14 ليلة / 15 يوماً';
    return `${nights} ليلة / ${nights + 1} يوماً`;
  })();
  const coverPhotoUrl = getPhotoUrl(selectedPhoto) || getPhotoUrl((Array.isArray(template?.photos) ? template.photos : [])[0]);

  const travelDates = getTravelDatesForTemplate(template);
  const hotels = Array.isArray(template?.hotels) ? template.hotels : [];

  const includedItems = uniqueTextValues([
    ...(template?.transport ? [toText(template.transport)] : []),
    ...(template?.transfert ? ['النقل مشمول'] : []),
    ...(template?.assurance ? ['التأمين مشمول'] : []),
    ...(template?.visa_included ? ['التأشيرة مشمولة'] : []),
    ...(Array.isArray(template?.inclusions) ? template.inclusions.map((item) => toText(item)).filter(Boolean) : []),
  ]);

  const excludedItems = uniqueTextValues([
    !template?.transfert ? 'النقل غير مشمول' : null,
    !template?.assurance ? 'التأمين غير مشمول' : null,
    !template?.visa_included ? 'التأشيرة غير مشمولة' : null,
    ...(Array.isArray(template?.exclusions) ? template.exclusions.map((item) => toText(item)).filter(Boolean) : []),
  ]);

  const itineraryLines = parseItineraryLines(template?.plan_de_vol);
  const cancellationPolicy = arabicText(template?.cancellation_policy);
  const goodToKnow = arabicText(template?.good_to_know);

  const renderList = (items, iconComponent = null) =>
    e(
      View,
      { style: styles.card },
      items.length
        ? items.map((item, index) =>
            e(
              View,
              { key: `row-${index}`, style: [styles.listRow, index === items.length - 1 && { borderBottomWidth: 0 }] },
              iconComponent ? e(View, { style: styles.listIconWrap }, e(iconComponent, { size: 11 })) : null,
              e(Text, { style: styles.listText }, arabicText(typeof item === 'string' ? item : item.text))
            )
          )
        : e(View, { style: styles.emptyState }, e(Text, { style: styles.emptyStateText }, 'لا توجد معلومات متوفرة'))
    );

  return e(
    Document,
    null,
    // PAGE 1 — cover
    e(
      Page,
      { size: 'A4', style: { direction: 'rtl', fontFamily: 'Amiri', padding: 24 } },
      e(Image, {
        src: backgroundImage,
        fixed: true,
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          minWidth: '100%',
          minHeight: '100%',
          zIndex: -1,
          objectFit: 'cover',
        },
      }),
      e(
        View,
        { style: { flex: 1 } },
        e(
          View,
          { style: [styles.topBar, { backgroundColor: 'rgba(255,255,255,0.58)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 14 }] },
          e(View, { style: styles.logoWrap }, logoUrl ? e(Image, { src: logoUrl, style: styles.logoImage }) : null),
          e(Text, { style: styles.agencyName }, agencyName)
        ),
        e(View, { style: styles.badge }, e(Text, { style: styles.badgeText }, typeLabel)),
        e(Text, { style: styles.coverTitle }, titleText),
        coverPhotoUrl ? e(View, { style: styles.photoBox }, e(Image, { src: coverPhotoUrl, style: styles.imageFill })) : null,
        e(
          View,
          { style: styles.summaryCard },
          e(
            View,
            { style: styles.summaryRow },
            e(View, { style: styles.summaryItem }, e(Text, { style: styles.summaryLabel }, 'الدولة'), e(Text, { style: styles.summaryValue }, country)),
            e(View, { style: styles.summaryItem }, e(Text, { style: styles.summaryLabel }, 'الوجهة'), e(Text, { style: styles.summaryValue }, destination)),
            e(View, { style: styles.summaryItem }, e(Text, { style: styles.summaryLabel }, 'المدة'), e(Text, { style: styles.summaryValue }, durationNights)),
            e(View, { style: styles.summaryItem }, e(Text, { style: styles.summaryLabel }, 'المرجع'), e(Text, { style: styles.summaryValue }, safeText(template?.service_ref, '—')))
          )
        )
      ),
      e(Footer, { agency })
    ),
    // PAGE 2 — دواعيد الرحلات (dates only, no prices)
    e(
      Page,
      { size: 'A4', style: styles.page },
      e(
        View,
        { style: styles.pageFrame },
        e(SectionHeader, { icon: IconCalendar, title: 'مواعيد الرحلات' }),
        e(
          View,
          { style: styles.card },
          travelDates.length
            ? travelDates.map((travel, index) => {
                const { departure, returnDate } = formatTravelDateTimeRange(travel);
                return e(
                  View,
                  { key: `date-${index}`, style: [styles.dateRow, index === travelDates.length - 1 && { borderBottomWidth: 0 }] },
                  e(Text, { style: styles.dateLabel }, `${arabicText(travel?.label) || `الرحلة ${index + 1}`}`),
                  e(Text, { style: styles.dateValue }, `الذهاب: ${departure}  •  العودة: ${returnDate}`)
                );
              })
            : e(View, { style: styles.emptyState }, e(Text, { style: styles.emptyStateText }, 'لا توجد مواعيد رحلات متوفرة حالياً'))
        )
      ),
      e(Footer, { agency })
    ),
    // PAGE 3 — فنادق الإقامة والأسعار
    e(
      Page,
      { size: 'A4', style: styles.page },
      e(
        View,
        { style: styles.pageFrame },
        e(SectionHeader, { icon: IconMosque, title: 'فنادق الإقامة والأسعار' }),
        hotels.length
          ? hotels.map((hotel, index) => {
              const roomPrices = getHotelRoomPrices(hotel);
              const hotelName = getHotelDisplayName(hotel, index);
              const mealTypeLabel = translateMealType(hotel?.meal_type);

              return e(
                View,
                { key: `hotel-${index}`, style: styles.hotelCard },
                e(
                  View,
                  { style: styles.hotelHeaderRow },
                  e(View, { style: styles.locationPill }, e(Text, { style: styles.locationPillText }, getHotelLocationLabel(hotel))),
                  e(Text, { style: styles.hotelName }, hotelName)
                ),
                hotel?.distance_from_haram
                  ? e(Text, { style: styles.hotelMetaText }, `البعد عن الحرم: ${toText(hotel.distance_from_haram)} متر/كم`)
                  : null,
                hotel?.nights ? e(Text, { style: styles.hotelMetaText }, `عدد الليالي: ${toText(hotel.nights)}`) : null,
                hotel?.meal_type ? e(Text, { style: styles.hotelMetaText }, `نوع الوجبات: ${mealTypeLabel}`) : null,
                roomPrices.length
                  ? e(
                      View,
                      { style: styles.priceGrid },
                      roomPrices.map((price, priceIndex) =>
                        e(
                          View,
                          { key: `price-${index}-${priceIndex}`, style: styles.priceBlock },
                          e(Text, { style: styles.priceLabel }, price.label),
                          e(Text, { style: styles.priceValue }, price.value)
                        )
                      )
                    )
                  : e(Text, { style: styles.hotelMetaText }, 'الأسعار غير متوفرة حالياً')
              );
            })
          : e(View, { style: styles.emptyState }, e(Text, { style: styles.emptyStateText }, 'لا توجد فنادق مضافة بعد'))
      ),
      e(Footer, { agency })
    ),
    // PAGE 4 — الخدمات + مسار الرحلة + الشروط
    e(
      Page,
      { size: 'A4', style: styles.page },
      e(
        View,
        { style: styles.pageFrame },
        e(SectionHeader, { icon: IconCheck, title: 'الخدمات المشمولة' }),
        renderList(includedItems, IconCheck),
        e(View, { style: { marginTop: 8 } }, e(SectionHeader, { icon: IconCross, title: 'الخدمات غير المشمولة' })),
        renderList(excludedItems, IconCross),
        e(View, { style: { marginTop: 8 } }, e(SectionHeader, { icon: IconCalendar, title: 'مسار الرحلة' })),
        itineraryLines.length
          ? e(
              View,
              { style: { borderWidth: 1, borderColor: palette.border, borderRadius: 12, overflow: 'hidden' } },
              itineraryLines.map((line, index) =>
                e(
                  View,
                  { key: `itinerary-${index}`, style: [index % 2 === 0 ? styles.itineraryRow : styles.itineraryRowAlt, index === itineraryLines.length - 1 && { borderBottomWidth: 0 }] },
                  e(View, { style: styles.itineraryDay }, e(Text, { style: styles.itineraryDayText }, arabicText(line.label))),
                  e(Text, { style: styles.itineraryContent }, arabicText(line.description))
                )
              )
            )
          : e(View, { style: styles.emptyState }, e(Text, { style: styles.emptyStateText }, 'برنامج مفصل متوفر عند الطلب')),
        e(View, { style: { marginTop: 8 } }, e(SectionHeader, { icon: IconInfoCircle, title: 'الشروط والأحكام' })),
        e(
          View,
          { style: styles.card },
          e(Text, { style: [styles.listText, { flex: 0 }] }, cancellationPolicy || 'لا توجد شروط إلغاء محددة.')
        ),
        e(View, { style: { marginTop: 8 } }, e(SectionHeader, { icon: IconInfoCircle, title: 'معلومات مفيدة' })),
        e(
          View,
          { style: styles.card },
          e(Text, { style: [styles.listText, { flex: 0 }] }, goodToKnow || 'لا توجد معلومات إضافية.')
        )
      ),
      e(Footer, { agency })
    )
  );
}

export async function generateHajjOmraBrochurePdf(template, selectedPhoto = null) {
  if (!template?.id) throw new Error('يجب حفظ الباقة قبل إنشاء الكتيب.');
  if (!supabase) throw new Error('Supabase is not configured.');

  const agency = await fetchAgencySettings();
  const pdfDoc = pdf(e(HajjOmraBrochureDocument, { template, agency, selectedPhoto }));
  const blob = await pdfDoc.toBlob();

  if (!blob) throw new Error('تعذر إنشاء الكتيب.');

  const safeName = (template?.service_ref || template?.label || 'hajj-omra-package')
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
  if (!baseUrl) throw new Error('تم رفع الكتيب لكن تعذر إنشاء الرابط العام.');

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
