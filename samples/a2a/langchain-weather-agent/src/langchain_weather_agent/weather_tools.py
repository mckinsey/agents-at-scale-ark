"""Simple weather tool for LangChain agents."""

import httpx


def get_weather(city: str) -> str:
    """Get current weather for a city."""
    try:
        geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1"
        
        with httpx.Client() as client:
            geo_response = client.get(geo_url)
            geo_data = geo_response.json()
            
            if not geo_data.get("results"):
                return f"Could not find {city}"
            
            result = geo_data["results"][0]
            lat, lon = result["latitude"], result["longitude"]
            
            weather_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"
            weather_response = client.get(weather_url)
            weather_data = weather_response.json()
            
            current = weather_data["current_weather"]
            location = result["name"]
            
            return f"{location}: {current['temperature']}°C, wind {current['windspeed']} km/h"
            
    except Exception as e:
        return f"Weather error: {str(e)}"

