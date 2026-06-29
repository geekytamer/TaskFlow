# Global Industrial Gate LLC — ERP Roadmap

Derived from the FRS gap analysis (2-page checklist, dated 2026-06-21). Business
context: frozen/perishable food + cold storage (French-fries line, frozen
fruits, container import/export). Sequenced by **leverage** — each phase is
grouped so it closes the most High-Priority FRS rows at once, and later phases
build on earlier data models.

Legend: **S** ≈ 1–2 days · **M** ≈ 3–5 days · **L** ≈ 1–2 weeks (one engineer).
"Build on" = what already exists in TaskFlow to reuse.

---

## Phase 0 — Quick wins (S, ship first)
Low effort, already mostly supported; clears easy FRS rows and builds momentum.
- **Quotation document** — add `docType: 'quotation'` to the template engine
  (same pattern as the delivery-note designer) + a printable quotation from an
  opportunity/sales order. *Build on: doc engine + delivery-note work.*
- **Customer Returns (RMA)** — a return document referencing an invoice/sales
  order, with restock to inventory. *Build on: credit notes + sales orders.*
- **Barcode labels** — items already store a barcode; add label print + a
  scan-to-find box in inventory/issue screens. *Build on: `inventory_items.barcode`.*
- Closes: Sales "Quotations templates", "Customer Returns"; Inventory "Barcode System".

---

## Phase 1 — Batch/Lot + Expiry + FEFO traceability  ⭐ ✅ DONE (verified)
Shipped & verified end-to-end (migration `056_inventory_lots`; `inventory_lots`
table + `stock_movements.lotId`; `InventoryLot` type; `expiry_warning`
notification + hourly sweep; store methods `createInventoryLot`,
`consumeInventoryLotsFEFO`, `drawDownLotsFEFO`, `listInventoryLots`,
`listExpiringLots`, `sweepExpiryNotifications`; routes for lots/expiring/receive/
consume-fefo; **Issue flow auto-draws FEFO**). Frontend: Lots & Batches dialog,
expiry badges, "Expiring Soon" panel, Lots row action. 83/83 tests + smoke tests
green; browser-verified. Still uncommitted.
The single biggest theme in the FRS and the core need for perishable food.
Cuts across Inventory, Procurement (GRN), QC, and the food-specific section.

**Data model** (migration ~056): `inventory_lots` (id, companyId, itemId,
lotNumber, expiryDate, manufactureDate, location, quantity, unitCost,
supplierId, receivedAt, sourceRef). `stock_movements` gains `lotId`.
**Backend**: lot CRUD; receiving captures lot + expiry; issues/transfers/sales
deduct from lots; **FEFO picker** (earliest-expiry-first suggestion); valuation
by lot (FIFO/FEFO).
**Frontend**: lot column + lot drill-down on items; "expiring soon" view; lot
selection in issue/transfer/delivery; expiry/aging report.
**Notifications**: extend the existing notification system with an
`expiry_warning` type (mirrors the current `low_stock` job).
- **Build on:** inventory items, stock movements, transfers, issues, low-stock
  notification job.
- **Closes (High Priority):** Inventory → Batch Tracking, Expiry Management,
  FEFO/FIFO, Cycle Count (add count sessions here); Special → Batch & Expiry
  Traceability; feeds QC Batch Release/Traceability and Manufacturing lots.

---

## Phase 2 — Procurement depth: Requisition → RFQ → GRN → 3-way match (M)
Completes the buy-side flow; GRN now records lot + expiry from Phase 1.
- **GRN with lot/expiry capture** — ✅ DONE (verified). The receive-PO flow now
  captures an optional lot number + expiry per line; when set it creates a
  tracked `InventoryLot` (supplier-linked, GRN-noted, FEFO-ready) via
  `createInventoryLot`, with a lot-traceable stock movement. `PurchaseReceiptLine`
  records the lot fields; receive dialog has Lot/Expiry inputs. Backward
  compatible (no lot → plain receipt). 83/83 tests + smoke test + browser-verified.
- **Purchase Requisition** — ✅ backend done (verified). Migration
  `057_purchase_requisitions`; `PurchaseRequisition` entity (Draft → Submitted →
  Approved/Rejected → Converted); `PR-` numbering; store lifecycle
  (create/submit/approve/reject/convert-to-PO/delete) with `convertRequisition
  ToPurchaseOrder` building a PO from the approved lines; routes for all actions.
  83/83 tests + lifecycle smoke test. **Frontend pending** (requisitions module
  page + nav entry). *Build on: PO approval workflow.*
