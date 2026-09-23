/// <reference path="../worker-configuration.d.ts" />
export type GatewayEnv = Partial<{ [Key in keyof Env]: string }> & {
  KINETIC_ACCESS_CLIENT_ID?: string;
  KINETIC_ACCESS_CLIENT_SECRET?: string;
  CSRF_SECRET?: string;
};