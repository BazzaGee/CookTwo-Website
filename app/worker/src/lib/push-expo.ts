import type { PushProvider, PushSubscription, PushPayload } from './push-provider';

export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo-push';

  async send(sub: PushSubscription, payload: PushPayload): Promise<boolean> {
    const expoToken = sub.endpoint;

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          to: expoToken,
          title: payload.title,
          body: payload.body,
          data: payload.data,
          sound: 'default',
        }),
      });

      const result = await response.json() as { data?: Array<{ status: string }> };
      return result.data?.[0]?.status === 'ok';
    } catch (err) {
      console.error('ExpoPush send failed:', err);
      return false;
    }
  }
}
