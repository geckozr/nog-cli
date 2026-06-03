import { IrType } from './common';

/**
 * Represents a NestJS service class in the IR.
 * Each IrService corresponds to one generated service file containing HTTP client methods.
 */
export interface IrService {
  /**
   * The service class name in PascalCase.
   * @example 'DefaultService'
   * @example 'UsersService'
   */
  name: string;

  /**
   * The generated file basename (without `.ts` extension). Always ends with `.service`.
   * Computed once in the IR converter so writers and the barrel index reference a
   * single source of truth and never re-derive it.
   * @example 'default.service' (writer emits `default.service.ts`)
   * @example 'account-visibility.service' (writer emits `account-visibility.service.ts`)
   */
  fileName: string;

  /**
   * Map of operation IDs to their IR representations.
   * Each operation becomes a method pair in the generated service (Observable and Promise variants).
   * Key: operationId from OpenAPI
   * Value: IrOperation containing method details
   */
  operations: Map<string, IrOperation>;
}

/**
 * Represents a single HTTP operation (endpoint) in the IR.
 * Each IrOperation generates two methods in the service: one returning Observable, one returning Promise.
 */
export interface IrOperation {
  /**
   * The generated TypeScript method name in camelCase.
   * Derived from the operationId or path/method combination.
   * @example 'getUserById'
   * @example 'createAnimal'
   * @example 'listPosts'
   */
  methodName: string;

  /**
   * The original OpenAPI operationId.
   * Preserved for traceability and debugging.
   * @example 'users:getById'
   * @example 'pets:create'
   */
  operationId: string;

  /**
   * The HTTP path template with parameter placeholders.
   * Path parameters use `${paramName}` template syntax in generated code.
   * @example '/users/${id}'
   * @example '/pets/${petId}/owner'
   * @example '/posts' (no parameters)
   */
  path: string;

  /**
   * The HTTP method for this operation.
   * Maps to HttpService methods in the generated code.
   */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

  /**
   * List of all parameters for this operation (path, query, body, header).
   * Each parameter becomes a method argument in the generated service.
   */
  parameters: IrParameter[];

  /**
   * The return type of this operation.
   * Used for typing the Observable/Promise and the HTTP service generic.
   * @example { rawType: 'User', isArray: false, isPrimitive: false }
   * @example { rawType: 'Post', isArray: true, isPrimitive: false } → generates `Post[]`
   */
  returnType: IrType;

  /**
   * Optional description from the OpenAPI operation.
   * Used to generate JSDoc comments for the method.
   */
  description?: string;

  /**
   * The content-type of the request body.
   * Used to generate proper headers for multipart/form-data, application/json, etc.
   * @example 'multipart/form-data'
   * @example 'application/json'
   */
  requestContentType?: string;

  /**
   * The Accept header value based on the response content-type.
   * Used to tell the server what content type the client expects.
   * @example 'text/plain'
   * @example 'image/png'
   * @example 'application/pdf'
   */
  acceptHeader?: string;

  /**
   * The Axios responseType for non-JSON responses.
   * @example 'text' for text/plain
   * @example 'blob' for binary data (images, PDFs, etc)
   * @example 'arraybuffer' for raw binary
   */
  responseType?: 'text' | 'blob' | 'arraybuffer';
}

/**
 * Represents a single parameter for an HTTP operation.
 * Each IrParameter becomes a method argument in the generated service.
 */
export interface IrParameter {
  /**
   * The parameter name in camelCase.
   * Used as the method argument name.
   * @example 'userId'
   * @example 'limit'
   * @example 'body'
   */
  name: string;

  /**
   * The type of this parameter.
   * For body parameters, typically references a DTO model.
   */
  type: IrType;

  /**
   * The location of this parameter in the HTTP request.
   * - 'path': URL path parameter (e.g., /users/{id})
   * - 'query': URL query string parameter (e.g., ?limit=10)
   * - 'body': Request body (POST/PUT/PATCH)
   * - 'header': HTTP header (e.g., Authorization)
   */
  in: 'query' | 'path' | 'body' | 'header';

  /**
   * Indicates if this parameter is required.
   * When false, the parameter becomes optional in the generated method signature.
   * @example Required path param: `getUserById(id: string)`
   * @example Optional query param: `listUsers(limit?: number)`
   */
  isRequired: boolean;

  /**
   * Optional description from the OpenAPI parameter.
   * Used to generate JSDoc comments for individual parameters in the params object.
   */
  description?: string;

  /**
   * Serialization style for the parameter, as defined by OpenAPI 3.0 Parameter Object.
   * Only stored when it differs from the spec default for the parameter location.
   * Defaults: `form` for `in: 'query'`, `simple` for `in: 'path' | 'header'`.
   */
  style?:
    | 'form'
    | 'spaceDelimited'
    | 'pipeDelimited'
    | 'deepObject'
    | 'simple'
    | 'label'
    | 'matrix';

  /**
   * Whether array/object values are expanded into separate parameters.
   * Only stored when it differs from the style default.
   * Spec defaults: `true` when `style: 'form'`, `false` otherwise.
   */
  explode?: boolean;

  /**
   * When true, RFC 3986 reserved characters in the value pass without percent-encoding.
   * Applies only to query parameters; defaults to `false`. Runtime support deferred — IR-only for now.
   */
  allowReserved?: boolean;
}
