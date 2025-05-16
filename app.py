# --- START OF MODIFIED app.py (MASTER FILE) ---

import os
import requests
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import re # For extracting potential city names
from typing import Tuple, Dict, Any, Optional # For type hints
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json # Added for preferences

# Load API keys from .env
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GOOGLE_SEARCH_API_KEY = os.getenv("GOOGLE_SEARCH_API_KEY") # Used for Custom Search (Images) and Places/Geocoding
GOOGLE_SEARCH_ENGINE_ID = os.getenv("GOOGLE_SEARCH_ENGINE_ID")
GOOGLE_MAPS_API_KEY_FRONTEND = os.getenv("GOOGLE_MAPS_API_KEY_FRONTEND")
GEO_NAMES_API_USERNAME = os.getenv("GEO_NAMES_API_USERNAME") # Changed from GEO_NAMES_API_KEY to GEO_NAMES_API_USERNAME for clarity

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY is not set in the environment variables.")
if not GOOGLE_SEARCH_API_KEY:
     print("WARNING: GOOGLE_SEARCH_API_KEY not set. Image fetching and coordinate/place details verification will be disabled for structured trips and friends features.")
if not GOOGLE_SEARCH_ENGINE_ID:
    print("WARNING: GOOGLE_SEARCH_ENGINE_ID not set. Image fetching for popups and welcome page carousels will be disabled.")
if not GOOGLE_MAPS_API_KEY_FRONTEND:
    print("WARNING: GOOGLE_MAPS_API_KEY_FRONTEND not set. Maps may not function correctly on the frontend.")
if not GEO_NAMES_API_USERNAME:
    print("WARNING: GEO_NAMES_API_USERNAME not set. Nearby city search for 'Around Me' feature will be disabled.")


# Gemini endpoint (using master's version)
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent"
# GeoNames endpoint
GEO_NAMES_API_URL = "http://api.geonames.org/findNearbyPlaceNameJSON" # From second app.py (will use https in JS)

# Flask setup
app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///friends.db"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- Preference Data File ---
DATA_FILE = 'user_preferences.json'

