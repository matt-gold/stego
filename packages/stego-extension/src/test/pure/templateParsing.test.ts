import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferSupportedTemplateTargets,
  parseDeclaredTemplateTargets
} from '@stego-labs/shared/domain/templates';

test('parseDeclaredTemplateTargets reads targets from defineTemplate options', () => {
  const source = `
    import { defineTemplate } from "@stego-labs/engine";

    export default defineTemplate(
      { targets: ["docx", "pdf"] as const },
      (_ctx, Stego) => <Stego.Document />
    );
  `;

  assert.deepEqual(parseDeclaredTemplateTargets(source), ['docx', 'pdf']);
});

test('parseDeclaredTemplateTargets reads targets from generic defineTemplate calls', () => {
  const source = `
    import { defineTemplate, type TemplateTypes } from "@stego-labs/engine";

    type PrintTemplate = TemplateTypes<
      { id: string },
      { label?: string },
      { title?: string },
      ["docx", "pdf"]
    >;

    export default defineTemplate<PrintTemplate>(
      { targets: ["docx", "pdf"] as const },
      (_ctx, Stego) => <Stego.Document />
    );
  `;

  assert.deepEqual(parseDeclaredTemplateTargets(source), ['docx', 'pdf']);
});

test('parseDeclaredTemplateTargets ignores unrelated targets arrays outside defineTemplate options', () => {
  const source = `
    const fallback = { targets: ["epub"] as const };
    const metadata = "targets: [\\"docx\\"]";

    export default defineTemplate(
      { targets: ["docx", "pdf"] as const },
      (_ctx, Stego) => <Stego.Document />
    );
  `;

  assert.deepEqual(parseDeclaredTemplateTargets(source), ['docx', 'pdf']);
});

test('inferSupportedTemplateTargets keeps markdown lane for book templates', () => {
  assert.deepEqual(
    inferSupportedTemplateTargets('book', ['docx', 'pdf']),
    ['md', 'docx', 'pdf']
  );
});
