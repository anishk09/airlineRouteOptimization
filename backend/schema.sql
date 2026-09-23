-- Run as your normal Postgres user:  psql -d flights -f schema.sql
CREATE SCHEMA IF NOT EXISTS flights;

-- One row per carrier / route / month / aircraft type, as BTS publishes it.
-- Covers domestic and international flights with at least one US endpoint.
CREATE TABLE IF NOT EXISTS flights.segments (
    year          smallint NOT NULL,
    month         smallint NOT NULL,
    carrier       text     NOT NULL,   -- e.g. 'DL'
    carrier_name  text,                -- e.g. 'Delta Air Lines Inc.'
    origin        text     NOT NULL,   -- airport code, e.g. 'EWR'
    origin_city   text,
    dest          text     NOT NULL,
    dest_city     text,
    origin_country text,               -- e.g. 'United States', 'United Kingdom'
    dest_country   text,
    departures    integer  NOT NULL,
    seats         integer  NOT NULL,
    passengers    integer  NOT NULL,
    distance      integer
);

-- Adds the country columns to a table created by an earlier version of this file
ALTER TABLE flights.segments ADD COLUMN IF NOT EXISTS origin_country text;
ALTER TABLE flights.segments ADD COLUMN IF NOT EXISTS dest_country text;

CREATE INDEX IF NOT EXISTS segments_year_origin ON flights.segments (year, origin);
CREATE INDEX IF NOT EXISTS segments_year_dest   ON flights.segments (year, dest);
CREATE INDEX IF NOT EXISTS segments_carrier     ON flights.segments (carrier, year);

-- Yearly rollup per carrier + route. Most questions only need this, and it keeps
-- the model's SQL simple. Refreshed by load_t100.py after every load.
-- Dropped and rebuilt here so it always matches the current column list.
DROP MATERIALIZED VIEW IF EXISTS flights.route_year;
CREATE MATERIALIZED VIEW flights.route_year AS
SELECT year,
       carrier,
       max(carrier_name) AS carrier_name,
       origin,
       max(origin_city)  AS origin_city,
       dest,
       max(dest_city)    AS dest_city,
       max(origin_country) AS origin_country,
       max(dest_country)   AS dest_country,
       sum(departures)   AS departures,
       sum(seats)        AS seats,
       sum(passengers)   AS passengers,
       max(distance)     AS distance
FROM flights.segments
GROUP BY year, carrier, origin, dest;

-- Read-only role for the API. The model's SQL runs as this user,
-- so even a bad query can't modify anything.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'flights_reader') THEN
        CREATE ROLE flights_reader LOGIN PASSWORD 'change-me';
    END IF;
END $$;
GRANT USAGE ON SCHEMA flights TO flights_reader;
GRANT SELECT ON flights.segments, flights.route_year TO flights_reader;

-- Airport reference data (from OpenFlights airports.dat), for coordinates and names
CREATE TABLE IF NOT EXISTS flights.airports (
    code     text PRIMARY KEY,   -- IATA code, matches segments.origin / dest
    name     text,
    city     text,
    country  text,
    lat      double precision,
    lon      double precision
);
GRANT SELECT ON flights.airports TO flights_reader;
