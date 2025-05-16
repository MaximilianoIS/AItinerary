// friends-logic.js

// Variables specific to the Friends feature
let friendsMap = null; // Renamed from mapRef to avoid confusion with other maps
let friendMarkers = []; // Stores all markers on the friendsMap (scattered + actual friends)

// --- Helper Functions ---
function capitalize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Placeholder for guessCity if you don't have it from elsewhere.
// function guessCity(lat, lng) { return `${lat.toFixed(2)}, ${lng.toFixed(2)}`; }


// --- Core Friends Functions ---

// Initializes the map for the Friends section
function initFriendsMapInternal() {
  // Wipe old markers from previous initializations (if any)
  friendMarkers.forEach(m => m.setMap(null));
  friendMarkers = [];

  if (!google || !google.maps || !google.maps.Map) {
    console.error("Friends Logic: Google Maps API not loaded yet. Cannot initialize friends map.");
    return;
  }

  const friendsMapDiv = document.getElementById("friends-map");
  if (!friendsMapDiv) {
    console.error("Friends Logic: 'friends-map' div not found.");
    return;
  }
  
  friendsMap = new google.maps.Map(
    friendsMapDiv,
    { center: { lat: 20, lng: 0 }, zoom: 2 } // Global view
  );

  // START: Add 5 scattered pins with person icons (example data)
  const scatteredPinsLocations = [
    { lat: 40.7128, lng: -74.0060, title: "Traveler in New York", iconUrl: "/static/img/avatars/max.png" },
    { lat: 30.0444, lng: 31.2357, title: "Traveler in Cairo", iconUrl: "/static/img/avatars/bob.png" },
    { lat: -33.8688, lng: 151.2093, title: "Traveler in Sydney", iconUrl: "/static/img/avatars/carol.png" },
    { lat: -22.9068, lng: -43.1729, title: "Traveler in Rio", iconUrl: "/static/img/avatars/dave.png" }
  ];

  scatteredPinsLocations.forEach(loc => {
    const marker = new google.maps.Marker({
      position: { lat: loc.lat, lng: loc.lng },
      map: friendsMap,
      title: loc.title,
      icon: {
        url: loc.iconUrl,
        scaledSize: new google.maps.Size(32, 32),
        anchor: new google.maps.Point(16, 16)
      }
    });
    friendMarkers.push(marker); // Add to the array for potential clearing
  });
  // END: Add 5 scattered pins

  // Existing logic to load actual friends from the backend
  // These friends will also get markers.
  generateTestUsersInternal().then(() => {
    loadFriendsInternal(); // This function also adds markers to `friendMarkers`
  }).catch(err => console.error("Friends Logic: Error during test user generation or loading friends:", err));
}

// Loads friends data and displays them in the list and on the map
function loadFriendsInternal() {
  const listEl = document.getElementById("friend-list");
  if (!listEl) {
    console.error("Friends Logic: Friend list element 'friend-list' not found.");
    return;
  }
  listEl.innerHTML = ""; // Clear previous friend list items

  fetch("/get_friends")
    .then(res => {
      if (!res.ok) throw new Error(`Failed to fetch friends: ${res.status}`);
      return res.json();
    })
    .then(friends => {
      if (!Array.isArray(friends)) {
        console.error("Friends Logic: Fetched friends data is not an array:", friends);
        return;
      }
      friends.forEach(f => {
        const item = document.createElement("div");
        item.className = "friend-item";

        const avatarName = f.name && typeof f.name === 'string' ? f.name.toLowerCase() : 'default';
        const avatarUrl = `/static/img/avatars/${avatarName}.png`;

        item.innerHTML = `
          <img src="${avatarUrl}" alt="${f.name || 'Friend'}" onerror="this.onerror=null; this.src='/static/img/avatars/default.png';">
          <div class="name">${capitalize(f.name || 'Unknown Friend')}</div>
        `;
        // Optional: <div class="location">📍 ${guessCity(f.lat, f.lng)}</div>

        item.addEventListener("click", () => {
          if (friendsMap && f.lat != null && f.lng != null) {
            friendsMap.panTo({ lat: f.lat, lng: f.lng });
            friendsMap.setZoom(8);
            viewTripInternal(f.name);
          } else {
            console.warn("Friends Logic: Map not ready or friend location missing for:", f.name);
          }
        });
        listEl.appendChild(item);

        if (friendsMap && f.lat != null && f.lng != null) {
          const marker = new google.maps.Marker({
            position: { lat: f.lat, lng: f.lng },
            map: friendsMap,
            title: f.name || 'Friend',
            icon: {
              url: avatarUrl,
              scaledSize: new google.maps.Size(48, 48),
              anchor: new google.maps.Point(24, 24),
            }
          });
          marker.addListener("click", () => item.click());
          friendMarkers.push(marker); // Add to the global array for clearing
        }
      });
    })
    .catch(err => console.error("Friends Logic: Error in loadFriendsInternal:", err));
}

