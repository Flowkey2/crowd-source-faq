/**
 * ProgramContext — re-export shim around the legacy BatchContext
 * file (v1.69 — Phase 12 additive rename).
 *
 * The canonical implementation still lives in `BatchContext.tsx`
 * so existing imports keep working. This file is the
 * new-code-friendly import path: `import { useProgram } from
 * '../context/ProgramContext'`. Both paths are supported.
 *
 * The legacy file is planned to be moved to `ProgramContext.tsx`
 * in a follow-up commit (the rename is staged — additive first,
 * cutover second) so the v1.69 release can ship without
 * breaking any in-flight call sites.
 */

export {
  ProgramProvider,
  BatchProvider,
  useProgram,
  useBatch,
  type Program,
  type Batch,
  default,
} from './BatchContext';
