
// Potentially useful for other frontend AI features, or if switching back to frontend Gemini calls for plan generation.
// If not used, this import and related 'genAI' client can be removed.
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.7.0";

// Declare variables in module scope
let map;
let currentTripData = {
    locations: [],
    markers: [],
    lines: [],
    popups: [],
    itineraryByDay: {},
    bounds: null
};
let chatMessages = [];
let currentSelectedDay = 'all';
let activeCardIndex = 0;
let genAI = null; // Will be initialized in initExplorer if API key is provided
let myTripsSectionElement = null;
let totalDaysInPlan = 0;

// DOM Element references
let dayTabsBar, promptInput, generateButton, resetButton, cardContainer, carouselIndicators,
    prevCardButton, nextCardButton, cardCarousel, timelineContainer, timeline,
    closeTimelineButton, exportPlanButton, timelineToggle, mapSpinner,
    chatErrorMessageElement, chatWrapper, chatToggleFab, closeChatButton, messagesHistoryContainer,
    timelineDayHeader;

// Google Maps libraries
let Map, LatLngBounds, AdvancedMarkerElement, PopupClassImported;

const DESIRED_MAX_ZOOM_AFTER_FITBOUNDS = 16; // Adjust this value as needed for default zoom


// --- UTILITY FUNCTIONS ---

function setChatVisibility(isVisible) {
    if (!chatToggleFab || !chatWrapper) return;
    const fabIcon = chatToggleFab.querySelector('i');
    if (isVisible) {
        chatWrapper.classList.remove('hidden');
        if (fabIcon) {
            fabIcon.classList.remove('fa-comments');
            fabIcon.classList.add('fa-times');
        }
    } else {
        chatWrapper.classList.add('hidden');
        if (fabIcon) {
            fabIcon.classList.remove('fa-times');
            fabIcon.classList.add('fa-comments');
        }
    }

    if (myTripsSectionElement) {
        myTripsSectionElement.classList.toggle('chat-open', isVisible);
        document.documentElement.style.setProperty('--chat-height', isVisible ? `${chatWrapper.offsetHeight}px` : `0px`);
    }
}

function toggleChatVisibility() {
    if (!chatWrapper) return;
    setChatVisibility(chatWrapper.classList.contains('hidden'));
}

// --- CHAT MESSAGE HANDLING ---
function addMessageToHistory(sender, text, isLoading = false) {
    if (!messagesHistoryContainer) {
        console.error("addMessageToHistory: messagesHistoryContainer element not found.");
        return null;
    }
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');
    if (isLoading) {
        messageDiv.innerHTML = `<div class="chat-loading-spinner"><div></div><div></div><div></div></div> ${text || 'Thinking...'}`;
    } else {
        messageDiv.textContent = text;
    }
    messagesHistoryContainer.appendChild(messageDiv);
    messagesHistoryContainer.scrollTop = messagesHistoryContainer.scrollHeight;
    return messageDiv;
}

// --- DAY TABS RENDERING AND SWITCHING ---
function renderDayTabs(numDays) {
    totalDaysInPlan = numDays;
    if (!dayTabsBar) {
        console.error("renderDayTabs: dayTabsBar element not found.");
        return;
    }
    dayTabsBar.innerHTML = '';

    const generalTab = document.createElement('button');
    generalTab.className = 'day-tab';
    generalTab.dataset.day = 'all';
    generalTab.textContent = 'General';
    generalTab.addEventListener('click', () => switchDayTab('all'));
    dayTabsBar.appendChild(generalTab);

    for (let i = 1; i <= numDays; i++) {
        const dayTab = document.createElement('button');
        dayTab.className = 'day-tab';
        dayTab.dataset.day = i.toString();
        dayTab.textContent = `Day ${i}`;
        dayTab.addEventListener('click', () => switchDayTab(i.toString()));
        dayTabsBar.appendChild(dayTab);
    }
}

function switchDayTab(dayKey) {
    currentSelectedDay = dayKey;
    console.log(`Switched to day: ${dayKey}`);

    if (!dayTabsBar) return;
    const tabs = dayTabsBar.querySelectorAll('.day-tab');
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.day === dayKey);
    });

    if (timelineDayHeader) {
        timelineDayHeader.textContent = dayKey === 'all' ? "Overall Trip Plan" : `Day ${dayKey} Plan`;
    }
    displayDataForDay(dayKey);
}

