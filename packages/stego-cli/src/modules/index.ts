import type { ModuleApi } from "../app/index.ts";
import { workspaceModule } from "./workspace/index.ts";
import { projectModule } from "./project/index.ts";
import { scaffoldModule } from "./scaffold/index.ts";
import { manuscriptModule } from "./manuscript/index.ts";
import { spineModule } from "./spine/index.ts";
import { metadataModule } from "./metadata/index.ts";
import { commentsModule } from "./comments/index.ts";
import { qualityModule } from "./quality/index.ts";
import { compileModule } from "./compile/index.ts";
import { exportModule } from "./export/index.ts";

export const coreModules: ModuleApi[] = [
  workspaceModule,
  projectModule,
  scaffoldModule,
  manuscriptModule,
  spineModule,
  metadataModule,
  commentsModule,
  qualityModule,
  compileModule,
  exportModule
];
