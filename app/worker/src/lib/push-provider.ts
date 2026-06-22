export interface PushSubscription {
  partnerId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: number;
  tag?: string;
  data?: Record<string, unknown>;
}

export interface PushProvider {
  readonly name: string;
  send(sub: PushSubscription, payload: PushPayload): Promise<boolean>;
}
