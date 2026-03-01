'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import ImageGallery from './ImageGallery';

interface Map3DViewerProps {
  initialAddress?: string;
  initialPhotos?: string[];
}

export default function Map3DViewer({ initialAddress = '', initialPhotos = [] }: Map3DViewerProps) {
  const router = useRouter();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [currentAddress, setCurrentAddress] = useState<string>('');

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [narrateStatus, setNarrateStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [scriptPreview, setScriptPreview] = useState<string>('');

  // Dispatch images to AMD cloud for 3D processing on page load
  useEffect(() => {
    if (!initialPhotos || initialPhotos.length === 0) return;

    fetch('/api/tour/dispatch-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_urls: initialPhotos,
        address: initialAddress,
      }),
    })
      .then((r) => r.json())
      .then((d) => console.log('[dispatch]', d))
      .catch((e) => console.warn('[dispatch] failed:', e));
  }, [initialPhotos, initialAddress]);

  // Start narration generation immediately so audio is ready while user browses
  useEffect(() => {
    if (!initialPhotos || initialPhotos.length === 0) return;

    setNarrateStatus('loading');
    console.log('[narrate] Pre-generating narration...');

    fetch('/api/tour/narrate', { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Narrate API returned ${res.status}`);
        setScriptPreview(res.headers.get('X-Script-Preview') || '');
        const blob = await res.blob();
        setAudioUrl(URL.createObjectURL(blob));
        setNarrateStatus('ready');
        console.log('[narrate] Audio ready');
      })
      .catch((e) => {
        console.warn('[narrate] Pre-generation failed:', e);
        setNarrateStatus('error');
      });
  }, [initialPhotos]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Inject the exact Google Maps bootstrap loader from old_earth_view.txt
    // This is the only way to get the alpha Maps 3D API
    const script = document.createElement('script');
    script.textContent = `
      (function(g) {
        var h, a, k, p = "The Google Maps JavaScript API",
          c = "google", l = "importLibrary", q = "__ib__",
          m = document, b = window;
        b = b[c] || (b[c] = {});
        var d = b.maps || (b.maps = {}),
          r = new Set, e = new URLSearchParams,
          u = function() { return h || (h = new Promise(function(f, n) {
            a = m.createElement("script");
            e.set("libraries", Array.from(r).join(","));
            for (k in g) e.set(k.replace(/[A-Z]/g, function(t) { return "_" + t[0].toLowerCase(); }), g[k]);
            e.set("callback", c + ".maps." + q);
            a.src = "https://maps." + c + "apis.com/maps/api/js?" + e;
            d[q] = f;
            a.onerror = function() { h = n(Error(p + " could not load.")); };
            a.nonce = (m.querySelector("script[nonce]") || {}).nonce || "";
            m.head.append(a);
          })); };
        d[l] ? console.warn(p + " only loads once. Ignoring:", g)
          : d[l] = function(f) { var n = Array.prototype.slice.call(arguments, 1); r.add(f); return u().then(function() { return d[l].apply(d, [f].concat(n)); }); };
      })({
        key: "` + apiKey + `",
        v: "alpha"
      });
    `;
    document.head.appendChild(script);

    // Now inject the entire application logic as a single script,
    // exactly mirroring old_earth_view.txt
    const appScript = document.createElement('script');
    appScript.textContent = `
      (function() {
        var map3D = null;
        var geocoder = null;
        var currentLat = 0;
        var currentLng = 0;
        var orbitInterval = null;
        var currentHeading = 0;
        var currentView = 'street';

        var statusDiv = document.getElementById('ev-status');
        var addressDisplayDiv = document.getElementById('ev-addressDisplay');

        var viewPresets = {
          street: { altitude: 30, range: 150, tilt: 75 },
          close:  { altitude: 20, range: 60,  tilt: 78 },
          aerial: { altitude: 400, range: 1000, tilt: 60 }
        };

        async function init() {
          var geocodingLib = await google.maps.importLibrary('geocoding');
          var maps3dLib    = await google.maps.importLibrary('maps3d');
          await google.maps.importLibrary('streetView');
          await google.maps.importLibrary('geometry');

          geocoder = new geocodingLib.Geocoder();
          window._MapMode = maps3dLib.MapMode;
          window._Map3DElement = maps3dLib.Map3DElement;

          // If initialAddress was set in input, search it automatically
          var addressInput = document.getElementById('ev-address');
          if (addressInput && addressInput.value.trim()) {
            searchAddress();
          }
        }

        async function searchAddress() {
          if (!geocoder) {
            statusDiv.innerHTML = '<div style="text-align:center;font-size:14px;opacity:0.6;margin-top:12px;">Loading API...</div>';
            return;
          }

          var address = document.getElementById('ev-address').value.trim();
          if (!address) {
            statusDiv.innerHTML = '<div style="background:#d32f2f;padding:12px;border-radius:6px;margin-top:12px;font-size:12px;border-left:4px solid #ff6b6b;">Please enter an address</div>';
            return;
          }

          statusDiv.innerHTML = '<div style="text-align:center;font-size:14px;opacity:0.6;margin-top:12px;">Searching...</div>';
          addressDisplayDiv.innerHTML = '';
          stopOrbit();

          try {
            var response = await geocoder.geocode({ address: address });

            if (!response.results || response.results.length === 0) {
              throw new Error('Address not found.');
            }

            var location = response.results[0];
            currentLat = location.geometry.location.lat();
            currentLng = location.geometry.location.lng();
            var formattedAddress = location.formatted_address;

            addressDisplayDiv.innerHTML =
              '<div style="background:rgba(33,150,243,0.1);border:1px solid rgba(33,150,243,0.3);padding:12px;border-radius:6px;margin-top:12px;font-size:12px;line-height:1.5;">' +
              '<strong>Found:</strong><br>' + formattedAddress + '</div>';

            statusDiv.innerHTML = '<div style="text-align:center;font-size:14px;opacity:0.6;margin-top:12px;">Finding street direction...</div>';
            currentHeading = await getStreetHeading(currentLat, currentLng);
            load3DMap(currentLat, currentLng, formattedAddress);

            // Trigger image scraping
            window.evScrapeImages?.(formattedAddress);

          } catch (error) {
            statusDiv.innerHTML = '<div style="background:#d32f2f;padding:12px;border-radius:6px;margin-top:12px;font-size:12px;border-left:4px solid #ff6b6b;">' + error.message + '</div>';
            console.error('Search error:', error);
          }
        }

        async function getStreetHeading(lat, lng) {
          var sv = new google.maps.StreetViewService();
          var targetLatLng = new google.maps.LatLng(lat, lng);

          return new Promise(function(resolve) {
            sv.getPanorama(
              {
                location: targetLatLng,
                radius: 200,
                preference: google.maps.StreetViewPreference.NEAREST,
                source: google.maps.StreetViewSource.OUTDOOR,
              },
              function(data, status) {
                if (status !== 'OK' || !data || !data.location || !data.location.latLng) {
                  console.log('No street view panorama found, defaulting heading to 0');
                  resolve(0);
                  return;
                }

                var streetLatLng = data.location.latLng;
                var heading = google.maps.geometry.spherical.computeHeading(
                  streetLatLng, targetLatLng
                );
                var normalized = (heading + 360) % 360;
                console.log('Street panorama at ' + streetLatLng.lat().toFixed(5) + ', ' +
                  streetLatLng.lng().toFixed(5) + '. Heading to house: ' + normalized.toFixed(1) + '°');
                resolve(normalized);
              }
            );
          });
        }

        function load3DMap(lat, lng, address) {
          try {
            var Map3DElement = window._Map3DElement;
            var MapMode = window._MapMode;

            if (map3D && map3D.parentNode) {
              map3D.parentNode.removeChild(map3D);
              map3D = null;
            }

            var preset = viewPresets[currentView] || viewPresets.street;

            map3D = new Map3DElement({
              center: { lat: lat, lng: lng, altitude: preset.altitude },
              range: preset.range,
              tilt: preset.tilt,
              heading: currentHeading,
              mode: MapMode.SATELLITE,
            });

            var container = document.getElementById('ev-map-container');
            container.innerHTML = '';
            container.appendChild(map3D);

            statusDiv.innerHTML = '<div style="background:#388e3c;padding:12px;border-radius:6px;margin-top:12px;font-size:12px;border-left:4px solid #66bb6a;">Loaded (heading: ' + currentHeading.toFixed(0) + '°)</div>';

          } catch (error) {
            statusDiv.innerHTML = '<div style="background:#d32f2f;padding:12px;border-radius:6px;margin-top:12px;font-size:12px;border-left:4px solid #ff6b6b;">Error: ' + error.message + '</div>';
            console.error('Map error:', error);
          }
        }

        function setView(viewName) {
          stopOrbit();
          currentView = viewName;

          document.querySelectorAll('[data-ev-view]').forEach(function(btn) {
            if (btn.dataset.evView === viewName) {
              btn.style.background = 'rgba(33,150,243,0.4)';
              btn.style.borderColor = '#2196F3';
            } else {
              btn.style.background = 'rgba(255,255,255,0.1)';
              btn.style.borderColor = 'rgba(255,255,255,0.2)';
            }
          });
          var orbitBtn = document.querySelector('[data-ev-view="orbit"]');
          if (orbitBtn) { orbitBtn.style.background = 'rgba(255,255,255,0.1)'; orbitBtn.style.borderColor = 'rgba(255,255,255,0.2)'; }

          if (!map3D) return;
          var preset = viewPresets[viewName];
          if (!preset) return;
          load3DMap(currentLat, currentLng, '');
        }

        function setHeading(heading) {
          currentHeading = heading;
          if (map3D) {
            map3D.heading = heading;
            statusDiv.innerHTML = '<div style="background:#388e3c;padding:12px;border-radius:6px;margin-top:12px;font-size:12px;border-left:4px solid #66bb6a;">Heading: ' + heading + '°</div>';
          }
        }

        function toggleOrbit() {
          var orbitBtn = document.querySelector('[data-ev-view="orbit"]');
          if (orbitInterval) {
            stopOrbit();
            return;
          }
          if (orbitBtn) { orbitBtn.style.background = 'rgba(33,150,243,0.4)'; orbitBtn.style.borderColor = '#2196F3'; }
          document.querySelectorAll('[data-ev-view]:not([data-ev-view="orbit"])').forEach(function(b) {
            b.style.background = 'rgba(255,255,255,0.1)'; b.style.borderColor = 'rgba(255,255,255,0.2)';
          });

          orbitInterval = setInterval(function() {
            if (!map3D) return;
            currentHeading = (currentHeading + 0.3) % 360;
            map3D.heading = currentHeading;
          }, 16);
        }

        function stopOrbit() {
          if (orbitInterval) {
            clearInterval(orbitInterval);
            orbitInterval = null;
          }
          var orbitBtn = document.querySelector('[data-ev-view="orbit"]');
          if (orbitBtn) { orbitBtn.style.background = 'rgba(255,255,255,0.1)'; orbitBtn.style.borderColor = 'rgba(255,255,255,0.2)'; }
        }

        // Expose to DOM event handlers
        window.evSearchAddress = searchAddress;
        window.evSetView = setView;
        window.evSetHeading = setHeading;
        window.evToggleOrbit = toggleOrbit;

        document.getElementById('ev-address').addEventListener('keypress', function(e) {
          if (e.key === 'Enter') searchAddress();
        });

        init();
      })();
    `;
    // Small delay so DOM elements exist before the script runs
    setTimeout(() => {
      // Set initial address on input if provided
      if (initialAddress) {
        const addressInput = document.getElementById('ev-address') as HTMLInputElement;
        if (addressInput) {
          addressInput.value = initialAddress;
        }
      }
      document.body.appendChild(appScript);
    }, 100);
  }, []);

  return (
    <>
      <style>{`
        gmp-map-3d {
          width: 100%;
          height: 100%;
          display: block;
        }
      `}</style>

      {/* Full-screen 3D map container behind the overlay */}
      <div
        id="ev-map-container"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
        }}
        ref={mapContainerRef}
      />

      {/* Image Gallery on the right */}
      <ImageGallery address={currentAddress} initialPhotos={initialPhotos} />

      {/* Overlay panel — matches old_earth_view.txt layout */}
      <div
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          background: 'rgba(0, 0, 0, 0.85)',
          padding: 20,
          borderRadius: 12,
          backdropFilter: 'blur(10px)',
          zIndex: 10,
          maxWidth: 380,
          color: 'white',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 6,
            color: 'white',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          ← Back to Search
        </button>
        <h1 style={{ fontSize: 20, marginBottom: 8, fontWeight: 700 }}>FlipperZillow</h1>
        <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 12, lineHeight: 1.5 }}>
          AI-Powered House Tours — View any address in full 3D
        </p>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase' as const, opacity: 0.6, marginBottom: 6 }}>
            Property Address
          </label>
          <input
            type="text"
            id="ev-address"
            placeholder="e.g., Santa Clara University, CA"
            defaultValue={initialAddress || "Santa Clara University, Santa Clara, CA"}
            style={{
              width: '100%',
              padding: 12,
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 6,
              color: 'white',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box' as const,
            }}
          />
        </div>

        <button
          onClick={() => (window as any).evSearchAddress?.()}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          View Property
        </button>

        {/* View controls */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' as const }}>
          {(['street', 'close', 'aerial'] as const).map((view) => (
            <button
              key={view}
              data-ev-view={view}
              onClick={() => (window as any).evSetView?.(view)}
              style={{
                flex: 1,
                minWidth: 70,
                padding: '8px 6px',
                background: view === 'street' ? 'rgba(33,150,243,0.4)' : 'rgba(255,255,255,0.1)',
                border: `1px solid ${view === 'street' ? '#2196F3' : 'rgba(255,255,255,0.2)'}`,
                borderRadius: 6,
                color: 'white',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {view === 'close' ? 'Close-up' : view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          ))}
          <button
            data-ev-view="orbit"
            onClick={() => (window as any).evToggleOrbit?.()}
            style={{
              flex: 1,
              minWidth: 70,
              padding: '8px 6px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              color: 'white',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Orbit
          </button>
        </div>

        {/* Heading direction controls */}
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase' as const, opacity: 0.6, marginBottom: 6 }}>
            View From Direction (override)
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              [0, 'South→N'],
              [90, 'West→E'],
              [180, 'North→S'],
              [270, 'East→W'],
            ] as const).map(([heading, label]) => (
              <button
                key={heading}
                onClick={() => (window as any).evSetHeading?.(heading)}
                style={{
                  flex: 1,
                  padding: '8px 6px',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 6,
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div id="ev-status" />
        <div id="ev-addressDisplay" />
      </div>

      {/* AI Narration audio player — bottom left */}
      {narrateStatus !== 'idle' && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            left: 20,
            background: 'rgba(0, 0, 0, 0.85)',
            padding: '12px 16px',
            borderRadius: 12,
            backdropFilter: 'blur(10px)',
            zIndex: 10,
            maxWidth: 340,
            color: 'white',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            borderLeft: `3px solid ${narrateStatus === 'ready' ? '#4caf50' : narrateStatus === 'error' ? '#f44336' : '#2196F3'}`,
          }}
        >
          {narrateStatus === 'loading' && (
            <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
              Preparing AI narration...
            </p>
          )}
          {narrateStatus === 'error' && (
            <p style={{ margin: 0, fontSize: 12, color: '#f44336' }}>
              Narration unavailable
            </p>
          )}
          {narrateStatus === 'ready' && audioUrl && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.6, letterSpacing: 1 }}>
                AI Realtor Tour
              </p>
              {scriptPreview && (
                <p style={{ margin: '0 0 10px', fontSize: 12, opacity: 0.75, lineHeight: 1.5, maxHeight: 56, overflow: 'hidden' }}>
                  {scriptPreview}
                </p>
              )}
              <audio
                src={audioUrl}
                controls
                autoPlay
                style={{ width: '100%', height: 36, outline: 'none' }}
              />
            </>
          )}
        </div>
      )}

      {/* Info panel — bottom right */}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          background: 'rgba(0, 0, 0, 0.85)',
          padding: 16,
          borderRadius: 12,
          backdropFilter: 'blur(10px)',
          fontSize: 12,
          zIndex: 10,
          maxWidth: 280,
          color: 'white',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <p style={{ margin: '6px 0', opacity: 0.8 }}><strong style={{ color: '#2196F3' }}>Controls:</strong></p>
        <p style={{ margin: '6px 0', opacity: 0.8 }}>Drag: Pan around</p>
        <p style={{ margin: '6px 0', opacity: 0.8 }}>Scroll: Zoom in/out</p>
        <p style={{ margin: '6px 0', opacity: 0.8 }}>Right-click + Drag: Rotate</p>
        <p style={{ margin: '6px 0', opacity: 0.8 }}>Middle-click + Drag: Tilt</p>
      </div>
    </>
  );
}
