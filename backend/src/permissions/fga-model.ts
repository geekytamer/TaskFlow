import { createBootstrapFgaClient } from './fga-client';

/**
 * The authorization model, mirroring the DSL in the design doc:
 *
 *   type group
 *     define direct_member: [user]
 *     define implied_by:    [group]
 *     define member:        direct_member or member from implied_by
 *
 *   type company
 *     define super_admin: [user]
 *
 *   type permission
 *     define owner:   [company]
 *     define granted: [group#member] or super_admin from owner
 *
 * Adding a module or an action does NOT change this model — those are new
 * object ids, not new types. Only a structural change (record rules, for
 * instance) needs a new model, and models are immutable and versioned, so that
 * is a new model id rather than a migration.
 */
export const AUTHORIZATION_MODEL = {
  schema_version: '1.1',
  type_definitions: [
    { type: 'user', relations: {} },
    {
      type: 'group',
      relations: {
        direct_member: { this: {} },
        implied_by: { this: {} },
        member: {
          union: {
            child: [
              { computedUserset: { relation: 'direct_member' } },
              {
                tupleToUserset: {
                  tupleset: { relation: 'implied_by' },
                  computedUserset: { relation: 'member' },
                },
              },
            ],
          },
        },
      },
      metadata: {
        relations: {
          direct_member: { directly_related_user_types: [{ type: 'user' }] },
          implied_by: { directly_related_user_types: [{ type: 'group' }] },
          member: { directly_related_user_types: [] },
        },
      },
    },
    {
      type: 'company',
      relations: { super_admin: { this: {} } },
      metadata: {
        relations: { super_admin: { directly_related_user_types: [{ type: 'user' }] } },
      },
    },
    {
      type: 'permission',
      relations: {
        owner: { this: {} },
        granted: {
          union: {
            child: [
              { this: {} },
              {
                tupleToUserset: {
                  tupleset: { relation: 'owner' },
                  computedUserset: { relation: 'super_admin' },
                },
              },
            ],
          },
        },
      },
      metadata: {
        relations: {
          owner: { directly_related_user_types: [{ type: 'company' }] },
          granted: {
            directly_related_user_types: [{ type: 'group', relation: 'member' }],
          },
        },
      },
    },
  ],
};

/** Creates a store and writes the model. Returns the ids for the .env file. */
export async function bootstrapFgaStore(
  name = 'taskflow',
): Promise<{ storeId: string; modelId: string }> {
  const client = createBootstrapFgaClient();
  const store = await client.createStore({ name });
  const storeId = store.id!;
  client.storeId = storeId; // this throwaway client only, never the shared one
  const model = await client.writeAuthorizationModel(AUTHORIZATION_MODEL as never);
  return { storeId, modelId: model.authorization_model_id! };
}
