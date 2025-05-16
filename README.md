# Travel Planner Web App

This is a Flask-based web application that helps users generate travel plans using the Gemini API. It includes:

- Flask backend (`app.py`)
- HTML templates (`/templates`)
- Static files (CSS, JS in `/static`)
- TypeScript/JavaScript (`index.ts`, `index.js`)

---

## Setup Instructions

### 2. Create a virtual environment (recommended)

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

---

## Environment Variables

Create a `.env` file in the root directory with your Gemini API key:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## Running the Flask App

```bash
python app.py
```

By default, the app runs at:  
👉 [http://127.0.0.1:5000](http://127.0.0.1:5000)

---

## Project Structure

```
App/
├── app.py               # Flask app
├── requirements.txt     # Python dependencies
├── index.js / index.ts  # Frontend logic
├── static/              # CSS, JS, images
├── templates/           # HTML templates
```
