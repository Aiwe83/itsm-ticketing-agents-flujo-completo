declare module '@forge/api' {
  export function fetch(url: string, init?: RequestInit): Promise<Response>;

  export interface Route {
    value: string;
  }
  export function route(strings: TemplateStringsArray, ...values: unknown[]): Route;

  export interface ForgeApiResponse {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }
  export interface AsAppFetchMethods {
    requestJira(route: Route, init?: RequestInit): Promise<ForgeApiResponse>;
  }
  export function asApp(): AsAppFetchMethods;
}