# --- Database Models (for Friends feature) ---
class Friend(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    lat = db.Column(db.Float)
    lng = db.Column(db.Float)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    visits = db.relationship('Visit', backref='friend', lazy=True, cascade="all, delete-orphan")

class Visit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    friend_id = db.Column(db.Integer, db.ForeignKey('friend.id'), nullable=False)
    place = db.Column(db.String(150))
    lat = db.Column(db.Float)
    lng = db.Column(db.Float)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────
# SYSTEM PROMPTS & FUNCTION DECLARATIONS FOR BACKEND GEMINI CALL (Structured Trips)
# ─────────────────────────────────────────────────
BACKEND_SYSTEM_PROMPT_FOR_STRUCTURED_PLAN = (
    "You are a travel planning assistant. Your primary goal is to generate structured travel itineraries "
    "using the provided 'location' and 'line' function tools for every point of interest and travel segment. "
    "The user might provide some personal preferences (like dietary needs or interests) which you should try to incorporate. "
    "For the 'location' tool, the 'name' property MUST be the common, well-known, and easily searchable name of the landmark, park, museum, restaurant, or specific point of interest. Include the city or general area if it helps disambiguate (e.g., 'Eiffel Tower Paris', 'Ueno Park Tokyo', 'The Met Fifth Avenue New York', 'Jantchi Korean Restaurant New York'). Avoid overly generic names if a specific one exists, especially for restaurants. "
    "Each destination MUST include name, description, latitude, longitude, a suggested time (e.g., '09:00', 'Afternoon'), "
    "a suggested duration (e.g., '1 hour', '2-3 hours'), a sequence number for that day (e.g., 1, 2), and the day number "
    "of the itinerary it belongs to (e.g., day: 1, day: 2). "
    "Each transportation leg (line) MUST include start/end coordinates, name, mode of transport, travel time, and the day number. "
    "Incorporate meal stops for breakfast, lunch, and dinner into the itinerary. Consider user's dietary preferences if provided. "
    "Plan for breakfast around 08:00, lunch around 12:00-13:00, and dinner around 19:00-21:00. Adjust slightly based on activity flow and local customs. "
    "For each meal, you MUST use the 'location' function call. "
    "Try your best to suggest *specific, well-known, or highly-rated local restaurants* by name if possible, or a very specific type of dining experience/area that is highly searchable. If user has dietary preferences, try to find suitable options. "
    "The 'name' for a meal location should be the specific restaurant name if suggesting one (e.g., 'Katz's Delicatessen New York') or a descriptive and searchable name if suggesting an area or type (e.g., 'Lunch: Traditional Japanese Meal near Senso-ji', 'Dinner: Tapas in El Born Barcelona'). "
    "The 'description' should briefly describe the meal, suggest types of local food or specific dishes to try (e.g., 'Enjoy authentic ramen for lunch', 'Explore various pintxos for dinner'). If suggesting a specific restaurant name, you can briefly mention its cuisine or what it's known for. "
    "For 'lat' and 'lng' for meals: Provide coordinates that are REASONABLY CLOSE to the specific restaurant if you know one, or a central point in the suggested dining area or near the previous point of interest. The backend will verify coordinates, but providing plausible ones helps. "
    "Suggest local restaurants or types of cuisine. Be specific about the type of food (e.g., 'Korean BBQ', 'dumpling house', 'seafood market'). "
    "Ensure meal times, suggested durations (e.g., breakfast: '30-45 minutes', lunch: '1 hour', dinner: '1-1.5 hours'), and locations fit logically within the day's schedule and activities. Meals should also have a 'sequence' number and 'day' property. "
    "If the user asks for a multi-day trip (e.g., '3-day trip to Tokyo'), ensure all locations and legs (including meals) have the correct 'day' property. "
    "If the user simply says the name of a city (e.g., 'Tokyo' or 'Paris'), generate a full itinerary as if they said: "
    "'Plan a 1-day trip in [City Name], with 3-5 stops, including breakfast, lunch, dinner, and short walking or public transport segments. Ensure all items have day: 1.' "
    "If user preferences regarding interests are provided, try to include activities or locations that align with those interests. "
    "After providing all function calls, provide a brief overall textual summary of the trip."
    "Do not include markdown like ```json in your function call arguments or textual response. Structure the output as function calls followed by the text summary."
)

LOCATION_FUNCTION_DECLARATION_BACKEND = {
    "name": "location",
    "description": "Record a specific location or point of interest in the itinerary.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "name": {"type": "STRING", "description": "Specific, searchable name of the location (e.g., 'Eiffel Tower Paris', 'Golden Gate Bridge San Francisco', 'The Met Fifth Avenue New York', 'Katz's Delicatessen New York')."},
            "description": {"type": "STRING", "description": "A concise description of the location and why it's relevant."},
            "lat": {"type": "STRING", "description": "Latitude of the location (backend will attempt to verify)."},
            "lng": {"type": "STRING", "description": "Longitude of the location (backend will attempt to verify)."},
            "time": {"type": "STRING", "description": "Suggested visit time (e.g., '09:00', 'Afternoon')."},
            "duration": {"type": "STRING", "description": "Suggested visit duration (e.g., '1 hour', '2-3 hours')."},
            "sequence": {"type": "NUMBER", "description": "Order/sequence number for this location within the day's itinerary (starting from 1)."},
            "day": {"type": "NUMBER", "description": "The day number in the overall multi-day itinerary this location belongs to (e.g., 1, 2, 3)."}
        },
        "required": ["name", "description", "lat", "lng", "day", "sequence", "time", "duration"]
    }
}

