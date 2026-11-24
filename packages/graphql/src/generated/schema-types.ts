export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

/** The API's own view of its health. Public: it reveals no hostnames, versions of dependencies or errors. */
export type Health = {
  __typename?: 'Health';
  database: HealthStatus;
  status: HealthStatus;
};

/** Whether a part of the system is working. */
export type HealthStatus =
  | 'DOWN'
  | 'OK';

export type Query = {
  __typename?: 'Query';
  health: Health;
};
