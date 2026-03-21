import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBuildTemplateChoices,
  resolveBuildTemplateTargets
} from '../../features/commands/buildWorkflowModel';
import type { ProjectTemplate } from '../../shared/types';

function createTemplate(overrides: Partial<ProjectTemplate>): ProjectTemplate {
  return {
    name: 'book',
    path: '/tmp/project/templates/book.template.tsx',
    relativePath: 'templates/book.template.tsx',
    declaredTargets: null,
    supportedTargets: ['md'],
    ...overrides
  };
}

test('resolveBuildTemplateTargets prefers declared presentation targets', () => {
  assert.deepEqual(
    resolveBuildTemplateTargets(
      createTemplate({
        declaredTargets: ['docx', 'pdf', 'latex'],
        supportedTargets: ['md', 'docx', 'pdf', 'latex']
      })
    ),
    ['docx', 'pdf', 'latex']
  );
});

test('resolveBuildTemplateTargets falls back to inferred supported targets when declaration is absent', () => {
  assert.deepEqual(
    resolveBuildTemplateTargets(
      createTemplate({
        declaredTargets: null,
        supportedTargets: ['md']
      })
    ),
    ['md']
  );
});

test('resolveBuildTemplateChoices drops templates with no exportable targets', () => {
  assert.deepEqual(
    resolveBuildTemplateChoices([
      createTemplate({
        declaredTargets: ['docx', 'pdf'],
        supportedTargets: ['md', 'docx', 'pdf']
      }),
      createTemplate({
        name: 'empty',
        relativePath: 'templates/empty.template.tsx',
        declaredTargets: null,
        supportedTargets: []
      })
    ]),
    [
      {
        name: 'book',
        relativePath: 'templates/book.template.tsx',
        targets: ['docx', 'pdf']
      }
    ]
  );
});
