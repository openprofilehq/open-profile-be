export type WithSource<T, S extends string = string> = T & { source: S };