LINE_FUNCTION_DECLARATION_BACKEND = {
    "name": "line",
    "description": "Record a travel segment (leg) between two locations.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "name": {"type": "STRING", "description": "Name of the travel route or segment (e.g., 'Walk to next location', 'Bus to Museum')."},
            "start": {
                "type": "OBJECT", "description": "Start coordinates of the travel leg.",
                "properties": {"lat": {"type": "STRING"}, "lng": {"type": "STRING"}}, "required": ["lat", "lng"]
            },
            "end": {
                "type": "OBJECT", "description": "End coordinates of the travel leg.",
                "properties": {"lat": {"type": "STRING"}, "lng": {"type": "STRING"}}, "required": ["lat", "lng"]
            },
            "transport": {"type": "STRING", "description": "Mode of transport (e.g., 'walking', 'bus', 'subway', 'taxi', 'driving')."},
            "travelTime": {"type": "STRING", "description": "Estimated travel time for this leg (e.g., '15 minutes', '1 hour')."},
            "day": {"type": "NUMBER", "description": "The day number in the overall multi-day itinerary this travel leg belongs to."}
        },
        "required": ["name", "start", "end", "day", "transport", "travelTime"]
    }
}

# --- Preference Helper Functions (Using master's versions) ---
def read_preferences():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                print(f"Warning: Could not decode JSON from {DATA_FILE}. Returning empty preferences.")
                return {}
    return {}

def save_preferences(username, preferences_data): # Renamed 'preferences' to 'preferences_data' to avoid conflict
    all_preferences = read_preferences()
    all_preferences[username] = preferences_data
    with open(DATA_FILE, 'w') as f:
        json.dump(all_preferences, f, indent=4)

def build_personalized_prompt(user_input, preferences):
    dietary = ", ".join(preferences.get("dietary", []))
    allergies = preferences.get("allergies", "")
    interests = ", ".join(preferences.get("interests", []))

    details = []
    if dietary:
        details.append(f"The user prefers the following dietary options: {dietary}.")
    if allergies:
        details.append(f"They are allergic to: {allergies}.")
    if interests:
        details.append(f"The user is interested in these kinds of places or activities: {interests}.")

    preference_context = ""
    if details:
        preference_context = "User Preferences to consider: " + " ".join(details) + "\n\n"

    return f"{preference_context}Original Request: {user_input}"


# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

@app.route("/")
def index():
    firebase_config = {
        "apiKey": os.getenv("FIREBASE_API_KEY"),
        "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN"),
        "projectId": os.getenv("FIREBASE_PROJECT_ID"),
        "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET"),
        "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID"),
        "appId": os.getenv("FIREBASE_APP_ID"),
        "measurementId": os.getenv("FIREBASE_MEASUREMENT_ID")
    }
    return render_template("index.html", firebase_config=firebase_config)

@app.route("/")
def welcome():
    return render_template("welcome.html")

@app.route("/login")
def login():
    return render_template("login.html")


@app.route("/preference", methods=["GET", "POST"])
def preference_route():
    if request.method == "POST":
        data = request.get_json()
        username = data.get("username") # Username should be sent by the client on POST
        dietary = data.get("dietary", [])
        allergies = data.get("allergies", "")
        interests = data.get("interests", [])

        if not username:
            # For POST, username is critical for saving.
            return jsonify({"error": "Username is required to save preferences"}), 400

        user_prefs_to_save = {
            "dietary": dietary,
            "allergies": allergies,
            "interests": interests
        }
        save_preferences(username, user_prefs_to_save)
        print(f"Preferences saved for {username}: {user_prefs_to_save}")
        return jsonify({"message": f"Preferences saved successfully for {username}"}), 200
    else: # GET request

        username_from_query = request.args.get("username") # e.g., /preference?username=max
        current_username_for_template = None
        current_prefs_for_template = {}

        if username_from_query:
            all_user_prefs_from_file = read_preferences()
            current_prefs_for_template = all_user_prefs_from_file.get(username_from_query, {})
            current_username_for_template = username_from_query
            print(f"Loading preference page for {username_from_query} with prefs: {current_prefs_for_template}")
        else:
            # If no username in query, the preference.html JS should handle fetching for the logged-in user.
            # Or, if accessed directly without JS, it'll be an empty form for a 'guest' conceptually.
            print("Preference page loaded via GET without a username query param. JS should populate if user is logged in.")

        return render_template(
            "preference.html",
            username=current_username_for_template, # Pass to template (can be None)
            preferences=current_prefs_for_template   # Pass to template (can be empty dict)
        )



