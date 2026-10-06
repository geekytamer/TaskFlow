import { PermissionService } from '../permissions/permission-service';
import { type UserRole } from '../types';
import { requireCompanyRole } from '../http';
import type { RouteContext } from './context';
import { type AuthedRequest, handler } from './shared';
import type { Express } from 'express';

/** Global search. */
export function registerSearchRoutes(app: Express, ctx: RouteContext): void {
  const { store, authzEngine, authMiddleware, requireCompanyAccess, allowsRule, canViewProject, canViewTask } = ctx;

  /** Whether the user holds a permission (or, under the legacy engine, one of these roles), with the module on. */
  const holds = (req: AuthedRequest, companyId: string, permission: string, legacyRoles: UserRole[]) => {
    const [module, action] = [permission.slice(0, permission.indexOf(':')), permission.slice(permission.indexOf(':') + 1)];
    if (!store.isModuleEnabled(companyId, module)) return false;
    if (authzEngine === 'openfga') return PermissionService.allows(req.permissions, companyId, module, action);
    return requireCompanyRole(req.user!, companyId, legacyRoles);
  };

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

      if (holds(req, companyId, 'contacts:read', everyone)) {
        const viewer = { userId: req.user!.id, seesPrivate: allowsRule(req, companyId, 'CONTACTS_PRIVATE_READ') };
        add('contacts', store.listContacts(companyId, undefined, viewer).filter((c) => hit(c.name, c.email, c.phone, c.taxNumber))
          .map((c) => ({ id: c.id, title: c.name, subtitle: c.email || c.phone || (c.roles ?? []).join(', '), route: `/contacts/${c.id}` })));
      }
      if (holds(req, companyId, 'invoices:read', management)) {
        const clients = new Map(store.listClients(companyId).map((c) => [c.id, c.name]));
        add('invoices', store.listInvoices(companyId).filter((i) => hit(i.invoiceNumber, clients.get(i.clientId)))
          .map((i) => ({ id: i.id, title: i.invoiceNumber, subtitle: `${clients.get(i.clientId) ?? ''} · ${i.status}`, route: '/finance?tab=invoices' })));
      }
      if (holds(req, companyId, 'sales:read', management)) {
        const clients = new Map(store.listClients(companyId).map((c) => [c.id, c.name]));
        add('salesOrders', store.listSalesOrders(companyId).filter((o) => hit(o.orderNumber, clients.get(o.clientId)))
          .map((o) => ({ id: o.id, title: o.orderNumber, subtitle: `${clients.get(o.clientId) ?? ''} · ${o.status}`, route: '/sales' })));
      }
      if (holds(req, companyId, 'purchasing:read', management)) {
        add('purchaseOrders', store.listPurchaseOrders(companyId).filter((o) => hit(o.orderNumber, o.supplierName))
          .map((o) => ({ id: o.id, title: o.orderNumber, subtitle: `${o.supplierName} · ${o.status}`, route: '/purchases' })));
      }
      if (holds(req, companyId, 'inventory:read', management)) {
        add('items', store.listInventoryItems(companyId).filter((i) => hit(i.name, i.sku, i.barcode))
          .map((i) => ({ id: i.id, title: i.name, subtitle: `${i.sku} · ${i.onHand} ${i.unit}`, route: '/inventory' })));
        add('batches', store.listInventoryLots(companyId).filter((l) => hit(l.lotNumber))
          .map((l) => ({ id: l.id, title: l.lotNumber, subtitle: `${store.getInventoryItemById(l.inventoryItemId)?.name ?? ''} · ${l.status}`, route: '/inventory' })));
        add('shipments', store.shipments.list(companyId).filter((s) => hit(s.reference, s.carrier, ...s.containers))
          .map((s) => ({ id: s.id, title: s.reference, subtitle: [s.origin, s.destination].filter(Boolean).join(' → ') || s.status, route: '/shipments' })));
      }
      if (store.isModuleEnabled(companyId, 'projects')) {
        add('projects', store.listProjects().filter((p) => p.companyId === companyId && hit(p.name) && canViewProject(req, p))
          .map((p) => ({ id: p.id, title: p.name, route: `/projects/${p.id}` })));
      }
      if (store.isModuleEnabled(companyId, 'tasks')) {
        add('tasks', store.listTasks().filter((t) => t.companyId === companyId && hit(t.title) && canViewTask(req, t))
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
