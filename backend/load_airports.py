"""
Load airport names and coordinates from OpenFlights airports.dat.

Usage:
    python load_airports.py data/airports.dat

The file has no header. Columns used: 1 name, 2 city, 3 country, 4 IATA code, 6 lat, 7 lon.
"""
import csv
import os
import sys

import psycopg
from dotenv import load_dotenv

load_dotenv()
# Bulk loads need a direct connection. Neon env pull stores that as DATABASE_URL_UNPOOLED.
DATABASE_URL = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get(
    "DATABASE_URL", "postgresql://localhost/flights"
)


def read_airports(path):
    airports = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            code = row[4]
            # Skip airports without a real 3-letter IATA code (OpenFlights uses \N)
            if len(code) != 3 or not code.isalpha():
                continue
            # Keep the first entry if a code appears twice
            airports.setdefault(code, (code, row[1], row[2], row[3], float(row[6]), float(row[7])))
    return list(airports.values())


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "data/airports.dat"
    rows = read_airports(path)

    with psycopg.connect(DATABASE_URL) as conn, conn.cursor() as cur:
        cur.execute("TRUNCATE flights.airports")
        cur.executemany(
            "INSERT INTO flights.airports (code, name, city, country, lat, lon) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            rows,
        )
    print(f"Loaded {len(rows):,} airports")


if __name__ == "__main__":
    main()
