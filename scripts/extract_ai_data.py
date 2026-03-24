import os
import json
import pandas as pd
from supabase import create_client, Client

# Configuration
SUPABASE_URL = "https://dlnzupvxtqozhczrenbn.supabase.co"
# DO NOT hardcode the Service Role Key. Load it from .env or environment variable.
# On Windows (PowerShell): $env:SUPABASE_SERVICE_ROLE_KEY="your-key-here"; python scripts/extract_ai_data.py
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "YOUR_SUPABASE_SERVICE_ROLE_KEY") 

def extract_game_data():
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("--- Extracting Game History Analysis ---")
    # Fetching game_history_analysis (Snapshots and AI evaluations)
    # Note: We might need to handle pagination if the dataset grows significantly
    response = supabase.table("game_history_analysis").select("*").execute()
    history_df = pd.DataFrame(response.data)
    history_df.to_csv("game_history_ai_training.csv", index=False)
    print(f"Saved {len(history_df)} rows to game_history_ai_training.csv")

    print("\n--- Extracting Zobrist Evaluations (Position Wisdom) ---")
    response_z = supabase.table("zobrist_evaluations").select("*").execute()
    zobrist_df = pd.DataFrame(response_z.data)
    zobrist_df.to_csv("zobrist_evaluations.csv", index=False)
    print(f"Saved {len(zobrist_df)} rows to zobrist_evaluations.csv")

    print("\n--- Summary for Colab ---")
    print(f"Total history entries: {len(history_df)}")
    print(f"Total board evaluations: {len(zobrist_df)}")

if __name__ == "__main__":
    if SUPABASE_KEY == "YOUR_SUPABASE_SERVICE_ROLE_KEY":
        print("Error: Please set your SUPABASE_SERVICE_ROLE_KEY in the script.")
    else:
        extract_game_data()