@app.route("/dashboard")
def dashboard():
    return render_template(
        "dashboard.html",
        google_maps_api_key=GOOGLE_MAPS_API_KEY_FRONTEND or "",
    )




@app.route('/api/cities', methods=['GET']) # From second app.py
def get_nearby_cities():
    lat_str = request.args.get('lat')
    lng_str = request.args.get('lng')
    radius_km_str = request.args.get('radius', '100') # Default to 100km as string

    if not GEO_NAMES_API_USERNAME:
        return jsonify({"error": "GeoNames API username not configured on server."}), 500

    try:
        lat = float(lat_str)
        lng = float(lng_str)
        radius_km = float(radius_km_str)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid latitude, longitude, or radius parameters."}), 400

    params = {
        'lat': lat,
        'lng': lng,
        'radius': radius_km,
        'maxRows': 30,  # Increased for better selection, as in aroundme.js
        'username': GEO_NAMES_API_USERNAME,
        'featureClass': 'P', # To get populated places
        'featureCode': 'PPL' # Specifically populated place
    }
    
    try:
        response = requests.get(GEO_NAMES_API_URL, params=params, timeout=10)
        response.raise_for_status() # Will raise an HTTPError for bad responses (4XX or 5XX)
        data = response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching from GeoNames: {e}")
        return jsonify({"error": f"Could not connect to GeoNames API: {e}"}), 503
    except json.JSONDecodeError:
        print(f"Error decoding GeoNames JSON response: {response.text}")
        return jsonify({"error": "Invalid response from GeoNames API."}), 502


    cities = []
    if 'geonames' in data:
        for city_data in data.get('geonames', []):
            # Ensure essential fields exist
            if all(k in city_data for k in ('name', 'lat', 'lng')):
                 cities.append({
                    'name': city_data['name'],
                    'lat': city_data['lat'],
                    'lng': city_data['lng'],
                    'countryName': city_data.get('countryName', 'N/A'), # Add more details if available
                    'fclName': city_data.get('fclName', 'N/A') # Feature class name
                })
    return jsonify(cities)

# --- End of routes from second app.py ---


