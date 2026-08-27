/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_ADMIN_API_BASE?: string;
  readonly PUBLIC_ADMIN_LOCAL?: string;
  readonly PUBLIC_ADMIN_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
