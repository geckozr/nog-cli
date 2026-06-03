import ts from 'typescript';

export class HeaderGenerator {
  /**
   * Prepends the standard nog-cli header to the first node of an AST array.
   * @param nodes The existing AST nodes for the file.
   * @param cliVersion The version of nog-cli.
   * @param specVersion The version of the OpenAPI specification.
   * @returns The updated array of nodes with the header attached to the first node.
   */
  public addHeader(
    nodes: ts.Node[],
    cliVersion: string,
    specTitle: string,
    specVersion: string,
  ): ts.Node[] {
    if (nodes.length === 0) {
      return nodes;
    }

    const node = nodes[0];

    ts.addSyntheticLeadingComment(
      node,
      ts.SyntaxKind.MultiLineCommentTrivia,
      ' tslint:disable ',
      true,
    );

    ts.addSyntheticLeadingComment(
      node,
      ts.SyntaxKind.MultiLineCommentTrivia,
      ' eslint-disable ',
      true,
    );

    const headerComment = ` generated with nog-cli v${cliVersion} - spec: ${specTitle} v${specVersion}\n`;
    ts.addSyntheticLeadingComment(node, ts.SyntaxKind.SingleLineCommentTrivia, headerComment, true);

    return nodes;
  }
}
