export const parseBrochureArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getBrochureItineraryDays = (packageData = {}) => {
  const plan = String(packageData.plan_de_vol || '').trim();
  const days = parseBrochureArray(packageData.itinerary_days)
    .map((day, index) => ({
      label: String(day?.label || `Day ${index + 1}`).trim(),
      description: String(day?.description || '').trim(),
    }))
    .filter((day) => day.description);

  if (days.length) return days;
  if (!plan) return [];

  return plan.split(/\r?\n/).map((line, index) => {
    const match = line.match(/^(.*?):\s*(.*)$/);
    return {
      label: match?.[1]?.trim() || `Day ${index + 1}`,
      description: match?.[2]?.trim() || line.trim(),
    };
  }).filter((day) => day.description);
};

const hasPrice = (value) => value !== '' && value !== null && value !== undefined;

const matchesTravelDate = (hotel, travel, index) => {
  if (hotel.travel_date_id) return hotel.travel_date_id === travel.id;
  if (hotel.travel_date_label) return hotel.travel_date_label === travel.label;
  return index === 0;
};

export const getBrochureTravelDatePricing = (travel = {}, hotels = [], index = 0) => {
  const dateHotels = hotels.filter((hotel) => matchesTravelDate(hotel, travel, index));
  const primaryHotel = dateHotels.find((hotel) => hotel.is_primary !== false && hotel.pricing_scope !== 'optional')
    || dateHotels.find((hotel) => hotel.is_primary !== false)
    || null;
  const standardRates = [
    { label: 'Single', value: travel.prix_single || primaryHotel?.prix_single },
    { label: 'Double', value: travel.prix_double || primaryHotel?.prix_double },
    { label: 'Triple', value: travel.prix_triple || primaryHotel?.prix_triple },
  ].filter((rate) => hasPrice(rate.value));

  const customPrices = [
    ...parseBrochureArray(travel.custom_prices),
    ...parseBrochureArray(primaryHotel?.custom_prices),
  ].filter((price) => hasPrice(price?.price ?? price?.value ?? price?.amount));
  const uniqueCustomPrices = [...new Map(customPrices.map((price) => {
    const value = price.price ?? price.value ?? price.amount;
    const name = price.name || price.label || price.key || 'Custom';
    return [`${name}:${value}`, { name, value }];
  })).values()];

  return { standardRates, customPrices: uniqueCustomPrices };
};
