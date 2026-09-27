import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, MapPin, Percent, Star, Tag, Wallet } from 'lucide-react';

const defaultCountryOptions = ['Turkey', 'Tunisia', 'Egypt', 'Algeria', 'France', 'United Arab Emirates', 'Qatar', 'Saudi Arabia'];
const countryCityMap = {
  Algeria: ['Algiers', 'Oran', 'Constantine', 'Annaba', 'Tlemcen', 'Batna', 'Setif', 'Sidi Bel Abbes', 'Bejaia', 'Skikda', 'Djelfa', 'Ouargla'],
  Tunisia: ['Tunis', 'Sousse', 'Monastir', 'Djerba', 'Sfax', 'Kairouan', 'Tozeur', 'Bizerte', 'Mahdia', 'Nabeul'],
  Egypt: ['Cairo', 'Sharm El Sheikh', 'Hurghada', 'Luxor', 'Alexandria', 'Aswan'],
  Turkey: ['Istanbul', 'Antalya', 'Izmir', 'Bodrum', 'Cappadocia', 'Ankara'],
  France: ['Paris', 'Nice', 'Marseille', 'Lyon', 'Bordeaux', 'Cannes'],
  'United Arab Emirates': ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah'],
  Qatar: ['Doha', 'Lusail', 'Al Wakrah', 'Mesaieed'],
  'Saudi Arabia': ['Jeddah', 'Riyadh', 'Makkah', 'Madinah', 'Dammam'],
};
const defaultProvinceOptions = [...new Set(Object.values(countryCityMap).flat())];

const getProvinceOptions = (country) => {
  if (!country) return defaultProvinceOptions;
  const countryOptions = countryCityMap[country] || [];
  return countryOptions.length ? countryOptions : defaultProvinceOptions;
};

