-- Sample London restaurants and chain menus so the app has something to show
-- before the FSA import runs. Safe to run more than once.
-- Prices are typical London menu prices in pence and may be out of date.

insert into public.restaurants (name, address, postcode, local_authority, hygiene_rating, chain_slug, menu_source)
select * from (values
  ('McDonald''s', 'Oxford Street', 'W1D 1BS', 'Westminster', '5', 'mcdonalds', 'chain'::public.menu_source),
  ('Nando''s', 'Soho', 'W1F 0LE', 'Westminster', '5', 'nandos', 'chain'),
  ('Dishoom', 'Granary Square, King''s Cross', 'N1C 4AA', 'Camden', '5', 'dishoom', 'chain'),
  ('wagamama', 'Covent Garden', 'WC2E 8RF', 'Westminster', '5', 'wagamama', 'chain'),
  ('Greggs', 'Liverpool Street', 'EC2M 7PY', 'City of London', '5', 'greggs', 'chain'),
  ('Pret A Manger', 'Strand', 'WC2R 0EZ', 'Westminster', '5', 'pret', 'chain'),
  ('Flat Iron', 'Soho', 'W1F 7RN', 'Westminster', '5', 'flat-iron', 'chain'),
  ('Five Guys', 'Leicester Square', 'WC2H 7LU', 'Westminster', '5', 'five-guys', 'chain')
) as v(name, address, postcode, local_authority, hygiene_rating, chain_slug, menu_source)
where not exists (select 1 from public.restaurants r where r.chain_slug = v.chain_slug and r.postcode = v.postcode);

insert into public.dishes (restaurant_id, section, name, price_pence, source)
select r.id, m.section, m.name, m.price, 'chain'
from (values
  ('mcdonalds', 'Burgers', 'McChicken Sandwich', 379), ('mcdonalds', 'Burgers', 'Big Mac', 519),
  ('mcdonalds', 'Burgers', 'Quarter Pounder with Cheese', 549), ('mcdonalds', 'Burgers', 'Cheeseburger', 189),
  ('mcdonalds', 'Chicken', 'Chicken McNuggets (6)', 399), ('mcdonalds', 'Sides', 'Large Fries', 269),
  ('mcdonalds', 'Desserts', 'McFlurry Oreo', 229), ('mcdonalds', 'Breakfast', 'Sausage & Egg McMuffin', 369),
  ('nandos', 'Chicken', '1/2 Chicken', 1195), ('nandos', 'Chicken', 'Butterfly Chicken Breast', 1125),
  ('nandos', 'Chicken', 'Chicken Wings (5)', 875), ('nandos', 'Burgers & wraps', 'Sunset Burger', 1095),
  ('nandos', 'Sides', 'Peri-Salted Chips', 395), ('nandos', 'Sides', 'Halloumi Sticks & Dip', 525),
  ('nandos', 'Sides', 'Spicy Rice', 395), ('nandos', 'Sides', 'Garlic Bread', 395),
  ('dishoom', 'Breakfast', 'Bacon Naan Roll', 790), ('dishoom', 'Mains', 'House Black Daal', 850),
  ('dishoom', 'Mains', 'Chicken Ruby', 1490), ('dishoom', 'Grills', 'Chicken Tikka', 1290),
  ('dishoom', 'Small plates', 'Okra Fries', 550), ('dishoom', 'Small plates', 'Pau Bhaji', 650),
  ('dishoom', 'Drinks', 'House Chai', 390),
  ('wagamama', 'Curries', 'Chicken Katsu Curry', 1375), ('wagamama', 'Ramen', 'Chilli Chicken Ramen', 1425),
  ('wagamama', 'Teppanyaki', 'Yaki Soba', 1295), ('wagamama', 'Sides', 'Duck Gyoza', 695),
  ('wagamama', 'Sides', 'Bang Bang Cauliflower', 650),
  ('greggs', 'Savouries', 'Sausage Roll', 130), ('greggs', 'Savouries', 'Vegan Sausage Roll', 140),
  ('greggs', 'Savouries', 'Steak Bake', 210), ('greggs', 'Savouries', 'Chicken Bake', 210),
  ('greggs', 'Sweet', 'Yum Yum', 110), ('greggs', 'Sweet', 'Pink Jammie Doughnut', 120),
  ('pret', 'Sandwiches', 'Classic Super Club', 599), ('pret', 'Sandwiches', 'Tuna Mayo & Cucumber Baguette', 549),
  ('pret', 'Hot food', 'Chicken & Pesto Toastie', 625), ('pret', 'Soup', 'Chicken Laksa Soup', 550),
  ('pret', 'Sweet', 'Chocolate Chunk Cookie', 225), ('pret', 'Drinks', 'Flat White', 325),
  ('flat-iron', 'Steaks', 'Flat Iron Steak', 1400), ('flat-iron', 'Sides', 'Beef Dripping Chips', 450),
  ('flat-iron', 'Sides', 'Creamed Spinach', 450), ('flat-iron', 'Dessert', 'Salted Caramel Ice Cream', 300),
  ('five-guys', 'Burgers', 'Cheeseburger', 1175), ('five-guys', 'Burgers', 'Little Bacon Cheeseburger', 1075),
  ('five-guys', 'Sides', 'Cajun Fries', 495), ('five-guys', 'Shakes', 'Milkshake', 625)
) as m(slug, section, name, price)
join public.restaurants r on r.chain_slug = m.slug
on conflict do nothing;
