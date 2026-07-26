export const AUTOMATION_SCHEMA_VERSION = '1.0.0' as const;

export interface CommandEnvelope<TPayload = unknown> {
  commandId: string;
  commandType: string;
  schemaVersion: typeof AUTOMATION_SCHEMA_VERSION;
  expectedCampaignVersion: number;
  expectedAggregateVersions: Record<string, number>;
  actor?: {
    type: 'dm' | 'player' | 'automation' | 'system' | 'integration';
    id?: string | null;
  };
  sessionId?: string | number | null;
  payload: TPayload;
  extensions?: Record<`x-${string}`, unknown>;
}

export interface StateDelta<TChanges = Record<string, unknown>, TState = unknown> {
  schemaVersion: typeof AUTOMATION_SCHEMA_VERSION;
  campaignVersion: number;
  commandId: string;
  commandType: string;
  aggregateVersions: Record<string, number>;
  changes: TChanges;
  state?: TState;
}
