import { describe, expect, it } from 'vitest';
import {
  getBrochureItineraryDays,
  getBrochureTravelDatePricing,
} from '../src/lib/packageBrochureData.js';

describe('getBrochureItineraryDays', () => {
  it('reads stored day arrays and legacy plan text', () => {
    expect(getBrochureItineraryDays({
      itinerary_days: [{ label: 'Day 1', description: 'Arrival' }],
      plan_de_vol: 'Day 1: Legacy content',
    })).toEqual([{ label: 'Day 1', description: 'Arrival' }]);

    expect(getBrochureItineraryDays({
      plan_de_vol: 'Day 1: Arrival\nDay 2: Guided visit',
    })).toEqual([
      { label: 'Day 1', description: 'Arrival' },
      { label: 'Day 2', description: 'Guided visit' },
    ]);
  });
});

describe('getBrochureTravelDatePricing', () => {
  it('combines date-level rates with custom child and infant hotel rates', () => {
    const pricing = getBrochureTravelDatePricing(
      { id: 'date-1', prix_single: 1000 },
      [
        {
          travel_date_id: 'date-1',
          is_primary: true,
          prix_double: 2000,
          prix_triple: 3000,
          custom_prices: [
            { name: 'Child', price: 500 },
            { name: 'Infant', amount: 0 },
          ],
        },
        {
          travel_date_id: 'date-1',
          is_primary: false,
          custom_prices: [{ name: 'Optional upgrade', price: 800 }],
        },
      ]
    );

    expect(pricing).toEqual({
      standardRates: [
        { label: 'Single', value: 1000 },
        { label: 'Double', value: 2000 },
        { label: 'Triple', value: 3000 },
      ],
      customPrices: [
        { name: 'Child', value: 500 },
        { name: 'Infant', value: 0 },
      ],
    });
  });
});
