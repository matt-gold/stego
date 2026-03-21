import type { ExportTarget } from '@stego-labs/shared/domain/templates';
import type { ProjectTemplate } from '../../shared/types';

export type BuildTemplateChoice = {
  name: string;
  relativePath: string;
  targets: readonly ExportTarget[];
};

export function resolveBuildTemplateChoices(templates: readonly ProjectTemplate[]): BuildTemplateChoice[] {
  return templates
    .map((template) => ({
      name: template.name,
      relativePath: template.relativePath,
      targets: resolveBuildTemplateTargets(template)
    }))
    .filter((template) => template.targets.length > 0);
}

export function resolveBuildTemplateTargets(template: ProjectTemplate): readonly ExportTarget[] {
  if (template.declaredTargets && template.declaredTargets.length > 0) {
    return template.declaredTargets;
  }

  return template.supportedTargets;
}
