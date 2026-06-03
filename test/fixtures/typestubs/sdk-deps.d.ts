/**
 * Type stubs for external runtime dependencies of the generated SDK.
 *
 * The SDK that nog-cli emits imports from @nestjs/common, @nestjs/axios,
 * axios, rxjs, class-validator, class-transformer, and form-data. Type-checking
 * the generated output during E2E would normally require installing ~10
 * runtime packages that nog-cli itself does not consume. Instead, this file
 * provides ambient `declare module` definitions, and the compile-check fixture
 * (test/e2e/sdk-compile.e2e-spec.ts) pulls it into a synthetic ts.Program
 * alongside the generated output. The pattern mirrors the one used by
 * oazapfts's demo/tsconfig.json, which redirects @oazapfts/runtime to a
 * local source directory.
 *
 * Most stubs use loose typings (any[], unknown) on purpose; the goal is not
 * to reproduce the full NestJS type system. Two surfaces are intentionally
 * faithful to upstream because they gate real regressions:
 *
 * - `form-data` uses `export = FormData` (CommonJS interop). That pattern is
 *   what makes `import * as FormData from 'form-data'` non-constructable
 *   under esModuleInterop, surfacing TS2351 on `new FormData()`.
 *
 * - `@nestjs/common.FactoryProvider.inject` is
 *   `Array<InjectionToken | OptionalFactoryDependency>`. A homomorphic mapped
 *   type is not assignable to that shape, which is what surfaces TS2322 in
 *   over-engineered async-provider shims.
 *
 * Add new symbols here only when the SDK starts importing them. Do not
 * loosen a faithful stub to silence an error without checking the upstream
 * type first — the strictness is intentional.
 */

declare module '@nestjs/common' {
  export interface Type<T = unknown> {
    new (...args: any[]): T;
  }
  export type InjectionToken = string | symbol | Type<unknown> | ((...args: any[]) => unknown);
  export interface OptionalFactoryDependency {
    token: InjectionToken;
    optional?: boolean;
  }
  export interface ClassProvider<T = unknown> {
    provide: InjectionToken;
    useClass: Type<T>;
    scope?: unknown;
  }
  export interface ValueProvider<T = unknown> {
    provide: InjectionToken;
    useValue: T;
  }
  export interface FactoryProvider<T = unknown> {
    provide: InjectionToken;
    useFactory: (...args: any[]) => T | Promise<T>;
    inject?: Array<InjectionToken | OptionalFactoryDependency>;
    scope?: unknown;
  }
  export interface ExistingProvider {
    provide: InjectionToken;
    useExisting: InjectionToken;
  }
  export type Provider<T = unknown> =
    | Type<unknown>
    | ClassProvider<T>
    | ValueProvider<T>
    | FactoryProvider<T>
    | ExistingProvider;
  export interface ModuleMetadata {
    imports?: any[];
    controllers?: Type<unknown>[];
    providers?: Provider[];
    exports?: any[];
  }
  export interface DynamicModule extends ModuleMetadata {
    module: Type<unknown>;
    global?: boolean;
  }
  export function Module(metadata: ModuleMetadata): ClassDecorator;
  export function Injectable(options?: unknown): ClassDecorator;
  export function Inject(token?: InjectionToken): PropertyDecorator & ParameterDecorator;
}

declare module '@nestjs/axios' {
  import type { Observable } from 'rxjs';
  import type { AxiosResponse, AxiosRequestConfig } from 'axios';
  import type { DynamicModule } from '@nestjs/common';

  export class HttpModule {
    static register(config?: AxiosRequestConfig): DynamicModule;
    static registerAsync(options: {
      imports?: any[];
      useFactory?: (...args: any[]) => AxiosRequestConfig | Promise<AxiosRequestConfig>;
      inject?: any[];
      extraProviders?: any[];
    }): DynamicModule;
  }

  export class HttpService {
    get<T = unknown>(url: string, config?: AxiosRequestConfig): Observable<AxiosResponse<T>>;
    post<T = unknown>(
      url: string,
      data?: unknown,
      config?: AxiosRequestConfig,
    ): Observable<AxiosResponse<T>>;
    put<T = unknown>(
      url: string,
      data?: unknown,
      config?: AxiosRequestConfig,
    ): Observable<AxiosResponse<T>>;
    delete<T = unknown>(url: string, config?: AxiosRequestConfig): Observable<AxiosResponse<T>>;
    patch<T = unknown>(
      url: string,
      data?: unknown,
      config?: AxiosRequestConfig,
    ): Observable<AxiosResponse<T>>;
    head<T = unknown>(url: string, config?: AxiosRequestConfig): Observable<AxiosResponse<T>>;
    options<T = unknown>(url: string, config?: AxiosRequestConfig): Observable<AxiosResponse<T>>;
  }
}

declare module 'axios' {
  export interface AxiosResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    config: AxiosRequestConfig;
  }
  export interface AxiosRequestConfig {
    baseURL?: string;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    params?: unknown;
    paramsSerializer?: unknown;
    data?: unknown;
    responseType?: string;
    [key: string]: unknown;
  }
}

declare module 'rxjs' {
  export class Observable<T> {
    subscribe(observer?: (value: T) => void): unknown;
  }
  export function firstValueFrom<T>(source: Observable<T>): Promise<T>;
}

declare module 'class-validator' {
  export function IsString(options?: unknown): PropertyDecorator;
  export function IsNumber(options?: unknown, validationOptions?: unknown): PropertyDecorator;
  export function IsBoolean(options?: unknown): PropertyDecorator;
  export function IsDate(options?: unknown): PropertyDecorator;
  export function IsArray(options?: unknown): PropertyDecorator;
  export function IsOptional(options?: unknown): PropertyDecorator;
  export function IsNotEmpty(options?: unknown): PropertyDecorator;
  export function IsIn(values: readonly unknown[], options?: unknown): PropertyDecorator;
  export function IsUUID(version?: unknown, options?: unknown): PropertyDecorator;
  export function IsEmail(options?: unknown, validationOptions?: unknown): PropertyDecorator;
  export function IsUrl(options?: unknown, validationOptions?: unknown): PropertyDecorator;
  export function Min(value: number, options?: unknown): PropertyDecorator;
  export function Max(value: number, options?: unknown): PropertyDecorator;
  export function MinLength(min: number, options?: unknown): PropertyDecorator;
  export function MaxLength(max: number, options?: unknown): PropertyDecorator;
  export function ValidateNested(options?: unknown): PropertyDecorator;
}

declare module 'class-transformer' {
  export function Type(typeFn?: () => unknown, options?: unknown): PropertyDecorator;
}

declare module 'form-data' {
  class FormData {
    append(field: string, value: unknown, options?: unknown): void;
    getHeaders(): Record<string, string>;
  }
  export = FormData;
}
