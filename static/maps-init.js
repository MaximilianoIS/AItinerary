// static/maps-init.js

// Declare map variable in a broader scope so it can be accessed later
let map;

async function initMap() {
  console.log("Attempting to initialize map...");
  const mapDiv = document.getElementById("map");

  if (!mapDiv) {
    console.error("Error: Map container div (#map) not found.");
    return; // Stop if the div isn't there
  }

  try {
    // Import the core Map library
    const { Map } = await google.maps.importLibrary("maps");
    // You might need other libraries later, e.g., "marker"
    // const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    console.log("Google Maps API loaded. Creating map instance.");

    // Default center (e.g., a central point or fallback location)
    const defaultCenter = { lat: 34.0522, lng: -118.2437 }; // Los Angeles Example

    map = new Map(mapDiv, {
      center: defaultCenter,
      zoom: 8,
      mapId: "TRAVEL_PLANNER_MAP" // Optional: Helps with Cloud-based Maps Styling
    });

    console.log("Map initialized successfully.");

    // Make the map instance globally accessible (or export it if needed)
    // Option 1: Global variable (simple for this example)
    window.globalMap = map;

    // Option 2: Dispatch a custom event when map is ready
    // mapDiv.dispatchEvent(new CustomEvent('mapready', { detail: { map: map } }));


  } catch (error) {
    console.error("Error initializing Google Map:", error);
    mapDiv.textContent = "Error loading map. Check console and API key.";
  }
}

// Kick it off
initMap();

// Optional: Function to update map center later
function updateMapCenter(lat, lng, zoom = 12) {
  if (window.globalMap) {
    console.log(`Updating map center to: ${lat}, ${lng}`);
    window.globalMap.setCenter({ lat, lng });
    window.globalMap.setZoom(zoom);
  } else {
    console.warn("Map not ready yet to update center.");
    // You could potentially queue this update or wait for the mapready event
  }
}

// Make updateMapCenter globally accessible IF you used the global map approach
window.updateMapCenter = updateMapCenter;

// If you used the custom event approach, you'd listen for 'mapready' elsewhere
// document.getElementById('map').addEventListener('mapready', (event) => {
//   const mapInstance = event.detail.map;
//   // Now you can use mapInstance
// });