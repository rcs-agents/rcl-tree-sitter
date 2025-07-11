import { RCLNode, RCLASTNode, Range } from './astTypes';
import { RCLDocument, ImportInfo, SymbolInfo, SymbolKind } from './rclTypes';
import { ParserCore } from './parserCore';

// Type aliases for clarity
type RCLImport = ImportInfo;
type RCLSymbol = SymbolInfo;
type RCLRange = Range;

export class RCLParser {
  private parserCore: ParserCore;
  private documentCache: Map<string, RCLDocument> = new Map();

  constructor(options: { strict?: boolean } = {}) {
    // strict option is deprecated since we always require tree-sitter now
    this.parserCore = new ParserCore();
  }

  public async parseDocument(content: string, uri: string, version = 1): Promise<RCLDocument> {
    // Check cache
    const cached = this.documentCache.get(uri);
    if (cached && cached.version === version) {
      return cached;
    }

    const ast = await this.parseText(content);
    const rclDocument: RCLDocument = {
      uri,
      version,
      content,
      ast,
      imports: this.extractImports(ast),
      symbols: this.extractSymbols(ast),
      diagnostics: [],
    };

    this.documentCache.set(uri, rclDocument);
    return rclDocument;
  }

  private async parseText(text: string): Promise<RCLASTNode | null> {
    try {
      const tree = await this.parserCore.parse(text);
      return this.parserCore.convertToRCLNode(tree.rootNode) as RCLASTNode;
    } catch (error) {
      throw new Error(`Tree-sitter parsing failed: ${error}`);
    }
  }

  private extractImports(ast: RCLASTNode | null): RCLImport[] {
    if (!ast) return [];

    const imports: RCLImport[] = [];
    this.traverseAST(ast, (node) => {
      if (node.type === 'import_statement') {
        imports.push({
          path: this.extractImportPath(node),
          range: this.nodeToRange(node),
          resolved: false,
        });
      }
    });

    return imports;
  }

  private extractSymbols(ast: RCLASTNode | null): RCLSymbol[] {
    if (!ast) return [];

    const symbols: RCLSymbol[] = [];
    this.traverseAST(ast, (node) => {
      if (['agent_definition', 'flow_definition', 'message_definition'].includes(node.type)) {
        symbols.push({
          name: this.extractNodeName(node),
          kind: this.nodeTypeToSymbolKind(node.type),
          range: this.nodeToRange(node),
          selectionRange: this.nodeToRange(node),
        });
      }
    });

    return symbols;
  }

  private traverseAST(node: RCLASTNode, callback: (node: RCLASTNode) => void): void {
    callback(node);
    if ('children' in node && node.children) {
      node.children.forEach((child) => this.traverseAST(child as RCLASTNode, callback));
    }
  }

  private extractImportPath(node: RCLASTNode): string {
    // Extract import path from import statement
    // Extract from text for tree-sitter nodes
    return node.text?.replace(/^import\s+/, '').trim() || '';
  }

  private extractNodeName(node: RCLASTNode): string {
    // Extract name from definition nodes
    if ('name' in node) {
      return node.name as string;
    }

    // Fallback: extract from text
    const match = node.text?.match(/^\w+\s+(\w+)/);
    return match ? match[1] : 'unknown';
  }

  private nodeTypeToSymbolKind(nodeType: string): SymbolKind {
    switch (nodeType) {
      case 'agent_definition':
        return SymbolKind.Agent;
      case 'flow_definition':
        return SymbolKind.Flow;
      case 'message_definition':
        return SymbolKind.Message;
      default:
        return SymbolKind.Agent; // Default fallback
    }
  }

  private nodeToRange(node: RCLASTNode): RCLRange {
    return {
      start: {
        line: node.startPosition.row,
        character: node.startPosition.column,
      },
      end: {
        line: node.endPosition.row,
        character: node.endPosition.column,
      },
    };
  }

  public getNodeAt(document: RCLDocument, line: number, character: number): RCLASTNode | null {
    if (!document.ast) return null;

    return this.findNodeAtPosition(document.ast, line, character);
  }

  private findNodeAtPosition(node: RCLASTNode, line: number, character: number): RCLASTNode | null {
    if (line < node.startPosition.row || line > node.endPosition.row) {
      return null;
    }

    if (line === node.startPosition.row && character < node.startPosition.column) {
      return null;
    }

    if (line === node.endPosition.row && character > node.endPosition.column) {
      return null;
    }

    // Check children for more specific match
    if ('children' in node && node.children) {
      for (const child of node.children) {
        const childMatch = this.findNodeAtPosition(child as RCLASTNode, line, character);
        if (childMatch) {
          return childMatch;
        }
      }
    }

    return node;
  }

  public clearCache(uri?: string): void {
    if (uri) {
      this.documentCache.delete(uri);
    } else {
      this.documentCache.clear();
    }
  }
}