function displayDataForDay(dayKey) {
    currentTripData.markers.forEach(m => m.setMap(null));
    currentTripData.lines.forEach(l => {
        if(l.poly) l.poly.setMap(null);
        if(l.geodesicPoly) l.geodesicPoly.setMap(null);
    });
    currentTripData.popups.forEach(pData => {
        if (pData.popup) pData.popup.setMap(null);
        if (pData.content) pData.content.classList.remove('popup-active');
    });

    const dayLinesForMap = [];
    let popupsForThisView = [];

    if (!LatLngBounds) {
        console.error("LatLngBounds not initialized in displayDataForDay");
        return;
    }
    currentTripData.bounds = new LatLngBounds();

    if (dayKey === 'all') {
        popupsForThisView = [...currentTripData.popups];

        currentTripData.markers.forEach(markerInstance => {
            markerInstance.setMap(map);
            if (markerInstance.position) currentTripData.bounds.extend(markerInstance.position);
        });

        currentTripData.lines.forEach(lineObj => {
            if(lineObj.poly) lineObj.poly.setMap(map);
            if(lineObj.geodesicPoly) lineObj.geodesicPoly.setMap(map);
            dayLinesForMap.push(lineObj);
        });

    } else {
        const dayNum = parseInt(dayKey);
        popupsForThisView = currentTripData.popups.filter(pData => pData.day === dayNum);

        currentTripData.markers.forEach(markerInstance => {
            const associatedLocation = currentTripData.locations.find(loc =>
                loc.name === markerInstance.title &&
                loc.day === dayNum &&
                markerInstance.position &&
                loc.lat === markerInstance.position.lat() &&
                loc.lng === markerInstance.position.lng()
            );
            if (associatedLocation) {
                markerInstance.setMap(map);
                if (markerInstance.position) currentTripData.bounds.extend(markerInstance.position);
            }
        });

        currentTripData.lines.forEach(lineObj => {
            if (lineObj.day === dayNum) {
                if(lineObj.poly) lineObj.poly.setMap(map);
                if(lineObj.geodesicPoly) lineObj.geodesicPoly.setMap(map);
                dayLinesForMap.push(lineObj);
            }
        });
    }

    popupsForThisView.sort((a, b) => (a.sequence || Infinity) - (b.sequence || Infinity) || (a.time || '').localeCompare(b.time || ''));

    createLocationCards(popupsForThisView);
    createTimeline(popupsForThisView, dayLinesForMap);

    if (map && currentTripData.bounds && !currentTripData.bounds.isEmpty()) {
        map.fitBounds(currentTripData.bounds);
        // Adjust zoom after fitBounds if it's too high
        // Add a listener for when the bounds have actually changed and map is idle
        google.maps.event.addListenerOnce(map, 'idle', () => {
            if (map.getZoom() > DESIRED_MAX_ZOOM_AFTER_FITBOUNDS) {
                map.setZoom(DESIRED_MAX_ZOOM_AFTER_FITBOUNDS);
            }
        });
    } else if (map && currentTripData.locations.length === 0) {
        map.setCenter({lat: 37.5505, lng: 126.998});
        map.setZoom(10); // A more general default zoom if no locations
    }
}

// --- Core Logic Functions ---

function showTimeline() { if (timelineContainer) { timelineContainer.style.display = 'flex'; setTimeout(() => { timelineContainer.classList.add('visible'); adjustInterfaceForTimeline(true); window.dispatchEvent(new Event('resize')); }, 10); } }
function hideTimeline() { if (timelineContainer) { timelineContainer.classList.remove('visible'); adjustInterfaceForTimeline(false); setTimeout(() => { timelineContainer.style.display = 'none'; window.dispatchEvent(new Event('resize')); }, 300); } }
function adjustInterfaceForTimeline(isTimelineVisible) { if (map && currentTripData.bounds && !currentTripData.bounds.isEmpty()) { setTimeout(() => { map.fitBounds(currentTripData.bounds); google.maps.event.addListenerOnce(map, 'idle', () => { if (map.getZoom() > DESIRED_MAX_ZOOM_AFTER_FITBOUNDS) map.setZoom(DESIRED_MAX_ZOOM_AFTER_FITBOUNDS); }); }, 350); } }

function restart() {
    currentTripData.markers.forEach((marker) => marker.setMap(null));
    currentTripData.lines.forEach((line) => {
        if (line.poly) line.poly.setMap(null);
        if (line.geodesicPoly) line.geodesicPoly.setMap(null);
    });
    currentTripData.popups.forEach((popupData) => {
        if (popupData.popup) popupData.popup.setMap(null);
    });

    if (LatLngBounds) {
        currentTripData = { locations: [], markers: [], lines: [], popups: [], itineraryByDay: {}, bounds: new LatLngBounds() };
    } else {
        currentTripData = { locations: [], markers: [], lines: [], popups: [], itineraryByDay: {}, bounds: null };
        console.error("LatLngBounds not available during restart");
    }
    totalDaysInPlan = 0;
    currentSelectedDay = 'all';
    activeCardIndex = 0;

    if (cardContainer) cardContainer.innerHTML = '';
    if (carouselIndicators) carouselIndicators.innerHTML = '';
    if (cardCarousel) cardCarousel.style.display = 'none';
    if (timeline) timeline.innerHTML = '';
    if (timelineContainer && timelineContainer.classList.contains('visible')) hideTimeline();

    renderDayTabs(0);
    if (dayTabsBar) {
        switchDayTab('all');
    } else {
        displayDataForDay('all');
    }

    if (chatErrorMessageElement) chatErrorMessageElement.textContent = '';
    console.log("map-explorer-logic: Restarted state.");
}

