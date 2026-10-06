import { disposeAsset, monthOf, postDepreciation } from '../finance/fixed-assets';
import { HttpError } from '../http';
import { asRecord, optionalNumber, optionalString, requiredDateInput, requiredNumber, requiredString } from '../validation';
import type { RouteContext } from './context';
import { type AuthedRequest, companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** Fixed assets. */
export function registerFixedAssetRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyRoles, withActor } = ctx;

  const assetFor = (req: AuthedRequest) => {
    const asset = store.assets.get(req.params.id);
    if (!asset) throw new HttpError(404, 'Asset not found.');
    return asset;
  };
  const fixedAssetAccountOf = (companyId: string, accountId: string) => {
    const account = store.listLedgerAccounts(companyId).find((a) => a.id === accountId);
    if (!account || account.type !== 'Asset') throw new HttpError(400, 'Choose an asset account from this company.');
    return account;
  };
  const parseAssetFields = (body: Record<string, unknown>, partial: boolean) => {
    const has = (k: string) => body[k] !== undefined;
    const fields = {
      name: has('name') ? requiredString(body.name, 'name', { min: 2 }) : undefined,
      category: has('category') ? optionalString(body.category) ?? null : undefined,
      notes: has('notes') ? optionalString(body.notes) ?? null : undefined,
      cost: has('cost') ? requiredNumber(body.cost, 'cost') : undefined,
      salvageValue: has('salvageValue') ? requiredNumber(body.salvageValue, 'salvageValue') : undefined,
      acquiredOn: has('acquiredOn') ? requiredDateInput(body.acquiredOn, 'acquiredOn').slice(0, 10) : undefined,
      usefulLifeMonths: has('usefulLifeMonths') ? requiredNumber(body.usefulLifeMonths, 'usefulLifeMonths') : undefined,
    };
    if (!partial && (!fields.name || fields.cost === undefined || !fields.acquiredOn || fields.usefulLifeMonths === undefined)) {
      throw new HttpError(400, 'name, cost, acquiredOn and usefulLifeMonths are required.');
    }
    if (fields.cost !== undefined && !(fields.cost > 0)) throw new HttpError(400, 'Cost must be above zero.');
    if (fields.salvageValue !== undefined && fields.salvageValue < 0) throw new HttpError(400, 'Salvage value cannot be negative.');
    if (fields.usefulLifeMonths !== undefined && (!Number.isInteger(fields.usefulLifeMonths) || fields.usefulLifeMonths < 1 || fields.usefulLifeMonths > 600)) {
      throw new HttpError(400, 'Useful life is 1 to 600 months.');
    }
    return fields;
  };

  app.get(
    '/companies/:companyId/fixed-assets',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      res.json(store.assets.list(req.params.companyId).map((a) => store.assets.view(a)));
    }),
  );

  app.post(
    '/companies/:companyId/fixed-assets',
    authMiddleware,
    handler((req, res) => {
      const companyId = req.params.companyId;
      requireCompanyRoles(req, companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const fields = parseAssetFields(body, false);
      const salvageValue = fields.salvageValue ?? 0;
      if (salvageValue >= fields.cost!) throw new HttpError(400, 'Salvage value must be below cost.');
      const assetAccount = fixedAssetAccountOf(companyId, requiredString(body.assetAccountId, 'assetAccountId'));
      const paidFrom = optionalString(body.paidFromAccountId);
      if (paidFrom) fixedAssetAccountOf(companyId, paidFrom);
      let created;
      try {
        created = withActor(req, () => store.transaction(() => {
          const entry = paidFrom
            ? store.createJournalEntry({
                companyId, sourceType: 'asset_purchase', sourceId: undefined, memo: `Purchase of ${fields.name}`,
                entryDate: new Date(`${fields.acquiredOn}T12:00:00Z`),
                lines: [
                  { id: '', accountId: assetAccount.id, description: fields.name!, debit: fields.cost!, credit: 0 },
                  { id: '', accountId: paidFrom, description: fields.name!, debit: 0, credit: fields.cost! },
                ],
              })
            : undefined;
          return store.assets.insert({
            companyId, name: fields.name!, category: fields.category ?? null, notes: fields.notes ?? null, assetAccountId: assetAccount.id,
            cost: fields.cost!, salvageValue, acquiredOn: fields.acquiredOn!, usefulLifeMonths: fields.usefulLifeMonths!, acquisitionEntryId: entry?.id ?? null,
          });
        }));
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(409, error instanceof Error ? error.message : 'Could not register the asset.');
      }
      res.status(201).json(store.assets.view(created));
    }),
  );

  app.put(
    '/fixed-assets/:id',
    authMiddleware,
    handler((req, res) => {
      const asset = assetFor(req);
      requireCompanyRoles(req, asset.companyId, companyManagementRoles);
      const body = asRecord(req.body, 'body');
      const fields = parseAssetFields(body, true);
      const money = ['cost', 'salvageValue', 'acquiredOn', 'usefulLifeMonths', 'assetAccountId'].filter((k) => body[k] !== undefined);
      // The figures depreciation was worked out from are fixed once any has been posted.
      if (money.length && (store.assets.posted(asset.id).length || asset.acquisitionEntryId || asset.status !== 'active')) {
        throw new HttpError(409, `${money.join(', ')} cannot change once the asset has been posted to the books. Dispose of it and register it again.`);
      }
      const assetAccountId = body.assetAccountId !== undefined ? fixedAssetAccountOf(asset.companyId, requiredString(body.assetAccountId, 'assetAccountId')).id : undefined;
      const patch = Object.fromEntries(Object.entries({ ...fields, assetAccountId }).filter(([, v]) => v !== undefined));
      const next = { ...asset, ...patch };
      if (next.salvageValue >= next.cost) throw new HttpError(400, 'Salvage value must be below cost.');
      store.assets.update(asset.id, patch);
      res.json(store.assets.view(store.assets.get(asset.id)!));
    }),
  );

  app.post(
    '/companies/:companyId/fixed-assets/depreciation',
    authMiddleware,
    handler((req, res) => {
      requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
      const through = String(asRecord(req.body, 'body').through ?? '');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(through)) throw new HttpError(400, 'through must be a month, YYYY-MM.');
      if (through > monthOf(new Date().toISOString())) throw new HttpError(400, 'Depreciation cannot be posted for a month that has not started.');
      res.json(withActor(req, () => postDepreciation(store, req.params.companyId, through)));
    }),
  );

  app.post(
    '/fixed-assets/:id/disposal',
    authMiddleware,
    handler((req, res) => {
      const asset = assetFor(req);
      requireCompanyRoles(req, asset.companyId, companyManagementRoles);
      if (asset.status !== 'active') throw new HttpError(409, 'This asset is already disposed of.');
      const body = asRecord(req.body, 'body');
      const proceeds = optionalNumber(body.proceeds) ?? 0;
      if (proceeds < 0) throw new HttpError(400, 'Proceeds cannot be negative.');
      const depositAccountId = optionalString(body.depositAccountId);
      if (depositAccountId) fixedAssetAccountOf(asset.companyId, depositAccountId);
      try {
        withActor(req, () => disposeAsset(store, asset, { disposedOn: requiredDateInput(body.disposedOn, 'disposedOn').slice(0, 10), proceeds, depositAccountId }));
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(409, error instanceof Error ? error.message : 'Could not dispose of the asset.');
      }
      res.json(store.assets.view(store.assets.get(asset.id)!));
    }),
  );

  app.delete(
    '/fixed-assets/:id',
    authMiddleware,
    handler((req, res) => {
      const asset = assetFor(req);
      requireCompanyRoles(req, asset.companyId, companyManagementRoles);
      if (asset.acquisitionEntryId || store.assets.posted(asset.id).length || asset.status !== 'active') {
        throw new HttpError(409, 'This asset is in the books. Dispose of it instead of deleting it.');
      }
      store.assets.remove(asset.id);
      res.status(204).end();
    }),
  );
}