- **RFQ** (request quotes from multiple suppliers, compare, convert to PO).
- **3-way match** — PO ↔ GRN ↔ vendor bill, flag discrepancies. *Build on:
  vendor bills already link to POs.*
- **Closes (High Priority):** Procurement → Purchase Requisition, RFQ, GRN ✅,
  Supplier Invoice Matching, (Approval Workflow already done).

---

## Phase 3 — VAT / Oman compliance + Budget control (M)
- **Tax codes + VAT engine** — named tax codes (e.g. Oman 5% standard, 0%,
  exempt) applied per line; store output/input VAT. *Build on: per-invoice
  taxRate, company tax number/details already added.*
- **VAT return report** — periodic output vs input VAT summary (Oman format).
- **Budget Control** — budgets per ledger account/period; actual-vs-budget
  report + over-budget warnings. *Build on: ledger accounts + financial reports.*
- **Closes (High Priority):** Finance → VAT Compliance, Budget Control;
  Special → Oman VAT Compliance.

---

## Phase 4 — Quality Control (M)
Gating that depends on Phase 1 lots.
- Inspection records: Raw Material (at GRN), In-Process, Finished Goods.
- **Batch Release** — a lot can't ship/consume until QC-passed (status on the
  lot). Forward/backward **traceability** report by lot (supplier → GRN → lot →
  production → customer delivery).
- **Closes:** QC → all rows (Raw Material Inspection, In-Process, Finished
  Goods, Batch Release, Traceability).

---

## Phase 5 — Manufacturing / Production (French-fries line) (L)
- **Recipe / BOM**, **Production / Work Orders**, **Material Consumption**
  (consumes input lots via FEFO), **Yield Analysis**, **Production Costing**,
  finished-goods output as new lots with expiry (feeds Phase 1/4).
- **Closes:** Manufacturing → all rows; Special → French Fries Production
  Tracking, Frozen Fruits Packing Management.

---

## Phase 6 — Cold chain, logistics & dashboards (M–L)
- **Cold Store Monitoring** — temperature/humidity logs per store + excursion
  alerts (reuse notification system).
- **Container Shipment Tracking** — shipments with containers, ETA/status,
  linked POs/deliveries.
- **Import/Export Documentation** — document checklist + attachments per
  shipment. *Build on: record attachments.*
- **Dashboards & BI** — role dashboards (CEO/Sales/Production/Warehouse/Finance)
  + KPI reporting + Management KPI dashboard. *Build on: existing dashboard +
  recharts.*
- **Closes:** Special → Cold Store Monitoring, Container Shipment Tracking,
  Import & Export Documentation, Management KPI Dashboard; Dashboards & BI (all).

---

## Phase 7 — HR completion + Maintenance (M)
- **HR**: Attendance (clock in/out + timesheets), Payroll (salary, allowances,
  deductions, payslips), **WPS Export** (GCC/Oman bank file), Org Structure /
  chart. *Build on: employee directory + leave already built.*
- **Maintenance** (lower priority per sheet — Machine Register marked "no
  important"): Machine Register, Preventive/Breakdown Maintenance, Spare Parts,
  Downtime — build only if requested.
- **Closes:** HR & Payroll → Attendance, Payroll, WPS Export, Org Structure;
  Maintenance (optional).

---

## Already done (no work needed)
Trial Balance & finance core; GL/AP/AR/Cash & Bank; Fixed Assets (corrected to
OK); Item Master & Warehouse Locations; **Stock Transfer**; Supplier Master;
**Purchase Orders + Approval Workflow**; Sales Invoices + **templates/letterhead**;
**Delivery Notes designer**; **Credit Control** (credit notes); **per-line
discounts**; **Employee Master + Leave**; **Arabic & English interface**;
company **tax number/details**.

## Suggested order
**0 → 1 → 2 → 3 → 4 → 5 → 6 → 7.** Phase 1 (batch/expiry/FEFO) is the keystone:
it directly closes the most High-Priority rows and is a prerequisite for QC
(Phase 4) and Manufacturing (Phase 5). Phases 2 and 3 can run in parallel with
1 if there's more than one engineer.
