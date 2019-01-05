type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
type Diff<T, U> = T extends U ? never : T;
type NonUndef<T> = Diff<T, null | undefined>;

interface BooleanSettingDef<T> extends SettingDefBase<T> {
  type: 'boolean';
}

interface StringSettingDef<T> extends SettingDefBase<T> {
  type: 'string';
  prompt: { message: string; defaultValue?: NonUndef<T>; isPassword?: boolean };
}

interface IntegerSettingDef<T> extends SettingDefBase<T> {
  type: 'integer';
}

interface AnyDef<T> extends Omit<SettingDefBase<T>, 'validate' | 'prompt'> {
  type: 'any';
  validateAll: (value: unknown) => string | void;
}

interface SettingDefBase<T> {
  optional: T extends undefined ? true : false;
  defaultValue?: NonUndef<T>;
  validate?: (value: NonUndef<T>) => string | void;
  prompt: { message: string; defaultValue?: NonUndef<T> };
  saveConfigTransform?(value: NonUndef<T>): T;
  transformForUse?(value: T): T;
  noInit?:boolean;
}

export type SettingDef<T = unknown> =
  | BooleanSettingDef<T>
  | StringSettingDef<T>
  | IntegerSettingDef<T>
  | AnyDef<T>;
