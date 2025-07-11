import * as fs from 'fs';
import * as path from 'path';
import { RclConfig } from '../config/types';
import { loadConfig } from '../config/loader';
import { Compiler } from '../compiler/compiler';
import { Emitter } from '../compiler/emitter';
import { 
  RclProgram as IRclProgram, 
  CompilationResult, 
  Diagnostic, 
  EmitResult,
  SourceFile 
} from './types';
import { parse as parseRcl } from '@rcl/parser';

/**
 * Implementation of RclProgram interface
 */
export class RclProgram implements IRclProgram {
  private config: RclConfig;
  private sourceFiles: Map<string, SourceFile> = new Map();
  private diagnostics: Diagnostic[] = [];
  private compiler: Compiler;
  private emitter: Emitter;

  constructor(configPath?: string) {
    // Load configuration
    const loadResult = loadConfig(configPath || process.cwd());
    this.config = loadResult.config;
    
    if (loadResult.errors.length > 0) {
      this.diagnostics.push(
        ...loadResult.errors.map(error => ({
          message: error,
          severity: 'error' as const,
        }))
      );
    }

    // Initialize compiler and emitter
    this.compiler = new Compiler();
    this.emitter = new Emitter(this.config);
  }

  /**
   * Get the configuration
   */
  getConfiguration(): RclConfig {
    return this.config;
  }

  /**
   * Compile a single file
   */
  async compileFile(filePath: string): Promise<CompilationResult> {
    try {
      // Read file
      const content = await fs.promises.readFile(filePath, 'utf-8');
      
      // Parse the file
      const parseResult = await parseRcl(content);
      
      // Store source file
      const sourceFile: SourceFile = {
        path: filePath,
        content,
        ast: parseResult.ast,
        parseErrors: [],
      };

      // Check for parse errors
      if (parseResult.errors && parseResult.errors.length > 0) {
        sourceFile.parseErrors = parseResult.errors.map((error: any) => ({
          message: error.message || 'Parse error',
          severity: 'error' as const,
          file: filePath,
          line: error.line,
          column: error.column,
        }));
        
        this.sourceFiles.set(filePath, sourceFile);
        
        return {
          success: false,
          diagnostics: sourceFile.parseErrors || [],
        };
      }

      this.sourceFiles.set(filePath, sourceFile);

      // Compile AST
      const compiledAgent = this.compiler.compile(parseResult.ast, content, filePath);
      const compilerDiagnostics = this.compiler.getDiagnostics();

      if (!compiledAgent || compilerDiagnostics.some(d => d.severity === 'error')) {
        return {
          success: false,
          diagnostics: compilerDiagnostics,
        };
      }

      return {
        success: true,
        diagnostics: compilerDiagnostics,
        data: compiledAgent,
      };
    } catch (error) {
      const diagnostic: Diagnostic = {
        message: `Failed to compile ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
        file: filePath,
      };
      
      return {
        success: false,
        diagnostics: [diagnostic],
      };
    }
  }

  /**
   * Get all diagnostics
   */
  getDiagnostics(): Diagnostic[] {
    const allDiagnostics: Diagnostic[] = [...this.diagnostics];
    
    // Add diagnostics from all source files
    for (const sourceFile of this.sourceFiles.values()) {
      if (sourceFile.parseErrors) {
        allDiagnostics.push(...sourceFile.parseErrors);
      }
    }
    
    return allDiagnostics;
  }

  /**
   * Get semantic diagnostics (type checking, validation)
   */
  getSemanticDiagnostics(): Diagnostic[] {
    // For now, return compiler diagnostics
    return this.compiler.getDiagnostics();
  }

  /**
   * Get syntactic diagnostics (parse errors)
   */
  getSyntacticDiagnostics(): Diagnostic[] {
    const syntacticDiagnostics: Diagnostic[] = [];
    
    for (const sourceFile of this.sourceFiles.values()) {
      if (sourceFile.parseErrors) {
        syntacticDiagnostics.push(...sourceFile.parseErrors);
      }
    }
    
    return syntacticDiagnostics;
  }

  /**
   * Emit compiled files
   */
  async emit(): Promise<EmitResult> {
    const emittedFiles: string[] = [];
    const diagnostics: Diagnostic[] = [];

    for (const sourceFile of this.sourceFiles.values()) {
      // Skip files with parse errors
      if (sourceFile.parseErrors && sourceFile.parseErrors.length > 0) {
        diagnostics.push(...sourceFile.parseErrors);
        continue;
      }

      // Compile the file
      const compilationResult = await this.compileFile(sourceFile.path);
      
      if (!compilationResult.success || !compilationResult.data) {
        diagnostics.push(...compilationResult.diagnostics);
        continue;
      }

      // Emit the compiled output
      const emitResult = await this.emitter.emit(compilationResult.data, sourceFile.path);
      emittedFiles.push(...emitResult.emittedFiles);
      diagnostics.push(...emitResult.diagnostics);
    }

    return {
      success: diagnostics.filter(d => d.severity === 'error').length === 0,
      emittedFiles,
      diagnostics,
    };
  }

  /**
   * Get source files in the program
   */
  getSourceFiles(): SourceFile[] {
    return Array.from(this.sourceFiles.values());
  }

  /**
   * Add a source file to the program
   */
  async addSourceFile(filePath: string): Promise<void> {
    await this.compileFile(filePath);
  }
}