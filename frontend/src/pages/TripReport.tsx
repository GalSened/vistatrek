/**
 * Trip Report Page
 * Generates comprehensive trip report similar to Montenegro reference guide
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tripApi, reportApi } from '../api';
import {
  Trip,
  TripReport as TripReportType,
  WeatherForecast,
  HotelRecommendation,
  RestaurantRecommendation,
  BudgetBreakdown,
  PracticalInfo,
  Stop,
} from '../types';
import { useUser } from '../context/UserContext';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import TripMap from '../components/map/TripMap';
import './TripReport.css';

type LoadingStep = 'trip' | 'weather' | 'hotels' | 'restaurants' | 'done';

// Weather icon mapping
const weatherIcons: Record<string, string> = {
  sunny: '\u2600\ufe0f',
  partly_cloudy: '\u26c5',
  cloudy: '\u2601\ufe0f',
  rainy: '\ud83c\udf27\ufe0f',
  stormy: '\u26c8\ufe0f',
  snowy: '\u2744\ufe0f',
};

// Generate mock data for demo purposes (until backend is ready)
function generateMockReport(trip: Trip): TripReportType {
  const tripDate = new Date(trip.date);

  // Mock weather for trip dates
  const weather: WeatherForecast[] = [];
  for (let i = 0; i < 3; i++) {
    const date = new Date(tripDate);
    date.setDate(date.getDate() + i);
    weather.push({
      date: date.toISOString().split('T')[0],
      high: 22 + Math.floor(Math.random() * 8),
      low: 14 + Math.floor(Math.random() * 6),
      condition: ['sunny', 'partly_cloudy', 'cloudy'][Math.floor(Math.random() * 3)] as 'sunny' | 'partly_cloudy' | 'cloudy',
      precipitation: Math.floor(Math.random() * 30),
      icon: 'sunny',
    });
  }

  // Mock hotels
  const hotels: HotelRecommendation[] = [
    {
      id: 'hotel-1',
      name: 'Mountain View Lodge',
      location: trip.start_location,
      rating: 4.5,
      pricePerNight: 150,
      currency: 'USD',
      amenities: ['WiFi', 'Parking', 'Pool', 'Restaurant'],
      address: '123 Mountain Road',
    },
    {
      id: 'hotel-2',
      name: 'Valley Inn',
      location: trip.end_location,
      rating: 4.2,
      pricePerNight: 120,
      currency: 'USD',
      amenities: ['WiFi', 'Parking', 'Breakfast'],
      address: '456 Valley Street',
    },
  ];

  // Mock restaurants
  const restaurants: RestaurantRecommendation[] = [
    {
      id: 'rest-1',
      name: 'The Local Kitchen',
      location: trip.start_location,
      rating: 4.6,
      priceLevel: 2,
      cuisine: ['Local', 'Mediterranean'],
      specialty: 'Farm-to-table fresh dishes',
      hours: '11:00 - 22:00',
    },
    {
      id: 'rest-2',
      name: 'Hilltop Cafe',
      location: trip.end_location,
      rating: 4.4,
      priceLevel: 1,
      cuisine: ['Coffee', 'Brunch'],
      specialty: 'Homemade pastries',
      hours: '07:00 - 18:00',
    },
  ];

  // Mock budget
  const budget: BudgetBreakdown = {
    accommodation: 270,
    food: 150,
    transportation: 80,
    activities: 100,
    misc: 50,
    total: 650,
    currency: 'USD',
    perDay: [
      { day: 1, date: trip.date, accommodation: 150, food: 50, activities: 50, transportation: 40, total: 290 },
      { day: 2, date: trip.date, accommodation: 120, food: 50, activities: 50, transportation: 20, total: 240 },
      { day: 3, date: trip.date, accommodation: 0, food: 50, activities: 0, transportation: 20, total: 70 },
    ],
  };

  // Mock practical info
  const practicalInfo: PracticalInfo = {
    packingList: [
      { item: 'Hiking boots', category: 'gear', essential: true },
      { item: 'Rain jacket', category: 'clothing', essential: true },
      { item: 'Sunscreen', category: 'toiletries', essential: true },
      { item: 'Camera', category: 'electronics', essential: false },
      { item: 'Passport', category: 'documents', essential: true },
      { item: 'Water bottle', category: 'gear', essential: true },
      { item: 'Comfortable shoes', category: 'clothing', essential: true },
      { item: 'Power bank', category: 'electronics', essential: false },
    ],
    emergencyContacts: [
      { name: 'Emergency Services', number: '911', type: 'police' },
      { name: 'Local Hospital', number: '+1-555-0123', type: 'ambulance' },
    ],
    tips: [
      'Best time to visit viewpoints is during golden hour',
      'Book restaurants in advance on weekends',
      'Keep cash for small vendors',
    ],
    currency: 'USD',
    timezone: 'America/Los_Angeles',
  };

  return {
    trip,
    hotels,
    restaurants,
    weather,
    budget,
    practicalInfo,
    generatedAt: new Date().toISOString(),
  };
}

// Price level display
function PriceLevel({ level }: { level: 1 | 2 | 3 | 4 }) {
  return (
    <span className="price-level">
      {'$'.repeat(level)}
      <span style={{ opacity: 0.3 }}>{'$'.repeat(4 - level)}</span>
    </span>
  );
}

// Star rating display
function StarRating({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  return (
    <span className="place-rating">
      {'\u2b50'.repeat(fullStars)}
      {hasHalf && '\u2b50'}
      <span style={{ marginLeft: '4px', color: 'var(--text-secondary)' }}>{rating.toFixed(1)}</span>
    </span>
  );
}

export default function TripReport() {
  const navigate = useNavigate();
  const { tripId } = useParams();
  const { t } = useTranslation();
  const { profile } = useUser();

  const [report, setReport] = useState<TripReportType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('trip');
  const [error, setError] = useState<string | null>(null);

  // Load trip and generate report
  useEffect(() => {
    const loadReport = async () => {
      if (!tripId) {
        setError(t('planner.noTripSelected'));
        setIsLoading(false);
        return;
      }

      try {
        // Step 1: Load trip
        setLoadingStep('trip');
        const loadedTrip = await tripApi.get(tripId);

        // Step 2: Try to generate report from API, fallback to mock
        setLoadingStep('weather');
        await new Promise((r) => setTimeout(r, 500)); // Brief pause for UX

        setLoadingStep('hotels');
        await new Promise((r) => setTimeout(r, 500));

        setLoadingStep('restaurants');
        await new Promise((r) => setTimeout(r, 500));

        // Try real API first, fall back to mock
        try {
          const reportData = await reportApi.generate(tripId);
          setReport(reportData);
        } catch {
          // Backend not ready yet, use mock data
          const mockReport = generateMockReport(loadedTrip);
          setReport(mockReport);
        }

        setLoadingStep('done');
      } catch (err) {
        console.error('Failed to load report:', err);
        setError(t('planner.failedToLoad'));
      } finally {
        setIsLoading(false);
      }
    };

    loadReport();
  }, [tripId, t]);

  // Export as HTML
  const handleExport = useCallback(() => {
    if (!report) return;

    // Get the report content
    const reportElement = document.querySelector('.report-content');
    if (!reportElement) return;

    // Create standalone HTML
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.trip.name} - Trip Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
      background: #f5f5f5;
      color: #333;
      padding: 20px;
      max-width: 900px;
      margin: 0 auto;
    }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 20px; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #eee; }
    h3 { font-size: 16px; color: #666; }
    .overview { background: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .section { background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .stats { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 16px; }
    .stat { background: #f8f8f8; padding: 12px 16px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; }
    .stat-label { font-size: 12px; color: #666; }
    .stop { display: flex; gap: 12px; padding: 12px; background: #f8f8f8; border-radius: 8px; margin-bottom: 8px; }
    .stop-num { width: 28px; height: 28px; background: #ff375f; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
    .weather-grid { display: flex; gap: 12px; flex-wrap: wrap; }
    .weather-day { background: #f8f8f8; padding: 16px; border-radius: 8px; text-align: center; min-width: 80px; }
    .place { background: #f8f8f8; padding: 16px; border-radius: 8px; margin-bottom: 12px; }
    .coords { font-family: monospace; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="overview">
    <h1>${report.trip.name}</h1>
    <p style="color: #666">${report.trip.date}</p>
    <div class="stats">
      <div class="stat"><div class="stat-value">${report.trip.stops.length}</div><div class="stat-label">Stops</div></div>
      <div class="stat"><div class="stat-value">${(report.trip.route.distance_meters / 1000).toFixed(0)}</div><div class="stat-label">km</div></div>
      <div class="stat"><div class="stat-value">${Math.round(report.trip.route.duration_seconds / 60)}</div><div class="stat-label">min drive</div></div>
    </div>
  </div>

  <div class="section">
    <h2>\ud83d\uddfa\ufe0f Itinerary</h2>
    ${report.trip.stops.map((stop, i) => `
      <div class="stop">
        <div class="stop-num">${i + 1}</div>
        <div>
          <strong>${stop.name}</strong> <span style="color: #30d158; font-size: 12px">${stop.type}</span>
          <div style="font-size: 14px; color: #666">${stop.duration_minutes} min</div>
          <div class="coords">${stop.coordinates.lat.toFixed(5)}, ${stop.coordinates.lon.toFixed(5)}</div>
        </div>
      </div>
    `).join('')}
  </div>

  <div class="section">
    <h2>\u2600\ufe0f Weather</h2>
    <div class="weather-grid">
      ${report.weather.map((day) => `
        <div class="weather-day">
          <div style="font-size: 12px; color: #888">${day.date}</div>
          <div style="font-size: 28px">${weatherIcons[day.condition] || '\u2600\ufe0f'}</div>
          <div><strong>${day.high}\u00b0</strong> / ${day.low}\u00b0</div>
        </div>
      `).join('')}
    </div>
  </div>

  <div class="section">
    <h2>\ud83c\udfe8 Hotels</h2>
    ${report.hotels.map((hotel) => `
      <div class="place">
        <strong>${hotel.name}</strong> \u2b50 ${hotel.rating}
        <div style="color: #666">$${hotel.pricePerNight}/night</div>
        <div style="font-size: 12px; color: #888">${hotel.amenities.join(' \u2022 ')}</div>
      </div>
    `).join('')}
  </div>

  <div class="section">
    <h2>\ud83c\udf7d\ufe0f Restaurants</h2>
    ${report.restaurants.map((rest) => `
      <div class="place">
        <strong>${rest.name}</strong> \u2b50 ${rest.rating}
        <div style="color: #666">${rest.cuisine.join(', ')}</div>
        ${rest.specialty ? `<div style="font-size: 12px; color: #30d158">${rest.specialty}</div>` : ''}
      </div>
    `).join('')}
  </div>

  <div class="section">
    <h2>\ud83d\udcb0 Budget</h2>
    <div style="font-size: 32px; font-weight: 700; color: #30d158; margin-bottom: 16px">
      $${report.budget.total} <span style="font-size: 14px; color: #888">${report.budget.currency}</span>
    </div>
    <div style="display: flex; gap: 12px; flex-wrap: wrap">
      <div class="stat"><div class="stat-value">$${report.budget.accommodation}</div><div class="stat-label">Accommodation</div></div>
      <div class="stat"><div class="stat-value">$${report.budget.food}</div><div class="stat-label">Food</div></div>
      <div class="stat"><div class="stat-value">$${report.budget.transportation}</div><div class="stat-label">Transport</div></div>
      <div class="stat"><div class="stat-value">$${report.budget.activities}</div><div class="stat-label">Activities</div></div>
    </div>
  </div>

  <div class="section">
    <h2>\ud83c\udfaf Tips</h2>
    <ul>
      ${report.practicalInfo.tips.map((tip) => `<li>${tip}</li>`).join('')}
    </ul>
  </div>

  <footer style="text-align: center; padding: 20px; color: #888; font-size: 12px">
    Generated by VistaTrek on ${new Date().toLocaleDateString()}
  </footer>
</body>
</html>`;

    // Download file
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.trip.name.replace(/\s+/g, '-')}-report.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [report]);

  // Print report
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Open navigation
  const openNavigation = useCallback(
    (stop: Stop) => {
      const { lat, lon } = stop.coordinates;
      const navApp = profile.preferred_nav_app || 'waze';

      let url: string;
      switch (navApp) {
        case 'waze':
          url = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
          break;
        case 'google':
          url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
          break;
        case 'apple':
          url = `http://maps.apple.com/?daddr=${lat},${lon}`;
          break;
        default:
          url = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
      }

      window.open(url, '_blank');
    },
    [profile.preferred_nav_app]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="report-page loading">
        <div className="report-loading">
          <LoadingSpinner message={t('report.generating')} />
          <div className="progress-steps">
            <div className={`step ${loadingStep === 'trip' ? 'active' : 'done'}`}>
              <span className="step-icon">{loadingStep === 'trip' ? '\u23f3' : '\u2705'}</span>
              {t('report.loadingTrip')}
            </div>
            <div className={`step ${loadingStep === 'weather' ? 'active' : ['hotels', 'restaurants', 'done'].includes(loadingStep) ? 'done' : ''}`}>
              <span className="step-icon">{loadingStep === 'weather' ? '\u23f3' : ['hotels', 'restaurants', 'done'].includes(loadingStep) ? '\u2705' : '\u23f8\ufe0f'}</span>
              {t('report.fetchingWeather')}
            </div>
            <div className={`step ${loadingStep === 'hotels' ? 'active' : ['restaurants', 'done'].includes(loadingStep) ? 'done' : ''}`}>
              <span className="step-icon">{loadingStep === 'hotels' ? '\u23f3' : ['restaurants', 'done'].includes(loadingStep) ? '\u2705' : '\u23f8\ufe0f'}</span>
              {t('report.findingHotels')}
            </div>
            <div className={`step ${loadingStep === 'restaurants' ? 'active' : loadingStep === 'done' ? 'done' : ''}`}>
              <span className="step-icon">{loadingStep === 'restaurants' ? '\u23f3' : loadingStep === 'done' ? '\u2705' : '\u23f8\ufe0f'}</span>
              {t('report.findingRestaurants')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !report) {
    return (
      <div className="report-page">
        <div className="report-error">
          <p>{error || t('report.failedToGenerate')}</p>
          <button className="retry-btn" onClick={() => navigate(-1)}>
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="report-page">
      {/* Header */}
      <header className="report-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          \u2190 {t('common.back')}
        </button>
        <h1>{t('report.title')}</h1>
        <div className="actions">
          <button className="action-btn" onClick={handlePrint}>
            \ud83d\udda8\ufe0f {t('report.print')}
          </button>
          <button className="action-btn primary" onClick={handleExport}>
            \ud83d\udce4 {t('report.exportHTML')}
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="report-content">
        {/* Overview Card */}
        <div className="report-overview">
          <h1 className="trip-title">{report.trip.name}</h1>
          <p className="trip-date">{report.trip.date}</p>
          <div className="trip-stats">
            <div className="stat">
              <span className="stat-value">{report.trip.stops.length}</span>
              <span className="stat-label">{t('report.stops')}</span>
            </div>
            <div className="stat">
              <span className="stat-value">{(report.trip.route.distance_meters / 1000).toFixed(0)}</span>
              <span className="stat-label">{t('common.km')}</span>
            </div>
            <div className="stat">
              <span className="stat-value">{Math.round(report.trip.route.duration_seconds / 60)}</span>
              <span className="stat-label">{t('report.minDrive')}</span>
            </div>
            {report.weather.length > 0 && (
              <div className="stat">
                <span className="stat-value">{report.weather[0].high}\u00b0</span>
                <span className="stat-label">{t('report.weather')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Table of Contents */}
        <nav className="report-toc">
          <h2>{t('report.tableOfContents')}</h2>
          <ul>
            <li><a href="#itinerary">{t('report.itinerary')}</a></li>
            <li><a href="#map">{t('report.map')}</a></li>
            <li><a href="#weather">{t('report.weather')}</a></li>
            <li><a href="#hotels">{t('report.hotels')}</a></li>
            <li><a href="#restaurants">{t('report.restaurants')}</a></li>
            <li><a href="#budget">{t('report.budget')}</a></li>
            <li><a href="#packing">{t('report.packingList')}</a></li>
            <li><a href="#emergency">{t('report.emergency')}</a></li>
          </ul>
        </nav>

        {/* Itinerary Section */}
        <section className="report-section" id="itinerary">
          <h2><span className="icon">\ud83d\uddfa\ufe0f</span> {t('report.itinerary')}</h2>
          <div className="day-section">
            <h3>{t('report.day', { number: 1 })} <span className="date">{report.trip.date}</span></h3>
            {report.trip.stops.map((stop, index) => (
              <div className="stop-card" key={stop.id}>
                <span className="stop-number">{index + 1}</span>
                <div className="stop-info">
                  <span className="stop-name">{stop.name}</span>
                  <span className="stop-type">{stop.type}</span>
                  <div className="stop-time">
                    {stop.planned_arrival && new Date(stop.planned_arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <span className="stop-duration">{stop.duration_minutes} min</span>
                  </div>
                  <div className="stop-coords">
                    {stop.coordinates.lat.toFixed(5)}, {stop.coordinates.lon.toFixed(5)}
                  </div>
                </div>
                <button className="nav-link" onClick={() => openNavigation(stop)}>
                  {t('report.navigate')} \u2192
                </button>
              </div>
            ))}
            {report.trip.stops.length === 0 && (
              <p style={{ color: 'var(--text-tertiary)' }}>{t('report.noStops')}</p>
            )}
          </div>
        </section>

        {/* Map Section */}
        <section className="report-section" id="map">
          <h2><span className="icon">\ud83d\uddfa\ufe0f</span> {t('report.map')}</h2>
          <div className="report-map">
            <TripMap
              route={report.trip.route}
              stops={report.trip.stops}
              startLocation={report.trip.start_location}
              endLocation={report.trip.end_location}
            />
          </div>
        </section>

        {/* Weather Section */}
        {report.weather.length > 0 && (
          <section className="report-section" id="weather">
            <h2><span className="icon">\u2600\ufe0f</span> {t('report.weather')}</h2>
            <div className="weather-grid">
              {report.weather.map((day) => (
                <div className="weather-day" key={day.date}>
                  <div className="day-label">{new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}</div>
                  <div className="weather-icon">{weatherIcons[day.condition] || '\u2600\ufe0f'}</div>
                  <div className="temps">
                    <span className="temp-high">{day.high}\u00b0</span>
                    <span className="temp-low">{day.low}\u00b0</span>
                  </div>
                  {day.precipitation > 0 && (
                    <div className="precipitation">\ud83d\udca7 {day.precipitation}%</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Hotels Section */}
        {report.hotels.length > 0 && (
          <section className="report-section" id="hotels">
            <h2><span className="icon">\ud83c\udfe8</span> {t('report.hotels')}</h2>
            <div className="place-grid">
              {report.hotels.map((hotel) => (
                <div className="place-card" key={hotel.id}>
                  <div className="place-image">\ud83c\udfe8</div>
                  <div className="place-content">
                    <h3 className="place-name">{hotel.name}</h3>
                    <StarRating rating={hotel.rating} />
                    <div className="place-price">
                      ${hotel.pricePerNight} {t('report.perNight')}
                    </div>
                    <div className="place-tags">
                      {hotel.amenities.slice(0, 4).map((amenity) => (
                        <span className="tag" key={amenity}>{amenity}</span>
                      ))}
                    </div>
                    <div className="place-actions">
                      {hotel.bookingUrl && (
                        <a href={hotel.bookingUrl} target="_blank" rel="noopener noreferrer" className="place-btn primary">
                          {t('report.bookNow')}
                        </a>
                      )}
                      <button className="place-btn">{t('report.viewOnMap')}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Restaurants Section */}
        {report.restaurants.length > 0 && (
          <section className="report-section" id="restaurants">
            <h2><span className="icon">\ud83c\udf7d\ufe0f</span> {t('report.restaurants')}</h2>
            <div className="place-grid">
              {report.restaurants.map((restaurant) => (
                <div className="place-card" key={restaurant.id}>
                  <div className="place-image">\ud83c\udf7d\ufe0f</div>
                  <div className="place-content">
                    <h3 className="place-name">{restaurant.name}</h3>
                    <StarRating rating={restaurant.rating} />
                    <div className="place-price">
                      <PriceLevel level={restaurant.priceLevel} />
                    </div>
                    <div className="place-tags">
                      {restaurant.cuisine.map((c) => (
                        <span className="tag" key={c}>{c}</span>
                      ))}
                    </div>
                    {restaurant.specialty && (
                      <p style={{ fontSize: '13px', color: 'var(--accent-secondary)', marginBottom: 'var(--space-2)' }}>
                        \u2728 {restaurant.specialty}
                      </p>
                    )}
                    <div className="place-actions">
                      {restaurant.reservationUrl && (
                        <a href={restaurant.reservationUrl} target="_blank" rel="noopener noreferrer" className="place-btn primary">
                          {t('report.reserve')}
                        </a>
                      )}
                      <button className="place-btn">{t('report.viewOnMap')}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Budget Section */}
        <section className="report-section" id="budget">
          <h2><span className="icon">\ud83d\udcb0</span> {t('report.budget')}</h2>
          <div className="budget-total">
            <span className="amount">${report.budget.total}</span>
            <span className="currency">{report.budget.currency}</span>
          </div>
          <div className="budget-breakdown">
            <div className="budget-item">
              <div className="category">{t('report.accommodation')}</div>
              <div className="amount">${report.budget.accommodation}</div>
            </div>
            <div className="budget-item">
              <div className="category">{t('report.food')}</div>
              <div className="amount">${report.budget.food}</div>
            </div>
            <div className="budget-item">
              <div className="category">{t('report.transportation')}</div>
              <div className="amount">${report.budget.transportation}</div>
            </div>
            <div className="budget-item">
              <div className="category">{t('report.activities')}</div>
              <div className="amount">${report.budget.activities}</div>
            </div>
          </div>
        </section>

        {/* Packing List Section */}
        {report.practicalInfo.packingList.length > 0 && (
          <section className="report-section" id="packing">
            <h2><span className="icon">\ud83c\udfaf</span> {t('report.packingList')}</h2>
            {['gear', 'clothing', 'documents', 'toiletries', 'electronics', 'other'].map((category) => {
              const items = report.practicalInfo.packingList.filter((i) => i.category === category);
              if (items.length === 0) return null;
              return (
                <div className="packing-category" key={category}>
                  <h4>{t(`report.${category}`)}</h4>
                  <div className="packing-items">
                    {items.map((item) => (
                      <div className={`packing-item ${item.essential ? 'essential' : ''}`} key={item.item}>
                        {item.item}
                        {item.essential && <span className="essential-badge">*</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Emergency Contacts Section */}
        {report.practicalInfo.emergencyContacts.length > 0 && (
          <section className="report-section" id="emergency">
            <h2><span className="icon">\ud83d\udea8</span> {t('report.emergency')}</h2>
            <div className="emergency-grid">
              {report.practicalInfo.emergencyContacts.map((contact, i) => (
                <div className="emergency-card" key={i}>
                  <div className="type">{t(`report.${contact.type}`)}</div>
                  <div className="name">{contact.name}</div>
                  <a href={`tel:${contact.number}`} className="number">{contact.number}</a>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tips Section */}
        {report.practicalInfo.tips.length > 0 && (
          <section className="report-section" id="tips">
            <h2><span className="icon">\ud83d\udca1</span> {t('report.tips')}</h2>
            <ul style={{ paddingLeft: 'var(--space-5)', color: 'var(--text-secondary)' }}>
              {report.practicalInfo.tips.map((tip, i) => (
                <li key={i} style={{ marginBottom: 'var(--space-2)' }}>{tip}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer */}
        <footer style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-tertiary)', fontSize: '12px' }}>
          {t('report.generatedBy')} VistaTrek \u2022 {new Date(report.generatedAt).toLocaleString()}
        </footer>
      </div>
    </div>
  );
}
