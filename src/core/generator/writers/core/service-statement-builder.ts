import ts from 'typescript';

import { IrParameter } from '../../../ir/interfaces/services';

export interface QueryParamMeta {
  style?: IrParameter['style'];
  explode?: boolean;
}

export interface HttpCallConfig {
  httpMethod: string;
  urlVar?: string;
  bodyVar?: string;
  queryParams?: string[];
  queryParamMeta?: Record<string, QueryParamMeta>;
  headerParams?: string[];
  hasOptionalParams?: boolean;
  acceptHeader?: string;
  contentTypeHeader?: string;
  responseType?: string;
  /**
   * True when the operation declares a `multipart/form-data` or
   * `application/x-www-form-urlencoded` request body. Currently informational —
   * the multipart body is delegated to axios auto-serialization via the
   * `Content-Type` header. The flag is preserved so we can branch on it if a
   * future change swaps axios for another HTTP client.
   */
  isFormData?: boolean;
  returnType?: ts.TypeNode;
}

/**
 * Utility class for building statements inside service methods.
 * Designed to be injected via DI.
 */
export class ServiceStatementBuilder {
  /**
   * Emits a relative path; axios prepends `baseURL` from `HttpModule.register`.
   */
  public buildUrlStatements(
    pathTemplate: string,
    pathParamNames: string[] = [],
  ): ts.VariableStatement[] {
    const args: ts.Expression[] = [ts.factory.createStringLiteral(pathTemplate)];

    if (pathParamNames.length > 0) {
      args.push(
        ts.factory.createObjectLiteralExpression(
          pathParamNames.map((name) =>
            ts.factory.createShorthandPropertyAssignment(ts.factory.createIdentifier(name)),
          ),
          false,
        ),
      );
    }

    const buildUrlCall = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'rb'),
        'buildUrl',
      ),
      undefined,
      args,
    );

    return [this.buildConstDeclaration('url', buildUrlCall)];
  }

  /**
   * Generates the wrapper call for Promise methods:
   * return firstValueFrom(this.methodName$(arg1, arg2)).then((res) => res.data);
   */
  public buildPromiseReturn(
    methodName: string,
    args: string[],
    returnType?: ts.TypeNode,
  ): ts.ReturnStatement {
    const methodCall = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(ts.factory.createThis(), methodName),
      undefined,
      args.map((arg) => ts.factory.createIdentifier(arg)),
    );

    const firstValueFromCall = ts.factory.createCallExpression(
      ts.factory.createIdentifier('firstValueFrom'),
      undefined,
      [methodCall],
    );

    const resType = returnType
      ? ts.factory.createTypeReferenceNode('AxiosResponse', [returnType])
      : undefined;

    const thenArrowFunc = ts.factory.createArrowFunction(
      undefined,
      undefined,
      [
        ts.factory.createParameterDeclaration(
          undefined,
          undefined,
          ts.factory.createIdentifier('res'),
          undefined,
          resType,
        ),
      ],
      undefined,
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('res'), 'data'),
    );

    const thenCall = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(firstValueFromCall, 'then'),
      undefined,
      [thenArrowFunc],
    );

    return ts.factory.createReturnStatement(thenCall);
  }

  /**
   * Generates all statements for the Observable method body:
   * - Query params extraction via `this.rb.buildQuery(params?.query, [...] as const)`
   * - Headers setup: `this.rb.buildHeaders` when header params exist, plain spread otherwise
   * - Accept / Content-Type assignments (after buildHeaders so they override)
   * - HTTP return statement with generic type
   */
  public buildHttpCall(config: HttpCallConfig): ts.Statement[] {
    const statements: ts.Statement[] = [];

    if (config.queryParams && config.queryParams.length > 0) {
      statements.push(
        ...this.buildQueryParamsExtraction(config.queryParams, config.queryParamMeta),
      );
    }

    statements.push(...this.buildHeadersSetup(config));
    statements.push(this.buildHttpReturnStatement(config));

    return statements;
  }

  /**
   * Generates:
   *   const queryParams = this.rb.buildQuery(params?.query, ['field1', 'field2'] as const);
   * Or, when at least one key has a non-default OpenAPI style/explode combination:
   *   const queryParams = this.rb.buildQuery(params?.query, [...] as const, { field1: 'csv' });
   */
  private buildQueryParamsExtraction(
    paramNames: string[],
    meta: Record<string, QueryParamMeta> | undefined,
  ): ts.Statement[] {
    const keysArray = ts.factory.createAsExpression(
      ts.factory.createArrayLiteralExpression(
        paramNames.map((name) => ts.factory.createStringLiteral(name)),
        false,
      ),
      ts.factory.createTypeReferenceNode('const'),
    );

    const args: ts.Expression[] = [
      ts.factory.createPropertyAccessChain(
        ts.factory.createIdentifier('params'),
        ts.factory.createToken(ts.SyntaxKind.QuestionDotToken),
        ts.factory.createIdentifier('query'),
      ),
      keysArray,
    ];

    const stylesEntries: ts.PropertyAssignment[] = [];
    if (meta) {
      for (const name of paramNames) {
        const shortName = this.toShortStyle(meta[name]);
        if (!shortName) continue;
        stylesEntries.push(
          ts.factory.createPropertyAssignment(
            ts.factory.createStringLiteral(name),
            ts.factory.createStringLiteral(shortName),
          ),
        );
      }
    }

    if (stylesEntries.length > 0) {
      args.push(ts.factory.createObjectLiteralExpression(stylesEntries, false));
    }

    const callExpr = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'rb'),
        'buildQuery',
      ),
      undefined,
      args,
    );

    return [this.buildConstDeclaration('queryParams', callExpr)];
  }

  /**
   * Maps an OpenAPI 3 (style, explode) pair to the short identifier used by the
   * generated `RequestBuilder.buildQuery` styles map. The default `form` + `explode:true`
   * is intentionally not represented — it goes through axios serialization untouched.
   */
  private toShortStyle(
    meta: QueryParamMeta | undefined,
  ): 'csv' | 'space' | 'pipe' | 'deep' | undefined {
    if (!meta) return undefined;
    const style = meta.style ?? 'form';
    if (style === 'form' && meta.explode === false) return 'csv';
    if (style === 'spaceDelimited') return 'space';
    if (style === 'pipeDelimited') return 'pipe';
    if (style === 'deepObject') return 'deep';
    return undefined;
  }

  /**
   * Generates either:
   *   const headers = this.rb.buildHeaders(this.config.headers, params?.headers, ['X-Trace'] as const);
   * when header params exist, or the plain spread baseline:
   *   const headers: Record<string, string> = { ...(this.config.headers ?? {}) };
   *
   * Accept / Content-Type assignments are emitted afterwards so they always override
   * consumer-provided values — the OpenAPI contract wins to prevent accidental
   * protocol breakage.
   */
  private buildHeadersSetup(config: HttpCallConfig): ts.Statement[] {
    const statements: ts.Statement[] = [];

    if (config.headerParams && config.headerParams.length > 0) {
      const keysArray = ts.factory.createAsExpression(
        ts.factory.createArrayLiteralExpression(
          config.headerParams.map((name) => ts.factory.createStringLiteral(name)),
          false,
        ),
        ts.factory.createTypeReferenceNode('const'),
      );

      const buildHeadersCall = ts.factory.createCallExpression(
        ts.factory.createPropertyAccessExpression(
          ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'rb'),
          'buildHeaders',
        ),
        undefined,
        [
          ts.factory.createPropertyAccessExpression(
            ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'config'),
            'headers',
          ),
          ts.factory.createPropertyAccessChain(
            ts.factory.createIdentifier('params'),
            ts.factory.createToken(ts.SyntaxKind.QuestionDotToken),
            ts.factory.createIdentifier('headers'),
          ),
          keysArray,
        ],
      );

      statements.push(this.buildConstDeclaration('headers', buildHeadersCall));
    } else {
      statements.push(
        ts.factory.createVariableStatement(
          undefined,
          ts.factory.createVariableDeclarationList(
            [
              ts.factory.createVariableDeclaration(
                'headers',
                undefined,
                ts.factory.createTypeReferenceNode('Record', [
                  ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
                  ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
                ]),
                ts.factory.createObjectLiteralExpression(
                  [
                    ts.factory.createSpreadAssignment(
                      ts.factory.createParenthesizedExpression(
                        ts.factory.createBinaryExpression(
                          ts.factory.createPropertyAccessExpression(
                            ts.factory.createPropertyAccessExpression(
                              ts.factory.createThis(),
                              'config',
                            ),
                            'headers',
                          ),
                          ts.SyntaxKind.QuestionQuestionToken,
                          ts.factory.createObjectLiteralExpression([]),
                        ),
                      ),
                    ),
                  ],
                  true,
                ),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        ),
      );
    }

    if (config.acceptHeader) {
      statements.push(this.buildHeaderAssignment('Accept', config.acceptHeader));
    }

    if (config.contentTypeHeader && config.contentTypeHeader !== 'application/json') {
      statements.push(this.buildHeaderAssignment('Content-Type', config.contentTypeHeader));
    }

    return statements;
  }

  /**
   * Generates: headers['Accept'] = 'application/json';
   */
  private buildHeaderAssignment(headerName: string, value: string): ts.ExpressionStatement {
    return ts.factory.createExpressionStatement(
      ts.factory.createBinaryExpression(
        ts.factory.createElementAccessExpression(
          ts.factory.createIdentifier('headers'),
          ts.factory.createStringLiteral(headerName),
        ),
        ts.SyntaxKind.EqualsToken,
        ts.factory.createStringLiteral(value),
      ),
    );
  }

  /**
   * Generates: return this.httpService.get<ReturnType>(url, { ...this.config.httpOptions, params: queryParams, headers });
   */
  private buildHttpReturnStatement(config: HttpCallConfig): ts.ReturnStatement {
    const configProperties: ts.ObjectLiteralElementLike[] = [];

    configProperties.push(
      ts.factory.createSpreadAssignment(
        ts.factory.createPropertyAccessExpression(
          ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'config'),
          'httpOptions',
        ),
      ),
    );

    if (config.queryParams && config.queryParams.length > 0) {
      configProperties.push(
        ts.factory.createPropertyAssignment('params', ts.factory.createIdentifier('queryParams')),
      );
    }

    configProperties.push(ts.factory.createShorthandPropertyAssignment('headers'));

    if (config.responseType) {
      configProperties.push(
        ts.factory.createPropertyAssignment(
          'responseType',
          ts.factory.createStringLiteral(config.responseType),
        ),
      );
    }

    const axiosConfigObj = ts.factory.createObjectLiteralExpression(configProperties, false);

    const methodArgs: ts.Expression[] = [ts.factory.createIdentifier(config.urlVar || 'url')];

    const hasBody = ['post', 'put', 'patch'].includes(config.httpMethod.toLowerCase());
    if (hasBody) {
      methodArgs.push(this.buildBodyExpression(config));
    }

    methodArgs.push(axiosConfigObj);

    const httpCall = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'httpService'),
        config.httpMethod.toLowerCase(),
      ),
      config.returnType ? [config.returnType] : undefined,
      methodArgs,
    );

    return ts.factory.createReturnStatement(httpCall);
  }

  /**
   * Builds the body argument for HTTP methods. Multipart bodies are passed
   * raw — axios auto-serializes when the `Content-Type: multipart/form-data`
   * header is present (emitted in `buildHeadersSetup`).
   */
  private buildBodyExpression(config: HttpCallConfig): ts.Expression {
    return config.bodyVar
      ? ts.factory.createIdentifier(config.bodyVar)
      : ts.factory.createIdentifier('undefined');
  }

  private buildConstDeclaration(name: string, initializer: ts.Expression): ts.VariableStatement {
    return ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [ts.factory.createVariableDeclaration(name, undefined, undefined, initializer)],
        ts.NodeFlags.Const,
      ),
    );
  }
}
