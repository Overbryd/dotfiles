export interface BrokerBinding { account: string; property: string; actor: string; clientId: string; }
export interface BrokerRegistry { version: 1; binary: string; config: string; accounts: BrokerBinding[]; }
export interface BrokerToken { account: string; clientId: string; subject: string; accountId: string; accessToken: string; expiresAt: number; }
export function requestToken(options: { binary: string; config: string; binding: BrokerBinding; login?: boolean; renew?: boolean; purpose?: string; signal?: AbortSignal }): Promise<BrokerToken>;