async function sendText(prompt) {
    if (mapSpinner) mapSpinner.classList.remove('hidden');
    if (chatErrorMessageElement) chatErrorMessageElement.innerHTML = '';

    addMessageToHistory('user', prompt);
    const aiLoadingMessage = addMessageToHistory('ai', 'Crafting your itinerary...', true);

    restart();

    const generateButtonIcon = generateButton?.querySelector('i');
    if (generateButtonIcon) generateButtonIcon.className = 'fas fa-spinner fa-spin';

    try {
        console.log("map-explorer-logic: Sending prompt to backend for structured trip:", prompt);
        const response = await fetch('/generate_structured_trip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt }),
        });

        const responseData = await response.json();

        if (!response.ok) {
            throw new Error(responseData.error || `Server error: ${response.status}`);
        }

        if (aiLoadingMessage) aiLoadingMessage.remove();

        if (responseData.error) { throw new Error(responseData.error); }

        if (responseData.textSummary && responseData.textSummary.trim()) {
             addMessageToHistory('ai', responseData.textSummary.trim());
        } else if (!responseData.functionCalls || responseData.functionCalls.length === 0) {
             addMessageToHistory('ai', "I couldn't generate a plan for that. Could you try a different prompt?");
        }

        let functionCallResults = false;
        if (responseData.functionCalls && responseData.functionCalls.length > 0) {
            for (const fc of responseData.functionCalls) {
                if (fc.name === "location") {
                    setPin(fc.args);
                    functionCallResults = true;
                } else if (fc.name === "line") {
                    setLeg(fc.args);
                }
            }
        }

        if (!functionCallResults && (!responseData.textSummary || !responseData.textSummary.trim())) {
            addMessageToHistory('ai', "No locations were found for your plan. Please try a different prompt.");
        }

        let maxDayInData = 0;
        currentTripData.locations.forEach(loc => {
            if (loc.day && loc.day > maxDayInData) maxDayInData = loc.day;
        });
        currentTripData.lines.forEach(line => {
            if (line.day && line.day > maxDayInData) maxDayInData = line.day;
        });

        const dayMatch = prompt.match(/(\d+)\s*-\s*day/i) || prompt.match(/(\d+)\s*day/i);
        let numDaysFromPrompt = 0;
        if (dayMatch && dayMatch[1]) numDaysFromPrompt = parseInt(dayMatch[1]);
        if (numDaysFromPrompt === 0 && prompt.toLowerCase().includes("tokyo") && !dayMatch) numDaysFromPrompt = 1;


        const effectiveNumDays = maxDayInData > 0 ? maxDayInData : (numDaysFromPrompt > 0 ? numDaysFromPrompt : 1);
        renderDayTabs(effectiveNumDays);

        currentTripData.popups.sort((a,b) => (a.day - b.day) || (a.sequence || Infinity) - (b.sequence || Infinity) || (a.time || "").localeCompare(b.time || ""));

        let initialTabToShow = 'all';
        if (effectiveNumDays === 1) {
             initialTabToShow = '1';
        }

        switchDayTab(initialTabToShow);

        if (currentTripData.popups.length > 0) {
             showTimeline();
        }

    } catch (e) {
        console.error('Error in sendText (processing backend response):', e);
        if (aiLoadingMessage) aiLoadingMessage.remove();
        addMessageToHistory('ai', `Sorry, an error occurred: ${e.message}`);
        if (chatErrorMessageElement) chatErrorMessageElement.textContent = e.message || "An error occurred processing your request.";
    } finally {
        if (generateButtonIcon) generateButtonIcon.className = 'fas fa-paper-plane';
        if (mapSpinner) mapSpinner.classList.add('hidden');
    }
}