@app.route("/generate_structured_trip", methods=["POST"])
def generate_structured_trip():
    data = request.get_json()
    if not data or "prompt" not in data:
        return jsonify({"error": "Missing 'prompt' in request"}), 400

    user_base_prompt = data["prompt"]
    username = data.get("username", "guest_user") 

    preferences = read_preferences().get(username, {})
    personalized_user_prompt = build_personalized_prompt(user_base_prompt, preferences)
    print(f"--- app.py DEBUG: Personalized prompt for '{username}' for structured trip: {personalized_user_prompt[:200]}...")
    
    headers = {"Content-Type": "application/json"}
    params = {"key": GEMINI_API_KEY}

    gemini_request_body = {
        "contents": [{"role": "user", "parts": [{"text": personalized_user_prompt}]}],
        "systemInstruction": {"parts": [{"text": BACKEND_SYSTEM_PROMPT_FOR_STRUCTURED_PLAN}]},
        "tools": [{"functionDeclarations": [LOCATION_FUNCTION_DECLARATION_BACKEND, LINE_FUNCTION_DECLARATION_BACKEND]}],
        "tool_config": {"function_calling_config": {"mode": "ANY"}}
    }

    try:
        print(f"--- app.py DEBUG: Sending to Gemini for structured trip (original base: {user_base_prompt[:100]}...).")
        resp = requests.post(GEMINI_URL, params=params, headers=headers, json=gemini_request_body, timeout=90)
        resp.raise_for_status()
        gemini_data = resp.json()

        text_summary = ""
        processed_function_calls = []

        if "candidates" in gemini_data and gemini_data["candidates"]:
            candidate = gemini_data["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"]:
                for part in candidate["content"]["parts"]:
                    if "text" in part:
                        text_summary += part["text"] + "\n"
                    elif "functionCall" in part:
                        fc = part["functionCall"]
                        if fc["name"] == "location":
                            location_name_from_gemini = fc["args"].get("name", "")
                            
                            verified_lat, verified_lng = None, None
                            coordinates_source = "Gemini"
                            # place_details = {} # Not directly used here, can be removed if not needed later

                            # Using GOOGLE_SEARCH_API_KEY for Places API as it's more likely to have Places enabled
                            if GOOGLE_SEARCH_API_KEY and location_name_from_gemini:
                                try:
                                    print(f"--- app.py DEBUG: Calling get_accurate_coords_places for: '{location_name_from_gemini}'")
                                    verified_lat, verified_lng = get_accurate_coords_places(location_name_from_gemini)
                                    if verified_lat is not None and verified_lng is not None:
                                        coordinates_source = "GooglePlaces"
                                    else:
                                        print(f"--- app.py DEBUG: get_accurate_coords_places found no match for '{location_name_from_gemini}'. Using Gemini coords.")
                                except Exception as geo_e:
                                     print(f"--- app.py DEBUG: get_accurate_coords_places lookup failed for '{location_name_from_gemini}': {geo_e}.")
                            else:
                                print("--- app.py DEBUG: Skipping Google Places verification (API key for Places missing or no location name).")

                            if verified_lat is not None and verified_lng is not None:
                                fc["args"]["lat"] = str(verified_lat)
                                fc["args"]["lng"] = str(verified_lng)
                            
                            fc["args"]["coordinatesSource"] = coordinates_source
                            
                            search_name = location_name_from_gemini or fc["args"].get("name", "")
                            image_url = None
                            if GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID and search_name:
                                try:
                                    search_query = f"{search_name} photo"
                                    image_urls = get_image_urls(search_query, num_images=1)
                                    if image_urls:
                                        image_url = image_urls[0]
                                except Exception as img_e:
                                    print(f"--- app.py DEBUG: Image search failed for '{search_name}': {img_e}")
                            fc["args"]["imageUrl"] = image_url
                        processed_function_calls.append(fc)

        return jsonify({
            "textSummary": text_summary.strip(),
            "functionCalls": processed_function_calls,
            "error": None
        })

    except requests.exceptions.HTTPError as e:
        error_text = e.response.text if e.response else "No response body"
        print(f"Gemini API HTTP error: {e.response.status_code} - {error_text}")
        return jsonify({"error": f"Gemini API error: {e.response.status_code}. Check server logs.", "textSummary": "", "functionCalls": []}), 500
    except requests.exceptions.Timeout:
         print("Gemini API request timed out.")
         return jsonify({"error": "Gemini API request timed out. Please try again.", "textSummary": "", "functionCalls": []}), 504
    except Exception as e:
        print(f"Error in generate_structured_trip: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "textSummary": "", "functionCalls": []}), 500


@app.route("/around_me", methods=["POST"]) # This is the existing route for simple itinerary generation
def around_me_itinerary(): # Renamed to avoid confusion with the new map-based UI
    data = request.get_json()
    if not data: return jsonify({"error": "No data provided"}), 400
    lat, lon = data.get("lat"), data.get("lon")
    username = data.get("username", "guest_user") 
    if lat is None or lon is None: return jsonify({"error": "Lat/lon required"}), 400
    
    prompt = f"Plan a 2-day trip itinerary in the nearest city to latitude {lat}, longitude {lon}."
    
    preferences = read_preferences().get(username, {})
    personalized_prompt = build_personalized_prompt(prompt, preferences)
    print(f"--- app.py DEBUG: Personalized prompt for '{username}' for /around_me (itinerary): {personalized_prompt[:200]}...")

    try:
        itinerary = call_gemini_simple_text(personalized_prompt)
        return jsonify({"result": itinerary})
    except Exception as e:
        print(f"Error in around_me_itinerary: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/my_trips", methods=["POST"])
def my_trips():
    try:
        data = request.get_json()
        if not data or "idea" not in data: return jsonify({"error": "Missing 'idea'"}), 400
        
        user_prompt_idea = data["idea"]
        username = data.get("username", "guest_user") 

        preferences = read_preferences().get(username, {})
        personalized_prompt = build_personalized_prompt(user_prompt_idea, preferences)
        print(f"--- app.py DEBUG: Personalized prompt for '{username}' for /my_trips: {personalized_prompt[:200]}...")

        trip_itinerary = call_gemini_simple_text(personalized_prompt)
        
        image_extraction_prompt = (
            "Based on the following travel plan, return a comma-separated list of 2 to 3 visually iconic places "
            "that would represent this trip well for image search. Just return the place names, no commentary.\n\n"
            f"{trip_itinerary}"
        )
        image_keywords_raw = call_gemini_simple_text(image_extraction_prompt)
        keywords = [kw.strip() for kw in image_keywords_raw.split(",") if kw.strip()]
        images = []
        if GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID:
            for kw in keywords[:3]:
                try:
                    images += get_image_urls(kw + " travel photo", num_images=1)
                except Exception as e:
                    print(f"Image search failed for carousel/simple trip item '{kw}': {e}")
        else:
             print("--- app.py DEBUG: Skipping image search for /my_trips (API key/Engine ID missing).")
        return jsonify({"result": trip_itinerary, "images": images, "error": None})
    except requests.exceptions.HTTPError as http_err:
        error_msg = f"HTTP error {http_err.response.status_code}"
        if http_err.response and hasattr(http_err.response, 'text') and http_err.response.text:
            error_msg += f": {http_err.response.text[:200]}"
        print(f"Error in my_trips (HTTP): {error_msg}")
        return jsonify({"result": None, "images": [], "error": error_msg}), 500
    except Exception as e:
        print(f"Error in my_trips: {e}")
        return jsonify({"result": None, "images": [], "error": f"Error generating trip idea or images: {e}"}), 500

# --- Friends Feature Routes (Existing) ---
@app.route("/update_location", methods=["POST"])
def update_location():
    data = request.get_json()
    username = data.get("username", "me") 
    lat = data.get("lat")
    lng = data.get("lng")
    place = data.get("place", "Unknown Location")
    if lat is None or lng is None:
        return jsonify({"error": "Latitude and longitude are required"}), 400
    friend = Friend.query.filter_by(username=username).first()
    if not friend:
        friend = Friend(username=username)
        db.session.add(friend)
        try:
            db.session.flush() 
        except Exception as e:
            db.session.rollback()
            print(f"Error flushing session for new friend {username}: {e}")
            return jsonify({"status": "error", "message": "Could not create friend record"}), 500
    
    friend.lat = lat
    friend.lng = lng
    
    if friend.id is None: 
         db.session.flush() 
         if friend.id is None:
             print(f"CRITICAL: Friend ID still None for {username} after flush.")
             return jsonify({"status": "error", "message": "Friend ID not available after creating friend record"}), 500

    visit = Visit(friend_id=friend.id, lat=lat, lng=lng, place=place)
    db.session.add(visit)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Error committing location update for {username}: {e}")
        return jsonify({"status": "error", "message": "Database error during update"}), 500
    return jsonify({"status": "ok", "message": f"Location for {username} updated."})

@app.route("/get_friends")
def get_friends():
    try:
        friends_data = Friend.query.order_by(Friend.last_updated.desc()).all()
        return jsonify([
            {
                "name": f.username,
                "lat": f.lat,
                "lng": f.lng,
                "last_updated": f.last_updated.strftime('%Y-%m-%d %H:%M:%S UTC') if f.last_updated else "N/A"
            }
            for f in friends_data
        ])
    except Exception as e:
        print(f"Error fetching friends: {e}")
        return jsonify({"error": "Could not retrieve friends list"}), 500

@app.route("/get_trip_history/<username>")
def get_trip_history(username):
    try:
        friend = Friend.query.filter_by(username=username).first()
        if not friend:
            return jsonify([])
        visits = Visit.query.filter_by(friend_id=friend.id).order_by(Visit.timestamp.desc()).limit(20).all()
        return jsonify([
            {
                "lat": v.lat,
                "lng": v.lng,
                "place": v.place,
                "timestamp": v.timestamp.isoformat()
            }
            for v in visits
        ])
    except Exception as e:
        print(f"Error fetching trip history for {username}: {e}")
        return jsonify({"error": f"Could not retrieve trip history for {username}"}), 500

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def call_gemini_simple_text(user_input: str) -> str:
    if not GEMINI_API_KEY:
        return "Error: GEMINI_API_KEY not configured for simple text generation."
    headers = {"Content-Type": "application/json"}
    params = {"key": GEMINI_API_KEY}
    system_prompt_text = ( # This is the master's simple system prompt
        "You are a travel planning assistant. Your goal is to provide concise and helpful travel-related information. "
        "If the prompt is not about trip planning, reply: 'Nice try! But let's go ahead and continue planning.' "
        "If the user inputs the name of a food item, think about the best place to eat it in the city they are visiting or a general suggestion. "
        "Keep responses brief and directly answer the user's travel query."
    )
    body = {
        "contents": [{"role": "user", "parts": [{"text": user_input}]}],
        "systemInstruction": {"parts": [{"text": system_prompt_text}]}
    }
    try:
        resp = requests.post(
            GEMINI_URL, # Using the consistent model from master
            params=params, headers=headers, json=body, timeout=45
        )
        resp.raise_for_status()
        data = resp.json()
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])
        if parts and "text" in parts[0]:
            return parts[0]["text"]
        else:
            error_msg_detail = "No text part found in response."
            if data.get("candidates") and data["candidates"][0].get("finishReason"):
                error_msg_detail = f"Finish Reason: {data['candidates'][0]['finishReason']}"
            elif data.get("promptFeedback", {}).get("blockReason"): # Check for block reason
                error_msg_detail = f"Blocked: {data['promptFeedback']['blockReason']}"
                if data['promptFeedback'].get('blockReasonMessage'):
                     error_msg_detail += f" - {data['promptFeedback']['blockReasonMessage']}"
            elif data.get("error", {}).get("message"):
                 error_msg_detail = f"API Error: {data['error']['message']}"
            print(f"Warning: Unexpected simple Gemini response structure: {data}")
            return f"Could not retrieve text from Gemini ({error_msg_detail})."
    except requests.exceptions.RequestException as e:
         print(f"Simple Gemini text call failed: {e}")
         error_detail = ""
         if e.response and hasattr(e.response, 'text') and e.response.text:
             try:
                 error_data = e.response.json()
                 if "error" in error_data and "message" in error_data["error"]:
                     error_detail = f": {error_data['error']['message']}"
                 elif "candidates" in error_data and error_data["candidates"] and "finishReason" in error_data["candidates"][0]:
                      error_detail = f": Finish Reason - {error_data['candidates'][0]['finishReason']}"
                 elif "promptFeedback" in error_data and error_data["promptFeedback"].get("blockReason"):
                      error_detail = f": Blocked - {error_data['promptFeedback']['blockReason']}"
             except: pass
         return f"Error calling Gemini API{error_detail}. Check server logs."


