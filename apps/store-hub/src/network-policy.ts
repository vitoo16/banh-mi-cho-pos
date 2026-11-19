const LOOPBACK_HOSTS=new Set(['127.0.0.1','::1']);

export interface HubNetworkPolicyInput{
 host:string;
 tlsConfigured:boolean;
 pairingEnforced:boolean;
 allowInsecureLanDev:boolean;
 nodeEnv?:string;
}

/** Fail closed before binding a Store Hub to any non-loopback interface. */
export function assertHubNetworkPolicy(config:HubNetworkPolicyInput):void{
 const remote=!LOOPBACK_HOSTS.has(config.host);

 // This escape hatch is deliberately narrower than a general "insecure LAN" flag:
 // it may bypass TLS only in an explicitly marked development process.
 if(config.allowInsecureLanDev&&config.nodeEnv!=='development')
  throw new Error('ALLOW_INSECURE_LAN_DEV is permitted only when NODE_ENV=development');

 if(remote&&!config.pairingEnforced)
  throw new Error('LAN bind requires PAIRING_ENFORCED=1; insecure development mode never bypasses device pairing');

 if(remote&&!config.tlsConfigured&&!config.allowInsecureLanDev)
  throw new Error('LAN bind requires trusted TLS. ALLOW_INSECURE_LAN_DEV=1 is development-only and never for real transactions');
}
