-- Go-live data move (run ONCE, right after turning ORDER_CART_FLOW on).
-- Part 1: Review & approve → Order Cart.  Part 2: Ready to email → Approved orders.
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
--   (part 2, only old Ready-to-email orders; new-cart orders have source 'cart')
--   update beverage."OrderList" set "approvedOrderId" = null where coalesce(source, '') <> 'cart' and "approvedOrderId" is not null;
--   delete from beverage.approved_order a where not exists (select 1 from beverage."OrderList" o where o."approvedOrderId" = a.id);

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

-- ---------------------------------------------------------------------------
-- Part 2: Ready to email (status APPROVED, not "Cleared from list") → the
-- approver's Approved orders list, as not-yet-ordered. Nothing is written to
-- the 8-week history here; tapping Ordered does that. (2026-11-03: 2 orders,
-- Palo Alto 15 lines + Meze Kebab 4 lines, all emails still drafts.)
insert into beverage.approved_order (organization_id, approved_by_id, approved_by_name, approved_at, first_approved_at)
select distinct on (o."organizationId", o."approvedBy") o."organizationId", o."approvedBy", o."approvedByName", o."approvedAt", o."approvedAt"
from beverage."OrderList" o
where o.status = 'APPROVED' and o."approvedOrderId" is null and o."approvedBy" is not null
  and not exists (select 1 from beverage."OrderActivityLog" a where a."orderListId" = o.id and a.action = 'clear_ready')
order by o."organizationId", o."approvedBy", o."approvedAt" desc
on conflict (organization_id, approved_by_id) where status = 'ACTIVE' do nothing;

update beverage."OrderList" o set "approvedOrderId" = a.id, "updatedAt" = now()
from beverage.approved_order a
where a.organization_id = o."organizationId" and a.approved_by_id = o."approvedBy" and a.status = 'ACTIVE'
  and o.status = 'APPROVED' and o."approvedOrderId" is null
  and not exists (select 1 from beverage."OrderActivityLog" l where l."orderListId" = o.id and l.action = 'clear_ready');

-- Vendor on each line (the cards group by it).
update beverage."OrderListItem" i set vendor = coalesce(v.name, g.vendor, 'No Vendor')
from beverage."Ingredient" g left join beverage."Vendor" v on v.id = g."vendorId"
where g.id = i."ingredientId" and i.vendor is null
  and i."orderListId" in (select id from beverage."OrderList" where "approvedOrderId" is not null);
