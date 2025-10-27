//Returns all the possible keys of a union type
export type KeysOfUnion<T> = T extends T ? keyof T : never;
