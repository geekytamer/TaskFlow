import { type UserRole } from '../types';
import type { RouteContext } from './context';
import { type AuthedRequest, handler } from './shared';
import type { Express } from 'express';

/** Global search. */
export function registerSearchRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyAccess, allowsKey, viewerOf } = ctx;

  /**
   * Whether the user may see a kind of result: the module on, and the catalogue
   * key (v2) or one of the role list (legacy).
   */
  const holds = (req: AuthedRequest, companyId: string, module: string, key: string, legacyRoles: UserRole[]) =>
    store.isModuleEnabled(companyId, module) && allowsKey(req, companyId, key, legacyRoles);

  app.get(
    '/companies/:companyId/search',
    authMiddleware,
    handler((req, res) => {
      const companyId = req.params.companyId;
      requireCompanyAccess(req, companyId);
      const q = String(req.query.q ?? '').trim().toLowerCase();
      if (q.length < 2) return res.json([]);
      const hit = (...fields: Array<string | null | undefined>) => fields.some((f) => f && f.toLowerCase().includes(q));
      const LIMIT = 6;
      const groups: Array<{ type: string; items: Array<{ id: string; title: string; subtitle?: string; route: string }> }> = [];
      const add = (type: string, items: Array<{ id: string; title: string; subtitle?: string; route: string }>) => {
        if (items.length) groups.push({ type, items: items.slice(0, LIMIT) });
      };
      const management: UserRole[] = ['Admin', 'Manager', 'Accountant'];
      const everyone: UserRole[] = ['Admin', 'Manager', 'Accountant', 'Employee'];

      // Scoped areas (contacts, projects, tasks) list only what the person may
      // see, by authz/visible.ts — the same rule as their own lists.
      if (holds(req, companyId, 'contacts', 'contacts.view', everyone)) {
        add('contacts', store.listContacts(companyId, undefined, viewerOf(req)).filter((c) => hit(c.name, c.email, c.phone, c.taxNumber))
          .map((c) => ({ id: c.id, title: c.name, subtitle: c.email || c.phone || (c.roles ?? []).join(', '), route: `/contacts/${c.id}` })));
      }
      if (holds(req, companyId, 'invoices', 'invoices.view', management)) {
        const clients = new Map(store.listClients(companyId).map((c) => [c.id, c.name]));
        add('invoices', store.listInvoices(companyId).filter((i) => hit(i.invoiceNumber, clients.get(i.clientId)))
          .map((i) => ({ id: i.id, title: i.invoiceNumber, subtitle: `${clients.get(i.clientId) ?? ''} · ${i.status}`, route: '/finance?tab=invoices' })));
      }
      if (holds(req, companyId, 'sales', 'sales.view', management)) {
        const clients = new Map(store.listClients(companyId).map((c) => [c.id, c.name]));
        add('salesOrders', store.listSalesOrders(companyId).filter((o) => hit(o.orderNumber, clients.get(o.clientId)))
          .map((o) => ({ id: o.id, title: o.orderNumber, subtitle: `${clients.get(o.clientId) ?? ''} · ${o.status}`, route: '/sales' })));
      }
      if (holds(req, companyId, 'purchasing', 'purchasing.view', management)) {
        add('purchaseOrders', store.listPurchaseOrders(companyId).filter((o) => hit(o.orderNumber, o.supplierName))
          .map((o) => ({ id: o.id, title: o.orderNumber, subtitle: `${o.supplierName} · ${o.status}`, route: '/purchases' })));
      }
      if (holds(req, companyId, 'inventory', 'inventory.view', management)) {
        add('items', store.listInventoryItems(companyId).filter((i) => hit(i.name, i.sku, i.barcode))
          .map((i) => ({ id: i.id, title: i.name, subtitle: `${i.sku} · ${i.onHand} ${i.unit}`, route: '/inventory' })));
        add('batches', store.listInventoryLots(companyId).filter((l) => hit(l.lotNumber))
          .map((l) => ({ id: l.id, title: l.lotNumber, subtitle: `${store.getInventoryItemById(l.inventoryItemId)?.name ?? ''} · ${l.status}`, route: '/inventory' })));
        add('shipments', store.shipments.list(companyId).filter((s) => hit(s.reference, s.carrier, ...s.containers))
          .map((s) => ({ id: s.id, title: s.reference, subtitle: [s.origin, s.destination].filter(Boolean).join(' → ') || s.status, route: '/shipments' })));
      }
      if (store.isModuleEnabled(companyId, 'projects')) {
        add('projects', store.listVisibleProjects([{ companyId, viewer: viewerOf(req) }]).filter((p) => hit(p.name))
          .map((p) => ({ id: p.id, title: p.name, route: `/projects/${p.id}` })));
      }
      if (store.isModuleEnabled(companyId, 'tasks')) {
        add('tasks', store.listVisibleTasks([{ companyId, viewer: viewerOf(req), platformSupport: Boolean(req.user!.isSuperAdmin) }]).filter((t) => hit(t.title))
          .map((t) => ({ id: t.id, title: t.title, subtitle: t.status, route: t.projectId ? `/projects/${t.projectId}` : '/tasks' })));
      }
      if (store.isModuleEnabled(companyId, 'hr')) {
        add('employees', store.listEmployees(companyId).filter((e) => hit(e.name, e.jobTitle))
          .map((e) => ({ id: e.id, title: e.name, subtitle: e.jobTitle, route: '/hr/employees' })));
      }
      res.json(groups);
    }),
  );
}
