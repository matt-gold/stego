export interface AppContext {
  argv: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
}

export interface CommandContext extends AppContext {
  positionals: string[];
  options: Record<string, unknown>;
}
