// aroundme.js
document.addEventListener('DOMContentLoaded', function() {
    const useMyLocationButton = document.getElementById('use-my-location');
    const radiusSlider = document.getElementById('radius-slider');
    const radiusValueSpan = document.getElementById('radius-value');

    const PLACES_API_KEY = 'YOUR_ACTUAL_API_KEY'; // 👈👈👈 REPLACE WITH YOUR KEY

    let map1; // Global map1 variable

    async function initMap() {
        const position = { lat: 40.7128, lng: -74.0060 }; // Default: New York City
        const { Map } = await google.maps.importLibrary("maps");
        const mapElement = document.getElementById("map1");

        if (mapElement) {
            map1 = new Map(mapElement, {
                zoom: 18,
                center: position,
                mapTypeId: 'satellite',
                tilt: 60,
                heading: 90,
                gestureHandling: 'greedy'
            });
        } else {
            console.error("Map element with ID 'map1' not found during initMap.");
        }
    }

    initMap();

    const cityMarkers = [];
    let currentLatitude, currentLongitude;
    let activeInfoWindow = null;
    let currentSlideIndexIW = 0;

    const externalSlideshowCard = document.getElementById('image-slideshow-card');
    const externalCityDetailsContainer = document.getElementById('city-details-container');
    if (externalSlideshowCard) externalSlideshowCard.style.display = 'none';
    if (externalCityDetailsContainer) externalCityDetailsContainer.style.display = 'none';

    function updateSliderFill(slider) {
        const percentage = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
        slider.style.background = `linear-gradient(to right, #007bff 0%, #007bff ${percentage}%, #ddd ${percentage}%, #ddd 100%)`;
    }

    if (radiusSlider) {
        updateSliderFill(radiusSlider);
        radiusSlider.addEventListener('input', function() {
            if (radiusValueSpan) radiusValueSpan.textContent = this.value;
            updateSliderFill(this);
            if (currentLatitude && currentLongitude) {
                fetchNearbyCities(currentLatitude, currentLongitude, this.value);
            }
        });
    }

    if (useMyLocationButton) {
        useMyLocationButton.addEventListener('click', function() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function(position) {
                        currentLatitude = position.coords.latitude;
                        currentLongitude = position.coords.longitude;

                        if (map1) {
                            map1.setCenter({ lat: currentLatitude, lng: currentLongitude });
                            map1.setZoom(15);
                            map1.setTilt(45);
                            map1.setMapTypeId('satellite');

                            new google.maps.Marker({
                                position: { lat: currentLatitude, lng: currentLongitude },
                                map: map1,
                                title: 'Your Location',
                                icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                            });
                        }

                        const initialRadius = radiusSlider ? radiusSlider.value : 15;
                        fetchNearbyCities(currentLatitude, currentLongitude, initialRadius);
                    },
                    function(error) {
                        console.error("Error getting location:", error);
                        alert("Could not get your location.");
                    }
                );
            } else {
                alert("Your browser doesn't support geolocation.");
            }
        });
    }

    function fetchNearbyCities(latitude, longitude, radius) {
        const username = 'berekety';
        const url = `https://secure.geonames.org/findNearbyPlaceNameJSON?lat=${latitude}&lng=${longitude}&radius=${radius}&maxRows=30&featureClass=P&username=${username}&featureCode=PPL`;

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.geonames) {
                    displayNearbyCitiesOnMap(data.geonames);
                } else {
                    console.warn("No geonames data found or API error:", data);
                    clearCityMarkers();
                    if (activeInfoWindow) activeInfoWindow.close();
                }
            })
            .catch(error => {
                console.error("Error fetching nearby cities:", error);
                alert("Failed to fetch nearby cities.");
            });
    }

    function clearCityMarkers() {
        cityMarkers.forEach(marker => marker.setMap(null));
        cityMarkers.length = 0;
    }

    let currentlySelectedMarker = null;

    function displayNearbyCitiesOnMap(cities) {
        if (!map1) {
            console.error("Map not initialized. Cannot display cities.");
            return;
        }

        clearCityMarkers();
        if (activeInfoWindow) activeInfoWindow.close();
        if (currentlySelectedMarker) {
            currentlySelectedMarker.setOptions({ opacity: 1 });
            currentlySelectedMarker = null;
        }

        cities.forEach(city => {
            const marker = new google.maps.Marker({
                position: { lat: parseFloat(city.lat), lng: parseFloat(city.lng) },
                map: map1,
                title: city.name,
                opacity: 1
            });

            marker.addListener('click', function() {
                if (activeInfoWindow) activeInfoWindow.close();

                activeInfoWindow = new google.maps.InfoWindow();
                currentSlideIndexIW = 0;

                const iwContent = `
                    <div id="iw-content-container">
                        <h4 id="iw-city-name">${city.name}</h4>
                        <p id="iw-city-type">Type: ${city.fclName || 'N/A'}</p>
                        <div id="iw-slideshow-container" style="width: 300px; height: 200px; overflow: hidden; position: relative; border-radius: 6px;">
                            <div id="iw-slideshow-images" style="display: flex; transition: transform 0.5s ease-in-out; height: 100%;"></div>
                            <button id="iw-prev-slide" style="position: absolute; left: 5px; top: 50%; transform: translateY(-50%); z-index:1;"><</button>
                            <button id="iw-next-slide" style="position: absolute; right: 5px; top: 50%; transform: translateY(-50%); z-index:1;">></button>
                        </div>
                        <button id="iw-add-to-trip" data-city-name="${city.name}" style="margin-top: 10px;">Add to My Trip</button>
                    </div>`;

                activeInfoWindow.setContent(iwContent);
                activeInfoWindow.open(map1, marker);

                map1.setCenter(marker.getPosition());
                map1.setZoom(Math.max(map1.getZoom() || 0, 17));
                map1.setTilt(45);
                map1.setMapTypeId('satellite');

                if (currentlySelectedMarker) {
                    currentlySelectedMarker.setOptions({ opacity: 1 });
                }
                this.setOptions({ opacity: 1 });
                currentlySelectedMarker = this;
                cityMarkers.forEach(otherMarker => {
                    if (otherMarker !== currentlySelectedMarker) {
                        otherMarker.setOptions({ opacity: 0.5 });
                    }
                });

                google.maps.event.addListener(activeInfoWindow, 'domready', () => {
                    fetchCityAttractionImagesForInfoWindow(parseFloat(city.lat), parseFloat(city.lng));

                    const iwPrevButton = document.getElementById('iw-prev-slide');
                    const iwNextButton = document.getElementById('iw-next-slide');
                    const iwAddToTripButton = document.getElementById('iw-add-to-trip');

                    if (iwPrevButton) {
                        iwPrevButton.addEventListener('click', () => {
                            const imagesContainer = document.getElementById('iw-slideshow-images');
                            if (imagesContainer && currentSlideIndexIW > 0) {
                                currentSlideIndexIW--;
                                imagesContainer.style.transform = `translateX(-${currentSlideIndexIW * 300}px)`;
                            }
                        });
                    }

                    if (iwNextButton) {
                        iwNextButton.addEventListener('click', () => {
                            const imagesContainer = document.getElementById('iw-slideshow-images');
                            if (imagesContainer && currentSlideIndexIW < imagesContainer.children.length - 1) {
                                currentSlideIndexIW++;
                                imagesContainer.style.transform = `translateX(-${currentSlideIndexIW * 300}px)`;
                            }
                        });
                    }

                    if (iwAddToTripButton) {
                        iwAddToTripButton.addEventListener('click', function() {
                            const cityNameForTrip = this.dataset.cityName;
                            console.log(`Added ${cityNameForTrip} to My Trip (from InfoWindow)`);
                            alert(`${cityNameForTrip} added to your trip!`);
                        });
                    }
                });

                google.maps.event.addListener(activeInfoWindow, 'closeclick', () => {
                    cityMarkers.forEach(m => m.setOptions({ opacity: 1 }));
                    currentlySelectedMarker = null;
                    activeInfoWindow = null;
                });
            });

            cityMarkers.push(marker);
        });
    }

    function fetchCityAttractionImagesForInfoWindow(cityLat, cityLng) {
        const radius = 5000;
        const type = 'tourist_attraction';
        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${cityLat},${cityLng}&radius=${radius}&type=${type}&key=${PLACES_API_KEY}`;

        console.log("Fetching IW attractions with Places API:", url);
        const imagesContainer = document.getElementById('iw-slideshow-images');
        if (imagesContainer) imagesContainer.innerHTML = '<div style="padding:80px 0; text-align:center; width:300px;">Loading images...</div>';

        fetch(url)
            .then(response => response.json())
            .then(data => {
                console.log("Places API Data for IW:", data);
                if (data.status === "OK") {
                    displayImageSlideshowForInfoWindow(data.results);
                } else {
                    if (imagesContainer) imagesContainer.innerHTML = '<div style="padding:80px 0; text-align:center; width:300px;">No images found.</div>';
                    console.error("Places API error for IW:", data.status, data.error_message);
                }
            })
            .catch(error => {
                if (imagesContainer) imagesContainer.innerHTML = '<div style="padding:80px 0; text-align:center; width:300px;">Error fetching images.</div>';
                console.error("Error fetching attractions for IW slideshow:", error);
            });
    }

    function displayImageSlideshowForInfoWindow(attractions) {
        const imagesContainer = document.getElementById('iw-slideshow-images');
        const prevButton = document.getElementById('iw-prev-slide');
        const nextButton = document.getElementById('iw-next-slide');

        if (!imagesContainer || !prevButton || !nextButton) {
            console.error("InfoWindow slideshow elements not found for display!");
            return;
        }

        imagesContainer.innerHTML = '';
        const maxImages = 5;
        let loadedImageUrls = [];

        attractions.forEach(attraction => {
            if (attraction.photos && attraction.photos.length > 0 && loadedImageUrls.length < maxImages) {
                const photoReference = attraction.photos[0].photo_reference;
                const imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=300&maxheight=200&photoreference=${photoReference}&key=${PLACES_API_KEY}`;
                loadedImageUrls.push(imageUrl);
            }
        });

        if (loadedImageUrls.length === 0) {
            loadedImageUrls.push('https://via.placeholder.com/300x200/EEE/CCC?text=No+Images+Available');
        }

        loadedImageUrls.forEach(src => {
            const img = document.createElement('img');
            img.src = src;
            img.style.width = '300px';
            img.style.height = '200px';
            img.style.objectFit = 'cover';
            img.alt = "Attraction image";
            img.onerror = function() {
                this.src = 'https://via.placeholder.com/300x200/EEE/CCC?text=Image+Error';
                this.alt = "Image load error";
            };
            imagesContainer.appendChild(img);
        });

        imagesContainer.style.width = `${300 * imagesContainer.children.length}px`;
        currentSlideIndexIW = 0;
        imagesContainer.style.transform = `translateX(0px)`;

        const hasMultipleImages = imagesContainer.children.length > 1;
        prevButton.style.display = hasMultipleImages ? 'block' : 'none';
        nextButton.style.display = hasMultipleImages ? 'block' : 'none';
    }
});
