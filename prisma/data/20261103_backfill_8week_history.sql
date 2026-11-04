-- 8-week history backfill (run ONCE, after turning the new flow on and after
-- 20261103_move_waiting_to_cart.sql). Writes beverage.order_history_entry rows
-- (source = 'backfill') so the "Last 8 · Wk · Mo" column isn't empty on day one.
--
-- Takes ONLY orders that really went out under the old flow:
--   status ORDERED / SENT / RECEIVED, not created by the new cart
--   ("approvedOrderId" is null), approved in the last 56 days (Pacific
--   business date), lines not removed (REJECTED), qty > 0.
-- Orders still in Ready to email (APPROVED) are NOT backfilled: the move script
-- puts them in Approved orders, and tapping Ordered there writes them.
-- Units: cases as-is; bottles ÷ case pack size; no case size → kept as bottles
-- (qty_cases null, shown as "+N btl · no case size").
-- Safe to run twice: does nothing if backfill rows already exist.
--
-- ROLLBACK: delete from beverage.order_history_entry where source = 'backfill';

insert into beverage.order_history_entry
  (organization_id, location_id, ingredient_id, business_date, qty, unit, qty_cases, order_list_item_id, source)
select o."organizationId", o."locationId", i."ingredientId",
       (coalesce(o."approvedAt", o."createdAt") at time zone 'UTC' at time zone 'America/Los_Angeles')::date,
       i."quantityNeeded",
       case when i.unit = 'case' then 'case' else 'bottle' end,
       case when i.unit = 'case' then i."quantityNeeded"
            when coalesce(g."casePackSize", 0) > 1 then round((i."quantityNeeded" / g."casePackSize")::numeric, 3)::float
            else null end,
       i.id, 'backfill'
from beverage."OrderListItem" i
join beverage."OrderList" o on o.id = i."orderListId"
join beverage."Ingredient" g on g.id = i."ingredientId"
where o.status in ('ORDERED', 'SENT', 'RECEIVED')
  and o."approvedOrderId" is null
  and i.status <> 'REJECTED'
  and i."quantityNeeded" > 0
  and (coalesce(o."approvedAt", o."createdAt") at time zone 'UTC' at time zone 'America/Los_Angeles')::date
      >= ((now() at time zone 'America/Los_Angeles')::date - 55)
  and not exists (select 1 from beverage.order_history_entry e where e.source = 'backfill');
