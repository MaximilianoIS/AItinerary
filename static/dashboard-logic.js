
    // Wait for the DOM to be fully loaded before running scripts
    document.addEventListener('DOMContentLoaded', () => {

      // --- Tab Switching Logic ---
      // ---------------------------
      const tabs = {
        "around-me-tab": "around-me",
        "my-trips-tab": "my-trips",
        "friends-tab": "friends", // Added Friends Tab ID and Section ID
        "settings-tab": "settings"
      };
      const segments = document.querySelectorAll('.segment');
      const sections = document.querySelectorAll('.section');

      segments.forEach(btn => {
        btn.addEventListener('click', () => {
          // Update button active state
          segments.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          // Update section visibility
          sections.forEach(s => s.classList.remove('active'));
          const targetSectionId = tabs[btn.id]; // Get the ID of the section to show
          const targetSection = document.getElementById(targetSectionId);
          if (targetSection) {
            targetSection.classList.add('active');
          } else {
            console.error(`Target section with ID '${targetSectionId}' not found for tab '${btn.id}'`);
          }

          // Optional: Resize map if 'Around Me' tab is activated and map exists
          if (targetSectionId === 'around-me' && window.globalMap) {
            // Small delay allows layout to settle before resizing map
            setTimeout(() => {
                google.maps.event.trigger(window.globalMap, 'resize');
                // You might want to re-center the map as well if needed
                // if (window.currentMapCenter) {
                //   window.globalMap.setCenter(window.currentMapCenter);
                // }
            }, 50);
          }
        });
      });
      // --- End Tab Switching Logic ---


      // --- "Around Me" Section Logic ---
      // ---------------------------------
      const getLocationBtn = document.getElementById('get-location-btn');
      const aroundMeResult = document.getElementById('around-me-result');

      if (getLocationBtn && aroundMeResult) {
        getLocationBtn.addEventListener('click', () => {
          if (!navigator.geolocation) {
            aroundMeResult.textContent = 'Geolocation is not supported by your browser.';
            return;
          }

          aroundMeResult.textContent = 'Locating…';
          getLocationBtn.disabled = true;
          getLocationBtn.textContent = 'Locating...';

          navigator.geolocation.getCurrentPosition(
            // Success Callback
            pos => {
              const userLat = pos.coords.latitude;
              const userLon = pos.coords.longitude;

              aroundMeResult.textContent = `Location found: ${userLat.toFixed(4)}, ${userLon.toFixed(4)}. Fetching plan...`;

              // Update the map center (if map is initialized and function exists)
              if (typeof window.updateMapCenter === 'function') {
                console.log("Updating map center via window.updateMapCenter");
                window.updateMapCenter(userLat, userLon, 12); // Center map and zoom
              } else if (window.globalMap) {
                 // Fallback if updateMapCenter isn't defined but map exists
                 console.log("Updating map center directly via globalMap.setCenter");
                 window.globalMap.setCenter({ lat: userLat, lng: userLon });
                 window.globalMap.setZoom(12);
                 // Store center if needed elsewhere
                 // window.currentMapCenter = { lat: userLat, lng: userLon };
              } else {
                console.warn("Map object or updateMapCenter function not found. Map center not updated.");
              }

              // Fetch itinerary from the backend
              fetch('/around_me', {

                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: userLat, lon: userLon })
              })
              .then(response => {
                if (!response.ok) {
                  return response.text().then(text => { // Try to get error text from body
                     throw new Error(`HTTP error ${response.status}: ${response.statusText}. Server response: ${text}`);
                  });
                }
                return response.json();
              })
              .then(data => {
                aroundMeResult.textContent = data.result; // Display the itinerary
              })
              .catch(err => {
                console.error("Error fetching 'Around Me' plan:", err);
                aroundMeResult.textContent = `Error fetching plan: ${err.message}. Please check the console for details.`;
              })
              .finally(() => {
                 getLocationBtn.disabled = false; // Re-enable button
                 getLocationBtn.textContent = 'Get 2-Day Plan Near Me';
              });
            },
            // Error Callback
            (error) => {
              console.error("Geolocation error:", error);
              let message = 'Could not get location.';
              switch(error.code) {
                case error.PERMISSION_DENIED:
                  message = "Geolocation permission denied. Please enable location services for this site in your browser settings.";
                  break;
                case error.POSITION_UNAVAILABLE:
                  message = "Location information is currently unavailable. Please try again later.";
                  break;
                case error.TIMEOUT:
                  message = "The request to get user location timed out. Please check your connection and try again.";
                  break;
                case error.UNKNOWN_ERROR:
                  message = "An unknown error occurred during geolocation.";
                  break;
              }
              aroundMeResult.textContent = message;
              getLocationBtn.disabled = false; // Re-enable button
              getLocationBtn.textContent = 'Get 2-Day Plan Near Me';
            },
            // Options
            {
                enableHighAccuracy: false, // Can set to true for potentially more accuracy, but uses more power
                timeout: 10000,         // Maximum time (ms) to wait for location
                maximumAge: 0           // Force a fresh location check
            }
          ); // end getCurrentPosition
        }); // end addEventListener
      } else {
         console.error("Elements for 'Around Me' (button or result area) not found.");
      }
      // --- End "Around Me" Section Logic ---


      // --- "My Trips" Section Logic ---
      // --------------------------------
      const tripBtn    = document.getElementById('generate-trip-btn');
      const tripIdea   = document.getElementById('trip-idea');
      const tripResult = document.getElementById('my-trips-result');
      const imageContainer = document.getElementById('my-trips-images');

      if (tripBtn && tripIdea && tripResult && imageContainer) {
        tripBtn.addEventListener('click', () => {
          const idea = tripIdea.value.trim();
          if (!idea) {
            tripResult.textContent = 'Please enter your trip idea first.';
            return;
          }

          tripResult.textContent = 'Generating itinerary…';
          imageContainer.innerHTML = ''; // Clear previous images immediately
          tripBtn.disabled = true;
          tripBtn.textContent = 'Thinking…';

          fetch('/my_trips', {

            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idea })
          })
          .then(response => {
            if (!response.ok) {
              return response.text().then(text => {
                 throw new Error(`HTTP error ${response.status}: ${response.statusText}. Server response: ${text}`);
              });
            }
            return response.json();
          })
          .then(data => {
            tripResult.textContent = data.result; // Display the itinerary text

            // Image Gallery Logic
            if (Array.isArray(data.images) && data.images.length > 0) {
              data.images.forEach(imgUrl => {
                const img = document.createElement('img');
                img.src = imgUrl;
                img.alt = "Destination image related to the trip"; // More descriptive alt text
                img.classList.add("trip-image");
                // Optional: Add error handling for individual images
                img.onerror = () => {
                  console.warn(`Failed to load image: ${imgUrl}`);
                  img.alt = "Image failed to load";
                  // Optionally hide or replace the broken image element
                  // img.style.display = 'none';
                };
                imageContainer.appendChild(img);
              });
            } else {
              // Optional: Display a message if no images are returned
              // imageContainer.innerHTML = '<p>No images available for this trip.</p>';
            }
          })
          .catch(err => {
            console.error("Error fetching 'My Trips' plan:", err);
            tripResult.textContent = `Error generating plan: ${err.message}. Please check the console for details.`;
          })
          .finally(() => {
            tripBtn.disabled = false;
            tripBtn.textContent = 'Generate Plan';
          });
        });
      } else {
        console.error("One or more elements for 'My Trips' (button, textarea, result, image container) not found.");
      }
      // --- End "My Trips" Section Logic ---


      // --- "Friends" Section Logic ---
      // -------------------------------
      // Add any specific JavaScript for the Friends tab here when needed.
      // For example, fetching friend lists, handling friend requests etc.
      console.log("Friends tab logic placeholder.");
      // --- End "Friends" Section Logic ---


      // --- "Settings" Section Logic (Dark Mode) ---
      // --------------------------------------------
      const darkModeToggle = document.getElementById('dark-mode-toggle');

      // Function to apply theme based on toggle state and save preference
      const applyTheme = (isDark) => {
        if (isDark) {
          document.body.classList.add('dark-mode');
          localStorage.setItem('theme', 'dark');
        } else {
          document.body.classList.remove('dark-mode');
          localStorage.setItem('theme', 'light');
        }
      };

      // Initialize theme on load
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark') {
        if (darkModeToggle) darkModeToggle.checked = true;
        applyTheme(true);
      } else {
        // Default to light theme if no preference saved or preference is 'light'
        if (darkModeToggle) darkModeToggle.checked = false;
        applyTheme(false); // Explicitly apply light theme styles if needed
      }

      // Add event listener for changes
      if (darkModeToggle) {
        darkModeToggle.addEventListener('change', () => {
          applyTheme(darkModeToggle.checked);
        });
      } else {
         console.error("Dark mode toggle element not found.");
      }
      // --- End "Settings" Section Logic ---


    }); // End DOMContentLoaded