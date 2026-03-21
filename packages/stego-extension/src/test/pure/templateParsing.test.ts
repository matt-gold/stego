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
      { targets: ["docx", "pdf"] },
      (_ctx, Stego) => <Stego.Document />
    );
  `;

  assert.deepEqual(parseDeclaredTemplateTargets(source), ['docx', 'pdf']);
});

test('parseDeclaredTemplateTargets reads targets from generic defineTemplate calls', () => {
  const source = `
    import { defineTemplate, type TemplateContext } from "@stego-labs/engine";

    export default defineTemplate(
      { targets: ["docx", "pdf"] },
      (_ctx: TemplateContext<{ id: string }, { label?: string }, { title?: string }>, Stego) => <Stego.Document />
    );
  `;

  assert.deepEqual(parseDeclaredTemplateTargets(source), ['docx', 'pdf']);
});

test('parseDeclaredTemplateTargets ignores unrelated targets arrays outside defineTemplate options', () => {
  const source = `
    const fallback = { targets: ["epub"] as const };
    const metadata = "targets: [\\"docx\\"]";

    export default defineTemplate(
      { targets: ["docx", "pdf"] },
      (_ctx, Stego) => <Stego.Document />
    );
  `;

  assert.deepEqual(parseDeclaredTemplateTargets(source), ['docx', 'pdf']);
});

test('inferSupportedTemplateTargets keeps markdown lane for book templates', () => {
  assert.deepEqual(
    inferSupportedTemplateTargets('book', ['docx', 'pdf', 'latex']),
    ['md', 'docx', 'pdf', 'latex']
  );
});

test('parseDeclaredTemplateTargets includes latex when declared', () => {
  const source = `
    import { defineTemplate } from "@stego-labs/engine";

    export default defineTemplate(
      { targets: ["pdf", "latex"] },
      (_ctx, Stego) => <Stego.Document />
    );
  `;

  assert.deepEqual(parseDeclaredTemplateTargets(source), ['pdf', 'latex']);
});
