import ts from 'typescript';

/**
 * Utility class for attaching Synthetic Trivia (comments) to TypeScript AST nodes.
 * Designed to be injected via Dependency Injection for modular AST manipulation.
 */
export class CommentModifier {
  /**
   * Formats a raw string description into a JSDoc comment and attaches it to the given AST node.
   * If the description is empty or undefined, the node is returned unmodified.
   *
   * @param node The TypeScript AST node to attach the comment to.
   * @param description The raw text description from the OpenAPI spec.
   * @returns The AST node, potentially mutated with a synthetic leading comment.
   */
  public addJSDoc<T extends ts.Node>(node: T, description?: string): T {
    if (!description || description.trim() === '') {
      return node;
    }

    // Split the text by newlines to handle multi-line descriptions from OpenAPI
    const lines = description.split('\n');
    const formattedLines = lines.map((line) => ` * ${line.trim()}`).join('\n');

    // The MultiLineCommentTrivia requires the text without the outer /* and */
    const jsDocText = `*\n${formattedLines}\n `;

    return ts.addSyntheticLeadingComment(
      node,
      ts.SyntaxKind.MultiLineCommentTrivia,
      jsDocText,
      true,
    );
  }

  /**
   * Attaches a standard single-line comment (//) to the given AST node.
   *
   * @param node The TypeScript AST node to attach the comment to.
   * @param text The comment text.
   * @returns The AST node with the attached single-line comment.
   */
  public addSingleLineComment<T extends ts.Node>(node: T, text?: string): T {
    if (!text || text.trim() === '') {
      return node;
    }

    return ts.addSyntheticLeadingComment(
      node,
      ts.SyntaxKind.SingleLineCommentTrivia,
      ` ${text.trim()}`,
      true,
    );
  }
}