def get_image_urls(query: str, num_images: int = 1) -> list[str]:
    if not GOOGLE_SEARCH_API_KEY or not GOOGLE_SEARCH_ENGINE_ID:
        return []
    search_url = "https://www.googleapis.com/customsearch/v1"
    params = {
        "q": query,
        "cx": GOOGLE_SEARCH_ENGINE_ID,
        "key": GOOGLE_SEARCH_API_KEY,
        "searchType": "image",
        "num": num_images,
        "imgSize": "large", # Was "xlarge", changed to "large" as it's a common valid value
        "safe": "high",
    }
    try:
        response = requests.get(search_url, params=params, timeout=10)
        response.raise_for_status()
        results = response.json()
        return [item["link"] for item in results.get("items", []) if "link" in item]
    except requests.exceptions.RequestException as e:
        print(f"Error fetching images for '{query}': {e}")
        if e.response and hasattr(e.response, 'text') and e.response.text:
            print(f"Google Search API Error Response: {e.response.text[:200]}")
        return []

# Using GOOGLE_SEARCH_API_KEY for Places API as it's often bundled, 
# or GOOGLE_MAPS_API_KEY_FRONTEND if that's specifically enabled for Places API server-side.
# For this helper, GOOGLE_SEARCH_API_KEY is used as per original master, assuming it has Places API enabled.
def get_accurate_coords_places(location_name: str) -> Tuple[Optional[float], Optional[float]]:
    active_places_key = GOOGLE_SEARCH_API_KEY # Or GOOGLE_MAPS_API_KEY_FRONTEND if preferred
    if not active_places_key:
        print("Skipping Google Places coordinate verification: Places API key not configured.")
        return None, None
        
    findplace_url = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
    params = {
        "input": location_name,
        "inputtype": "textquery",
        "fields": "geometry/location,name,formatted_address", # place_id can be useful too
        "key": active_places_key,
    }
    try:
        response = requests.get(findplace_url, params=params, timeout=7)
        response.raise_for_status()
        results = response.json()
        if results.get("status") == "OK" and results.get("candidates"):
            candidate = results["candidates"][0]
            location = candidate.get("geometry", {}).get("location", {})
            lat = location.get("lat")
            lng = location.get("lng")
            if lat is not None and lng is not None:
                return float(lat), float(lng)
            else:
                print(f"DEBUG: Missing lat/lng for '{location_name}' in Places API response")
                return None, None
        elif results.get("status") == "ZERO_RESULTS":
            return None, None
        else:
            error_msg_detail = results.get('error_message', 'Unknown Places API error')
            print(f"Google Places API status '{results.get('status')}' for '{location_name}'. Msg: {error_msg_detail}")
            return None, None
    except requests.exceptions.RequestException as e:
        print(f"Error calling Google Places API for '{location_name}': {e}")
        return None, None