function setPin(args) {
    if (!args || args.lat === undefined || args.lng === undefined || !args.name || !args.description || args.day === undefined || args.sequence === undefined) {
        console.warn("map-explorer-logic: Incomplete args for setPin:", args);
        return;
    }
    try {
        const point = { lat: Number(args.lat), lng: Number(args.lng) };
        if (isNaN(point.lat) || isNaN(point.lng) || point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) {
             console.warn("map-explorer-logic: Invalid coordinates for setPin:", args); return;
        }

        // Ensure 'price' and 'imageUrl' are captured from args
        const locationData = {
            ...args,
            lat: Number(args.lat),
            lng: Number(args.lng),
            day: Number(args.day),
            sequence: Number(args.sequence),
            price: args.price || null,
            imageUrl: args.imageUrl || null // **** CAPTURE IMAGE URL ****
        };
        currentTripData.locations.push(locationData);

        const marker = new AdvancedMarkerElement({ map: null, position: point, title: args.name });
        currentTripData.markers.push(marker);

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('map-popup-content-wrapper'); // For better styling control
        
        let imageHtml = '';
        // **** START: ADD IMAGE TO POPUP HTML ****
        if (locationData.imageUrl && typeof locationData.imageUrl === 'string' && locationData.imageUrl.startsWith('http')) {
            imageHtml = `<img src="${locationData.imageUrl}" alt="${locationData.name}" class="popup-image" onerror="this.style.display='none'; console.warn('Popup image failed to load: ${locationData.imageUrl}')">`;
        }
        // **** END: ADD IMAGE TO POPUP HTML ****
        
        contentDiv.innerHTML = `
            ${imageHtml}
            <div class="popup-text-content">
                <strong class="popup-title">${locationData.name}</strong><br/>
                <p class="popup-description">${locationData.description}</p>
                ${locationData.time ? `<div class="popup-time-info">Time: ${locationData.time}${locationData.duration ? ` (${locationData.duration})` : ''}</div>` : ''}
            </div>`;

        const popupInstance = new PopupClassImported(new google.maps.LatLng(point.lat, point.lng), contentDiv);

        currentTripData.popups.push({
            ...locationData, // Spread all of locationData, including imageUrl
            position: new google.maps.LatLng(point.lat, point.lng),
            popup: popupInstance,
            content: contentDiv,
        });

        if (!currentTripData.bounds && LatLngBounds) currentTripData.bounds = new LatLngBounds();
        if (currentTripData.bounds) currentTripData.bounds.extend(point);

    } catch (e) {
        console.error("Error in setPin:", e, "Args:", args);
    }
}

function setLeg(args) {
     if (!args || !args.start || !args.end || args.start.lat === undefined || args.start.lng === undefined ||
         args.end.lat === undefined || args.end.lng === undefined || !args.name || args.day === undefined ||
         !args.transport || !args.travelTime) {
        console.warn("map-explorer-logic: Incomplete args for setLeg :", args); return;
     }
    try {
        const start = { lat: Number(args.start.lat), lng: Number(args.start.lng) };
        const end = { lat: Number(args.end.lat), lng: Number(args.end.lng) };
        if (isNaN(start.lat) || isNaN(start.lng) || isNaN(end.lat) || isNaN(end.lng) ||
            start.lat < -90 || start.lat > 90 || start.lng < -180 || start.lng > 180 ||
            end.lat < -90 || end.lat > 90 || end.lng < -180 || end.lng > 180) {
             console.warn("map-explorer-logic: Invalid coordinates for setLeg:", args); return;
        }

        const polyOptions = { strokeOpacity: 0.0, strokeWeight: 3, map: null };
        const geodesicPolyOptions = {
            strokeColor: '#2196F3', strokeOpacity: 1.0, strokeWeight: 4, map: null,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '15px' }]
        };
        const poly = new google.maps.Polyline(polyOptions);
        const geodesicPoly = new google.maps.Polyline(geodesicPolyOptions);
        const path = [start, end];
        poly.setPath(path); geodesicPoly.setPath(path);

        currentTripData.lines.push({
            ...args,
            day: Number(args.day),
            start, end,
            poly, geodesicPoly
        });

        if (!currentTripData.bounds && LatLngBounds) currentTripData.bounds = new LatLngBounds();
        if (currentTripData.bounds) {
            currentTripData.bounds.extend(start);
            currentTripData.bounds.extend(end);
        }

     } catch(e) {
         console.error("Error in setLeg:", e, "Args:", args);
     }
}

// MODIFIED for Carousel Cards: No image, placeholder for price
// In map-explorer-logic.js

// MODIFIED for Carousel Cards: WITH image, placeholder for price
// In map-explorer-logic.js

// In map-explorer-logic.js

