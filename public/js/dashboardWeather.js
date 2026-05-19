/**
 * @file dashboardWeather.js
 * @description Fetches current conditions and a 3-day forecast for Albany, NY
 * from the Open-Meteo API and renders a frosted-glass widget.
 *
 * Open-Meteo is free, no API key required, CORS-enabled.
 * @see https://open-meteo.com/en/docs
 */

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────

const WIDGET_ID = "dbWeatherWidget";
const CITY = "Albany, NY";
const LAT = 42.6526;
const LON = -73.7562;

const API_URL =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${LAT}&longitude=${LON}` +
  `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
  `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
  `&temperature_unit=fahrenheit` +
  `&wind_speed_unit=mph` +
  `&timezone=America%2FNew_York` +
  `&forecast_days=3`;

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/**
 * Map a WMO weather code to a Font Awesome icon class and short label.
 *
 * @param {number} code
 * @returns {{ icon: string, label: string }}
 */
function _wmoToIcon(code) {
  if (code === 0) return { icon: "fa-sun", label: "Clear" };
  if (code === 1) return { icon: "fa-sun", label: "Mostly clear" };
  if (code === 2) return { icon: "fa-cloud-sun", label: "Partly cloudy" };
  if (code === 3) return { icon: "fa-cloud", label: "Overcast" };
  if (code === 45 || code === 48) return { icon: "fa-smog", label: "Fog" };
  if (code >= 51 && code <= 55)
    return { icon: "fa-cloud-drizzle", label: "Drizzle" };
  if (code >= 61 && code <= 65) return { icon: "fa-cloud-rain", label: "Rain" };
  if (code >= 71 && code <= 77) return { icon: "fa-snowflake", label: "Snow" };
  if (code >= 80 && code <= 82)
    return { icon: "fa-cloud-showers-heavy", label: "Showers" };
  if (code === 85 || code === 86)
    return { icon: "fa-snowflake", label: "Snow showers" };
  if (code === 95) return { icon: "fa-bolt", label: "Storms" };
  if (code === 96 || code === 99)
    return { icon: "fa-cloud-bolt", label: "Severe storm" };
  return { icon: "fa-cloud", label: "Unknown" };
}

/**
 * Format a YYYY-MM-DD date string into a short day label.
 * Returns "Today", "Tomorrow", or the abbreviated weekday name.
 *
 * @param {string} dateStr - e.g. "2026-07-03"
 * @param {number} index   - 0 = today, 1 = tomorrow, 2+ = weekday
 * @returns {string}
 */
function _dayLabel(dateStr, index) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
  });
}

// ─────────────────────────────────────────────
//  Render
// ─────────────────────────────────────────────

/**
 * Render the full weather widget into the container element.
 *
 * @param {HTMLElement} el
 * @param {object}      current - Open-Meteo current weather block.
 * @param {object}      daily   - Open-Meteo daily weather block.
 * @returns {void}
 */
function _render(el, current, daily) {
  const currIcon = _wmoToIcon(current.weather_code);
  const currTemp = Math.round(current.temperature_2m);
  const feels = Math.round(current.apparent_temperature);
  const wind = Math.round(current.wind_speed_10m);

  const dayCards = daily.time
    .map((dateStr, i) => {
      const { icon, label } = _wmoToIcon(daily.weather_code[i]);
      const hi = Math.round(daily.temperature_2m_max[i]);
      const lo = Math.round(daily.temperature_2m_min[i]);
      const lbl = _dayLabel(dateStr, i);

      return `
      <div class="db-wx-day">
        <span class="db-wx-day-label">${lbl}</span>
        <i class="fa-solid ${icon} db-wx-day-icon" title="${label}"></i>
        <span class="db-wx-day-hi">${hi}°</span>
        <span class="db-wx-day-lo">${lo}°</span>
      </div>`;
    })
    .join("");

  el.innerHTML = `
    <div class="db-weather-inner">
      <div class="db-wx-current">
        <div class="db-wx-city">
          <i class="fa-solid fa-location-dot fa-xs me-1"></i>${CITY}
        </div>
        <div class="db-wx-now">
          <i class="fa-solid ${currIcon.icon} db-weather-icon"></i>
          <span class="db-weather-temp">${currTemp}°F</span>
          <span class="db-wx-desc">${currIcon.label}</span>
        </div>
        <div class="db-wx-meta">
          Feels ${feels}° &nbsp;&middot;&nbsp;
          <i class="fa-solid fa-wind fa-xs"></i> ${wind} mph
        </div>
      </div>
      <div class="db-wx-divider"></div>
      <div class="db-wx-forecast">
        ${dayCards}
      </div>
    </div>`;
}

/**
 * Render an error state into the widget container.
 *
 * @param {HTMLElement} el
 * @returns {void}
 */
function _renderError(el) {
  el.innerHTML = `
    <div class="db-weather-error">
      <i class="fa-solid fa-triangle-exclamation me-1"></i>
      Weather unavailable
    </div>`;
}

// ─────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────

/**
 * Fetch weather data and update the widget.
 *
 * @returns {Promise<void>}
 */
async function init() {
  const el = document.getElementById(WIDGET_ID);
  if (!el) return;

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _render(el, data.current, data.daily);
  } catch (err) {
    console.warn("[weather] fetch failed:", err);
    _renderError(el);
  }
}

init();