def get_place_details(place_id: str) -> Dict[str, Any]: # This seems unused but keeping it.
    active_places_key = GOOGLE_SEARCH_API_KEY # Or GOOGLE_MAPS_API_KEY_FRONTEND
    if not active_places_key or not place_id:
        return {}
    details_url = f"https://maps.googleapis.com/maps/api/place/details/json"
    fields = [
        "formatted_address", "geometry", "icon", "name", "permanently_closed",
        "photos", "place_id", "plus_code", "type", "url", "utc_offset_minutes",
        "vicinity", "business_status", "rating", "user_ratings_total",
        "website", "opening_hours"
    ]
    params = {
        "place_id": place_id,
        "fields": ",".join(fields),
        "key": active_places_key,
    }
    try:
        response = requests.get(details_url, params=params, timeout=7)
        response.raise_for_status()
        results = response.json()
        if results.get("status") == "OK" and results.get("result"):
            return results["result"]
        else:
            error_msg = results.get('error_message', 'Unknown Places Details API error')
            print(f"Google Places Details API status for {place_id}: {results.get('status')}. Msg: {error_msg}")
            return {}
    except requests.exceptions.RequestException as e:
        print(f"Error calling Google Places Details API for place_id '{place_id}': {e}")
        if e.response and hasattr(e.response, 'text') and e.response.text:
            print(f"Google Places Details API Error Response: {e.response.text[:200]}")
        return {}

# ─────────────────────────────────────────────
# DB INIT & RUN
# ─────────────────────────────────────────────

with app.app_context():
    db.create_all()

if __name__ == "__main__":
    # Ensure .env has GEO_NAMES_API_USERNAME="your_geonames_username"
    # For example: GEO_NAMES_API_USERNAME="berekety" if that's the account.
    app.run(debug=True, host="0.0.0.0", port=5001)

# --- END OF MODIFIED app.py (MASTER FILE) ---