function createLocationCards(popupsToDisplay) {
  if (!cardContainer || !carouselIndicators) {
    console.warn("createLocationCards: cardContainer or carouselIndicators not found.");
    return;
  }
  cardContainer.innerHTML = '';
  carouselIndicators.innerHTML = '';

  if (popupsToDisplay.length === 0) {
    if (cardCarousel) cardCarousel.style.display = 'none';
    return;
  }
  if (cardCarousel) cardCarousel.style.display = 'block';

  // Sort popupsToDisplay to ensure cards are in chronological order if 'all' days view
  // This should already be sorted if coming from displayDataForDay, but an extra sort here for safety for this function's scope.
   popupsToDisplay.sort((a, b) => {
     const dayA = a.day === undefined ? Infinity : a.day;
     const dayB = b.day === undefined ? Infinity : b.day;
     const seqA = a.sequence === undefined ? Infinity : a.sequence;
     const seqB = b.sequence === undefined ? Infinity : b.sequence;
     const timeA = a.time || "";
     const timeB = b.time || "";

     if (dayA !== dayB) return dayA - dayB;
     if (seqA !== seqB) return seqA - seqB;
     return timeA.localeCompare(timeB);
   });


  popupsToDisplay.forEach((locationItem, index) => {
    // ✅ CRITICAL: Log the item to see if imageUrl is present
    // console.log(`Creating card ${index}:`, locationItem.name, "Image URL:", locationItem.imageUrl);

    const card = document.createElement('div');
    card.className = 'location-card day-planner-card';
    if (index === 0) card.classList.add('card-active'); // Highlight the first card by default

    let imageContentHtml = '';
    if (locationItem.imageUrl && typeof locationItem.imageUrl === 'string' && locationItem.imageUrl.startsWith('http')) {
      imageContentHtml = `<img src="${locationItem.imageUrl}" alt="${locationItem.name || 'Location image'}" class="card-img-tag" onerror="this.style.display='none'; this.parentElement.classList.add('no-image-fallback'); console.warn('Card image failed to load: ${locationItem.imageUrl}');">`;
    } else {
      // If no imageUrl, or it's invalid, show a placeholder or just the fallback background
      imageContentHtml = `<span class="card-image-placeholder-text">${locationItem.name ? locationItem.name.substring(0,1).toUpperCase() : '?'}</span>`; // Example: First letter
    }

    const imageContainerHtml = `<div class="card-image">${imageContentHtml}</div>`;

    let badgesHtml = '';
    if (locationItem.sequence !== undefined) badgesHtml += `<div class="card-sequence-badge">${locationItem.sequence}</div>`;
    if (locationItem.time) badgesHtml += `<div class="card-time-badge">${locationItem.time}</div>`;

    // Only show day indicator on cards if viewing "all" days and day is defined
    if (currentSelectedDay === 'all' && locationItem.day !== undefined) {
        badgesHtml += `<div class="card-day-indicator">Day ${locationItem.day}</div>`;
    }

    const textContentHtml = `
      <div class="card-content">
        <h3 class="card-title">${locationItem.name || 'Unnamed Location'}</h3>
        ${locationItem.price ? `<div class="card-price">${locationItem.price}</div>` : ''}
        <p class="card-description">${locationItem.description || 'No description available.'}</p>
        ${locationItem.duration ? `<div class="card-duration"><i class="fas fa-clock"></i> ${locationItem.duration}</div>` : ''}
        ${locationItem.rating ? `<div class="card-rating"><i class="fas fa-star"></i> ${locationItem.rating} (${locationItem.user_ratings_total || 0} reviews)</div>` : ''}
        ${locationItem.website ? `<div class="card-website"><a href="${locationItem.website}" target="_blank" rel="noopener noreferrer"><i class="fas fa-globe"></i> Website</a></div>` : ''}
        ${(locationItem.coordinatesSource === 'GooglePlaces' && locationItem.formatted_address) ? `<div class="card-address"><i class="fas fa-map-marker-alt"></i> ${locationItem.formatted_address}</div>` : ''}
      </div>
    `;

    // Assemble the card: image container, then badges (positioned absolutely), then text content
    card.innerHTML = imageContainerHtml + badgesHtml + textContentHtml;

    card.addEventListener('click', () => {
      highlightCard(index, popupsToDisplay);
      if (locationItem.position && map) {
        map.panTo(locationItem.position);
        // Optionally, slightly zoom in on the selected marker
        // if (map.getZoom() < 15) map.setZoom(15);
      }
    });
    cardContainer.appendChild(card);

    const dot = document.createElement('div');
    dot.className = 'carousel-dot';
    if (index === 0) dot.classList.add('active');
    dot.addEventListener('click', () => {
        highlightCard(index, popupsToDisplay);
        if (locationItem.position && map) map.panTo(locationItem.position);
    });
    carouselIndicators.appendChild(dot);
  });

  if (popupsToDisplay.length > 0) {
    highlightCard(0, popupsToDisplay); // Highlight the first card
  }
}

