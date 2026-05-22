import json
from collections import Counter


# ✅ Absolute path to your file
file_path = r"C:\Users\gabri\Downloads\jalisco-crime-k8s-finalv2\jalisco-crime-k8s\backend\data\crime_data.json"


# Load your current data
with open(file_path, encoding="utf-8") as f:
    data = json.load(f)


# Handle structure (list or wrapped)
sample = data.get("sample", data if isinstance(data, list) else [])


# 1. total_records
total_records = len(sample)


# 2. by_year
year_counts = Counter()
for rec in sample:
    try:
        year = int(rec["fecha"][:4])
        year_counts[year] += 1
    except:
        pass


by_year = sorted(
    [{"año": y, "total": t} for y, t in year_counts.items()],
    key=lambda x: x["año"]
)


# 3. top_delitos
delito_counts = Counter(r.get("delito", "Desconocido") for r in sample)
top_delitos = sorted(
    [{"delito": d, "total": t} for d, t in delito_counts.items()],
    key=lambda x: -x["total"]
)


# 4. by_municipio
muni_counts = Counter(r.get("municipio", "Desconocido") for r in sample)
by_municipio = sorted(
    [{"municipio": m, "total": t} for m, t in muni_counts.items()],
    key=lambda x: -x["total"]
)


# 5. Lists
delitos_list = sorted(delito_counts.keys())
municipios_list = sorted(muni_counts.keys())


# 6. pivot
pivot_counts = Counter()
for rec in sample:
    try:
        year = int(rec["fecha"][:4])
        pivot_counts[(rec.get("delito", ""), year)] += 1
    except:
        pass


pivot = [
    {"delito": d, "año": y, "total": t}
    for (d, y), t in pivot_counts.items()
]


# Build final object
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


# ✅ Write back to same file
with open(file_path, "w", encoding="utf-8") as f:
    json.dump(complete_data, f, ensure_ascii=False, indent=2)


print(f"✅ Generated complete crime_data.json with {total_records} records")
print(f"   {len(by_year)} years, {len(top_delitos)} crime types, {len(by_municipio)} municipalities")



