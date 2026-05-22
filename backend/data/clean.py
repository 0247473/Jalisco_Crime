# ============================================================
# generate_crime_data.py
# Run: python generate_crime_data.py
# ============================================================
import pandas as pd
import json

# ----- CHANGE THESE -----
CSV_PATH = "backend/data/datos-2026-02-21.csv"
OUTPUT_PATH = "backend/data/crime_data.json"
# -------------------------

df = pd.read_csv(CSV_PATH)
print(f"📄 Loaded {len(df):,} records from {CSV_PATH}")

# 1. total_records
total_records = len(df)

# 2. by_year
df["año"] = df["fecha"].str[:4].astype(int)
by_year = (
    df.groupby("año").size()
    .reset_index(name="total")
    .sort_values("año")
    .to_dict("records")
)

# 3. top_delitos
top_delitos = (
    df["delito"].value_counts()
    .reset_index()
    .rename(columns={"delito": "delito", "count": "total"})
    .to_dict("records")
)

# 4. by_municipio
by_municipio = (
    df["municipio"].value_counts()
    .reset_index()
    .rename(columns={"municipio": "municipio", "count": "total"})
    .to_dict("records")
)

# 5. Filter lists
delitos_list = sorted(df["delito"].dropna().unique().tolist())
municipios_list = sorted(df["municipio"].dropna().unique().tolist())

# 6. pivot
pivot = (
    df.groupby(["delito", "año"]).size()
    .reset_index(name="total")
    .to_dict("records")
)

# 7. ALL records with valid coordinates (no sampling!)
valid_coords = df.dropna(subset=["x", "y"])
sample = valid_coords[
    ["fecha", "delito", "x", "y", "municipio", "colonia", "hora", "zona_geografica"]
].to_dict("records")

print(f"   Total records: {total_records:,}")
print(f"   Records with coordinates: {len(sample):,}")

# Build complete JSON
complete_data = {
    "total_records": total_records,
    "by_year": by_year,
    "top_delitos": top_delitos,
    "by_municipio": by_municipio,
    "sample": sample,
    "pivot": pivot,
    "delitos_list": delitos_list,
    "municipios_list": municipios_list,
}

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(complete_data, f, ensure_ascii=False)

import os
size_mb = os.path.getsize(OUTPUT_PATH) / 1024 / 1024
print(f"\n✅ {OUTPUT_PATH} generated!")
print(f"   File size: {size_mb:.2f} MB")
print(f"   Sample points: {len(sample):,} (ALL with valid coords)")