function createTimeline(popupsToDisplay, linesToDisplay) {
  if (!timeline) return;
  if (popupsToDisplay.length === 0) {
    timeline.innerHTML = 'No plan details for this day.';
    return;
  }
  timeline.innerHTML = '';

  popupsToDisplay.forEach((item, index) => {
    const timelineItem = document.createElement('div');
    timelineItem.className = 'timeline-item';
    if (item.type === 'meal') {
        timelineItem.classList.add('meal-item');
    }
    const timeDisplay = item.time || 'Flexible';
    timelineItem.innerHTML = `
      <div class="timeline-time">${timeDisplay}</div>
      <div class="timeline-connector"><div class="timeline-dot"></div><div class="timeline-line"></div></div>
      <div class="timeline-content" data-name="${item.name}" data-day="${item.day}" data-sequence="${item.sequence}">
        <div class="timeline-title">${item.type === 'meal' ? '<i class="fas fa-utensils"></i> ' : ''}${item.name}</div>
        <div class="timeline-description">${item.description}</div>
        ${item.duration ? `<div class="timeline-duration">${item.duration}</div>` : ''}
      </div>
    `;
    const timelineContent = timelineItem.querySelector('.timeline-content');
    if (timelineContent) {
      timelineContent.addEventListener('click', () => {
        const cardIdx = popupsToDisplay.findIndex(p => p.name === item.name && p.day === item.day && p.sequence === item.sequence);
        if (cardIdx !== -1 && popupsToDisplay[cardIdx] && popupsToDisplay[cardIdx].position && map) {
          highlightCard(cardIdx, popupsToDisplay);
          map.panTo(popupsToDisplay[cardIdx].position);
        }
      });
    }
    timeline.appendChild(timelineItem);

    if (index < popupsToDisplay.length - 1) {
        const currentLoc = popupsToDisplay[index];
        const nextLoc = popupsToDisplay[index+1];

        const connectingLine = linesToDisplay.find(line =>
            line.day === currentLoc.day &&
            currentLoc.position && nextLoc.position &&
            Math.abs(line.start.lat - currentLoc.position.lat()) < 0.0001 &&
            Math.abs(line.start.lng - currentLoc.position.lng()) < 0.0001 &&
            Math.abs(line.end.lat - nextLoc.position.lat()) < 0.0001 &&
            Math.abs(line.end.lng - nextLoc.position.lng()) < 0.0001
        );

        if (connectingLine && (connectingLine.transport || connectingLine.travelTime)) {
            const transportItem = document.createElement('div');
            transportItem.className = 'timeline-item transport-item';
            transportItem.innerHTML = `
              <div class="timeline-time"></div>
              <div class="timeline-connector"><div class="timeline-dot" style="background-color: #999;"></div><div class="timeline-line"></div></div>
              <div class="timeline-content transport">
                <div class="timeline-title"><i class="fas fa-${getTransportIcon(connectingLine.transport || 'route')}"></i> ${connectingLine.transport || 'Travel'}</div>
                <div class="timeline-description">${connectingLine.name}</div>
                ${connectingLine.travelTime ? `<div class="timeline-duration">${connectingLine.travelTime}</div>` : ''}
              </div>
            `;
            timeline.appendChild(transportItem);
        }
    }
  });
}

function getTransportIcon(transportType) {
  const type = (transportType || '').toLowerCase();
  if (type.includes('walk')) return 'walking';
  if (type.includes('car') || type.includes('driv')) return 'car-side';
  if (type.includes('bus') || type.includes('transit') || type.includes('public')) return 'bus-alt';
  if (type.includes('train') || type.includes('subway') || type.includes('metro')) return 'train';
  if (type.includes('bike') || type.includes('cycl')) return 'bicycle';
  if (type.includes('taxi') || type.includes('cab')) return 'taxi';
  if (type.includes('boat') || type.includes('ferry')) return 'ship';
  if (type.includes('plane') || type.includes('fly')) return 'plane-departure';
  return 'route';
}

function getPlaceholderImage(locationName) { // This is still used for map popups if image fails
  let hash = 0; for (let i = 0; i < (locationName || "L").length; i++) { hash = (locationName || "L").charCodeAt(i) + ((hash << 5) - hash); }
  const hue = hash % 360; const saturation = 60 + (hash % 30); const lightness = 55 + (hash % 20);
  const letter = (locationName || "L").charAt(0).toUpperCase() || '?';
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180"><rect width="300" height="180" fill="hsl(${hue}, ${saturation}%, ${lightness}%)" /><text x="150" y="95" font-family="Arial, Helvetica, sans-serif" font-size="80" fill="rgba(255,255,255,0.8)" text-anchor="middle" dominant-baseline="middle" font-weight="bold">${letter}</text></svg>`)}`;
}

function highlightCard(index, currentCardSet) {
  activeCardIndex = index;
  const cards = cardContainer?.querySelectorAll('.location-card');

  if (!cards || cards.length === 0 || !currentCardSet || currentCardSet.length === 0 || index >= currentCardSet.length || index < 0) {
      currentTripData.popups.forEach(pData => {
          if (pData.popup) pData.popup.setMap(null);
          if (pData.content) pData.content.classList.remove('popup-active');
      });
      cards?.forEach(card => card.classList.remove('card-active'));
      carouselIndicators?.querySelectorAll('.carousel-dot').forEach(dot => dot.classList.remove('active'));
      return;
  }

  cards.forEach(card => card.classList.remove('card-active'));
  if (cards[index]) {
    cards[index].classList.add('card-active');
    const scrollLeft = cards[index].offsetLeft - (cardContainer.offsetWidth / 2) + (cards[index].offsetWidth / 2);
    cardContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
  }

  const dots = carouselIndicators?.querySelectorAll('.carousel-dot');
  dots?.forEach((dot, i) => dot.classList.toggle('active', i === index));

  currentTripData.popups.forEach(pData => {
      if (pData.popup) pData.popup.setMap(null);
      if (pData.content) pData.content.classList.remove('popup-active');
  });

  const activeLocationItem = currentCardSet[index];
  if (activeLocationItem && activeLocationItem.popup && activeLocationItem.position && map) {
      activeLocationItem.popup.setMap(map);
      if (activeLocationItem.content) activeLocationItem.content.classList.add('popup-active');
  }

  highlightTimelineItem(activeLocationItem);
}

