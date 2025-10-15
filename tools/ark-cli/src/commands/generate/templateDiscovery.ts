import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

export interface TemplateInfo {
  name: string;
  path: string;
  description?: string;
  type: 'project' | 'tool' | 'component';
}

export class TemplateDiscovery {
  private templatesPath: string;

  constructor() {
    // Get the path to the templates directory
    // This handles both development and production scenarios
    const currentFile = fileURLToPath(import.meta.url);

    // Try production path first (templates included in npm package)
    const packageRoot = path.resolve(path.dirname(currentFile), '../../../');
    const productionTemplatesPath = path.join(packageRoot, 'templates');

    if (fs.existsSync(productionTemplatesPath)) {
      this.templatesPath = productionTemplatesPath;
    } else {
      // Fall back to development path (relative to ARK project root)
      const arkRoot = path.resolve(
        path.dirname(currentFile),
        '../../../../../'
      );
      this.templatesPath = path.join(arkRoot, 'templates');
    }
  }

  /**
   * Discover all available templates in the templates directory
   */
  async discoverTemplates(): Promise<TemplateInfo[]> {
    const templates: TemplateInfo[] = [];

    try {
      if (!fs.existsSync(this.templatesPath)) {
        console.warn(`Templates directory not found at: ${this.templatesPath}`);
        return templates;
      }

      const entries = fs.readdirSync(this.templatesPath, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const templatePath = path.join(this.templatesPath, entry.name);
          const templateInfo = await this.analyzeTemplate(
            entry.name,
            templatePath
          );

          if (templateInfo) {
            templates.push(templateInfo);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to discover templates: ${error}`);
    }

    return templates;
  }

  /**
   * Get the absolute path to a template
   */
  getTemplatePath(templateName: string): string {
    return path.join(this.templatesPath, templateName);
  }

  /**
   * Check if a template exists
   */
  templateExists(templateName: string): boolean {
    const templatePath = this.getTemplatePath(templateName);
    return (
      fs.existsSync(templatePath) && fs.statSync(templatePath).isDirectory()
    );
  }

  /**
   * Analyze a template directory to extract metadata
   */
  private async analyzeTemplate(
    name: string,
    templatePath: string
  ): Promise<TemplateInfo | null> {
    try {
      let description = '';
      let type: 'project' | 'tool' | 'component' = 'component';

      // Try to read description from README.md
      const readmePath = path.join(templatePath, 'README.md');
      if (fs.existsSync(readmePath)) {
        const readmeContent = fs.readFileSync(readmePath, 'utf-8');
        // Extract first line as description (remove # if present)
        const firstLine = readmeContent.split('\n')[0];
        description = firstLine.replace(/^#\s*/, '').trim();
      }

      // Determine template type based on content
      if (this.hasFile(templatePath, 'Chart.yaml')) {
        type = 'project';
      } else if (
        this.hasFile(templatePath, 'pyproject.toml') ||
        this.hasFile(templatePath, 'main.py')
      ) {
        type = 'tool';
      }

      return {
        name,
        path: templatePath,
        description,
        type,
      };
    } catch (error) {
      console.warn(`Failed to analyze template ${name}: ${error}`);
      return null;
    }
  }

  /**
   * Check if a template directory contains a specific file
   */
  private hasFile(templatePath: string, fileName: string): boolean {
    return fs.existsSync(path.join(templatePath, fileName));
  }
}