const emptyHotelDetails = () => ({
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

const parseJsonObject = (value, fallback = {}) => {
  if (!value) return fallback;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  if (typeof value === 'object') {
    return value;
  }

  return fallback;
};

export default function HotelPromotionBuilder({ value, onChange }) {
  const [form, setForm] = useState(() => ({
    ...emptyHotelDetails(),
    ...parseJsonObject(value, {}),
  }));
  const [customCountryText, setCustomCountryText] = useState(() => {
    const initialCountry = parseJsonObject(value, {}).country || '';
    return defaultCountryOptions.includes(initialCountry) || countryCityMap[initialCountry] ? '' : initialCountry;
  });
  const [countryCustomMode, setCountryCustomMode] = useState(() => {
    const initialCountry = parseJsonObject(value, {}).country || '';
    return !!initialCountry && !defaultCountryOptions.includes(initialCountry) && !countryCityMap[initialCountry];
  });
  const [customProvinceText, setCustomProvinceText] = useState(() => {
    const initialProvince = parseJsonObject(value, {}).province || '';
    return initialProvince ? initialProvince : '';
  });
  const [provinceCustomMode, setProvinceCustomMode] = useState(() => {
    const initialProvince = parseJsonObject(value, {}).province || '';
    const initialCountry = parseJsonObject(value, {}).country || '';
    return !!initialProvince && !getProvinceOptions(initialCountry).includes(initialProvince);
  });

  useEffect(() => {
    const nextValue = { ...emptyHotelDetails(), ...parseJsonObject(value, {}) };
    setForm((prev) => {
      const isSame = JSON.stringify(prev) === JSON.stringify(nextValue);
      return isSame ? prev : nextValue;
    });

    const nextCountry = nextValue.country || '';
    const nextProvince = nextValue.province || '';
    const countryIsCustom = Boolean(nextCountry && !defaultCountryOptions.includes(nextCountry) && !countryCityMap[nextCountry]);
    const provinceIsCustom = Boolean(nextProvince && !getProvinceOptions(nextValue.country || '').includes(nextProvince));

    setCustomCountryText(countryIsCustom ? nextCountry : '');
    setCountryCustomMode(countryIsCustom);
    setCustomProvinceText(provinceIsCustom ? nextProvince : '');
    setProvinceCustomMode(provinceIsCustom);
  }, [value]);

  const updateField = (field, nextValue) => {
    setForm((previous) => {
      const next = { ...previous, [field]: nextValue };
      onChange?.(next);
      return next;
    });
  };

  const starOptions = [1, 2, 3, 4, 5];
  const selectedDiscountLabel = useMemo(
    () => (form.discount_type === 'percentage' ? '%' : 'DZD'),
    [form.discount_type]
  );

  const provinceOptions = getProvinceOptions(form.country || '');
  const showCustomCountry = countryCustomMode || Boolean(customCountryText || (form.country && !defaultCountryOptions.includes(form.country) && !countryCityMap[form.country]));
  const showCustomProvince = provinceCustomMode || Boolean(customProvinceText || (form.province && !provinceOptions.includes(form.province)));

  const handleCountryChange = (nextCountry) => {
    const normalized = nextCountry === '__custom__' ? '' : nextCountry;
    const nextProvince = normalized && form.province && !getProvinceOptions(normalized).includes(form.province) ? '' : form.province;
    updateField('country', normalized);
    setCountryCustomMode(false);
    setCustomCountryText('');
    if (nextProvince !== form.province) {
      updateField('province', nextProvince);
    }
  };

  const handleProvinceChange = (nextProvince) => {
    const normalized = nextProvince === '__custom__' ? '' : nextProvince;
    setProvinceCustomMode(false);
    setCustomProvinceText('');
    updateField('province', normalized);
  };

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="hotel-country" className="mb-1 block text-sm font-medium text-slate-700">Country</label>
          <select
            id="hotel-country"
            value={countryCustomMode ? '__custom__' : (form.country || '')}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === '__custom__') {
                setCountryCustomMode(true);
                setCustomCountryText(form.country && !defaultCountryOptions.includes(form.country) && !countryCityMap[form.country] ? form.country : '');
                return;
              }
              setCountryCustomMode(false);
              setCustomCountryText('');
              handleCountryChange(nextValue);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#c9a84c]"
          >
            <option value="">Select country</option>
            {defaultCountryOptions.map((country) => (
              <option key={country} value={country}>{country}</option>
            ))}
            <option value="__custom__">Custom country</option>
          </select>
          {showCustomCountry && (
            <input
              id="hotel-country-custom"
              value={customCountryText}
              onChange={(event) => {
                const nextValue = event.target.value;
                setCustomCountryText(nextValue);
                setCountryCustomMode(true);
                updateField('country', nextValue);
              }}
              placeholder="Enter custom country"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#c9a84c]"
            />
          )}
        </div>

        <div>
          <label htmlFor="hotel-province" className="mb-1 block text-sm font-medium text-slate-700">Province / City</label>
          <select
            id="hotel-province"
            value={provinceCustomMode ? '__custom__' : (form.province || '')}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === '__custom__') {
                setProvinceCustomMode(true);
                setCustomProvinceText(form.province && !getProvinceOptions(form.country || '').includes(form.province) ? form.province : '');
                return;
              }
              setProvinceCustomMode(false);
              setCustomProvinceText('');
              handleProvinceChange(nextValue);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#c9a84c]"
          >
            <option value="">Select city</option>
            {provinceOptions.map((province) => (
              <option key={province} value={province}>{province}</option>
            ))}
            <option value="__custom__">Custom city</option>
          </select>
          {showCustomProvince && (
            <input
              id="hotel-province-custom"
              value={customProvinceText}
              onChange={(event) => {
                const nextValue = event.target.value;
                setCustomProvinceText(nextValue);
                setProvinceCustomMode(true);
                updateField('province', nextValue);
              }}
              placeholder="Enter custom city"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#c9a84c]"
            />
          )}
        </div>

        <div className="md:col-span-2">
          <label htmlFor="hotel-name" className="mb-1 block text-sm font-medium text-slate-700">Hotel Name</label>
          <input
            id="hotel-name"
            value={form.hotel_name || ''}
            onChange={(event) => updateField('hotel_name', event.target.value)}
            placeholder="e.g. Hotel El Djazair"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#c9a84c]"
          />
        </div>

        <div>
          <label htmlFor="hotel-stars" className="mb-1 block text-sm font-medium text-slate-700">Star Rating</label>
          <div id="hotel-stars" className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2">
            {starOptions.map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => updateField('stars', star)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-bold transition ${
                  Number(form.stars || 5) >= star
                    ? 'border-[#d9b963] bg-[#fff8dc] text-[#0a1120]'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
                aria-label={`Set ${star} stars`}
              >
                <Star size={14} className={Number(form.stars || 5) >= star ? 'fill-current' : ''} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="hotel-free-child" className="mb-1 block text-sm font-medium text-slate-700">Age of Free Child</label>
          <div className="relative">
            <Tag size={14} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
            <input
              id="hotel-free-child"
              type="number"
              min="0"
              value={form.free_child_age ?? 6}
              onChange={(event) => updateField('free_child_age', Number(event.target.value) || 0)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#c9a84c]"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#f0e6c2] bg-[#fffdf8] p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0a1120]">
          <Wallet size={15} className="text-[#c9a84c]" />
          Discount
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => updateField('discount_type', 'percentage')}
              className={`rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                form.discount_type === 'percentage'
                  ? 'bg-[#0a1120] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Percentage
            </button>
            <button
              type="button"
              onClick={() => updateField('discount_type', 'fixed')}
              className={`rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                form.discount_type === 'fixed'
                  ? 'bg-[#0a1120] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Fixed Amount
            </button>
          </div>

          <div className="flex-1">
            <label htmlFor="hotel-discount-value" className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
              Value
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute right-3 top-3 text-xs font-bold text-slate-500">{selectedDiscountLabel}</span>
              <input
                id="hotel-discount-value"
                type="number"
                min="0"
                value={form.discount_value ?? 0}
                onChange={(event) => updateField('discount_value', Number(event.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-3 text-sm text-slate-800 outline-none transition focus:border-[#c9a84c]"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="hotel-start-date" className="mb-1 block text-sm font-medium text-slate-700">Start Date</label>
          <div className="relative">
            <CalendarDays size={14} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
            <input
              id="hotel-start-date"
              type="date"
              value={form.start_date || ''}
              onChange={(event) => updateField('start_date', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#c9a84c]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="hotel-end-date" className="mb-1 block text-sm font-medium text-slate-700">End Date</label>
          <div className="relative">
            <CalendarDays size={14} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
            <input
              id="hotel-end-date"
              type="date"
              value={form.end_date || ''}
              onChange={(event) => updateField('end_date', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#c9a84c]"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor="hotel-website" className="mb-1 block text-sm font-medium text-slate-700">Hotel Website</label>
          <input
            id="hotel-website"
            type="url"
            value={form.hotel_website || ''}
            onChange={(event) => updateField('hotel_website', event.target.value)}
            placeholder="https://example.com"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#c9a84c]"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="hotel-map-url" className="mb-1 block text-sm font-medium text-slate-700">Google Maps Link</label>
          <input
            id="hotel-map-url"
            type="url"
            value={form.hotel_map_url || ''}
            onChange={(event) => updateField('hotel_map_url', event.target.value)}
            placeholder="https://maps.google.com/?q=hotel+name"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#c9a84c]"
          />
        </div>
      </div>
    </div>
  );
}