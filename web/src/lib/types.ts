export type ClaimRank = 'preferred' | 'normal' | 'deprecated';

export type SourceStatus = 'live' | 'fallback';

export type Verdict = 'settled' | 'contested' | 'unresolved';

export type RulingStatus = 'active' | 'superseded' | 'retired';

export interface Attribution {
  name: string;
  url: string;
  license: string;
}

export interface Claim {
  claimId: string;
  value: string;
  numeric: number | null;
  rank: ClaimRank;
  referenceCount: number;
  referenceUrls: string[];
  retrieved: string | null;
  precision: string | null;
}

export interface PropertyDispute {
  propertyId: string;
  propertyKey: string;
  propertyLabel: string;
  claims: Claim[];
}

export interface WikipediaRef {
  title: string;
  extract: string;
  timestamp: string;
  url: string;
}

export interface OpenStreetMapRef {
  osmType: string;
  osmId: number;
  displayName: string;
  lat: string;
  lon: string;
  elevation: number | null;
}

export interface Entity {
  entityId: string;
  label: string;
  description: string | null;
  wikipedia: WikipediaRef | null;
  openstreetmap: OpenStreetMapRef | null;
  disputes: PropertyDispute[];
}

export interface CorpusEnvelope {
  status: SourceStatus;
  fetchedAt: string;
  origin: 'sanity-content-lake' | 'wikidata-import' | 'sealed-corpus';
  dataset: string;
  datasetUrl: string;
  projectId: string;
  attribution: Attribution[];
  entities: Entity[];
  notice: string | null;
}

export interface Factor {
  key: string;
  label: string;
  weight: number;
  value: number;
  contribution: number;
  evidence: string;
}

export interface RankedClaim {
  claimId: string;
  value: string;
  score: number;
  rank: ClaimRank;
  referenceCount: number;
  eligible: boolean;
  ineligibleReason: string | null;
  factors: Factor[];
}

export interface EngineResult {
  engineVersion: string;
  disputeKey: string;
  status: 'ok' | 'empty' | 'degenerate';
  ranked: RankedClaim[];
  leader: RankedClaim | null;
  runnerUp: RankedClaim | null;
  score: number;
  margin: number;
  verdict: Verdict;
  recommendation: string;
  generatedAt: string;
}

export interface Ruling {
  id: string;
  scopeId: string;
  entityId: string;
  entityLabel: string;
  propertyId: string;
  propertyLabel: string;
  chosenClaimId: string;
  chosenValue: string;
  rationale: string;
  status: RulingStatus;
  supersedesId: string | null;
  engineVersion: string;
  score: number;
  margin: number;
  verdict: Verdict;
  createdAt: string;
  updatedAt: string;
  seal: string;
  shareToken: string | null;
}

export interface AuditEvent {
  seq: number;
  at: string;
  action: 'create' | 'update' | 'retire';
  scopeId: string;
  rulingId: string;
  payload: Record<string, unknown>;
  prevSeal: string;
  seal: string;
}

export interface ReplayReport {
  rulingId: string;
  ok: boolean;
  events: number;
  headSeal: string;
  firstBrokenSeq: number | null;
  detail: string | null;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}