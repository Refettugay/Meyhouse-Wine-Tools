-- Go-live data move, Phase 1 (run ONCE, when the new code is live).
-- Everything waiting in "Review & approve" (status SUBMITTED / HELD) moves into
-- the shared Order Cart. Each line keeps a "From Review & approve" source tag
-- (who counted it). Moved lines ("Move to <store>") keep their transfer
-- ("for <store>"). Removed lines (REJECTED) are NOT moved.
-- The old order is kept, status set to 'CART' (so nothing is lost and it can be
-- put back).
--
-- ROLLBACK:
--   delete from beverage.order_cart_line l using beverage.order_cart_source s
--     where s.line_id = l.id and s.kind = 'migrated'
--     and not exists (select 1 from beverage.order_cart_source o where o.line_id = l.id and o.kind <> 'migrated' and o.kind <> 'moved_in');
--   update beverage."OrderList" set status = 'SUBMITTED' where status = 'CART';

with src as (
  select i.id as item_id, o."organizationId" as org, o."locationId" as loc, i."ingredientId" as ing,
         case when i.unit = 'case' then 'case' else 'bottle' end as unit,
         i."quantityNeeded" as qty,
         coalesce(i.vendor, ing.vendor) as vendor,
         coalesce(i."countedByName", o."submittedByName", o."createdByName") as who,
         i."countedById" as who_id, i."countedStock" as counted, i."parSnapshot" as par,
         i."transferFromLocationId" as needed_by,
         coalesce(i."countedAt", o."submittedAt", o."createdAt") as at
  from beverage."OrderListItem" i
  join beverage."OrderList" o on o.id = i."orderListId"
  join beverage."Ingredient" ing on ing.id = i."ingredientId"
  where o.status in ('SUBMITTED', 'HELD') and i.status <> 'REJECTED' and i."quantityNeeded" > 0
),
lines as (
  insert into beverage.order_cart_line (organization_id, location_id, ingredient_id, unit, qty, vendor)
  select org, loc, ing, unit, sum(qty), max(vendor) from src group by org, loc, ing, unit
  on conflict (location_id, ingredient_id, unit)
  do update set qty = beverage.order_cart_line.qty + excluded.qty, updated_at = now()
  returning id, location_id, ingredient_id, unit
),
ins_src as (
  insert into beverage.order_cart_source (line_id, kind, qty, actor_id, actor_name, counted_stock, par_snapshot, at)
  select l.id, 'migrated', s.qty, s.who_id, s.who, s.counted, s.par, s.at
  from src s join lines l on l.location_id = s.loc and l.ingredient_id = s.ing and l.unit = s.unit
  returning 1
),
ins_moved as (
  insert into beverage.order_cart_source (line_id, kind, qty, actor_name, from_location_id, at)
  select l.id, 'moved_in', s.qty, null, s.needed_by, s.at
  from src s join lines l on l.location_id = s.loc and l.ingredient_id = s.ing and l.unit = s.unit
  where s.needed_by is not null
  returning 1
)
update beverage."OrderList" set status = 'CART', "updatedAt" = now()
where status in ('SUBMITTED', 'HELD');
