"""
Load BTS T-100 Segment CSVs into flights.segments.

Works with "T-100 Segment (All Carriers)" (domestic + international) and with the
domestic-only table. Country columns are optional: if a file doesn't have them,
they're left empty.

Usage:
    python load_t100.py data/*.csv

Safe to re-run: rows for any (year, month) found in a file are replaced.
"""
import io
import os
import sys

import pandas as pd
import psycopg
from dotenv import load_dotenv

load_dotenv()
# Bulk loads need a direct connection. Neon env pull stores that as DATABASE_URL_UNPOOLED.
DATABASE_URL = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get(
    "DATABASE_URL", "postgresql://localhost/flights"
)

# BTS column name -> our column name
COLUMNS = {
    "YEAR": "year",
    "MONTH": "month",
    "UNIQUE_CARRIER": "carrier",
    "UNIQUE_CARRIER_NAME": "carrier_name",
    "ORIGIN": "origin",
    "ORIGIN_CITY_NAME": "origin_city",
    "DEST": "dest",
    "DEST_CITY_NAME": "dest_city",
    "DEPARTURES_PERFORMED": "departures",
    "SEATS": "seats",
    "PASSENGERS": "passengers",
    "DISTANCE": "distance",
}
# Present in the combined / international tables, optional otherwise
OPTIONAL_COLUMNS = {
    "ORIGIN_COUNTRY_NAME": "origin_country",
    "DEST_COUNTRY_NAME": "dest_country",
}
NUMERIC = ["year", "month", "departures", "seats", "passengers", "distance"]


def read_file(path):
    df = pd.read_csv(path, low_memory=False)
    df.columns = [c.strip().upper() for c in df.columns]

    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        sys.exit(f"{path} is missing columns {missing} - re-download with those fields checked")

    # CLASS 'F' = scheduled passenger service. Drop charters and cargo if the column is present.
    if "CLASS" in df.columns:
        df = df[df["CLASS"] == "F"]

    for column in OPTIONAL_COLUMNS:
        if column not in df.columns:
            df[column] = None

    all_columns = {**COLUMNS, **OPTIONAL_COLUMNS}
    df = df[list(all_columns)].rename(columns=all_columns)
    df[NUMERIC] = df[NUMERIC].fillna(0).astype(int)
    return df[df["departures"] > 0]


def load(conn, df, path):
    periods = sorted(set(zip(df["year"], df["month"])))
    with conn.cursor() as cur:
        # Replace any months this file covers, so re-running doesn't double count
        for year, month in periods:
            cur.execute("DELETE FROM flights.segments WHERE year = %s AND month = %s", (year, month))

        buf = io.StringIO()
        df.to_csv(buf, index=False, header=False)
        cols = ", ".join(df.columns)
        with cur.copy(f"COPY flights.segments ({cols}) FROM STDIN WITH (FORMAT csv)") as copy:
            copy.write(buf.getvalue())

    print(f"{path}: {len(df):,} rows across {len(periods)} month(s)")


def main():
    paths = sys.argv[1:]
    if not paths:
        sys.exit("usage: python load_t100.py data/*.csv")

    with psycopg.connect(DATABASE_URL) as conn:
        for path in paths:
            load(conn, read_file(path), path)
        conn.execute("REFRESH MATERIALIZED VIEW flights.route_year")
    print("route_year refreshed")


if __name__ == "__main__":
    main()