function highlightTimelineItem(activeLocation) {
  if (!timeline || !activeLocation) return;
  const items = timeline.querySelectorAll('.timeline-content:not(.transport)');
  items.forEach(item => item.classList.remove('active'));

  for (const item of items) {
    if (item.dataset.name === activeLocation.name &&
        item.dataset.day && parseInt(item.dataset.day) === activeLocation.day &&
        item.dataset.sequence && parseInt(item.dataset.sequence) === activeLocation.sequence
        ) {
      item.classList.add('active');
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      break;
    }
  }
}

function navigateCards(direction) {
    let currentPopupsInView;
    if (currentSelectedDay === 'all') {
        currentPopupsInView = [...currentTripData.popups].sort((a,b) => (a.day - b.day) || (a.sequence || Infinity) - (b.sequence || Infinity) || (a.time || "").localeCompare(b.time || ""));
    } else {
        currentPopupsInView = currentTripData.popups.filter(p => p.day === parseInt(currentSelectedDay))
                                .sort((a,b) => (a.sequence || Infinity) - (b.sequence || Infinity) || (a.time || "").localeCompare(b.time || ""));
    }

    if (!currentPopupsInView || currentPopupsInView.length === 0) return;

    let newIndex = activeCardIndex + direction;

    if (newIndex >= currentPopupsInView.length) newIndex = 0;
    if (newIndex < 0) newIndex = currentPopupsInView.length - 1;

    if (newIndex >= 0 && newIndex < currentPopupsInView.length && currentPopupsInView[newIndex].position && map) {
        highlightCard(newIndex, currentPopupsInView);
        map.panTo(currentPopupsInView[newIndex].position);
    }
}

