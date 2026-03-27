import os
import sys
import google.generativeai as genai

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.config import settings


def list_models():
    api_key = settings.GOOGLE_API_KEY
    if hasattr(api_key, "get_secret_value"):
        api_key = api_key.get_secret_value()
    elif "SecretStr" in str(type(api_key)):
        api_key = str(api_key)  # Fallback

    if not api_key:
        print("No API Key found.")
        return

    genai.configure(api_key=api_key)

    print("--- Available Models ---")
    try:
        for m in genai.list_models():
            if "embedContent" in m.supported_generation_methods:
                print(f"Embedding Model: {m.name}")
            elif "generateContent" in m.supported_generation_methods:
                print(f"Generation Model: {m.name}")
    except Exception as e:
        print(f"Error listing models: {e}")


if __name__ == "__main__":
    list_models()
