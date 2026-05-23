import ts from 'typescript';

export interface HttpCallConfig {
  httpMethod: string;
  urlVar?: string;
  bodyVar?: string;
  queryParams?: string[];
  headerParams?: string[];
  hasOptionalParams?: boolean;
  acceptHeader?: string;
  contentTypeHeader?: string;
  responseType?: string;
  isFormData?: boolean;
  returnType?: ts.TypeNode;
}

/**
 * Utility class for building statements inside service methods.
 * Designed to be injected via DI.
 */
export class ServiceStatementBuilder {
  /**
   * Generates: const path = `/users/${id}`;
   * @param pathTemplate The OpenAPI path string (e.g. /users/{id})
   */
  public buildPathConst(pathTemplate: string): ts.VariableStatement {
    const tsTemplateString = pathTemplate.replace(/{([^}]+)}/g, '$${$1}');

    return ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'path',
            undefined,
            undefined,
            ts.factory.createIdentifier(`\`${tsTemplateString}\``),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );
  }

  /**
   * Generates URL construction with baseUrl normalization:
   *   const normalizedBase = (this.config.baseUrl ?? '').replace(/\/$/, '');
   *   const normalizedPath = `/path/${id}`.replace(/^\//, '');
   *   const url = normalizedBase ? `${normalizedBase}/${normalizedPath}` : `/${normalizedPath}`;
   */
  public buildUrlStatements(pathTemplate: string): ts.VariableStatement[] {
    const tsTemplateString = pathTemplate.replace(/{([^}]+)}/g, '$${$1}');

    // (this.config.baseUrl ?? '').replace(/\/$/, '')
    const baseUrlExpr = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createParenthesizedExpression(
          ts.factory.createBinaryExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'config'),
              'baseUrl',
            ),
            ts.SyntaxKind.QuestionQuestionToken,
            ts.factory.createStringLiteral(''),
          ),
        ),
        'replace',
      ),
      undefined,
      [ts.factory.createRegularExpressionLiteral('/\\/$/'), ts.factory.createStringLiteral('')],
    );

    // `/path/${id}`.replace(/^\//, '')
    const pathExpr = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createIdentifier(`\`${tsTemplateString}\``),
        'replace',
      ),
      undefined,
      [ts.factory.createRegularExpressionLiteral('/^\\//'), ts.factory.createStringLiteral('')],
    );

    // normalizedBase ? `${normalizedBase}/${normalizedPath}` : `/${normalizedPath}`
    const urlExpr = ts.factory.createConditionalExpression(
      ts.factory.createIdentifier('normalizedBase'),
      ts.factory.createToken(ts.SyntaxKind.QuestionToken),
      ts.factory.createIdentifier('`${normalizedBase}/${normalizedPath}`'),
      ts.factory.createToken(ts.SyntaxKind.ColonToken),
      ts.factory.createIdentifier('`/${normalizedPath}`'),
    );

    return [
      this.buildConstDeclaration('normalizedBase', baseUrlExpr),
      this.buildConstDeclaration('normalizedPath', pathExpr),
      this.buildConstDeclaration('url', urlExpr),
    ];
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

    // Type the callback parameter as AxiosResponse<T> to avoid implicit any
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
   * - Query params extraction from `params` into a separate object
   * - Headers setup (config.headers spread + Accept/Content-Type + custom header params)
   * - HTTP return statement with generic type
   */
  public buildHttpCall(config: HttpCallConfig): ts.Statement[] {
    const statements: ts.Statement[] = [];

    if (config.queryParams && config.queryParams.length > 0) {
      statements.push(...this.buildQueryParamsExtraction(config.queryParams));
    }

    statements.push(...this.buildHeadersSetup(config));
    statements.push(this.buildHttpReturnStatement(config));

    return statements;
  }

  /**
   * Generates:
   *   const queryParams: Record<string, any> = {};
   *   if (params) {
   *     if (params.field !== undefined) queryParams['field'] = params.field;
   *     ...
   *   }
   */
  private buildQueryParamsExtraction(paramNames: string[]): ts.Statement[] {
    // const queryParams: Record<string, any> = {};
    const declaration = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            'queryParams',
            undefined,
            ts.factory.createTypeReferenceNode('Record', [
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
            ]),
            ts.factory.createObjectLiteralExpression([]),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

    // if (params) { if (params.X !== undefined) queryParams['X'] = params.X; ... }
    const assignments = paramNames.map((name) =>
      ts.factory.createIfStatement(
        ts.factory.createBinaryExpression(
          ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('params'), name),
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ts.factory.createIdentifier('undefined'),
        ),
        ts.factory.createExpressionStatement(
          ts.factory.createBinaryExpression(
            ts.factory.createElementAccessExpression(
              ts.factory.createIdentifier('queryParams'),
              ts.factory.createStringLiteral(name),
            ),
            ts.SyntaxKind.EqualsToken,
            ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('params'), name),
          ),
        ),
      ),
    );

    const ifBlock = ts.factory.createIfStatement(
      ts.factory.createIdentifier('params'),
      ts.factory.createBlock(assignments, true),
    );

    return [declaration, ifBlock];
  }

  /**
   * Generates:
   *   const headers: Record<string, string> = { ...(this.config.headers ?? {}) };
   *   headers['Accept'] = 'application/json';          // if acceptHeader
   *   headers['Content-Type'] = 'text/plain';          // if contentTypeHeader (filtered)
   *   if (params) {                                    // if headerParams
   *     if (params['X'] !== undefined) headers['X'] = String(params['X']);
   *   }
   */
  private buildHeadersSetup(config: HttpCallConfig): ts.Statement[] {
    const statements: ts.Statement[] = [];

    // const headers: Record<string, string> = { ...(this.config.headers ?? {}) };
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
              ts.factory.createObjectLiteralExpression([
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
              ]),
            ),
          ],
          ts.NodeFlags.Const,
        ),
      ),
    );

    // headers['Accept'] = '...';
    if (config.acceptHeader) {
      statements.push(this.buildHeaderAssignment('Accept', config.acceptHeader));
    }

    // headers['Content-Type'] = '...' — skip application/json (Axios default) and multipart/form-data (Axios sets boundary)
    if (
      config.contentTypeHeader &&
      config.contentTypeHeader !== 'application/json' &&
      config.contentTypeHeader !== 'multipart/form-data'
    ) {
      statements.push(this.buildHeaderAssignment('Content-Type', config.contentTypeHeader));
    }

    // Extract header params from the params object
    if (config.headerParams && config.headerParams.length > 0) {
      const headerAssignments = config.headerParams.map((name) =>
        ts.factory.createIfStatement(
          ts.factory.createBinaryExpression(
            ts.factory.createElementAccessExpression(
              ts.factory.createIdentifier('params'),
              ts.factory.createStringLiteral(name),
            ),
            ts.SyntaxKind.ExclamationEqualsEqualsToken,
            ts.factory.createIdentifier('undefined'),
          ),
          ts.factory.createExpressionStatement(
            ts.factory.createBinaryExpression(
              ts.factory.createElementAccessExpression(
                ts.factory.createIdentifier('headers'),
                ts.factory.createStringLiteral(name),
              ),
              ts.SyntaxKind.EqualsToken,
              ts.factory.createCallExpression(ts.factory.createIdentifier('String'), undefined, [
                ts.factory.createElementAccessExpression(
                  ts.factory.createIdentifier('params'),
                  ts.factory.createStringLiteral(name),
                ),
              ]),
            ),
          ),
        ),
      );

      statements.push(
        ts.factory.createIfStatement(
          ts.factory.createIdentifier('params'),
          ts.factory.createBlock(headerAssignments, true),
        ),
      );
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

    // ...this.config.httpOptions (first — can be overridden by explicit params/headers)
    configProperties.push(
      ts.factory.createSpreadAssignment(
        ts.factory.createPropertyAccessExpression(
          ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'config'),
          'httpOptions',
        ),
      ),
    );

    // params: queryParams (references the extracted object)
    if (config.queryParams && config.queryParams.length > 0) {
      configProperties.push(
        ts.factory.createPropertyAssignment('params', ts.factory.createIdentifier('queryParams')),
      );
    }

    // headers (shorthand — references the const declared in buildHeadersSetup)
    configProperties.push(ts.factory.createShorthandPropertyAssignment('headers'));

    // responseType: '...'
    if (config.responseType) {
      configProperties.push(
        ts.factory.createPropertyAssignment(
          'responseType',
          ts.factory.createStringLiteral(config.responseType),
        ),
      );
    }

    const axiosConfigObj = ts.factory.createObjectLiteralExpression(configProperties, false);

    // Build method arguments: (url, body?, config)
    const methodArgs: ts.Expression[] = [ts.factory.createIdentifier(config.urlVar || 'url')];

    const hasBody = ['post', 'put', 'patch'].includes(config.httpMethod.toLowerCase());
    if (hasBody) {
      methodArgs.push(this.buildBodyExpression(config));
    }

    methodArgs.push(axiosConfigObj);

    // this.httpService.get<ReturnType>(url, config)
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
   * Builds the body argument for HTTP methods.
   * For multipart/form-data: body ? toFormData(body) : undefined
   * For regular bodies: body or undefined
   */
  private buildBodyExpression(config: HttpCallConfig): ts.Expression {
    if (!config.bodyVar) {
      return ts.factory.createIdentifier('undefined');
    }

    if (config.isFormData) {
      return ts.factory.createConditionalExpression(
        ts.factory.createIdentifier(config.bodyVar),
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        ts.factory.createCallExpression(ts.factory.createIdentifier('toFormData'), undefined, [
          ts.factory.createIdentifier(config.bodyVar),
        ]),
        ts.factory.createToken(ts.SyntaxKind.ColonToken),
        ts.factory.createIdentifier('undefined'),
      );
    }

    return ts.factory.createIdentifier(config.bodyVar);
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