function exportDayPlan() {
    let content = `# Your Trip Plan\n\n`;
    let daysProcessed = new Set();

    const sortedPopupsForExport = [...currentTripData.popups].sort((a,b) => (a.day - b.day) || (a.sequence || Infinity) - (b.sequence || Infinity) || (a.time || "").localeCompare(b.time || ""));

    sortedPopupsForExport.forEach((item, locIndex) => {
        if (!daysProcessed.has(item.day)) {
            content += `## Day ${item.day}\n\n`;
            daysProcessed.add(item.day);
        }
        content += `### ${item.sequence}. ${item.name}\n`;
        if (item.price) content += `Price: ${item.price}\n`; // Include price in export
        if (item.time) content += `Time: ${item.time}\n`;
        if (item.duration) content += `Duration: ${item.duration}\n`;
        content += `${item.description}\n\n`;

        if (locIndex < sortedPopupsForExport.length - 1) {
            const nextItemInPlan = sortedPopupsForExport[locIndex + 1];
            if (nextItemInPlan.day === item.day && item.position && nextItemInPlan.position) {
                const connectingLine = currentTripData.lines.find(line =>
                    line.day === item.day &&
                    Math.abs(line.start.lat - item.position.lat()) < 0.0001 &&
                    Math.abs(line.start.lng - item.position.lng()) < 0.0001 &&
                    Math.abs(line.end.lat - nextItemInPlan.position.lat()) < 0.0001 &&
                    Math.abs(line.end.lng - nextItemInPlan.position.lng()) < 0.0001
                );
                if (connectingLine) {
                    content += `**Travel to ${nextItemInPlan.name}**\n`;
                    content += `Mode: ${connectingLine.transport || 'Not specified'}\n`;
                    if (connectingLine.travelTime) content += `Time: ${connectingLine.travelTime}\n`;
                    content += '\n';
                }
            }
        }
    });
    if (sortedPopupsForExport.length === 0) {
        content = "No trip plan to export.";
    }
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'trip-plan.md'; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

// **** EXPORTED INITIALIZATION FUNCTION ****
export async function initExplorer(geminiApiKeyFromFlask, myTripsSectionDomElement) {
    console.log("map-explorer-logic: Initializing for multi-day planner (backend driven)...");
    myTripsSectionElement = myTripsSectionDomElement;

    if (geminiApiKeyFromFlask) {
        try {
            genAI = new GoogleGenerativeAI(geminiApiKeyFromFlask);
        } catch (e) {
            console.warn("map-explorer-logic: Frontend Gemini AI client failed to initialize.", e);
            genAI = null;
        }
    } else {
        console.warn("map-explorer-logic: Gemini API Key not provided for frontend SDK.");
        genAI = null;
    }

    dayTabsBar = document.getElementById('day-tabs-bar');
    promptInput = document.getElementById('prompt-input');
    generateButton = document.getElementById('generate');
    resetButton = document.getElementById('reset');
    cardContainer = document.getElementById('card-container');
    carouselIndicators = document.getElementById('carousel-indicators');
    prevCardButton = document.getElementById('prev-card');
    nextCardButton = document.getElementById('next-card');
    cardCarousel = document.querySelector('#my-trips .card-carousel');
    timelineContainer = document.getElementById('timeline-container');
    timeline = document.getElementById('timeline');
    closeTimelineButton = document.getElementById('close-timeline');
    exportPlanButton = document.getElementById('export-plan');
    timelineToggle = document.getElementById('timeline-toggle');
    mapSpinner = document.getElementById('map-spinner');
    chatErrorMessageElement = document.getElementById('chat-error-message');
    chatWrapper = document.getElementById('chat-wrapper');
    chatToggleFab = document.getElementById('chat-toggle-fab');
    closeChatButton = document.getElementById('close-chat-button');
    messagesHistoryContainer = document.getElementById('messages-history');
    timelineDayHeader = document.getElementById('timeline-day-header');

    const criticalElements = { dayTabsBar, promptInput, generateButton, cardContainer, carouselIndicators, cardCarousel, documentIdMap: document.getElementById('map') };
    for (const elName in criticalElements) {
        if (!criticalElements[elName]) {
            console.error(`map-explorer-logic: Essential HTML element '${elName}' not found!`);
            if (chatErrorMessageElement) chatErrorMessageElement.textContent = "Initialization Error: UI components missing.";
            return false;
        }
    }

    try {
        const mapsLib = await google.maps.importLibrary('maps');
        Map = mapsLib.Map;
        AdvancedMarkerElement = (await google.maps.importLibrary('marker')).AdvancedMarkerElement;
        const coreLib = await google.maps.importLibrary('core');
        LatLngBounds = coreLib.LatLngBounds;

        PopupClassImported = class Popup extends google.maps.OverlayView {
            position; containerDiv;
            constructor(position, content) {
              super(); this.position = position;
              const contentEl = (content instanceof HTMLElement) ? content : (() => { const d = document.createElement('div'); d.innerHTML = content; return d; })();
              contentEl.classList.add('popup-bubble');
              this.containerDiv = document.createElement('div');
              this.containerDiv.classList.add('popup-container');
              this.containerDiv.appendChild(contentEl);
              google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.containerDiv);
            }
            onAdd() { this.getPanes()?.floatPane?.appendChild(this.containerDiv); }
            onRemove() { if (this.containerDiv.parentElement) { this.containerDiv.parentElement.removeChild(this.containerDiv); } }
            draw() {
                const projection = this.getProjection(); if (!projection) return;
                const divPosition = projection.fromLatLngToDivPixel(this.position); if (!divPosition) return;
                const display = Math.abs(divPosition.x) < 4000 && Math.abs(divPosition.y) < 4000 ? 'block' : 'none';
                if (display === 'block') { this.containerDiv.style.left = divPosition.x + 'px'; this.containerDiv.style.top = divPosition.y + 'px'; }
                if (this.containerDiv.style.display !== display) { this.containerDiv.style.display = display; }
            }
        };

map = new google.maps.Map(document.getElementById('map'), {
  center: { lat: 35.2285, lng: 126.8450 }, // Example: central Seoul
  zoom: 19, // Must be high to activate 3D buildings
  tilt: 67.5, // Max tilt for best perspective
  heading: 45, // You can animate this or set it to a static value
  mapId: '4504f8b37365c3d0', // ✔️ WebGL-enabled Map ID (keep this)
  mapTypeId: 'satellite',
  gestureHandling: 'greedy',
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
});

        window.myTripsMapInstance = map;
        console.log("map-explorer-logic: Map initialized.");

        if (LatLngBounds) {
            currentTripData.bounds = new LatLngBounds();
        }

        promptInput.addEventListener('keydown', (e) => { if (e.code === 'Enter' && !e.shiftKey) { e.preventDefault(); generateButton.click(); } });
        generateButton.addEventListener('click', () => { if(promptInput && promptInput.value.trim() !== "") { sendText(promptInput.value.trim()); } });
        resetButton.addEventListener('click', () => {
            restart();
            if(promptInput) promptInput.value = '';
            if(messagesHistoryContainer) messagesHistoryContainer.innerHTML = '';
            addMessageToHistory('ai', "Hi there! How many days would you like to plan for, and where to?");
        });
        prevCardButton.addEventListener('click', () => navigateCards(-1));
        nextCardButton.addEventListener('click', () => navigateCards(1));
        if (closeTimelineButton) closeTimelineButton.addEventListener('click', hideTimeline);
        if (timelineToggle) timelineToggle.addEventListener('click', showTimeline);
        if (exportPlanButton) exportPlanButton.addEventListener('click', exportDayPlan);
        if (chatToggleFab) chatToggleFab.addEventListener('click', toggleChatVisibility);
        if (closeChatButton) closeChatButton.addEventListener('click', toggleChatVisibility);

        renderDayTabs(0);
        switchDayTab('all');

        setChatVisibility(false);
        addMessageToHistory('ai', "Hi there! How many days would you like to plan for, and where to?");

        console.log("map-explorer-logic: All event listeners added and initial UI set.");
        return true;

    } catch (error) {
        console.error("map-explorer-logic: Initialization failed during try block:", error);
        if(chatErrorMessageElement) chatErrorMessageElement.textContent = `Initialization Error: ${error.message}. Check console.`;
        window.myTripsMapInstance = null;
        return false;
    }
}


