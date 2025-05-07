import os
import requests
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

# Load API keys from .env
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GOOGLE_SEARCH_API_KEY = os.getenv("GOOGLE_SEARCH_API_KEY")
GOOGLE_SEARCH_ENGINE_ID = os.getenv("GOOGLE_SEARCH_ENGINE_ID")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY is not set in the environment variables.")

# Gemini endpoint
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

# Flask setup
app = Flask(__name__)


# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

@app.route("/")
def welcome():
    return render_template("welcome.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.route("/around_me", methods=["POST"])
def around_me():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    lat = data.get("lat")
    lon = data.get("lon")
    if lat is None or lon is None:
        return jsonify({"error": "Latitude and longitude are required"}), 400

    prompt = f"Plan a 2-day trip itinerary in the nearest city to latitude {lat}, longitude {lon}."

    try:
        itinerary = call_gemini(prompt)
        return jsonify({"result": itinerary})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/my_trips", methods=["POST"])
def my_trips():
    try:
        data = request.get_json()
        if not data or "idea" not in data:
            return jsonify({"error": "Missing 'idea' in request"}), 400

        user_prompt = data["idea"]

        # Step 1: Generate the itinerary using full system behavior
        trip_itinerary = call_gemini(user_prompt)

        # Step 2: Ask Gemini for representative, image-worthy keywords
        image_extraction_prompt = (
            "Based on the following travel plan, return a comma-separated list of 2 to 3 visually iconic places "
            "that would represent this trip well for image search. Just return the place names, no commentary.\n\n"
            f"{trip_itinerary}"
        )
        image_keywords_raw = call_gemini(image_extraction_prompt)
        print("Gemini image keywords raw:", image_keywords_raw)

        keywords = [kw.strip() for kw in image_keywords_raw.split(",") if kw.strip()]
        print("Parsed image keywords:", keywords)

        # Step 3: Use Google Image API to get URLs
        images = []
        for kw in keywords[:3]:
            try:
                images += get_image_urls(kw + " travel", num_images=1)
            except Exception as e:
                print(f"Image search failed for '{kw}': {e}")

        return jsonify({
            "result": trip_itinerary,
            "images": images,
            "error": None
        })

    except requests.exceptions.HTTPError as e:
        return jsonify({
            "result": None,
            "images": [],
            "error": f"HTTP error {e.response.status_code}: {e}"
        }), 500

    except Exception as e:
        return jsonify({
            "result": None,
            "images": [],
            "error": f"Unexpected error: {e}"
        }), 500


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def call_gemini(user_input: str) -> str:
    headers = {"Content-Type": "application/json"}
    params = {"key": GEMINI_API_KEY}

    system_prompt = (
        "You are a travel planning assistant. "
        "Only respond to prompts related to travel or trip planning. "
        "If the prompt is not about trip planning, reply: 'Nice try! but let's go ahead and continue planning.' "
        "If the user inputs the name of a food item, think about the best place to eat it in the city they are visiting."
    )

    body = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": system_prompt}]
            },
            {
                "role": "user",
                "parts": [{"text": user_input}]
            }
        ]
    }

    resp = requests.post(GEMINI_URL, params=params, headers=headers, json=body)
    resp.raise_for_status()
    data = resp.json()

    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise ValueError(f"Unexpected Gemini API response format: {e}")


def get_image_urls(query: str, num_images: int = 2):
    search_url = "https://www.googleapis.com/customsearch/v1"
    params = {
        "q": query,
        "cx": GOOGLE_SEARCH_ENGINE_ID,
        "key": GOOGLE_SEARCH_API_KEY,
        "searchType": "image",
        "num": num_images,
        "imgSize": "large",
        "safe": "high"
    }

    response = requests.get(search_url, params=params)
    response.raise_for_status()
    results = response.json()

    return [item["link"] for item in results.get("items", [])]


# ─────────────────────────────────────────────
# RUN
# ─────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=True)
