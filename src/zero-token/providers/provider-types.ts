export interface ProviderModel {
  readonly id: string;
  readonly displayName: string;
  readonly providerId: string;
  readonly supportsStreaming: boolean;
  readonly contextWindow?: number;
}

export interface ProviderAdapter {
  readonly id: string;
  listModels(): Promise<readonly ProviderModel[]>;
}
