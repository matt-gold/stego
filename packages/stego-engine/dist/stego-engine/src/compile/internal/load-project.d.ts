export type LoadedProject = {
    id: string;
    root: string;
    metadata: Record<string, unknown>;
};
export declare function loadProject(projectRoot: string): LoadedProject;
//# sourceMappingURL=load-project.d.ts.map