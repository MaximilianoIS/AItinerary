// static/dashboard-logic.js

// Import the initialization function from the map explorer logic
import { initExplorer } from './map-explorer-logic.js';
// Import the initialization function for the Friends feature
import { initFriendsFeature } from './friends-logic.js'; // <<< ADDED IMPORT

document.addEventListener('DOMContentLoaded', () => {
    // --- General Elements ---
    const segments = document.querySelectorAll('.segment');
    const sections = document.querySelectorAll('.section');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const myTripsSection = document.getElementById('my-trips'); // For chat open class

    let mapExplorerInitialized = false;
    // let friendsFeatureInitialized = false; // Optional: if you want initFriendsFeature to run only once

    // --- API Keys ---
    const GEMINI_API_KEY = window.FRONTEND_CONFIG?.GEMINI_API_KEY;
    if (typeof GEMINI_API_KEY !== 'string' || GEMINI_API_KEY.trim() === "" || GEMINI_API_KEY.startsWith("{{") || GEMINI_API_KEY.includes("undefined")) {
        console.error("Dashboard Logic: Gemini API Key not found or not replaced by Flask. Key:", GEMINI_API_KEY);
        const errDiv = document.getElementById('chat-error-message');
        if (errDiv) errDiv.textContent = "Configuration Error: Missing API Key.";
    } else {
        console.log("Dashboard Logic: GEMINI_API_KEY appears valid ✅");
    }

    // ===========================================
    // MAP EXPLORER INITIALIZATION TRIGGER
    // ===========================================
    async function initializeMapExplorerIfNeeded() {
        if (!GEMINI_API_KEY || mapExplorerInitialized) {
            return mapExplorerInitialized;
        }
        console.log("Dashboard Logic: Triggering Map Explorer Initialization...");
        const success = await initExplorer(GEMINI_API_KEY, myTripsSection);
        mapExplorerInitialized = success;
        if (!success) {
            console.error("Dashboard Logic: Map Explorer initialization failed.");
        }
        return success;
    }

    // ===========================================
    // TAB SWITCHING LOGIC
    // ===========================================
    const tabsConfig = {
        "my-trips-tab": { id: "my-trips", initFn: initializeMapExplorerIfNeeded, mapInstance: () => window.myTripsMapInstance },
        "around-me-tab": { id: "around-me" },
        "friends-tab": { id: "friends", initFn: initFriendsFeature }, // <<< ADDED initFn for friends
        "settings-tab": { id: "settings" }
    };

    segments.forEach(btn => {
        btn.addEventListener('click', async () => {
            segments.forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            sections.forEach(s => s.classList.remove('active'));

            const config = tabsConfig[btn.id];
            if (config && config.id) {
                const targetSection = document.getElementById(config.id);
                if (targetSection) {
                    targetSection.classList.add('active');

                    // MODIFIED: Generalized initFn call
                    if (typeof config.initFn === 'function') {
                        // Example for one-time init (optional, friends-logic is currently idempotent)
                        // if (config.id === 'friends' && !friendsFeatureInitialized) {
                        //    await config.initFn();
                        //    friendsFeatureInitialized = true;
                        // } else if (config.id === 'my-trips' && !mapExplorerInitialized) { // Already handled by initializeMapExplorerIfNeeded
                        //    await config.initFn();
                        // } else if (config.id !== 'friends' && config.id !== 'my-trips') { // For other tabs if needed
                        //    await config.initFn();
                        // }
                        // Simpler: just call it. The initFn should be idempotent or handle re-runs.
                        // initFriendsFeature is designed to be re-run (clears map, lists)
                        // initializeMapExplorerIfNeeded handles its own "already initialized" state.
                        console.log(`Dashboard Logic: Calling initFn for tab ${config.id}`);
                        await config.initFn(); // Assuming initFn might be async
                    }

                    // Map resize logic (specific to My Trips for now, Friends map handles its own resize via Google Maps API)
                    const mapInstance = (config.id === 'my-trips' && typeof config.mapInstance === 'function') ? config.mapInstance() : null;
                    if (mapInstance && google && google.maps && google.maps.event) {
                        setTimeout(() => {
                            try {
                                google.maps.event.trigger(mapInstance, 'resize');
                                console.log(`Dashboard Logic: Resized map for tab: ${config.id}`);
                            } catch (e) {
                                console.error(`Dashboard Logic: Error resizing map for ${config.id}`, e);
                            }
                        }, 50);
                    } else if (config.id === 'my-trips' && config.mapInstance && !mapInstance) {
                         console.warn(`Dashboard Logic: My Trips map instance not ready or not found for resize.`);
                    }
                    // Note: The Friends map (friendsMap in friends-logic.js) will resize automatically
                    // when its container becomes visible if Google Maps API is loaded.
                    // If explicit resize is needed for friendsMap, friends-logic.js should handle it.
                    // The original dashboard-logic.js had a 'resize' for 'around-me' tab too,
                    // if window.globalMap existed. You might need to add similar logic for other maps.

                } else {
                    console.error(`Dashboard Logic: Section with ID '${config.id}' not found.`);
                }
            } else if (btn.id === "around-me-tab") { // Handle around-me if no specific config
                 const targetSection = document.getElementById("around-me");
                 if(targetSection) targetSection.classList.add('active');
            }
            else {
                console.error(`Dashboard Logic: No configuration found for tab button ID '${btn.id}'`);
            }
        });
    });

    // ===========================================
    // SETTINGS LOGIC
    // ===========================================
    const applyTheme = (isDark) => { if(isDark){document.body.classList.add('dark-mode');localStorage.setItem('theme','dark');}else{document.body.classList.remove('dark-mode');localStorage.setItem('theme','light');}};
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') { if (darkModeToggle) darkModeToggle.checked = true; applyTheme(true); } else { if (darkModeToggle) darkModeToggle.checked = false; applyTheme(false); }
    if (darkModeToggle) { darkModeToggle.addEventListener('change', () => applyTheme(darkModeToggle.checked)); }

    // ===========================================
    // INITIAL TAB ACTIVATION & MAP INIT
    // ===========================================
    const activeDefaultTabButton = document.querySelector('.segment.active');
    if (activeDefaultTabButton) {
        const config = tabsConfig[activeDefaultTabButton.id];
        if (config && config.id) {
            const section = document.getElementById(config.id);
            if (section) section.classList.add('active'); // Ensure section is active

            if (typeof config.initFn === 'function') {
                console.log(`Dashboard Logic: Initializing default tab '${config.id}' logic...`);
                setTimeout(async () => { // Use async here if initFn is async
                     await config.initFn();
                }, 100); // Small delay for layout to settle
            }
        }
    } else {
        // Fallback or default if no tab is marked active in HTML
        // For example, activate "My Trips" by default
        const myTripsTabButton = document.getElementById('my-trips-tab');
        if (myTripsTabButton) {
            myTripsTabButton.click(); // Simulate a click to trigger its logic
            console.log("Dashboard Logic: No default active tab found, activating 'My Trips'.");
        }
    }

}); // End DOMContentLoaded