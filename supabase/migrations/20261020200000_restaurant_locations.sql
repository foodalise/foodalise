-- Map pins for the sample London restaurants from seed.sql.
-- Approximate coordinates for each branch; the FSA import fills in real ones.
update public.restaurants r
set latitude = v.lat, longitude = v.lng
from (values
  ('mcdonalds', 'W1D 1BS', 51.5160, -0.1330),
  ('nandos', 'W1F 0LE', 51.5133, -0.1340),
  ('dishoom', 'N1C 4AA', 51.5357, -0.1253),
  ('wagamama', 'WC2E 8RF', 51.5118, -0.1217),
  ('greggs', 'EC2M 7PY', 51.5178, -0.0817),
  ('pret', 'WC2R 0EZ', 51.5113, -0.1183),
  ('flat-iron', 'W1F 7RN', 51.5121, -0.1376),
  ('five-guys', 'WC2H 7LU', 51.5106, -0.1298)
) as v(chain_slug, postcode, lat, lng)
where r.chain_slug = v.chain_slug and r.postcode = v.postcode and r.latitude is null;

create index if not exists restaurants_location on public.restaurants (latitude, longitude);