// Displays trip history for a selected friend
function viewTripInternal(username) {
  const panel = document.getElementById("trip-history");
  if (!panel) {
    console.error("Friends Logic: Trip history panel 'trip-history' not found.");
    return;
  }
  panel.innerHTML = `<h3>${capitalize(username)}'s Recent Visits</h3>`;
  fetch(`/get_trip_history/${username}`)
    .then(res => {
      if (!res.ok) throw new Error(`Failed to fetch trip history for ${username}: ${res.status}`);
      return res.json();
    })
    .then(visits => {
      if (!Array.isArray(visits)) {
        console.error("Friends Logic: Fetched trip history data is not an array:", visits);
        panel.innerHTML += "<p>No visit data found or error in data.</p>";
        return;
      }
      if (visits.length === 0) {
        panel.innerHTML += "<p>No recent visits found.</p>";
        return;
      }
      visits.forEach(v => {
        const div = document.createElement("div");
        div.textContent = `${new Date(v.timestamp).toLocaleString()}: ${v.place}`;
        panel.appendChild(div);
        if (friendsMap && v.lat != null && v.lng != null) {
          // Optional: Add small blue-dot markers for individual visits
          // These markers are not added to friendMarkers array so they persist until map re-init
          new google.maps.Marker({
            position: { lat: v.lat, lng: v.lng },
            map: friendsMap,
            icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
          });
        }
      });
    })
    .catch(err => {
      console.error("Friends Logic: Error in viewTripInternal:", err);
      panel.innerHTML += `<p>Error loading trip history: ${err.message}</p>`;
    });
}

// Updates the list of "Local People Nearby"
function updateLocalPeopleListInternal() {
  fetch("/get_friends") // Assuming this endpoint returns users suitable for "Locals Nearby"
    .then(res => res.json())
    .then(friends => {
      const list = document.getElementById("local-people-list");
      if (!list) {
        console.error("Friends Logic: Local people list element 'local-people-list' not found.");
        return;
      }
      list.innerHTML = ""; // Clear previous list

      if (!Array.isArray(friends)) {
        console.error("Friends Logic: Fetched local people data is not an array:", friends);
        return;
      }

      friends.forEach(f => {
        const div = document.createElement("div");
        div.className = "local-person-card";
        
        const avatarName = f.name && typeof f.name === 'string' ? f.name.toLowerCase() : 'default';
        const avatarUrl = `/static/img/avatars/${avatarName}.png`;

        div.innerHTML = `
          <img src="${avatarUrl}" alt="${f.name || 'Local'}" onerror="this.onerror=null; this.src='/static/img/avatars/default.png';">
          <div class="local-info">
            <div class="name">${capitalize(f.name || 'Unknown Local')}</div>
            <div class="location">📍 ${f.lat != null && f.lng != null ? `${f.lat.toFixed(2)}, ${f.lng.toFixed(2)}` : 'Location unknown'}</div>
          </div>
        `;
        list.appendChild(div);
      });
    })
    .catch(err => console.error("Friends Logic: Error updating local people list:", err));
}

// Generates test user data (primarily for development/demo)
function generateTestUsersInternal() {
  const names = ["alice", "bob", "carol", "dave"];
  const cities = [
    { lat: 37.5665, lng: 126.9780, place: "Seoul" },
    { lat: 34.0522, lng: -118.2437, place: "Los Angeles" },
    { lat: 48.8566, lng: 2.3522, place: "Paris" },
    { lat: 51.5074, lng: -0.1278, place: "London" },
  ];

  const promises = names.map((name, i) => {
    const { lat, lng, place } = cities[i % cities.length];
    return fetch("/update_location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: name,
        lat: lat + (Math.random() - 0.5) * 0.2,
        lng: lng + (Math.random() - 0.5) * 0.2,
        place
      })
    }).catch(err => console.error(`Friends Logic: Error updating location for ${name}:`, err));
  });

  return Promise.all(promises)
    .then((results) => {
      console.log("Friends Logic: Test user locations updated (or attempted).");
      results.forEach(res => {
        if (res && !res.ok) {
          console.warn(`Friends Logic: Failed to update location for a user: ${res.status}`);
        }
      });
    })
    .catch(err => {
      console.error("Friends Logic: Error in generateTestUsersInternal Promise.all:", err);
    });
}


// --- EXPORTED INITIALIZATION FUNCTION ---
// This function will be called by dashboard-logic.js when the Friends tab is activated.
export function initFriendsFeature() {
    console.log("Friends Logic: Initializing Friends Feature...");
    // Small delay to ensure the friends section is visible and map div has dimensions
    setTimeout(() => {
        initFriendsMapInternal(); // This will create the map, add scattered pins, and then load friends
        updateLocalPeopleListInternal();
    }, 100); // 50-100ms is usually enough
}